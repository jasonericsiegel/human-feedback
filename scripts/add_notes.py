#!/usr/bin/env python3
"""Turn on human feedback for an HTML page: add or replace the one tag that loads the notes layer.

    python3 add_notes.py <page.html> [--agent "Claude"] [--workspace <dir>] [--next-round] [--copy] [--hold]
    python3 add_notes.py <any version.html> --new-version
    python3 add_notes.py <new.html> --name "Two words" [--done …]
    python3 add_notes.py <new.html> --after <previous.html> --name "Two words"
    python3 add_notes.py <page.html> --name "Two words"
    python3 add_notes.py <page.html> --ask "A question?" --ask '[Part label] "quote" A question?'
    python3 add_notes.py <page.html> --reply '[Part label] "quote" their note' "Your answer."
    python3 add_notes.py <page.html> --gist '[Part label] "quote" their note' "Their words, cut short."
    python3 add_notes.py <page.html> --updated '[Part label] "quote" What changed.'
    python3 add_notes.py <page.html> --added '[Part label] "quote" What was added.'
    python3 add_notes.py <page.html> --done '[Part label] "quote" their note'
    python3 add_notes.py <page.html> --answered '[Part label] "quote" your question' "Their answer from chat."
    python3 add_notes.py <page.html> --settled '[Part label] "quote" a carried thread' "One line on why it's settled."
    python3 add_notes.py <page.html> --received
    python3 add_notes.py <page.html> --converged --what-changed "We …" [--next-step "…"]

The tag sits between <!-- human-feedback --> markers just before </body>, so re-running replaces it
rather than adding a second one. --next-round starts a fresh notes column after the agent has
applied a pasted batch. --copy puts human-feedback.js beside the page and loads it from there, for a
page served over http; by default the tag loads the skill's own copy through a file:// URL,
which works for pages opened straight from disk. Once a page copies, later runs and new versions keep
copying, even after a rewrite drops the tag (a hidden .<page file>.copy remembers it), and a page whose
other version or neighbour loads the copy copies too: a file:// src never loads over http.

After a successful run readies the page, it opens through show.py, which reuses its tab. --received,
--converged and --new-version alone do not open it; the new version opens in its follow-up run.
An opening failure leaves the page ready and the exit code unchanged, and prints the command to open it by hand.

Agent: --agent names the agent tagging the page, as people call it ("Claude", "Codex"). When the agent's cursor closes a
thread the user answered in chat, its tag shows that name and the agent's mark (its own Hugeicons logo,
else its maker's, else a bot). It's kept in the tag as data-agent: a run without --agent keeps the last name, a new
version keeps its predecessor's (even one rewritten whole, once --after joins it), and a page never named shows the bot
and "Agent".

Helpers: --helper names another agent that made parts of the page (a subagent, Codex), and --owns "Codex:[Part label]"
gives it one part; both repeat, three helpers at most. The --agent is the lead. The tag keeps them as data-agents, the lead
first ([{"name": "Claude", "lead": true}, {"name": "Codex", "owns": ["Part label"]}]), and the page's opening gives each
agent only what it owns: a helper turns the round number and wipes in its own parts, each in its own colour; the lead
wipes the Outline and the rest of the page and types the messages. A run with neither flag keeps the page's helpers; one
with either replaces them; a new version starts with none. With no helper the tag has no data-agents, as before.

Attachments: every run makes sure <workspace>/human-feedback/attachments/ exists, with a marker file beside it
(human-feedback/.human-feedback.json, holding the folder's absolute path), and names the human-feedback folder in the tag
as data-folder. In Chrome the user selects that folder once; the page checks the marker against the tag, then saves each
picture the user attaches into attachments/. The workspace is --workspace, else the page's repo, else the current directory's
repo, else the current directory; a later run keeps the folder the tag names. No .gitignore is written.
--pictures off skips making that folder and disables picture attachments; later runs keep the tag's setting,
or the hidden .<page file>.pictures beside it when a rewrite drops the tag.

Versions: --after registers the page as the next version of an earlier one, with a short name.
Every file in the set carries the whole list in its tag (data-versions, oldest
first, each version's path relative to that file), so any version can step to the others; every run
on a version rewrites the whole set's tags. A version file that has moved stops getting updates. --changed (a
change note per version) is no longer used: it is accepted and ignored with a warning, and an entry an older run
wrote keeps its note.

Out of reach: each version's entry records its last run ("made", the tag's data-made). The page keeps a new version
off every other version's list until it has been opened in their browser (show.py opens it; so does opening the file
itself), so the stepper's arrows and a refresh can't reach a round the agent is still making. One never opened comes
into reach 2 hours after its last run.

New version: --new-version does the making in one call, from any version of the set. It works from
the set's latest, copies that file to the next number (by its place in the stepper: alert.html,
alert-r2.html, alert-r3.html; round-2.html, round-3.html), copies the folder named like the page
(alert/ to alert-r2/) and points the new page's src, href, poster and CSS url() references at the copy,
registers the file as the next version without a name, and prints the next step: apply
the changes in that file, then run add_notes.py <new.html> --name … with replies to the user's
questions and any done marks. It stops rather than overwrite a file or folder that is already there. Each
version's entry records the skill's metadata.version (field "skill") when --after or --new-version
registers it; --new-version warns when the version now differs from the last one's, so a long-running
agent re-reads SKILL.md. --new-version goes on its own (only --copy may join it).

Questions: each --ask puts one of the agent's questions in the notes column for the user to answer:
at the top, or beside a part when it starts with [Part label], at exact words when a "quote"
follows. --ask replaces the page's questions; a re-run keeps them; --next-round, or a tag copied
over from another file, starts with none.

Replies: each --reply answers one of their notes, given as the copy wrote it ([Part label], "quote", their
words; a leading "3." is dropped), on the page made from the one the user wrote it on. It sits beside the
part with their words above it, and the user can answer back. Replies are kept apart from questions: --reply
replaces only the replies, --ask only the questions, and otherwise they follow the same rules.
Blank lines in --reply, --again and --ask text split it into separate agent bubbles, the reaction on the last.

Gists: --gist NOTE SHORT gives a current or carried reply a short version of the user's note, with NOTE parsed as
for --reply. Each run with --gist replaces the page's gists; a plain re-run keeps them. They carry with the thread,
without changing its id. The bubble toggles between the gist and the full note; Copy keeps the full note.

Done: each --done marks one of their notes (given as for --reply) as carried out as the user asked. The new version keeps it
in data-done, and every version's data-versions lists those marks too. The layer puts the ✅ on the original note in
its earlier version, with no done thread in the new round. --done replaces only the done marks; a plain re-run keeps them.

Answered: each --answered closes one of the agent's questions (or replies) that the user answered in chat instead of on the
page. QUESTION is the question as the page asked it ([Part label], "quote", the question; a copied "Q2." or
"(Round 2 "Name")" is fine), this round's or one carried from an earlier round; ANSWER is their words. The page shows it
closed, their words as their reply with the agent's ✅, and never counts it as open, carries it, or copies it. A thread
from an earlier version closes there, in that version's tag, and the new version shows no row for it (the user: "If
something is answered in chat, then it shouldn't persist to the next round"). --answered replaces only this tag's list
(data-answered, [{id, kind, from, block, quote, said, text, answer}], each id the question's own); otherwise it follows
the rules for replies.

Settled: each --settled closes one earlier thread this version carries (a question or a reply) because this version's own
changes settled it or made it moot: its subject was removed or replaced, or the user decided it somewhere else (the user,
2026-11-21: "This thread is now muted based on what you did in this round. Doesn't human feedback say that in this case, the
thread should not persist to the next round?"). THREAD is the thread as the page shows it ([Part label], "quote", the
question, or for a reply the user's note or your answer; --new-version prints what's carrying); WHY is one line for the
agent's own record. The thread is left out of this round's carry, and so out of every later round's, and no row shows for
it. It stays, still open, in the round it came from. A thread the user answered in chat takes --answered instead, which
shows their words. --settled needs no stored list: a plain re-run keeps the carry it left.

Again: each --again asks again, in shorter words, a question or reply left unanswered that still needs an answer. THREAD
is the thread as the page asked it (as for --answered; --new-version and --next-round list what's carrying); SHORTER is
the new words. It keeps the thread's kind, part, quote and the note it answers, adds the new words to this run's
questions or replies, and takes the old thread out of the carry, so it never shows twice. A reworded --ask can't do that:
its words make it a different question, so the old one would carry beside it. It adds to --ask and --reply, and to a
plain re-run's lists; each thread once.

Changes: --updated marks changed content; --added marks a part added in response to the user's notes:
'[Part label] "quote" one line on what changed or was added'. New marks every notice on an added part. Updated marks
existing content. The notice starts outside the thread count and Copy reminder. Select it to reply or react. A question
opens a thread waiting for the agent. Responses copy under Your updates. Pass all --updated and --added entries together
(data-updated, [{id, block, quote, text, added?}]). A plain re-run keeps them. A new version or --next-round starts with
none. A notice stays in the round that flagged it.

Previous version: a new version (--new-version, or --after) also writes .<new page file>.prev.js beside it, once, calling
PN_PREV with {from, at, html}: the version before it as it was then, minus the tag, hold style and scripts, for the wipe.

Carry: a new version (--after) carries the last version's questions and replies, and whatever that version carried
itself, into its tag as data-carry ([{id, kind, from, block, quote, said, text}], kind "ask" or "reply", from the round
each was first asked in); --next-round carries the page's own. A thread the run asks or replies to again isn't carried,
nor one answered in chat (--answered) or asked again (--again), and a plain re-run keeps the carry. The page shows each carried thread on the
latest version until the user answers it, so one the user skipped can't drop out because the agent didn't pass it again.
Only the browser holds the user's notes, so every thread rides in the tag and the page drops those the user closed: by
answering, or a question by leaving notes on its part in its own round (SKILL.md step 7).

Received: --received tells an open page that the agent has their paste. It writes
.<page file>.received.js beside the page, and beside every version of it, calling PN_RECEIVED with
the time; the page loads it (from file://, no server) and locks what their last copy before then held.
It runs on its own and leaves the tag alone.

Converged: --converged tells the page the agent has decided you've converged and the loop is done. It
writes .<page file>.done.js beside the page, and beside every version of it, calling PN_DONE with the time
and the summary: each --what-changed is one bullet of What we did across all versions (3 to 5, each starting
"We"; it warns about any that doesn't, and about more than 5), and each --next-step is one thing to do next
(optional; it warns about any that doesn't start with "You" or "Your agent"). --what-didnt is no longer used:
accepted and ignored with a warning. The page's bar reads Done and the summary covers their
notes column, with every thread of the round listed under it; their Unlock reopens the loop. It names and refuses
unanswered questions in the latest version. Record Copy text with --received --feedback-file or close an answered or moot
question. A new version (--after) or --next-round takes Done back. --reopen deletes the Done files for a Done the user
didn't mean to give. --converged runs on its own and leaves the tag alone.

Hold: --hold readies the page without opening it; it changes nothing on the page.

Frames: a local page the page shows in an <iframe> gets a tag too, marked data-frame, so a selection
made inside the frame reaches the page's notes. A framed page with notes of its own keeps them.

Hold style: every run records in the tag when it wrote it (data-made; HF_MADE=<ISO time> sets it instead, for tests
that need a round made earlier). It also puts a small style in the page's <head>, between
<!-- human-feedback hold --> markers, on every round and version, that hides the page from its first paint until the
layer takes over. Round one shows a quiet skeleton while it waits; later rounds keep the previous opening. An unseen
round waits for the user to visit it. A CSS timeout shows the page after 4 s if the layer never loads.
"""

from __future__ import annotations

import argparse
from contextlib import redirect_stdout
import ctypes
import ctypes.util
import hashlib
import html
from html.parser import HTMLParser
import io
import json
import os
import re
import shlex
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import quote as url_quote, unquote

