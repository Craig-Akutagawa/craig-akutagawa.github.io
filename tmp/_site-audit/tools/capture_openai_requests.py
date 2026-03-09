from pathlib import Path
import json
from mitmproxy import http


OUT = Path(r"D:\Codes\MyWeb\tmp\openai_requests.jsonl")
OUT.parent.mkdir(parents=True, exist_ok=True)


def request(flow: http.HTTPFlow) -> None:
    if flow.request.pretty_host != "api.openai.com":
        return

    entry = {
        "method": flow.request.method,
        "url": flow.request.pretty_url,
        "headers": dict(flow.request.headers),
        "text": flow.request.get_text(strict=False),
    }

    with OUT.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
