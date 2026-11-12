#!/usr/bin/env python3
"""Show a page in the user's browser without changing the tab they're on.

    python3 show.py [--browser "Google Chrome"] [--reopen] [--front] <page.html | http(s) or file URL>

The one way to put a page in front of the user, for any page. With the browser running and a window open:
- a tab already showing the page is reloaded in place;
- else a tab showing another version of it (from the page's data-versions) is pointed at the page;
- else the page goes in a new tab at the end of the front window, whose active tab is put back at once, so the
  tab the user is reading stays in front.
It never makes a tab active while the browser is the app in front (the user may be reading another tab), and never
brings a window forward, unless --front. With another app in front, the page's tab is made the active tab of its
window, so it's what the user sees on switching to the browser; the browser itself stays behind. A page the user closed stays closed until there's a new
draft: shown before at this round (a hidden .<page file>.shown beside it) and now in no tab, nor any of its versions,
it isn't opened again (a receipt, a reply or Done on the same draft is no reason to); --reopen opens it anyway, for when
the user asks to see it. With the browser running but no window open, or not
running, it runs `open -g -a <browser> <page>`, which shows the page without bringing the browser forward. If the
tabs can't be read (no Automation permission, a browser without Chrome's AppleScript), it runs that `open` too,
which may make a second tab, and says so.

A URL that site_map.py maps to a local page (a published copy: see site_map.json) is shown as that URL, and recorded and
kept closed as the local page. For a local file served over HTTP, pass its address with --preview-url:
the file's registered versions are resolved relative to that address, so the older preview tab is reused.
New local reviews can use a loopback preview automatically, keeping their browser address across rounds.

A web address is checked first: one that is not found (404, 410) or whose site can't be reached is not opened, and it
exits 1 saying why. A login page, a server error or a slow reply still opens. --no-check skips the check.

Prints one line saying what it did and where the page is. Exits 0 once the page is shown or left closed, 1 when it couldn't be
shown, 2 on bad usage.

--front is for a page the user must act on now (a step handed to them, like a settings page to click through): the
page's tab is made active, its window is un-minimized and raised, and the browser is brought in front of other apps.
It then lists the windows again and exits 1 unless that tab is the active tab of the front, on-screen window. It
implies --reopen.

On macOS, --browser defaults to $HUMAN_FEEDBACK_BROWSER, else Google Chrome. Tabs are found through Chrome's AppleScript, so
Chrome, its Beta, Dev and Canary, Chrome for Testing and Chromium reuse tabs; another browser gets the `open`.
The browser may ask once to let the terminal control it (System Settings > Privacy & Security > Automation).
On other systems, the default browser is asked to open the URL. Named macOS apps, tab reuse and foreground
verification are not available. --front requests focus but exits 1 because the foreground cannot be checked.

A second copy of the browser's app running for an agent (headless, or on its own --user-data-dir, like a test
browser on a debugging port) takes the AppleScript instead of the user's own window: `tell application` reached the
agent's headless copy on 2026-11-09, so show.py reported a reloaded tab the user never saw. With such a copy running,
show.py reads and changes no tabs. It hands the page to the browser's own program, which passes it to the user's
running copy as a new tab, and says it couldn't check the tab; --front then exits 1, since it can't check the front.
"""

from __future__ import annotations

import argparse
import os
import plistlib
import subprocess
import sys
import webbrowser
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote, unquote, urljoin, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True   # this folder ships to agents: a run never leaves a __pycache__ in it
import add_notes  # noqa: E402  pylint: disable=wrong-import-position
import local_review  # noqa: E402  pylint: disable=wrong-import-position
import site_map  # noqa: E402  pylint: disable=wrong-import-position

DEFAULT_BROWSER = "Google Chrome"
BROWSER_ENV = "HUMAN_FEEDBACK_BROWSER"
TIMEOUT = 20          # seconds for one AppleScript call or `open`
PAGE_SUFFIXES = (".html", ".htm", ".xhtml")
CHECK_TIMEOUT = 8     # seconds for the check that a web address loads
GONE = (404, 410)     # statuses that mean the address is wrong; anything else (a login, a 500) still opens

