"""Keep a new review's browser origin across rounds using an on-demand loopback server."""

from __future__ import annotations

import errno
import hashlib
import http.server
import io
import json
import os
from pathlib import Path
import re
import secrets
import select
import subprocess
import sys
import tempfile
import time
from urllib.error import URLError
from urllib.parse import quote, unquote, urlsplit
from urllib.request import urlopen

sys.dont_write_bytecode = True
import add_notes  # pylint: disable=wrong-import-position

try:
    import fcntl
except ImportError:  # Windows uses file reviews, without the Unix preview worker.
    fcntl = None

HOST = "127.0.0.1"
STATE_DIR = Path.home() / "Library" / "Application Support" / "human-feedback" / "reviews"
IDLE = 24 * 60 * 60
START_TIMEOUT = 5
PORT_TRIES = 5
TOKEN = re.compile(r"[0-9a-f]{32}")
SIDECAR = re.compile(r"\..+\.(?:received|prev|done)\.js")
ASSET_REF = re.compile(r"""(?:\b(?:src|href|poster)\s*=\s*|\burl\(\s*)["']?([^"'\s)<>]+)""", re.I)
TAG_START = b'<!-- human-feedback --><script '
LAYER_SRC = ('src="' + add_notes.ASSET.as_uri() + '"').encode()
HTML_SUFFIXES = (".html", ".htm", ".xhtml")


def marker(page: Path) -> Path:
    """The first round's sidecar marks reviews eligible for an automatic preview."""
    return add_notes.dot_file(page, "local-review")


def saved_address(first: Path) -> Path:
    key = hashlib.sha256(os.fsencode(first)).hexdigest()
    return STATE_DIR / (key + ".json")


def origin(port: int, token: str) -> str:
    return f"http://{HOST}:{port}/{token}/"


def narrow_root(root: Path) -> bool:
    """Avoid serving broad directories even when the review page itself is inside one."""
    home = Path.home().resolve()
    workspace = (home / "Workspace").resolve()
    if root == workspace or root in workspace.parents or root.parent == workspace:
        return False
    if root == home or root.parent == home or any(part.startswith(".") for part in root.parts):
        return False
    temp_roots = {Path(tempfile.gettempdir()).resolve(), Path("/tmp").resolve()}
    return root not in temp_roots and root != add_notes.git_top(root) and not root.is_mount()


def compatible(page: Path, root: Path) -> bool:
    """Skip automatic HTTP for pages with explicit file URLs or assets outside the review folder."""
    text = page.read_text(encoding="utf-8").replace((TAG_START + LAYER_SRC).decode(), "")
    if re.search(r"<base\b", text, re.I):
        return False
    for ref in ASSET_REF.findall(text):
        if ref.lower().startswith("file:") or ref.startswith("/") and not ref.startswith("//"):
            return False
        if ref.startswith("../"):
            path = page.parent / unquote(urlsplit(ref).path)
            if not path.resolve().is_relative_to(root):
                return False
    return True


def ready(port: int, token: str) -> bool:
    """Check this review's worker, without accepting a different process on the port."""
    try:
        with urlopen(origin(port, token) + "@ready", timeout=1) as response:
            return response.read(33) == token.encode()
    except (URLError, OSError):
        return False


class PortInUse(ValueError):
    """The local review's port is in use by another service."""


def start(root: Path, token: str, port: int) -> int:
    """Start a detached worker and receive the port after it is listening."""
    args = [sys.executable, str(Path(__file__).resolve()), str(root), token, str(port)]
    process = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL, start_new_session=True)
    with process.stdout as output:
        if select.select([output], [], [], START_TIMEOUT)[0]:
            result = output.readline().strip()
            if result.isdigit():
                return int(result)
            if result == b"busy":
                process.wait()
                raise PortInUse(f"the local review's saved port {port} is in use")
    process.terminate()
    process.wait()
    raise ValueError(f"couldn't start the local review server on port {port}")


def new_port(root: Path, token: str) -> int:
    """Reserve distinct storage origins even when earlier reviews' workers have stopped."""
    reserved = set()
    for path in STATE_DIR.glob("*.json"):
        try:
            reserved.add(json.loads(path.read_text(encoding="utf-8"))["port"])
        except (OSError, ValueError, KeyError, TypeError):
            continue
    ports = sorted(set(range(49152, 65536)) - reserved)
    for _ in range(min(PORT_TRIES, len(ports))):
        port = secrets.choice(ports)
        try:
            return start(root, token, port)
        except PortInUse:
            ports.remove(port)
    raise ValueError("no local review port was available")


