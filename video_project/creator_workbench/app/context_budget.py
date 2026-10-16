"""Local, conservative context budgeting without a tokenizer or provider calls.

The slider is a requested per-call budget, not a claim about a model's native
context window. Estimates include tool schemas and visual inputs; provider usage
remains the source of measured token counts. Tool calls and their results are
always kept or removed together.
"""
from __future__ import annotations

import copy
import json
import math


DEFAULT_CONTEXT_BUDGET = 1_000_000
MIN_CONTEXT_BUDGET = 16_000
MAX_CONTEXT_BUDGET = 1_000_000
# Stay below the provider adapter's 500-message guard even when tiny tool
# observations fit comfortably inside a large token window.
MAX_CONTEXT_MESSAGES = 480
CONTEXT_BUDGET_PRESETS = (16_000, 32_000, 48_000, 64_000, 96_000, 128_000, 192_000, 256_000, 512_000, 768_000, 1_000_000)
DEFAULT_BUDGET = DEFAULT_CONTEXT_BUDGET


def validate_context_budget(value=None):
    if value is None:
        return DEFAULT_CONTEXT_BUDGET
    if type(value) is not int or not MIN_CONTEXT_BUDGET <= value <= MAX_CONTEXT_BUDGET:
        raise ValueError("上下文预算需为 16000—1000000 之间的整数 token")
    return value


validate_budget = validate_context_budget


def estimate_text(text):
    """Deliberately approximate: code/ASCII ~3 chars, Unicode ~1.5 tokens."""
    text = str(text)
    ascii_chars = sum(ord(character) < 128 for character in text)
    return math.ceil(ascii_chars / 3 + (len(text) - ascii_chars) * 1.5)


def estimate_content(content):
    if isinstance(content, str):
        return estimate_text(content)
    if content is None:
        return 0
    if isinstance(content, list):
        total = 0
        for block in content:
            if isinstance(block, dict) and block.get("type") == "image_url":
                # inspect_frame normalizes images to <=960px. Never count the
                # base64 string as text or silently treat an image as free.
                detail = block.get("image_url", {}).get("detail", "auto")
                total += 512 if detail == "low" else 4096
            elif isinstance(block, dict) and block.get("type") == "text":
                total += estimate_text(block.get("text", "")) + 4
            else:
                total += estimate_text(json.dumps(block, ensure_ascii=False))
        return total
    return estimate_text(json.dumps(content, ensure_ascii=False))


def estimate_messages(messages, tools=()):
    total = 16
    if tools:
        total += estimate_text(json.dumps(tools, ensure_ascii=False, separators=(",", ":"))) + 64
    for message in messages:
        total += 12 + estimate_content(message.get("content"))
        calls = message.get("tool_calls")
        if calls:
            total += estimate_text(json.dumps(calls, ensure_ascii=False, separators=(",", ":"))) + 12
        # Native Claude thinking/signature blocks must round-trip verbatim.
        # Visible text and tool uses are already counted above in normalized
        # content/calls; account only for the additional opaque native blocks.
        for block in message.get("assistant_blocks") or []:
            if isinstance(block, dict) and block.get("type") not in {"text", "tool_use"}:
                total += estimate_text(json.dumps(block, ensure_ascii=False, separators=(",", ":")))
        if message.get("tool_call_id"):
            total += estimate_text(message["tool_call_id"]) + 4
    return total


def _has_image(message):
    return isinstance(message.get("content"), list) and any(
        isinstance(block, dict) and block.get("type") == "image_url" for block in message["content"]
    )


def _groups(messages):
    """Return protocol-safe atomic groups, rejecting unmatched tool results."""
    groups = []
    index = 0
    while index < len(messages):
        message = messages[index]
        calls = message.get("tool_calls") or []
        if message.get("role") == "tool":
            raise ValueError("上下文工具结果缺少对应调用，未发送请求")
        group = [message]
        index += 1
        if calls:
            if message.get("role") != "assistant":
                raise ValueError("上下文工具调用角色无效")
            ids = [call.get("id") for call in calls]
            if not all(ids) or len(set(ids)) != len(ids):
                raise ValueError("上下文工具调用 ID 无效")
            seen = set()
            while index < len(messages) and messages[index].get("role") == "tool":
                result = messages[index]
                ident = result.get("tool_call_id")
                if ident not in ids or ident in seen:
                    raise ValueError("上下文工具结果与调用不匹配")
                seen.add(ident)
                group.append(result)
                index += 1
            if seen != set(ids):
                raise ValueError("上下文工具结果不完整，未发送请求")
            if index < len(messages) and messages[index].get("role") == "user" and _has_image(messages[index]):
                group.append(messages[index])
                index += 1
        group_id = message.get("_context_group")
        if group_id and groups and groups[-1][0].get("_context_group") == group_id:
            groups[-1].extend(group)
        else:
            groups.append(group)
    return groups