# Each script names the browser as APP_NAME, replaced with its quoted name before it runs. The listing checks the
# browser is running first, since a `tell` block would launch it.
LIST_TABS = """
on run argv
  if not (application APP_NAME is running) then return "not running"
  set sep to character id 9
  set out to ""
  tell application APP_NAME
    set wins to windows
    repeat with i from 1 to count of wins
      set w to item i of wins
      set wid to id of w
      set out to out & "W" & sep & wid & sep & i & sep & (mode of w) & sep & (minimized of w) & sep & (visible of w) & sep & (active tab index of w) & linefeed
      set tids to id of tabs of w
      set urls to URL of tabs of w
      repeat with j from 1 to count of tids
        set out to out & "T" & sep & wid & sep & (item j of tids) & sep & j & sep & (item j of urls) & linefeed
      end repeat
    end repeat
  end tell
  return out
end run
"""
# Reload a tab, or point it at newUrl, in place: its window's active tab stays as it was. Returns the tab's place.
SHOW_TAB = """
on run {wid, tid, newUrl}
  tell application APP_NAME
    set w to window id (wid as integer)
    set tids to id of tabs of w
    repeat with j from 1 to count of tids
      if ((item j of tids) as text) is tid then
        if newUrl is "" then
          reload tab j of w
        else
          set URL of tab j of w to newUrl
        end if
        return j
      end if
    end repeat
  end tell
  return 0
end run
"""
# A new tab at the end of a window. Chrome makes a new tab active, so the window's active tab is put back in the
# same script, one Apple event later. Returns the new tab's place.
ADD_TAB = """
on run {wid, newUrl}
  tell application APP_NAME
    set w to window id (wid as integer)
    set prev to active tab index of w
    make new tab at end of tabs of w with properties {URL:newUrl}
    set active tab index of w to prev
    return count of tabs of w
  end tell
end run
"""
# Make one tab the active tab of its window, and nothing else: no window raised, the browser not brought forward.
# Run only while another app is in front of the browser.
SELECT_TAB = """
on run {wid, place}
  tell application APP_NAME
    set active tab index of window id (wid as integer) to (place as integer)
  end tell
  return "ok"
end run
"""
# Bring one tab in front of the user: its window un-minimized, raised to the front, the tab made active, the browser
# brought in front of other apps. Only --front runs it.
FRONT_TAB = """
on run {wid, place}
  tell application APP_NAME
    set w to window id (wid as integer)
    if minimized of w then set minimized of w to false
    set active tab index of w to (place as integer)
    set index of w to 1
    activate
  end tell
  return "ok"
end run
"""


def key(url: str) -> str:
    """A URL without its #fragment or ?query; a file:// URL as the resolved path it names."""
    parts = urlsplit(url)
    if parts.scheme == "file":
        return str(Path(urllib.request.url2pathname(parts.path)).resolve())
    return parts._replace(query="", fragment="").geturl()


def versions(path: Path) -> set[str]:
    """The paths of every version in a page's data-versions; empty for a page without them, or not HTML."""
    if path.suffix.lower() not in PAGE_SUFFIXES:
        return set()
    try:
        attrs = add_notes.read_tag(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError):
        return set()
    return {str(e["path"]) for e in add_notes.load_set(path, attrs)}


def targets(page: str) -> tuple[str, str, set[str]]:
    """The URL to show, its key, and the keys of the page's other versions. FileNotFoundError for a missing file."""
    parts = urlsplit(page)
    if parts.scheme in ("http", "https"):
        return page, key(page), set()
    path = Path(urllib.request.url2pathname(parts.path) if parts.scheme == "file" else page).expanduser().resolve()
    if not path.exists():
        raise FileNotFoundError(str(path))
    url = page if parts.scheme == "file" else path.as_uri()
    return url, str(path), versions(path) - {str(path)}


def preview_targets(url: str, source: Path, siblings: set[str]) -> tuple[str, set[str]]:
    """Resolve the source file's registered versions on the same preview server."""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname or unquote(parts.path.rsplit("/", 1)[-1]) != source.name:
        raise ValueError("--preview-url must be the HTTP(S) address of this HTML file")
    return key(url), {key(urljoin(url, quote(os.path.relpath(sibling, source.parent)))) for sibling in siblings}