def preview(page: Path, siblings: set[str]) -> str | None:
    """Get the address for an eligible review. Existing file reviews keep their address."""
    if fcntl is None:
        return None
    attrs = add_notes.read_tag(page.read_text(encoding="utf-8"))
    versions = add_notes.load_set(page, attrs)
    first = versions[0]["path"] if versions else page
    try:
        mode = marker(first).read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return None
    root = first.parent
    state_path = saved_address(first)
    pages = {page, *(Path(sibling) for sibling in siblings)}
    fits = narrow_root(root) and all(p.is_relative_to(root) and compatible(p, root) for p in pages if p.is_file())
    if mode == "http" and not state_path.exists():
        raise ValueError("the saved local review address is missing")
    if not state_path.exists() and (not fits or attrs.get("src") != add_notes.ASSET.as_uri()
                                    or any(add_notes.dot_file(p, "shown").exists() for p in pages)):
        return None
    STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (STATE_DIR / "addresses.lock").open("a", encoding="utf-8") as locked:
        fcntl.flock(locked, fcntl.LOCK_EX)
        if not state_path.exists():
            token = secrets.token_hex(16)
            port = new_port(root, token)
            add_notes.write_sidecar(state_path, json.dumps({"port": port, "token": token}) + "\n")
            add_notes.write_sidecar(marker(first), "http\n")
        else:
            state = json.loads(state_path.read_text(encoding="utf-8"))
            if not isinstance(state, dict):
                raise ValueError("the saved local review address is invalid")
            port, token = state.get("port"), state.get("token")
            if type(port) is not int or not 1 <= port <= 65535 or not isinstance(token, str) or not TOKEN.fullmatch(token):
                raise ValueError("the saved local review address is invalid")
            if not fits:
                raise ValueError("this round uses files outside its local review folder. Use relative paths to assets inside it")
            if not ready(port, token) and start(root, token, port) != port:
                raise ValueError("the local review server did not reuse its saved address")
    return origin(port, token) + quote(page.relative_to(root).as_posix())


class ReviewServer(http.server.ThreadingHTTPServer):
    """Serve one review folder for as long as its local pages are being used."""

    request_queue_size = 64
    timeout = 60

    def __init__(self, root: Path, token: str, port: int):
        self.root = root
        self.token = token
        self.last_request = time.monotonic()
        super().__init__((HOST, port), ReviewHandler)

    def serve_until_idle(self):
        while time.monotonic() - self.last_request < IDLE:
            self.handle_request()


class ReviewHandler(http.server.SimpleHTTPRequestHandler):
    """Serve static files without directory listings, symlink escapes or caching."""

    def log_message(self, *_args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def file_path(self, relative: str) -> Path | None:
        parts = Path(relative).parts
        if not parts or any(part.startswith(".") for part in parts[:-1]):
            return None
        if parts[-1].startswith(".") and not SIDECAR.fullmatch(parts[-1]):
            return None
        root = self.server.root
        if "\0" in relative:
            return None
        path = (root / relative).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            return None
        # A symlink must not make a hidden file reachable under a visible name.
        if path != root / relative and any(part.startswith(".") for part in path.relative_to(root).parts):
            return None
        return path

    def send_head(self):
        server = self.server
        prefix = f"/{server.token}/"
        request = self.path.split("?", 1)[0]
        if self.headers.get("Host") != f"{HOST}:{server.server_port}" or not request.startswith(prefix):
            self.send_error(404)
            return None
        relative = unquote(request[len(prefix):])
        if relative == "@ready":
            return self.send_content(io.BytesIO(server.token.encode()), "text/plain", len(server.token))

        path = add_notes.ASSET if relative == "@layer.js" else self.file_path(relative)
        if path is None:
            self.send_error(404)
            return None
        try:
            if path.suffix.lower() in HTML_SUFFIXES:
                src = f'src="{prefix}@layer.js" data-local-review="1"'.encode()
                body = path.read_bytes().replace(TAG_START + LAYER_SRC, TAG_START + src)
                return self.send_content(io.BytesIO(body), self.guess_type(str(path)), len(body))
            stream = path.open("rb")
            return self.send_content(stream, self.guess_type(str(path)), os.fstat(stream.fileno()).st_size)
        except OSError:
            self.send_error(404)
            return None

    def send_content(self, stream, content_type: str, length: int):
        self.server.last_request = time.monotonic()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.end_headers()
        return stream


def main() -> None:
    root, token, port = sys.argv[1:]
    try:
        server = ReviewServer(Path(root), token, int(port))
    except OSError as exc:
        if exc.errno != errno.EADDRINUSE:
            raise
        print("busy", flush=True)
        return
    with server:
        print(server.server_port, flush=True)
        server.serve_until_idle()


if __name__ == "__main__":
    main()
