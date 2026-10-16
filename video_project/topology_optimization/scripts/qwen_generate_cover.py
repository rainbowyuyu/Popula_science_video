"""Generate a clean no-text topology-optimization hero with DashScope/Qwen.

Requires DASHSCOPE_API_KEY in the process environment. The output is deliberately
text-free; exact Chinese copy and the user PNG logo are composited locally.
"""
from pathlib import Path
import os, sys, time, requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "delivery" / "clickbait" / "generated_topology_hero.png"
PROMPT = """high-end industrial product photograph of ONE topology-optimized metal shelf bracket, isolated on a warm ivory studio background, no shelf, no books, no text, no labels, no logo, no watermark. The object is a wall-mounted structural bracket in three-quarter view: a thick blue-gray metal mounting plate at the left, two elegant curved load-bearing ribs flowing down and right, a large clean triangular void in the middle, organic smooth fillets, realistic machined metal, subtle edge highlights, physically believable proportions, strong cast shadow. It must look like the final result of removing unnecessary material while keeping the force paths. The bracket fills most of the image and is centered slightly right, with generous empty space on the left for later typography. Premium museum-grade engineering visualization, soft directional light, ivory, pale cyan, blue-gray and small amber accents, crisp silhouette, no diagram, no generic furniture, no triangle icon, no UI, no cartoon."""

def main():
    key = os.getenv("DASHSCOPE_API_KEY")
    if not key:
        raise SystemExit("DASHSCOPE_API_KEY is not set")
    submit = requests.post(
        "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis",
        headers={"Authorization": f"Bearer {key}", "X-DashScope-Async": "enable", "Content-Type": "application/json"},
        json={"model": "qwen-image", "input": {"prompt": PROMPT}, "parameters": {"size": "1280*720", "n": 1}},
        timeout=60,
    )
    submit.raise_for_status()
    task = submit.json().get("output", {}).get("task_id")
    if not task:
        raise SystemExit(submit.text)
    for _ in range(40):
        time.sleep(4)
        poll = requests.get(
            f"https://dashscope.aliyuncs.com/api/v1/tasks/{task}",
            headers={"Authorization": f"Bearer {key}"}, timeout=30
        )
        poll.raise_for_status()
        data = poll.json(); status = data.get("output", {}).get("task_status")
        print(status, flush=True)
        if status == "SUCCEEDED":
            url = data["output"]["results"][0]["url"]
            OUT.write_bytes(requests.get(url, timeout=60).content)
            print(OUT)
            return
        if status in {"FAILED", "CANCELED"}:
            raise SystemExit(str(data))
    raise SystemExit("generation timeout")

if __name__ == "__main__":
    main()
