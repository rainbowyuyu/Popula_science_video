"""Small API-only adapters for the providers currently selected in CC Switch.

Configuration is read afresh for each call. Credentials never leave this module
except in the HTTP request to their configured endpoint; no OAuth session is used.
"""
from __future__ import annotations

import base64
import binascii
import copy
import io
import json
import math
import os
from pathlib import Path
import queue
import re
import socket
import threading
import time
import tomllib
from urllib import error, parse, request


MAX_CONFIG_BYTES = 2 * 1024 * 1024
MAX_BODY_BYTES = 8 * 1024 * 1024
MAX_TOOL_ARGUMENT_BYTES = 1024 * 1024
MAX_IMAGE_BYTES = 4 * 1024 * 1024
MODEL_EFFORTS = {
    "openai": ("default", "low", "medium", "high", "xhigh"),
    "claude": ("default", "low", "medium", "high", "max"),
}


DEFAULT_MODEL_EFFORTS = {"openai": "xhigh", "claude": "max"}


def validate_model_efforts(value=None) -> dict:
    """Validate public controls without reading or changing provider settings."""
    result = dict(DEFAULT_MODEL_EFFORTS)
    if value is None:
        return result
    if not isinstance(value, dict) or set(value) - set(MODEL_EFFORTS):
        raise ValueError("思考强度需为 openai、claude 各自的设置")
    for provider, effort in value.items():
        if not isinstance(effort, str) or effort not in MODEL_EFFORTS[provider]:
            raise ValueError(provider + " 思考强度无效：" + " / ".join(MODEL_EFFORTS[provider]))
        result[provider] = effort
    return result


def effort_options(provider: str, model: str) -> tuple[str, ...]:
    """Conservative model-family hints, not a gateway capability probe.

    Gateways may impose narrower limits; errors are surfaced without retry or
    changing the requested effort. Unknown aliases use the API default only.
    """
    name = model.lower()
    if provider == "openai":
        if "chat" in name or "codex-mini" in name:
            return ("default",)
        match = re.match(r"^gpt-(\d+)(?:\.(\d+))?(?:-|$)", name)
        if match and int(match[1]) >= 5:
            version = (int(match[1]), int(match[2] or 0))
            if "-pro" in name:
                return ("default", "medium", "high", "xhigh") if version >= (5, 2) else ("default", "high")
            return MODEL_EFFORTS[provider] if version >= (5, 2) else MODEL_EFFORTS[provider][:-1]
        if re.match(r"^o[134](?:-|$)", name):
            return MODEL_EFFORTS[provider][:-1]
    if provider == "claude":
        match = re.match(r"^claude-(opus|sonnet)-(\d+)[.-](\d+)(?:-|$)", name)
        if match:
            version = (int(match[2]), int(match[3]))
            if match[1] == "opus" and version >= (4, 6):
                return MODEL_EFFORTS[provider]
            if (match[1] == "opus" and version >= (4, 5)) or (match[1] == "sonnet" and version >= (4, 6)):
                return MODEL_EFFORTS[provider][:-1]
    return ("default",)


def _resolve_effort(provider, model, requested, configured_default):
    requested = validate_model_efforts({provider: requested if requested is not None else "default"})[provider]
    options = effort_options(provider, model)
    if requested != "default":
        if requested not in options:
            raise ProviderError("当前模型不支持所选思考强度，请改为默认或选择兼容模型；未发送请求。")
        return requested, "run-override"
    if configured_default in options and configured_default != "default":
        return configured_default, "cc-switch"
    return None, "api-default"