def pick(tabs: list[tuple], want: str, others: set[str]) -> tuple[str, str, bool] | None:
    """(window id, tab id, reload?) for the tab to reuse: one showing the page, else one showing a version.
    Each tab is (window id, tab id, URL, ...)."""
    for tab in tabs:
        if key(tab[2]) == want:
            return tab[0], tab[1], True
    for tab in tabs:
        if key(tab[2]) in others:
            return tab[0], tab[1], False
    return None


def quoted(name: str) -> str:
    """An AppleScript string literal."""
    return '"' + name.replace("\\", "\\\\").replace('"', '\\"') + '"'


def osa(script: str, browser: str, *args: str) -> subprocess.CompletedProcess:
    """Run one of the scripts above against the browser."""
    return subprocess.run(["osascript", "-e", script.replace("APP_NAME", quoted(browser)), *args],
                          capture_output=True, text=True, timeout=TIMEOUT, check=False)


def running(browser: str) -> bool:
    """Whether the browser is running, asked of LaunchServices (which AppleScript uses), else of the process list."""
    try:
        found = subprocess.run(["lsappinfo", "find", f"name={browser}"], capture_output=True, text=True,
                               timeout=5, check=False)
        if found.returncode == 0:
            return bool(found.stdout.strip())
    except (OSError, subprocess.TimeoutExpired):
        pass
    try:
        return subprocess.run(["pgrep", "-x", browser], capture_output=True, timeout=5, check=False).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def parse_listing(text: str) -> tuple[list[dict], list[tuple]]:
    """LIST_TABS' output as windows ({id, place, mode, minimized, visible, active}) and tabs
    (window id, tab id, URL, place), both front to back."""
    windows, tabs = [], []
    for line in text.splitlines():
        cells = line.split("\t")
        if cells[0] == "W" and len(cells) >= 7:
            windows.append({"id": cells[1], "place": int(cells[2]), "mode": cells[3],
                            "minimized": cells[4] == "true", "visible": cells[5] != "false",
                            "active": int(cells[6]) if cells[6].isdigit() else 0})
        elif cells[0] == "T" and len(cells) >= 5:
            tabs.append((cells[1], cells[2], "\t".join(cells[4:]), int(cells[3])))
    return windows, tabs


def front_window(windows: list[dict]) -> dict | None:
    """The window a new tab goes in: the frontmost ordinary window that's on screen, else one that isn't minimized,
    and a minimized one only when every window is minimized."""
    normal = [w for w in windows if w["mode"] == "normal"]
    for good in (lambda w: w["visible"] and not w["minimized"], lambda w: not w["minimized"], lambda w: True):
        for w in normal:
            if good(w):
                return w
    return None


def where(place: int, window: dict | None) -> str:
    """'tab 3 of the front window' and the like; says so when that window is minimized or not on screen."""
    if window and window["minimized"]:
        return f"tab {place} of a minimized window (window {window['place']} from the front), not on screen"
    if window and not window["visible"]:
        return f"tab {place} of window {window['place']} from the front, which Chrome reports as not on screen"
    if not window or window["place"] == 1:
        return f"tab {place} of the front window"
    return f"tab {place} of window {window['place']} from the front"