ASSET = Path(__file__).resolve().parent.parent / "assets" / "human-feedback.js"
SHOW = Path(__file__).resolve().parent / "show.py"
SKILL = Path(__file__).resolve().parent.parent / "SKILL.md"
SKILL_DIR = Path(__file__).resolve().parent.parent   # never the attachments folder, even when it's <workspace>/human-feedback
FOLDER = "human-feedback"   # in the agent's workspace: the folder the user selects in Chrome's folder picker
ATTACHMENTS = "attachments"   # inside it: where the page writes their pictures
PICTURES_DEFAULT = "off"   # picture attachments are switched off in this release
MARKER = ".human-feedback.json"   # inside it: {"folder": <its absolute path>}, which the page checks against the tag
AGENT_MAX = 40   # --agent: a name for the cursor's tag, not a description
HELPERS_MAX = 3   # --helper: each gets its own colour on the page, and the page has three
OWNS = re.compile(r"\s*([^:\[\]]+?)\s*:\s*\[([^\]]+)\]\s*")   # --owns "Codex:[Part label]"
LAYER_BESIDE = "human-feedback.js"   # the tag's src when --copy put the layer beside the page
CHROME_PREFS = Path.home() / "Library" / "Application Support" / "Google" / "Chrome" / "Default" / "Preferences"
BLOCK = re.compile(r"<!-- human-feedback -->.*?<!-- /human-feedback -->\n?", re.S)
SCRIPT_EL = re.compile(r"<script\b[^>]*>.*?</script\s*>", re.S | re.I)   # a whole script element, inline or src
SCRIPT = re.compile(r"(<script\b[^>]*>).*?(</script\s*>)", re.S | re.I)
STYLE_EL = re.compile(r"<style\b[^>]*>.*?</style\s*>", re.S | re.I)   # a [data-note] selector is no part
TAG = re.compile(r"<!-- human-feedback -->(.*?)<!-- /human-feedback -->", re.S)
COMMENT = re.compile(r"<!--.*?-->", re.S)   # a data-note named in a comment is no part
PROOF_TEMPLATE = Path(__file__).resolve().parents[1] / "references" / "template-review-proof.html"
ATTR = re.compile(r'([\w-]+)="([^"]*)"')
BODY_END = re.compile(r"</body\s*>", re.I)
HOLD = re.compile(r"<!-- human-feedback hold -->.*?<!-- /human-feedback hold -->\n?", re.S)
HEAD_OPEN = re.compile(r"<head\b[^>]*>|<html\b[^>]*>", re.I)
# every page stays hidden until the layer draws it (hf7k3-drawn), or 4 s if the layer never loads
HOLD_STYLE = ("<!-- human-feedback hold --><style>html:not(.hf7k3-drawn) body{visibility:hidden;"
              "animation:hf7k3-hold 0s 4s forwards}@keyframes hf7k3-hold{to{visibility:visible}}</style>"
              "<!-- /human-feedback hold -->\n")
# The first round has a skeleton even before its script loads. Pseudo-elements live outside the hidden body;
# the same four-second fail-open timeout removes them if the layer never arrives. Later rounds keep their old hold.
FIRST_HOLD_STYLE = HOLD_STYLE.replace("</style>", """html:not(.hf7k3-drawn)::before{content:"";position:fixed;z-index:2147480600;left:max(24px,calc((100vw - 680px)/2));top:64px;width:min(680px,calc(100vw - 48px));height:430px;pointer-events:none;--hf-sk:#e6e6ea;background:linear-gradient(var(--hf-sk),var(--hf-sk)) 0 0/72% 32px no-repeat,linear-gradient(var(--hf-sk),var(--hf-sk)) 0 72px/100% 13px no-repeat,linear-gradient(var(--hf-sk),var(--hf-sk)) 0 103px/87% 13px no-repeat,linear-gradient(var(--hf-sk),var(--hf-sk)) 0 134px/64% 13px no-repeat,linear-gradient(var(--hf-sk),var(--hf-sk)) 0 216px/47% 21px no-repeat,linear-gradient(var(--hf-sk),var(--hf-sk)) 0 274px/100% 13px no-repeat,linear-gradient(var(--hf-sk),var(--hf-sk)) 0 305px/87% 13px no-repeat,linear-gradient(var(--hf-sk),var(--hf-sk)) 0 336px/64% 13px no-repeat;animation:hf7k3-prepaint 0s 4s forwards}html:not(.hf7k3-drawn)::after{content:"";position:fixed;z-index:2147480601;left:max(24px,calc((100vw - 680px)/2));top:64px;width:min(680px,calc(100vw - 48px));height:430px;pointer-events:none;background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);animation:hf7k3-prepaint-sheen 1.8s ease-in-out infinite,hf7k3-prepaint 0s 4s forwards}@keyframes hf7k3-prepaint{to{visibility:hidden}}@keyframes hf7k3-prepaint-sheen{from{opacity:0;transform:translateX(-55%)}30%,70%{opacity:1}to{opacity:0;transform:translateX(55%)}}@media(prefers-color-scheme:dark){html:not(.hf7k3-drawn)::before{--hf-sk:#343438}html:not(.hf7k3-drawn)::after{background:linear-gradient(100deg,transparent,rgba(255,255,255,.08),transparent)}}@media(prefers-reduced-motion:reduce){html:not(.hf7k3-drawn)::after{display:none}}@media(max-width:600px){html:not(.hf7k3-drawn)::before,html:not(.hf7k3-drawn)::after{top:48px}}</style>""")
LABEL = re.compile(r"""data-note(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?""")
# A copied header keeps its whole quote up to the line break, before any reaction or image/edit marker.
# With words on the same line, keep the first closing quote; a marker alone can end a copied header too.
ASK_MARK = r'(?:[ \t]+(?:[✅❓👍👎❤️🎉]+|\(images? [^\r\n]*\)|edited(?: \d+ blocks)?:))'
# Pictures are stored separately from quote and words; their copied marker belongs only to the header line.
ASK_PICS = r'[ \t]+\(images? [^\r\n]*?\)(?=[ \t]*(?:"|[✅❓👍👎❤️🎉]|\r?\n|$))[ \t]*'
ASK = re.compile(r'\s*(?:\[([^\]]+)\](?:' + ASK_PICS + r'|\s*))?(?:"([^\r\n]+(?="(?:'
                 + ASK_MARK + r'*[ \t]*\r?\n|' + ASK_MARK + r'+[ \t]*$))|[^"]+)"\s*)?\s*(.*?)\s*', re.S)
IFRAME = re.compile(r"""<iframe\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')""", re.I)
# a URL with a scheme, or from the root: not a file beside the page
REMOTE = re.compile(r"^(?:[a-z][\w+.-]*:|/)", re.I)
COPIED = re.compile(r'^\s*(?:\d+\.\s*(?=\[|\(Round )|Overall:\s*)?(?:\(Round \d+(?:\s+"[^"]*")?\)\s*)?')   # "that's just informing you what it is that I'm providing feedback on"
QCOPIED = re.compile(r'^\s*(?:Q\d+\.\s*)?(?:\(Round \d+(?:\s+"[^"]*")?\)\s*)?')   # a copied question's number, round
# a file name that already numbers its version: alert-r2, round-2, round2, my_v3 (a marker, then the number) ...
SERIES = re.compile(r"^(?P<head>(?:.*[-_.])?(?:round|rev|r|v)[-_]?)(?P<n>\d+)$", re.I)
# ... or a bare number after a dash, which only counts when it is the version's own place (page-2, not 2026-10-19)
NUMBERED = re.compile(r"^(?P<head>.*[-_])(?P<n>\d+)$")


def page_id(page: Path) -> str:
    """The page's path from its repo root, so the copied notes name it the way the agent does."""
    top = git_top(page.parent)
    return page.relative_to(top).as_posix() if top else str(page)


def check_parts(text: str) -> list[str]:
    """Warnings about the data-note marks: none at all, or the same explicit label twice."""
    labels = [m.group(1) if m.group(1) is not None else m.group(2) for m in LABEL.finditer(text)]
    if not labels:
        return ["no data-note parts: notes still work on selected text, but the outline is empty"]
    named = [label for label in labels if label]
    dupes = sorted({x for x in named if named.count(x) > 1})
    return [f'duplicate data-note label "{label}"' for label in dupes]


class PartParagraphs(HTMLParser):
    """Counts each data-note part's paragraphs: its p and li with text, and a blockquote with text of its own
    (one holding a p or li is counted through them). Keys are the part's label: data-note="…", else its first heading."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[dict] = []   # open and closed parts, in order
        self.stack: list[tuple[str, list[dict]]] = []   # open elements: tag, the open parts it began
        self.items: list[dict] = []   # open p / li / blockquote: {tag, text, inner}

    def handle_starttag(self, tag, attrs):
        if tag in ("br", "hr", "img", "input", "meta", "link", "wbr"):
            return
        began = []
        if any(k == "data-note" for k, _ in attrs):
            part = {"label": " ".join((dict(attrs)["data-note"] or "").split()), "count": 0, "head": None, "open": True}
            self.parts.append(part)
            began.append(part)
        if tag in ("p", "li", "blockquote"):
            if self.items and tag != "blockquote":
                for item in self.items:
                    item["inner"] = True
            self.items.append({"tag": tag, "text": "", "inner": False, "parts": [p for p in self.parts if p["open"]]})
        if re.fullmatch(r"h[1-6]", tag):
            self.items.append({"tag": tag, "text": "", "inner": False, "parts": []})
        self.stack.append((tag, began))

    def handle_data(self, data):
        for item in self.items:
            item["text"] += data

    def handle_endtag(self, tag):
        while self.stack:
            top, began = self.stack.pop()
            for item in [i for i in self.items[-1:] if i["tag"] == top]:
                self.items.pop()
                text = " ".join(item["text"].split())
                if re.fullmatch(r"h[1-6]", top):
                    for part in [p for p in self.parts if p["open"] and p["head"] is None]:
                        part["head"] = text
                elif text and not item["inner"]:
                    for part in item["parts"]:
                        part["count"] += 1
            for part in began:
                part["open"] = False
            if top == tag:
                break


def long_parts(text: str) -> dict[str, int]:
    """Each labelled data-note part's paragraph count, for the parts with more than one."""
    parser = PartParagraphs()
    parser.feed(STYLE_EL.sub("", SCRIPT_EL.sub("", text)))
    parser.close()
    counts: dict[str, int] = {}
    for part in parser.parts:
        label = part["label"] or part["head"] or ""
        if label and part["count"] > 1:
            counts.setdefault(label.casefold(), part["count"])
    return counts


def unquoted_asks(text: str, args) -> list[str]:
    """Warnings for an --ask or --reply that names a part of more than one paragraph and gives no "quote": the
    question belongs to one paragraph's words, and anchored to the whole part it points at all of it."""
    wanted = [("--ask", a) for a in args.ask or []] + [("--reply", r[0]) for r in args.reply or []]
    counts = long_parts(text) if wanted else {}
    out = []
    for flag, note in wanted:
        block, quote, _ = copied_note(note)
        n = counts.get(" ".join(block.split()).casefold()) if block else None
        if n and not quote:
            out.append(f'{flag} on [{block}] names a part with {n} paragraphs but no "quote"; '
                       "quote the exact words it's about.")
    return out


def read_tag(text: str) -> dict:
    """The attributes of the page's notes tag, unescaped; empty when it has none."""
    found = TAG.search(text)
    return {k: html.unescape(v) for k, v in ATTR.findall(found.group(1))} if found else {}


def stamp(when: datetime) -> str:
    """A local time with its offset, to the second, which the browser parses exactly."""
    return when.astimezone().isoformat(timespec="seconds")


