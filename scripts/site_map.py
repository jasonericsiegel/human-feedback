"""Which local page a published URL is a copy of.

A site root (a folder) served at a URL prefix: `https://example.com/<slug>/<file without .html>` is the file
`<root>/<slug>/<file>.html`, `/<slug>/` is its index.html. show.py uses this so showing the URL counts as showing the
local page.

The pairs come from $HUMAN_FEEDBACK_SITE_MAP (`prefix=root`, several separated by `;`), else from site_map.json beside
this file (a list of {"url": prefix, "root": folder}). A URL that matches no pair, or whose file doesn't exist, maps to None.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit

ENV = "HUMAN_FEEDBACK_SITE_MAP"
CONFIG = Path(__file__).resolve().parent / "site_map.json"


def pairs() -> list[tuple[str, Path]]:
    """(URL prefix ending in /, root folder) for each site, longest prefix first."""
    found: list[tuple[str, str]] = []
    if os.environ.get(ENV):
        for item in os.environ[ENV].split(";"):
            prefix, _, root = item.partition("=")
            if prefix.strip() and root.strip():
                found.append((prefix.strip(), root.strip()))
    else:
        try:
            for item in json.loads(CONFIG.read_text(encoding="utf-8")):
                found.append((str(item["url"]), str(item["root"])))
        except (OSError, ValueError, KeyError, TypeError):
            pass
    out = [(p if p.endswith("/") else p + "/", Path(r).expanduser()) for p, r in found]
    return sorted(out, key=lambda x: -len(x[0]))


def local_page(url: str) -> Path | None:
    """The local file a published page's URL is a copy of, when it exists."""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        return None
    here = parts._replace(query="", fragment="").geturl()
    for prefix, root in pairs():
        if here + "/" == prefix:
            here += "/"
        if not here.startswith(prefix):
            continue
        rel = unquote(here[len(prefix):])
        if ".." in rel.split("/"):
            return None
        if rel == "" or rel.endswith("/"):
            rel += "index.html"
        elif not Path(rel).suffix:
            rel += ".html"
        page = root / rel
        return page.resolve() if page.is_file() else None
    return None
