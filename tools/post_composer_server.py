from __future__ import annotations

import argparse
import base64
import binascii
import json
import os
import posixpath
import re
import secrets
import signal
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
from urllib.request import urlopen


REPO_ROOT = Path(__file__).resolve().parent.parent
TOOLS_DIR = Path(__file__).resolve().parent
POSTS_DIR = REPO_ROOT / "_posts"
POST_ASSETS_DIR = REPO_ROOT / "assets" / "posts"
VALID_FILE_RE = re.compile(r"^[A-Za-z0-9._-]+\.md$")
VALID_SLUG_RE = re.compile(r"^[a-z0-9-]+$")
VALID_ASSET_EXTENSION_RE = re.compile(r"^\.[a-z0-9]{1,8}$")
MAX_POST_SIZE = 5 * 1024 * 1024
MAX_IMAGE_SIZE = 25 * 1024 * 1024
MAX_REQUEST_SIZE = 36 * 1024 * 1024
TOKEN_HEADER = "X-Post-Composer-Token"
LEGACY_PID_FILE = REPO_ROOT / "tmp" / "post-composer-server.pid"
DEFAULT_RECORD_FILE = REPO_ROOT / "tmp" / "post-composer-server.json"
SERVER_LOG_FILE = REPO_ROOT / "tmp" / "post-composer-server.log"
SERVER_ERR_FILE = REPO_ROOT / "tmp" / "post-composer-server.err.log"


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


def status_url(port: int) -> str:
    return f"http://127.0.0.1:{port}/status"


def fetch_status(port: int) -> dict[str, object] | None:
    try:
        with urlopen(status_url(port), timeout=2) as response:
            result = json.loads(response.read().decode("utf-8"))
    except Exception:  # noqa: BLE001
        return None
    if result.get("ok") is True and result.get("service") == "post-composer" and result.get("requestToken"):
        return result
    return None