def load_set(path: Path, attrs: dict) -> list[dict]:
    """The version list in a page's tag, each entry with the absolute path its file points to."""
    try:
        entries = json.loads(attrs.get("data-versions") or "[]")
    except ValueError:
        return []
    return [{**e, "path": (path.parent / e["file"]).resolve()}
            for e in entries if isinstance(e, dict) and e.get("file")]


def first_entry(path: Path) -> dict:
    """An entry for a page that had no version list: it becomes version 1."""
    made = datetime.fromtimestamp(path.stat().st_mtime)
    attrs = read_tag(path.read_text(encoding="utf-8"))
    at = attrs.get("data-at") if attrs.get("data-page") == page_id(path) else None
    return {"path": path, "page": page_id(path), "at": at or stamp(made)}


def versions_attr(entries: list[dict], for_page: Path) -> str:
    """The list as one page's tag carries it: each version's file relative to that page."""
    keep = ("page", "name", "at", "changed", "round", "skill", "made", "done")
    out = [{"file": Path(os.path.relpath(e["path"], for_page.parent)).as_posix(),
            **{k: e[k] for k in keep if e.get(k) is not None}} for e in entries]
    return json.dumps(out, ensure_ascii=False)


def copied_note(note: str) -> tuple:
    """A note as the copy gives it, less its number, round or Overall heading, split into (label, quote, words)."""
    parts = ASK.fullmatch(COPIED.sub("", note)).groups()   # keep the header's line break until its quote is found
    return tuple(re.sub(r"\s+", " ", x) if x is not None else None for x in parts)


def no_page(block: str | None) -> str | None:
    """[Page] is the label for a thread on no part."""
    return None if block == "Page" else block


def thread(kind: str, hashed: tuple, fields: tuple) -> dict:
    """A thread whose id is its kind's letter and the hash of the words that make it one; empty fields are left out."""
    key = hashlib.sha1("\n".join(map(str, hashed)).encode()).hexdigest()[:8]
    return {k: v for k, v in (("id", kind + key), *fields) if v}


LINK = re.compile(r"\[\[(.+?)\]\]")   # a link to a part in an agent's words: [[Part label]]


def label_key(label: str) -> str:
    """A part label as part_labels() keeps it: spaces collapsed, casefolded."""
    return " ".join(label.split()).casefold()


def unplaced_asks(text: str, asks: list[str], flag: str = "--ask") -> list[str]:
    """--ask questions that name no part on the page. Every question sits beside the part it is about: there are
    no page-wide questions, so one with no [Part label], with [Page], or with a label the page lacks stops the run."""
    labels = part_labels(text) if asks else set()
    out = []
    for a in asks:
        block = no_page(copied_note(a)[0])
        if block is None:
            out.append(f'{flag} {a.strip()[:60]!r} names no part. Every question goes on the part it is about: '
                       'give its [Part label], plus a "quote" when it is about some of its words. '
                       'There are no page-wide questions.')
        elif label_key(block) not in labels:
            out.append(f'{flag} on [{block}]: no part on the page has that label.')
    if out and labels:
        out.append("The page's parts: " + ", ".join(sorted(labels)))
    return out


def placed_carry(text: str, carry_json: str | None) -> tuple[str | None, list[dict]]:
    """The carried threads this page still has a place for, as JSON (None for none), and those whose part it dropped. A
    reply to a note on no part (Overall) keeps its place. A part the page dropped was settled, so its threads leave with it (the user, 2026-11-21: "This thread was muted and/or
    answered already in a different thread ... you don't persist the thread into the next round")."""
    labels = part_labels(text)
    kept, dropped = [], []
    for t in json.loads(carry_json or "[]"):
        (dropped if t.get("block") and label_key(t["block"]) not in labels else kept).append(t)
    return (json.dumps(kept, ensure_ascii=False) if kept else None), dropped


def unplaced_carry(carry_json: str | None) -> list[str]:
    """Carried questions asked before every question needed a part: they sit on none."""
    return [f'carried question from round {t.get("from")} "{(t.get("text") or "")[:60]}" is on no part of this '
            'page. Close it with --answered if the user answered it in chat. If it still needs an answer, put the '
            'question in the relevant part of the page.'
            for t in json.loads(carry_json or "[]") if t.get("kind") == "ask" and not t.get("block")]


def dropped_note(dropped: list[dict]) -> str:
    """What the run says about the carried threads it left behind with their parts."""
    rows = "; ".join(f'{"question" if t.get("kind") == "ask" else "reply"} from round {t.get("from")}, '
                     f'[{t.get("block") or "no part"}] "{(t.get("text") or "")[:60]}"' for t in dropped)
    n = len(dropped)
    return (f"human-feedback: dropped {n} earlier thread{'s' * (n != 1)} on parts this page no longer has, so the user "
            f"won't see {'them' if n != 1 else 'it'} again: {rows}. If one still needs the user, --ask it on the part it "
            "fits now.")


def broken_links(text: str, args) -> list[str]:
    """[[Part label]] links in this run's --ask and --reply words that name no part, so a link can't point at nothing."""
    words = list(args.ask or []) + [r[1] for r in args.reply or []] + [a[1] for a in args.again or []]
    named = [m for w in words for m in LINK.findall(w)]
    labels = part_labels(text) if named else set()
    out = [f"[[{m}]]: no part on the page has that label." for m in named if label_key(m) not in labels]
    if out and labels:
        out.append("The page's parts: " + ", ".join(sorted(labels)))
    return out


def parse_ask(arg: str) -> dict:
    """One --ask: its [Part label] (main checks it names a part), an optional "quote" inside it, then the question."""
    block, quote, text = ASK.fullmatch(arg).groups()
    if not text:
        fail('--ask needs a question after any [Part label] or "quote"')
    return thread("q", (block, quote, text), (("block", block), ("quote", quote), ("text", text)))


def parse_updated(arg: str, *, added: bool = False) -> dict:
    """One --updated or --added: its [Part label], an optional "quote", then one line on the change."""
    block, quote, text = ASK.fullmatch(arg).groups()
    if not text:
        flag = '--added' if added else '--updated'
        fail(f'{flag} needs one line on the change after its [Part label] and any "quote"')
    return thread("u", (block, quote, text), (("block", block), ("quote", quote), ("text", text), ("added", added)))


def parse_reply(note: str, text: str) -> dict:
    """One --reply: their note as the copy gives it ([Part label], "quote", their words), then the agent's answer."""
    block, quote, said = copied_note(note)
    block = no_page(block)   # the copy's label for a note on no part
    text = text.strip()
    if not text or not (block or quote or said):
        fail('--reply needs their note (as copied: [Part label] "quote" their words) and your answer')
    return thread("r", (block, quote, said, text),
                  (("block", block), ("quote", quote), ("said", said), ("text", text)))


def parse_done(note: str) -> dict:
    """One --done: their note as the copy gives it, carried out as the user asked, so the agent's answer is a ✅."""
    block, quote, said = copied_note(note)
    block = no_page(block)
    # Only done marks rebuild the copied words to match in the layer. Keep a picture marker before its quote,
    # in said rather than quote, so the layer neither drops the marker nor clips the whole copied header.
    pictures = re.match(r'\s*\[[^\]]+\](' + ASK_PICS + r'.*)', COPIED.sub("", note), re.S)
    if pictures:
        quote, said = None, words(pictures[1])
    if not (block or quote or said):
        fail('--done needs their note (as copied: [Part label] "quote" their words)')
    return thread("d", (block, quote, said), (("block", block), ("quote", quote), ("said", said)))


def words(text: str | None) -> str:
    """Text with its runs of space and line breaks collapsed, for comparing what was asked."""
    return " ".join((text or "").split())


def same_quote(have: str | None, want: str | None) -> bool:
    """Whether a thread's quote is the one given: the same words, or its two ends when the copy clipped it
    (start … end)."""
    if words(have) == words(want):
        return True
    if not (have and want and " … " in want):
        return False
    start, end = (words(x) for x in want.split(" … ", 1))
    return words(have).startswith(start) and words(have).endswith(end)


def parse_answered(question: str, answer: str, pool: list[dict]) -> dict:
    """One --answered: one of the agent's threads as the page asked it ([Part label], "quote", the question; a
    copied "Q2." or "(Round 2 "Name")" is dropped), found among the threads the page holds, then the user's answer from
    chat. It keeps the thread's own id, so the page pairs the two, and what the page needs to show it once it's no
    longer carried."""
    answer = answer.strip()
    if not answer:
        fail('--answered needs your question as the page asked it ([Part label] "quote" question) and their answer')
    found = find_thread(question, pool, "--answered")
    keep = ("id", "kind", "from", "block", "quote", "said", "text", "gist", "authoredAt")
    return {**{k: found[k] for k in keep if found.get(k)}, "answer": answer}


def find_thread(question: str, pool: list[dict], flag: str) -> dict:
    """The thread a flag names, as the page shows it: its part, quote and words, or its words alone if one thread has them.
    A reply's words are the agent's answer or the user's note it answers; either finds it."""
    parts = ASK.fullmatch(QCOPIED.sub("", question)).groups()
    block, quote, text = (re.sub(r"\s+", " ", x) if x is not None else None for x in parts)
    if not text:
        fail(f'{flag} needs your question as the page asked it ([Part label] "quote" question)')
    def says(t: dict) -> bool:
        return text in (words(t.get("text")), words(t.get("said")) if t.get("kind") == "reply" else None)
    exact = [t for t in pool if (t.get("block") or None) == block and same_quote(t.get("quote"), quote) and says(t)]
    alike = {t["id"]: t for t in pool if says(t)}
    found = exact[0] if exact else next(iter(alike.values())) if len(alike) == 1 else None
    if found is None:
        asked = "; ".join(f'"{t.get("text")}"' + (f' (reply to "{t.get("said")}")' if t.get("kind") == "reply" and t.get("said") else "")
                          for t in pool) or "none"
        fail(f"{flag}: no question or reply on the page matches {question.strip()!r}. Pass it as the page shows it "
             f'([Part label] "quote" question, or for a reply the user\'s note or your answer). Its threads now: {asked}')
    return found


def parse_again(old: str, shorter: str, pool: list[dict]) -> tuple[dict, dict]:
    """One --again: a thread left unanswered, as the page asked it, then its shorter words. Returns the thread and its
    replacement, of the same kind, on the same part, quote and note."""
    found = find_thread(old, pool, "--again")
    shorter = shorter.strip()
    if not shorter:
        fail("--again needs the thread as the page asked it and its shorter words")
    block, quote, said = (found.get(k) for k in ("block", "quote", "said"))
    if found.get("kind") == "ask":
        return found, thread("q", (block, quote, shorter), (("block", block), ("quote", quote), ("text", shorter)))
    return found, thread("r", (block, quote, said, shorter),
                         (("block", block), ("quote", quote), ("said", said), ("text", shorter), ("gist", found.get("gist"))))


def with_again(given: str | None, again: list[dict]) -> str | None:
    """A list as JSON with the threads --again adds to it, each once."""
    merged = {x["id"]: x for x in json.loads(given or "[]") + again}
    return json.dumps(list(merged.values()), ensure_ascii=False) if merged else None


def carried(page: Path, attrs: dict, args, given: list | None, attr: str) -> str | None:
    """A list the tag will carry (the agent's questions, replies or done marks), as JSON, or None for none."""
    if given is not None:
        found = given
    elif args.next_round or attrs.get("data-page") != page_id(page):
        found = []   # a new round, or a tag copied over from the file this one was made from
    else:
        return attrs.get(attr) or None
    return json.dumps(found, ensure_ascii=False) if found else None


def listed(attrs: dict, attr: str) -> list[dict]:
    """One of the tag's JSON lists, each entry a dict; an unreadable one is empty."""
    try:
        found = json.loads(attrs.get(attr) or "[]")
    except ValueError:
        return []
    return [x for x in found if isinstance(x, dict)] if isinstance(found, list) else []


