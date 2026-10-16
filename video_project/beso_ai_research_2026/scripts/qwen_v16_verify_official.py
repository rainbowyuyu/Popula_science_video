"""Capture public official API references without credentials or media URLs."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
from pathlib import Path

from html.parser import HTMLParser
class TextParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]; self.skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'): self.skip+=1
    def handle_endtag(self,tag):
        if tag in ('script','style'): self.skip=max(0,self.skip-1)
    def handle_data(self,data):
        if not self.skip and data.strip(): self.parts.append(data.strip())
def html_text(value):
    parser=TextParser(); parser.feed(value); return " ".join(parser.parts)

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "research/generation/v16-qwen/official"
OUT.mkdir(parents=True, exist_ok=True)
SOURCES = {
    "video-api": "https://help.aliyun.com/zh/model-studio/image-to-video-general-api-reference",
    "pricing": "https://help.aliyun.com/zh/model-studio/model-pricing",
}
records = {}
texts = {}
for name, url in SOURCES.items():
    response = requests.get(url, timeout=45)
    response.raise_for_status()
    response.encoding="utf-8"
    text = html_text(response.text)
    if "404错误页" in text[:100]:
        raise RuntimeError("Official URL resolved to a 404 content page")
    html = OUT / (name + ".html")
    html.write_text(response.text, "utf8")
    snapshot = OUT / (name + ".txt")
    snapshot.write_text(text, "utf8")
    records[name] = {"url": url, "http": response.status_code, "snapshot": snapshot.relative_to(ROOT).as_posix(), "snapshotSHA256": hashlib.sha256(snapshot.read_bytes()).hexdigest()}
    texts[name] = text

model = "wan2.7-i2v-2026-04-25"
api = texts["video-api"]
pricing = texts["pricing"]
api_start = api.index("首尾帧生视频")
price_start = pricing.index("万相-图生视频")
evidence = pricing[price_start:price_start + 1600]
if model not in api or model not in evidence or "1080P 1 元/秒" not in evidence:
    raise RuntimeError("Expected published model or nominal Beijing price not found")
result = {
    "version": 16,
    "checkedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
    "sources": records,
    "model": model,
    "endpoint": "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
    "endpointCompatibility": "Existing project's successful Beijing native endpoint retained; current docs also document workspace routes. No blind region migration.",
    "inputSchema": "input.media = [{type: first_frame, url: ...}, {type: last_frame, url: ...}]",
    "notUsed": "The legacy first_frame_url / last_frame_url flat schema is not used for WAN2.7.",
    "resolution": ["720P", "1080P"],
    "durationIntegerSeconds": [2, 15],
    "imageLimits": {"minimumSidePixels": 240, "maximumSidePixels": 8000, "maximumBytes": 20 * 1024 * 1024, "aspectRange": [1 / 8, 8], "opaqueOnly": True},
    "promptLimits": {"promptCharacters": 5000, "negativePromptCharacters": 500},
    "asyncHeader": {"X-DashScope-Async": "enable"},
    "pollEndpoint": "https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}",
    "nominalBeijing1080PCNYPerOutputSecond": 1,
    "three5sTasksNominalCNY": 15,
    "actualBillCNY": None,
    "freeQuotaKnown": False,
    "billingNote": "Only successful output seconds billed by official policy. Editorially rejected successful outputs remain billable. Provider bill not reconciled.",
    "apiEvidence": api[api_start:api_start + 2200],
    "pricingEvidence": evidence,
    "postRetryRule": "Paid POST never automatically retried. Unknown submission is persisted and must be reconciled; an existing task is polled using its original credential source.",
    "editorialBoundary": "Generated camera bridges are concept footage only; exact UI, numerical labels, native geometry and solver evidence are composited separately.",
}
destination = ROOT / "research/generation/v16-qwen-official.json"
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(result, ensure_ascii=False, indent=2), "utf8")
print("OFFICIAL_VERIFIED", destination.relative_to(ROOT).as_posix(), "WAN2.7", "1080P", "1 CNY/s nominal")