def _compact_tool(content, maximum=1200):
    """Keep the output's identity/status plus an explicitly shortened excerpt."""
    if not isinstance(content, str) or estimate_text(content) <= maximum:
        return content
    try:
        value = json.loads(content)
    except (TypeError, ValueError):
        value = None
    reduced = {"contextCompacted": True, "originalChars": len(content),
               "note": "上下文预算内的摘要；完整工具结果保留在任务日志，需要细节请重新读取。"}
    if isinstance(value, dict):
        for key in ("path", "written", "exitCode", "error", "log", "sha256", "timeSec", "imageAttached", "totalChars", "nextOffset"):
            item = value.get(key)
            if isinstance(item, (str, int, float, bool)) or item is None and key in value:
                reduced[key] = item[:240] if isinstance(item, str) else item
    reduced["excerpt"] = content[:min(900, maximum // 2)]
    return json.dumps(reduced, ensure_ascii=False)


def compact_context(messages, tools=(), *, budget=None, output_reserve=6000):
    """Return bounded input and public estimates; never mutate source history.

    System instructions and explicitly pinned task/phase instructions survive.
    The newest tool group survives (possibly with shortened textual outputs),
    so the next model sees the tools it just requested and any attached images.
    Older history, tool groups and optional reference excerpts can be discarded.
    Token and protocol-message budgets both apply; tool batches remain atomic.
    """
    budget = validate_context_budget(budget)
    if type(output_reserve) is not int or not 1 <= output_reserve < budget:
        raise ValueError("输出预留必须为小于上下文预算的正整数")
    headroom = max(512, math.ceil(budget * .03))
    input_limit = budget - output_reserve - headroom
    source = copy.deepcopy(messages)
    before = estimate_messages(source, tools)
    groups = _groups(source)
    latest_user = next((i for i in range(len(groups) - 1, -1, -1)
                        if any(m.get("role") == "user" and isinstance(m.get("content"), str)
                               and not m.get("_context_optional") and not m.get("_context_history")
                               for m in groups[i])), None)
    latest_observation = next((i for i in range(len(groups) - 1, -1, -1)
                               if any(m.get("role") == "assistant" and not m.get("_context_history")
                                      for m in groups[i])), None)
    pinned = {i for i, group in enumerate(groups) if any(
        message.get("role") in {"system", "developer"} or message.get("_context_keep") for message in group
    )}
    pinned.update(i for i in (latest_user, latest_observation) if i is not None)
    removed = set()
    trimmed_messages = trimmed_tools = compacted = 0

    def flatten():
        return [message for i, group in enumerate(groups) if i not in removed for message in group]

    # Reserve room for the compaction note before trimming. The note is not a
    # fabricated summary of missing evidence and never claims tools were rerun.
    note = {"role": "user", "content": "工作台上下文整理：部分较早对话或工具日志已移出本次输入。原始记录仍保存在任务中；如需被移出内容，请调用工具重新读取。不要据此假设之前检查已经通过。", "_context_optional": True}
    note_cost = estimate_messages([note])
    order = sorted((i for i in range(len(groups)) if i not in pinned), key=lambda i: (
        0 if any(m.get("_context_history") for m in groups[i]) else
        2 if any(m.get("_context_optional") for m in groups[i]) else 1, i))
    for i in order:
        current = flatten()
        if (estimate_messages(current, tools) + (note_cost if removed else 0) <= input_limit
                and len(current) + bool(removed) <= MAX_CONTEXT_MESSAGES):
            break
        removed.add(i)
        trimmed_messages += len(groups[i])
        trimmed_tools += sum(bool(m.get("tool_calls")) for m in groups[i])
    bounded = flatten()
    if estimate_messages(bounded, tools) + (note_cost if removed else 0) > input_limit:
        # Most recent output can be huge (read_file/process); preserve the call
        # protocol and image evidence while making explicit textual excerpts.
        for message in bounded:
            if message.get("role") == "tool":
                reduced = _compact_tool(message.get("content", ""))
                if reduced != message.get("content"):
                    message["content"] = reduced
                    compacted += 1
    # Compacting a large tool output also inserts a notice. Account for that
    # extra message at the exact boundary without splitting any protocol group.
    for i in order:
        if len(bounded) + bool(removed or compacted) <= MAX_CONTEXT_MESSAGES:
            break
        if i in removed:
            continue
        removed.add(i)
        trimmed_messages += len(groups[i])
        trimmed_tools += sum(bool(m.get("tool_calls")) for m in groups[i])
        bounded = flatten()
    if len(bounded) + bool(removed or compacted) > MAX_CONTEXT_MESSAGES:
        raise ValueError(f"当前任务必须保留的上下文超过 {MAX_CONTEXT_MESSAGES} 条消息，无法在保留完整工具调用与结果的前提下压缩。请减少同时固定的任务内容或拆分任务。")
    if removed or compacted:
        insertion = next((i for i, message in enumerate(bounded)
                          if message.get("role") not in {"system", "developer"}), len(bounded))
        bounded.insert(insertion, note)
    estimate = estimate_messages(bounded, tools)
    if estimate > input_limit:
        raise ValueError(f"当前任务必要内容估算为 {estimate:,} token，超过 {budget:,} 的上下文预算（已为输出预留 {output_reserve:,}）。请提高上下文滑块，或缩短本次输入/减少同时查看的画面。")
    stats = {"budgetTokens": budget, "inputLimitTokens": input_limit,
             "estimatedInputTokens": estimate, "estimatedBeforeTokens": before,
             "outputReserveTokens": output_reserve, "headroomTokens": headroom,
             "trimmedMessages": trimmed_messages, "trimmedToolGroups": trimmed_tools,
             "inputMessages": len(bounded), "beforeMessages": len(messages),
             "messageLimit": MAX_CONTEXT_MESSAGES,
             "compactedToolResults": compacted, "estimateMethod": "conservative-local-v1", "isEstimate": True}
    # Internal priority markers never go to provider adapters.
    return [{key: value for key, value in message.items() if not key.startswith("_context_")}
            for message in bounded], stats