def threads(attrs: dict, origin: int) -> list[dict]:
    """The agent's threads a round hands on: those it carried itself, then its questions and replies (never its done
    marks, which ask nothing, nor one the user answered in chat), each with its kind and the round it was first asked in."""
    keep = ("id", "block", "quote", "said", "text", "gist", "authoredAt")
    closed = {x.get("id") for x in listed(attrs, "data-answered")}
    entry = next((v for i, v in enumerate(listed(attrs, "data-versions")) if i + 1 == origin), {})
    own = [{**{k: x[k] for k in keep if x.get(k)},
            **({"authoredAt": entry.get("at") or attrs.get("data-at") or attrs["data-made"]}
               if not x.get("authoredAt") and (entry.get("at") or attrs.get("data-at") or attrs.get("data-made")) else {}),
            "kind": kind, "from": origin}
           for attr, kind in (("data-asks", "ask"), ("data-replies", "reply")) for x in listed(attrs, attr)]
    result = [t for t in listed(attrs, "data-carry") + own if t.get("id") not in closed]
    for item in result:
        prior = next((v for i, v in enumerate(listed(attrs, "data-versions")) if i + 1 == item.get("from")), {})
        if not item.get("authoredAt") and prior.get("at"):
            item["authoredAt"] = prior["at"]
    return result


def date_messages(lists: dict, attrs: dict, when: str, round_at: str | None) -> None:
    """Date each agent message once, preserving its id's time through re-runs and carry.

    Legacy entries use the round's creation time when known; without it, their last tag write is the best available time.
    """
    names = ("asks", "replies", "updated", "carry")
    previous = {x.get("id"): x for name in names for x in listed(attrs, "data-" + name)}
    for name in names:
        if lists.get(name) is None:
            continue
        items = json.loads(lists[name])
        for item in items:
            old = previous.get(item.get("id"))
            if name == "carry" and not item.get("authoredAt") and not (old or {}).get("authoredAt"):
                continue   # unknown legacy carry keeps its origin; never pretend the new round authored it
            item["authoredAt"] = (item.get("authoredAt") or (old or {}).get("authoredAt")
                                  or ((round_at or attrs.get("data-at") or attrs.get("data-made")) if old is not None else None) or when)
        lists[name] = json.dumps(items, ensure_ascii=False)


def reopened(attrs: dict) -> list[dict]:
    """The carried threads the tag's answered list closed, as threads again: a run that replaces the list opens any it
    leaves out."""
    return [{k: v for k, v in x.items() if k != "answer"} for x in listed(attrs, "data-answered") if x.get("from")]


def thread_key(t: dict, kind: str) -> tuple:
    """What makes two threads one: a question's part and words, or the note a reply answers."""
    return (kind, t.get("block"), t.get("text")) if kind == "ask" else (kind, t.get("block"), t.get("quote"), t.get("said"))


def carry(base: list[dict], asks: str | None, replies: str | None, answered: str | None = None,
          replaced: tuple = ()) -> str | None:
    """The tag's carried threads, as JSON, or None for none: each of base once, less any the tag asks or replies to
    itself, closes as answered in chat, or replaces with --again. The user sees each until the user answers it; the page decides that, from what the user
    wrote in earlier rounds."""
    taken = ({thread_key(a, "ask") for a in json.loads(asks or "[]")}
             | {thread_key(r, "reply") for r in json.loads(replies or "[]")}
             | {("id", x.get("id")) for x in json.loads(answered or "[]")}
             | {("id", i) for i in replaced})
    out = {}
    for t in base:
        key = thread_key(t, t.get("kind"))
        if key not in taken and ("id", t.get("id")) not in taken:
            out[key] = t
    return json.dumps(list(out.values()), ensure_ascii=False) if out else None


def copy_layer(page: Path) -> str:
    """Put human-feedback.js beside the page, for one served over http; returns the tag's src for it."""
    shutil.copyfile(ASSET, page.parent / "human-feedback.js")
    return "human-feedback.js"


def copy_file(page: Path) -> Path:
    """The hidden file beside the page that remembers --copy, for when a rewrite drops the tag: a rewritten page re-run
    without --copy would otherwise load the layer through file://, which a page served over http can't."""
    return dot_file(page, "copy")


def relative_src(src: str | None) -> bool:
    """Whether a tag's src loads the layer by a path beside the page (--copy), as a page served over http must."""
    return bool(src) and not REMOTE.match(src)   # not file://, http(s):// or root-relative


def copy_reason(page: Path, attrs: dict, args, entries: list[dict]) -> str | None:
    """Why this run loads the layer from beside the page: '' when --copy asks or the page's tag already does, else the
    sign that the page is served over http (a rewrite dropped its tag, or another version or a page beside it loads
    the copy); None for the skill's own copy through file://. Once a page copies, it keeps copying: a file:// src
    never loads over http, and the page would show no notes and no error."""
    if args.copy or relative_src(attrs.get("src")):
        return ""
    if copy_file(page).is_file():
        return "it was tagged with --copy before a rewrite dropped its tag"
    for e in entries:
        if e["path"] != page and e["path"].is_file() and relative_src(read_tag(e["path"].read_text(encoding="utf-8")).get("src")):
            return f"its version {page_id(e['path'])} loads the layer from beside it"
    if (page.parent / LAYER_BESIDE).is_file():   # a bare copy counts only once a page uses it: the browser tests keep their
        for other in sorted(page.parent.glob("*.htm*")):   # own frozen layer under this name beside pages they tag file://
            if other != page and other.is_file() and read_tag(other.read_text(encoding="utf-8")).get("src") == LAYER_BESIDE:
                return f"{other.name} beside it loads the copied {LAYER_BESIDE}"
    return None


def version_of(entries: list[dict], origin, page: Path) -> Path | None:
    """The file of the earlier version a thread came from, or None when it's this page or there's no such file."""
    if not isinstance(origin, int) or not 0 < origin <= len(entries):
        return None
    path = entries[origin - 1]["path"]
    return path if path != page and path.is_file() else None


def closed_earlier(entries: list[dict], page: Path) -> list[dict]:
    """The threads earlier versions already hold as answered in chat, so naming one again on a re-run finds it."""
    return [{**x, "from": x.get("from") or i + 1}
            for i, e in enumerate(entries) if version_of(entries, i + 1, page)
            for x in listed(read_tag(e["path"].read_text(encoding="utf-8")), "data-answered")]


def agent_lists(page: Path, attrs: dict, args, entries: list[dict], current: int) -> dict:
    """The agent's lists the tag will hold after this run: its questions, replies, done marks and the threads the user
    answered in chat, and the threads it carries from the round before (a new version takes the last version's,
    --next-round the page's own, and any other run keeps what the tag carried)."""
    asks = carried(page, attrs, args, args.ask and [parse_ask(a) for a in args.ask], "data-asks")
    # what changed since their notes: this version's own, never carried (threads() hands on only questions and replies)
    changes = None
    if args.updated is not None or args.added is not None:
        changes = list({u["id"]: u for u in ([parse_updated(u) for u in args.updated or []]
                        + [parse_updated(u, added=True) for u in args.added or []])}.values())
        added_parts = {label_key(u.get("block") or "") for u in changes if u.get("added")}
        for u in changes:
            if label_key(u.get("block") or "") in added_parts:
                u["added"] = True   # a newly added part is New, even when --updated also names it
    updated = carried(page, attrs, args, changes, "data-updated")
    replies = carried(page, attrs, args, args.reply and [parse_reply(*r) for r in args.reply], "data-replies")
    done = carried(page, attrs, args, args.done and [parse_done(d) for d in args.done], "data-done")
    if args.after:
        prev = args.after.resolve()
        base = threads(read_tag(prev.read_text(encoding="utf-8")),
                       next((i + 1 for i, e in enumerate(entries) if e["path"] == prev), len(entries) - 1))
    elif attrs.get("data-page") != page_id(page):
        base = []   # a tag copied over from the file this one was made from: its threads were that page's
    elif args.next_round:
        base = threads(attrs, current)
    else:
        base = listed(attrs, "data-carry") + reopened(attrs)
    again = [parse_again(old, new, base) for old, new in args.again or []]
    asks = with_again(asks, [new for old, new in again if old.get("kind") == "ask"])
    replies = with_again(replies, [new for old, new in again if old.get("kind") != "ask"])
    # what --answered can close: this round's questions and replies, then the ones carried from earlier rounds
    pool = ([{**a, "kind": "ask"} for a in json.loads(asks or "[]")]
            + [{**r, "kind": "reply"} for r in json.loads(replies or "[]")] + base + closed_earlier(entries, page))
    given = args.answered and list({x["id"]: x for x in (
        parse_answered(q, a, pool) for q, a in args.answered)}.values())
    # a thread from an earlier version closes there: its answer stays in its own round, with no row on this one
    earlier = [x for x in given or [] if version_of(entries, x.get("from"), page)]
    answered = carried(page, attrs, args, given and [x for x in given if x not in earlier], "data-answered")
    closed = json.dumps(json.loads(answered or "[]") + earlier, ensure_ascii=False)
    settled = [find_thread(q, base, "--settled") for q, why in args.settled or [] if why.strip() or
               fail('--settled needs the thread as the page shows it ([Part label] "quote" its words) and one line on why it is settled')]
    carrying_now = carry(base, asks, replies, closed, tuple(old["id"] for old, _ in again) + tuple(x["id"] for x in settled))
    replies, carrying_now = with_gists(replies, carrying_now, args.gist, threads(attrs, current) + base)
    return {"asks": asks, "updated": updated, "replies": replies, "done": done, "answered": answered,
            "carry": carrying_now,
            "again": [new for old, new in again if old.get("kind") == "ask"], "earlier": earlier, "settled": settled}


def with_gists(replies: str | None, carrying_now: str | None, given: list | None,
               previous: list[dict]) -> tuple[str | None, str | None]:
    """The short version of their note, on this run's replies and carried replies; never part of a thread's id."""
    own, old = json.loads(replies or "[]"), json.loads(carrying_now or "[]")
    pool = own + [t for t in old if t.get("kind") == "reply"]
    kept = {thread_key(t, "reply"): t["gist"] for t in previous if t.get("gist") and t.get("kind") == "reply"}
    for t in pool:
        if given is not None:
            t.pop("gist", None)   # "each run with --gist replaces the page's gists"
        elif not t.get("gist") and thread_key(t, "reply") in kept:
            t["gist"] = kept[thread_key(t, "reply")]
    for note, short in given or []:
        block, quote, said = copied_note(note)
        short = short.strip()
        if not short:
            fail('--gist needs their note as copied and its short version')
        found = [t for t in pool if (t.get("block") or None) == no_page(block)
                 and same_quote(t.get("quote"), quote) and words(t.get("said")) == said]
        if not found:
            notes = "; ".join((f'[{t.get("block") or "Page"}] ' + (f'"{t["quote"]}" ' if t.get("quote") else '')
                               + (t.get("said") or "")) for t in pool) or "none"
            fail(f'--gist: no note on the page matches {note.strip()!r}. Pass it as copied '
                 f'([Part label] "quote" their words). Its notes now: {notes}')
        for t in found:
            t["gist"] = short
    return tuple(json.dumps(xs, ensure_ascii=False) if xs else None for xs in (own, old))


def downloads_dir(prefs: Path | None = None) -> str:
    """Where Chrome saves downloads: its Default profile's setting, else ~/Downloads. The page saves its copy of each
    picture the user attaches there, and copies that path for the agent."""
    prefs = prefs or CHROME_PREFS
    try:
        found = json.loads(prefs.read_text(encoding="utf-8")).get("download", {}).get("default_directory")
    except (OSError, ValueError, AttributeError):
        found = None
    return found or str(Path.home() / "Downloads")


def git_top(start: Path) -> Path | None:
    """The repo a folder is in: the nearest folder at or above it holding .git; None outside every repo."""
    for d in (start, *start.parents):
        if (d / ".git").exists():
            return d
    return None


