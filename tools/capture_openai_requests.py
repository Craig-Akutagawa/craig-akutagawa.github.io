from pathlib import Path
import json
import re
from mitmproxy import http


OUT = Path(r"D:\Codes\MyWeb\tmp\openai_requests.jsonl")
SENSITIVE_HEADER_RE = re.compile(r"(authorization|cookie|api[-_]?key|token|secret|key)", re.IGNORECASE)
OUT.parent.mkdir(parents=True, exist_ok=True)


def redacted_headers(headers: http.Headers) -> dict[str, str]:
    return {
        key: "[REDACTED]" if SENSITIVE_HEADER_RE.search(key) else value
        for key, value in headers.items()
    }


def request(flow: http.HTTPFlow) -> None:
    if flow.request.pretty_host != "api.openai.com":
        return

    entry = {
        "method": flow.request.method,
        "url": flow.request.pretty_url,
        "headers": redacted_headers(flow.request.headers),
        "text": flow.request.get_text(strict=False),
    }

    with OUT.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
