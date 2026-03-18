from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
TOOLS_DIR = Path(__file__).resolve().parent
VALID_FILE_RE = re.compile(r"^[A-Za-z0-9._-]+\.md$")
VALID_SLUG_RE = re.compile(r"^[a-z0-9-]+$")


def run_git(args: list[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=check,
    )


def normalize_post_file_name(value: str) -> str:
    candidate = Path(str(value).strip()).name
    if not VALID_FILE_RE.fullmatch(candidate):
        raise ValueError("invalid post file name")
    return candidate


def normalize_asset_slug(value: str) -> str:
    candidate = str(value).strip()
    if not VALID_SLUG_RE.fullmatch(candidate):
        raise ValueError("invalid asset slug")
    return candidate


def collect_publish_paths(file_name: str, asset_slug: str) -> list[str]:
    paths = [f"_posts/{file_name}"]
    asset_dir = REPO_ROOT / "assets" / "posts" / asset_slug
    if asset_dir.exists():
        paths.append(f"assets/posts/{asset_slug}")
    return paths


def build_commit_message(mode: str, file_name: str) -> str:
    action = "add" if mode == "create" else "update"
    return f"post: {action} {file_name}"


def publish_post(payload: dict[str, object]) -> dict[str, object]:
    file_name = normalize_post_file_name(str(payload.get("fileName", "")))
    asset_slug = normalize_asset_slug(str(payload.get("assetSlug", "")))
    mode = str(payload.get("mode", "edit")).strip().lower()
    if mode not in {"create", "edit"}:
        mode = "edit"

    paths = collect_publish_paths(file_name, asset_slug)

    status_result = run_git(["status", "--porcelain", "--", *paths])
    relevant_changes = [line for line in status_result.stdout.splitlines() if line.strip()]
    if not relevant_changes:
        return {
            "ok": True,
            "status": "noop",
            "message": "当前贴文没有可提交的 Git 改动。",
            "paths": paths,
        }

    add_result = run_git(["add", "--", *paths], check=False)
    if add_result.returncode != 0:
        raise RuntimeError((add_result.stderr or add_result.stdout or "git add failed").strip())

    staged_result = run_git(["diff", "--cached", "--name-only", "--", *paths])
    staged_files = [line.strip() for line in staged_result.stdout.splitlines() if line.strip()]
    if not staged_files:
        return {
            "ok": True,
            "status": "noop",
            "message": "当前贴文没有新的可提交内容。",
            "paths": paths,
        }

    commit_message = build_commit_message(mode, file_name)
    commit_result = run_git(["commit", "-m", commit_message], check=False)
    if commit_result.returncode != 0:
        raise RuntimeError((commit_result.stderr or commit_result.stdout or "git commit failed").strip())

    push_result = run_git(["push", "origin", "HEAD"], check=False)
    if push_result.returncode != 0:
        raise RuntimeError((push_result.stderr or push_result.stdout or "git push failed").strip())

    return {
        "ok": True,
        "status": "published",
        "message": "已提交并推送当前贴文。",
        "commitMessage": commit_message,
        "paths": staged_files,
    }


class ComposerRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def do_GET(self) -> None:
        if self.path == "/status":
            self.respond_json(
                HTTPStatus.OK,
                {"ok": True, "service": "post-composer"},
                extra_headers={"Access-Control-Allow-Origin": "*"},
            )
            return

        super().do_GET()

    def do_POST(self) -> None:
        if self.path != "/publish":
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0

        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self.respond_json(HTTPStatus.BAD_REQUEST, {"ok": False, "message": "invalid json payload"})
            return

        try:
            result = publish_post(payload)
            self.respond_json(HTTPStatus.OK, result)
        except ValueError as error:
            self.respond_json(HTTPStatus.BAD_REQUEST, {"ok": False, "message": str(error)})
        except Exception as error:  # noqa: BLE001
            self.respond_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "message": str(error)})

    def respond_json(
        self,
        status: HTTPStatus,
        payload: dict[str, object],
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:
        sys.stdout.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()

    handler = partial(ComposerRequestHandler, directory=str(TOOLS_DIR))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Post Composer server is running at http://127.0.0.1:{args.port}/post-composer.html")
    print("Serving tools from", TOOLS_DIR)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