def feedback_folder(page: Path, workspace: Path | None, attrs: dict) -> Path:
    """The workspace's human-feedback folder, which the tag names (data-folder) and the page saves attachments under:
    --workspace, else the one the tag already names, else in the page's repo, the current directory's repo, or the
    current directory."""
    if workspace:
        return workspace / FOLDER
    if attrs.get("data-folder"):
        return Path(attrs["data-folder"])
    here = Path.cwd().resolve()
    return (git_top(page.parent) or git_top(here) or here) / FOLDER


def make_folder(folder: Path) -> str | None:
    """Make <folder>/attachments and the marker beside it if either is missing (the marker again if it names another
    place); returns the folder's path for the tag, or None for the skill's own folder, which it never fills."""
    if folder.resolve() == SKILL_DIR:
        warn(f"{folder} is the skill's own folder: attachments will go to Downloads instead (pass --workspace)")
        return None
    (folder / ATTACHMENTS).mkdir(parents=True, exist_ok=True)
    marker, path = folder / MARKER, str(folder)
    try:
        ok = json.loads(marker.read_text(encoding="utf-8")).get("folder") == path
    except (OSError, ValueError, AttributeError):
        ok = False
    if not ok:
        marker.write_text(json.dumps({"folder": path, "about": "Made by the human-feedback skill. A page checks this "
                                      "file to confirm you picked this folder; attachments go in attachments/."},
                                     indent=2) + "\n", encoding="utf-8")
    return path


def made_now() -> str:
    """When this run writes the tag: now, or HF_MADE (an ISO time) for a test that needs a round made earlier."""
    return os.environ.get("HF_MADE") or stamp(datetime.now())


def made_this_run(entries: list[dict], page: Path) -> str:
    """When this run writes the tag, also put in the page's own entry, so every version learns when this one was last
    written: the layer keeps a new round out of reach until it's opened, or until 2 hours after that."""
    made = made_now()
    for e in entries:
        if e["path"] == page:
            e["made"] = made
    return made


def write_tag(path: Path, text: str, attrs: dict, downloads: str) -> str:
    """Put the one tag (src, page, round, versions, asks, replies, done, answered, carry, frame, agent, agents, made,
    downloads, folder, pictures, appearance, file) into the page, replacing any old one, and the hiding style (HOLD_STYLE) in its head, on every round and version.
    file is the page's own absolute path, for the title row's tooltip; a page served over http can't know it."""
    attrs = {"downloads": downloads, **attrs, "file": str(path.resolve())}
    extra = "".join(f' data-{k}="{html.escape(str(attrs[k]))}"'
                    for k in ("page", "round", "versions", "asks", "updated", "replies", "done", "answered", "carry", "frame",
                              "agent", "agents", "at", "made", "downloads", "folder", "pictures", "appearance", "file")
                    if attrs.get(k))
    if attrs.get("analytics-url") is not None:
        extra += f' data-analytics-url="{html.escape(str(attrs["analytics-url"]))}"'
    tag = (f'<!-- human-feedback --><script src="{html.escape(attrs["src"])}"{extra}>'
           '</script>'
           '<!-- /human-feedback -->\n')
    text = BLOCK.sub("", HOLD.sub("", text))
    head = HEAD_OPEN.search(text)
    versions = listed(attrs, "versions")
    first = not attrs.get("frame") and str(attrs.get("round", "1")) == "1" and (not versions or versions[0].get("page") == attrs.get("page"))
    hold = FIRST_HOLD_STYLE if first else HOLD_STYLE
    text = text[:head.end()] + hold + text[head.end():] if head else hold + text
    ends = list(BODY_END.finditer(text))   # the last one: a page's script can hold "</body>" in a string
    end = ends[-1] if ends else None
    text = text[:end.start()] + tag + text[end.start():] if end else text.rstrip("\n") + "\n" + tag
    path.write_text(text, encoding="utf-8")
    return text


def dot_file(page: Path, suffix: str) -> Path:
    """A hidden file beside the page that the layer or the next run reads: .<page file>.<suffix>."""
    return page.with_name(f".{page.name}.{suffix}")


def write_sidecar(path: Path, text: str) -> None:
    """Write a hidden file whole or not at all: a page opening mid-write never reads half of it."""
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def round_file(page: Path) -> Path:
    """The hidden file beside the page that remembers its round, for when a rewrite drops the tag."""
    return dot_file(page, "round")


def agent_file(page: Path) -> Path:
    """The hidden file beside the page that remembers the lead agent's name, for when a rewrite drops the tag of a
    page with no other versions to take it from (the cursor would otherwise read "Agent")."""
    return dot_file(page, "agent")


def last_round(page: Path, attrs: dict) -> int:
    """The page's round from its tag, else from its round file, else 0 for a page never tagged."""
    for value in (attrs.get("data-round"),
                  round_file(page).read_text(encoding="utf-8").strip() if round_file(page).is_file() else None):
        if value and value.isdigit():
            return int(value)
    return 0


def last_pictures(page: Path, attrs: dict) -> str:
    """The tag's picture setting, else the page's last setting before a rewrite, else this build's default."""
    sidecar = dot_file(page, "pictures")
    for value in (attrs.get("data-pictures"), sidecar.read_text(encoding="utf-8").strip() if sidecar.is_file() else None):
        if value in ("on", "off"):
            return value
    return PICTURES_DEFAULT


def fail(message: str) -> None:
    """Stop with a message and exit code 2."""
    print(f"human-feedback: {message}", file=sys.stderr)
    sys.exit(2)


def warn(message: str) -> None:
    """A warning the agent should act on; the run still completes."""
    print(f"human-feedback: warning: {message}", file=sys.stderr)


def join_set(page: Path, args) -> list[dict]:
    """The set after adding page as the version that follows args.after (or updating it)."""
    prev = args.after.resolve()
    if not prev.is_file():
        fail(f"no such page: {prev}")
    entries = load_set(prev, read_tag(prev.read_text(encoding="utf-8"))) or [first_entry(prev)]
    mine = next((e for e in entries if e["path"] == page), None)
    if mine is None:
        if entries[-1]["path"] != prev:
            fail(f"{page_id(prev)} is not the latest version; latest is {entries[-1]['page']}")
        mine = {"path": page, "page": page_id(page), "at": stamp(datetime.now())}
        entries.append(mine)
    if args.name is not None:
        mine["name"] = args.name
    skill = skill_version()   # the skill this version was registered under, for --new-version's check next round
    if skill:
        mine["skill"] = skill
    for i, e in enumerate(entries[:-1]):
        if not e.get("name"):
            warn(f"version {i + 1} ({e['page']}) has no name: add_notes.py <that page> --name")
    return entries


def build_set(page: Path, attrs: dict, args) -> list[dict]:
    """This page's version list after the run: joined to an earlier one, renamed, or as it was."""
    if args.after:
        return join_set(page, args)
    entries = load_set(page, attrs)
    if args.name:
        if not attrs and round_file(page).is_file():   # tagged before: a rewrite of the whole file dropped the tag
            warn(f"{page_id(page)} has no tag (a rewrite drops it), so it has left its version list: if it is a "
                 "later version, add --after <the version before it>")
        entries = entries or [first_entry(page)]
        mine = next((e for e in entries if e["path"] == page), None)
        if mine is not None:
            mine["name"] = args.name
    return entries


def kept(page: Path, a: dict, folder: str | None) -> dict:
    """What another file's tag keeps as it was when this run rewrites it: the agent's lists, name and time, and the
    folder (its own, else this run's)."""
    return {"asks": a.get("data-asks"), "updated": a.get("data-updated"), "replies": a.get("data-replies"), "done": a.get("data-done"),
            "answered": a.get("data-answered"), "carry": a.get("data-carry"), "agent": a.get("data-agent"),
            "at": a.get("data-at"), "made": a.get("data-made"), "folder": a.get("data-folder") or folder,
            "pictures": last_pictures(page, a), "appearance": a.get("data-appearance")}


def with_earlier(a: dict, index: int, entries: list[dict], earlier: list[dict]) -> str | None:
    """A version's answered list once this run's chat answers from that version join it, each thread once."""
    path = entries[index]["path"]
    mine = [x for x in earlier if entries[x["from"] - 1]["path"] == path]
    merged = {x.get("id"): x for x in listed(a, "data-answered") + mine}
    return json.dumps(list(merged.values()), ensure_ascii=False) if merged else None


def sync(entries: list[dict], page: Path, round_no: int, folder: str | None, downloads: str,
         done: str | None = None, earlier: list[dict] | None = None) -> list[dict]:
    """Note each version's round and done marks, then rewrite the other versions' tags; returns those rewritten.
    Every page learns which notes later versions closed, so the check stays on the original note, and an earlier
    version takes the chat answers to its own threads, so they stay in the round that asked them."""
    others = []
    for e in entries:
        if e["path"] == page:
            e["round"] = round_no
            marks = json.loads(done or "[]")
        elif e["path"].is_file():
            other = e["path"].read_text(encoding="utf-8")
            a = read_tag(other)
            e["round"] = int(a.get("data-round", 1))
            marks = listed(a, "data-done")
            others.append((e, other))
        else:
            warn(f"can't find {e['page']}; it won't list newer versions")
            continue
        e.pop("done", None)
        if marks:
            e["done"] = marks
    for e, other in others:
        a = read_tag(other)
        write_tag(e["path"], other, {"src": a.get("src") or ASSET.as_uri(),
                                     "page": a.get("data-page") or e["page"], "round": e["round"],
                                     "versions": versions_attr(entries, e["path"]), "frame": a.get("data-frame"),
                                     **{**kept(e["path"], a, folder),
                                        "answered": with_earlier(a, entries.index(e), entries, earlier or [])}},
                  downloads)
    return [e for e, _ in others]


def frames(page: Path, text: str) -> list[Path]:
    """The local pages the page shows in an <iframe>, each once; remote and root-relative ones are skipped."""
    found = []
    for m in IFRAME.finditer(BLOCK.sub("", text)):
        src = html.unescape(m.group(1) if m.group(1) is not None else m.group(2))
        src = src.split("#")[0].split("?")[0]
        if not src or REMOTE.match(src):
            continue
        path = (page.parent / unquote(src)).resolve()
        if path.suffix.lower() in (".html", ".htm") and path.is_file() and path not in (page, *found):
            found.append(path)
    return found


def tag_frames(page: Path, text: str, src: str, folder: str | None, downloads: str, pictures: str) -> list[Path]:
    """Tag each framed page so its selections reach the page's notes; its own notes, if any, stay."""
    done = frames(page, text)
    for frame in done:
        inner = frame.read_text(encoding="utf-8")
        a = read_tag(inner)
        here = src if REMOTE.match(src) else Path(os.path.relpath(page.parent / src, frame.parent)).as_posix()
        own = a.get("data-page")   # reviewed on its own too: its tag stays as it was, plus the frame mark
        write_tag(frame, inner, {"src": a.get("src") if own else here, "page": own, "round": a.get("data-round"),
                                 "versions": a.get("data-versions"), "frame": "1", **kept(frame, a, folder),
                                 "pictures": last_pictures(frame, a) if own else pictures}, downloads)
    return done


