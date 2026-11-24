"""Validate a review's opening proof before preparation, showing, or queueing.

This portable, standard-library module is also vendored by queue clients. It
checks the evidence structure, not whether the cited evidence proves the claim.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
import re
import sys

VOID = {
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
    'param', 'source', 'track', 'wbr',
}
PLACEHOLDER = re.compile(
    r'\[(?:Exact|The user|What|The agreement|Evidence|Replace|Describe|Insert)\b[^]]*\]'
    r'|^(?:(?:Your ask|Agreed before building|Evidence):\s*)?'
    r'(?:TODO|TBD|placeholder)\s*[.!]?$', re.I,
)
HIDDEN_STYLE = re.compile(
    r'(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|'
    r'opacity\s*:\s*(?:0+(?:\.0*)?|\.0+))\s*(?:!important\s*)?(?:;|$)', re.I,
)

FIELDS = {'review-ask': 'ask', 'review-agreed': 'agreed points', 'review-evidence': 'evidence'}


@dataclass
class Node:
    """Only authored markup is inspected; scripts and hidden text don't count."""
    tag: str
    attrs: dict
    parent: Node | None = None
    children: list = field(default_factory=list)

    def visible(self) -> bool:
        """Reject explicitly hidden fields and ancestors."""
        here = self
        while here:
            if (here.tag in {'script', 'style', 'template'} or 'hidden' in here.attrs
                    or here.attrs.get('aria-hidden') == 'true'):
                return False
            if HIDDEN_STYLE.search(here.attrs.get('style') or ''):
                return False
            if here.tag == 'details' and 'open' not in here.attrs:
                return False
            here = here.parent
        return True

    def text(self) -> str:
        """Return readable text with whitespace normalized."""
        if not self.visible():
            return ''
        words = (c if isinstance(c, str) else c.text() for c in self.children)
        return ' '.join(' '.join(words).split())

    def within(self, other: Node) -> bool:
        """Include the node itself in containment."""
        here = self
        while here:
            if here is other:
                return True
            here = here.parent
        return False


class Page(HTMLParser):
    """Build the small tree needed for proof fields and evidence links."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('root', {})
        self.stack = [self.root]
        self.nodes = []
        self.review_tag = False

    def handle_starttag(self, tag, attrs):
        node = Node(tag, dict(attrs), self.stack[-1])
        self.stack[-1].children.append(node)
        self.nodes.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.stack.pop()

    def handle_endtag(self, tag):
        for index in range(len(self.stack)-1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)

    def handle_comment(self, data):
        if data.strip() == 'human-feedback':
            self.review_tag = True


def substantial(node: Node) -> bool:
    """Empty fields and unfinished template text cannot pass."""
    text = node.text()
    return len(text) >= 12 and not PLACEHOLDER.search(text)


def validate(text: str) -> list[str]:  # pylint: disable=too-many-locals
    """Name every missing or unusable part without changing anything."""
    page = Page()
    page.feed(text)
    proof = [n for n in page.nodes if n.attrs.get('id') == 'review-proof']
    if len(proof) != 1:
        return ['missing or duplicate opening proof block (id="review-proof"): '
                'include your ask, agreed points, and evidence']
    block = proof[0]
    parts = [n for n in page.nodes if 'data-note' in n.attrs]
    errors = []
    if not block.visible() or not parts or parts[0] is not block:
        errors.append('opening proof must be visible and the first data-note part')
    found = {}
    for ident, label in FIELDS.items():
        nodes = [n for n in page.nodes if n.attrs.get('id') == ident]
        if len(nodes) != 1 or not nodes[0].within(block) or not substantial(nodes[0]):
            errors.append('missing or incomplete ' + label)
        else:
            found[ident] = nodes[0]
    agreed = found.get('review-agreed')
    points = [n for n in page.nodes if n.tag == 'li' and agreed and n.within(agreed)]
    ids = [n.attrs.get('id', '') for n in points]
    if agreed and (not points or len(set(ids)) != len(ids)
                   or any(not ident or not substantial(n) for n, ident in zip(points, ids))
                   or any(sum(n.attrs.get('id') == ident for n in page.nodes) != 1
                          for ident in ids)):
        errors.append('agreed points need readable list items with unique ids; '
                      'state explicitly when no separate agreement exists')
    evidence = found.get('review-evidence')
    if evidence:
        for ident in ['review-ask', *filter(None, ids)]:
            links = [n for n in page.nodes if n.tag == 'a'
                     and n.attrs.get('href') == '#' + ident and n.within(evidence) and n.text()]
            supported = False
            for link in links:
                item = link.parent
                while item and item is not evidence and item.tag != 'li':
                    item = item.parent
                if (item and item.tag == 'li' and substantial(item)
                        and any(n.tag == 'cite' and n.within(item) and substantial(n)
                                for n in page.nodes)):
                    supported = True
            if not supported:
                errors.append('missing evidence for ' + ident
                              + ': link its id and name the source or check in cite')
    return errors


def has_review_markup(text: str) -> bool:
    """Recognize the existing notes format without probing installed partners."""
    parsed = Page()
    try:
        parsed.feed(text)
    except AssertionError:
        return bool(re.search(r'data-note|<!--\s*human-feedback\s*-->|human-feedback\.js',
                              text, re.I))
    return parsed.review_tag or any(
        'data-note' in node.attrs or
        (node.tag == 'script' and re.search(r'(?:^|/)human-feedback\.js(?:[?#]|$)',
                                          node.attrs.get('src') or ''))
        for node in parsed.nodes
    )


def check_file(path: Path, *, marked_only: bool = False) -> list[str]:
    """An unreadable review is never treated as checked."""
    try:
        text = path.read_text(encoding='utf-8')
        if marked_only and not has_review_markup(text):
            return []
        return validate(text)
    except (OSError, UnicodeError, AssertionError):
        return ['review source could not be read or parsed; proof is unverified']


def main(argv=None) -> int:
    """Portable command for clients that need to check a review before acting."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('page', type=Path)
    args = parser.parse_args(argv)
    errors = check_file(args.page)
    if errors:
        print('Review refused: ' + '; '.join(errors), file=sys.stderr)
        return 1
    print('Review proof is complete; evidence truth still requires the agent\'s check.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