def port_is_open(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            return True
    except OSError:
        return False


def read_record(record_file: Path) -> dict[str, object] | None:
    try:
        record = json.loads(record_file.read_text(encoding="utf-8-sig"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None
    return record if isinstance(record, dict) else None


def remove_legacy_pid_file() -> None:
    try:
        LEGACY_PID_FILE.unlink()
    except FileNotFoundError:
        pass


def manage_start(port: int, record_file: Path, entry_point: str) -> int:
    record_file.parent.mkdir(parents=True, exist_ok=True)
    SERVER_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    remove_legacy_pid_file()

    existing_status = fetch_status(port)
    if existing_status:
        print(f"Post Composer is already running at http://127.0.0.1:{port}/post-composer.html")
        return 0
    if port_is_open(port):
        print(f"Port {port} is already in use by an unknown or outdated service.", file=sys.stderr)
        return 1

    instance_id = secrets.token_urlsafe(24)
    creationflags = 0
    start_new_session = os.name != "nt"
    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "DETACHED_PROCESS", 0)

    with SERVER_LOG_FILE.open("a", encoding="utf-8") as stdout_file, SERVER_ERR_FILE.open("a", encoding="utf-8") as stderr_file:
        process = subprocess.Popen(  # noqa: S603
            [sys.executable, str(Path(__file__).resolve()), "--port", str(port), "--instance-id", instance_id],
            cwd=REPO_ROOT,
            stdout=stdout_file,
            stderr=stderr_file,
            creationflags=creationflags,
            start_new_session=start_new_session,
        )

    deadline = time.time() + 5
    status = None
    while time.time() < deadline:
        status = fetch_status(port)
        if status and status.get("instanceId") == instance_id:
            break
        if process.poll() is not None:
            break
        time.sleep(0.2)

    if not status or status.get("instanceId") != instance_id:
        if process.poll() is None:
            process.terminate()
        print(f"Post Composer failed to start. Check {SERVER_ERR_FILE}.", file=sys.stderr)
        return 1

    record_file.write_text(
        json.dumps(
            {
                "service": "post-composer",
                "pid": process.pid,
                "port": port,
                "entryPoint": entry_point,
                "instanceId": instance_id,
                "startedAtUtc": datetime.now(timezone.utc).isoformat(),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Post Composer is running at http://127.0.0.1:{port}/post-composer.html")
    return 0


def manage_stop(record_file: Path) -> int:
    remove_legacy_pid_file()
    record = read_record(record_file)
    if not record:
        try:
            record_file.unlink()
        except FileNotFoundError:
            pass
        print("No owned Post Composer process record was found.")
        return 0

    port = record.get("port")
    pid = record.get("pid")
    instance_id = record.get("instanceId")
    status = fetch_status(int(port)) if isinstance(port, int) else None
    owned = (
        isinstance(pid, int)
        and isinstance(instance_id, str)
        and status is not None
        and status.get("instanceId") == instance_id
    )
    if owned:
        try:
            os.kill(pid, signal.SIGTERM)
            print(f"Stopped Post Composer (PID {pid}).")
        except OSError:
            print("Post Composer was no longer running.")
    else:
        print("Post Composer ownership could not be verified; no process was stopped.")

    try:
        record_file.unlink()
    except FileNotFoundError:
        pass
    return 0


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


def get_publish_context(payload: dict[str, object]) -> tuple[str, str, str, list[str]]:
    file_name = normalize_post_file_name(str(payload.get("fileName", "")))
    asset_slug = normalize_asset_slug(str(payload.get("assetSlug", "")))
    mode = str(payload.get("mode", "edit")).strip().lower()
    if mode not in {"create", "edit"}:
        mode = "edit"
    return file_name, asset_slug, mode, collect_publish_paths(file_name, asset_slug)


def list_post_documents() -> list[dict[str, object]]:
    if not POSTS_DIR.is_dir():
        raise FileNotFoundError("博客项目缺少 _posts 目录。")

    posts = []
    for target in sorted(POSTS_DIR.glob("*.md")):
        posts.append(
            {
                "fileName": target.name,
                "source": target.read_text(encoding="utf-8"),
                "lastModified": int(target.stat().st_mtime * 1000),
            }
        )
    return posts


def save_post(payload: dict[str, object]) -> dict[str, object]:
    file_name = normalize_post_file_name(str(payload.get("fileName", "")))
    markdown = payload.get("markdown")
    overwrite = bool(payload.get("overwrite", False))
    mode = str(payload.get("mode", "create")).strip().lower()
    if not isinstance(markdown, str) or not markdown.strip():
        raise ValueError("文章内容不能为空。")
    if len(markdown.encode("utf-8")) > MAX_POST_SIZE:
        raise ValueError("文章内容过大，无法保存。")
    if not POSTS_DIR.is_dir():
        raise FileNotFoundError("博客项目缺少 _posts 目录。")

    target = POSTS_DIR / file_name
    if mode == "create" and target.exists() and not overwrite:
        return {
            "ok": False,
            "status": "conflict",
            "message": f"{file_name} 已存在，是否覆盖？",
            "fileName": file_name,
        }

    target.write_text(markdown, encoding="utf-8", newline="\n")
    return {"ok": True, "status": "saved", "fileName": file_name}


def delete_post(payload: dict[str, object]) -> dict[str, object]:
    file_name = normalize_post_file_name(str(payload.get("fileName", "")))
    if not POSTS_DIR.is_dir():
        raise FileNotFoundError("博客项目缺少 _posts 目录。")
    target = POSTS_DIR / file_name
    if not target.exists() or not target.is_file():
        raise FileNotFoundError(f"未找到文章文件 {file_name}。")
    target.unlink()
    return {"ok": True, "message": f"成功删除文章 {file_name}。"}


def sanitize_image_name(original_name: str) -> str:
    original = Path(str(original_name).strip()).name
    extension = Path(original).suffix.lower()
    if not VALID_ASSET_EXTENSION_RE.fullmatch(extension):
        extension = ".png"
    stem = re.sub(r"[^a-z0-9]+", "-", Path(original).stem.lower()).strip("-") or "image"
    return f"{stem}{extension}"


def import_image(payload: dict[str, object]) -> dict[str, object]:
    asset_slug = normalize_asset_slug(str(payload.get("assetSlug", "")))
    file_name = sanitize_image_name(str(payload.get("fileName", "image.png")))
    encoded = payload.get("base64")
    if not isinstance(encoded, str) or not encoded:
        raise ValueError("图片数据为空。")
    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as error:
        raise ValueError("图片数据无效。") from error
    if not image_bytes or len(image_bytes) > MAX_IMAGE_SIZE:
        raise ValueError("图片为空或超过 25 MB 限制。")

    directory = POST_ASSETS_DIR / asset_slug
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / file_name
    suffix = target.suffix
    stem = target.stem
    index = 2
    while target.exists():
        target = directory / f"{stem}-{index}{suffix}"
        index += 1
    target.write_bytes(image_bytes)
    return {
        "ok": True,
        "fileName": target.name,
        "webPath": f"/assets/posts/{asset_slug}/{target.name}",
    }


def path_is_targeted(path: str, targets: list[str]) -> bool:
    return any(path == target or path.startswith(f"{target}/") for target in targets)


def publish_preview(payload: dict[str, object]) -> dict[str, object]:
    file_name, asset_slug, mode, paths = get_publish_context(payload)
    status_result = run_git(["status", "--porcelain", "--", *paths])
    changes = [line.strip() for line in status_result.stdout.splitlines() if line.strip()]
    branch_result = run_git(["branch", "--show-current"], check=False)
    branch = branch_result.stdout.strip() or "(detached HEAD)"
    staged_result = run_git(["diff", "--cached", "--name-only"], check=False)
    staged_paths = [line.strip() for line in staged_result.stdout.splitlines() if line.strip()]
    other_staged_paths = [path for path in staged_paths if not path_is_targeted(path, paths)]

    ahead_count = 0
    upstream_result = run_git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], check=False)
    upstream = upstream_result.stdout.strip() if upstream_result.returncode == 0 else ""
    if upstream:
        ahead_result = run_git(["rev-list", "--count", f"{upstream}..HEAD"], check=False)
        if ahead_result.returncode == 0 and ahead_result.stdout.strip().isdigit():
            ahead_count = int(ahead_result.stdout.strip())

    return {
        "ok": True,
        "status": "ready" if changes else "noop",
        "message": "当前文章没有可发布的 Git 改动。" if not changes else "已准备发布检查。",
        "fileName": file_name,
        "assetSlug": asset_slug,
        "mode": mode,
        "paths": paths,
        "changes": changes,
        "branch": branch,
        "upstream": upstream,
        "aheadCount": ahead_count,
        "otherStagedPaths": other_staged_paths,
    }


def publish_post(payload: dict[str, object]) -> dict[str, object]:
    file_name, _asset_slug, mode, paths = get_publish_context(payload)
    preview = publish_preview(payload)

    if preview["status"] == "noop":
        return {
            "ok": True,
            "status": "noop",
            "message": "当前文章没有可发布的 Git 改动。",
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
            "message": "当前文章没有新的可提交内容。",
            "paths": paths,
        }

    commit_message = build_commit_message(mode, file_name)
    commit_result = run_git(["commit", "--only", "-m", commit_message, "--", *paths], check=False)
    if commit_result.returncode != 0:
        raise RuntimeError((commit_result.stderr or commit_result.stdout or "git commit failed").strip())

    push_result = run_git(["push", "origin", "HEAD"], check=False)
    if push_result.returncode != 0:
        return {
            "ok": False,
            "status": "committed_not_pushed",
            "message": "文章已提交到本地，但推送失败：" + (push_result.stderr or push_result.stdout or "git push failed").strip(),
            "commitMessage": commit_message,
            "paths": staged_files,
        }

    return {
        "ok": True,
        "status": "published",
        "message": "已提交并推送当前文章。",
        "commitMessage": commit_message,
        "paths": staged_files,
    }


class ComposerRequestHandler(SimpleHTTPRequestHandler):
    def __init__(
        self,
        *args,
        request_token: str,
        instance_id: str,
        server_port: int,
        directory: str | None = None,
        **kwargs,
    ):
        self.request_token = request_token
        self.instance_id = instance_id
        self.server_port = server_port
        super().__init__(*args, directory=directory, **kwargs)

    def do_GET(self) -> None:
        if not self.has_allowed_host():
            self.respond_json(HTTPStatus.FORBIDDEN, {"ok": False, "message": "不允许的本地服务主机名。"})
            return

        request_path = urlsplit(self.path).path
        if request_path == "/status":
            self.respond_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "service": "post-composer",
                    "repositoryName": REPO_ROOT.name,
                    "requestToken": self.request_token,
                    "instanceId": self.instance_id,
                },
            )
            return
        if request_path == "/api/posts":
            if not self.has_request_token():
                self.respond_json(HTTPStatus.FORBIDDEN, {"ok": False, "message": "本地服务会话无效，请刷新页面重新连接。"})
                return
            try:
                self.respond_json(HTTPStatus.OK, {"ok": True, "posts": list_post_documents()})
            except Exception as error:  # noqa: BLE001
                self.respond_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "message": str(error)})
            return

        static_path = self.resolve_static_path(request_path)
        if static_path:
            self.serve_static_file(static_path)
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_HEAD(self) -> None:
        if not self.has_allowed_host():
            self.respond_json(HTTPStatus.FORBIDDEN, {"ok": False, "message": "不允许的本地服务主机名。"})
            return
        self.send_error(HTTPStatus.METHOD_NOT_ALLOWED, "Method not allowed")

    def do_POST(self) -> None:
        if not self.has_allowed_host():
            self.respond_json(HTTPStatus.FORBIDDEN, {"ok": False, "message": "不允许的本地服务主机名。"})
            return

        request_path = urlsplit(self.path).path
        if request_path not in {"/api/posts/save", "/api/posts/delete", "/api/images/import", "/publish/preview", "/publish"}:
            self.send_error(HTTPStatus.NOT_FOUND, "Not found")
            return
        if not self.has_request_token() or not self.is_same_origin_json_request():
            self.respond_json(HTTPStatus.FORBIDDEN, {"ok": False, "message": "仅允许本地发帖器发起写入操作。"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length < 0:
            self.respond_json(HTTPStatus.BAD_REQUEST, {"ok": False, "message": "invalid content length"})
            return
        if length > MAX_REQUEST_SIZE:
            self.respond_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"ok": False, "message": "请求内容超过大小限制。"})
            return

        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self.respond_json(HTTPStatus.BAD_REQUEST, {"ok": False, "message": "invalid json payload"})
            return
        if not isinstance(payload, dict):
            self.respond_json(HTTPStatus.BAD_REQUEST, {"ok": False, "message": "invalid json payload"})
            return

        try:
            if request_path == "/api/posts/save":
                result = save_post(payload)
                status = HTTPStatus.CONFLICT if result.get("status") == "conflict" else HTTPStatus.OK
            elif request_path == "/api/posts/delete":
                result = delete_post(payload)
                status = HTTPStatus.OK
            elif request_path == "/api/images/import":
                result = import_image(payload)
                status = HTTPStatus.OK
            elif request_path == "/publish/preview":
                result = publish_preview(payload)
                status = HTTPStatus.OK
            else:
                result = publish_post(payload)
                status = HTTPStatus.OK if result.get("ok") else HTTPStatus.BAD_GATEWAY
            self.respond_json(status, result)
        except ValueError as error:
            self.respond_json(HTTPStatus.BAD_REQUEST, {"ok": False, "message": str(error)})
        except Exception as error:  # noqa: BLE001
            self.respond_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "message": str(error)})

    def has_allowed_host(self) -> bool:
        host = self.headers.get("Host", "").strip().lower()
        return host in {f"127.0.0.1:{self.server_port}", f"localhost:{self.server_port}"}

    def has_request_token(self) -> bool:
        token = self.headers.get(TOKEN_HEADER, "")
        return bool(token) and secrets.compare_digest(token, self.request_token)

    def is_same_origin_json_request(self) -> bool:
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if content_type != "application/json":
            return False
        origin = self.headers.get("Origin")
        host = self.headers.get("Host", "")
        return origin == f"http://{host}"

    def end_headers(self) -> None:
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: http: https:; "
            "connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        )
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

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

    def resolve_static_path(self, request_path: str) -> Path | None:
        normalized = posixpath.normpath(unquote(request_path))

        if normalized in {".", "/"}:
            normalized = "/post-composer.html"

        if normalized.startswith("/assets/"):
            return Path(self._resolve_repo_path(REPO_ROOT / normalized.lstrip("/"), REPO_ROOT / "assets"))

        if normalized in {"/post-composer.html", "/post-composer.css", "/post-composer-app.js", "/post-composer-renderer.js"}:
            return Path(self._resolve_repo_path(TOOLS_DIR / normalized.lstrip("/"), TOOLS_DIR))

        return None

    def serve_static_file(self, target: Path) -> None:
        if not target.exists() or not target.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return

        data = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", self.guess_type(str(target)))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    @staticmethod
    def _resolve_repo_path(target: Path, root: Path) -> str:
        resolved_target = target.resolve()
        resolved_root = root.resolve()
        try:
            common_path = os.path.commonpath([str(resolved_target), str(resolved_root)])
        except ValueError as error:
            raise PermissionError("invalid path") from error

        if common_path != str(resolved_root):
            raise PermissionError("invalid path")

        return str(resolved_target)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--instance-id", default="")
    parser.add_argument("--manage-start", action="store_true")
    parser.add_argument("--manage-stop", action="store_true")
    parser.add_argument("--record-file", default="")
    parser.add_argument("--entry-point", default="post-composer")
    args = parser.parse_args()

    record_file = Path(args.record_file).resolve() if args.record_file else DEFAULT_RECORD_FILE
    if args.manage_start:
        raise SystemExit(manage_start(args.port, record_file, args.entry_point))
    if args.manage_stop:
        raise SystemExit(manage_stop(record_file))

    request_token = secrets.token_urlsafe(32)
    instance_id = args.instance_id or secrets.token_urlsafe(24)
    handler = partial(
        ComposerRequestHandler,
        directory=str(TOOLS_DIR),
        request_token=request_token,
        instance_id=instance_id,
        server_port=args.port,
    )
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