def report(page: Path, text: str, round_no: int, entries: list[dict], others: list[dict], *, framed: int = 0) -> str:
    """One line on what was done, after any warnings about the marks."""
    body = STYLE_EL.sub("", BLOCK.sub("", text))
    drawn = any(LABEL.search(m.group(0)) for m in SCRIPT.finditer(body))
    body = SCRIPT.sub(r"\1\2", body)   # a data-note in the page's own script is a part it draws, not one written here
    body = COMMENT.sub("", body)
    for warning in check_parts(body):
        if not (drawn and warning.startswith("no data-note")):
            warn(warning)
    parts = len(LABEL.findall(body))
    plural = "s" * (parts != 1)
    line = f"human-feedback: on for {page} (round {round_no}, {parts} part{plural}"
    line += " written in the HTML, plus any the page's script draws)" if drawn else ")"
    mine = next((i for i, e in enumerate(entries) if e["path"] == page), None)
    if mine is not None:
        name = entries[mine].get("name")
        line += f" · version {mine + 1} of {len(entries)}" + (f' "{name}"' * bool(name))
        line += "; still needs a name" * (not name)
        if others:
            line += f"; updated {len(others)} other version{'s' * (len(others) != 1)}"
    line += f"; selections pass up from {framed} framed page{'s' * (framed != 1)}" * bool(framed)
    return line + waiting(read_tag(text))


def waiting(tag: dict) -> str:
    """The agent's questions, replies, done marks, threads answered in chat and carried threads the tag holds, as the
    report's last words."""
    asked, upd, replied, done, chat, old = (len(json.loads(tag.get(k) or "[]")) for k in (
        "data-asks", "data-updated", "data-replies", "data-done", "data-answered", "data-carry"))
    return (f"; {asked} question{'s' * (asked != 1)}" * bool(asked)
            + f"; {upd} update{'s' * (upd != 1)}" * bool(upd)
            + f"; {replied} repl{'ies' if replied != 1 else 'y'}" * bool(replied)
            + f"; {done} done" * bool(done)
            + f"; {chat} answered in chat" * bool(chat)
            + f"; {old} earlier thread{'s' * (old != 1)} carried over" * bool(old))


def version_files(page: Path, attrs: dict) -> list[Path]:
    """The page and every version of it whose folder is still there (a moved version's may be gone)."""
    return [e["path"] for e in load_set(page, attrs) if e["path"].parent.is_dir()] or [page]


def receive(page: Path, attrs: dict, feedback_file: Path | None) -> str:
    """Write the receipt beside the page and every version of it; say what was done."""
    if not attrs:
        fail(f"notes aren't on for {page}: run add_notes.py on it first")
    if feedback_file is not None:
        record_question_status(page, attrs, feedback_file)
    when = int(time.time() * 1000)
    files = version_files(page, attrs)
    for f in files:
        write_sidecar(dot_file(f, "received.js"), f"window.PN_RECEIVED && PN_RECEIVED({when});\n")
    where = f"{len(files)} versions" if len(files) > 1 else "the page"
    return f"human-feedback: received, for {page} ({where}); an open page shows Feedback received within a few seconds"


def done_file(page: Path) -> Path:
    """The hidden file beside the page that says the agent is done, with its summary."""
    return dot_file(page, "done.js")


def take_back_done(files: list[Path]) -> None:
    """A new round begins: delete the done file beside each of these pages."""
    for f in files:
        done_file(f).unlink(missing_ok=True)


def reopen(page: Path, attrs: dict) -> str:
    """--reopen: take back a Done the user didn't mean to give, on the page and every version of it. The page shows Done
    only while a done file sits beside it, so a reload of the open page brings back its notes column and Copy."""
    if not attrs:
        fail(f"notes aren't on for {page}: run add_notes.py on it first")
    files = version_files(page, attrs)
    had = [f for f in files if done_file(f).exists()]
    take_back_done(files)
    if not had:
        return f"human-feedback: {page} wasn't marked Done; nothing to reopen"
    where = f"{len(files)} versions" if len(files) > 1 else "the page"
    return (f"human-feedback: reopened, for {page} ({where}); reload the open page with show.py --reopen so it shows "
            "the notes column and Copy again")


STILL_OPEN = re.compile(r"Still open(?: \(questions asked through (\S+)\))?: (none|\w+(?:, \w+)*)")
OLD_STATUS = "Review question status: "   # copied by a tab opened before 1.161.0


def question_key(question: dict) -> tuple[str, str]:
    return question["id"], question.get("authoredAt") or ""


def active_questions(tag: dict) -> list[dict]:
    closed = {x.get("id") for x in listed(tag, "data-answered") if x.get("answer")}
    carried = [a for a in listed(tag, "data-carry") if a.get("kind") == "ask"]
    asks = {a["id"]: a for a in carried + listed(tag, "data-asks") if a.get("id") and a["id"] not in closed}
    return list(asks.values())


def moment(when: str | None) -> float | None:
    """A date's time, or None when there is none to read."""
    try:
        return datetime.fromisoformat(when or "").timestamp()
    except ValueError:
        return None


def names_page(page: Path, attrs: dict, paste: str) -> bool:
    """Whether the paste is a copy of this page: it's the one under Notes on, or the latest of the Versions."""
    named = [re.sub(r" \(\d+\)$", "", line.removeprefix("Notes on "))
             for line in paste.splitlines() if line.startswith("Notes on ")]
    named += re.findall(r"^Round \d+[^\n]* \(latest\): (.+)$", paste, re.M)
    return bool({str(page), str(page.resolve()), page_id(page), attrs.get("data-page")}.intersection(named))


def still_open_status(page: Path, attrs: dict, asks: list[dict], line: str, paste: str) -> list[list]:
    """The line names the open questions; every other one the copied page held is answered. One asked after the page's
    newest question was never on it, so it stays open."""
    found = STILL_OPEN.fullmatch(line.strip())
    through = moment(found[1]) if found else None
    if not found or (found[1] and through is None):
        fail("--feedback-file: could not read the Still open line. Use the full Copy text.")
    if not names_page(page, attrs, paste):
        fail("--feedback-file: the paste does not name this page as its latest version")
    still = set(found[2].split(", "))
    records = []
    for ask in asks:
        asked = moment(ask.get("authoredAt"))
        held = asked is None or (through is not None and asked <= through)
        records.append([*question_key(ask), held and ask["id"] not in still])
    return records


def old_status(attrs: dict, asks: list[dict], line: str) -> list[list]:
    """The list of every question that a tab opened before 1.161.0 copies."""
    try:
        snapshot = json.loads(line)
        records = snapshot["questions"]
        if snapshot["page"] != attrs.get("data-page") or snapshot["round"] != int(attrs["data-round"]):
            fail("--feedback-file: the question status is for a different page or round")
        if not isinstance(records, list) or any(not isinstance(row, list) or len(row) != 3
                or not all(isinstance(value, str) for value in row[:2]) or type(row[2]) is not bool for row in records):
            raise ValueError("invalid question records")
    except (ValueError, TypeError, KeyError):
        fail("--feedback-file: could not read the question status. Use the full Copy text.")
    known = {question_key(a) for a in asks}
    return [row for row in records if (row[0], row[1]) in known]


def read_question_status(page: Path) -> list[list]:
    sidecar = dot_file(page, "question-status.json")
    if sidecar.is_file():
        return json.loads(sidecar.read_text(encoding="utf-8"))
    return []


def record_question_status(page: Path, attrs: dict, feedback_file: Path) -> None:
    """Save which of the page's questions the paste leaves open, in place of what an earlier paste said. The note text
    stays in the user's paste."""
    try:
        paste = feedback_file.read_text(encoding="utf-8").replace("\r\n", "\n")
    except (OSError, UnicodeError) as exc:
        fail(f"--feedback-file: {exc}")
    lines = [line for line in paste.splitlines() if line.startswith(("Still open:", "Still open (", OLD_STATUS))]
    asks = active_questions(attrs)
    if not lines:
        if asks:
            warn("the paste has no Still open line, so no question was closed. Use the full Copy text, or --answered with "
                 "the user's words.")
        return
    if lines[-1].startswith(OLD_STATUS):
        records = old_status(attrs, asks, lines[-1][len(OLD_STATUS):])
    else:
        records = still_open_status(page, attrs, asks, lines[-1], paste)
    if records:
        write_sidecar(dot_file(page, "question-status.json"), json.dumps(records) + "\n")


def unanswered_asks(page: Path, attrs: dict) -> list[str]:
    """A receipt alone does not answer any question in the latest version."""
    files = [f for f in version_files(page, attrs) if f.is_file()]
    if not files:
        return []
    latest = read_tag(files[-1].read_text(encoding="utf-8"))
    newest = next((rows for rows in map(read_question_status, reversed(files)) if rows), [])
    status = {(i, dated): closed for i, dated, closed in newest}
    return [a["text"] for a in active_questions(latest) if not status.get(question_key(a))]


def converge(page: Path, attrs: dict, changed: list[str], steps: list[str]) -> str:
    """Write the done file, with the summary, beside the page and every version of it; say what was done."""
    if not attrs:
        fail(f"notes aren't on for {page}: run add_notes.py on it first")
    record = {"at": int(time.time() * 1000), "questionsChecked": True,
              "changed": [c.strip() for c in changed if c.strip()],
              "next": [x.strip() for x in steps if x.strip()]}
    body = json.dumps(record, ensure_ascii=False).replace("</", "<\\/")   # nothing in it can close the script
    files = version_files(page, attrs)
    for f in files:
        write_sidecar(done_file(f), f"window.PN_DONE && PN_DONE({body});\n")
    where = f"{len(files)} versions" if len(files) > 1 else "the page"
    n, m = len(record["changed"]), len(record["next"])
    return (f"human-feedback: done, for {page} ({where}); {n} change{'s' * (n != 1)}"
            + f", {m} next step{'s' * (m != 1)}" * bool(m) + "; an open page shows Done within a few seconds")


def warn_steps(steps: list[str]) -> None:
    """Warn about --next-step lines that don't start with who does them: You (the user) or Your agent."""
    for step in (x.strip() for x in steps):
        if step and step.split()[0] not in ("You", "Your"):
            warn(f'--next-step "{step}" should start with who does it: "You …" for the user, "Your agent …" for the agent')


def warn_bullets(changed: list[str]) -> None:
    """Warn about --what-changed lines that aren't What we did bullets: each starts with "We", and 3 to 5 is the summary
    (more than 5 warns; fewer than 3 doesn't)."""
    lines = [c.strip() for c in changed if c.strip()]
    for line in lines:
        if not line.startswith("We "):
            warn(f'--what-changed "{line}" should start with "We " ("We darkened the header.")')
    if len(lines) > 5:
        warn(f"--converged has {len(lines)} --what-changed lines: keep What we did to 3 to 5 high-level bullets")


def skill_version(skill: Path | None = None) -> str | None:
    """The skill's metadata.version, read from SKILL.md's frontmatter; None when it can't be read."""
    try:
        text = (skill or SKILL).read_text(encoding="utf-8")
    except OSError:
        return None
    front = re.match(r"---\n(.*?)\n---", text, re.S)
    found = front and re.search(r"^metadata:[ \t]*\n(?:[ \t]+\S.*\n)*?[ \t]+version:[ \t]*['\"]?([^\s'\"]+)",
                               front.group(1) + "\n", re.M)
    return found.group(1) if found else None


def next_stem(stem: str, place: int) -> str:
    """The file name (without its extension) of the version after the one at `place` in the stepper: the second
    version is 2. A name that numbers its versions (alert-r2, round-2) gets the next number, never one already used;
    any other name gets -r2, -r3 added."""
    new = place + 1
    found = SERIES.match(stem)
    if found:
        number = max(new, int(found["n"]) + 1)
    else:
        found = NUMBERED.match(stem)
        if not found or int(found["n"]) != place:
            return f"{stem}-r{new}"
        number = new
    digits = found["n"]
    return found["head"] + (str(number).zfill(len(digits)) if digits.startswith("0") else str(number))


def repoint(text: str, old: str, new: str) -> tuple[str, int]:
    """The page with its references into the folder `old` (src, href and poster attributes and CSS url(), starting
    old/ or ./old/, the name as written or percent-encoded) pointing into `new`; and how many it changed."""
    count = 0
    for was, to in {old: new, url_quote(old): url_quote(new)}.items():
        for pre in (r"\b(?:src|href|poster)\s*=\s*[\"']?", r"\burl\(\s*(?:[\"']|&quot;|&#39;|&#x27;)?"):
            text, n = re.subn(rf"(?P<pre>{pre})(?P<dot>(?:\./)?){re.escape(was)}/",
                              lambda found, to=to: f"{found['pre']}{found['dot']}{to}/", text, flags=re.I)
            count += n
    return text, count


