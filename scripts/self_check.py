#!/usr/bin/env python3
"""Check whether human-feedback can save and open a test page here.

    python3 self_check.py [--force]

Prints one plain message: 0 when opened or already checked, 1 when opening failed,
2 when a file couldn't be written. A passed check is remembered in the user's home.
"""

from __future__ import annotations

import argparse
from contextlib import redirect_stderr, redirect_stdout
import io
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True   # importing siblings must leave no cache in the shipped skill
import add_notes  # noqa: E402  pylint: disable=wrong-import-position
import show  # noqa: E402  pylint: disable=wrong-import-position

PAGE = """<!doctype html><html><head><title>human-feedback self-check</title></head><body>
<section data-note><h1>human-feedback self-check</h1>
<p>human-feedback is working here. You can close this tab.</p></section>
</body></html>
"""


def main(argv=None) -> int:
    """Ready and open a disposable page, remembering only a successful check."""
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--force", action="store_true", help="run again even after a passed check")
    args = ap.parse_args(sys.argv[1:] if argv is None else argv)
    marker = Path.home() / ".human-feedback" / "self-check-passed"
    try:
        checked = marker.exists()
    except OSError:
        checked = False
    if checked and not args.force:
        print("human-feedback: already checked here.")
        return 0

    try:
        page = Path(tempfile.mkdtemp(prefix="human-feedback-self-check-")) / "self-check.html"
        page.write_text(PAGE, encoding="utf-8")
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            add_notes.main([str(page), "--pictures", "off", "--hold"], analytics_url="")
    except OSError:
        print("human-feedback can't work in this mode because it can't save files here. "
              "In the Claude desktop app, open the Code tab and pick a Local session. "
              "In the ChatGPT desktop app, switch to Codex and keep it on Local.")
        return 2

    output, errors = io.StringIO(), io.StringIO()
    try:
        with redirect_stdout(output), redirect_stderr(errors):
            code = show.main([str(page)])
    except Exception as exc:  # pylint: disable=broad-except
        why = str(exc) or type(exc).__name__
    else:
        why = (errors.getvalue().strip() or output.getvalue().strip() or f"show.py exited {code}") if code else ""
    if why:
        reason = "; ".join(why.splitlines())
        print("human-feedback can make pages here but couldn't open your browser: "
              f"{reason}. Open this file yourself to check it: {page}")
        return 1

    try:
        version = add_notes.skill_version()
        if version:
            marker.parent.mkdir(parents=True, exist_ok=True)
            marker.write_text(version + "\n", encoding="utf-8")
    except OSError:
        pass
    print("human-feedback works here. A test page just opened in your browser.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