def instances(browser: str) -> list[dict]:
    """Every running copy of the browser's app, from LaunchServices: {pid, background, exe, bundle, args}."""
    try:
        done = subprocess.run(["lsappinfo", "list"], capture_output=True, text=True, timeout=5, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return []
    found, current = [], None
    for line in done.stdout.splitlines():
        head = line.strip()
        if ") \"" in head and "ASN:" in head and head.split(")", 1)[0].isdigit():
            name = head.split('"')[1] if head.count('"') >= 2 else ""
            current = {"pid": 0, "background": False, "exe": "", "bundle": "", "args": ""} if name == browser else None
            if current is not None:
                found.append(current)
        elif current is not None:
            if head.startswith("pid = ") and head[6:].split(" ", 1)[0].isdigit():
                current["pid"] = int(head[6:].split(" ", 1)[0])
                current["background"] = 'type="BackgroundOnly"' in head
            elif head.startswith('executable path="'):
                current["exe"] = head.split('"')[1]
            elif head.startswith('bundle path="'):
                current["bundle"] = head.split('"')[1]
    for inst in found:
        if inst["pid"]:
            try:
                inst["args"] = subprocess.run(["ps", "-o", "command=", "-p", str(inst["pid"])], capture_output=True,
                                              text=True, timeout=5, check=False).stdout.strip()
            except (OSError, subprocess.TimeoutExpired):
                pass
    return [i for i in found if i["pid"]]


def stray(inst: dict) -> bool:
    """A copy run for an agent, not the user's own: headless, background-only, or on its own --user-data-dir."""
    return inst["background"] or "--headless" in inst["args"] or "--user-data-dir" in inst["args"]


def strays(browser: str) -> list[dict]:
    """The agent copies of the browser running now; AppleScript to the browser may reach one of them."""
    return [i for i in instances(browser) if stray(i)]


def program(insts: list[dict]) -> str:
    """The browser's own program file: a user copy's executable, else the one its app bundle names."""
    for inst in sorted(insts, key=stray):
        if inst["exe"]:
            return inst["exe"]
    for inst in insts:
        try:
            with open(Path(inst["bundle"]) / "Contents" / "Info.plist", "rb") as fh:
                return str(Path(inst["bundle"]) / "Contents" / "MacOS" / plistlib.load(fh)["CFBundleExecutable"])
        except (OSError, KeyError, ValueError, plistlib.InvalidFileException):
            continue
    return ""


def hand_over(browser: str, url: str, found: list[dict], front: bool = False) -> int:
    """Give the page to the browser's own program, which passes it to the user's running copy as a new tab (Chrome's
    one-copy-per-profile rule), without AppleScript, which another copy may take. Can't check the tab."""
    others = ", ".join(f"pid {i['pid']}" for i in found)
    exe = program(instances(browser) or found)
    if not exe:
        print(f"human-feedback: another copy of {browser} is running for an agent ({others}), so tab checks would "
              f"reach it, and {browser}'s program file couldn't be found", file=sys.stderr)
        return 1
    try:
        subprocess.Popen([exe, url], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,  # pylint: disable=consider-using-with
                         stderr=subprocess.DEVNULL, start_new_session=True)
    except OSError as exc:
        print(f"human-feedback: couldn't hand it to {browser}: {exc}", file=sys.stderr)
        return 1
    said = (f"another copy of {browser} is running for an agent ({others}; headless or on its own profile), and tab "
            f"checks would reach it instead of the user's window. Handed the page to {browser}'s own program, which "
            "opens it as a new tab in the user's window (it may come to the front). Couldn't check which tab it is")
    if front:
        print(f"human-feedback: NOT checked in front of the user: {said}", file=sys.stderr)
        return 1
    print(f"human-feedback: {said}")
    return 0


def launch(browser: str, target: str, said: str, front: bool = False) -> int:
    """`open -g -a <browser> <target>`: shows the page without bringing the browser forward; with front, plain
    `open -a`, which brings it forward."""
    if front:
        said = said.replace("in the background", "in front").replace("`open -g`", "`open`")
    try:
        done = subprocess.run(["open", *([] if front else ["-g"]), "-a", browser, target], capture_output=True, text=True,
                              timeout=TIMEOUT, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        print(f"human-feedback: couldn't open {browser}: {exc}", file=sys.stderr)
        return 1
    if done.returncode:
        print(f"human-feedback: couldn't open {browser}: {done.stderr.strip()}", file=sys.stderr)
        return 1
    print(f"human-feedback: {said}")
    return 0


def launch_default(url: str, front: bool = False) -> int:
    """Ask the platform's default browser to open a URL; its tabs and foreground are not checked."""
    try:
        opened = webbrowser.open(url, new=2, autoraise=front)
    except (OSError, webbrowser.Error) as exc:
        print(f"human-feedback: couldn't open your default browser: {exc}", file=sys.stderr)
        return 1
    if not opened:
        print(f"human-feedback: couldn't open your default browser. Open this address yourself: {url}",
              file=sys.stderr)
        return 1
    print(f"human-feedback: asked your default browser to open {url}; its tab and window were not checked")
    if front:
        print("NOT in front of the user: the default browser was asked to come forward, but human-feedback "
              "cannot check its window on this platform", file=sys.stderr)
        return 1
    return 0


def reuse(browser: str, tabs: list[tuple], windows: list[dict], found: tuple, url: str) -> tuple[str, int] | None:
    """Reload the found tab, or point it at url, in place; (window id, tab place), or None when that failed."""
    wid, tid, same = found
    old = next(t[2] for t in tabs if t[0] == wid and t[1] == tid)
    done = osa(SHOW_TAB, browser, wid, tid, "" if same else url)
    out = done.stdout.strip()
    if done.returncode or not out.isdigit() or out == "0":
        print(f"human-feedback: can't reuse the tab: {done.stderr.strip() or 'it closed'}", file=sys.stderr)
        return None
    spot = where(int(out), next((w for w in windows if w["id"] == wid), None))
    if same:
        print(f"human-feedback: reloaded the tab that had it ({spot}); the tab in front didn't change")
    else:
        print(f"human-feedback: switched the tab showing {Path(key(old)).name} to this version ({spot}); "
              "the tab in front didn't change")
    return wid, int(out)


def add(browser: str, window: dict, url: str) -> tuple[str, int] | None:
    """A background tab at the end of the window, its active tab put back; (window id, tab place), or None."""
    done = osa(ADD_TAB, browser, window["id"], url)
    if done.returncode or not done.stdout.strip().isdigit():
        print(f"human-feedback: can't add a tab: {done.stderr.strip()}", file=sys.stderr)
        return None
    print(f"human-feedback: added it in the background as {where(int(done.stdout.strip()), window)}; "
          "the tab in front didn't change")
    return window["id"], int(done.stdout.strip())


def frontmost_app() -> str:
    """The name of the app in front, from LaunchServices; '' when it can't be had."""
    try:
        front = subprocess.run(["lsappinfo", "front"], capture_output=True, text=True, timeout=5, check=False)
        info = subprocess.run(["lsappinfo", "info", front.stdout.strip()], capture_output=True,
                              text=True, timeout=5, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return ""
    # first line: "Google Chrome" ASN:0x0-0x1234: (in front)
    first = info.stdout.strip().splitlines()[0] if info.stdout.strip() else ""
    return first.split('"')[1] if first.startswith('"') and first.count('"') >= 2 else ""


def bring_front(browser: str, wid: str, place: int) -> int:
    """--front: raise the tab, then check it from a fresh listing; 0 when it's in front of the user, else 1."""
    done = osa(FRONT_TAB, browser, wid, str(place))
    if done.returncode:
        print(f"human-feedback: couldn't bring it to the front: {done.stderr.strip()}", file=sys.stderr)
        return 1
    got = listing(browser)
    if isinstance(got, str):
        print(f"human-feedback: brought it forward but can't check it ({got})", file=sys.stderr)
        return 1
    windows, _tabs = got
    w = next((w for w in windows if w["id"] == wid), None)
    problems = []
    if w is None:
        problems.append("its window is gone")
    else:
        if w["place"] != 1:
            problems.append(f"its window is {w['place']} from the front")
        if w["minimized"] or not w["visible"]:
            problems.append("its window is minimized or not on screen")
        if w["active"] != place:
            problems.append(f"tab {w['active']} is active, not tab {place}")
    app = frontmost_app()
    if app and app != browser:
        problems.append(f"{app} is in front of {browser}")
    if problems:
        print(f"human-feedback: NOT in front of the user: {'; '.join(problems)}", file=sys.stderr)
        return 1
    print(f"human-feedback: brought it to the front: the active tab (tab {place}) of {browser}'s front window, "
          f"with {browser} in front{'' if app else ' (front app not checked)'}")
    return 0


def select_if_away(browser: str, app: str, wid: str, place: int) -> None:
    """With another app (app, read before the page was shown) in front of the browser, make the page's tab its
    window's active tab, so it's what the user sees on switching back; with the browser in front, or the front app
    unknown, leave the active tab alone."""
    if not app or app == browser:
        return
    done = osa(SELECT_TAB, browser, wid, str(place))
    if done.returncode:
        print(f"human-feedback: couldn't select its tab: {done.stderr.strip()}", file=sys.stderr)
        return
    print(f"human-feedback: {app} was in front, so made it the selected tab of its window; {browser} stayed behind")


def listing(browser: str) -> tuple[list[dict], list[tuple]] | str:
    """The browser's windows and tabs, or why they can't be had: 'not running', or the error."""
    try:
        done = osa(LIST_TABS, browser)
    except subprocess.TimeoutExpired:
        return "timed out"
    if done.returncode:
        return done.stderr.strip() or f"osascript exited {done.returncode}"
    if done.stdout.strip() == "not running":
        return "not running"
    return parse_listing(done.stdout)


def draft(path: Path) -> str:
    """The page's draft, as its round: a new version is a new file, and --next-round a new round of the same file."""
    try:
        attrs = add_notes.read_tag(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError):
        return ""
    return str(add_notes.last_round(path, attrs))


def shown_file(path: Path) -> Path:
    """The hidden file beside the page that remembers the draft last shown."""
    return add_notes.dot_file(path, "shown")


def closed(path: Path | None) -> bool:
    """Whether this draft was shown before: in no tab now, the user closed it."""
    if path is None:
        return False
    try:
        return shown_file(path).read_text(encoding="utf-8").strip() == draft(path)
    except OSError:
        return False


def remember(path: Path | None) -> None:
    """Note the draft as shown."""
    if path is None:
        return
    try:
        add_notes.write_sidecar(shown_file(path), draft(path) + "\n")
    except OSError:
        pass


def left_closed(path: Path) -> int:
    """Say the page stays closed."""
    print(f"human-feedback: left it closed: its tab was closed since this draft was shown, so it opens again with the "
          f"next draft (--reopen to open it now): {path}")
    return 0


def bare(path: Path) -> bool:
    """Whether a local HTML page has no notes tag yet."""
    if path.suffix.lower() not in PAGE_SUFFIXES:
        return False
    try:
        return add_notes.TAG.search(path.read_text(encoding="utf-8")) is None
    except (OSError, UnicodeDecodeError):
        return False


def held_bare(path: Path) -> int:
    """Say the page wasn't shown: an agent's HTML reaches the user with notes on. 0, so a `|| open` fallback stays quiet."""
    print(f"human-feedback: not shown: this page has no notes layer. Add it first (add_notes.py <page> --agent \"<you>\"), "
          f"then run show.py again; pass --plain only for a page you didn't make: {path}")
    return 0


def dead(url: str, opener=urllib.request.urlopen) -> str | None:
    """Why a web address won't load (not found, or the site can't be reached), else None. A page behind a login,
    a server error or a slow site isn't dead: those still open."""
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh) human-feedback/show.py"}
    for method in ("HEAD", "GET"):            # some sites refuse HEAD; GET settles it
        try:
            with opener(urllib.request.Request(url, method=method, headers=headers), timeout=CHECK_TIMEOUT):
                return None
        except urllib.error.HTTPError as exc:
            if exc.code in GONE:
                return f"not found (HTTP {exc.code})"
            if exc.code != 405:
                return None
        except urllib.error.URLError as exc:
            if isinstance(exc.reason, TimeoutError):
                return None
            return f"can't reach the site ({exc.reason})"
        except (TimeoutError, OSError, ValueError):
            return None
    return None


def show(page: str, browser: str, reopen: bool = False, plain: bool = False,  # pylint: disable=too-many-arguments,too-many-positional-arguments
         front: bool = False, check: bool = True, *, preview_url: str | None = None) -> int:
    """Show the page; 0 when it's shown, left closed until its next draft, or held back for its notes layer."""
    scheme = urlsplit(page).scheme
    web_page = scheme in ("http", "https")
    try:
        url, want, others = targets(page)
        # A published copy is remembered as its local page. A preview also uses the
        # local version list to find earlier rounds on the same server.
        path = site_map.local_page(page) if web_page else Path(want)
        untagged = not plain and not web_page and bare(path)
        automatic = None
        if not (scheme or plain or untagged or preview_url) and path.suffix.lower() in PAGE_SUFFIXES:
            automatic = local_review.preview(path, others)
        preview_url = preview_url or automatic
        if preview_url is not None:
            if web_page or path.suffix.lower() not in PAGE_SUFFIXES:
                raise ValueError("--preview-url needs a local HTML file as the page argument")
            want, others = preview_targets(preview_url, path, others)
            url = preview_url
    except FileNotFoundError:
        print(f"human-feedback: no such page: {page}", file=sys.stderr)
        return 1
    except (OSError, ValueError) as exc:
        print(f"human-feedback: {exc}", file=sys.stderr)
        return 1
    if check and (web_page or preview_url is not None):
        why = dead(url)
        if why:
            print(f"human-feedback: didn't open {url}: {why}. Find the right address and run show.py again "
                  "(--no-check skips this)", file=sys.stderr)
            return 1
    if untagged:
        return held_bare(path)
    was_closed = not (reopen or front) and closed(path)
    done = show_in(browser, preview_url if preview_url is not None else page, url, want, others,
                   path if was_closed else None, front)
    if done == 0 and automatic:
        print(f"human-feedback: review address: {url}")
    if done == 0 and not was_closed:
        remember(path)
    return done


def show_in(browser: str, page: str, url: str, want: str, others: set[str],  # pylint: disable=too-many-arguments,too-many-positional-arguments,too-many-return-statements
            keep_closed: Path | None, front: bool = False) -> int:
    """Show the page in the browser; keep_closed: the page to leave closed when no tab has it; front: --front."""
    if sys.platform != "darwin":
        if keep_closed:
            return left_closed(keep_closed)
        return launch_default(url, front)
    plain = urlsplit(page).scheme not in ("http", "https", "file")
    target = want if plain else url          # `open` takes a path more reliably than a file URL
    agents = strays(browser)
    if agents:
        return hand_over(browser, url, agents, front)
    got = listing(browser) if running(browser) else "not running"
    if got == "not running":
        if keep_closed:
            return left_closed(keep_closed)
        return launch(browser, target, f"{browser} wasn't running: started it in the background with the page",
                      front)
    if isinstance(got, str):
        print(f"human-feedback: can't read {browser}'s tabs ({got})", file=sys.stderr)
        return launch(browser, target, f"opened it with `open -g` in {browser}, which may have made a second tab",
                      front)
    windows, tabs = got
    away = "" if front else frontmost_app()   # read first: showing the page mustn't decide it
    found = pick(tabs, want, others)
    spot = reuse(browser, tabs, windows, found, url) if found else None
    if spot is None and keep_closed:
        return left_closed(keep_closed)
    if spot is None:
        window = front_window(windows)
        if window is None:
            return launch(browser, target, f"{browser} had no window open: opened one with the page, in the background",
                          front)
        spot = add(browser, window, url)
    if spot is None:
        return launch(browser, target, f"opened it with `open -g` in {browser}", front)
    if front:
        return bring_front(browser, *spot)
    select_if_away(browser, away, *spot)
    return 0


def main(argv=None) -> int:
    """Show the page; 0 when it's shown, 1 when it couldn't be, 2 on bad usage."""
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("page", help="the page's absolute path, or an http(s) or file URL")
    ap.add_argument("--browser", default=os.environ.get(BROWSER_ENV) or DEFAULT_BROWSER,
                    help=f"macOS browser app name (default: ${BROWSER_ENV}, else {DEFAULT_BROWSER}); other systems use the default browser")
    ap.add_argument("--reopen", action="store_true",
                    help="open it even though the user closed its tab and it has no new draft (when they ask to see it)")
    ap.add_argument("--plain", action="store_true",
                    help="show a local HTML page without the notes layer (a page you didn't make)")
    ap.add_argument("--front", action="store_true",
                    help="for a page the user must act on now: make its tab active, raise its window and the browser, "
                         "and check it's in front (exit 1 if not)")
    ap.add_argument("--no-check", action="store_true",
                    help="skip checking that a web address loads (an address only the browser can reach)")
    ap.add_argument("--preview-url", help="the HTTP(S) address of the local HTML file on its preview server")
    args = ap.parse_args(sys.argv[1:] if argv is None else argv)
    return show(args.page, args.browser, args.reopen, args.plain, args.front, check=not args.no_check,
                preview_url=args.preview_url)


if __name__ == "__main__":
    sys.exit(main())