def latest_set(page: Path) -> list[dict]:
    """The version list of the set `page` belongs to, read from its latest version's own tag (the freshest copy)."""
    entries = load_set(page, read_tag(page.read_text(encoding="utf-8"))) or [first_entry(page)]
    if not any(e["path"] == page for e in entries):
        fail(f"{page_id(page)} isn't in its own version list: name the latest version instead")
    last = entries[-1]
    if last["path"] != page:
        if not last["path"].is_file():
            fail(f"can't find the latest version, {last['page']}")
        entries = load_set(last["path"], read_tag(last["path"].read_text(encoding="utf-8")))
        if not entries:
            fail(f"{last['page']} has no version list (a rewrite drops the tag): run "
                 f"add_notes.py {last['path']} --after <the version before it> --name … first")
    return entries


def _libc_clonefile():
    try:
        fn = ctypes.CDLL(ctypes.util.find_library("c"), use_errno=True).clonefile
    except (OSError, AttributeError, TypeError):
        return None
    fn.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int]
    fn.restype = ctypes.c_int
    return fn


_CLONEFILE = _libc_clonefile()


def clone_or_copy(src, dst) -> None:
    """Copy one file for a new version's folder as an APFS clone (macOS `cp -c`): it shares the original's disk space
    until either is edited, so a round of pictures costs almost nothing. Another disk or system: a normal copy."""
    if _CLONEFILE is not None and _CLONEFILE(os.fsencode(src), os.fsencode(dst), 0) == 0:
        return
    shutil.copy2(src, dst)


def make_version(page: Path) -> tuple[Path, Path]:
    """--new-version: copy the set's latest version to the next file name, with its folder of pictures if it has one,
    and warn if the skill changed since that version was registered. Returns the new file and the one it came from."""
    entries = latest_set(page)
    old = entries[-1]["path"]
    if len(entries) > 1 and not entries[-1].get("name"):
        fail(f"{page_id(old)} isn't finished yet (it has no name), so no new version was made. Finish it with its "
             f"follow-up run (add_notes.py {old} --name …), or delete it if it was made by mistake. What it carries "
             "was printed when it was made")
    stem = next_stem(old.stem, len(entries))
    new = old.with_name(stem + old.suffix)
    old_dir, new_dir = old.with_name(old.stem), old.with_name(stem)
    if new.exists():
        fail(f"{page_id(new)} already exists: not overwriting it (if it is the next version already, register it "
             "with --after)")
    if old_dir.is_dir() and new_dir.exists():
        fail(f"{page_id(new_dir)} already exists: not copying {old_dir.name}/ over it")
    if old != page:
        print(f"human-feedback: note: {page_id(page)} isn't the latest version; making the next one from "
              f"{page_id(old)}")
    recorded, now = entries[-1].get("skill"), skill_version()
    if recorded and now and recorded != now:
        warn(f"the human-feedback skill changed since the last version was registered ({recorded}, now {now}): "
             f"re-read {SKILL} before applying the notes")
    text = old.read_text(encoding="utf-8")
    pictures = ""
    if old_dir.is_dir():
        shutil.copytree(old_dir, new_dir, copy_function=clone_or_copy)
        text, count = repoint(text, old_dir.name, new_dir.name)
        pictures = f"; copied {old_dir.name}/ to {new_dir.name}/ and pointed {count} reference{'s' * (count != 1)} at it"
        if not count:
            warn(f"no src, href or url() in the page points into {old_dir.name}/: check how it loads its pictures")
    new.write_text(text, encoding="utf-8")
    print(f"human-feedback: made {new} from {old} (version {len(entries) + 1}){pictures}")
    return new, old


def prev_file(page: Path) -> Path:
    """The hidden file beside a version that holds the version before it, as it was when this one was made."""
    return dot_file(page, "prev.js")


def snapshot_previous(page: Path, prev: Path | None) -> None:
    """Write .<page file>.prev.js: `prev`'s text as it is now, without the notes tag, the hold style or any script,
    for the wipe. Only if it isn't there yet: it records the previous version as it was when this one was made.
    No `prev` (the run has no --after): nothing."""
    out = prev_file(page)
    if prev is None or out.exists():
        return
    prev = prev.resolve()
    html_text = SCRIPT_EL.sub("", BLOCK.sub("", HOLD.sub("", prev.read_text(encoding="utf-8"))))
    record = {"from": Path(os.path.relpath(prev, page.parent)).as_posix(),
              "at": datetime.now().astimezone().isoformat(timespec="seconds"), "html": html_text}
    write_sidecar(out, f"window.PN_PREV && PN_PREV({json.dumps(record)});\n")


def carrying(carry_json: str | None) -> str:
    """The threads this round carries, as lines an --again can paste, so the agent can see what to ask again; '' for none."""
    rows = [(t.get("kind"), t.get("from"), t.get("block"), t.get("quote"), t.get("text")) for t in json.loads(carry_json or "[]")]
    if not rows:
        return ""
    return ("\nhuman-feedback: carrying these earlier threads until the user answers (their paste shows any they closed). "
            "Put any new review questions in the page itself. Before the follow-up run, check each one against this version's "
            "changes and their whole paste: if your changes settled it or made it moot (its subject removed, replaced, or "
            "decided by the user elsewhere), close it now with --settled '<thread as shown below>' \"<one line on why>\" so it "
            "isn't carried on (one the user answered in chat takes --answered with their words):\n" + "\n".join(
                f"  {'question' if kind == 'ask' else 'reply'}, round {origin}: "
                + (f"[{block}] " if block else "") + (f'"{quote}" ' if quote else "") + (text or "")
                for kind, origin, block, quote, text in rows))


def next_step(page: Path) -> str:
    """What to do after --new-version: apply the notes to the new file, then run this in one go."""
    script = Path(__file__).resolve()
    return (f"human-feedback: next: apply their notes to {page}. Answer direct questions in Notes with --reply. "
            "Then run this with your replies and any --done, --answered or --settled entries "
            "(review each carried thread listed above first):\n"
            f"  python3 {shlex.quote(str(script))} {shlex.quote(str(page))} --name \"…\"")


def start_version(page: Path, args) -> Path:
    """--new-version: make the set's next version and return it, with args.after set to the version it came from so
    the run registers it as --after would. It only makes the file: the name, questions, replies and done
    marks go in the follow-up run it prints, and the other modes are runs of their own."""
    clash = [flag for flag, given in (
        ("--after", args.after), ("--next-round", args.next_round), ("--received", args.received),
        ("--converged", args.converged), ("--reopen", args.reopen), ("--name", args.name), ("--ask", args.ask), ("--updated", args.updated),
        ("--added", args.added),
        ("--reply", args.reply), ("--done", args.done), ("--gist", args.gist), ("--answered", args.answered),
        ("--settled", args.settled), ("--again", args.again), ("--what-changed", args.what_changed), ("--helper", args.helper), ("--owns", args.owns),
        ("--next-step", args.next_step)) if given]
    if clash:
        fail(f"--new-version can't go with {', '.join(clash)}: it only makes the file. Name it and pass any "
             "review flags in the follow-up run it prints")
    if not page.is_file():
        fail(f"no such page: {page}")
    new, args.after = make_version(page)
    return new


def part_labels(text: str) -> set[str]:
    """Every part's label as the page names it, casefolded: data-note="…", else its first heading."""
    parser = PartParagraphs()
    parser.feed(STYLE_EL.sub("", SCRIPT_EL.sub("", text)))
    parser.close()
    return {" ".join((part["label"] or part["head"] or "").split()).casefold() for part in parser.parts} - {""}


def agents_attr(page: Path, attrs: dict, args, lead: str | None, text: str) -> str | None:
    """The tag's data-agents: the lead, then each helper with the parts it made, as JSON; None with no helper, so a page
    one agent made reads as it always has. --helper and --owns replace the list; a run with neither keeps the page's own."""
    if args.helper is None and args.owns is None:
        if attrs.get("data-page") != page_id(page):
            return None   # a tag copied over from the version this one was made from: its helpers made that one
        own = [a for a in listed(attrs, "data-agents") if not a.get("lead") and a.get("name")]
        helpers = {a["name"]: list(a.get("owns") or []) for a in own}
    else:
        helpers = {}
        for raw in args.helper or []:
            name = " ".join(raw.split())
            if not name or len(name) > AGENT_MAX:
                fail(f"--helper is a name, {AGENT_MAX} characters at most: {name[:AGENT_MAX + 10]}")
            if lead and name.casefold() == lead.casefold():
                fail(f"--helper {name} is the lead (--agent): name only the other agents")
            if any(name.casefold() == h.casefold() for h in helpers):
                fail(f"--helper {name} is named twice")
            helpers[name] = []
        if len(helpers) > HELPERS_MAX:
            fail(f"--helper: {HELPERS_MAX} helpers at most, one colour each")
        labels = part_labels(text)
        for raw in args.owns or []:
            found = OWNS.fullmatch(raw)
            if not found:
                fail(f'--owns takes a helper and one part: "Codex:[Part label]", not {raw}')
            name, label = " ".join(found.group(1).split()), " ".join(found.group(2).split())
            who = next((h for h in helpers if h.casefold() == name.casefold()), None)
            if who is None:
                fail(f"--owns {raw}: {name} is not a --helper on this run")
            if label not in helpers[who]:
                helpers[who].append(label)
            if label.casefold() not in labels:
                warn(f'--owns: no part labelled "{label}" on the page: the lead wipes it in until a part has that label')
    if not helpers:
        return None
    if not lead:
        fail("--helper needs the lead's name too: pass --agent")
    return json.dumps([{"name": lead, "lead": True}, *({"name": n, "owns": o} for n, o in helpers.items())],
                      ensure_ascii=False)