def _content_parts(content, *, images=False) -> list[dict]:
    """Accept only text and bounded in-memory raster data, never remote URLs."""
    if content is None:
        return []
    if isinstance(content, str):
        return [{"type": "text", "text": content}] if content else []
    if not isinstance(content, list) or len(content) > 64:
        raise ProviderError("对话内容必须为文字或最多64个内容块。")
    result = []
    for block in content:
        if not isinstance(block, dict):
            raise ProviderError("对话内容块格式无效。")
        if block.get("type") == "text" and isinstance(block.get("text"), str):
            result.append({"type": "text", "text": block["text"]})
        elif block.get("type") == "image_url" and images:
            image = block.get("image_url")
            if not isinstance(image, dict) or not isinstance(image.get("url"), str):
                raise ProviderError("图像内容格式无效。")
            url = image["url"]
            if len(url) > ((MAX_IMAGE_BYTES + 2) // 3) * 4 + 64:
                raise ProviderError("单张图像超过 4 MB，请先缩小预览图。")
            match = re.fullmatch(r"data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})", url)
            if not match:
                raise ProviderError("图像仅接受本地 PNG、JPEG、WebP 的 base64 数据，不读取远程 URL。")
            mime, encoded = match.groups()
            try:
                decoded = base64.b64decode(encoded, validate=True)
            except (ValueError, binascii.Error):
                raise ProviderError("图像 base64 数据无效。") from None
            if not decoded or len(decoded) > MAX_IMAGE_BYTES:
                raise ProviderError("图像为空或超过 4 MB。")
            signatures = {"image/png": decoded.startswith(b"\x89PNG\r\n\x1a\n"),
                          "image/jpeg": decoded.startswith(b"\xff\xd8\xff"),
                          "image/webp": decoded.startswith(b"RIFF") and decoded[8:12] == b"WEBP"}
            if not signatures[mime]:
                raise ProviderError("图像 MIME 类型与实际文件头不一致。")
            detail = image.get("detail", "auto")
            if detail not in ("auto", "low", "high"):
                raise ProviderError("图像细节参数无效。")
            result.append({"type": "image_url", "image_url": {"url": url, "detail": detail}})
        else:
            raise ProviderError("不支持该对话内容块；图像仅可出现在用户消息中。")
    return result


def _text_content(content) -> str:
    return "\n".join(block["text"] for block in _content_parts(content))


class ProviderError(RuntimeError):
    """A public-safe error; does not carry upstream response bodies or headers."""

    def __init__(self, message, *, kind="provider", status_code=None, retryable=False):
        super().__init__(message)
        self.kind = kind
        self.status_code = status_code
        self.retryable = bool(retryable)


def _http_failure(status):
    """Expose only status and our own explanation, never a gateway error body."""
    status = int(status)
    if status in (408, 504, 524):
        return ProviderError(f"上游网关等待模型响应超时（HTTP {status}）；进度已保留，未自动重试。",
                             kind="timeout", status_code=status, retryable=True)
    if status == 429:
        return ProviderError("服务暂时限流或额度受限（HTTP 429）；未自动重试。",
                             kind="rate_limit", status_code=status, retryable=True)
    if status >= 500:
        return ProviderError(f"上游服务暂时不可用（HTTP {status}）；未自动重试。",
                             kind="upstream", status_code=status, retryable=True)
    if status in (401, 403):
        return ProviderError(f"接口认证或访问权限被拒绝（HTTP {status}），请检查 CC Switch 当前授权。",
                             kind="auth", status_code=status)
    return ProviderError(f"接口拒绝了当前请求（HTTP {status}），请检查模型与请求配置。",
                         kind="config", status_code=status)


def _stream_failure(value):
    detail = value.get("error") or value.get("response", {}).get("error") or {}
    if not isinstance(detail, dict):
        detail = {}
    status = detail.get("status_code") or value.get("status_code")
    if isinstance(status, int) and not isinstance(status, bool) and 400 <= status <= 599:
        return _http_failure(status)
    kind = str(detail.get("type") or detail.get("code") or value.get("code") or "")
    if kind in {"authentication_error", "permission_error", "invalid_api_key"}:
        return ProviderError("流式响应报告认证或访问权限错误，未执行本轮工具。", kind="auth")
    if kind in {"invalid_request_error", "not_found_error", "request_too_large", "context_length_exceeded"}:
        return ProviderError("流式响应报告模型或请求配置错误，未执行本轮工具。", kind="config")
    if kind in {"rate_limit_error", "rate_limit_exceeded"}:
        return ProviderError("流式响应暂时限流，未执行本轮工具；未自动重试。", kind="rate_limit", retryable=True)
    return ProviderError("模型流式响应中断或上游服务暂时异常，未执行本轮工具；未自动重试。",
                         kind="upstream", retryable=True)


def _stream_incomplete():
    return ProviderError("流式响应未完整结束，已保留前轮进度，本轮不执行工具；未自动重试。",
                         kind="stream_incomplete", retryable=True)


_OUTPUT_LENGTH_REASONS = {"length", "max_tokens", "max_output_tokens"}
_OUTPUT_INCOMPLETE_REASONS = _OUTPUT_LENGTH_REASONS | {"incomplete", "content_filter", "failed", "cancelled"}


def _output_end_state(reason, *, status=""):
    """Length is recoverable separately from filtered/unknown incomplete output."""
    truncated = reason in _OUTPUT_LENGTH_REASONS
    incomplete = truncated or reason in _OUTPUT_INCOMPLETE_REASONS or status in {"incomplete", "failed", "cancelled"}
    return truncated, incomplete


class _StreamAssembly:
    """Collect bounded SSE data into existing normalized provider payloads.

    Nothing is returned before the protocol's terminal event. In particular,
    partial function arguments never reach the local tool executor.
    """
    def __init__(self, wire):
        self.wire = wire
        self.meta = {}
        self.items = {}
        self.chat_text = []
        self.chat_tools = {}
        self.finish = None
        self.blocks = {}
        self.block_json = {}
        self.block_stopped = set()
        self.started = False

    def event(self, name, data):
        if data == "[DONE]":
            if self.wire != "chat" or self.finish is None:
                raise _stream_incomplete()
            message = {"content": "".join(self.chat_text)}
            if self.chat_tools:
                message["tool_calls"] = [self.chat_tools[k] for k in sorted(self.chat_tools)]
            return {**self.meta, "choices": [{"index": 0, "message": message, "finish_reason": self.finish}]}
        try:
            value = json.loads(data)
        except (ValueError, UnicodeDecodeError):
            raise ProviderError("流式响应包含无效 JSON，未执行本轮工具。", kind="stream_incomplete", retryable=True) from None
        if not isinstance(value, dict):
            raise _stream_incomplete()
        typ = value.get("type") or name
        if name == "error" or typ in {"error", "response.failed", "response.error"} or value.get("error"):
            raise _stream_failure(value)
        if self.wire == "responses":
            return self.responses(typ, value)
        if self.wire == "messages":
            return self.anthropic(typ, value)
        return self.chat(value)

    def responses(self, typ, value):
        response = value.get("response")
        if isinstance(response, dict):
            self.meta.update({k: copy.deepcopy(v) for k, v in response.items() if k != "output"})
        if typ in {"response.completed", "response.incomplete"}:
            result = copy.deepcopy(response) if isinstance(response, dict) else dict(self.meta)
            if result.get("error"):
                raise _stream_failure({"error": result["error"]})
            if "output" not in result:
                result["output"] = [self.items[k] for k in sorted(self.items)]
            result["status"] = "completed" if typ == "response.completed" else "incomplete"
            return result
        index = value.get("output_index", 0)
        if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index <= 1024:
            raise _stream_incomplete()
        if typ in {"response.output_item.added", "response.output_item.done"}:
            item = value.get("item")
            if not isinstance(item, dict):
                raise _stream_incomplete()
            self.items[index] = copy.deepcopy(item)
        elif typ in {"response.content_part.added", "response.content_part.done"}:
            part = value.get("part")
            if not isinstance(part, dict):
                raise _stream_incomplete()
            self._response_part(index, value.get("content_index", 0), part)
        elif typ in {"response.output_text.delta", "response.output_text.done", "response.refusal.delta", "response.refusal.done"}:
            refusal = typ.startswith("response.refusal")
            field = "refusal" if refusal else "text"
            part = self._response_part(index, value.get("content_index", 0))
            part["type"] = "refusal" if refusal else "output_text"
            text = value.get("delta" if typ.endswith("delta") else field, "")
            if not isinstance(text, str):
                raise _stream_incomplete()
            part[field] = part.get(field, "") + text if typ.endswith("delta") else text
        elif typ in {"response.function_call_arguments.delta", "response.function_call_arguments.done"}:
            item = self.items.get(index)
            if not item or item.get("type") != "function_call":
                raise _stream_incomplete()
            text = value.get("delta" if typ.endswith("delta") else "arguments", "")
            if not isinstance(text, str):
                raise _stream_incomplete()
            item["arguments"] = item.get("arguments", "") + text if typ.endswith("delta") else text
        return None

    def _response_part(self, index, content_index, value=None):
        if not isinstance(content_index, int) or isinstance(content_index, bool) or not 0 <= content_index <= 1024:
            raise _stream_incomplete()
        item = self.items.setdefault(index, {"type": "message", "role": "assistant", "content": []})
        if item.get("type") != "message" or not isinstance(item.get("content"), list):
            raise _stream_incomplete()
        while len(item["content"]) <= content_index:
            item["content"].append({})
        if value is not None:
            item["content"][content_index] = copy.deepcopy(value)
        return item["content"][content_index]

    def chat(self, value):
        if isinstance(value.get("model"), str):
            self.meta["model"] = value["model"]
        if isinstance(value.get("usage"), dict):
            self.meta["usage"] = value["usage"]
        for choice in value.get("choices") or []:
            if choice.get("index", 0) != 0:
                continue
            delta = choice.get("delta") or {}
            text = delta.get("content") or delta.get("refusal")
            if text is not None:
                if not isinstance(text, str) or self.finish is not None:
                    raise _stream_incomplete()
                self.chat_text.append(text)
            for part in delta.get("tool_calls") or []:
                index = part.get("index", 0)
                if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index < 128 or self.finish is not None:
                    raise _stream_incomplete()
                tool = self.chat_tools.setdefault(index, {"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
                for key in ("id",):
                    if key in part:
                        if not isinstance(part[key], str):
                            raise _stream_incomplete()
                        tool[key] += part[key]
                function = part.get("function") or {}
                for key in ("name", "arguments"):
                    if key in function:
                        if not isinstance(function[key], str):
                            raise _stream_incomplete()
                        tool["function"][key] += function[key]
            if choice.get("finish_reason") is not None:
                self.finish = choice["finish_reason"]
        return None

    def anthropic(self, typ, value):
        if typ == "ping":
            return None
        if typ == "message_start":
            if self.started or not isinstance(value.get("message"), dict):
                raise _stream_incomplete()
            self.started = True
            self.meta = copy.deepcopy(value["message"])
            if self.meta.get("content"):
                raise _stream_incomplete()
            return None
        if not self.started:
            raise _stream_incomplete()
        if typ == "message_delta":
            self.meta.update(value.get("delta") or {})
            if isinstance(value.get("usage"), dict):
                self.meta.setdefault("usage", {}).update(value["usage"])
        elif typ == "message_stop":
            if not self.meta.get("stop_reason") or set(self.blocks) != self.block_stopped:
                raise _stream_incomplete()
            # input_json_delta can end halfway through a JSON string when the
            # output budget expires. Wait for the authoritative stop reason
            # before attempting to parse any tool payload.
            _, incomplete = _output_end_state(self.meta["stop_reason"])
            if not incomplete:
                for index, encoded in self.block_json.items():
                    self.blocks[index]["input"] = _arguments(encoded)
            self.meta["content"] = [self.blocks[k] for k in sorted(self.blocks)]
            return self.meta
        elif typ in {"content_block_start", "content_block_delta", "content_block_stop"}:
            index = value.get("index")
            if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index < 1024:
                raise _stream_incomplete()
            if typ == "content_block_start":
                if index in self.blocks or not isinstance(value.get("content_block"), dict):
                    raise _stream_incomplete()
                self.blocks[index] = copy.deepcopy(value["content_block"])
            else:
                block = self.blocks.get(index)
                if block is None or index in self.block_stopped:
                    raise _stream_incomplete()
                if typ == "content_block_stop":
                    self.block_stopped.add(index)
                else:
                    delta = value.get("delta") or {}
                    kind = delta.get("type")
                    fields = {"text_delta": ("text", "text"), "thinking_delta": ("thinking", "thinking"),
                              "signature_delta": ("thinking", "signature"), "input_json_delta": ("tool_use", "partial_json"),
                              "redacted_thinking_delta": ("redacted_thinking", "data")}
                    if kind == "citations_delta" and block.get("type") == "text":
                        block.setdefault("citations", []).append(delta.get("citation"))
                    elif kind in fields:
                        block_type, field = fields[kind]
                        if block.get("type") != block_type or not isinstance(delta.get(field), str):
                            raise _stream_incomplete()
                        if kind == "input_json_delta":
                            self.block_json[index] = self.block_json.get(index, "") + delta[field]
                        else:
                            block[field] = block.get(field, "") + delta[field]
                    else:
                        raise _stream_incomplete()
        return None


def _read_sse(response, wire, cancel_event=None):
    assembly = _StreamAssembly(wire)
    size, name, data = 0, "", []
    while True:
        if cancel_event is not None and cancel_event.is_set():
            raise ProviderError("生成已取消；未自动重试。", kind="cancelled")
        line = response.readline(MAX_BODY_BYTES - size + 1)
        if not isinstance(line, bytes):
            raise _stream_incomplete()
        size += len(line)
        if size > MAX_BODY_BYTES:
            raise ProviderError("服务响应超过 8 MB，已停止读取。", kind="response_size")
        try:
            text = line.decode("utf-8").rstrip("\r\n")
        except UnicodeDecodeError:
            raise _stream_incomplete() from None
        if not line or not text:
            if data:
                result = assembly.event(name, "\n".join(data))
                if result is not None:
                    return result
            name, data = "", []
            if not line:
                raise _stream_incomplete()
        elif text.startswith("event:"):
            name = text[6:].lstrip(" ")
        elif text.startswith("data:"):
            data.append(text[5:].removeprefix(" "))
        # SSE comments/ids/retry fields are framing, not model output.


def _read_provider_response(response, wire, cancel_event=None):
    headers = getattr(response, "headers", None)
    content_type = str(headers.get("Content-Type", "")) if headers is not None else ""
    if "text/event-stream" in content_type.lower():
        return _read_sse(response, wire, cancel_event)
    # Sniff a line, not the whole body: compatible gateways sometimes omit or
    # mislabel SSE MIME headers and keep the socket open after the final event.
    prefix = []
    prefix_size = 0
    while True:
        if cancel_event is not None and cancel_event.is_set():
            raise ProviderError("生成已取消；未自动重试。", kind="cancelled")
        line = response.readline(MAX_BODY_BYTES - prefix_size + 1)
        prefix.append(line)
        prefix_size += len(line)
        if prefix_size > MAX_BODY_BYTES:
            raise ProviderError("服务响应超过 8 MB，已停止读取。", kind="response_size")
        if not line or line.strip():
            break
    first = b"".join(prefix)
    if first.lstrip().startswith((b"data:", b"event:", b":", b"id:", b"retry:")):
        class Prefixed:
            def __init__(self):
                self.initial = io.BytesIO(first)
            def readline(self, size=-1):
                return self.initial.readline(size) or response.readline(size)
        return _read_sse(Prefixed(), wire, cancel_event)
    data = first + response.read(MAX_BODY_BYTES - prefix_size + 1)
    if len(data) > MAX_BODY_BYTES:
        raise ProviderError("服务响应超过 8 MB，已停止读取。", kind="response_size")
    try:
        value = json.loads(data)
    except (ValueError, UnicodeDecodeError):
        raise ProviderError("服务返回了无效 JSON。", kind="protocol") from None
    if not isinstance(value, dict):
        raise ProviderError("服务响应格式无效。", kind="protocol")
    if value.get("error"):
        raise _stream_failure(value)
    return value


class _NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward a bearer token to a redirected origin.
        return None


def _read(path: Path, *, toml: bool = False) -> dict:
    if not path.exists():
        return {}
    try:
        if path.stat().st_size > MAX_CONFIG_BYTES:
            raise ProviderError("服务配置文件过大。")
        text = path.read_text(encoding="utf-8-sig")
        value = tomllib.loads(text) if toml else json.loads(text)
        if not isinstance(value, dict):
            raise ValueError()
        return value
    except ProviderError:
        raise
    except (OSError, ValueError):
        raise ProviderError("无法读取服务配置，请在 CC Switch 检查配置格式。") from None


def _string(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def _api_key(value) -> str:
    value = _string(value)
    # OAuth/subscription tokens are deliberately unsupported.
    if value.startswith(("sk-ant-oat", "eyJ")):
        return ""
    if any(ord(c) < 32 for c in value):
        return ""
    return value


def _endpoint(value: str) -> tuple[str, str]:
    try:
        uri = parse.urlsplit(value.rstrip("/"))
        if uri.scheme not in ("https", "http") or not uri.hostname:
            raise ValueError()
        if uri.scheme == "http" and uri.hostname not in ("127.0.0.1", "localhost", "::1"):
            raise ValueError()
        if uri.username or uri.password or uri.query or uri.fragment:
            raise ValueError()
        port = uri.port
        # UI gets only hostname/port, never a path, query, userinfo, or credential.
        host = uri.hostname
        if ":" in host:
            host = "[" + host + "]"
        display = uri.scheme + "://" + host + (":" + str(port) if port else "")
        return parse.urlunsplit(uri), display
    except (ValueError, TypeError):
        raise ProviderError("服务地址需为 HTTPS 地址或本机 HTTP 地址，且不能包含凭据或查询参数。") from None


def _join_endpoint(base: str, suffix: str) -> str:
    if base.endswith("/" + suffix):
        return base
    # Anthropic normally configures only the origin, whereas OpenAI uses /v1.
    if suffix == "messages" and not base.endswith("/v1"):
        return base + "/v1/messages"
    return base + "/" + suffix


def _arguments(value) -> dict:
    if isinstance(value, dict):
        result = value
    elif isinstance(value, str):
        if len(value.encode("utf-8")) > MAX_TOOL_ARGUMENT_BYTES:
            raise ProviderError("模型工具参数超过大小限制。")
        try:
            result = json.loads(value or "{}")
        except ValueError:
            raise ProviderError("模型返回了不完整或无效的工具参数，未执行工具。") from None
    else:
        raise ProviderError("模型工具参数必须为 JSON 对象，未执行工具。")
    if not isinstance(result, dict):
        raise ProviderError("模型工具参数必须为 JSON 对象，未执行工具。")
    if len(json.dumps(result, ensure_ascii=False).encode("utf-8")) > MAX_TOOL_ARGUMENT_BYTES:
        raise ProviderError("模型工具参数超过大小限制。")
    return result


def _calls(message: dict) -> list[dict]:
    normalized = []
    for item in message.get("tool_calls") or []:
        fn = item.get("function", item)
        normalized.append({"id": item.get("id", ""), "name": fn.get("name", ""),
                           "arguments": _arguments(fn.get("arguments", {}))})
    return normalized


def _schemas(tools) -> list[dict]:
    result = []
    for item in tools or []:
        fn = item.get("function", item)
        if not isinstance(fn, dict) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", _string(fn.get("name"))):
            raise ProviderError("工具名称无效。")
        parameters = fn.get("parameters", {"type": "object", "properties": {}})
        if not isinstance(parameters, dict) or parameters.get("type", "object") != "object":
            raise ProviderError("工具 schema 必须为对象。")
        result.append({"name": fn["name"], "description": str(fn.get("description", "")), "parameters": parameters})
    return result


def _responses_input(messages: list[dict]) -> tuple[str, list[dict]]:
    instructions, items = [], []
    for message in messages:
        role, content = message.get("role"), message.get("content", "")
        if role in ("system", "developer"):
            instructions.append(_text_content(content))
        elif role == "tool":
            items.append({"type": "function_call_output", "call_id": message.get("tool_call_id", ""), "output": _text_content(content)})
        elif role in ("user", "assistant"):
            parts = _content_parts(content, images=role == "user")
            if parts:
                if role == "assistant":
                    items.append({"role": role, "content": "\n".join(p["text"] for p in parts)})
                else:
                    blocks = [{"type": "input_text", "text": p["text"]} if p["type"] == "text" else
                              {"type": "input_image", "image_url": p["image_url"]["url"], "detail": p["image_url"]["detail"]} for p in parts]
                    items.append({"role": role, "content": blocks})
            for call in _calls(message):
                items.append({"type": "function_call", "call_id": call["id"], "name": call["name"],
                              "arguments": json.dumps(call["arguments"], ensure_ascii=False)})
        else:
            raise ProviderError("对话角色不受支持。")
    return "\n\n".join(instructions), items


def _chat_messages(messages: list[dict]) -> list[dict]:
    result = []
    for message in messages:
        role = message.get("role")
        if role not in ("system", "developer", "user", "assistant", "tool"):
            raise ProviderError("对话角色不受支持。")
        content = message.get("content") or ""
        parts = _content_parts(content, images=role == "user")
        out = {"role": role, "content": parts if role == "user" and isinstance(content, list) else "\n".join(p["text"] for p in parts)}
        if role == "tool":
            out["tool_call_id"] = message.get("tool_call_id", "")
        calls = _calls(message)
        if calls:
            out["tool_calls"] = [{"id": c["id"], "type": "function", "function": {
                "name": c["name"], "arguments": json.dumps(c["arguments"], ensure_ascii=False)}} for c in calls]
        result.append(out)
    return result


def _claude_assistant_blocks(message: dict) -> list[dict] | None:
    """Replay only Claude's own intact signed response, never foreign metadata.

    The ordinary content/tool_calls remain authoritative. Reject stale or
    modified metadata instead of sending a different call beneath a preserved
    thinking signature. These blocks are transport state, not user-visible text.
    """
    if message.get("role") != "assistant" or message.get("_provider") != "claude" or "assistant_blocks" not in message:
        return None
    blocks = message["assistant_blocks"]
    if not isinstance(blocks, list) or not blocks or any(not isinstance(b, dict) for b in blocks):
        raise ProviderError("Claude 签名响应记录无效，未发送后续请求。")
    text, calls = [], []
    for block in blocks:
        kind = block.get("type")
        if kind == "thinking":
            if not isinstance(block.get("thinking"), str) or not isinstance(block.get("signature"), str) or not block["signature"]:
                raise ProviderError("Claude 思考签名不完整，未发送后续请求。")
        elif kind == "redacted_thinking":
            if not isinstance(block.get("data"), str) or not block["data"]:
                raise ProviderError("Claude 加密思考块不完整，未发送后续请求。")
        elif kind == "text":
            if not isinstance(block.get("text"), str):
                raise ProviderError("Claude 签名响应记录无效，未发送后续请求。")
            text.append(block["text"])
        elif kind == "tool_use":
            calls.append({"id": block.get("id"), "name": block.get("name"), "arguments": _arguments(block.get("input", {}))})
        else:
            raise ProviderError("Claude 响应包含不支持的内容块，未发送后续请求。")
    if calls != _calls(message) or "\n".join(text) != _text_content(message.get("content", "")):
        raise ProviderError("Claude 签名响应与当前消息或工具记录不一致，未发送后续请求。")
    return copy.deepcopy(blocks)


def _anthropic_messages(messages: list[dict]) -> tuple[str, list[dict]]:
    system, result = [], []
    for message in messages:
        role, content = message.get("role"), message.get("content", "")
        if role in ("system", "developer"):
            system.append(_text_content(content))
            continue
        blocks = []
        if role == "tool":
            role = "user"
            blocks.append({"type": "tool_result", "tool_use_id": message.get("tool_call_id", ""), "content": _text_content(content)})
        elif role in ("user", "assistant"):
            preserved = _claude_assistant_blocks(message)
            if preserved is not None:
                blocks = preserved
            else:
                for part in _content_parts(content, images=role == "user"):
                    if part["type"] == "text":
                        blocks.append(part)
                    else:
                        prefix, data = part["image_url"]["url"].split(",", 1)
                        blocks.append({"type": "image", "source": {"type": "base64", "media_type": prefix[5:].split(";")[0], "data": data}})
                for call in _calls(message):
                    blocks.append({"type": "tool_use", "id": call["id"], "name": call["name"], "input": call["arguments"]})
        else:
            raise ProviderError("对话角色不受支持。")
        if blocks:
            if result and result[-1]["role"] == role:
                result[-1]["content"].extend(blocks)
            else:
                result.append({"role": role, "content": blocks})
    return "\n\n".join(system), result


class ProviderManager:
    def __init__(self, home: Path | None = None):
        self.home = Path(home) if home is not None else Path.home()

    def _config(self, provider_id: str) -> dict:
        if provider_id == "openai":
            config = _read(self.home / ".codex/config.toml", toml=True)
            provider_name = config.get("model_provider", "openai")
            provider = config.get("model_providers", {}).get(provider_name, {})
            auth = _read(self.home / ".codex/auth.json")
            endpoint = _string(provider.get("base_url")) or ("https://api.openai.com/v1" if provider_name == "openai" else "")
            env_key = _string(provider.get("env_key"))
            # Explicit provider credentials beat inherited environment/auth state.
            key = _api_key(provider.get("experimental_bearer_token"))
            if not key and env_key:
                key = _api_key(os.environ.get(env_key))
            if not key and not env_key:
                key = _api_key(auth.get("OPENAI_API_KEY"))
            data = {"id": "openai", "name": "ChatGPT / OpenAI", "model": _string(config.get("model")) or "gpt-4.1",
                    "endpoint": endpoint, "key": key, "auth": "bearer", "wireApi": _string(provider.get("wire_api")) or "responses",
                    "source": "CC Switch → .codex/config.toml / auth.json",
                    "effortDefault": _string(config.get("model_reasoning_effort")) or "default"}
        elif provider_id == "claude":
            config = _read(self.home / ".claude/settings.json")
            env = config.get("env", {})
            token = _api_key(env.get("ANTHROPIC_AUTH_TOKEN"))
            key = token or _api_key(env.get("ANTHROPIC_API_KEY"))
            configured_model = _string(env.get("ANTHROPIC_MODEL")) or _string(config.get("model"))
            if configured_model in ("opus", "sonnet", "haiku"):
                configured_model = _string(env.get("ANTHROPIC_DEFAULT_" + configured_model.upper() + "_MODEL")) or configured_model
            data = {"id": "claude", "name": "Claude / Anthropic", "model": configured_model or _string(env.get("ANTHROPIC_DEFAULT_SONNET_MODEL")) or "claude-sonnet-4-5",
                    "endpoint": _string(env.get("ANTHROPIC_BASE_URL")) or "https://api.anthropic.com", "key": key,
                    "auth": "bearer" if token else "api-key", "wireApi": "messages",
                    "source": "CC Switch → .claude/settings.json",
                    "effortDefault": _string(env.get("CLAUDE_CODE_EFFORT_LEVEL")) or _string(config.get("effortLevel")) or "default"}
        else:
            raise ProviderError("未知服务；工作台仅支持 OpenAI 与 Claude。")
        data["reason"] = ""
        try:
            data["endpoint"], data["endpointDisplay"] = _endpoint(data["endpoint"])
        except ProviderError as exc:
            data["endpointDisplay"] = ""
            data["reason"] = str(exc)
        supported_wires = ("messages",) if provider_id == "claude" else ("responses", "chat", "chat_completions")
        if data["wireApi"] not in supported_wires:
            data["reason"] = "当前 wire_api 不受支持。"
        if not data["key"]:
            data["reason"] = "CC Switch 当前配置中没有可用 API 密钥；不使用订阅或 OAuth 登录。"
        data["configured"] = not bool(data["reason"])
        data["effortOptions"] = list(effort_options(provider_id, data["model"]))
        if data["effortDefault"] not in data["effortOptions"]:
            data["effortDefault"] = "default"
        return data

    def public_status(self) -> list[dict]:
        fields = ("id", "name", "configured", "model", "endpointDisplay", "source", "reason", "wireApi", "effortDefault", "effortOptions")
        statuses = []
        for provider_id in ("openai", "claude"):
            try:
                data = self._config(provider_id)
                statuses.append({key: data[key] for key in fields})
            except (ProviderError, AttributeError, TypeError):
                statuses.append({"id": provider_id, "name": "ChatGPT / OpenAI" if provider_id == "openai" else "Claude / Anthropic",
                                 "configured": False, "model": "", "endpointDisplay": "", "source": "CC Switch",
                                 "reason": "无法读取服务配置，请在 CC Switch 检查配置格式。", "wireApi": "",
                                 "effortDefault": "default", "effortOptions": ["default"]})
        return statuses

    def complete(self, provider_id, messages, tools=None, model=None, max_tokens=4096,
                 temperature=0.8, timeout=120, cancel_event=None, effort="default") -> dict:
        if cancel_event is not None and cancel_event.is_set():
            raise ProviderError("生成已取消。", kind="cancelled")
        try:
            config = self._config(provider_id)
        except (AttributeError, TypeError):
            raise ProviderError("无法读取服务配置，请在 CC Switch 检查配置格式。") from None
        if not config["configured"]:
            raise ProviderError(config["reason"])
        selected_model = _string(model) or config["model"]
        if len(selected_model) > 160 or any(ord(c) < 32 for c in selected_model):
            raise ProviderError("模型名称无效。")
        effective_effort, effort_source = _resolve_effort(provider_id, selected_model, effort, config.get("effortDefault", "default"))
        try:
            if type(max_tokens) is not int or max_tokens < 1:
                raise ValueError()
            budget = max_tokens
            timeout = float(timeout)
            if not math.isfinite(timeout) or timeout <= 0:
                raise ValueError()
            temperature = max(0.0, min(2.0, float(temperature)))
        except (ValueError, TypeError):
            raise ProviderError("生成参数无效。") from None
        if not isinstance(messages, list) or not messages or len(messages) > 500:
            raise ProviderError("对话记录为空或超出长度限制。")
        functions = _schemas(tools)
        # Identify this desktop client. Some configured gateways block Python's
        # default urllib user agent before requests reach either model service.
        headers = {"Content-Type": "application/json", "Accept": "text/event-stream, application/json", "User-Agent": "RainbowCreatorWorkbench/1.0"}
        if config["auth"] == "api-key":
            headers["x-api-key"] = config["key"]
        else:
            headers["Authorization"] = "Bearer " + config["key"]
        wire = config["wireApi"]
        if provider_id == "claude":
            system, turns = _anthropic_messages(messages)
            body = {"model": selected_model, "messages": turns, "max_tokens": budget, "temperature": min(temperature, 1.0)}
            if effective_effort:
                body["output_config"] = {"effort": effective_effort}
                # Modern Claude families use adaptive thinking; temperature is
                # incompatible with that mode. Opus 4.5 has effort but does not
                # expose adaptive thinking, so leave its thinking mode alone.
                if "max" in effort_options(provider_id, selected_model) or re.match(r"^claude-sonnet-(?:4[.-][6-9]|[5-9][.-])", selected_model):
                    body["thinking"] = {"type": "adaptive"}
                body.pop("temperature", None)
            if system:
                body["system"] = system
            if functions:
                body["tools"] = [{"name": f["name"], "description": f["description"], "input_schema": f["parameters"]} for f in functions]
            headers["anthropic-version"] = "2023-06-01"
            url = _join_endpoint(config["endpoint"], "messages")
        elif wire == "responses":
            system, items = _responses_input(messages)
            body = {"model": selected_model, "input": items, "max_output_tokens": budget, "store": False}
            if effective_effort:
                body["reasoning"] = {"effort": effective_effort}
            if system:
                body["instructions"] = system
            if functions:
                body["tools"] = [{"type": "function", **f, "strict": False} for f in functions]
            if not re.match(r"^(gpt-[56]|o[134])", selected_model):
                body["temperature"] = temperature
            url = _join_endpoint(config["endpoint"], "responses")
        else:
            body = {"model": selected_model, "messages": _chat_messages(messages)}
            if effective_effort:
                body["reasoning_effort"] = effective_effort
            if re.match(r"^(gpt-[56]|o[134])", selected_model):
                body["max_completion_tokens"] = budget
            else:
                body.update(max_tokens=budget, temperature=temperature)
            if functions:
                body["tools"] = [{"type": "function", "function": f} for f in functions]
            url = _join_endpoint(config["endpoint"], "chat/completions")
        body["stream"] = True
        if provider_id != "claude" and wire != "responses":
            body["stream_options"] = {"include_usage": True}
        try:
            encoded = json.dumps(body, ensure_ascii=False, allow_nan=False).encode("utf-8")
        except (ValueError, TypeError):
            raise ProviderError("请求内容无法序列化为 JSON。") from None
        if len(encoded) > MAX_BODY_BYTES:
            raise ProviderError("请求内容超过 8 MB，请减少上下文。")
        payload = self._request(url, headers, encoded, timeout, cancel_event)
        normalized = self._normalize(payload, provider_id, wire)
        normalized["requestedEffort"] = effort or "default"
        normalized["effectiveEffort"] = effective_effort or "default"
        normalized["effortSource"] = effort_source
        allowed_names = {function["name"] for function in functions}
        if any(call["name"] not in allowed_names for call in normalized["tool_calls"]):
            raise ProviderError("模型请求了本轮未提供的工具，未执行工具。")
        return normalized

    def _request(self, url, headers, encoded, timeout, cancel_event):
        # A bounded worker lets Cancel return promptly even during a blocked read.
        # The provider may already have accepted the request; we never resubmit it.
        outcomes = queue.Queue(maxsize=1)
        stopped = threading.Event()
        progress = [time.monotonic()]
        class RequestCancellation:
            def is_set(self):
                return stopped.is_set() or bool(cancel_event is not None and cancel_event.is_set())
        request_cancel = RequestCancellation()
        class ProgressReader:
            def __init__(self, response):
                self.response = response
                self.headers = getattr(response, 'headers', None)
            def readline(self, size=-1):
                data = self.response.readline(size)
                if data:
                    progress[0] = time.monotonic()
                return data
            def read(self, size=-1):
                # JSON fallback can be a large single line. Read incrementally
                # when supported, recording activity without changing bytes.
                reader = getattr(self.response, 'read1', self.response.read)
                pieces, remaining = [], size
                while remaining != 0 and not request_cancel.is_set():
                    data = reader(min(65536, remaining) if remaining > 0 else 65536)
                    if not data:
                        break
                    pieces.append(data)
                    progress[0] = time.monotonic()
                    if remaining > 0:
                        remaining -= len(data)
                return b''.join(pieces)
        outgoing = json.loads(encoded)
        wire = "messages" if "anthropic-version" in headers else "responses" if "input" in outgoing else "chat"
        def run():
            try:
                req = request.Request(url, data=encoded, headers=headers, method="POST")
                opener = request.build_opener(_NoRedirect)
                with opener.open(req, timeout=timeout) as response:
                    progress[0] = time.monotonic()
                    value = _read_provider_response(ProgressReader(response), wire, request_cancel)
                outcomes.put((True, value))
            except error.HTTPError as exc:
                # Deliberately discard body, reason, URL and headers: gateways can
                # echo supplied secrets in every one of these fields.
                outcomes.put((False, _http_failure(exc.code)))
            except ProviderError as exc:
                outcomes.put((False, exc))
            except (TimeoutError, socket.timeout):
                outcomes.put((False, ProviderError("模型响应超时；已保留前轮进度，未自动重试。", kind="timeout", retryable=True)))
            except error.URLError as exc:
                timed_out = isinstance(exc.reason, (TimeoutError, socket.timeout))
                outcomes.put((False, ProviderError("模型响应超时；未自动重试。" if timed_out else "API 网络连接暂时失败；未自动重试。",
                                                    kind="timeout" if timed_out else "network", retryable=True)))
            except Exception:
                outcomes.put((False, ProviderError("API 连接或响应读取失败；没有自动重试。", kind="network", retryable=True)))
        threading.Thread(target=run, name="creator-provider-request", daemon=True).start()
        try:
            while True:
                if cancel_event is not None and cancel_event.is_set():
                    raise ProviderError("生成已取消。已经发送的请求可能仍在服务端完成，未自动重试。", kind="cancelled")
                remaining = timeout - (time.monotonic() - progress[0])
                if remaining <= 0:
                    raise ProviderError("接口长时间未返回任何数据；已保留前轮进度，没有自动重试。", kind="timeout", retryable=True)
                try:
                    ok, value = outcomes.get(timeout=min(0.1, remaining))
                    if ok:
                        return value
                    raise value
                except queue.Empty:
                    continue
        finally:
            # Do not mutate the user's cancellation state when one request
            # becomes idle. A streaming worker stops on its next received line.
            stopped.set()

    def _normalize(self, payload: dict, provider_id: str, wire: str) -> dict:
        text, calls, reason, has_tools = [], [], "", False
        try:
            if provider_id == "claude":
                reason = payload.get("stop_reason", "")
                truncated, incomplete = _output_end_state(reason)
                for block in payload.get("content", []):
                    if block.get("type") == "text":
                        text.append(str(block.get("text", "")))
                    elif block.get("type") == "tool_use":
                        has_tools = True
                        if not incomplete:
                            calls.append({"id": block["id"], "name": block["name"], "arguments": _arguments(block.get("input", {}))})
            elif wire == "responses":
                reason = payload.get("status", "")
                if payload.get("incomplete_details"):
                    reason = payload["incomplete_details"].get("reason") or "incomplete"
                truncated, incomplete = _output_end_state(reason, status=payload.get("status", ""))
                for item in payload.get("output", []):
                    if item.get("type") == "message":
                        for block in item.get("content", []):
                            if block.get("type") == "output_text":
                                text.append(str(block.get("text", "")))
                            elif block.get("type") == "refusal":
                                text.append(str(block.get("refusal", "")))
                    elif item.get("type") == "function_call":
                        has_tools = True
                        if not incomplete:
                            calls.append({"id": item["call_id"], "name": item["name"], "arguments": _arguments(item.get("arguments", "{}"))})
                if not text and not calls and isinstance(payload.get("output_text"), str):
                    text.append(payload["output_text"])
            else:
                choice = payload.get("choices", [])[0]
                reason = choice.get("finish_reason", "")
                truncated, incomplete = _output_end_state(reason)
                message = choice.get("message", {})
                has_tools = bool(message.get('tool_calls'))
                content = message.get("content")
                if isinstance(content, str):
                    text.append(content)
                elif isinstance(content, list):
                    text.extend(str(c.get("text", "")) for c in content if c.get("type") == "text")
                if not incomplete:
                    calls = _calls(message)
            ids = set()
            for call in calls:
                if not isinstance(call["id"], str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,256}", call["id"]) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", call["name"]):
                    raise ProviderError("模型返回的工具名称或调用标识无效，未执行工具。")
                if call["id"] in ids:
                    raise ProviderError("模型返回了重复的工具调用标识，未执行工具。")
                ids.add(call["id"])
            if not text and not calls and not incomplete:
                raise ProviderError("服务没有返回可用的文字或工具调用。")
            normalized = {"text": "\n".join(text), "tool_calls": calls, "model": _string(payload.get("model")),
                          "usage": payload.get("usage") if isinstance(payload.get("usage"), dict) else {}, "stop_reason": str(reason),
                          "output_truncated": truncated, "output_incomplete": incomplete,
                          "partial_has_tools": bool(incomplete and has_tools)}
            if provider_id == "claude" and not incomplete:
                # Preserve exact signed thinking only in internal transport
                # metadata. text remains public text blocks alone.
                normalized["assistant_blocks"] = _claude_assistant_blocks({
                    "role": "assistant", "_provider": "claude", "content": normalized["text"],
                    "tool_calls": calls, "assistant_blocks": payload.get("content", [])})
            return normalized
        except ProviderError:
            raise
        except (KeyError, IndexError, AttributeError, TypeError):
            raise ProviderError("服务响应结构无效，未执行工具。") from None