def parse_args(argv) -> argparse.Namespace:
    """The command line."""
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("page", type=Path)
    ap.add_argument("--agent", help='your name, as people call you ("Claude", "Codex"): your cursor on the page shows it')
    ap.add_argument("--helper", action="append", metavar="NAME",
                    help='another agent that made parts of the page ("Codex"): its own cursor wipes in what it owns')
    ap.add_argument("--owns", action="append", metavar="NAME:[PART]",
                    help='one part a helper made: "Codex:[Part label]"')
    ap.add_argument("--next-round", action="store_true", help="start a fresh notes column")
    ap.add_argument("--copy", action="store_true", help="load the layer from beside the page")
    ap.add_argument("--pictures", choices=("on", "off"), help="allow picture attachments (a later run keeps the setting)")
    ap.add_argument("--appearance", choices=("off", "sidebars", "page"),
                    help="Auto, Light and Dark for the sidebars (the default), the whole page, or off")
    ap.add_argument("--workspace", type=Path, help="the agent's workspace folder: their attachments go in its "
                    "human-feedback/attachments/ (default: the page's repo, else the current directory's repo, else "
                    "the current directory)")
    ap.add_argument("--after", type=Path, help="the version this page was made from")
    ap.add_argument("--new-version", action="store_true",
                    help="make and register the set's next version from its latest, and print the next step")
    ap.add_argument("--name", help="this version's name, two or three words")
    ap.add_argument("--changed", help=argparse.SUPPRESS)   # no longer used: accepted so older commands don't fail
    ap.add_argument("--ask", action="append", help='a question on a part: \'[Part] "quote" …\'')
    ap.add_argument("--updated", action="append", metavar="CHANGE",
                    help='changed content from their notes (Updated pill); pass all --updated/--added entries together: \'[Part] "quote" what changed\'')
    ap.add_argument("--added", action="append", metavar="CHANGE",
                    help='a part added from their notes (New wins over Updated); pass all --updated/--added entries together: \'[Part] "quote" what was added\'')
    ap.add_argument("--reply", nargs=2, action="append", metavar=("NOTE", "ANSWER"),
                    help='answer one of their notes: \'[Part] "quote" their words\' "your answer"')
    ap.add_argument("--done", action="append", metavar="NOTE",
                    help='one of their notes, carried out as the user asked: a ✅ answers it')
    ap.add_argument("--gist", nargs=2, action="append", metavar=("NOTE", "SHORT"),
                    help='a short version of their note on a reply or carried reply: \'[Part] "quote" their words\' "short version"')
    ap.add_argument("--answered", nargs=2, action="append", metavar=("QUESTION", "ANSWER"),
                    help='close one of your questions the user answered in chat: '
                         '\'[Part] "quote" your question\' "their words"')
    ap.add_argument("--settled", nargs=2, action="append", metavar=("THREAD", "WHY"),
                    help='close an earlier question or reply this version carries because your changes settled it or made it '
                         'moot: \'[Part] "quote" the thread as the page shows it\' "one line on why"; it is not carried on')
    ap.add_argument("--again", nargs=2, action="append", metavar=("THREAD", "SHORTER"),
                    help='ask again, shorter, a question or reply left unanswered that still needs an answer: '
                         '\'[Part] "quote" what the page asked\' "shorter words"; it replaces the old thread')
    ap.add_argument("--received", action="store_true", help="their paste reached the agent: lock what the user sent")
    ap.add_argument("--feedback-file", type=Path, help="full Copy text to record with --received")
    ap.add_argument("--converged", action="store_true", help="the loop is done: the page says Done, with a summary")
    ap.add_argument("--reopen", action="store_true", help="take back a Done: the page is open for notes again")
    ap.add_argument("--what-changed", action="append", metavar="CHANGE",
                    help='one bullet of What we did across all versions, starting "We" (3 to 5 in all)')
    ap.add_argument("--what-didnt", nargs=2, action="append", help=argparse.SUPPRESS)   # no longer used, likewise
    ap.add_argument("--next-step", action="append", metavar="STEP",
                    help="one thing to do next, now the review is done")
    ap.add_argument("--hold", action="store_true",
                    help="ready the page without opening it")
    return ap.parse_args(argv)


def open_page(page: Path) -> None:
    """Use the existing opener after preparation; an opening failure never makes preparation fail."""
    command = f"python3 {shlex.quote(str(SHOW))} {shlex.quote(str(page))}"
    output = io.StringIO()
    try:
        sys.dont_write_bytecode = True   # importing a sibling must leave no cache in the shipped skill
        import show  # pylint: disable=import-outside-toplevel
        with redirect_stdout(output):
            code = show.main([str(page)])
    except Exception as exc:  # pylint: disable=broad-except
        why = str(exc) or type(exc).__name__
    else:
        why = f"show.py exited {code}" if code else ""
    if why:
        print(f"human-feedback: couldn't open {page}: {why}. Open it by hand: {command}")
    else:
        details = "; ".join(line.removeprefix("human-feedback: ") for line in output.getvalue().splitlines())
        if details.startswith("left it closed:"):
            print(f"human-feedback: {details}")
        else:
            print(f"human-feedback: opened {page}" + (f"; {details}" if details else ""))


def require_review_proof(page: Path) -> None:
    """Reject incomplete proof before any page or sidecar write."""
    sys.dont_write_bytecode = True
    import review_proof  # pylint: disable=import-outside-toplevel
    errors = review_proof.check_file(page)
    if errors:
        fail("Review refused: " + "; ".join(errors) + f". Copy {PROOF_TEMPLATE} into the page and fill it in.")


def main(argv=None, *, analytics_url: str | None = None) -> int:
    """Add or replace the tag, sync the version set, and report; an internal override can disable analytics."""
    args = parse_args(argv)
    if args.changed is not None:
        warn("--changed is no longer used: say what changed in your replies and done marks")
    if args.what_didnt:
        warn('--what-didnt is no longer used: anything you didn\'t do goes in a --what-changed line starting with "We"')

    page = args.page.resolve()
    if args.new_version:
        page = start_version(page, args)
    elif not page.is_file():
        fail(f"no such page: {page}")
    elif args.after and not args.name:
        fail("--after needs --name")
    # Copying an unshown draft and acknowledging old notes do not admit a review.
    if not (args.new_version or args.received or args.reopen):
        require_review_proof(page)
    text = page.read_text(encoding="utf-8")
    attrs = read_tag(text)
    pictures = args.pictures or last_pictures(page, attrs)
    appearance = args.appearance or attrs.get("data-appearance")
    workspace = args.workspace.expanduser().resolve() if args.workspace else None
    if workspace and not workspace.is_dir():
        fail(f"--workspace: no such folder: {workspace}")
    agent = " ".join((args.agent or "").split()) or attrs.get("data-agent")   # a run without --agent keeps the last name
    if agent and len(agent) > AGENT_MAX:
        fail(f"--agent is a name, {AGENT_MAX} characters at most: {agent[:AGENT_MAX + 10]}…")
    if args.feedback_file and not args.received:
        fail("--feedback-file goes with --received")
    if args.reopen:
        if any((args.converged, args.received, args.next_round, args.new_version, args.copy, args.after, args.name, args.ask,
                args.updated, args.added, args.reply, args.done, args.gist, args.answered, args.settled, args.again, args.helper, args.owns,
                args.appearance, args.what_changed, args.next_step)):
            fail("--reopen goes on its own")
        print(reopen(page, attrs))
        return 0
    if (args.what_changed or args.next_step) and not args.converged:
        fail("--what-changed and --next-step go with --converged")
    if args.converged:
        if any((args.received, args.next_round, args.copy, args.after, args.name, args.ask, args.updated, args.added, args.reply,
                args.done, args.gist, args.answered, args.settled, args.again, args.helper, args.owns, args.appearance)):
            fail("--converged goes on its own, with --what-changed and --next-step")
        waiting_on = unanswered_asks(page, attrs)
        if waiting_on:
            fail(f"--converged: {len(waiting_on)} unanswered question(s): "
                 + "; ".join(f'"{t}"' for t in waiting_on)
                 + ". Record the full Copy text with --received --feedback-file, or use --answered for a question "
                 "the user answered elsewhere. Use --settled for a carried question the changes made moot.")
        if not args.what_changed:
            fail("--converged needs at least one --what-changed")
        warn_bullets(args.what_changed)
        warn_steps(args.next_step or [])
        if attrs and pictures == "on":
            make_folder(feedback_folder(page, workspace, attrs))
        print(converge(page, attrs, args.what_changed, args.next_step or []))
        return 0
    if args.received:
        if any((args.next_round, args.copy, args.after, args.name, args.ask, args.updated, args.added, args.reply, args.done,
                args.gist, args.answered, args.settled, args.again, args.helper, args.owns, args.appearance)):
            fail("--received goes on its own")
        if attrs and pictures == "on":
            make_folder(feedback_folder(page, workspace, attrs))
        print(receive(page, attrs, args.feedback_file))
        return 0
    unplaced = (unplaced_asks(text, args.ask or []) + unplaced_asks(text, args.updated or [], "--updated")
                + unplaced_asks(text, args.added or [], "--added"))
    if unplaced and not os.environ.get("HF_PARTLESS_ASKS"):   # the layer tests' pages from before 1.115.0 only
        fail("\n".join(unplaced))
    broken = broken_links(text, args)
    if broken:
        fail("\n".join(broken))
    for message in unquoted_asks(text, args):
        warn(message)
    current = last_round(page, attrs)
    round_no = current + 1 if args.next_round or not current else current

    entries = build_set(page, attrs, args)
    why = copy_reason(page, attrs, args, entries)   # a re-run, a rewrite and a new version keep --copy
    src = copy_layer(page) if why is not None else ASSET.as_uri()
    if why:
        print(f"human-feedback: note: kept --copy, since {why}: the page loads {LAYER_BESIDE} from beside it, as a "
              "page served over http must")
    if not agent:   # a version rewritten whole has no tag to keep the name in: it keeps the name its versions carry
        agent = next((n for e in reversed(entries) if e["path"] != page and e["path"].is_file()
                      for n in [read_tag(e["path"].read_text(encoding="utf-8")).get("data-agent")] if n), None)
    if not agent and agent_file(page).is_file():   # no versions to ask either: the name this page last carried
        agent = " ".join(agent_file(page).read_text(encoding="utf-8").split())[:AGENT_MAX] or None
    lists = agent_lists(page, attrs, args, entries, current)
    earlier = lists.pop("earlier")
    lists["carry"], dropped = placed_carry(text, lists["carry"])
    if dropped:
        print(dropped_note(dropped))
    for message in unplaced_carry(lists["carry"]):
        warn(message)
    for asked in lists.pop("again"):
        if label_key(asked.get("block") or "") not in part_labels(text):
            fail(f'--again: "{asked["text"]}" is on [{asked.get("block")}], which this page lacks. '
                 "Close the old one with --answered and --ask it on a part")
    agents = agents_attr(page, attrs, args, agent, text)
    if args.after or args.next_round:   # a new round: the agent's done no longer stands
        take_back_done([e["path"] for e in entries] or [page])
    made = made_this_run(entries, page)
    own_attrs = attrs if attrs.get("data-page") == page_id(page) else {}
    round_at = (made if args.next_round else own_attrs.get("data-at") or
                next((e.get("at") for e in entries if e["path"] == page), None) or own_attrs.get("data-made") or made)
    date_messages(lists, attrs, made, next((e.get("at") for e in entries if e["path"] == page), None))
    snapshot_previous(page, args.after)
    folder = make_folder(feedback_folder(page, workspace, attrs)) if pictures == "on" else attrs.get("data-folder")
    downloads = downloads_dir()   # Chrome's Preferences, read once for every tag this run writes
    others = sync(entries, page, round_no, folder, downloads, lists["done"], earlier)
    text = write_tag(page, text, {"src": src, "page": page_id(page), "round": round_no,
                                  "versions": versions_attr(entries, page) if entries else None,
                                  "agent": agent, "agents": agents, "at": round_at, "made": made, "folder": folder,
                                  "pictures": pictures, "appearance": appearance, "analytics-url": analytics_url, **lists},
                     downloads)
    review_file = dot_file(page, "local-review")
    if src == ASSET.as_uri() and not attrs and not round_file(page).exists() and not review_file.exists() and not args.after:
        write_sidecar(review_file, "on\n")
    write_sidecar(round_file(page), f"{round_no}\n")
    write_sidecar(dot_file(page, "pictures"), f"{pictures}\n")
    if src == LAYER_BESIDE:
        write_sidecar(copy_file(page), "on\n")
    if agent:
        write_sidecar(agent_file(page), f"{agent}\n")
    framed = tag_frames(page, text, src, folder, downloads, pictures)
    line = report(page, text, round_no, entries, others, framed=len(framed))
    if lists["settled"]:
        line += f"; {len(lists['settled'])} carried thread{'s' * (len(lists['settled']) != 1)} settled, not carried on"
    if earlier:
        line += f"; {len(earlier)} answered in chat, closed in {'their' if len(earlier) != 1 else 'its'} own round"
    print((line + "\n" + next_step(page) if args.new_version else line)
          + (carrying(lists["carry"]) if args.new_version or args.next_round else ""))
    if args.new_version:
        print("Draft only: add or refresh the opening proof before the follow-up run, showing, or queueing.")
    if not args.new_version:
        if args.hold:
            print(f"Held without opening: {page}. Open it later: "
                  f"python3 {shlex.quote(str(SHOW))} {shlex.quote(str(page))}")
        else:
            open_page(page)
    return 0


if __name__ == "__main__":
    sys.exit(main())
