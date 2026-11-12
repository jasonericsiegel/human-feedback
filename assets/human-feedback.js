/* human-feedback: a comment layer for any HTML page the user reviews. Added by scripts/add_notes.py; never edit per page.
   Design: round 2, approved 2026-10-19. */
/* Page notes core: storage, anchors, highlights, the selection pill, and the copied text. */
(function () {
  const script = document.currentScript;
  const PICTURES = script.dataset.pictures !== 'off';   // older tags without a setting keep pictures on
  // every name the layer puts in the page's own DOM (highlights, tagged pictures, edited lines, the classes on <html> and
  // <body>) starts with this, so no page uses one by accident and no page rule can restyle them (the user: "names that are
  // unlikely to accidentally be replicated"). Everything else lives in the layer's shadow root, out of the page's reach
  const P = 'hf7k3-';
  // a block outside every part is keyed with no part name (` ¦ 3`), so no part's label can collide with it, and it reads
  // as Page wherever a part's name would show, as a note outside every part does
  const editHome = (label) => frameEditRef(String(label))?.block ?? String(label).split(' ¦ ')[0];
  const editPart = (label) => editHome(label) || 'Page';
  // what a block reads as on the page now: an edit's struck-out words left out
  const shownText = (n) => { const c = n.cloneNode(true); c.querySelectorAll('.' + P + 'del').forEach((d) => d.remove()); return c.textContent; };
  const undoKey = (ev) => {
    const z = String(ev.key || '').toLowerCase();
    if (!(ev.metaKey || ev.ctrlKey) || ev.altKey) return null;
    if (z === 'z') return ev.shiftKey ? 'redo' : 'undo';
    return z === 'y' && ev.ctrlKey && !ev.metaKey && !ev.shiftKey ? 'redo' : null;
  };
  const EDK = ['edits', 'editAt', 'editWas', 'editSpan'];

  function editColors(dark = `:root:where(.${P}paper-dark)`) {
    return `
    :root{--${P}ink:#1d1d1f;--${P}muted:#6b6b70;--${P}bub:#ececef;--${P}ins:#18794e;--${P}anc:rgba(255,207,40,.3);--${P}ancOn:rgba(255,207,40,.75);--${P}ag:rgba(124,58,237,.13);--${P}agOn:rgba(124,58,237,.24);
      --${P}insbg:#e7f5ec;--${P}insln:rgba(24,121,78,.45);--${P}del:#c4302b;--${P}delbg:#fdeceb;--${P}eb:#0a7cff;--${P}ebg:rgba(10,124,255,.07)}
    ${dark}{--${P}ink:#ececec;--${P}muted:#a3a3a8;--${P}bub:#2e2e31;--${P}ins:#30d158;--${P}anc:rgba(255,217,90,.22);--${P}ancOn:rgba(255,217,90,.34);--${P}ag:rgba(122,90,240,.22);--${P}agOn:rgba(122,90,240,.4);
      --${P}insbg:rgba(48,209,88,.16);--${P}insln:rgba(48,209,88,.5);--${P}del:#ff6b61;--${P}delbg:rgba(255,69,58,.16);--${P}eb:#4c9dff;--${P}ebg:rgba(76,157,255,.12)}
    `;
  }
  function editCss() {
    const v = (k) => `var(--${P}${k})`;
    return `
    .${P}lead{display:block}   /* the words before a nested list, as their own edit block */
    .${P}edit[contenteditable]{outline:2px solid ${v('eb')};outline-offset:6px;border-radius:2px;background:${v('ebg')};box-shadow:0 0 0 6px ${v('ebg')};cursor:text}   /* opened from Edit: framed, with the Editing tag on it */
    .${P}edit.${P}changed{box-shadow:-6px 0 0 -3px ${v('ins')}}
    .${P}edit.${P}changed[contenteditable]{box-shadow:0 0 0 6px ${v('ebg')}}
    /* the user's edit as tracked changes, in the user's writing app's colours: the words that go, then the words that come */
    del.${P}del{color:${v('del')};background:${v('delbg')};text-decoration:line-through;text-decoration-thickness:1.5px;text-decoration-color:${v('del')}}
    ins.${P}ws,del.${P}ws{white-space:pre-wrap}
    ins.${P}ins{color:${v('ins')};background:${v('insbg')};text-decoration:none;box-shadow:inset 0 -1.5px 0 ${v('insln')}}
    `;
  }
  function editTagCss() {
    return `
    .pn-etag{position:fixed;z-index:2147483000;display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px 0 7px;border-radius:6px 6px 0 0;
      background:var(--${P}eb,#0a7cff);color:#fff;font:600 11.5px/1 var(--pn-ui);opacity:0;pointer-events:none;transition:opacity .12s}
    .pn-etag.below{border-radius:0 0 6px 6px}
    .pn-etag.show{opacity:1}
    .pn-etag svg{width:14px;height:14px}
    .pn-etag .k{font-weight:500;opacity:.8;padding-left:6px;border-left:1px solid rgba(255,255,255,.35)}
    `;
  }
  function highlightCss(dark = `:root:where(.${P}paper-dark)`) {
    return `
    /* a text highlight: a marker stroke with rough ends and a slight lean, drawn as a background so no text or line moves. It
       multiplies with what is under it (a comment's yellow, the page), so an overlap mixes the two and the words stay as dark
       as the page set them; in dark mode it is plain alpha (a screen blend would erase light text on a light page that merely sits under a dark OS setting). Highlighter yellow, brighter than a comment's soft gold and taller than the line */
    mark.${P}hl{--${P}hl-l:none;--${P}hl-d:none;background-color:transparent;background-image:var(--${P}hl-l);background-repeat:no-repeat;background-size:100% 100%;background-position:0 0;
      color:inherit;padding:.12em .3em .1em .35em;margin:0 -.3em 0 -.35em;-webkit-box-decoration-break:clone;box-decoration-break:clone;mix-blend-mode:multiply;cursor:pointer}
    ${dark} mark.${P}hl{background-image:var(--${P}hl-d);mix-blend-mode:normal}
    `;
  }

  // ---------- inside a frame: add_notes.py tags a page the reviewed page shows in an <iframe> with data-frame. Its own
  // selections go up to the page's layer, which owns the pill and the notes; the page sends back which quotes to
  // highlight and which one is picked. Opened on its own, the page gets the full layer. ----------
  if (script.dataset.frame && window.parent !== window) {
    window.PN_FRAME = true;
    document.documentElement.classList.add(P + 'drawn');   // add_notes.py's hold goes at once: a framed page has no opening of its own
    const parentOrigin = document.referrer ? new URL(document.referrer).origin : 'null';
    const up = (m, ports = []) => window.parent.postMessage({ hf: 1, ...m }, parentOrigin === 'null' ? '*' : parentOrigin, ports);
    const tag = document.createElement('div');
    tag.className = 'pn-ui ' + P + 'etag';
    tag.innerHTML = '<span>Editing</span><span class="k">Enter to finish</span>';
    document.body.appendChild(tag);
    const st = document.createElement('style');
    st.textContent = `${editColors()} ${editCss()} ${highlightCss()} ${editTagCss().replaceAll('.pn-etag', '.' + P + 'etag')}
      .${P}etag{--pn-ui:system-ui,sans-serif;box-sizing:border-box}
      mark.${P}mark{background:rgba(255,207,40,.3);color:inherit;border-radius:2px;cursor:pointer}
      mark.${P}mark.${P}on{background:rgba(255,207,40,.75)}
      mark.${P}mark[data-id^="q:"]{background:rgba(124,58,237,.13)} mark.${P}mark[data-id^="q:"].${P}on{background:rgba(124,58,237,.24)}
      @media (prefers-color-scheme: dark){mark.${P}mark{background:rgba(255,217,90,.22)}mark.${P}mark.${P}on{background:rgba(255,217,90,.34)}
        mark.${P}mark[data-id^="q:"]{background:rgba(122,90,240,.22)}mark.${P}mark[data-id^="q:"].${P}on{background:rgba(122,90,240,.4)}}`;
    document.head.appendChild(st);
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const setDark = () => document.documentElement.classList.toggle(P + 'paper-dark', dark.matches);
    setDark(); dark.addEventListener('change', setDark);
    const frameState = {};
    let token = null, readOnly = true, indexed = false;
    const editor = editEngine({ state: frameState, readOnly: () => readOnly, inLayer: (e) => tag.contains(e), tag, stableKeys: true, keepMissing: () => true,
      save: () => { if (token !== null) up({ kind: 'edit-state', token, records: editor.snapshot() }); },
      onClose: () => { if (token !== null) { up({ kind: 'edit-close', token }); token = null; } draw(); } });
    const index = () => { editor.initEdits(null, null); indexed = true; };
    const skip = `.pn-ui,script,style,.${P}del`;
    const flat = () => textMap(document.body, skip);
    const rect = (r) => ({ left: r.left, top: r.top, width: r.width, height: r.height });
    let had = false, selected = null, selectionId = 0;
    const send = () => setTimeout(() => {
      const s = getSelection(), quote = s.rangeCount && !s.isCollapsed ? s.toString().replace(/\s+/g, ' ').trim() : '';
      if (!quote || editor.editIsOpen()) { if (had) up({ kind: 'sel', quote: '' }); had = false; selected = null; return; }
      const r = s.getRangeAt(0), b = r.getBoundingClientRect(), l = r.getClientRects()[0] || b;
      if (!indexed || editor.needsIndex()) index();
      let edit = editor.editRange();
      if (!edit) { index(); edit = editor.editRange(); }   // a mockup may add words after it first loads
      const last = selected?.range;
      const same = edit && last && edit.startContainer === last.startContainer && edit.startOffset === last.startOffset
        && edit.endContainer === last.endContainer && edit.endOffset === last.endOffset && edit.toString() === selected.text;
      if (!same) selected = edit && { id: ++selectionId, range: edit, text: edit.toString() };
      const struck = [...document.querySelectorAll(`.${P}del`)].some((n) => r.intersectsNode(n));
      let words = quote;
      if (struck) {
        const contents = r.cloneContents();
        contents.querySelectorAll(`.${P}del`).forEach((n) => n.remove());
        if (r.commonAncestorContainer.parentElement?.closest(`.${P}del`)) words = '';
        else words = contents.textContent.replace(/\s+/g, ' ').trim();
      }
      had = true;
      // line: where the note's row will sit, as `where` reports once the words are marked (the first line's box)
      const hl = hlIn(r);
      up({ kind: 'sel', quote: words, pos: Math.max(0, posAt(document.body, r.startContainer, r.startOffset, skip)),
        rect: rect(b), line: rect(l), edit: selected?.id, hl: hl.all ? hl.ids : [] });
    }, 0);
    // a click, scroll, touch or key in the frame never reaches the page's own listeners: pass it up, so it ends the cursor's visit or the opening (cCutNow)
    ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach((k) => addEventListener(k, (e) => { if (e.isTrusted) up({ kind: 'cut', how: k }); }, { capture: true, passive: true }));
    document.addEventListener('mouseup', send);
    document.addEventListener('touchend', send, { passive: true });
    document.addEventListener('selectionchange', () => { if (had || matchMedia('(pointer: coarse)').matches) send(); });
    document.addEventListener('keyup', (e) => { if (e.shiftKey || e.key?.startsWith('Arrow')) send(); });   // Chrome's autofill sends key events with no key
    document.addEventListener('scroll', () => { if (had) send(); }, true);
    // a key typed over the selection goes up, where it starts a comment on the words as Comment does (but a space, which
    // scrolls); once one has gone every key does for a second, or until the comment box takes the focus from this frame,
    // so none is lost, and a page whose layer took none (a locked round) gets its keys back
    let fwd = 0;
    addEventListener('blur', () => { fwd = 0; editor.closeEdit(); });
    document.addEventListener('keydown', (e) => {
      const k = undoKey(e);
      if (k && !readOnly && !e.isComposing && !e.target.closest?.('input,textarea,select,[contenteditable]')) {
        e.preventDefault(); up({ kind: 'undo', back: k === 'undo' }); return;
      }
      const on = Date.now() - fwd < 1000;
      if (!(on || (had && e.key !== ' ')) || e.key?.length !== 1 || e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.target.closest?.('input,textarea,select,[contenteditable]')) return;
      if (!on) fwd = Date.now();
      e.preventDefault(); up({ kind: 'key', key: e.key });
    });
    // a paste of words over the selection goes up the same way, and starts the comment with them as a key does (1.141.0);
    // a picture on the clipboard, or a paste into the frame's own text box, stays here as before
    document.addEventListener('paste', (e) => {
      const d = e.clipboardData, on = Date.now() - fwd < 1000, text = (d?.getData('text/plain') || '').replace(/\r\n?/g, '\n');
      if (!(on || had) || !text.trim() || [...(d?.files || [])].some((f) => /^image\//.test(f.type)) || e.target.closest?.('input,textarea,select,[contenteditable]')) return;
      if (!on) fwd = Date.now();
      e.preventDefault(); up({ kind: 'paste', text });
    });
    let list = [], highlights = [], on = null, busy = false;
    const draw = () => {   // the page's own script may redraw (a tab switch), so marks are put back whenever it does
      if (editor.editIsOpen()) return;   // a redraw would replace the nodes the user is typing into
      busy = true;
      document.querySelectorAll(`mark.${P}mark,mark.${P}hl,span.${P}run`).forEach(unwrap);
      if (indexed && editor.needsIndex()) index();
      list.forEach((q) => {
        const { norm, map } = flat(), hit = findQuote(norm, unclip(q.quote, document.body), q.pos); if (!hit) return;
        const a = map[hit[0]], z = map[hit[1]], rg = document.createRange(); rg.setStart(a[0], a[1]); rg.setEnd(z[0], z[1] + 1);
        wrapRange(rg, q.id).forEach((m) => m.classList.toggle(P + 'on', q.id === on));
      });
      highlights.forEach((h) => markHl(h, document.body, skip));
      setTimeout(() => { busy = false; }, 0);
      where();
    };
    // where each note's words sit in the frame's window, so the page's layer can tie the note to them rather than to the
    // whole part (2026-10-21: a note on "dot" in a framed mock-up bracketed the whole section): the first line's
    // box, and the far right end of the text on that line
    const where = () => {
      const at = {};
      document.querySelectorAll(`mark.${P}mark`).forEach((m) => {
        const r = m.getClientRects()[0]; if (!r || at[m.dataset.id]) return;
        const par = m.closest('p,li,h1,h2,h3,h4,h5,h6,pre,td,dd,blockquote') || m.parentElement, rg = document.createRange(), mid = r.top + r.height / 2;
        rg.selectNodeContents(par);
        const xs = [...rg.getClientRects()].filter((q) => q.width > 1 && q.top < mid && q.bottom > mid).map((q) => q.right);
        at[m.dataset.id] = { left: r.left, top: r.top, width: r.width, height: r.height, end: xs.length ? Math.max(...xs) : r.right };
      });
      const edits = {};
      editor.edited().forEach((label) => {
        const rg = document.createRange(); rg.selectNodeContents(editor.editEl(label));
        const r = [...rg.getClientRects()].find((box) => box.width && box.height);
        if (r) edits[label] = { ...rect(r), end: r.right };
      });
      up({ kind: 'where', at, edits });
    };
    let whereRaf = 0;
    const whereSoon = () => { cancelAnimationFrame(whereRaf); whereRaf = requestAnimationFrame(where); };
    document.addEventListener('scroll', whereSoon, true);
    addEventListener('resize', whereSoon);
    let redraw = 0;
    new MutationObserver(() => { if (!busy) { clearTimeout(redraw); redraw = setTimeout(draw, 80); } }).observe(document.body, { childList: true, subtree: true, characterData: true });
    const bridge = new MessageChannel();
    const receive = (d) => {
      if (!d?.hf) return;
      if (d.kind === 'marks') {
        list = d.list || []; highlights = d.highlights || []; readOnly = !!d.readOnly;
        if (readOnly) editor.closeEdit();
        if (!editor.editIsOpen() && d.edits) {
          if (!indexed) index();
          if (JSON.stringify(editor.snapshot()) !== JSON.stringify(d.edits)) editor.putEd(d.edits, null, false);
        }
        draw();
      }
      if (d.kind === 'edit-open') {
        if (readOnly) { up({ kind: 'edit-close', token: d.token }); return; }
        const range = selected?.id === d.selection && selected.range.startContainer.isConnected && selected.range.toString() === selected.text ? selected.range : null;
        const e = d.label ? editor.editEl(d.label) : range && editor.editBlockAt(range.startContainer);
        if (!e) { up({ kind: 'edit-close', token: d.token }); return; }
        editor.closeEdit();
        token = d.token; selected = null; had = false;
        editor.openEdit(e, range);
      }
      if (d.kind === 'edit-finish' && d.token === token) editor.closeEdit();
      if (d.kind === 'on') { on = d.id; document.querySelectorAll(`mark.${P}mark`).forEach((m) => m.classList.toggle(P + 'on', m.dataset.id === on)); }
      if (d.kind === 'clear') getSelection().removeAllRanges();
    };
    bridge.port1.onmessage = (e) => receive(e.data);
    addEventListener('message', (e) => {
      if (e.source === window.parent && (parentOrigin === 'null' || e.origin === parentOrigin)) receive(e.data);
    });
    document.addEventListener('click', (e) => {
      if (getSelection().toString()) return;
      const m = e.target.closest?.(`mark.${P}mark`), h = e.target.closest?.(`mark.${P}hl`);
      const b = editor.editBlockAt(e.target), label = b?.dataset.pnEdit;
      if (m) up({ kind: 'pick', id: m.dataset.id });
      else if (h) up({ kind: 'highlight-pick', id: h.dataset.hl, rect: rect(h.getBoundingClientRect()), x: e.clientX });
      else if (label && frameState.edits[label] != null && !b.isContentEditable) up({ kind: 'edit-pick', label: editor.spanHead(label) || label });
      else if (!e.target.closest?.('input,textarea,select,[contenteditable]')) up({ kind: 'none' });
    });
    up({ kind: 'ready' }, [bridge.port2]);
    return;
  }
  const PAGE = script.dataset.page || decodeURIComponent(location.pathname.split('/').pop());
  const TAB = /^Feedback · /;   // the tab's prefix (the outline's header), left out wherever the page's own title is read
  // one notes column per page and round; add_notes.py --next-round starts a fresh one
  const KEY = 'human-feedback:' + (script.dataset.key || PAGE) + '#' + (script.dataset.round || '1');
  const ICONS = {"HighlighterIcon":"<path d=\"M6.6777 16.2071L2.5 20.5H6.5L8.79289 18.3223Z\" fill=\"currentColor\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M6.6777 16.2071L8.79289 18.3223M6.6777 16.2071L2.5 20.5H6.5L8.79289 18.3223M6.6777 16.2071C6.28717 15.8166 6.29534 15.1872 6.63537 14.752C7.42742 13.7383 7.71531 12.8216 7.79924 12.1382C7.89158 11.3863 8.07366 10.5734 8.60933 10.0377L9.50122 9.14828M8.79289 18.3223C9.18342 18.7128 9.81278 18.7047 10.248 18.3646C11.2617 17.5726 12.1784 17.2847 12.8618 17.2008C13.6137 17.1084 14.4266 16.9263 14.9623 16.3907L15.8517 15.4988M15.8517 15.4988L9.50122 9.14828M15.8517 15.4988C16.2422 15.8893 16.8754 15.8893 17.2659 15.4988L21.5 11.2647M9.50122 9.14828C9.1107 8.75776 9.1107 8.12459 9.50122 7.73407L13.7353 3.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","ArrowUpToLineIcon":"<path d=\"M12 8L12 21\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M18 3L6 3\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M17 12C17 12 13.3176 7.00001 12 7C10.6824 6.99999 7 12 7 12\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","ArrowDownToLineIcon":"<path d=\"M12 16V3\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M6 21H18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M7 12C7 12 10.6824 17 12 17C13.3176 17 17 12 17 12\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","MessageNotification01Icon":"<path d=\"M21.9598 10.9707C22.0134 11.8009 22.0134 12.6607 21.9598 13.4909C21.6856 17.7332 18.3536 21.1125 14.1706 21.3905C12.7435 21.4854 11.2536 21.4852 9.8294 21.3905C9.33896 21.3579 8.8044 21.2409 8.34401 21.0513C7.83177 20.8403 7.5756 20.7348 7.44544 20.7508C7.31527 20.7668 7.1264 20.9061 6.74868 21.1846C6.08268 21.6757 5.24367 22.0285 3.99943 21.9982C3.37026 21.9829 3.05568 21.9752 2.91484 21.7351C2.77401 21.495 2.94941 21.1626 3.30021 20.4978C3.78674 19.5758 4.09501 18.5203 3.62791 17.6746C2.82343 16.4666 2.1401 15.036 2.04024 13.4909C1.98659 12.6607 1.98659 11.8009 2.04024 10.9707C2.31441 6.72838 5.64639 3.34913 9.8294 3.07107C11.0318 2.99114 11.2812 2.97856 12.5 3.03368\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M8.5 15H15.5M8.5 10H12\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M22 5.5C22 7.433 20.433 9 18.5 9C16.567 9 15 7.433 15 5.5C15 3.567 16.567 2 18.5 2C20.433 2 22 3.567 22 5.5Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/>","Alert02Icon":"<path d=\"M13.9248 21H10.0752C5.44476 21 3.12955 21 2.27636 19.4939C1.42317 17.9879 2.60736 15.9914 4.97574 11.9985L6.90057 8.75333C9.17559 4.91778 10.3131 3 12 3C13.6869 3 14.8244 4.91777 17.0994 8.75332L19.0243 11.9985C21.3926 15.9914 22.5768 17.9879 21.7236 19.4939C20.8704 21 18.5552 21 13.9248 21Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12 9V13\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12.125 16.75H12M12.25 16.75C12.25 16.8881 12.1381 17 12 17C11.8619 17 11.75 16.8881 11.75 16.75C11.75 16.6119 11.8619 16.5 12 16.5C12.1381 16.5 12.25 16.6119 12.25 16.75Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","StickerIcon":"<path d=\"M3 13V11C3 7.22876 3 5.34315 4.17157 4.17157C5.34315 3 7.22876 3 11 3H12.6863C14.3213 3 15.1388 3 15.8739 3.30449C16.609 3.60897 17.1871 4.18704 18.3432 5.34318L18.6569 5.65686C19.813 6.81298 20.391 7.39104 20.6955 8.12612C21 8.8612 21 9.67869 21 11.3137V13C21 16.7712 21 18.6569 19.8284 19.8284C18.6569 21 16.7712 21 13 21H11C7.22876 21 5.34315 21 4.17157 19.8284C3 18.6569 3 16.7712 3 13Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M15 3.5C15 5.84558 15 7.01836 15.6199 7.82628C15.7795 8.03428 15.9657 8.22046 16.1737 8.38006C16.9816 9 18.1544 9 20.5001 9\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M14.5 16C13.8152 16.6257 12.9459 17 12 17C11.0541 17 10.1848 16.6257 9.5 16M8.25 12.125V12.25M15.75 12.1257V12.2507M8.5 12.25C8.5 12.3881 8.38807 12.5 8.25 12.5C8.11193 12.5 8 12.3881 8 12.25C8 12.1119 8.11193 12 8.25 12C8.38807 12 8.5 12.1119 8.5 12.25ZM16 12.2507C16 12.3887 15.8881 12.5007 15.75 12.5007C15.6119 12.5007 15.5 12.3887 15.5 12.2507C15.5 12.1126 15.6119 12.0007 15.75 12.0007C15.8881 12.0007 16 12.1126 16 12.2507Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","CheckmarkCircle02Icon":"<path d=\"M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M8 12.5L10.5 15L16 9\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","ArrowLeft01Icon":"<path d=\"M15 6C15 6 9 10.4189 9 12C9 13.5812 15 18 15 18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","ArrowRight01Icon":"<path d=\"M9 6C9 6 15 10.4189 15 12C15 13.5812 9 18 9 18\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","Undo02Icon":"<path d=\"M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C8.66873 3 5.76018 4.80989 4.20404 7.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M3 3V4.27816C3 6.47004 3 7.56599 3.70725 8.16512C4.4145 8.76425 5.49553 8.58408 7.6576 8.22373L9 8\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","ChatAdd01Icon":"<path d=\"M21.9609 9C21.9865 9.72648 22 10.2292 22 11C22 11.7708 21.9865 12.5232 21.9609 13.2497C21.8772 15.6232 21.8353 16.8099 20.8699 17.7826C19.9046 18.7552 18.6843 18.8074 16.2437 18.9118C15.5098 18.9432 14.7498 18.9667 13.9693 18.9815C13.2282 18.9955 12.8576 19.0026 12.532 19.1266C12.2064 19.2506 11.9325 19.4855 11.3845 19.9553L9.20503 21.8242C9.07273 21.9376 8.90419 22 8.72991 22C8.32679 22 8 21.6732 8 21.2701V18.9219C7.91842 18.9186 7.83715 18.9153 7.75619 18.9118C5.31569 18.8074 4.09545 18.7552 3.13007 17.7825C2.16469 16.8099 2.12282 15.6232 2.03909 13.2497C2.01346 12.5232 2 11.7708 2 11C2 10.2292 2.01346 9.47679 2.03909 8.7503C2.12282 6.37683 2.16469 5.19009 3.13007 4.21745C4.09545 3.24481 5.3157 3.1926 7.7562 3.08819C9.09517 3.0309 10.5209 3 12 3C12.5067 3 13.0072 3.00363 13.5 3.0107\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M22 5H16M19 2V8\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12.1257 11H12.0007M8.125 11H8M12.2507 11C12.2507 11.1381 12.1388 11.25 12.0007 11.25C11.8627 11.25 11.7507 11.1381 11.7507 11C11.7507 10.8619 11.8627 10.75 12.0007 10.75C12.1388 10.75 12.2507 10.8619 12.2507 11ZM8.25 11C8.25 11.1381 8.13807 11.25 8 11.25C7.86193 11.25 7.75 11.1381 7.75 11C7.75 10.8619 7.86193 10.75 8 10.75C8.13807 10.75 8.25 10.8619 8.25 11Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","Copy01Icon":"<path d=\"M7.5 14.5C7.5 11.2002 7.5 9.55025 8.52513 8.52513C9.55025 7.5 11.2002 7.5 14.5 7.5C17.7998 7.5 19.4497 7.5 20.4749 8.52513C21.5 9.55025 21.5 11.2002 21.5 14.5C21.5 17.7998 21.5 19.4497 20.4749 20.4749C19.4497 21.5 17.7998 21.5 14.5 21.5C11.2002 21.5 9.55025 21.5 8.52513 20.4749C7.5 19.4497 7.5 17.7998 7.5 14.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M7.5 16.5C6.10355 16.5 5.40533 16.5 4.84402 16.3036C3.83866 15.9518 3.0482 15.1613 2.69641 14.156C2.5 13.5947 2.5 12.8964 2.5 11.5V9.5C2.5 6.20017 2.5 4.55025 3.52513 3.52513C4.55025 2.5 6.20017 2.5 9.5 2.5H11.5C12.8964 2.5 13.5947 2.5 14.156 2.69641C15.1613 3.0482 15.9518 3.83866 16.3036 4.84402C16.5 5.40533 16.5 6.10355 16.5 7.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","Cancel01Icon":"<path d=\"M18 6L6.00081 17.9992M17.9992 18L6 6.00085\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","ChatIcon":"<path d=\"M2 10.5C2 9.72921 2.01346 8.97679 2.03909 8.2503C2.12282 5.87683 2.16469 4.69009 3.13007 3.71745C4.09545 2.74481 5.3157 2.6926 7.7562 2.58819C9.09517 2.5309 10.5209 2.5 12 2.5C13.4791 2.5 14.9048 2.5309 16.2438 2.58819C18.6843 2.6926 19.9046 2.74481 20.8699 3.71745C21.8353 4.69009 21.8772 5.87683 21.9609 8.2503C21.9865 8.97679 22 9.72921 22 10.5C22 11.2708 21.9865 12.0232 21.9609 12.7497C21.8772 15.1232 21.8353 16.3099 20.8699 17.2826C19.9046 18.2552 18.6843 18.3074 16.2437 18.4118C15.5098 18.4432 14.7498 18.4667 13.9693 18.4815C13.2282 18.4955 12.8576 18.5026 12.532 18.6266C12.2064 18.7506 11.9325 18.9855 11.3845 19.4553L9.20503 21.3242C9.07273 21.4376 8.90419 21.5 8.72991 21.5C8.32679 21.5 8 21.1732 8 20.7701V18.4219C7.91842 18.4186 7.83715 18.4153 7.75619 18.4118C5.31569 18.3074 4.09545 18.2552 3.13007 17.2825C2.16469 16.3099 2.12282 15.1232 2.03909 12.7497C2.01346 12.0232 2 11.2708 2 10.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12.1257 10.5H12.0007M8.125 10.5H8M16.125 10.5H16M12.2507 10.5C12.2507 10.6381 12.1388 10.75 12.0007 10.75C11.8627 10.75 11.7507 10.6381 11.7507 10.5C11.7507 10.3619 11.8627 10.25 12.0007 10.25C12.1388 10.25 12.2507 10.3619 12.2507 10.5ZM8.25 10.5C8.25 10.6381 8.13807 10.75 8 10.75C7.86193 10.75 7.75 10.6381 7.75 10.5C7.75 10.3619 7.86193 10.25 8 10.25C8.13807 10.25 8.25 10.3619 8.25 10.5ZM16.25 10.5C16.25 10.6381 16.1381 10.75 16 10.75C15.8619 10.75 15.75 10.6381 15.75 10.5C15.75 10.3619 15.8619 10.25 16 10.25C16.1381 10.25 16.25 10.3619 16.25 10.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","Loading03Icon":"<path d=\"M12 3V6\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M12 18V21\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M21 12L18 12\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M6 12L3 12\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M18.3635 5.63672L16.2422 7.75804\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M7.75804 16.2422L5.63672 18.3635\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M18.3635 18.3635L16.2422 16.2422\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/><path d=\"M7.75804 7.75804L5.63672 5.63672\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/>","Tick02Icon":"<path d=\"M5 14L8.5 17.5L19 6.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","TickDouble02Icon":"<path d=\"M2.5 13.8333L6 17.5L7.02402 16.4272M16.5 6.5L10.437 12.8517\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M7.5 13.8333L11 17.5L21.5 6.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","PencilEdit02Icon":"<path d=\"M16.4249 4.60509L17.4149 3.6151C18.2351 2.79497 19.5648 2.79497 20.3849 3.6151C21.205 4.43524 21.205 5.76493 20.3849 6.58507L19.3949 7.57506M16.4249 4.60509L9.76558 11.2644C9.25807 11.772 8.89804 12.4078 8.72397 13.1041L8 16L10.8959 15.276C11.5922 15.102 12.228 14.7419 12.7356 14.2344L19.3949 7.57506M16.4249 4.60509L19.3949 7.57506\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M18.9999 13.5C18.9999 16.7875 18.9999 18.4312 18.092 19.5376C17.9258 19.7401 17.7401 19.9258 17.5375 20.092C16.4312 21 14.7874 21 11.4999 21H11C7.22876 21 5.34316 21 4.17159 19.8284C3.00003 18.6569 3 16.7712 3 13V12.5C3 9.21252 3 7.56879 3.90794 6.46244C4.07417 6.2599 4.2599 6.07417 4.46244 5.90794C5.56879 5 7.21252 5 10.5 5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","PanelRightCloseIcon":"<path d=\"M3 11C3 7.22876 3 5.34315 4.17157 4.17157C5.34315 3 7.22876 3 11 3H13C16.7712 3 18.6569 3 19.8284 4.17157C21 5.34315 21 7.22876 21 11V13C21 16.7712 21 18.6569 19.8284 19.8284C18.6569 21 16.7712 21 13 21H11C7.22876 21 5.34315 21 4.17157 19.8284C3 18.6569 3 16.7712 3 13V11Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M15 3V21\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M8 9L9.10819 9.87868C10.3694 10.8787 11 11.3787 11 12C11 12.6213 10.3694 13.1213 9.10819 14.1213L8 15\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","PanelRightOpenIcon":"<path d=\"M3 11C3 7.22876 3 5.34315 4.17157 4.17157C5.34315 3 7.22876 3 11 3H13C16.7712 3 18.6569 3 19.8284 4.17157C21 5.34315 21 7.22876 21 11V13C21 16.7712 21 18.6569 19.8284 19.8284C18.6569 21 16.7712 21 13 21H11C7.22876 21 5.34315 21 4.17157 19.8284C3 18.6569 3 16.7712 3 13V11Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M15 3V21\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M10 9L8.89181 9.87868C7.6306 10.8787 7 11.3787 7 12C7 12.6213 7.6306 13.1213 8.89181 14.1213L10 15\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","PanelLeftCloseIcon":"<path d=\"M21 11C21 7.22876 21 5.34315 19.8284 4.17157C18.6569 3 16.7712 3 13 3H11C7.22876 3 5.34315 3 4.17157 4.17157C3 5.34315 3 7.22876 3 11V13C3 16.7712 3 18.6569 4.17157 19.8284C5.34315 21 7.22876 21 11 21H13C16.7712 21 18.6569 21 19.8284 19.8284C21 18.6569 21 16.7712 21 13V11Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M9 3V21\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M14 9L15.1082 9.87868C16.3694 10.8787 17 11.3787 17 12C17 12.6213 16.3694 13.1213 15.1082 14.1213L14 15\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","PanelLeftOpenIcon":"<path d=\"M21 11C21 7.22876 21 5.34315 19.8284 4.17157C18.6569 3 16.7712 3 13 3H11C7.22876 3 5.34315 3 4.17157 4.17157C3 5.34315 3 7.22876 3 11V13C3 16.7712 3 18.6569 4.17157 19.8284C5.34315 21 7.22876 21 11 21H13C16.7712 21 18.6569 21 19.8284 19.8284C21 18.6569 21 16.7712 21 13V11Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M9 3V21\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M16 9L14.8918 9.87868C13.6306 10.8787 13 11.3787 13 12C13 12.6213 13.6306 13.1213 14.8918 14.1213L16 15\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","HelpSquareIcon":"<path d=\"M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M9.5 9.5C9.5 8.11929 10.6193 7 12 7C13.3807 7 14.5 8.11929 14.5 9.5C14.5 10.3569 14.0689 11.1131 13.4117 11.5636C12.7283 12.0319 12 12.6716 12 13.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12.125 16.75H12M12.25 16.75C12.25 16.8881 12.1381 17 12 17C11.8619 17 11.75 16.8881 11.75 16.75C11.75 16.6119 11.8619 16.5 12 16.5C12.1381 16.5 12.25 16.6119 12.25 16.75Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","CheckIcon":"<path d=\"M5 13.2592L7.58583 15.9568C8.2525 16.6523 8.58583 17 9.00004 17C9.41425 17 9.74759 16.6523 10.4143 15.9568L19 7\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","ThumbsUpIcon":"<path d=\"M2 12.5C2 11.3954 2.89543 10.5 4 10.5C5.65685 10.5 7 11.8431 7 13.5V17.5C7 19.1569 5.65685 20.5 4 20.5C2.89543 20.5 2 19.6046 2 18.5V12.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M15.4787 7.80626L15.2124 8.66634C14.9942 9.37111 14.8851 9.72349 14.969 10.0018C15.0369 10.2269 15.1859 10.421 15.389 10.5487C15.64 10.7065 16.0197 10.7065 16.7791 10.7065H17.1831C19.7532 10.7065 21.0382 10.7065 21.6452 11.4673C21.7145 11.5542 21.7762 11.6467 21.8296 11.7437C22.2965 12.5921 21.7657 13.7351 20.704 16.0211C19.7297 18.1189 19.2425 19.1678 18.338 19.7852C18.2505 19.8449 18.1605 19.9013 18.0683 19.9541C17.116 20.5 15.9362 20.5 13.5764 20.5H13.0646C10.2057 20.5 8.77628 20.5 7.88814 19.6395C7 18.7789 7 17.3939 7 14.6239V13.6503C7 12.1946 7 11.4668 7.25834 10.8006C7.51668 10.1344 8.01135 9.58664 9.00069 8.49112L13.0921 3.96056C13.1947 3.84694 13.246 3.79012 13.2913 3.75075C13.7135 3.38328 14.3652 3.42464 14.7344 3.84235C14.774 3.8871 14.8172 3.94991 14.9036 4.07554C15.0388 4.27205 15.1064 4.37031 15.1654 4.46765C15.6928 5.33913 15.8524 6.37436 15.6108 7.35715C15.5838 7.46692 15.5488 7.5801 15.4787 7.80626Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","ThumbsDownIcon":"<path d=\"M2 11.5C2 12.6046 2.89543 13.5 4 13.5C5.65685 13.5 7 12.1569 7 10.5V6.5C7 4.84315 5.65685 3.5 4 3.5C2.89543 3.5 2 4.39543 2 5.5V11.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M15.4787 16.1937L15.2124 15.3337C14.9942 14.6289 14.8851 14.2765 14.969 13.9982C15.0369 13.7731 15.1859 13.579 15.389 13.4513C15.64 13.2935 16.0197 13.2935 16.7791 13.2935H17.1831C19.7532 13.2935 21.0382 13.2935 21.6452 12.5327C21.7145 12.4458 21.7762 12.3533 21.8296 12.2563C22.2965 11.4079 21.7657 10.2649 20.704 7.9789C19.7297 5.88111 19.2425 4.83222 18.338 4.21485C18.2505 4.15508 18.1605 4.0987 18.0683 4.04586C17.116 3.5 15.9362 3.5 13.5764 3.5H13.0646C10.2057 3.5 8.77628 3.5 7.88814 4.36053C7 5.22106 7 6.60607 7 9.37607V10.3497C7 11.8054 7 12.5332 7.25834 13.1994C7.51668 13.8656 8.01135 14.4134 9.00069 15.5089L13.0921 20.0394C13.1947 20.1531 13.246 20.2099 13.2913 20.2493C13.7135 20.6167 14.3652 20.5754 14.7344 20.1577C14.774 20.1129 14.8172 20.0501 14.9036 19.9245C15.0388 19.728 15.1064 19.6297 15.1654 19.5323C15.6928 18.6609 15.8524 17.6256 15.6108 16.6429C15.5838 16.5331 15.5488 16.4199 15.4787 16.1937Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","PartyIcon":"<path d=\"M5.65784 11.0022L4.18747 14.3105C2.3324 18.4844 1.40486 20.5713 2.41719 21.5837C3.42951 22.596 5.51646 21.6685 9.69037 19.8134L12.9987 18.343C15.5161 17.2242 16.7748 16.6647 16.9751 15.586C17.1754 14.5073 16.2014 13.5333 14.2535 11.5854L12.4155 9.7474C10.4675 7.79944 9.49353 6.82546 8.41482 7.02575C7.33611 7.22604 6.77669 8.48475 5.65784 11.0022Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M6.50085 10.5L13.5009 17.5M4.50085 15.5L8.50085 19.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M16.0009 8L19.0009 5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M21.8759 6H21.7509M22.0009 6C22.0009 6.13807 21.8889 6.25 21.7509 6.25C21.6128 6.25 21.5009 6.13807 21.5009 6C21.5009 5.86193 21.6128 5.75 21.7509 5.75C21.8889 5.75 22.0009 5.86193 22.0009 6Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M20.8759 13.25H20.7509M21.0009 13.25C21.0009 13.3881 20.8889 13.5 20.7509 13.5C20.6128 13.5 20.5009 13.3881 20.5009 13.25C20.5009 13.1119 20.6128 13 20.7509 13C20.8889 13 21.0009 13.1119 21.0009 13.25Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M18.1259 2.25H18.0009M18.2509 2.25C18.2509 2.38807 18.1389 2.5 18.0009 2.5C17.8628 2.5 17.7509 2.38807 17.7509 2.25C17.7509 2.11193 17.8628 2 18.0009 2C18.1389 2 18.2509 2.11193 18.2509 2.25Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M11.1259 3.25H11.0009M11.2509 3.25C11.2509 3.38807 11.1389 3.5 11.0009 3.5C10.8628 3.5 10.7509 3.38807 10.7509 3.25C10.7509 3.11193 10.8628 3 11.0009 3C11.1389 3 11.2509 3.11193 11.2509 3.25Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M14.1981 2C14.5972 2.66667 14.9165 4.4 13.0009 6\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M22.0009 9.80274C21.3342 9.40365 19.6009 9.08438 18.0009 11\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","SquareUnlock02Icon":"<path d=\"M12 14.5V17.5M13 14.5C13 15.0523 12.5523 15.5 12 15.5C11.4477 15.5 11 15.0523 11 14.5C11 13.9477 11.4477 13.5 12 13.5C12.5523 13.5 13 13.9477 13 14.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M7.5 9V6.5C7.5 4.01472 9.51472 2 12 2C13.9593 2 15.8664 3.25221 16.5 5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M4.26781 18.8447C4.49269 20.515 5.87613 21.8235 7.55966 21.9009C8.97627 21.966 10.4153 22 12 22C13.5847 22 15.0237 21.966 16.4403 21.9009C18.1239 21.8235 19.5073 20.515 19.7322 18.8447C19.879 17.7547 20 16.6376 20 15.5C20 14.3624 19.879 13.2453 19.7322 12.1553C19.5073 10.485 18.1239 9.17649 16.4403 9.09909C15.0237 9.03397 13.5847 9 12 9C10.4153 9 8.97627 9.03397 7.55966 9.09909C5.87613 9.17649 4.49269 10.485 4.26781 12.1553C4.12104 13.2453 4 14.3624 4 15.5C4 16.6376 4.12104 17.7547 4.26781 18.8447Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","AttachmentIcon":"<path d=\"M19.5 12.0001V13.5001C19.5 17.6422 16.1421 21.0001 12 21.0001C7.85786 21.0001 4.5 17.6422 4.5 13.5001V8C4.5 5.23858 6.73858 3 9.5 3C12.2614 3 14.5 5.23858 14.5 8V13.5C14.5 14.8807 13.3807 16 12 16C10.6193 16 9.5 14.8807 9.5 13.5V9.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","HeartIcon":"<path d=\"M10.4107 19.9677C7.58942 17.858 2 13.0348 2 8.69444C2 5.82563 4.10526 3.5 7 3.5C8.5 3.5 10 4 12 6C14 4 15.5 3.5 17 3.5C19.8947 3.5 22 5.82563 22 8.69444C22 13.0348 16.4106 17.858 13.5893 19.9677C12.6399 20.6776 11.3601 20.6776 10.4107 19.9677Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","Linkedin01Icon":"<path d=\"M7 10V17\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M11 13V17M11 13C11 11.3431 12.3431 10 14 10C15.6569 10 17 11.3431 17 13V17M11 13V10\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M7.125 6.75H7M7.25 6.75C7.25 6.88807 7.13807 7 7 7C6.86193 7 6.75 6.88807 6.75 6.75C6.75 6.61193 6.86193 6.5 7 6.5C7.13807 6.5 7.25 6.61193 7.25 6.75Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M3 12C3 7.75736 3 5.63604 4.31802 4.31802C5.63604 3 7.75736 3 12 3C16.2426 3 18.364 3 19.682 4.31802C21 5.63604 21 7.75736 21 12C21 16.2426 21 18.364 19.682 19.682C18.364 21 16.2426 21 12 21C7.75736 21 5.63604 21 4.31802 19.682C3 18.364 3 16.2426 3 12Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","Github01Icon":"<path d=\"M6.51734 17.1132C6.91177 17.6905 8.10883 18.9228 9.74168 19.2333M9.86428 22C8.83582 21.8306 2 19.6057 2 12.0926C2 5.06329 8.0019 2 12.0008 2C15.9996 2 22 5.06329 22 12.0926C22 19.6057 15.1642 21.8306 14.1357 22C14.1357 22 13.9267 18.5826 14.0487 17.9969C14.1706 17.4113 13.7552 16.4688 13.7552 16.4688C14.7262 16.1055 16.2043 15.5847 16.7001 14.1874C17.0848 13.1032 17.3268 11.5288 16.2508 10.0489C16.2508 10.0489 16.5318 7.65809 15.9996 7.56548C15.4675 7.47287 13.8998 8.51192 13.8998 8.51192C13.4432 8.38248 12.4243 8.13476 12.0018 8.17939C11.5792 8.13476 10.5568 8.38248 10.1002 8.51192C10.1002 8.51192 8.53249 7.47287 8.00036 7.56548C7.46823 7.65809 7.74917 10.0489 7.74917 10.0489C6.67316 11.5288 6.91516 13.1032 7.2999 14.1874C7.79575 15.5847 9.27384 16.1055 10.2448 16.4688C10.2448 16.4688 9.82944 17.4113 9.95135 17.9969C10.0733 18.5826 9.86428 22 9.86428 22Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","ClaudeIcon":"<path d=\"M13 12L18.5 5M7.63965 3L12.5 12L13.6865 3M4.48381 6.71679L11.9872 12M3 12L11.9872 12.473M12.2244 13.177L7 20M4.84194 16.8682L11.2824 12.9758M11.5 21L12.665 13.177M21 14L13.1846 12.668M21 10.5788L13 12.3223M16.779 19.646L12.8876 13.3772M19.3566 18.207L13.313 12.9893\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","ChatGptIcon":"<path d=\"M11.7453 14.85L6.90436 12V7C6.90436 4.79086 8.72949 3 10.9809 3C12.3782 3 13.6113 3.6898 14.3458 4.74128\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M9.59961 19.1791C10.3266 20.2757 11.5866 21.0008 13.0192 21.0008C15.2707 21.0008 17.0958 19.21 17.0958 17.0008V12.0008L12.1612 9.0957\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M9.45166 13.5L9.45123 7.66938L13.8642 5.16938C15.814 4.06481 18.3072 4.72031 19.4329 6.63348C20.1593 7.86806 20.1388 9.32466 19.5089 10.4995\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M4.48963 13.4993C3.8595 14.6742 3.83887 16.131 4.56539 17.3657C5.6911 19.2789 8.18428 19.9344 10.1341 18.8298L14.5471 16.3298L14.643 10.7344\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M17.0959 17.6309C18.4415 17.5734 19.7295 16.8634 20.4529 15.634C21.5786 13.7209 20.9106 11.2745 18.9608 10.1699L14.5478 7.66992L9.48907 10.4255\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M6.90454 6.36938C5.55865 6.42662 4.27032 7.13672 3.54684 8.3663C2.42113 10.2795 3.08917 12.7258 5.03896 13.8304L9.45196 16.3304L14.5 13.5807\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","CopilotIcon":"<path d=\"M13.8461 4C14.6683 4 15.3801 4.62364 15.5584 5.50016L15.7715 6.54763C16.0037 7.68837 16.93 8.5 18 8.5H11.3827M11.3827 8.5L10.3116 13.2894C9.98567 14.5945 8.90024 15.5 7.66156 15.5H4.83224C3.62479 15.5 2.74786 14.246 3.06556 12.9738L4.44552 6.94753C4.88008 5.20729 6.32731 4 7.97888 4H13.8461C13.0551 4 12.362 4.57821 12.1539 5.41168L11.3827 8.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M10.1539 20C9.33175 20 8.61992 19.3764 8.44158 18.4998L8.22845 17.4524C7.99635 16.3116 7.06995 15.5 6 15.5L12.6173 15.5M12.6173 15.5L13.6884 10.7106C14.0143 9.40546 15.0998 8.5 16.3384 8.5L19.1678 8.5C20.3752 8.5 21.2521 9.75395 20.9344 11.0262L19.5545 17.0525C19.1199 18.7927 17.6727 20 16.0211 20L10.1539 20C10.9449 20 11.638 19.4218 11.8461 18.5883L12.6173 15.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","GrokIcon":"<path d=\"M2.5 12C2.5 7.77027 2.5 5.6554 3.69797 4.25276C3.86808 4.05358 4.05358 3.86808 4.25276 3.69797C5.6554 2.5 7.77027 2.5 12 2.5C16.2297 2.5 18.3446 2.5 19.7472 3.69797C19.9464 3.86808 20.1319 4.05358 20.302 4.25276C21.5 5.6554 21.5 7.77027 21.5 12C21.5 16.2297 21.5 18.3446 20.302 19.7472C20.1319 19.9464 19.9464 20.1319 19.7472 20.302C18.3446 21.5 16.2297 21.5 12 21.5C7.77027 21.5 5.6554 21.5 4.25276 20.302C4.05358 20.1319 3.86808 19.9464 3.69797 19.7472C2.5 18.3446 2.5 16.2297 2.5 12Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M8 17.5L16 7.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/>","KimiAiIcon":"<path d=\"M19.5 4.5H20.5M21 4.5C21 5.05228 20.5523 5.5 20 5.5H19V4.5C19 3.94772 19.4477 3.5 20 3.5C20.5523 3.5 21 3.94772 21 4.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M5.5 6H3V20.5H5.5V17L7.75574 14.7443L13.8256 19.5669C14.586 20.1711 15.5287 20.5 16.5 20.5V17.5C15.8521 17.5 15.2228 17.283 14.7126 16.8836L9.61064 12.8894L16.5 6H13L5.5 13.5V6Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","MistralIcon":"<path d=\"M10.5 16.5V18.5C10.5 19.0523 10.0523 19.5 9.5 19.5H2.5C1.94772 19.5 1.5 19.0523 1.5 18.5V17.5C1.5 16.9477 1.94772 16.5 2.5 16.5H3.5C4.05228 16.5 4.5 16.0523 4.5 15.5V5.5C4.5 4.94772 4.94772 4.5 5.5 4.5H6.5C7.05228 4.5 7.5 4.94772 7.5 5.5V6.5C7.5 7.05228 7.94772 7.5 8.5 7.5H9.5C10.0523 7.5 10.5 7.94772 10.5 8.5V9.5C10.5 10.0523 10.9477 10.5 11.5 10.5H12.5C13.0523 10.5 13.5 10.0523 13.5 9.5V8.5C13.5 7.94772 13.9477 7.5 14.5 7.5H15.5C16.0523 7.5 16.5 7.05228 16.5 6.5V5.5C16.5 4.94772 16.9477 4.5 17.5 4.5H18.5C19.0523 4.5 19.5 4.94772 19.5 5.5V15.5C19.5 16.0523 19.9477 16.5 20.5 16.5H21.5C22.0523 16.5 22.5 16.9477 22.5 17.5V18.5C22.5 19.0523 22.0523 19.5 21.5 19.5H14.5C13.9477 19.5 13.5 19.0523 13.5 18.5V16.5M10.5 16.5H13.5M10.5 16.5H8.5C7.94772 16.5 7.5 16.0523 7.5 15.5V14.5C7.5 13.9477 7.94772 13.5 8.5 13.5H9.5C10.0523 13.5 10.5 13.9477 10.5 14.5V16.5ZM13.5 16.5H15.5C16.0523 16.5 16.5 16.0523 16.5 15.5V14.5C16.5 13.9477 16.0523 13.5 15.5 13.5H14.5C13.9477 13.5 13.5 13.9477 13.5 14.5V16.5Z\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","QwenIcon":"<path d=\"M9 2H12.5L14 4.5H19.13L20.5 7M22 14.5L20.3545 17.163H17.8782L15.0001 22H11.7825M5 20L3.5 17.5L4.5 14.5L2 9.5L4 7\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M19.1901 9.66219L20.5001 7.0008H9.99996L11 5.0004L8.99996 2.0004L6.74874 7.0008H4.00006L8.99996 17.0004H5.99996L4.99996 20.0004H10.5L11.7516 22.0004L17.4017 12.0659L18.9401 14.5004H22L19.1901 9.66219Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12.0001 15.5L9.00006 10H15.0001L12.0001 15.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","ReplitIcon":"<path d=\"M12 3.5V8.5H5C4.44772 8.5 4 8.05228 4 7.5V3.5C4 2.94772 4.44772 2.5 5 2.5H11C11.5523 2.5 12 2.94772 12 3.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12 15.5V20.5C12 21.0523 11.5523 21.5 11 21.5H5C4.44772 21.5 4 21.0523 4 20.5V16.5C4 15.9477 4.44772 15.5 5 15.5H12Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M20 9.5V14.5C20 15.0523 19.5523 15.5 19 15.5H12V8.5H19C19.5523 8.5 20 8.94772 20 9.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","WindSurfIcon":"<path d=\"M8 21L7 22\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M22 19H2C7 20.7143 12.9751 22 17 22C20 22 22 19.7347 22 19Z\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M16.0103 2C18.1781 7 16.2964 16.3438 15 19\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M15.0929 16.9358C9.3081 15.5156 8.37003 12.6904 7.79688 10.911C8.80901 10.0524 11.6989 6.5487 12.9641 4.88797C13.9629 3.41804 14.0749 2.89451 14.9351 3.00177C15.0113 3.01128 15.8034 3.54155 16.2029 3.91879M7.79688 10.911C9.07691 12.6395 13.9342 13.0313 16.2029 13.0111\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","GoogleGeminiIcon":"<path d=\"M3 12C7.97056 12 12 7.97056 12 3C12 7.97056 16.0294 12 21 12C16.0294 12 12 16.0294 12 21C12 16.0294 7.97056 12 3 12Z\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","AmazonIcon":"<path d=\"M7 6L9.5 7C9.5 7 10 5 12 5C13.6 5 14.1664 6.86545 14 8.5C7.5 8.5 6.5 11.5 6.5 13C6.5 14.5 7.5 17 10.5 17C13 17 14.5 15 14.5 15L15.5 16.5L18 14.5C18 14.5 17 13.6667 17 12.5V9C17 9 17.6681 2.5 12 2.5C7.6 2.5 7 6 7 6Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M13.5 10.8555C13.5 12.3555 12.5805 14.3555 11.2014 14.3555C9.30586 14.3555 9.36245 10.8555 13.5 10.8555Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M2 17.5C2 17.5 10.5 23.5844 19 19.5281C19 19.5281 10.5 25.1056 2 17.5Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M21.99 17.7025C22.136 19.0999 20.6414 21 20.6414 21C20.6414 21 21.6208 19.4076 21.4245 17.7025C19.8212 17.0648 18 17.7895 18 17.7895C18 17.7895 19.5024 16.685 21.4245 17.0888C21.7265 17.1522 21.9579 17.3956 21.99 17.7025Z\" stroke=\"currentColor\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","BotIcon":"<path d=\"M13 7H11C8.19108 7 6.78661 7 5.77772 7.67412C5.34096 7.96596 4.96596 8.34096 4.67412 8.77772C4 9.78661 4 11.1911 4 14C4 16.8089 4 18.2134 4.67412 19.2223C4.96596 19.659 5.34096 20.034 5.77772 20.3259C6.78661 21 8.19108 21 11 21H13C15.8089 21 17.2134 21 18.2223 20.3259C18.659 20.034 19.034 19.659 19.3259 19.2223C20 18.2134 20 16.8089 20 14C20 11.1911 20 9.78661 19.3259 8.77772C19.034 8.34096 18.659 7.96596 18.2223 7.67412C17.2134 7 15.8089 7 13 7Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M4 14H2\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M10 17H14\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M22 14H20\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M15 11V13\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M9 11V13\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M12 7C12 5.11438 12 4.17157 11.4142 3.58579C10.8284 3 9.88562 3 8 3\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","StarIcon":"<path d=\"M13.7276 3.44418L15.4874 6.99288C15.7274 7.48687 16.3673 7.9607 16.9073 8.05143L20.0969 8.58575C22.1367 8.92853 22.6167 10.4206 21.1468 11.8925L18.6671 14.3927C18.2471 14.8161 18.0172 15.6327 18.1471 16.2175L18.8571 19.3125C19.417 21.7623 18.1271 22.71 15.9774 21.4296L12.9877 19.6452C12.4478 19.3226 11.5579 19.3226 11.0079 19.6452L8.01827 21.4296C5.8785 22.71 4.57865 21.7522 5.13859 19.3125L5.84851 16.2175C5.97849 15.6327 5.74852 14.8161 5.32856 14.3927L2.84884 11.8925C1.389 10.4206 1.85895 8.92853 3.89872 8.58575L7.08837 8.05143C7.61831 7.9607 8.25824 7.48687 8.49821 6.99288L10.258 3.44418C11.2179 1.51861 12.7777 1.51861 13.7276 3.44418Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","FileCheckIcon":"<path d=\"M9 16.1667C9 16.1667 9.75 16.1667 10.5 17.5C10.5 17.5 12.8824 14.1667 15 13.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M13 2.5V3C13 5.82843 13 7.24264 13.8787 8.12132C14.7574 9 16.1716 9 19 9H19.5M20 10.6569V14C20 17.7712 20 19.6569 18.8284 20.8284C17.6569 22 15.7712 22 12 22C8.22876 22 6.34315 22 5.17157 20.8284C4 19.6569 4 17.7712 4 14V9.45584C4 6.21082 4 4.58831 4.88607 3.48933C5.06508 3.26731 5.26731 3.06508 5.48933 2.88607C6.58831 2 8.21082 2 11.4558 2C12.1614 2 12.5141 2 12.8372 2.11401C12.9044 2.13772 12.9702 2.165 13.0345 2.19575C13.3436 2.34355 13.593 2.593 14.0919 3.09188L18.8284 7.82843C19.4065 8.40649 19.6955 8.69552 19.8478 9.06306C20 9.4306 20 9.83935 20 10.6569Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>","ArrowRightDoubleIcon":"<path d=\"M12.5 18C12.5 18 18.5 13.5811 18.5 12C18.5 10.4188 12.5 6 12.5 6\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M5.50005 18C5.50005 18 11.5 13.5811 11.5 12C11.5 10.4188 5.5 6 5.5 6\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>"};
  // Replay winds back. Mirror its arc and arrowhead around the play triangle.
  ICONS.ReplayIcon = "<g transform=\"translate(24 0) scale(-1 1)\"><path d=\"M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C15.0413 2 17.7655 3.35767 19.5996 5.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M20 2.5V6H16.5\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/></g><path d=\"M15.9453 12.3577C15.7686 12.9844 14.9333 13.4273 13.2629 14.3131C11.648 15.1693 10.8406 15.5975 10.1899 15.4254C9.9209 15.3542 9.6758 15.2191 9.47812 15.0329C9 14.5827 9 13.7094 9 11.9629C9 10.2163 9 9.34307 9.47812 8.89284C9.6758 8.7067 9.9209 8.57157 10.1899 8.50042C10.8406 8.32833 11.648 8.75646 13.2629 9.61272C14.9333 10.4985 15.7686 10.9414 15.9453 11.5681C16.0182 11.8268 16.0182 12.099 15.9453 12.3577Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>";
  // Hugeicons Stroke Rounded, MIT. The switch matches the layer’s other Hugeicons.
  ICONS.SunMoonIcon = "<path d=\"M16.5 11.5C16.5 9.567 14.933 8 13 8\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M13.5 2.5V4.5M19.5018 4.5L18.0028 5.99902M21.5018 10.5H19.502\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/><path d=\"M17 16.5314C16.116 17.0034 15.1064 17.271 14.0343 17.271C10.552 17.271 7.72899 14.448 7.72899 10.9657C7.72899 9.89358 7.99657 8.88398 8.46857 8C5.33406 8.73462 3 11.548 3 14.9065C3 18.8241 6.17586 22 10.0935 22C13.452 22 16.2654 19.6659 17 16.5314Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>";
  ICONS.Sun03Icon = "<path d=\"M17 12C17 14.7614 14.7614 17 12 17C9.23858 17 7 14.7614 7 12C7 9.23858 9.23858 7 12 7C14.7614 7 17 9.23858 17 12Z\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M12 2V3.5M12 20.5V22M19.0708 19.0713L18.0101 18.0106M5.98926 5.98926L4.9286 4.9286M22 12H20.5M3.5 12H2M19.0713 4.92871L18.0106 5.98937M5.98975 18.0107L4.92909 19.0714\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"1.5\"/>";
  ICONS.Moon02Icon = "<path d=\"M21.5 14.0784C20.3003 14.7189 18.9301 15.0821 17.4751 15.0821C12.7491 15.0821 8.91792 11.2509 8.91792 6.52485C8.91792 5.06986 9.28105 3.69968 9.92163 2.5C5.66765 3.49698 2.5 7.31513 2.5 11.8731C2.5 17.1899 6.8101 21.5 12.1269 21.5C16.6849 21.5 20.503 18.3324 21.5 14.0784Z\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"1.5\"/>";

  // Latest is the round arrow's own chevron twice, so its height and stroke match Next beside it (the user, 2026-11-09:
  // "what if latest just became >> next to the >, no label. same shape, check the sizing bc the hugeicon looks not consistent")
  ICONS.LatestChevronIcon = ['-4.25', '4.25'].map((x) => `<g transform="translate(${x} 0)">${ICONS.ArrowRight01Icon}</g>`).join('');
  const icon = (n, cls = '') => `<svg class="pn-ic ${cls}" viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">${ICONS[n] || ''}</svg>`;
  // Shared artwork keeps the outline mark and the browser icon in the same material.
  function brandIcon(id, outline = false) {
    const scale = outline ? 13 / 21.5 : .6667, inset = outline ? (24 - 24 * scale) / 2 : 4;
    const radius = outline ? 6 / 21.5 * 24 : 5.5;
    const glyph = ICONS.HighlighterIcon.replace(/currentColor/g, `url(#${id}-mark)`)
      .replace(/stroke-width="1.5"/g, `stroke-width="${outline ? 1.5 : 1.9}"`);
    return `<svg class="pn-brand" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><defs>
      <linearGradient id="${id}-face" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#30343c"/><stop offset=".55" stop-color="#191c22"/><stop offset="1" stop-color="#0b0d11"/></linearGradient>
      <radialGradient id="${id}-light" cx=".3" cy=".08" r=".8"><stop stop-color="white" stop-opacity=".11"/><stop offset=".5" stop-color="white" stop-opacity=".01595"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient>
      <linearGradient id="${id}-rim" x1="0" y1="0" x2="0" y2="1"><stop stop-color="white" stop-opacity=".32"/><stop offset=".4" stop-color="white" stop-opacity=".04256"/><stop offset="1" stop-color="white" stop-opacity=".10656"/></linearGradient>
      <linearGradient id="${id}-mark" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="24"><stop stop-color="#f3f4f7"/><stop offset="1" stop-color="#c3c8d1"/></linearGradient>
      <filter id="${id}-raised" filterUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><feDropShadow dx="0" dy=".055" stdDeviation=".04" flood-color="black" flood-opacity=".4"/></filter>
      <clipPath id="${id}-tile"><rect width="24" height="24" rx="${radius}"/></clipPath></defs>
      <g clip-path="url(#${id}-tile)"><rect width="24" height="24" fill="url(#${id}-face)"/><rect width="24" height="24" fill="url(#${id}-light)"/>
      <rect width="24" height="24" rx="${radius}" fill="none" stroke="url(#${id}-rim)" stroke-width=".234375"/>
      <g transform="translate(${inset} ${inset}) scale(${scale})" filter="url(#${id}-raised)" fill="none">${glyph}</g></g></svg>`;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  // the layer's scale: every px in its CSS grows by it, hairlines aside, and so do the layout numbers that match the CSS.
  // 1.21 until 1.85.0, then 8% smaller (the user: "reduce the ui size by 5-10% as its default")
  const UI = 1.11;
  // the layer's own elements (the outline, the notes column, its bar and footer, pop-ups, stickers) live in a shadow root on
  // <html>: no page rule reaches them, and none of theirs reaches the page. The host takes no box and inherits nothing
  // (all:initial, inline and !important, so no page rule on it wins), so the layer's absolute boxes still sit in page
  // coordinates and its fixed ones on the window. WRAP holds them all and carries the classes the page's <html> gets
  // (pnR-open and the rest), unprefixed, so the layer's CSS can key on them
  const HOST = document.createElement(P + 'layer');
  HOST.setAttribute('style', 'all:initial !important;display:contents !important');
  const ROOT = HOST.attachShadow({ mode: 'open' });
  const WRAP = document.createElement('div'); WRAP.className = 'pn-root'; ROOT.appendChild(WRAP);
  document.documentElement.appendChild(HOST);
  const scaled = (s) => s.replace(/(\d*\.?\d+)px/g, (m, n) => (n > 2 ? +(n * UI).toFixed(2) : +n) + 'px');
  // the layer's CSS goes in its shadow root, where :root and html are WRAP
  const css = (s) => { const st = document.createElement('style'); st.textContent = scaled(s).replace(/:root\b/g, '.pn-root').replace(/\bhtml\./g, '.pn-root.'); ROOT.insertBefore(st, WRAP); };
  // CSS for what the layer marks in the page itself: highlights, pictures, edited lines, and the padding that makes room for the columns
  const pageCss = (s) => { const st = document.createElement('style'); st.textContent = scaled(s); document.head.appendChild(st); };
  // a class on the page's <html> and <body> (prefixed) and on WRAP (as the layer's CSS names it)
  const rootCls = (name, on) => { const pg = P + name.replace(/^pn-?/, ''); document.documentElement.classList.toggle(pg, on); document.body.classList.toggle(pg, on); WRAP.classList.toggle(name, on); };
  // the element an event really started on, inside the shadow root too; a document listener sees only the host
  const tgt = (e) => (e.composedPath ? e.composedPath()[0] : e.target);
  const inLayer = (x) => !!x && (x === HOST || ROOT.contains(x));
  const newId = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  // a list add_notes.py wrote into the tag (data-versions, data-asks and the rest): anything but a JSON array is none
  const tagList = (k) => { try { const a = JSON.parse(script.dataset[k] || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };

  // ---------- versions: add_notes.py --after writes every version of the page into each version's tag, oldest first,
  // as [{file, page, name, at, changed, round}]. A page with one version, or none, is a plain page. ----------
  let LIST = tagList('versions');
  // a new round stays out of reach until the agent opens it for the user (the user: "i shouldn't be able to get to
  // the subsequent round until you're finished with it"). A version's page marks itself opened in the user's browser when it loads
  // (show.py opens it, or the user opens the file themselves), in human-feedback:opened/<page>; until then every other version
  // leaves it, and anything after it, off its list, as if it weren't made yet, so neither the arrows nor a refresh reach it.
  // add_notes.py records each version's last run (`made`): one never opened comes into reach HOLD_FOR after it, so a round
  // the agent never shows can't stay hidden for good. A version with no `made` (listed before 1.68.0) is always in reach
  const OPENED = 'human-feedback:opened/', HOLD_FOR = 2 * 3600e3;
  let LISTED = 0;   // versions in the tag, held ones too: a version 1 whose round 2 is held is still no first round
  if (LIST.length) {
    const me = LIST.findIndex((v) => v && v.page === PAGE);
    if (me >= 0) try { localStorage.setItem(OPENED + PAGE, String(LIST[me].at || '')); } catch (e) { /* storage blocked */ }
    const held = (v) => {
      const made = Date.parse(v?.made || ''); if (!made || Date.now() - made >= HOLD_FOR) return false;
      try { return localStorage.getItem(OPENED + v.page) !== String(v.at || ''); } catch (e) { return false; }   // storage blocked: in reach
    };
    let end = LIST.length; while (me >= 0 && end - 1 > me && held(LIST[end - 1])) end--;
    LISTED = me >= 0 ? LIST.length : 0; LIST = LIST.slice(0, end);   // a list without this page in it (a copied file's) is none
  }
  const CUR = LIST.findIndex((v) => v && v.page === PAGE);
  const V = CUR >= 0 && LIST.length > 1 ? { list: LIST, cur: CUR, last: LIST.length - 1 } : null;
  // a feedback round runs from one version's making to the next: anything written before the latest version was made
  // was handed over already, so it shows dimmed and read-only and isn't copied again. Time, not a stamp, decides, so a
  // note typed in a tab opened before the latest version existed still goes out with this round.
  const ROUND_START = V ? Date.parse(LIST[V.last].at) || 0 : 0;
  // an earlier version is locked: its round is over, so no new notes, edits, Overall words or copies there, only reading
  // (the user: "if i'm on round 2, round 1 should be locked")
  const PAST = !!V && V.cur !== V.last;
  const storeKey = (v) => 'human-feedback:' + v.page + '#' + (v.round || 1);
  // Overall belongs to the whole round, not one version: one box for the set and its latest version, the same text on
  // every version; a new version starts an empty one, and the old box becomes last round's Overall
  const ovKey = (v) => 'human-feedback:overall/' + LIST[0].page + '@' + v.page + '#' + (v.round || 1);
  const OVK = V ? ovKey(LIST[V.last]) : null;

  // ---------- storage: every keystroke is saved, so a reload or crash loses nothing ----------
  let own = '';   // on a version page, the Overall this page held before it had versions: kept, as last round's
  function load() {
    let s = null; try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* storage blocked */ }
    s = s && Array.isArray(s.notes) ? { overall: '', ui: {}, ...s } : { notes: [], overall: '', ui: {} };
    if (!Array.isArray(s.hl)) s.hl = [];   // highlights (1.100.0): marked words with no note, kept beside the notes
    if (OVK) { own = s.overall; s.overall = ''; try { s.overall = localStorage.getItem(OVK) || ''; } catch (e) { /* storage blocked */ } }
    return s;
  }
  const state = load();
  let ovSaved = state.overall;
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(OVK ? { ...state, overall: own } : state));
      if (OVK && state.overall !== ovSaved) { localStorage.setItem(OVK, state.overall); ovSaved = state.overall; }
    } catch (e) { /* storage blocked */ }
  }
  // another tab, on any version, typed in the round's Overall: follow it, so this tab can't write an old copy back
  if (OVK) addEventListener('storage', (e) => { if (e.key === OVK && e.newValue != null && e.newValue !== state.overall) { state.overall = ovSaved = e.newValue; window.PN?.onOverall?.(); } });
  // another version's notes, as they were last saved; a browser that keeps each file's storage apart just finds none
  function storeOf(i) {
    if (i === V.cur) return state;
    try { const s = JSON.parse(localStorage.getItem(storeKey(LIST[i]))); if (s && Array.isArray(s.notes)) return { edits: {}, ...s }; } catch (e) { /* storage blocked */ }
    return { notes: [], edits: {}, overall: '' };
  }
  // the Overall written while version i was the latest: its round's box, or, from before versions began, the page's own
  function pastOverall(i) {
    let t = null; try { t = localStorage.getItem(ovKey(LIST[i])); } catch (e) { /* storage blocked */ }
    if (t == null) t = i === V.cur ? own : storeOf(i).overall;
    return (t || '').trim();
  }

  // ---------- sent: a copy locks what it held at once: it turns read-only with a tick on each bubble, and later
  // copies leave it out; with nothing new, Copy copies it all again and it stays locked (the user: "make comments lock as soon
  // as copied ... so users don't keep editing after they've already pasted"). Unlock makes it live. When the user's paste reaches
  // the agent, it runs add_notes.py --received, which writes `.<page file>.received.js` beside the page with the time it
  // got it; that only turns the bar's Copied to Received. One record per round, shared by every version ----------
  const SENT_KEY = 'human-feedback:sent/';
  const ownSentKey = SENT_KEY + (script.dataset.key || PAGE) + '#' + (script.dataset.round || '1');
  const versionSentKey = (v) => SENT_KEY + LIST[0].page + '@' + v.page + '#' + (v.round || 1);
  const SK = V ? versionSentKey(LIST[V.last]) : ownSentKey;
  const readSent = (raw) => { let s = null; try { s = JSON.parse(raw); } catch (e) { /* bad record */ } s = s && typeof s === 'object' ? s : {}; if (!Array.isArray(s.copies)) s.copies = []; if (s.at && s.got == null) s.got = s.to; return s; };   // got: the copy the last receipt covered
  let sent = {}; try { sent = readSent(localStorage.getItem(SK)); } catch (e) { sent = readSent(null); }
  const keepSent = () => { try { localStorage.setItem(SK, JSON.stringify(sent)); } catch (e) { /* storage blocked */ } };
  let all = false;   // true while Copy again writes its text: nothing counts as sent
  const sentOn = () => !!sent.to && !sent.unlocked && !all;
  const wasSent = (t) => sentOn() && (t || 0) <= sent.to;
  const ovSent = () => sentOn() && !!(sent.ov || '').trim() && state.overall === sent.ov;
  const answerSent = (x) => answered(x) && wasSent(x.at);
  const rcvdOn = () => sentOn() && !!sent.got;
  // the agent has it, so its bubble's tick is two: written before this round's version was made (`made`, an earlier
  // round's), or sent in a copy the user's paste covered (got). `t` is when it was last changed
  const gotIt = (t, made = t) => (!!V && (made || 0) < ROUND_START) || (wasSent(t) && (t || 0) <= (sent.got || 0));
  // the receipt: the copy the agent got is the user's last one before it, already locked; one unlocked since locks again. One
  // already taken (loaded again on a reload) changes nothing
  function received(t) {
    t = Number(t) || 0; if (t <= (sent.at || 0)) return;
    const c = sent.copies.filter((x) => x.t <= t).pop(); if (!c) return;   // no copy this round before it
    const relock = !sentOn();
    if (relock || (sent.to || 0) < c.t) Object.assign(sent, { to: Math.max(sent.to || 0, c.t), ov: (sent.to || 0) < c.t ? c.ov : sent.ov });
    Object.assign(sent, { at: t, got: c.t, unlocked: false }); keepSent();
    window.PN?.onSent?.(relock ? 'relock' : 'rcv');
  }
  window.PN_RECEIVED = received;
  // a script beside the page, so it loads from file:// with no server
  const RECEIPT = '.' + (decodeURIComponent(location.pathname.split('/').pop()) || 'index.html') + '.received.js';
  function checkReceipt() { const sc = document.createElement('script'); sc.src = RECEIPT + '?t=' + Date.now(); sc.onload = sc.onerror = () => sc.remove(); document.head.appendChild(sc); }
  // after a copy, look every few seconds until its receipt comes, for half an hour; a page opened later looks once
  let waitT = 0;
  const waiting = () => { const last = sent.copies[sent.copies.length - 1]; return !!last && (sent.at || 0) < last.t && Date.now() - last.t < 30 * 60e3; };
  function wait() { clearTimeout(waitT); if (!waiting()) return; checkReceipt(); waitT = setTimeout(wait, 3000); }
  function copied(t, drafts) {
    settleCopiedReplies(drafts);
    sent.copies = [...sent.copies.slice(-19), { t, ov: state.overall }];
    Object.assign(sent, { to: t, ov: state.overall, unlocked: false }); keepSent(); wait();
    window.PN?.onSent?.('lock');
  }
  function unlock() { sent.unlocked = true; keepSent(); }
  if (waiting()) wait(); else if (sent.copies.length) checkReceipt();   // reopened while a copy still waits, it keeps looking
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wait(); });
  // another tab of the page took a receipt, copied or unlocked: follow it
  addEventListener('storage', (e) => { if (e.key === SK && e.newValue) { sent = readSent(e.newValue); window.PN?.onSent?.(false); wait(); } });

  // ---------- edits: the user rewrites a line or paragraph themselves, through Edit in the selection pill; the agent never marks
  // text for the user to fill in (the user: "the agent should only be allowed to ask questions"). Changed text is kept and copied ----------
  if (!state.edits) state.edits = {};
  if (!state.editAt) state.editAt = {};   // when each edit was last typed, which decides its round like a note's
  // an edit from before this was kept has no time: on the latest version it's this round's, on an earlier one it went out already
  const editLocked = (label, s = state, i = V?.cur) => {
    const t = (s.editAt || {})[label];
    return (!!V && (t ?? (i === V.last ? Infinity : 0)) < ROUND_START) || (t != null && wasSent(t));
  };
  // ---------- questions: the agent's, from the tag ([{id, block, quote, text}], add_notes.py --ask). A reply is kept with the
  // question's words, so a copy made on another version can still say what was asked ----------
  let ASKS = tagList('asks');
  ASKS.forEach((a, i) => { a.id = String(a.id || 'q' + i); });
  // the agent's replies to the user's notes ([{id, block, quote, said, text}], add_notes.py --reply) are shown and answered like
  // its questions, with the user's note's words above the reply
  ASKS = [...ASKS, ...tagList('replies').map((r, i) => ({ ...r, id: String(r.id || 'r' + i), said: String(r.said || ''), reply: true }))];
  // --done closes the user's note where the user wrote it. Each version's done list travels in data-versions, so an earlier page
  // can put the check on its own note; no done mark becomes a thread in the new round.
  const ASKS_OPEN = !V || V.cur === V.last;   // an earlier version's questions were an earlier round's: shown, closed
  const answerable = (a) => ASKS_OPEN && !a.ew;   // a thread the user answered in chat (`ew`, below) is closed too
  if (!state.answers) state.answers = {};
  // an answer is a reply to one of the agent's questions, kept like a note: words, a sticker, pictures (`files`), or any mix
  const tie = (id) => { const x = state.answers[id]; if (x) { x.id = 'q:' + id; x.created = x.created || x.at || 0; } };   // a kept answer, tied back to its thread
  ASKS.forEach((a) => tie(a.id));
  // one reply per thread (2026-10-26: "k. we can bring back multiple replies later if i change my mind"): once the user
  // has replied, the Reply box goes and a click on the user's reply rewrites it. `rs` holds the user's replies, oldest first (one now;
  // stores from 1.15.0 to 1.83.0 may hold several, which still show and copy), and `a` mirrors the first. `draft` is
  // what's in the Reply box, kept per keystroke and counted as the user's reply until it becomes a bubble
  const repliesOf = (x) => (x ? (Array.isArray(x.rs) ? x.rs : [x.a || '']) : []).map(String).filter((t) => t.trim());
  const allReplies = (x) => [...repliesOf(x), ...((x?.draft || '').trim() ? [x.draft.trim()] : [])];
  const setReplies = (x, rs) => { x.rs = rs.map((t) => String(t).trim()).filter(Boolean); x.a = x.rs[0] || ''; };
  // the reactions, declared before anything that reads an answer: carried threads check the user's earlier answers at load. ❓ comes
  // right after ✅ (1.103.0; the user: a question reaction, so the user can mark words the user has a question about without typing it)
  const REACT = { check: ['CheckIcon', 'OK', '✅'], up: ['ThumbsUpIcon', 'Like', '👍'], down: ['ThumbsDownIcon', 'Dislike', '👎'], heart: ['HeartIcon', 'Love it', '❤️'], party: ['PartyIcon', 'Celebrate', '🎉'], ask: ['HelpSquareIcon', 'Question', '❓'] };   // ❓ last (the user: "move the question emoji to the end of the emojis")
  const answered = (x) => !!(x && (allReplies(x).length || REACT[x.react] || x.files?.length)) && !(V && (x.at || 0) < ROUND_START);
  // answered with something sent into the thread: a reply that's a bubble, a reaction or a picture, not words still in the
  // Reply box. What counts open threads uses this, so a thread stays open while the user types and its count steps down once, as
  // the user's reply lands (the user: "it said "1 of 4", and now that i'm replying it says 3. this is all very confusing")
  const replied = (x) => !!(x && (repliesOf(x).length || REACT[x.react] || x.files?.length));   // visible committed responses close their thread regardless of their saved timestamp
  const answerOf = (a) => (state.answers[a.id] ||= { id: 'q:' + a.id, q: a.text, block: a.block, quote: a.quote, ...(a.reply ? { reply: true, said: a.said } : {}), a: '', at: Date.now(), created: Date.now() });
  // ---------- carried: the agent's questions and replies from earlier rounds ([{id, kind, from, block, quote, said, text}],
  // add_notes.py's data-carry) ride into every new version, so one the user never answered can't drop out because the agent
  // didn't pass it again (the user: "I missed a bunch of your open threads from version two, so you can bring them back so I
  // can make sure I see everything you've replied to me on"). On the latest version each is open like this round's own
  // until the user answers it; one the user answered in any earlier round, whenever, stays out. On an earlier version only the ones the user
  // answered there show, closed, with the user's answer ----------
  const gave = (x) => !!(x && (allReplies(x).length || REACT[x.react] || x.files?.length));
  // every store an earlier round wrote: each version's rounds, and this page's own rounds before this one
  function pastStores() {
    const keys = V ? LIST.flatMap((v, i) => Array.from({ length: +v.round || 1 }, (_, r) => ['human-feedback:' + v.page + '#' + (r + 1), i + 1]))
      : Array.from({ length: Math.max(0, (+script.dataset.round || 1) - 1) }, (_, r) => ['human-feedback:' + (script.dataset.key || PAGE) + '#' + (r + 1), r + 1]);
    return keys.filter(([k]) => k !== KEY).map(([k, round]) => { try { return { ...(JSON.parse(localStorage.getItem(k)) || {}), round }; } catch (e) { return { round }; } });   // round: where a thread's `from` can be matched
  }
  // ---------- closed by the user's notes: a question can be answered without a word in its own thread (the user, on "How full
  // should a normal day be?", with a 👍 and a 👎 on the options under it: "i answered this implicitly below ... it's considered
  // closed and doesn't have to persist to the next round"). The layer decides, because only the browser holds the notes:
  // add_notes.py carries every thread and the page drops the closed ones. A note, reaction or picture closes a question on its
  // part, or on a part around it, when the question is about the whole part: no quote, or a quote of the part's own heading,
  // which is how a question gets its line on a long part. A question on some of the part's words takes only a note on those
  // words. A ❓ asks rather than answers, and edits and highlights answer nothing. The Reply box stays, and the copy names
  // these questions, so the agent reads the notes and asks again if they don't answer it ----------
  const squashed = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
  function closesQuestion(a, n) {
    if (!n?.block || n.react === 'ask' || !(String(n.text || '').trim() || REACT[n.react] || n.files?.length)) return false;
    const part = blockEl(a.block), inPart = n.block === a.block || !!(part && blockEl(n.block) && part.contains(blockEl(n.block)));
    if (!inPart) return false;
    const q = squashed(a.quote), words = squashed(n.quote);
    return !q || squashed(part?.querySelector('h1,h2,h3,h4,h5,h6')?.textContent).includes(q) || (!!words && (q.includes(words) || words.includes(q)));
  }
  const closedByNotes = (a, notes = state.notes) => !a.reply && !!a.block && (notes || []).some((n) => closesQuestion(a, n));
  const threadClosed = (a) => replied(state.answers[a.id]) || closedByNotes(a);
  const CARRY = tagList('carry');
  if (CARRY.length) {
    const have = new Set(ASKS.map((a) => a.id)), past = ASKS_OPEN ? pastStores() : [];
    const kept = CARRY.filter((c) => c && typeof c === 'object' && c.id && c.text && !have.has(String(c.id)) && have.add(String(c.id)))
      .filter((c) => (ASKS_OPEN ? !past.some((s) => gave((s.answers || {})[c.id]) || (s.round >= (+c.from || 0) && closedByNotes({ ...c, reply: c.kind === 'reply' }, s.notes))) : gave(state.answers[c.id])))
      .map((c) => ({ id: String(c.id), block: c.block, quote: c.quote, text: String(c.text), from: +c.from || 0, carried: true, ...(c.kind === 'reply' ? { reply: true, said: String(c.said || ''), gist: c.gist } : {}) }));
    kept.forEach((a) => tie(a.id));
    ASKS.push(...kept);
  }
  // ---------- answered in chat: one of the agent's threads the user answered somewhere else ([{id, kind, from, block, quote, said,
  // text, answer}], add_notes.py --answered; the user: "give the notes tool a way to close a question once you've answered it
  // outside the page"). Its id is the thread's own: this round's question or reply takes the user's words as `ew` and closes;
  // one carried from an earlier round, which the tag no longer carries, comes back from here, closed. Never counted,
  // reminded of or copied, since the agent has the answer ----------
  tagList('answered').filter((x) => x && typeof x === 'object' && x.id && String(x.answer || '').trim()).forEach((x) => {
    const id = String(x.id), a = ASKS.find((q) => q.id === id);
    if (a) { a.ew = String(x.answer).trim(); return; }
    if (!x.text) return;
    ASKS.push({ id, block: x.block, quote: x.quote, text: String(x.text), ew: String(x.answer).trim(),
      ...(+x.from ? { carried: true, from: +x.from } : {}), ...(x.kind === 'reply' ? { reply: true, said: String(x.said || ''), gist: x.gist } : {}) });
  });
  function replyDraft(a) {
    const x = state.answers[a.id];
    return !a.ew && x?.draft?.trim() ? { id: a.id, text: x.draft, at: x.at } : null;
  }
  // A draft sent by Copy has answered its thread, even if the box never blurred. A later edit stays a draft.
  function settleCopiedReplies(drafts) {
    let changed = false;
    for (const { id, text, at } of drafts) {
      const x = state.answers[id];
      if (!x || x.draft !== text || x.at !== at) continue;
      setReplies(x, [...repliesOf(x), text]);
      delete x.draft;
      changed = true;
    }
    if (changed) save();
  }
  // Keep answers copied by older versions of the layer visible as replies, including when reading their old page.
  try {
    const ownCopy = PAST ? readSent(localStorage.getItem(versionSentKey(LIST[V.cur]))) : sent;
    const to = ownCopy.to || (PAST && V.cur === 0 ? readSent(localStorage.getItem(ownSentKey)).to : 0);
    if (to) settleCopiedReplies(ASKS.map(replyDraft).filter((d) => d && d.at > 0 && d.at <= to));
  } catch (e) { /* storage blocked */ }
  // ---------- what changed: gone (the user: "let's remove 'what changed' from human-feedback ... it's redundant since you'd
  // note things in your new threads anyway"). An older tag's versions list still carries each version's `changed`, and the user's
  // store may still hold a reply to it (answers.changed, id q:changed): neither is drawn, counted, badged, typed or copied ----------
  // the round a carried thread was first asked in, as the stepper names it
  const fromRound = (a) => (a.carried && a.from ? `Round ${a.from}` : '');
  const reactables = () => [...state.notes, ...ASKS.filter(answerable).map((a) => state.answers[a.id]).filter((x) => x && answered(x))];
  const tag = document.createElement('div'); tag.className = 'pn-ui pn-etag';
  tag.innerHTML = `${icon('PencilEdit02Icon')}<span>Editing</span><span class="k">Enter to finish</span>`;
  WRAP.appendChild(tag);
  const editor = editEngine({ state, save, readOnly: () => sentOn() || PAST, inLayer, tag, keepMissing: (label) => !!frameEditRef(label) });
  const { initEdits, editEl, editParts, revertEdit, openEdit, closeEdit, editBlockAt, editRange, spanHead, editHist, editIsOpen, editFresh, editStepAt, originals } = editor;

  function editEngine({ state, save, readOnly, inLayer, tag, onClose, stableKeys = false, keepMissing = () => false }) {
    // every line or paragraph in a part can be edited, with no marking by the agent: each text block gets a key (its part's
    // label, then its place among the part's text blocks) and takes typing only while the user has it open from the pill's Edit
    const EDIT_BLOCK = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,td,th,figcaption,blockquote,caption';
    // any other element the page draws as a block of words takes Edit too (1.103.0; the user, on a bio box, a <div> holding a
    // name <span> and lines kept by white-space: pre-line: "why cant' i use huyman-feedback edit tool on elements like
    // this? fix"). Each run of words outside the blocks above belongs to the nearest element around it that isn't drawn
    // inline, and that element is a block of its own, with the blocks drawn inside it taken into it (the bio's name line).
    // Not one that holds a block above, a part, a picture or a control (a layout box, not a line of words), not a control
    // or something clickable itself, and not one that isn't drawn. Keyed apart from the blocks above (` ¦ b1`), so an edit
    // stored before keeps its block
    const NOT_WORDS = 'script,style,noscript,template,textarea,select,option,button,input,svg,math,iframe,object,canvas,video,audio,[contenteditable]';
    const BOXES = 'img,svg,canvas,video,audio,iframe,object,embed,button,input,textarea,select,[data-note],' + EDIT_BLOCK;
    const CLICKS = 'a[href],button,label,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=switch],[tabindex],[onclick]';
    function wordBlocks() {
      if (!document.body) return [];
      const shown = new Map(), dsp = (e) => { if (!shown.has(e)) shown.set(e, getComputedStyle(e)); return shown.get(e); };
      const found = new Set(), tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let t; (t = tw.nextNode());) {
        let e = t.parentElement; if (!t.data.trim() || !e) continue;
        const tb = e.closest(EDIT_BLOCK); if (tb && !tb.querySelector(EDIT_BLOCK)) continue;   // a block above has these words
        if (e.closest('.' + P + 'lead')) continue;   // a nested list's lead-in words, an edit block already (1.101.0)
        if (e.closest(NOT_WORDS) || e.closest('.pn-ui') || inLayer(e)) continue;
        if (e.closest(CLICKS)) continue;   // a control's words (a link, a chip the user clicks) are not prose
        while (e && e !== document.body && /^(inline|contents)/.test(dsp(e).display) && dsp(e).cursor !== 'pointer') e = e.parentElement;
        if (e && e !== document.body && dsp(e).cursor !== 'pointer') found.add(e);
      }
      const ok = [...found].filter((e) => !e.querySelector(BOXES) && dsp(e).display !== 'none' && e.getClientRects().length);
      const keep = new Set(ok);
      const inner = (e) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) if (keep.has(a)) return true; return false; };
      return ok.filter((e) => !inner(e));
    }
    if (!state.edits) state.edits = {};
    if (!state.editAt) state.editAt = {};
    if (!state.editWas) state.editWas = {};   // each edit's words before the user changed them, so any version's copy says what it replaces
    // an edit across several blocks (1.92.0; the user: "i should be able to highlight the same stuff that comment can"): the first
    // block takes the user's words, and each block after it is a member, kept as an edit of its own ('' when it goes, the words the user left
    // unselected at its end when the selection stopped partway through it). editSpan names each first block's members, in page
    // order, so the copy, its row and Undo treat them as one change
    if (!state.editSpan) state.editSpan = {};
    const spanHead = (label, s = state) => Object.keys(s.editSpan || {}).find((h) => s.editSpan[h].includes(label)) || null;
    // an edit's blocks as the copy and its row read them: [{ label, was, now }], one for a plain edit
    const editParts = (label, s = state, live = s === state) => [label, ...((s.editSpan || {})[label] || [])].map((l) => ({ label: l, now: (s.edits || {})[l] ?? '',
      was: (s.editWas || {})[l] || (live ? originals.get(l) : '') || '' }));
    const originals = new Map();
    let editKeys = [];
    const indexed = new WeakMap();
    const editEls = () => editKeys.map((k) => k.el).filter((e) => e.isConnected);
    const textOf = (e) => e.innerText.replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').trim();
    const editEl = (label) => editKeys.find((k) => k.label === label)?.el || null;
    const editBlockAt = (node) => { const e = (node && (node.nodeType === 1 ? node : node.parentElement))?.closest('.' + P + 'edit'); return e && !inLayer(e) ? e : null; };
    // an edit shows as tracked changes against the page's own words, as in the user's writing app (the user: "does markup like my
    // writing app instead of merely replacing the text"): the words that go struck in red, then the words that come in green
    const originalHtml = new Map();
    const words = (t) => t.match(/\s+|[\p{L}\p{N}_'’-]+|[^\s\p{L}\p{N}_'’-]/gu) || [];
    function diffWords(a, b) {
      // the words both share at the start and at the end stay as they are, and only what lies between is compared, so a few
      // words changed in a long paragraph mark only those (1.90.0: past about 630 words a side it all went and all came)
      const X = words(a), Y = words(b); let p = 0, q = 0;
      while (p < X.length && p < Y.length && X[p] === Y[p]) p++;
      while (q < X.length - p && q < Y.length - p && X[X.length - 1 - q] === Y[Y.length - 1 - q]) q++;
      const x = X.slice(p, X.length - q), y = Y.slice(p, Y.length - q), n = x.length, m = y.length;
      const ops = X.slice(0, p).map((t) => ['=', t]);
      if (n * m > 400000) { if (n) ops.push(['-', x.join('')]); if (m) ops.push(['+', y.join('')]); }   // too long to compare word by word: all of it goes, all of it comes
      else {
        const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
        for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
        for (let i = 0, j = 0; i < n || j < m;) {
          if (i < n && j < m && x[i] === y[j]) { ops.push(['=', x[i]]); i++; j++; } else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) ops.push(['+', y[j++]]); else ops.push(['-', x[i++]]);
        }
      }
      ops.push(...X.slice(X.length - q).map((t) => ['=', t]));
      // a space between two changes joins them, so a rewritten phrase reads as one cut and one insertion
      ops.forEach((o, k) => { if (o[0] === '=' && !o[1].trim() && ops[k - 1] && ops[k - 1][0] !== '=' && ops[k + 1] && ops[k + 1][0] !== '=') o[0] = '~'; });
      const out = []; let del = '', ins = '';
      const flush = () => { if (del) out.push(['-', del]); if (ins) out.push(['+', ins]); del = ins = ''; };
      ops.forEach(([t, s]) => {
        if (t !== '=') { if (t !== '+') del += s; if (t !== '-') ins += s; return; }
        flush(); if (out.length && out[out.length - 1][0] === '=') out[out.length - 1][1] += s; else out.push(['=', s]);
      });
      flush();
      // a change of white space alone (a space added after a line break, 1.95.0) strikes and adds
      // only the white space that differs, so a kept line break isn't drawn struck beside an added one
      for (let k = 0; k + 1 < out.length; k++) {
        const [a, b] = [out[k], out[k + 1]];
        if (a[0] !== '-' || b[0] !== '+' || a[1].trim() || b[1].trim()) continue;
        let i = 0, j = 0; while (i < a[1].length && i < b[1].length && a[1][i] === b[1][i]) i++;
        while (j < a[1].length - i && j < b[1].length - i && a[1][a[1].length - 1 - j] === b[1][b[1].length - 1 - j]) j++;
        if (!i && !j) continue;
        const mid = [['=', a[1].slice(0, i)], ['-', a[1].slice(i, a[1].length - j)], ['+', b[1].slice(i, b[1].length - j)], ['=', a[1].slice(a[1].length - j)]].filter((o) => o[1]);
        out.splice(k, 2, ...mid);
      }
      for (let k = out.length - 1; k > 0; k--) if (out[k][0] === '=' && out[k - 1][0] === '=') { out[k - 1][1] += out[k][1]; out.splice(k, 1); }
      return out;
    }
    // words into a node, a line break as <br>, as innerText would set them
    const brLines = (node, s) => s.split('\n').forEach((t, i) => { if (i) node.append(document.createElement('br')); if (t) node.append(t); });
    function showEdit(e, label, t = state.edits[label]) {
      if (t == null) { e.innerHTML = originalHtml.get(label); return; }
      e.replaceChildren(...diffWords(originals.get(label), t).map(([k, s]) => {
        const run = k === '=' ? document.createDocumentFragment() : document.createElement(k === '-' ? 'del' : 'ins');
        if (k !== '=') run.className = P + (k === '-' ? 'del' : 'ins') + (s.trim() ? '' : ' ' + P + 'ws');   // white space alone: kept wide enough to see and click (1.95.0)
        brLines(run, s); return run;
      }));
    }
    // where a point in a marked-up block falls in the user's words alone, a line break counting one and struck words none
    const offsetAt = (e, node, off) => {
      const r = document.createRange(); r.setStart(e, 0); r.setEnd(node, off);
      const f = r.cloneContents(); f.querySelectorAll('.' + P + 'del').forEach((d) => d.remove()); f.querySelectorAll('br').forEach((b) => b.replaceWith('\n'));
      return f.textContent.length;
    };
    const pointAt = (e, k) => {
      for (const [i, n] of [...e.childNodes].entries()) {
        if (n.nodeType === 3) { if (k <= n.length) return [n, k]; k -= n.length; } else { if (!k) return [e, i]; k--; }
      }
      return [e, e.childNodes.length];
    };
    let onShown = null, onEdChange = null, editDirty = false;
    // innerText reads only words that are drawn, and a fresh round's opening keeps the page hidden until its wipe (body
    // visibility:hidden), so every block's original was read as nothing there: each edit then showed all green, with an
    // empty was: in the copy (1.90.0; the user, on 1.86.0: "this green diff highlighting isnt' correct, i only edited a few wors
    // in the para"). The page's words are read with it shown for that moment, within one task, so no frame draws without the
    // hold. A rule outranking the hold, in <head>, so nothing on <html> or <body> changes
    const shownNow = () => { const st = document.createElement('style'); st.textContent = `html body:not(#${P}read){visibility:visible!important}`; document.head.appendChild(st); return st; };
    function initEdits(onChange, shown) {
      editKeys = []; onShown = shown; onEdChange = onChange;
      const st = shownNow(); let mended = false;
      const own = (e, p) => !e.querySelector(EDIT_BLOCK) && (e.closest('[data-note]') || null) === p && !e.closest('.pn-ui') && !inLayer(e) && e.textContent.trim();
      // every part's blocks, then the page's own outside every part (the title, a lede, an as-of line), which the user can rewrite
      // as well (the user, on a letter's intro paragraph under its title: Edit should work on any prose the user can select)
      // a block holding blocks of its own (an <li> with a nested list: the user, "I couldn't edit this", the words "We'd like the
      // lease…" before its bullets, 1.101.0) is skipped as a whole, so its own words could never be edited. Its words before the
      // first nested block are wrapped in a block-level span, which is the edit block; the nested blocks stay as they are
      document.querySelectorAll(EDIT_BLOCK).forEach((b) => {
        if (b.closest('.pn-ui') || inLayer(b) || !b.querySelector(EDIT_BLOCK)) return;
        const kids = [...b.childNodes], k = kids.findIndex((n) => n.nodeType === 1 && (n.matches(EDIT_BLOCK) || n.querySelector(EDIT_BLOCK)));
        const head = kids.slice(0, k);
        if (k < 1 || !head.some((n) => n.textContent.trim()) || (head.length === 1 && head[0].classList?.contains(P + 'lead'))) return;
        const w = document.createElement('span'); w.className = P + 'lead'; b.insertBefore(w, head[0]); head.forEach((n) => w.appendChild(n));
      });
      const SEL = EDIT_BLOCK + ',span.' + P + 'lead';
      const homes = [...document.querySelectorAll('[data-note]')].filter((p) => !p.closest('.pn-ui')).map((p) => {
        const part = labelOf(p); p.dataset.note = part;   // frozen, so rewriting its heading can't rename the part
        return [part, [...p.querySelectorAll(SEL)].filter((e) => own(e, p)), p];
      });
      homes.push(['', document.body ? [...document.body.querySelectorAll(SEL)].filter((e) => own(e, null)) : [], null]);
      // a lead-in span is numbered apart (`lead 1`), so the blocks after it keep the numbers they had before 1.101.0; the other
      // blocks of words, each with its part's, count apart too (`b1`, 1.103.0), and every part's list goes in page order
      const loose = wordBlocks().filter((e) => e.textContent.trim());
      const order = (x, y) => (x[0] === y[0] ? 0 : x[0].compareDocumentPosition(y[0]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
      homes.forEach((h) => {
        let n = 0, w = 0;
        const more = loose.filter((e) => (e.closest('[data-note]') || null) === h[2]);
        h[1] = [...h[1].map((e) => [e, e.classList.contains(P + 'lead') ? `${h[0]} ¦ lead ${++w}` : `${h[0]} ¦ ${++n}`]), ...more.map((e, i) => [e, `${h[0]} ¦ b${i + 1}`])].sort(order);
      });
      const keys = new Map();
      homes.forEach(([home, list]) => {
        list.forEach(([e, label]) => {
          const known = indexed.get(e);
          const original = known?.text ?? textOf(e);
          if (stableKeys) {
            // A mockup can insert a paragraph above an edit. Keep the edit with its original words.
            const base = `${home} ¦ f${hash(e.tagName + ':' + original)}`;
            const n = (keys.get(base) || 0) + 1; keys.set(base, n);
            label = `${base}:${n}`;
          }
          e.dataset.pnEdit = label; editKeys.push({ label, el: e });
          if (known) { originals.set(label, original); originalHtml.set(label, known.html); return; }
          originals.set(label, original); originalHtml.set(label, e.innerHTML);
          indexed.set(e, { text: originals.get(label), html: originalHtml.get(label) });
          // an edit kept with an empty was: (made on a freshly opened round, before 1.90.0) takes the block's own words
          if (state.edits[label] != null && state.editWas[label] === '' && originals.get(label)) { state.editWas[label] = originals.get(label); mended = true; }
          if (state.edits[label] != null) showEdit(e, label);
          e.classList.add(P + 'edit'); e.classList.toggle(P + 'changed', state.edits[label] != null);
          e.addEventListener('input', () => {
            const label = e.dataset.pnEdit, t = textOf(e); editDirty = true; placeTag();
            if (t === originals.get(label) && !state.editSpan[label]) { delete state.edits[label]; delete state.editAt[label]; delete state.editWas[label]; }
            else { state.edits[label] = t; state.editAt[label] = Date.now(); state.editWas[label] = originals.get(label); }
            e.classList.toggle(P + 'changed', state.edits[label] != null);
            save(); if (onChange) onChange(label);
          });
        });
      });
      Object.keys(state.editSpan).forEach((h) => {
        if (state.edits[h] != null && (editEl(h) || keepMissing(h))) return;
        state.editSpan[h].forEach((l) => { delete state.edits[l]; delete state.editAt[l]; delete state.editWas[l]; const e = editEl(l); if (e) { showEdit(e, l); e.classList.remove(P + 'changed'); } });
        delete state.editSpan[h]; mended = true;
      });
      st.remove(); if (mended) save();
    }
    // one block open at a time, with the user's selection kept so typing replaces it. An open block is framed in blue with an
    // Editing tag on it (the user: "the blue highlight is not obvious it's in an editable state"); a marked-up one shows the user's words
    // alone while the user types. Enter, Esc or a click away closes it (Shift+Enter is a new line), takes typing away, and draws
    // the markup again
    let editOpen = null;
    function placeTag() {
      if (!editOpen) return tag.classList.remove('show');
      const r = editOpen.getBoundingClientRect(), h = tag.offsetHeight;
      // a tab on the frame's top right, where a line above is least likely to reach; under it when the top is off screen
      const below = r.top - 8 - h < 0;
      tag.style.left = Math.max(8, Math.min(innerWidth - tag.offsetWidth - 8, r.right + 8 - tag.offsetWidth)) + 'px';
      tag.style.top = (below ? r.bottom + 8 : r.top - 8 - h) + 'px';
      tag.classList.toggle('below', below); tag.classList.add('show');
    }
    addEventListener('scroll', () => placeTag(), true); addEventListener('resize', () => placeTag());
    // Chrome lays out a plaintext-only editable block pre-wrap, so the line breaks and indents in the page's source showed as
    // Edit opened it, and typing read them back: a paragraph written over several source lines jumped, its markup struck and
    // added words the user never touched, and its now: carried the source's breaks (1.90.0). Its white space is folded in place to
    // what the page draws, single spaces with none at a line's ends, and the selection kept on the same words. A block that
    // keeps its source's line breaks (white-space: pre-line, as a bio box's lines) keeps those as breaks and folds the rest,
    // so an indented line opens unmoved too (1.103.0)
    function fold(e, r) {
      const cs = getComputedStyle(e), wc = cs.whiteSpaceCollapse || ({ 'pre-line': 'preserve-breaks' }[cs.whiteSpace] || (/^(normal|nowrap)$/.test(cs.whiteSpace) ? 'collapse' : ''));
      if (wc !== 'collapse' && wc !== 'preserve-breaks') return;
      const keep = wc === 'preserve-breaks';
      const runs = []; let space = true, pend = null;   // pend: the last space kept, cut if a line ends after it
      const cut = () => { if (!pend) return; const { x, i } = pend; x.out = x.out.slice(0, i) + x.out.slice(i + 1); x.m = x.m.map((v) => (v > i ? v - 1 : v)); pend = null; };
      const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (n.nodeType === 1 && (n.closest('.pn-ui') || /^(SCRIPT|STYLE)$/.test(n.tagName)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
      for (let n; (n = tw.nextNode());) {
        if (n.nodeType === 1) { if (n.tagName === 'BR') { cut(); space = true; } continue; }
        const x = { n, out: '', m: [] }, d = n.data; runs.push(x);
        for (let i = 0; i < d.length; i++) {
          x.m.push(x.out.length);
          if (keep && d[i] === '\n') { cut(); x.out += '\n'; space = true; } else if (!/[ \t\n\r\f]/.test(d[i])) { x.out += d[i]; space = false; pend = null; } else if (!space) { pend = { x, i: x.out.length }; x.out += ' '; space = true; }
        }
        x.m.push(x.out.length);
      }
      cut();
      const at = (c, o) => { const x = runs.find((y) => y.n === c); return x ? [c, x.m[o]] : [c, o]; };
      const ends = r && [at(r.startContainer, r.startOffset), at(r.endContainer, r.endOffset)];
      runs.forEach(({ n, out }) => { if (n.data !== out) n.data = out; });
      if (ends) { r.setStart(...ends[0]); r.setEnd(...ends[1]); }
    }
    // a selection over several blocks of one part (1.92.0; the user: "if i started typing, presumably it would keep the first
    // element which i'd be typing in, and remove the others below it"): the first block opens with the selected end of its
    // words selected, and the blocks after it show as they will be once the user types, struck, the last keeping any words after
    // the user's selection. The user's first change makes it so (commitSpan); a first change that no longer runs to the first block's end
    // (a click put the caret elsewhere first) is an edit of that block alone, and closing with no change leaves them all
    let spanOpen = null;
    function openSpan(e, range, more) {
      const all = [e, ...more], n = all.length;
      const got = all.map((b, k) => {
        const l = b.dataset.pnEdit, end = k === n - 1;
        const off = () => (k === 0 ? offsetAt(b, range.startContainer, range.startOffset) : end ? offsetAt(b, range.endContainer, range.endOffset) : 0);
        if (state.edits[l] != null) { const x = off(), t = state.edits[l]; b.replaceChildren(); brLines(b, t); return { l, b, t, x: Math.min(x, t.length) }; }
        fold(b, range); originals.set(l, textOf(b)); const t = originals.get(l);
        return { l, b, t, x: Math.min(off(), t.length) };
      });
      const [h, ...rest] = got;
      spanOpen = { head: h.l, rest: rest.map((x, k) => ({ l: x.l, b: x.b, now: k === rest.length - 1 ? x.t.slice(x.x).replace(/^\s+/, '') : '' })) };
      spanOpen.rest.forEach((x) => showEdit(x.b, x.l, x.now));
      return [h.x, h.t.length];
    }
    function commitSpan(o) {
      const at = Date.now(), order = (l) => editKeys.findIndex((k) => k.label === l), members = new Set(o.rest.map((x) => x.l));
      // an edit across blocks already removed some of these, or more after them: they stay removed, in this one change
      [o.head, ...members].forEach((l) => { (state.editSpan[l] || []).forEach((m) => members.add(m)); if (l !== o.head) delete state.editSpan[l]; });
      o.rest.forEach((x) => { state.edits[x.l] = x.now; state.editAt[x.l] = at; state.editWas[x.l] = originals.get(x.l); x.b.classList.add(P + 'changed'); });
      state.editSpan[o.head] = [...members].sort((a, b) => order(a) - order(b));
      save();
    }
    const dropSpan = () => { const o = spanOpen; spanOpen = null; if (o) o.rest.forEach((x) => showEdit(x.b, x.l)); };
    document.addEventListener('beforeinput', (ev) => {
      if (ev.target === editOpen && boxH) {
        // the Edit menu's Undo and Redo take the layer's own steps too, so the blocks a span removed come back with the user's words
        if (/^history/.test(ev.inputType)) { ev.preventDefault(); boxStep(ev.inputType === 'historyUndo'); return; }
        const k = /^delete/.test(ev.inputType) ? 'd' : /^insert(Paragraph|LineBreak|FromPaste|FromDrop|Replacement)/.test(ev.inputType) ? 'p' : 'i', now = Date.now();
        if (k === 'p' || k !== boxH.kind || now - boxH.at > 1000 || spanOpen) boxH.undo.push(boxSnap());
        boxH.kind = k; boxH.at = now; boxH.redo = [];
      }
      if (!spanOpen || ev.target !== editOpen) return;
      const e = editOpen, s = getSelection(), r = s.rangeCount ? s.getRangeAt(0) : null;
      if (r && !r.collapsed && e.contains(r.endContainer) && offsetAt(e, r.endContainer, r.endOffset) >= offsetAt(e, e, e.childNodes.length)) { const o = spanOpen; spanOpen = null; commitSpan(o); } else dropSpan();
    }, true);
    function openEdit(e, range) {
      if (!e || readOnly()) return;
      // already open (a click opened it, then a double or triple click chose words in it): Edit keeps it open on those words,
      // where closing it first would draw its markup again and lose them
      if (e === editOpen && range && e.contains(range.startContainer) && e.contains(range.endContainer)) { e.focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(range); return; }
      closeEdit();
      const head = spanHead(e.dataset.pnEdit);
      if (head) { e = editEl(head); range = null; if (!e) return; }   // a block an edit removed reopens that edit, at its first block
      const label = e.dataset.pnEdit, inside = range && e.contains(range.startContainer) && e.contains(range.endContainer);
      // the blocks after this one that the selection takes words from (editRange cut it to the user's part)
      const more = range && !inside && e.contains(range.startContainer) ? editKeys.map((k) => k.el).filter((b) => b !== e && b.isConnected && editHome(b.dataset.pnEdit) === editHome(label)
        && e.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING && range.intersectsNode(b)) : [];
      let at = null;
      if (more.length) { const ed = state.edits[label] != null; at = openSpan(e, range, more); if (ed) editDirty = true; }
      else if (state.edits[label] != null) {
        if (inside) at = [offsetAt(e, range.startContainer, range.startOffset), offsetAt(e, range.endContainer, range.endOffset)];
        e.replaceChildren(); brLines(e, state.edits[label]); editDirty = true;
      } else { fold(e, inside ? range : null); originals.set(label, textOf(e)); }   // no edit yet: its words as drawn now are what the user changes from
      editOpen = e; e.setAttribute('contenteditable', 'plaintext-only'); e.focus(); placeTag();
      const s = getSelection(); s.removeAllRanges();
      const r = document.createRange();
      if (at && more.length && !editDirty) { r.setStart(range.startContainer, range.startOffset); r.setEnd(e, e.childNodes.length); s.addRange(r); }   // its own words, folded: the start as fold() moved it
      else if (at) { r.setStart(...pointAt(e, at[0])); r.setEnd(...pointAt(e, at[1])); s.addRange(r); } else if (inside) s.addRange(range);
      else { r.selectNodeContents(e); r.collapse(false); s.addRange(r); }
      boxH = { start: boxSnap(), undo: [], redo: [], at: 0, kind: '' };
    }
    function closeEdit() {
      const e = editOpen; if (!e) return; boxDone(); editOpen = null; placeTag(); dropSpan();
      e.removeAttribute('contenteditable'); if (document.activeElement === e) e.blur();
      if (editDirty) { editDirty = false; showEdit(e, e.dataset.pnEdit); if (onShown) onShown(); }
      onClose?.();
    }
    addEventListener('keydown', (ev) => {
      if (!editOpen || ev.isComposing || ev.keyCode === 229 || !(ev.key === 'Escape' || (ev.key === 'Enter' && !ev.shiftKey))) return;
      ev.preventDefault(); ev.stopPropagation(); closeEdit(); getSelection().removeAllRanges();
    }, true);
    document.addEventListener('focusout', (ev) => { if (editOpen && ev.target === editOpen) setTimeout(() => { if (editOpen && document.activeElement !== editOpen) closeEdit(); }, 0); });
    const edited = () => editEls().map((e) => e.dataset.pnEdit).filter((l) => l && state.edits[l] != null && !spanHead(l));
    function revertEdit(label, inner) {
      const was = !inner && (boxDone(), eSnap());
      const m = state.editSpan[label] || []; delete state.editSpan[label]; m.forEach((l) => revertEdit(l, true));
      delete state.edits[label]; delete state.editAt[label]; delete state.editWas[label]; save();
      if (spanOpen?.head === label) dropSpan();
      const e = editEl(label); if (e) { if (e === editOpen) { editOpen = null; editDirty = false; placeTag(); e.removeAttribute('contenteditable'); } showEdit(e, label); e.classList.remove(P + 'changed'); }
      if (was) step(label, was);
    }
    // ---------- undo and redo for edits (1.95.0; the user: "undo ctl+z seems to not work for edit, did we not have an undo
    // function for the whole skill? if we can do that, do it"). The browser's own undo couldn't do it: closing a block draws
    // its markup again, which loses the browser's history, and a span's first change also removed the blocks after it, which
    // the browser's undo of the user's typing never brought back. So the layer keeps its own steps, as copies of the four edit
    // records. In an open block ⌘Z (Ctrl+Z) takes back the user's typing a burst at a time (a pause of a second, a switch between
    // typing and deleting, a new line or a paste starts the next), down to the words it opened with, and ⇧⌘Z or Ctrl+Y puts
    // it back; past a span's first change it brings back the blocks it removed, struck again as they would go. Closed, each
    // block the user opened and changed is one step, as is the row's Undo, and ⌘Z takes back the last of them on the page, from
    // anywhere but a field of the user's own (the notes column's boxes keep the browser's undo). Kept for the visit, not stored ----------
    const eSnap = () => JSON.parse(JSON.stringify(Object.fromEntries(EDK.map((k) => [k, state[k] || {}]))));
    const edKey = (s) => JSON.stringify([Object.keys(s.edits).sort().map((k) => [k, s.edits[k]]), Object.keys(s.editSpan).sort().map((k) => [k, s.editSpan[k]])]);
    const hist = { undo: [], redo: [] };
    let boxH = null;   // the open block's steps
    function step(l, a) { const b = eSnap(); if (edKey(a) === edKey(b)) return; hist.undo.push({ l, a, b, at: Date.now() }); hist.redo = []; }
    function boxDone() { const b = boxH; boxH = null; if (b && editOpen) step(editOpen.dataset.pnEdit, b.start.ed); }
    // the edit records as a step had them, every block whose edit differs drawn again (the open one keeps the user's words)
    function putEd(s, skip, persist = true) {
      const ls = new Set([...Object.keys(state.edits), ...Object.keys(s.edits)]);
      EDK.forEach((k) => { if (!state[k]) state[k] = {}; Object.keys(state[k]).forEach((x) => delete state[k][x]); Object.assign(state[k], JSON.parse(JSON.stringify(s[k]))); });
      ls.forEach((l) => { const e = editEl(l); if (!e || l === skip) return; showEdit(e, l); e.classList.toggle(P + 'changed', state.edits[l] != null); });
      if (persist) save();
    }
    function boxSnap() {
      const e = editOpen, g = getSelection(), r = g.rangeCount ? g.getRangeAt(0) : null;
      const at = r && e.contains(r.startContainer) && e.contains(r.endContainer) ? [offsetAt(e, r.startContainer, r.startOffset), offsetAt(e, r.endContainer, r.endOffset)] : null;
      return { ed: eSnap(), html: e.innerHTML, at, span: spanOpen };
    }
    function boxStep(back) {
      const from = back ? boxH.undo : boxH.redo, to = back ? boxH.redo : boxH.undo; if (!from.length) return;
      to.push(boxSnap()); const s = from.pop(), e = editOpen, l = e.dataset.pnEdit; boxH.kind = '';
      if (spanOpen && spanOpen !== s.span) dropSpan();
      putEd(s.ed, l); spanOpen = s.span || null;
      if (spanOpen) spanOpen.rest.forEach((x) => showEdit(x.b, x.l, x.now));
      e.innerHTML = s.html; editDirty = true; e.classList.toggle(P + 'changed', state.edits[l] != null);
      if (s.at) { const r = document.createRange(), g = getSelection(); r.setStart(...pointAt(e, s.at[0])); r.setEnd(...pointAt(e, s.at[1])); g.removeAllRanges(); g.addRange(r); }
      placeTag(); if (onEdChange) onEdChange(l);
    }
    // closed: the last step taken back (back) or put back; false when there's none, so the key does what it would have
    function editHist(back) {
      if (editOpen || readOnly()) return false;
      const from = back ? hist.undo : hist.redo, to = back ? hist.redo : hist.undo, x = from.pop(); if (!x) return false;
      to.push(x); putEd(back ? x.a : x.b); if (onShown) onShown(); if (onEdChange) onEdChange(x.l); return true;
    }
    addEventListener('keydown', (ev) => {
      const k = undoKey(ev); if (!k || !editOpen || !boxH || document.activeElement !== editOpen) return;
      ev.preventDefault(); ev.stopPropagation(); boxStep(k === 'undo');
    }, true);


    // Edit is there for any selection Comment takes, over as many blocks of one part as it runs through (1.92.0; the user: "i
    // should be able to highlight the same stuff that comment can"; it opened one line or paragraph at a time before). The
    // range is cut to the blocks it takes words from: a triple-click ends at the very start of the next block, and a reach
    // into blank space or a picture takes in no block. A selection running out of the part the user started it in (the anchor,
    // so a drag upwards keeps the lower part) is cut at that part's edge, as Comment files it under one part; one started
    // outside every part (the title, the lede, the as-of line) keeps to those blocks, and copies as [Page]
    const editRange = () => {
      const s = getSelection(); if (!s.rangeCount || s.isCollapsed) return null;
      const r = s.getRangeAt(0);
      const part = (e) => { const c = r.cloneRange(); if (!e.contains(r.startContainer)) c.setStart(e, 0); if (!e.contains(r.endContainer)) c.setEnd(e, e.childNodes.length); return c; };
      const hit = editEls().filter((e) => r.intersectsNode(e) && part(e).toString().trim()).sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      if (!hit.length) return null;
      const a = editBlockAt(s.anchorNode), home = editHome((hit.includes(a) ? a : hit[0]).dataset.pnEdit);
      const i = hit.findIndex((e) => editHome(e.dataset.pnEdit) === home); let j = i;
      while (j + 1 < hit.length && editHome(hit[j + 1].dataset.pnEdit) === home) j++;
      const c = r.cloneRange(), f = hit[i], l = hit[j];
      if (!f.contains(r.startContainer)) c.setStart(f, 0);
      if (!l.contains(r.endContainer)) c.setEnd(l, l.childNodes.length);
      return c;
    };
    return { initEdits, edited, editEl, editParts, needsIndex: () => editKeys.some(({ el }) => !el.isConnected), revertEdit, openEdit, closeEdit, editBlockAt, editRange, spanHead, editHist,
      editIsOpen: () => !!editOpen, editFresh: () => !!editOpen && !editDirty, editStepAt: () => hist.undo[hist.undo.length - 1]?.at || 0,
      originals, snapshot: eSnap, step, putEd };
  }

  // ---------- blocks: the page marks commentable parts with data-note="Label" ----------
  // a part's label is what the user sees: data-note="Label" if given, else the part's own first heading, else its first words
  function labelOf(b) {
    if (b.dataset.note) return b.dataset.note;
    const h = b.querySelector('h1,h2,h3,h4,h5,h6') || b;
    const w = document.createTreeWalker(h, NodeFilter.SHOW_TEXT); const parts = [];
    // joined as written: a highlight splits a heading's text into pieces, and a space between them would change the label
    for (let n; (n = w.nextNode());) if (!n.parentElement.closest('.pn-ui')) parts.push(n.nodeValue);
    const t = parts.join('').replace(/\s+/g, ' ').trim();
    return t.length > 60 ? t.slice(0, 57) + '…' : t;
  }
  const blocks = () => [...document.querySelectorAll('[data-note]')].map((b) => ({ el: b, label: labelOf(b) }));
  function blockEl(label) { return [...document.querySelectorAll('[data-note]')].find((b) => labelOf(b) === label) || null; }   // stops at the first: no label for every part. A declaration: the carried threads use it at load
  // a part in a closed tab or other hidden panel has no place on the page: its threads wait, and the outline skips it when marking
  const away = (b) => !!b && !b.getClientRects().length && getComputedStyle(b).display !== 'contents';
  // going to a part in a closed tab opens the tab first, and any tab around that: the panel's own role="tab", found by
  // aria-controls or aria-labelledby. The click reaches the page's own tab script, or the layer's (tabs, at the end)
  const tabOf = (panel, doc = panel.ownerDocument) => (panel.id && doc.querySelector(`[role="tab"][aria-controls="${CSS.escape(panel.id)}"]`)) || doc.getElementById(panel.getAttribute('aria-labelledby') || '');
  function showPart(b) {
    if (!b || !away(b)) return;
    const panels = []; for (let p = b.closest('[role="tabpanel"]'); p; p = p.parentElement?.closest('[role="tabpanel"]')) panels.unshift(p);
    const closed = panels.filter(away);
    closed.forEach((p) => tabOf(p)?.click());
    return closed[0];
  }
  const blockLabel = (b) => (b ? labelOf(b) : '');
  const blockOf = (node) => (node && (node.nodeType === 1 ? node : node.parentElement))?.closest('[data-note]') || null;

  // ---------- text map: whitespace-collapsed page text, mapped back to text nodes ----------
  // (a declaration, as are posAt, keepRun and unwrap: a framed page's layer uses them, and returns before any const here exists)
  function textMap(scope, skip = '.pn-ui,script,style') {
    const w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest(skip) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let norm = ''; const map = []; let space = true;
    for (let n; (n = w.nextNode());) {
      const t = n.nodeValue;
      for (let i = 0; i < t.length; i++) {
        if (/\s/.test(t[i])) { if (space) continue; norm += ' '; space = true; } else { norm += t[i]; space = false; }
        map.push([n, i]);
      }
    }
    return { norm, map };
  }
  // where a selection starts in textMap(scope).map, as its findIndex(([n, i]) => n === node && i >= off) finds it, worked
  // out without building the map: the same walk, counting
  function posAt(scope, node, off, skip = '.pn-ui,script,style') {
    const w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest(skip) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let k = 0, space = true;
    for (let n; (n = w.nextNode());) {
      const t = n.nodeValue;
      for (let i = 0; i < t.length; i++) {
        if (/\s/.test(t[i])) { if (space) continue; space = true; } else space = false;
        if (n === node && i >= off) return k;
        k++;
      }
      if (n === node) return -1;   // past the node, nothing else can match
    }
    return -1;
  }

  function anchorFromSelection() {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    const host = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
    if (host.closest('.pn-ui, textarea, input') || inLayer(host) || r.intersectsNode(HOST)) return null;
    const quote = sel.toString().replace(/\s+/g, ' ').trim();
    const b = blockOf(r.startContainer), t = trimmed(r);
    const all = mediaIn(b || document.body), imgs = all.filter((m) => takes(t, m)).map((m) => picOf(m, all.indexOf(m)));
    if (!quote && !imgs.length) return null;
    let pos = posAt(b || document.body, r.startContainer, r.startOffset);
    if (pos < 0) pos = 0;
    return { block: blockLabel(b), quote, pos, rect: t.getBoundingClientRect(), ...(imgs.length ? { imgs } : {}) };
  }
  // a triple-click selects a block of text and ends at the start of whatever comes next, which may be past a picture
  // beside it (a canvas, a drawing) or in the next part: a reach past the block that takes in no words is cut back to the
  // block, and a start the same way, so only what the user selected counts (as Edit's trim, 1.60.0)
  const TEXT_BLOCK = 'p,li,h1,h2,h3,h4,h5,h6,dt,dd,td,th,caption,figcaption,blockquote,pre';
  // words a selection can actually take in: a Range's toString counts a chart's unselectable labels, and Selection's doesn't,
  // so a triple-click that ran past such a chart looked as if it had reached more words (the user: "why does it say backlog work twice?")
  const noSelect = (e) => { for (; e; e = e.parentElement) if (getComputedStyle(e).userSelect === 'none') return true; return false; };
  const hasWords = (r) => {
    const root = r.commonAncestorContainer, walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = root.nodeType === 3 ? root : walk.nextNode(); n; n = walk.nextNode()) {
      if (!r.intersectsNode(n)) continue;
      const words = n.nodeValue.slice(n === r.startContainer ? r.startOffset : 0, n === r.endContainer ? r.endOffset : undefined);
      if (words.trim() && !noSelect(n.parentElement)) return true;
    }
    return false;
  };
  function trimmed(r) {
    const c = r.cloneRange(), at = (n) => (n.nodeType === 1 ? n : n.parentElement)?.closest(TEXT_BLOCK + ',.' + P + 'edit');   // any block of words (1.103.0)
    const s = at(r.startContainer), e = at(r.endContainer), z = () => document.createRange();
    if (s && !s.contains(r.endContainer)) { const t = z(); t.setStart(s, s.childNodes.length); t.setEnd(r.endContainer, r.endOffset); if (!hasWords(t)) c.setEnd(s, s.childNodes.length); }
    if (e && !e.contains(r.startContainer)) { const h = z(); h.setStart(r.startContainer, r.startOffset); h.setEnd(e, 0); if (!hasWords(h)) c.setStart(e, 0); }
    return c;
  }
  // ---------- pictures: an image, drawing or video taken in by a selection is part of what the note is about (the user,
  // 2026-10-20: "comment or sticker images or image/text combos"). Each is kept by its place among its part's pictures and
  // its name (file, else alt text, else "image N"), so it's found again on reload; the copy names it ----------
  const MEDIA = 'img,svg,canvas,video';
  const mediaIn = (scope) => [...scope.querySelectorAll(MEDIA)].filter((m) => !m.closest('.pn-ui') && !m.parentElement?.closest('svg'));
  // a picture counts only when the selection takes in some of it. A triple-click selects a block and ends at the very start
  // of the next one, which can be inside a drawing with words of its own (an SVG's first <text>), so a sticker on that
  // paragraph ringed the drawing below it too (the user: "i triple clicked on this paragraph and when i gave it an emoji, the
  // picture highlighted too"). The same goes for a selection that starts at a drawing's very end
  const takes = (r, m) => {
    if (!r.intersectsNode(m)) return false;
    const z = document.createRange();
    if (m.contains(r.endContainer)) { z.setStartBefore(m); z.setEnd(r.endContainer, r.endOffset); if (!hasWords(z)) return false; }
    if (m.contains(r.startContainer)) { z.setStart(r.startContainer, r.startOffset); z.setEndAfter(m); if (!hasWords(z)) return false; }
    return true;
  };
  const picName = (m, i) => {
    const src = m.currentSrc || m.getAttribute('src') || '', file = src.startsWith('data:') ? '' : src.split(/[?#]/)[0].split('/').pop();
    let name = ''; try { name = decodeURIComponent(file); } catch (e) { name = file; }
    return (name || m.getAttribute('alt') || m.getAttribute('aria-label') || m.querySelector?.(':scope > title')?.textContent || '').trim() || `image ${i + 1}`;
  };
  const picOf = (m, i) => {   // a thumbnail for the row, unless the picture is a big inline data URL
    const src = m.tagName === 'IMG' ? m.currentSrc || m.src : m.tagName === 'VIDEO' ? m.poster : '';
    return { i, name: picName(m, i), ...(src && src.length < 4000 ? { src } : {}) };
  };
  function markPics(n) {   // a note's pictures get a ring, as its words get a highlight; false when one can't be found
    if (!n.imgs?.length || n.frame) return true;
    const all = mediaIn(blockEl(n.block) || document.body); let found = true;
    n.imgs.forEach((p) => {
      const m = all[p.i] && picName(all[p.i], p.i) === p.name ? all[p.i] : all.find((x, j) => picName(x, j) === p.name);
      if (!m) { found = false; return; }
      m.classList.add(P + 'img'); m.dataset.pn = ((m.dataset.pn || '') + ' ' + n.id).trim();
    });
    return found;
  }

  // ---------- highlights ----------
  function wrapRange(range, id, cls = P + 'mark') {   // returns the marks it made; cls: a comment's mark, or a highlight's (data-hl)
    const root = range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer;
    const nodes = []; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) if (range.intersectsNode(n)) nodes.push(n);
    const sC = range.startContainer, sO = range.startOffset, eC = range.endContainer, eO = range.endOffset, out = [];
    nodes.forEach((n) => {
      const s = n === sC ? sO : 0; const e = n === eC ? eO : n.length;
      if (s >= e || !n.nodeValue.slice(s, e).trim()) return;
      keepRun(n);
      let t = n; if (s > 0) t = t.splitText(s); if (e - s < t.length) t.splitText(e - s);
      const m = document.createElement('mark'); m.className = cls; m.dataset[cls === P + 'hl' ? 'hl' : 'id'] = id;
      t.parentNode.insertBefore(m, t); m.appendChild(t);
      if (cls === P + 'mark' && light(getComputedStyle(m).color)) m.classList.add(P + 'lt');   // white text in a dark badge would vanish on the yellow
      out.push(m);
    });
    return out;
  }
  // in a flex or grid parent (a heading laid out with a gap), a mark would split the text into separate items with the
  // gap between them, so the text is first held together in one plain span, taken out again with the marks
  function keepRun(n) {
    const p = n.parentNode; if (!p || p.nodeType !== 1 || p.classList.contains(P + 'run') || !/flex|grid/.test(getComputedStyle(p).display)) return;
    const s = document.createElement('span'); s.className = P + 'run'; p.insertBefore(s, n); s.appendChild(n);
  }
  function unwrap(x) { const p = x.parentNode; while (x.firstChild) p.insertBefore(x.firstChild, x); x.remove(); p.normalize(); }   // a mark or run out, its text back in place
  const unRun = () => document.querySelectorAll(`span.${P}run`).forEach(unwrap);
  function light(c) { const [r, g, b] = (c.match(/[\d.]+/g) || []).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b > 160; };
  function clearMarks() {
    ROOT.querySelectorAll('.pn-stk.pg').forEach((c) => c.remove());
    document.querySelectorAll(`mark.${P}hl`).forEach(unwrap);
    document.querySelectorAll(`mark.${P}mark`).forEach(unwrap);
    unRun();
    document.querySelectorAll('.' + P + 'img').forEach((m) => { m.classList.remove(P + 'img', P + 'on', P + 'cue'); delete m.dataset.pn; });
  }
  // a note on words inside a framed page (n.frame) is highlighted by the frame's own layer, so it's sent there
  const framesIn = (n) => [...(blockEl(n.block) || document).querySelectorAll('iframe')];
  // which of its part's frames a selection came from, kept with the note (fi, its place among them; fsrc, the page it showed).
  // A part can frame one page twice, a desktop and a phone copy, and a quote found in both tied the note to the wrong one
  // (2026-11-02: connect col2 and col3 "without edge cases")
  const frameRef = (f, block) => { const i = framesIn({ block }).indexOf(f); return i < 0 ? {} : { fi: i, fsrc: f.getAttribute('src') || '' }; };
  // the frames that look for a note's words: the one it was made in, while that frame still shows the same page (or, moved,
  // the only frame in the part that does); else, for a note that names no frame (older notes, replies and questions) or
  // names one that's gone, every frame in its part, so a note is never dropped
  const framesOf = (n) => {
    const all = framesIn(n); if (n.fi == null) return all;
    const f = all[n.fi]; if (f && (n.fsrc == null || f.getAttribute('src') === n.fsrc)) return [f];
    const same = all.filter((x) => x.getAttribute('src') === n.fsrc);
    return same.length === 1 ? same : all;
  };
  const localFrame = (f) => {
    if (!f.getAttribute('src') || f.hasAttribute('srcdoc')) return false;
    try {
      const url = new URL(f.src, location.href);
      return location.protocol === 'file:' ? url.protocol === 'file:' : url.origin === location.origin;
    } catch (e) { return false; }
  };
  const frameSender = (e) => [...document.querySelectorAll('iframe')].find((f) => f.contentWindow === e.source && localFrame(f)
    && (e.origin === location.origin || e.origin === 'null' && (location.protocol === 'file:' || f.hasAttribute('sandbox'))));
  const frameFor = (n) => {
    const f = framesIn(n)[n.fi];
    return f && f.getAttribute('src') === n.fsrc && localFrame(f) ? f : null;
  };
  const frameEditLabel = (block, ref, key) => 'frame:' + JSON.stringify([block, ref.fi, ref.fsrc, key]);
  function frameEditRef(label) {
    if (!label.startsWith('frame:')) return null;
    try {
      const [block, fi, fsrc, key] = JSON.parse(label.slice(6));
      return Number.isInteger(fi) && [block, fsrc, key].every((v) => typeof v === 'string') ? { block, fi, fsrc, key } : null;
    } catch (e) { return null; }
  }
  const frameEditNode = (label) => { const ref = frameEditRef(label); return ref && frameFor(ref); };
  const edited = () => [...editor.edited(), ...Object.keys(state.edits).filter((l) => frameEditRef(l) && !spanHead(l))];
  const framePath = (src) => src.trim().replace(/[\t\r\n]/g, '');
  let frameSession = null, editToken = 0;
  function frameEditRecords(frame) {
    const result = Object.fromEntries(EDK.map((k) => [k, Object.create(null)]));
    Object.keys(state.edits).forEach((label) => {
      const ref = frameEditRef(label); if (!ref || frameFor(ref) !== frame) return;
      EDK.forEach((k) => {
        if (!Object.hasOwn(state[k], label)) return;
        result[k][ref.key] = k === 'editSpan' ? state[k][label].map((member) => frameEditRef(member)?.key).filter(Boolean) : state[k][label];
      });
    });
    return result;
  }
  function finishFrameEdit(only) {
    if (!frameSession || only && frameSession.frame !== only) return;
    const { frame, token, before, label, copied } = frameSession;
    frameSession = null;
    editor.step(label, before);
    toFrame(frame, { kind: 'edit-finish', token });
    copied?.();
  }
  function settleFrameEdit() {
    const session = frameSession; if (!session) return;
    return session.settled ||= new Promise((resolve) => {
      const timer = setTimeout(() => { if (frameSession === session) finishFrameEdit(); }, 200);
      session.copied = () => { clearTimeout(timer); resolve(); };
      toFrame(session.frame, { kind: 'edit-finish', token: session.token });
    });
  }
  function openFrameEdit(frame, selection, label) {
    if (PAST || sentOn()) return;
    closeEdit(); finishFrameEdit();
    const block = blockLabel(blockOf(frame)), ref = frameRef(frame, block);
    if (ref.fi == null || !localFrame(frame)) return;
    frameSession = { frame, block, ref, token: ++editToken, before: editor.snapshot(), label: label || null };
    toFrame(frame, { kind: 'edit-open', token: editToken, selection, label: label && frameEditRef(label).key });
  }
  function keepFrameEdit(frame, data) {
    const o = frameSession;
    if (!o || o.frame !== frame || data.token !== o.token) return;
    if (data.kind === 'edit-close') { finishFrameEdit(); return; }
    if (PAST || sentOn() || frameFor({ block: o.block, ...o.ref }) !== frame) return;
    const incoming = data.records, edits = incoming?.edits;
    if (!edits || typeof edits !== 'object') return;
    const labelOfKey = (key) => frameEditLabel(o.block, o.ref, key);
    const old = frameEditRecords(frame);
    const changed = new Set([...Object.keys(old.edits), ...Object.keys(edits)].filter((key) => old.edits[key] !== edits[key]
      || JSON.stringify(old.editSpan[key]) !== JSON.stringify(incoming.editSpan?.[key])));
    if (!changed.size) return;
    changed.forEach((key) => {
      const label = labelOfKey(key);
      if (typeof edits[key] !== 'string' || typeof incoming.editWas?.[key] !== 'string') { EDK.forEach((k) => { delete state[k][label]; }); return; }
      state.edits[label] = edits[key]; state.editWas[label] = incoming.editWas[key]; state.editAt[label] = Date.now();
      const members = incoming.editSpan?.[key];
      if (Array.isArray(members)) state.editSpan[label] = members.filter((x) => typeof x === 'string' && Object.hasOwn(edits, x)).map(labelOfKey);
      else delete state.editSpan[label];
    });
    const labels = [...changed].map(labelOfKey);
    const label = labels.find((l) => state.edits[l] != null && !spanHead(l)) || spanHead(labels[0]) || labels[0];
    if (!o.label) o.label = label;
    save(); window.PN?.frameEdited?.(label);
  }
  let toFrames = new Map();
  // the quote's first and last places in the page text, the match nearest where it was taken. A selection across pills
  // or other inline boxes written with no space between them copies with spaces the page text lacks ("research 0
  // firecrawl" against "research 0firecrawl"), so when the exact words aren't found they're matched again with every
  // space ignored, and mapped back
  function findQuote(norm, quote, pos) {
    const near = (find, place = (i) => i) => { let best = -1; for (let i = find(0); i >= 0; i = find(i + 1)) if (best < 0 || Math.abs(place(i) - pos) < Math.abs(place(best) - pos)) best = i; return best; };
    const i = near((from) => norm.indexOf(quote, from));
    if (i >= 0) return [i, i + quote.length - 1];
    const q = quote.replace(/\s+/g, ''); if (!q) return null;
    const at = []; let dense = '';
    for (let k = 0; k < norm.length; k++) if (norm[k] !== ' ') { dense += norm[k]; at.push(k); }
    const j = near((from) => dense.indexOf(q, from), (d) => at[d]);
    return j < 0 ? null : [at[j], at[j + q.length - 1]];
  }
  // a thread carried from an earlier round whose words were reworded since (1.137.0; the user, on a reply quoting "Option B:
  // Move them to a sister folder" after the next round renamed that heading: "it's still a comment on
  // this thing, even though it's been changed since the last round ... continue highlighting if we're really just like
  // modifying something"). Its part is searched for the run of words closest to the quote: the quote's words that carry
  // meaning (not "the", "to", "and"), a plural matched to its singular, scored as twice the words shared over the words in
  // both. It counts only at 0.5 or more and with two words shared. Failing that, a quote that opens on a label ("Option B: …",
  // "T5: …": two to four words, or one with a digit, before a colon) marks that label where the part still has it, since
  // the thread still speaks to it. Otherwise a part that now says something else marks nothing
  const NEAR_SKIP = new Set(('a about an and are as at be been but by can could did do does for from had has have he her his i if in into is it its '
    + 'just like may me might my no not of on or our out over she so than that the their them then there these they this those to up us was '
    + 'we were what when where which who why will with would you your').split(' '));
  const nearWords = (s) => [...String(s).matchAll(/[\p{L}\p{N}]+/gu)]
    .map((m) => { let w = m[0].toLowerCase(); if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1); return { w, s: m.index, e: m.index + m[0].length - 1 }; })
    .filter((x) => !NEAR_SKIP.has(x.w));
  function nearQuote(norm, quote) {
    const q = nearWords(quote), want = new Map(); q.forEach(({ w }) => want.set(w, (want.get(w) || 0) + 1));
    const ws = q.length < 3 ? [] : nearWords(norm); let best = null;
    for (let i = 0; i < ws.length; i++) {
      if (!want.has(ws[i].w)) continue;   // a run starts and ends on one of the quote's words
      const got = new Map(); let shared = 0;
      for (let j = i; j < ws.length && j - i < 2 * q.length; j++) {
        const w = ws[j].w, k = got.get(w) || 0; if (k < (want.get(w) || 0)) shared++; got.set(w, k + 1);
        if (!want.has(w)) continue;
        const score = (2 * shared) / (q.length + j - i + 1);
        if (!best || score > best.score) best = { score, shared, s: ws[i].s, e: ws[j].e };
      }
    }
    if (best && best.score >= 0.5 && best.shared >= 2) return [best.s, best.e];
    const label = /^([^:]{1,30}):\s*\S/.exec(quote.trim())?.[1].trim(), n = label ? label.split(/\s+/).length : 0;
    return label && ((n >= 2 && n <= 4) || /\d/.test(label)) ? findQuote(norm, label, 0) : null;
  }
  function markNote(n) {
    const pics = markPics(n);
    if (!n.quote) { if (n.imgs?.length) n.lost = !pics; return; }
    const scope = blockEl(n.block) || document.body;
    const { norm, map } = textMap(scope);
    const exact = !n.frame && findQuote(norm, n.quote, n.pos);
    const hit = exact || (!n.frame && n.near && blockEl(n.block) && nearQuote(norm, n.quote));
    if (!hit) {
      // Replies and questions keep the quote, but not the selection's frame flag: look for their words there too.
      // The bridge searches inside each frame: a local file's document need not be readable from this page.
      n.lost = true;
      framesOf(n).forEach((f) => toFrames.set(f, [...(toFrames.get(f) || []), { id: n.id, quote: n.quote, pos: n.pos || 0 }]));
      return;
    }
    n.lost = !pics;
    const a = map[hit[0]], z = map[hit[1]];
    const r = document.createRange(); r.setStart(a[0], a[1]); r.setEnd(z[0], z[1] + 1);
    const ms = wrapRange(r, n.id);
    if (locked(n)) ms.forEach((m) => m.classList.add(P + 'old'));
    if (!exact) ms.forEach((m) => m.classList.add(P + 'near'));
    return ms;
  }
  // ---------- text highlights (1.100.0; the user: "add an ability to highlight text, similar to commenting but it doesn't add
  // anything to col3"). A highlight marks words and nothing else: no note, no row, no thread. It's kept in state.hl as
  // { id, block, quote, pos, created } and found again on reload by its words, as a note's are. It's drawn after the
  // notes' marks so it sits innermost, over a comment's own yellow, and its multiply blend mixes the two ----------
  function hash(str) { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };   // FNV-1a
  // one marker stroke, drawn by a right hand: classic highlighter yellow with lengthwise streaks, ends slanting about 15°
  // (each top corner left of its bottom one, each a little different), a very slight climb to the right, a start just
  // before the words and a slight thinning at the end (rounds 1 to 4: "this one but the
  // edges are tilted the wrong way, and can we do more streaking?", then Agreed on C1 · More streaks). Drawn in the mark's own
  // pixels (W × H) so the slant keeps its angle on short and long words; a background behind the words, so no text moves
  function hlArt(seed, rgba, W = 100, H = 20) {
    let h = seed >>> 0; const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; h ^= h >>> 16; return (h >>> 0) / 4294967296; };
    const tan = Math.tan(15 * Math.PI / 180), k = tan * H * (0.8 + rnd() * 0.4), kb = k * (0.8 + rnd() * 0.4), rise = W * 0.012 * (0.7 + rnd() * 0.6);
    const t0 = H * 0.03, b0 = H * 0.97, taper = H * 0.07, n = Math.max(4, Math.round(W / 45)), j = H * 0.035;
    const l = rnd() * 3, r = W - rnd() * 6, top = [], bot = [];
    for (let i = 0; i <= n; i++) { const f = i / n, y = rise * (0.5 - f), th = taper * f;
      top.push([l + (r - kb - l) * f, t0 + y + th + rnd() * j]); bot.push([l + k + (r - l - k) * f, b0 + y - th * 0.5 - rnd() * j]); }
    const d = 'M' + [...top, ...bot.reverse()].map(([x, y]) => x.toFixed(1) + ' ' + y.toFixed(1)).join('L') + 'Z';
    const streaks = `<filter id="f" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="${(12 / W).toFixed(4)} ${(16.25 / H).toFixed(3)}" numOctaves="2" seed="${Math.floor(rnd() * 999)}"/>`
      + `<feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 2.1"/><feComposite in="SourceGraphic" operator="in"/></filter>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs>${streaks}</defs>`
      + `<path d="${d}" fill="${rgba(0.95)}" filter="url(#f)"/><path d="${d}" fill="none" stroke="${rgba(0.5)}" stroke-width="1" stroke-linejoin="round"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  function markHl(hl, scope, skip) {
    if (!hl.quote) return;
    const { norm, map } = textMap(scope, skip);
    const hit = findQuote(norm, hl.quote, hl.pos);
    if (!hit) return;
    const a = map[hit[0]], z = map[hit[1]], r = document.createRange();
    r.setStart(a[0], a[1]); r.setEnd(z[0], z[1] + 1);
    wrapRange(r, hl.id, P + 'hl').forEach((m, i) => {
      // sized to its first line's box; a hidden mark (no box yet) gets the plain 100 × 20 strip
      const seed = hash(hl.id) + i * 7919, box = m.getClientRects()[0], W = Math.round(box?.width || 0) || 100, H = Math.round(box?.height || 0) || 20;
      m.style.setProperty('--' + P + 'hl-l', hlArt(seed, (a) => `rgba(255,238,0,${a})`, W, H));
      m.style.setProperty('--' + P + 'hl-d', hlArt(seed, (a) => `rgba(255,236,60,${(a * 0.55).toFixed(2)})`, W, H));
    });
  }
  // add the highlight an anchor describes (the pill's), or take off the ones named; removeHl returns what restoreHl needs
  function addHl(a) {
    if (!a?.quote) return null;
    const ref = a.frame ? frameRef(a.frame, a.block) : null;
    if (a.frame && (ref.fi == null || !ref.fsrc)) return null;
    const h = { id: newId(), block: a.block, quote: a.quote, pos: a.pos || 0, created: Date.now(), ...ref };
    state.hl.push(h); save(); applyMarks(); return h;
  }
  function removeHl(ids) {
    const gone = state.hl.map((h, i) => [h, i]).filter(([h]) => ids.includes(h.id));
    if (!gone.length) return [];
    state.hl = state.hl.filter((h) => !ids.includes(h.id)); save(); applyMarks(); return gone;
  }
  function restoreHl(gone) { [...gone].sort((x, y) => x[1] - y[1]).forEach(([h, i]) => state.hl.splice(Math.min(i, state.hl.length), 0, h)); save(); applyMarks(); }
  // which highlights a range touches, and whether they cover all of its words (then Highlight turns to taking them off)
  function hlIn(range) {
    const marks = [...document.querySelectorAll(`mark.${P}hl`)].filter((m) => range.intersectsNode(m));
    const root = range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer;
    let words = 0, covered = 0;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      if (!range.intersectsNode(n) || n.parentElement.closest('.pn-ui,script,style')) continue;
      const s = n === range.startContainer ? range.startOffset : 0, e = n === range.endContainer ? range.endOffset : n.length;
      if (s >= e || !n.nodeValue.slice(s, e).trim()) continue;
      words++; if (n.parentElement.closest(`mark.${P}hl`)) covered++;
    }
    return { ids: [...new Set(marks.map((m) => m.dataset.hl))], all: words > 0 && covered === words };
  }
  function relabel() {   // a note filed under a label from before 1.8.2, with stray spaces ("Option A · Bo ld"), goes back to its part
    const ls = blocks().map((b) => b.label), bare = (l) => l.replace(/\s+/g, ''); let moved = false;
    state.notes.forEach((n) => { if (n.block && !ls.includes(n.block)) { const hit = ls.find((l) => bare(l) === bare(n.block)); if (hit) { n.block = hit; moved = true; } } });
    if (moved) save();
  }
  function applyMarks(extra) {
    const readOnly = PAST || sentOn(); if (readOnly) finishFrameEdit();
    toFrames = new Map(); clearMarks(); relabel(); state.notes.forEach(markNote); ASKS.forEach(markAsk); if (extra) markNote(extra);
    const highlights = new Map();
    state.hl.forEach((h) => {
      if (h.fi == null) { markHl(h, blockEl(h.block) || document.body); return; }
      const f = frameFor(h); if (!f) return;
      if (!highlights.has(f)) highlights.set(f, []);
      highlights.get(f).push(h);
    });
    placeReactions();
    document.querySelectorAll('iframe').forEach((f) => {
      const feedback = localFrame(f) ? { highlights: highlights.get(f) || [], edits: frameSession?.frame === f ? null : frameEditRecords(f) } : {};
      toFrame(f, { kind: 'marks', list: toFrames.get(f) || [], readOnly, ...feedback });
    });
  }
  // A frame can navigate while its element still names the original src. Send saved text only over the
  // port that the local document opened, so a new document in that element never receives its edits.
  const framePorts = new WeakMap();
  const connectFrame = (f, port) => {
    framePorts.get(f)?.close();
    if (port) framePorts.set(f, port); else framePorts.delete(f);
  };
  const toFrame = (f, m) => {
    try {
      const port = framePorts.get(f);
      if (port) { port.postMessage({ hf: 1, ...m }); return; }
      if (m.kind === 'edit-open' || m.kind === 'edit-finish') return;
      const origin = localFrame(f) && location.protocol !== 'file:' && !f.hasAttribute('sandbox') ? location.origin : '*';
      const data = m.kind === 'marks' ? { kind: 'marks', list: m.list, readOnly: m.readOnly } : m;
      f.contentWindow?.postMessage({ hf: 1, ...data }, origin);
    } catch (e) { /* frame gone */ }
  };
  // a question about exact words underlines them, dotted, so they read as asked about rather than commented on
  function markAsk(a) {
    if (!a.quote) return;
    markNote({ id: 'q:' + a.id, block: a.block, quote: unclip(a.quote, blockEl(a.block) || document.body), pos: 0, created: Infinity, near: !!a.carried })?.forEach((m) => m.classList.add(P + 'ask'));
  }
  // a long quote the copy clipped ("start … end"), passed back by the agent, is found again by its two ends
  function unclip(q, scope) {
    const ends = q.split(' … '); if (ends.length !== 2) return q;
    const { norm } = textMap(scope), i = norm.indexOf(ends[0]), j = i < 0 ? -1 : norm.indexOf(ends[1], i + ends[0].length);
    return j < 0 ? q : norm.slice(i, j + ends[1].length);
  }
  // a reaction shows in the page as well, as a sticker laid over it: it takes no space, so no text moves
  function placeReactions() {
    // an answer's sticker stays on the agent's message: it answers that, not the page
    reactables().filter((n) => REACT[n.react] && !String(n.id).startsWith('q:')).forEach((n) => WRAP.appendChild(sticker(n, ' pg')));
    stick();
  }
  // each note's sticker keeps one slight tilt, the same in the page and in its row
  const tilt = (id) => {
    let h = 2166136261; for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;   // FNV-1a, so ids made a moment apart still differ
    const a = 4 + ((h >>> 8) % 81) / 10; return h & 1 ? a : -a;   // 4 to 12 degrees, either way
  };
  // the sticker art: Hugeicons' own paths, filled and coloured, over a white die-cut edge. OK is the check cut out of a
  // solid green circle; thumbs have a solid sleeve and a tinted hand, Like blue and Dislike violet so the two never read as one; Love it is a solid red heart; Celebrate is a
  // gold popper with confetti in every colour; Question is the question mark cut out of a solid orange rounded square, as OK's check
  const PAINT = {
    check: ['CheckmarkCircle02Icon', '#30b456', [['#30b456', '#30b456'], ['none', '#fff']]],
    ask: ['HelpSquareIcon', '#f97316', [['#f97316', '#f97316'], ['none', '#fff'], ['#fff', '#fff']]],
    up: ['ThumbsUpIcon', '#0a66ff', [['#0a66ff', '#0a66ff'], ['#cfe0ff', '#0a66ff']]],
    down: ['ThumbsDownIcon', '#7c3aed', [['#7c3aed', '#7c3aed'], ['#e4d8fd', '#7c3aed']]],
    heart: ['HeartIcon', '#ff3358', [['#ff4467', '#e8193f']]],
    party: ['PartyIcon', '#f5b400', [['#ffc83d', '#e0a800'], ['none', '#ff5d73'], ['none', '#0a66ff'], ['#ff5d73', '#ff5d73'],
      ['#30b456', '#30b456'], ['#0a66ff', '#0a66ff'], ['#a463f2', '#a463f2'], ['none', '#a463f2'], ['none', '#ff8a00']]],
  };
  const pathsOf = (name) => [...(ICONS[name] || '').matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
  function art(k) {
    const [name, , paint] = PAINT[k]; const ds = pathsOf(name);
    const edge = ds.map((d) => `<path d="${d}"/>`).join('');
    const ink = ds.map((d, i) => `<path d="${d}" fill="${paint[i]?.[0] || 'none'}" stroke="${paint[i]?.[1] || 'currentColor'}"/>`).join('');
    return `<svg viewBox="-3 -3 30 30" aria-hidden="true"><g fill="#fff" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">${edge}</g>`
      + `<g stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ink}</g></svg>`;
  }
  const sticker = (n, cls = '') => el(`<span class="pn-ui pn-stk${cls}${n.big ? ' big' : ''}${locked(n) ? ' old' : ''}" data-id="${esc(n.id)}" data-k="${n.react}" role="img" aria-label="${REACT[n.react][1]}" title="${REACT[n.react][1]}" style="--pn-tilt:${tilt(n.id)}deg;--pn-stk-c:${PAINT[n.react][1]}">${art(n.react)}</span>`);
  // where a sticker sits: on the highlighted text's upper right corner, overlapping it a little, else just after the
  // end of its part's heading, else on the part's top right corner. Stickers that would cover each other fan out to the right.
  const SZ = 34;   // in the page; a row's sticker is bigger still
  const SZP = SZ * UI;   // on screen, as the CSS draws it
  const szOf = (n) => (n.big ? SZP * 2 : SZP);   // a sticker held as it went on is twice the size
  function stickAt(n) {   // a big sticker sits where a normal one would, centred on the same point, only bigger
    const rects = marksOf(n.id).flatMap((m) => [...m.getClientRects()]).filter((r) => r.width > 0);
    if (rects.length) {   // the top line's right end, overlapping its corner a little
      const top = rects[0].top, r = rects.filter((q) => q.top < top + 4).reduce((a, q) => (q.right > a.right ? q : a));
      return { x: r.right + SZP * 0.2, y: r.top - SZP * 0.1 };
    }
    const b = blockEl(n.block); if (!b || !b.getClientRects().length) return null;
    const h = b.querySelector('h1,h2,h3,h4,h5,h6');
    if (h) {
      const rg = document.createRange(); rg.selectNodeContents(h);
      const hr = [...rg.getClientRects()].filter((r) => r.width > 0);
      if (hr.length) { const r = hr[hr.length - 1]; return { x: r.right + SZP / 2 + 6, y: r.top + r.height / 2 }; }
    }
    const r = b.getBoundingClientRect(); return { x: r.right - 4, y: r.top + 4 };
  }
  function stick() {
    const done=[],rs=reactables();
    const pageLeft=ROOT.querySelector('.pnO')?.getBoundingClientRect().right || 0;
    const pageRight=ROOT.querySelector('.pnN-bar')?.getBoundingClientRect().left || innerWidth;
    ROOT.querySelectorAll('.pn-stk.pg').forEach(s=>{
      const n=rs.find(x=>x.id===s.dataset.id),p=n&&stickAt(n);
      const mark=n&&marksOf(n.id)[0],block=n&&(blockEl(n.block)||mark?.closest('p,h1,h2,h3,h4,h5,h6,section,article'));
      if(!p||!block||away(block)){s.style.display='none';return;}
      const r=block.getBoundingClientRect(),sz=szOf(n),half=sz*.65,gap=12;
      let x=r.right+half+gap,y=p.y+SZP*.3;
      if(x+half+gap>pageRight){x=r.left-half-gap;if(x-half-gap<pageLeft){s.style.display='none';return;}}
      for(let i=0;i<=done.length;i++){const d=done.find(d=>Math.abs(d.x-x)<(d.sz+sz)*.65+gap&&Math.abs(d.y-y)<(d.sz+sz)*.65+gap);if(!d)break;y=d.y+(d.sz+sz)*.65+gap;}
      done.push({x,y,sz});s.style.display='';s.style.left=(x+scrollX-sz/2)+'px';s.style.top=(y+scrollY-sz/2)+'px';
    });
  }
  const marksOf = (id) => [...document.querySelectorAll(`mark.${P}mark[data-id="${id}"], .${P}img[data-pn~="${id}"]`)];   // words and pictures, in page order
  const unlight = () => document.querySelectorAll(`mark.${P}mark.${P}on, .${P}img.${P}on`).forEach((m) => m.classList.remove(P + 'on'));
  // a picture's middle is no place to tie to: a tall one ties near its top, level with where its sticker goes
  const midOf = (m, r) => (m.classList.contains(P + 'img') ? r.top + Math.min(r.height, 28) / 2 : r.top + r.height / 2);

  // ---------- reactions: a quick answer in place of words, copied as its emoji (REACT itself sits with the answers) ----------
  const emoji = (n) => REACT[n.react][2].repeat(n.big ? 2 : 1);   // a big sticker is copied as its emoji twice
  const has = (n) => !!((n.text || '').trim() || REACT[n.react] || n.files?.length);
  // a page can lock notes (version pages lock an earlier round's): they show dimmed and read-only, and aren't copied
  const locked = (n) => !!window.PN?.locked(n);
  const live = (n) => has(n) && !locked(n);

  // ---------- order: page order, then position in the block ----------
  function sorted(list = state.notes) {
    const order = blocks().map((b) => b.label);
    const bi = (n) => (n.block ? order.indexOf(n.block) : -1);
    return [...list].sort((x, y) => bi(x) - bi(y) || (x.pos || 0) - (y.pos || 0) || x.created - y.created);
  }

  // ---------- the user's pictures: a page is never told where a dropped file lives, so it saves its own copy and that copy's path
  // goes to the agent. On a file:// page or built-in local review in a browser with a folder picker (Chrome's File System Access API) whose tag
  // names the agent's workspace folder for them (data-folder, <workspace>/human-feedback, which add_notes.py makes with
  // an attachments/ folder and a marker file in it), the copy goes into its attachments/ (2026-10-26: one folder per
  // agent workspace, made by the skill, no .gitignore anywhere). The user selects that human-feedback folder once, in Chrome's
  // own dialog; the page checks the marker in it names the tag's folder, and keeps the pick in IndexedDB keyed by that
  // path, so every page in the workspace shares it. Chrome asks for the user's OK again on a later visit. A picture attached
  // before the user has picked it waits, with its file held in `unsaved`, until the user does. Elsewhere (another browser, an externally hosted page,
  // or an older tag with no data-folder) it's an ordinary download into Chrome's download folder (add_notes.py writes it
  // into the tag), as before. Each picture is {name, path, thumb, at}, plus `wait` (its copy's name) while it waits: on a
  // note in n.files, on the user's answer to a thread in its files, on the round's Overall in ovFiles ----------
  const DL = (script.dataset.downloads || '~/Downloads').replace(/\/+$/, '');
  const HF = (script.dataset.folder || '').replace(/\/+$/, '');   // the workspace's human-feedback folder
  const ATTACH = 'attachments', MARKER = '.human-feedback.json';   // inside it: where pictures go, and what proves it's the one
  const localReview = script.dataset.localReview === '1' && location.protocol === 'http:' && location.hostname === '127.0.0.1';
  const canSide = () => PICTURES && (location.protocol === 'file:' || localReview) && !!HF && typeof window.showDirectoryPicker === 'function';
  const unsaved = new Map();   // a waiting picture's copy name → its file, for this visit
  const idb = (mode, fn) => new Promise((ok, no) => {
    if (!PICTURES) return ok();
    const r = indexedDB.open('human-feedback', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('folders'); r.onerror = () => no(r.error);
    // closed once fn has made its requests, all at once: the connection stays open until its transaction ends
    r.onsuccess = () => { try { const t = r.result.transaction('folders', mode), q = fn(t.objectStore('folders')); t.oncomplete = () => ok(q && q.result); t.onerror = () => no(t.error); } catch (e) { no(e); } finally { r.result.close(); } };
  });
  let folders = null;   // [{ path, handle }]: the folders the user let the layer save in (before 1.83.0, a page's folder or one above it)
  async function knownFolders() {
    if (!folders) { folders = []; try { folders = (await idb('readonly', (s) => s.getAll())) || []; } catch (e) { /* no IndexedDB: the user picks each visit */ } }
    return folders;
  }
  const ours = async () => (await knownFolders()).find((f) => f.path === HF);
  // a folder the user picked is the workspace's human-feedback folder when the marker add_notes.py put in it names this page's
  async function isOurs(handle) {
    try { return JSON.parse(await (await (await handle.getFileHandle(MARKER)).getFile()).text()).folder === HF; } catch (e) { return false; }
  }
  const mayWrite = async (h, ask) => { const o = { mode: 'readwrite' }; try { return (await h.queryPermission(o)) === 'granted' || (!!ask && (await h.requestPermission(o)) === 'granted'); } catch (e) { return false; } };
  // the human-feedback folder to save in, from the user's pick; `ask` lets Chrome ask for the user's OK again (it needs the user's click)
  async function sideDir(ask) { const f = await ours(); return f && await mayWrite(f.handle, ask) ? f.handle : null; }
  // what's needed before a picture can be saved: nothing, Chrome's OK for the folder the user picked before, or the folder
  const sideNeeds = async () => (await sideDir(false) ? '' : (await ours()) ? 'allow' : 'folder');
  // a folder's attachments folder, looked up once a visit (a failed write drops it, so the next looks again)
  const attOf = new WeakMap();
  const attDir = (dir) => { if (!attOf.has(dir)) attOf.set(dir, dir.getDirectoryHandle(ATTACH, { create: true })); return attOf.get(dir); };
  async function writeSide(dir, file, name) {
    const w = await (await (await attDir(dir)).getFileHandle(name, { create: true })).createWritable(); await w.write(file); await w.close();
    return HF + '/' + ATTACH + '/' + name;
  }
  // the last few saves' timings in ms, for a check in the user's own Chrome (PN.saveTimes in its console); nothing is logged.
  // `answer`: from the click to Chrome's answer (its OK or the folder dialog), `marker`: the marker check, `write`: each
  // picture's write, its close() included, which in a real folder is where Chrome's checks run
  const saveTimes = [], timed = (t) => { saveTimes.push(t); if (saveTimes.length > 10) saveTimes.shift(); };
  // writes waiting pictures into the folder. Each is marked saving at once, its path set (the copy will be there moments
  // later), so its chip lands before Chrome's checks on close() end, which can take seconds in the user's Chrome (the user, round 6:
  // "when i approve, nothing happens for along time and it' shard to know if ti worked"). `settle(f, ok)` runs as each
  // write ends; a failed one waits again with its file, and resolves to whether any was written
  const saving = new Set();
  function begin(dir, list, settle, t = {}) {
    if (!PICTURES) return Promise.resolve(false);
    const all = list.map(async (f) => {
      const name = f.wait, at = performance.now();
      f.path = HF + '/' + ATTACH + '/' + name; delete f.wait; saving.add(f);
      let ok = true;
      try { await writeSide(dir, unsaved.get(name), name); unsaved.delete(name); } catch (e) { ok = false; f.path = ''; f.wait = name; attOf.delete(dir); }
      (t.write = t.write || []).push(Math.round(performance.now() - at));
      saving.delete(f); save(); keepOvFiles(); settle?.(f, ok);
      return ok;
    });
    return Promise.all(all).then((oks) => { timed(t); return oks.some(Boolean); });
  }
  function download(file, name) {
    const url = URL.createObjectURL(file), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return DL + '/' + name;
  }
  const OFK = (OVK || KEY) + '/files';
  let ovFiles = []; try { ovFiles = JSON.parse(localStorage.getItem(OFK)) || []; } catch (e) { /* storage blocked */ }
  const keepOvFiles = () => { if (!PICTURES) return; try { localStorage.setItem(OFK, JSON.stringify(ovFiles)); } catch (e) { /* storage full or blocked */ } };
  const liveOvFiles = () => ovFiles.filter((f) => !wasSent(f.at));
  const pad2 = (x) => String(x).padStart(2, '0');
  let lastStamp = '', dupes = 0;
  // a name of its own, so Chrome never renames it " (1)" and breaks the copied path
  function copyName(file) {
    const d = new Date();
    let t = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
    dupes = t === lastStamp ? dupes + 1 : 0; lastStamp = t; if (dupes) t += '-' + dupes;
    return `feedback-${t}-` + (file.name || 'image.png').replace(/[\\/:*?"<>|\s]+/g, '-').slice(-80);
  }
  // small, since every page opened from file:// shares one storage
  async function thumbOf(file) {
    let b = null;
    try {
      b = await createImageBitmap(file); const k = Math.min(1, 96 / Math.max(b.width, b.height));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(b.width * k)); c.height = Math.max(1, Math.round(b.height * k));
      c.getContext('2d').drawImage(b, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.75);
    } catch (e) { return ''; } finally { b?.close?.(); }   // its pixels go at once, not whenever it's collected
  }
  // readies each picture for the workspace's attachments folder (or saves it as a download) and returns what the note
  // keeps; each waits for a folder. With the folder allowed, `out.dir` is it: the caller shows the chips, then begin()s
  // the writes
  async function keepFiles(files) {
    if (!PICTURES) return [];
    const pics = [...files].filter((x) => /^image\//.test(x.type)), out = [];
    const [dir, thumbs] = await Promise.all([pics.length && canSide() ? sideDir(false) : null, Promise.all(pics.map(thumbOf))]);
    pics.forEach((f, i) => {
      const name = copyName(f), e = { name: !f.name || f.name === 'image.png' ? 'Pasted image' : f.name, path: '', thumb: thumbs[i], at: Date.now() };
      if (!canSide()) e.path = download(f, name); else { e.wait = name; unsaved.set(name, f); }
      out.push(e);
    });
    out.dir = dir;
    return out;
  }
  // every picture still waiting for a folder, on any note, answer or Overall; one from an earlier visit has lost its file
  const waitingFiles = () => [...state.notes.flatMap((n) => n.files || []), ...Object.values(state.answers).flatMap((x) => x.files || []), ...ovFiles].filter((f) => f.wait && unsaved.has(f.wait));
  const forget = async () => { folders = (await knownFolders()).filter((f) => f.path !== HF); try { await idb('readwrite', (s) => s.delete(HF)); } catch (e) { /* gone for this visit */ } };
  // the user clicked to save the waiting pictures: Chrome asks for the user's OK for the folder the user picked before, else (or with `pick`)
  // the user selects it in its dialog. Returns how many it started saving (each marked saving; `settle` hears how each ends), or
  // why none: 'cancelled' (the user closed the dialog or said no), or 'wrong' (a folder without the marker naming this
  // workspace's human-feedback folder). Nothing waits on IndexedDB or the attachments folder before it returns
  async function saveWaiting(pick, settle) {
    if (!PICTURES) return 0;
    const t = { at: Date.now() }, t0 = performance.now(), had = !!(await ours());
    let dir = pick ? null : await sideDir(true);
    t.answer = Math.round(performance.now() - t0);
    if (!dir && had && !pick) return 'cancelled';   // Chrome asked for the user's OK and the user said no
    if (!dir) {
      let h; try { h = await window.showDirectoryPicker({ id: 'human-feedback', mode: 'readwrite' }); } catch (e) { return 'cancelled'; }
      const t1 = performance.now(); t.answer = Math.round(t1 - t0);
      const [mine, known] = await Promise.all([isOurs(h), knownFolders()]);
      t.marker = Math.round(performance.now() - t1);
      if (!mine) return 'wrong';
      folders = [...known.filter((f) => f.path !== HF), { path: HF, handle: h }];
      idb('readwrite', (s) => s.put({ path: HF, handle: h }, HF)).catch(() => { /* kept for this visit only */ });
      dir = h;
    }
    const list = waitingFiles();
    // every one failed: the folder the user picked before is gone or moved, so the user picks it again
    if (list.length) begin(dir, list, settle, t).then((any) => { if (!any) forget(); });
    return list.length;
  }

  // ---------- the copied text: short, and every note says where it goes ----------
  const clip = (q) => (q.length <= 120 ? q : q.slice(0, 80) + ' … ' + q.slice(-30));
  const indent = (t) => t.trim().split('\n').map((l) => '   ' + l).join('\n');
  const liveEdits = () => edited().filter((label) => !editLocked(label));
  // notes and edits together, in page order
  function items() {
    const list = sorted().filter(live).map((n) => ({ n, node: marksOf(n.id)[0] || blockEl(n.block) }));
    liveEdits().forEach((label) => { const parts = editParts(label); list.push({ label, text: state.edits[label], was: parts[0].was, parts, node: editEl(label) || frameEditNode(label) }); });
    const before = (a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    return list.sort((a, b) => (!a.node || !b.node ? (a.node ? 1 : 0) - (b.node ? 1 : 0) : a.node === b.node ? 0 : before(a.node, b.node)));
  }
  // one note or edit as the agent reads it
  function lines(it, k) {
    if (it.label) {   // was: finds the words in the page's source, now: is the user's exact new wording
      const on = (t) => String(t).trim().split('\n').join('\n        ');
      const frame = frameEditRef(it.label), source = frame ? [`   Frame: ${framePath(frame.fsrc)}`] : [];
      // over several blocks: each block's words on its own ¶ line, in page order, and a block that goes reads (removed)
      if (it.parts?.length > 1) {
        const para = (side) => it.parts.map((x, i) => { const t = String(x[side] ?? '').trim(), pad = '\n' + ' '.repeat(10 + String(i + 1).length);
          return `¶${i + 1} ` + (t ? t.split('\n').join(pad) : '(removed)'); }).join('\n        ');
        return ['', `${k}. [${editPart(it.label)}] edited ${it.parts.length} blocks:`, ...source, `   was: ${para('was')}`, `   now: ${para('now')}`];
      }
      return ['', `${k}. [${editPart(it.label)}] edited:`, ...source, `   was: ${on(it.was ?? '')}`, `   now: ${it.text ? on(it.text) : '(cleared)'}`];
    }
    const n = it.n;
    const pics = n.imgs?.length ? ` (image${n.imgs.length > 1 ? 's' : ''} ${n.imgs.map((p) => clip(p.name)).join(', ')})` : '';
    return ['', `${k}. [${n.block || 'Page'}]` + pics + (n.quote ? ` "${clip(n.quote)}"` : '') + (REACT[n.react] ? ' ' + emoji(n) : ''), ...(n.text.trim() ? [indent(n.text)] : []), ...(n.files || []).map((f) => '   Image: ' + (f.path || '(not saved)'))];
  }
  // done marks belong to the version that held the user's note (the user: "stays in the previous round wiht the check").
  // Match the copy's words, using its own formatter so a clipped quote, reaction, picture or edit still finds its row.
  // Search backwards from the closing version: the same words written again in a later round are a different note.
  let doneIds = null;
  function noteDone(id) {
    if (!PAST) return false;
    if (!doneIds) {
      doneIds = new Set();
      const flat = (t) => String(t).replace(/\s+/g, ' ').trim(), have = new Map();
      const inVersion = (i) => {
        if (have.has(i)) return have.get(i);
        const s = storeOf(i), list = s.notes.map((n) => ({ id: n.id, it: { n } }));
        Object.keys(s.edits || {}).filter((l) => !spanHead(l, s)).forEach((label) => {
          const parts = editParts(label, s); list.push({ id: 'e:' + label, it: { label, text: s.edits[label], was: parts[0].was, parts } });
        });
        const out = list.map((x) => ({ id: x.id, words: flat(lines(x.it, 1).slice(1).join(' ').replace(/^1\.\s*/, '')) }));
        const overall = pastOverall(i); if (overall) out.push({ id: 'ov:past', words: flat('[Page] ' + overall) });
        have.set(i, out); return out;
      };
      LIST.forEach((v, i) => {
        if (i <= V.cur || !Array.isArray(v.done)) return;
        v.done.forEach((d) => {
          const wanted = flat(`[${d.block || 'Page'}]` + (d.quote ? ` "${clip(d.quote)}"` : '') + ' ' + (d.said || ''));
          for (let j = i - 1; j >= 0; j--) {
            const hits = inVersion(j).filter((n) => n.words === wanted);
            if (!hits.length) continue;
            if (j === V.cur) hits.forEach((n) => doneIds.add(n.id));
            break;
          }
        });
      });
    }
    return doneIds.has(id);
  }
  // the user's answers, as the agent reads them: this page's open questions, answered or not, then answers given on another version.
  // A carried one says the round it was first asked in, as an answer from another version says its version
  const carriedRef = (a) => (!fromRound(a) ? '' : V && LIST[a.from - 1] ? vref(a.from - 1) : fromRound(a));
  function questions() {
    // an old reply to What changed (q:changed), kept in another version's store, stays out (what changed, above)
    const out = ASKS_OPEN ? ASKS.filter(answerable).map((a) => {
      const x = state.answers[a.id] || {}, ref = carriedRef(a);
      return { block: a.block, quote: a.quote, q: a.text, reply: a.reply, said: a.said, rs: allReplies(x), react: x.react, big: x.big, files: x.files, at: x.at,
        viaNotes: closedByNotes(a), ref, vi: ref && V && LIST[a.from - 1] ? a.from - 1 : null, localDraft: replyDraft(a) };
    }) : [];
    if (V) LIST.forEach((v, i) => { if (i !== V.cur) Object.values(storeOf(i).answers || {}).filter((x) => x.id !== 'q:changed' && answered(x)).forEach((x) => out.push({ ...x, rs: allReplies(x), ref: i === V.last ? '' : vref(i), vi: i === V.last ? null : i })); });
    // with something sent, only answers given since go out: the rest went already
    return sentOn() ? out.filter((x) => (x.rs.length || REACT[x.react] || x.files?.length) && !wasSent(x.at)) : out;
  }
  function questionLines(all = questions()) {
    const out = [];
    const where = (x) => (x.ref ? `(${x.ref}) ` : '') + (x.block ? `[${x.block}] ` : '') + (x.quote ? `"${clip(x.quote)}" ` : '');
    // a sticker answers in place of words, as its emoji, before any words that go with it; each further reply is its own
    // Answer line, so two replies never read as one reply of two paragraphs
    const answers = (x) => { const rs = x.rs.length ? [...x.rs] : ['']; rs[0] = ((REACT[x.react] ? emoji(x) + ' ' : '') + rs[0]).trim(); return rs; };
    // the user's pictures follow, one Image line each, as under a note; a picture alone answers with no words
    const answerLines = (x, label) => [...(x.rs.length || REACT[x.react] ? answers(x).flatMap((t) => { const [first, ...rest] = t.split('\n'); return [`   ${label}${first}`, ...rest.map((l) => '   ' + l)]; }) : []),
      ...(x.files || []).map((f) => '   Image: ' + (f.path || '(not saved)'))];
    const given = (x) => x.rs.length || REACT[x.react] || x.files?.length;
    const qs = all.filter((x) => !x.reply);
    if (qs.length) out.push('', 'Your questions');
    qs.forEach((x, i) => out.push('', `Q${i + 1}. ` + where(x) + x.q, ...(given(x) ? answerLines(x, x.rs.length > 1 ? 'Answer: ' : '') : [x.viaNotes ? '   (answered by notes on this part)' : '   (no answer)'])));
    // the agent's replies to the user's notes: only the ones the user answered go back, since one left alone asks nothing of the agent
    const rs = all.filter((x) => x.reply && given(x)), one = (t) => clip(String(t || '').replace(/\s+/g, ' ').trim());
    if (rs.length) out.push('', 'Your replies');
    rs.forEach((x, i) => {
      out.push('', `R${i + 1}. ${where(x)}`.trimEnd(), ...(x.said ? [`   Note: ${one(x.said)}`] : []), `   You replied: ${one(x.q)}`, ...answerLines(x, 'Answer: '));
    });
    return out;
  }
  // words the user only marked, with no note: a compact list the agent can read as "the user noticed these" (1.100.0). Like a note,
  // ones in a copy already sent aren't repeated
  const hlLines = () => {
    const hs = state.hl.filter((h) => h.quote && !wasSent(h.created));
    return hs.length ? ['', `Highlighted, no note (${hs.length}):`, ...hs.map((h) => `   ${h.block ? `[${h.block}] ` : ''}«${clip(h.quote)}»${h.fsrc ? ` (frame: ${framePath(h.fsrc)})` : ''}`)] : [];
  };
  // One snapshot feeds both the copied words and their anonymous counts, before Copy locks this round.
  function copyData() {
    return { groups: V ? LIST.map((v, i) => ({ v, i, it: itemsOf(i) })) : [{ it: items() }], questions: questions(),
      ovt: !!state.overall.trim() && !ovSent(), ovf: liveOvFiles() };
  }
  // the copy's first line tells a fresh session how to read the rest (the user: "Apply these notes using the human-feedback
  // skill after reading its paste-format reference."), and a local page is named by its full path so any session finds it
  const HEAD = 'Apply these notes using the human-feedback skill after reading its paste-format reference.';
  const fullPath = (file, fallback) => {
    if (location.protocol !== 'file:') return fallback;
    try { return decodeURIComponent(new URL(file ? file.split('/').map(encodeURIComponent).join('/') : location.href, location.href).pathname); }
    catch (e) { return fallback; }
  };
  function serialize(data = copyData()) {
    if (V) return sequence(data);
    const list = data.groups[0].it;
    const out = [HEAD, '', `Notes on ${fullPath('', PAGE)} (${list.length})`, ...questionLines(data.questions)];
    list.forEach((it, i) => out.push(...lines(it, i + 1)));
    const { ovt, ovf } = data;
    if (ovt || ovf.length) out.push('', 'Overall:', ...(ovt ? [indent(state.overall)] : []), ...ovf.map((f) => '   Image: ' + (f.path || '(not saved)')));
    out.push(...hlLines());   // last, as on a page with versions: the one block that asks nothing of the agent
    return out.join('\n');
  }
  // another version's live notes and edits: its parts aren't on this page, so they go in part-name order
  const byPart = (x, y) => (x.block || '').localeCompare(y.block || '', undefined, { numeric: true }) || (x.pos || 0) - (y.pos || 0);
  function itemsOf(i) {
    if (i === V.cur) return items();
    const s = storeOf(i);
    return [...s.notes.filter(live).sort(byPart).map((n) => ({ n })),
      ...Object.keys(s.edits || {}).filter((label) => !spanHead(label, s) && !editLocked(label, s, i)).map((label) => { const parts = editParts(label, s); return { label, text: s.edits[label], was: parts[0].was, parts }; })];
  }
  // a version page's copy gathers every version's notes, in handoff order: what it is and which version is latest, a key
  // from each version to its file, the round's Overall, then the notes, latest version first, numbered straight through
  const vref = (i) => `Round ${i + 1}` + (LIST[i].name ? ` "${LIST[i].name}"` : '');
  const title = () => (document.title || '').replace(TAB, '').replace(/[\s,·:—–-]*\b(round|version|v)\s*\d+\s*$/i, '').trim() || PAGE;
  function sequence(data) {
    const named = new Set(data.questions.map((x) => x.vi));   // a version an answer names, so its file is in the key
    const groups = data.groups.filter((g) => g.it.length || g.i === V.last || named.has(g.i)).reverse();
    const withNotes = groups.filter((g) => g.it.length);
    const total = withNotes.reduce((s, g) => s + g.it.length, 0);
    const tag = (g) => vref(g.i) + (g.i === V.last ? ' (latest)' : '');
    const out = [HEAD, '', `Feedback on ${title()}: ${total} note${total === 1 ? '' : 's'} on ${withNotes.length} of ${LIST.length} versions. Latest is ${vref(V.last)}.`,
      '', 'Versions', ...groups.map((g) => `${tag(g)}: ${fullPath(g.v.file, g.v.page)}`)];
    const { ovt, ovf } = data;
    if (ovt || ovf.length) out.push('', 'Overall', ...(ovt ? [state.overall.trim()] : []), ...ovf.map((f) => 'Image: ' + (f.path || '(not saved)')));
    out.push(...questionLines(data.questions));
    let k = 0;
    withNotes.forEach((g) => { out.push('', `Notes on ${tag(g)}`); g.it.forEach((it) => out.push(...lines(it, ++k))); });
    out.push(...hlLines());
    return out.join('\n');
  }
  async function copyText(text) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0';
      document.body.appendChild(ta); ta.select(); try { ok = document.execCommand('copy'); } catch (_) { ok = false; } ta.remove();
    }
    return ok;
  }
  async function copy() {
    if (PAST) return false;
    if (frameSession) await settleFrameEdit();
    const t = Date.now();   // lock the words in this snapshot, even if the clipboard write takes time
    all = sentOn() && !count();   // locked, nothing new: Copy again copies everything that went, and it stays locked
    let text = '', usage = null, drafts = [];
    try {
      const data = copyData(); text = serialize(data);
      drafts = data.questions.map((x) => x.localDraft).filter(Boolean);
      try { usage = copyCounts(data); } catch (e) { /* counts never affect Copy */ }
    } finally { all = false; }
    const ok = await copyText(text);
    try { if (window.parent !== window) window.parent.postMessage({ type: 'notes-copied', text }, '*'); } catch (e) { /* no parent */ }
    if (ok) {
      try { if (usage) window.PN?.countCopied?.(usage); } catch (e) { /* counts never affect Copy */ }
      copied(t, drafts);
    }
    return ok;
  }
  function copyCounts(data) {
    const list = data.groups.flatMap((g) => g.it), notes = list.filter((it) => it.n).map((it) => it.n);
    const given = (x) => !!(x.rs.length || REACT[x.react] || x.files?.length);
    const qs = data.questions.filter((x) => !x.reply);
    const reactions = { check: 0, up: 0, heart: 0, ask: 0, down: 0, party: 0 };
    [...notes, ...data.questions].forEach((x) => { if (Object.hasOwn(reactions, x.react)) reactions[x.react]++; });
    return { round: V ? V.cur + 1 : +script.dataset.round || 1, notes: notes.length, overall: !!(data.ovt || data.ovf.length), reactions,
      edits: list.filter((it) => it.label).length, questions_answered: qs.filter(given).length, questions_open: qs.filter((x) => !given(x)).length,
      replies_answered: data.questions.filter((x) => x.reply && given(x)).length, copied_before: !!sent.copies.length,
      agent_questions: tagList('asks').length, agent_replies: tagList('replies').length, agent_done: tagList('done').length,
      agent_carried: ASKS.filter((a) => a.carried && !a.ew).length, versions: LISTED || 1 };
  }
  const count = () => state.notes.filter(live).length + liveEdits().length + ((state.overall.trim() && !ovSent()) || liveOvFiles().length ? 1 : 0)
    + ASKS.filter((a) => answerable(a) && answered(state.answers[a.id]) && !answerSent(state.answers[a.id])).length;

  // the first Copy names everything it will send, across versions, with Overall counting as one note
  const feedbackCount = () => (V ? LIST.reduce((n, v, i) => n + itemsOf(i).length, 0) : items().length)
    + questions().filter((x) => x.rs.length || REACT[x.react] || x.files?.length).length
    + ((state.overall.trim() && !ovSent()) || liveOvFiles().length ? 1 : 0);

  // ---------- small shared controls ----------
  // cap: the height to give it from the height its words need (the Overall box keeps to two lines while the user is elsewhere)
  function grow(ta, cap) { const fit = () => { ta.style.height = 'auto'; ta.style.height = (cap ? cap(ta.scrollHeight) : ta.scrollHeight) + 'px'; }; ta.addEventListener('input', fit); requestAnimationFrame(fit); ta.pnFit = fit; return ta; }
  // PN.beforeCopy(button) can stop a copy (it returns false), as the unanswered-questions reminder does; b._label, when
  // set, is the button's words for now ("Copy anyway"), which Copied goes back to
  function copyButton(label = 'Copy my feedback', cls = 'pn-btn pri') {
    const b = el(`<button type="button" class="${cls}">${icon('Copy01Icon')}<span>${label}</span></button>`);
    b.addEventListener('click', async () => {
      if (window.PN?.beforeCopy?.(b) === false) return;
      const ok = await copy();
      b.innerHTML = icon(ok ? 'Tick02Icon' : 'Cancel01Icon') + `<span>${ok ? 'Copied' : 'Copy failed'}</span>`;
      clearTimeout(b._t); b._t = setTimeout(() => { b.innerHTML = icon('Copy01Icon') + `<span>${b._label ?? label}</span>`; }, 1600);
    });
    return b;
  }

  // a reaction held down grows in its button (.charging) and at a quarter second turns into its sticker, ready (.hold .huge);
  // let go then, it goes on twice the size and bursts (rounds 1 to 9: one level, "make the half
  // second the one that explodes and get rid of the two-second one"; a quarter second since 1.62.1). held() says whether the press that just ended was held
  const HOLD = 250;
  // A held release hides the bar at once (.stamped): fading, it covered the new sticker's top half with the held one
  // snapping back to its icon, so the pop read as a stamp coming down out of the bar (the user: "the heart seems to stamp down")
  function holdToGrow(bar) {
    let at = 0, t = 0, big = false, down = null;
    const stop = () => { clearTimeout(t); bar.querySelectorAll('.rb.charging').forEach((b) => b.classList.remove('charging', 'hold', 'huge')); };
    bar.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.rb'); big = false; down = b; if (!b) return;
      stop(); bar.classList.remove('stamped'); at = performance.now(); b.classList.add('charging'); t = setTimeout(() => b.classList.add('hold', 'huge'), HOLD);
    });
    bar.addEventListener('pointerup', (e) => {
      big = !!down && e.target.closest('.rb') === down && performance.now() - at >= HOLD;
      if (big) { bar.classList.add('stamped'); setTimeout(() => bar.classList.remove('stamped'), 200); }
      stop();
    });
    bar.addEventListener('pointerleave', stop);
    bar.addEventListener('pointercancel', stop);
    return () => { const b = big; big = false; return b; };
  }
  // the reaction buttons of a pop-up: each holds its white line icon and, for when it's held ready, its sticker (✅ its own
  // green check), so a ready reaction looks just as it will on the page
  const reactButtons = () => Object.entries(REACT).map(([k, [ic, name]]) => `<button type="button" class="rb" data-k="${k}" title="${name}" aria-label="${name}">${icon(ic)}`
    + `${k === 'check' ? icon(ic, 'pn-rdy') : art(k).replace('<svg ', '<svg class="pn-rdy" ')}</button>`).join('');
  // where a framed page's own pixels sit in this window: the corner of its content, and the scale the reviewed page gives the
  // frame (a transform: scale on the <iframe>, to fit a narrow column). What a frame reports is in its own pixels, so each
  // length is times kx or ky (1 for an unscaled frame, whose offset size is its bounding box)
  function frameAt(f) {
    const fr = f.getBoundingClientRect(), kx = f.offsetWidth ? fr.width / f.offsetWidth : 1, ky = f.offsetHeight ? fr.height / f.offsetHeight : 1;
    return { x: fr.left + f.clientLeft * kx, y: fr.top + f.clientTop * ky, kx, ky };
  }
  // the Comment pill: appears over a text selection with Comment, Edit, the paperclip and the six reactions, and hands the
  // anchor on. Not while the round is locked by a receipt (the user: "lets the user comment and drop emojis from col2 even when
  // the round has been locked"): Unlock first. Its paperclip starts a note on the selection with a picture, from the file picker
  function selectionPill(onComment, onReact, onEdit, onAttach, onTypeOn, onHighlight) {
    const rx = onReact ? '<span class="dv"></span>' + reactButtons() : '';
    // Highlight sits after the paperclip as an icon, its name a tooltip (the user: "Move highlight to after attachment, tooltip instead of label")
    const pill = el(`<div class="pn-ui pn-pill"><button type="button" class="cm" aria-label="Comment">${icon('ChatAdd01Icon')}<span>Comment</span></button>`
      + (onEdit ? `<button type="button" class="ed" aria-label="Edit">${icon('PencilEdit02Icon')}<span>Edit</span></button>` : '')
      + (PICTURES && onAttach ? `<button type="button" class="at" title="Attach a picture" aria-label="Attach a picture">${icon('AttachmentIcon')}</button>` : '')
      + (onHighlight ? `<button type="button" class="hl" title="Highlight" aria-label="Highlight">${icon('HighlighterIcon')}</button>` : '') + `${rx}</div>`);
    WRAP.appendChild(pill);
    let anchor = null;
    // a plain click in the page's words (1.116.0): the word under the pointer is chosen and the pill comes up on it, so
    // Comment, Highlight and the reactions take that word, and Edit opens the block with the caret where the user clicked.
    // spot is { word, caret }; it counts only while that word is still the selection
    let spot = null;
    const same = (a, b) => a.startContainer === b.startContainer && a.startOffset === b.startOffset && a.endContainer === b.endContainer && a.endOffset === b.endOffset;
    const spotLive = () => { if (!spot) return null; const s = getSelection(); return s.rangeCount && same(s.getRangeAt(0), spot.word) && spot.caret.startContainer.isConnected ? spot : (spot = null); };
    pill.clickOn = (word, caret) => {
      const s = getSelection(); s.removeAllRanges(); s.addRange(word.cloneRange());
      spot = { word: word.cloneRange(), caret }; check();
    };
    // a double- or triple-click selects words the user means: the first click's choice no longer counts, so typing over them starts
    // a comment as over a drag (the user, 2026-11-08: "If I selected something in column 2 and then just started typing, before it
    // started automatically creating a comment, but it doesn't do that anymore"; since 1.116.0 a double-clicked word was the
    // first click's word, and typing after a click does nothing)
    pill.clickOff = () => { spot = null; };
    // the word a click-born pill is up on, so a second click on it puts the pill away instead of choosing it again
    pill.clickWord = () => (pill.classList.contains('show') && !kept && spotLive()?.word) || null;
    // kept: after Comment (or the paperclip) opens a new note's box, the pill stays on the highlighted words, shrunk to its
    // reactions, until that box closes (the user: "the pill should probably just shrink with a nice animatio or something to
    // the actions i can still do"). k is the UI's keeper for the note (live, rect, react, pick, owns, right); dx is where
    // the pill's right end sits from the words' middle, so the reactions stay put under the user's pointer as it shrinks
    let kept = null, keptT = 0;
    const GONE = '.cm,.hl,.ed,.at,.dv';
    // back to the full pill at once, with no collapse running backwards
    const unkeep = () => {
      clearTimeout(keptT); kept = null; if (!pill.classList.contains('kept')) return;
      pill.classList.add('snap'); pill.classList.remove('kept', 'grown');
      pill.querySelectorAll(GONE).forEach((b) => { b.style.maxWidth = ''; b.removeAttribute('tabindex'); b.removeAttribute('aria-hidden'); });
      pill.style.right = ''; void pill.offsetWidth; pill.classList.remove('snap');
    };
    const hide = () => {
      pill.classList.remove('show'); anchor = null;
      if (kept) { kept = null; clearTimeout(keptT); keptT = setTimeout(() => { if (!pill.classList.contains('show')) unkeep(); }, 160); }   // shrunk while it fades
    };
    const check = () => setTimeout(() => {
      if (anchor?.frame) return;
      const a = anchorFromSelection();
      if (kept && !a) return follow();   // a click into the note's box or its words leaves the shrunk pill where it is
      place(a);
    }, 0);
    // the shrunk pill follows the note's words as the page scrolls: off screen it waits hidden, and comes back with them
    const follow = () => {
      if (!kept) return;
      const k = kept.k; if (!k.live()) return hide();
      pill.querySelectorAll('.rb').forEach((b) => b.classList.toggle('on', b.dataset.k === k.react()));
      const r = k.rect(), w = pill.offsetWidth, lim = k.right();
      if (!r || r.bottom < 0 || r.top > innerHeight || (r.left + r.right) / 2 > lim) { pill.classList.remove('show'); return; }   // out of view, or under the notes column
      const R = Math.max(8 + w, Math.min(lim, (r.left + r.right) / 2 + kept.dx));
      pill.style.left = 'auto'; pill.style.right = innerWidth - R + 'px';
      pill.style.top = (r.top > 58 ? r.top - 50 : Math.min(innerHeight - 48, r.bottom + 10)) + 'px';
      pill.classList.add('show');
    };
    const keep = (k) => {
      if (!k || !k.live()) return hide();
      const b0 = pill.getBoundingClientRect(), r = k.rect() || anchor?.rect;
      const gone = [...pill.querySelectorAll(GONE)].filter((b) => b.style.display !== 'none');
      gone.forEach((b) => { b.style.maxWidth = b.offsetWidth + 'px'; });   // from its own width, so the collapse can run
      // pinned by its right end, so the reactions don't move as Comment folds away into them
      pill.style.left = 'auto'; pill.style.right = innerWidth - b0.right + 'px';
      void pill.offsetWidth;
      anchor = null; kept = { k, dx: b0.right - (r ? (r.left + r.right) / 2 : b0.right) };
      pill.classList.add('kept');
      gone.forEach((b) => { b.style.maxWidth = ''; b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); });
      clearTimeout(keptT); keptT = setTimeout(() => { if (kept) { pill.classList.add('grown'); follow(); } }, 300);   // settled: now it may follow
    };
    pill.sync = () => { if (kept && pill.classList.contains('grown')) follow(); else if (kept && !kept.k.live()) hide(); else if (kept) pill.querySelectorAll('.rb').forEach((b) => b.classList.toggle('on', b.dataset.k === kept.k.react())); };
    const place = (a) => {
      unkeep();
      anchor = a;
      if (!anchor || sentOn() || PAST) return hide();
      const ed = pill.querySelector('.ed'); if (ed) ed.style.display = (anchor.frame ? anchor.edit != null : editRange()) ? '' : 'none';
      const hb = pill.querySelector('.hl');
      if (hb) {
        const s = getSelection(), on = anchor.frame ? anchor.hl.length : s.rangeCount && hlIn(s.getRangeAt(0)).all;
        hb.style.display = anchor.frame && !anchor.frame.getAttribute('src') ? 'none' : '';
        hb.classList.toggle('on', !!on);
        const word = on ? 'Unhighlight' : 'Highlight'; hb.setAttribute('aria-label', word); hb.title = word;
      }
      const r = anchor.rect;
      // a window too narrow for it (a phone) drops Comment's and Edit's words, so every button still fits on screen
      pill.classList.remove('tight'); if (pill.offsetWidth > innerWidth - 16) pill.classList.add('tight');
      const w = pill.offsetWidth;
      pill.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
      if (r.bottom < 0 || r.top > innerHeight) { pill.classList.remove('show'); return; }
      pill.style.top = (r.top > 58 ? r.top - 50 : Math.min(innerHeight - 48, r.bottom + 10)) + 'px';
      pill.classList.add('show');
    };
    // a framed page's layer (see the top of this file) reports its selections; the pill shows over them in this page
    addEventListener('message', (e) => {
      const d = e.data; if (!d || !d.hf || d.kind !== 'sel') return;
      const f = frameSender(e); if (!f) return;
      if (!d.quote) { if (anchor?.frame === f) hide(); return; }
      if (typeof d.quote !== 'string' || !d.rect) return;
      const { x, y, kx, ky } = frameAt(f), r = d.rect, l = d.line;
      // at: the words' place in the frame, in `framed`'s shape, so a note made on them is level with them from its first row
      place({ block: blockLabel(blockOf(f)), quote: d.quote, pos: d.pos || 0, frame: f, edit: d.edit, hl: Array.isArray(d.hl) ? d.hl : [], rect: { left: x + r.left * kx, top: y + r.top * ky, width: r.width * kx, height: r.height * ky, right: x + (r.left + r.width) * kx, bottom: y + (r.top + r.height) * ky },
        ...(l ? { at: { f, r: { left: l.left, top: l.top, width: l.width, height: l.height, end: l.left + l.width } } } : {}) });
    });
    document.addEventListener('mousedown', (e) => {
      const t = tgt(e); if (pill.contains(t)) return;
      if (anchor?.frame) hide();
      if (kept && !kept.k.owns(t)) hide();   // a click anywhere but the note's own row or words lets the shrunk pill go
    });
    document.addEventListener('mouseup', (e) => { if (!pill.contains(tgt(e))) check(); });
    document.addEventListener('keyup', (e) => { if (e.shiftKey || e.key?.startsWith('Arrow')) check(); });   // Chrome's autofill sends key events with no key
    // typing with the whole pill up starts a comment on the words, as Comment does, with what the user typed in its box and the
    // caret after it (the user: "if i highlight and then start typing immediately, it should create the commet thread and
    // start typing in it as if i had clicked the comment button. i don't nee dto see this, just do it"). A plain click's pill
    // takes keys too (the user, 2026-11-11: "When I click on a word and then it highlights the word and then I start typing, it
    // doesn't immediately start writing a comment"; 1.116.0 had made a key after a click do nothing). Any printable key
    // but a space (it scrolls the page), with no ⌘, Ctrl or Alt, outside a text box and an open Edit. The box takes the
    // focus in that same keystroke, so the keys after it land there however fast the user types. Escape still puts the pill away
    const typable = (e) => typeof e.key === 'string' && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && !e.isComposing;
    const typeIn = (key) => {
      const a = anchor; getSelection().removeAllRanges();
      if (a.frame) { toFrame(a.frame, { kind: 'clear' }); Object.assign(a, frameRef(a.frame, a.block)); a.frame = true; }
      const k = onComment(a, key); if (k) keep(k); else hide();
    };
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (kept || anchor) hide(); return; }
      if (!anchor || kept || e.key === ' ' || !typable(e) || !pill.classList.contains('show') || editIsOpen() || tgt(e).closest?.('input,textarea,select,[contenteditable]')) return;
      e.preventDefault(); typeIn(e.key);
    });
    // pasting words does the same as typing them (1.141.0; the user, 2026-11-08: "i want to be able to paste text instead of
    // merely typing when selecting col2 text to cause the comment to be created"): ⌘V with the whole pill up starts the
    // comment on the words with the pasted text in its box and the caret after it. Words only: with a picture on the
    // clipboard the paste is left to the one that attaches pictures, and a paste into a text box or an open Edit is theirs
    const pastedWords = (d) => { const t = (d?.getData('text/plain') || '').replace(/\r\n?/g, '\n'); return t.trim() && ![...(d?.files || [])].some((f) => /^image\//.test(f.type)) ? t : ''; };
    document.addEventListener('paste', (e) => {
      if (!anchor || kept || !pill.classList.contains('show') || editIsOpen() || tgt(e).closest?.('input,textarea,select,[contenteditable]')) return;
      const text = pastedWords(e.clipboardData); if (!text) return;
      e.preventDefault(); typeIn(text);
    });
    // a framed page sends its keys and pastes up: the first, over its selection, starts the comment; any it sends after,
    // typed before the box took the focus from it, go in the box after the first
    addEventListener('message', (e) => {
      const d = e.data; if (!d || !d.hf) return;
      const text = d.kind === 'key' && typable(d) ? d.key : d.kind === 'paste' && typeof d.text === 'string' && d.text.trim() ? d.text : null; if (text === null) return;
      if (anchor?.frame && !kept && pill.classList.contains('show') && text !== ' ') typeIn(text); else if (kept && onTypeOn) onTypeOn(text);
    });
    document.addEventListener('scroll', (e) => {
      if (e.target.closest?.('.pn-ui')) return;
      if (kept) return follow();
      if (anchor) { if (anchor.frame) hide(); else check(); }
    }, true);
    addEventListener('resize', () => { if (kept) follow(); });
    pill.addEventListener('mousedown', (e) => e.preventDefault());
    const held = holdToGrow(pill);
    pill.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      // shrunk: a reaction goes on the open note, or comes off it picked again; the pill stays for another
      if (kept) {
        if (!b.dataset.k) return;
        pill.classList.add('nudge'); setTimeout(() => pill.classList.remove('nudge'), 300);   // it rises over the sticker smoothly
        kept.k.pick(b.dataset.k, held()); pill.sync(); return;
      }
      const a = anchor; if (!a) return hide();
      if (b.classList.contains('ed')) {
        if (a.frame) { hide(); if (a.edit != null) openFrameEdit(a.frame, a.edit); return; }
        const c = spotLive()?.caret, r = c || editRange(); spot = null; hide(); if (r) onEdit(r); return;
      }
      if (b.classList.contains('hl')) {   // words all highlighted already: take those highlights off; else mark them
        if (a.frame) { toFrame(a.frame, { kind: 'clear' }); hide(); return onHighlight(a, a.hl.length ? a.hl.filter((id) => state.hl.some((h) => h.id === id && frameFor(h) === a.frame)) : null); }
        const s = getSelection(), found = s.rangeCount ? hlIn(s.getRangeAt(0)) : { ids: [], all: false };
        s.removeAllRanges(); hide(); return onHighlight(a, found.all ? found.ids : null);
      }
      getSelection().removeAllRanges();
      if (a.frame) { toFrame(a.frame, { kind: 'clear' }); Object.assign(a, frameRef(a.frame, a.block)); a.frame = true; }   // the note keeps that it's framed, and which frame
      if (b.dataset.k) { hide(); return onReact(a, b.dataset.k, held()); }
      const k = b.classList.contains('at') ? onAttach(a) : onComment(a);
      if (k) keep(k); else hide();
    });
    return pill;
  }

  css(`
    :root{--pn-ink:#1d1d1f;--pn-text:#2c2c2e;--pn-ink2:#48484d;--pn-muted:#6b6b70;--pn-hair:#e6e6ea;--pn-hair2:#d4d4d9;
      --pn-side:#f1f1f3;--pn-white:#fff;--pn-sel:var(--pn-white);--pn-me:#0a66ff;--pn-agent:#7c3aed;--pn-red:#ff3b30;--pn-del:#c4302b;--pn-delh:#a82722;--pn-delbg:#fdeceb;--pn-ins:#18794e;--pn-bub:#ececef;--pn-anc:rgba(255,207,40,.3);--pn-ancOn:rgba(255,207,40,.75);
      --pn-btnb:#c7c7cc;--pn-hov:#e8e8ec;--pn-R0:4px;--pn-R1:8px;--pn-R2:14px;
      --pn-ui:-apple-system,"SF Pro Text",system-ui,sans-serif}
    :root:where(.pn-dark):not([data-theme="light"]){--pn-ink:#ececec;--pn-text:#dcdcdc;--pn-ink2:#c4c4c8;--pn-muted:#a3a3a8;
      --pn-hair:#333336;--pn-hair2:#444448;--pn-side:#1d1d1f;--pn-white:#262628;--pn-agent:#7a5af0;--pn-red:#ff453a;--pn-del:#ff6961;--pn-delh:#ff8a84;--pn-delbg:rgba(255,69,58,.16);--pn-ins:#30d158;--pn-bub:#2e2e31;--pn-anc:rgba(255,217,90,.22);--pn-ancOn:rgba(255,217,90,.34);
      --pn-btnb:#4a4a4e;--pn-hov:#2c2c2f;--pn-sel:#313134}
    /* the page's own type rules never reach the layer, by rule or by inheritance: an uppercase, letter-spaced h2 put the
       done summary's headings in small capitals (the user: "use hierarchy, size, etc. to distinguish, not caps and letter
       spacing. that's an ai tell"), and a page's .lbl capitalised Overall feedback. One class beats a bare element rule;
       first in the layer's CSS, so any later layer rule of the same weight still wins. The page's own words inside a
       highlight (mark.pn-mark) aren't the layer's and keep the page's styling */
    .pn-ui,.pn-ui *{text-transform:none;letter-spacing:normal;word-spacing:normal;font-variant-caps:normal;text-shadow:none;text-indent:0}
    /* the layer's own scheme, so a dark page can't draw dark scrollbars and controls on its light columns */
    .pn-ui{color-scheme:light}
    :root:where(.pn-dark):not([data-theme="light"]) .pn-ui{color-scheme:dark}
    .pn-ui{font-family:var(--pn-ui);color:var(--pn-ink);-webkit-font-smoothing:antialiased;font-size:14px;line-height:1.45}
    .pn-ui *{box-sizing:border-box}
    .pn-ui button,.pn-ui textarea,.pn-ui input{font-family:var(--pn-ui)}   /* one sans font everywhere; controls don't inherit by default */
    .pn-ic{display:block;flex:none;width:20px;height:20px}
    .pn-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:36px;padding:0 14px 0 12px;border-radius:var(--pn-R1);
      border:1px solid var(--pn-btnb);background:var(--pn-white);font:500 13px/1 var(--pn-ui);color:var(--pn-ink);cursor:pointer;white-space:nowrap;transition:background .1s,transform .12s}
    .pn-btn:hover{background:var(--pn-hov)} .pn-btn:active{transform:scale(.97)}
    .pn-btn.pri{background:#1d1d1f;border-color:#1d1d1f;color:#fff} .pn-btn.pri:hover{background:#3a3a3c}
    :where(.pn-dark) .pn-btn.pri{background:#f2f2f2;border-color:#f2f2f2;color:#1d1d1f}:where(.pn-dark) .pn-btn.pri:hover{background:#dcdcdc}
    .pn-btn:disabled{opacity:.4;pointer-events:none}
    .pn-icb{width:36px;height:36px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;border:0;background:none;color:var(--pn-muted);cursor:pointer}
    .pn-icb:hover{background:var(--pn-hov);color:var(--pn-ink)}
    .pn-lnk{border:0;background:none;padding:0;font:500 13px/1 var(--pn-ui);color:var(--pn-muted);cursor:pointer} .pn-lnk:hover{color:var(--pn-ink)}
    .pn-ta{display:block;width:100%;resize:none;overflow:hidden;min-height:40px;padding:9px 12px;border:1px solid var(--pn-hair2);border-radius:var(--pn-R1);
      background:var(--pn-white);color:var(--pn-text);font:14.5px/1.45 var(--pn-ui);outline:none}
    .pn-ta:focus{border-color:var(--pn-ink2)}
    .pn-pill{position:fixed;z-index:2147483000;display:inline-flex;align-items:center;height:40px;padding:0 4px;border-radius:20px;
      background:#1d1d1f;color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.18);opacity:0;transform:translateY(4px);pointer-events:none;transition:opacity .12s,transform .12s}
    .pn-pill.show{opacity:1;transform:none;pointer-events:auto}
    /* on a dark page the black pill met the page's own near-black and lost its edge: a faint light ring keeps it a shape */
    :root:where(.pn-dark):not([data-theme="light"]) .pn-pill{box-shadow:0 0 0 1px rgba(255,255,255,.16),0 6px 18px rgba(0,0,0,.4)}
    .pn-pill button{display:inline-flex;align-items:center;justify-content:center;height:32px;border:0;background:none;color:#fff;cursor:pointer;transition:background .12s}
    .pn-pill button:hover{background:rgba(255,255,255,.14)}
    .pn-pill .cm,.pn-pill .ed{gap:8px;padding:0 12px 0 10px;border-radius:16px;font:500 13px/1 var(--pn-ui)}
    /* Comment's and Edit's words half a pixel lower: one screen pixel on a 2x display. Their capitals were already centred,
       but the d, i and t of Edit and Comment's C rise above them, so the ink sat 0.65 px (Edit) and 0.38 px (Comment) above
       the button's middle, while the icons sat within 0.15 px of it (measured at 2x, 2026-11-08). Lowered, Edit's word sits
       level with its pencil and Comment's within 0.15 px of the middle (the user, 2026-11-08: "i think the word edit in the
       pill is not vetically aligned and is too high, check it"). A translate, since top:.5px moved the text a whole pixel
       (Chrome lays text on whole pixels), and trimming the word's box to its capitals moved nothing */
    .pn-pill :is(.cm,.ed)>span{translate:0 .5px}
    /* Edit is the pill's one coloured button, filled with the blue of the user's own notes so the user sees it's there (the user: "make it
       more promient so it's clear it's there? using the same blue for edit, maybe it's filled"). The same #0a66ff in dark
       mode: a lighter blue (#5f87ff) would put the white word at about 3.3:1, where this keeps 4.8:1 */
    .pn-pill .ed{margin:0 4px;background:var(--pn-me);color:#fff}
    .pn-pill .ed:hover{background:color-mix(in srgb,var(--pn-me) 86%,#000)}
    .pn-pill .dv{width:1px;height:20px;margin:0 4px;background:rgba(255,255,255,.22)}
    /* kept: Comment, Edit, the paperclip and the divider fold away into the reactions, which stay where they were (the pill
       is pinned by its right end); Comment's words fade first, so nothing reads half cut off */
    .pn-pill :is(.cm,.hl,.ed,.at,.dv){overflow:hidden;flex:none;white-space:nowrap;transition:background .12s,max-width .26s cubic-bezier(.4,0,.2,1),padding .26s cubic-bezier(.4,0,.2,1),margin .26s cubic-bezier(.4,0,.2,1),opacity .14s ease-out}
    .pn-pill.kept :is(.cm,.hl,.ed,.at,.dv){max-width:0;padding-left:0;padding-right:0;margin-left:0;margin-right:0;opacity:0;pointer-events:none}
    .pn-pill.kept.grown :is(.cm,.hl,.ed,.at,.dv){visibility:hidden}
    .pn-pill.snap,.pn-pill.snap *{transition:none !important}
    .pn-pill.tight:not(.kept) :is(.cm,.ed,.rb,.at,.hl){width:clamp(24px,8.1vw,28px);padding:0;gap:0;border-radius:50%}
    .pn-pill.tight:not(.kept) :is(.ed,.dv){margin-inline:2px} .pn-pill.tight :is(.cm,.ed) span{display:none}
    .pn-pill .hl.on{background:rgba(255,255,255,.18)}   /* the words are highlighted already: this takes it off */
    .pn-pill.hlpop{padding:0 4px} .pn-pill.hlpop .cm{gap:8px}
    .pn-pill.kept .rb.on{background:rgba(255,255,255,.22)}
    .pn-pill.kept.nudge{transition:opacity .12s,transform .12s,top .22s cubic-bezier(.4,0,.2,1)}
    ${editTagCss()}
    .pn-pill .rb,.pn-pill .at,.pn-pill .hl{width:32px;border-radius:50%}
    .pn-pill .rb svg{transition:transform .18s cubic-bezier(.34,1.56,.64,1)}
    .pn-pill .rb:hover svg{transform:scale(1.22) translateY(-1px)} .pn-pill .rb:active svg{transform:scale(.9)}
    .pn-pill.show .rb svg{animation:pnIn .26s cubic-bezier(.34,1.56,.64,1) backwards}   /* the reactions arrive one after another */
    .pn-pill.show .rb[data-k=up] svg{animation-delay:.03s} .pn-pill.show .rb[data-k=down] svg{animation-delay:.06s} .pn-pill.show .rb[data-k=heart] svg{animation-delay:.09s} .pn-pill.show .rb[data-k=party] svg{animation-delay:.12s} .pn-pill.show .rb[data-k=ask] svg{animation-delay:.15s}
    @keyframes pnIn{from{transform:scale(.5);opacity:0}}
    .pn-bit.lv{width:12px;height:12px;border-radius:0;background:none}   /* Love it throws little hearts instead of confetti */
    .pn-bit.lv svg{display:block;width:100%;height:100%}
    /* a reaction is a sticker: die-cut art with a white edge and a soft shadow, laid over the page or a note at a slight tilt */
    .pn-stk{position:absolute;z-index:2147480500;display:block;width:${SZ}px;height:${SZ}px;line-height:0;cursor:pointer;
      transform:rotate(var(--pn-tilt,0deg));transition:transform .16s cubic-bezier(.34,1.56,.64,1)}
    .pn-stk svg{display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 1px 1px rgba(0,0,0,.24)) drop-shadow(0 3px 5px rgba(0,0,0,.14))}
    .pn-stk:hover{transform:rotate(calc(var(--pn-tilt,0deg) / 3)) scale(1.14)}
    .pn-stk.old{filter:grayscale(1);opacity:.45}   /* an earlier round's: faded, and the same on a light or dark page */
    .pn-stk::after{content:"";position:absolute;inset:8%;border-radius:50%;border:2px solid var(--pn-stk-c,var(--pn-me));opacity:0;pointer-events:none}
    /* slapped on: it drops from above, turning into its tilt, squashes on landing and settles, with a ripple where it hits */
    @keyframes pnSlap{0%{transform:translateY(-16px) rotate(calc(var(--pn-tilt,0deg) - 30deg)) scale(1.9);opacity:0;animation-timing-function:cubic-bezier(.5,0,.9,.6)}
      15%{opacity:1}
      50%{transform:rotate(var(--pn-tilt,0deg)) scale(.84);animation-timing-function:cubic-bezier(.2,.7,.3,1)}
      75%{transform:rotate(var(--pn-tilt,0deg)) scale(1.08);animation-timing-function:ease-in-out}
      100%{transform:rotate(var(--pn-tilt,0deg)) scale(1)}}
    @keyframes pnLift{0%{filter:drop-shadow(0 14px 8px rgba(0,0,0,.14)) drop-shadow(0 20px 16px rgba(0,0,0,.1))}
      50%{filter:drop-shadow(0 0 .5px rgba(0,0,0,.4)) drop-shadow(0 1px 2px rgba(0,0,0,.2))}}
    @keyframes pnThwack{from{transform:scale(1);opacity:.6}to{transform:scale(1.9);opacity:0}}
    .pn-stk.slap{animation:pnSlap .34s linear}   /* speeds up into the landing, then bounces: each step sets its own easing */
    .pn-stk.slap svg{animation:pnLift .34s linear}   /* the shadow tightens as it lands */
    .pn-stk.slap::after{animation:pnThwack .2s ease-out .17s}
    /* Love it and Celebrate pop instead: they swell up from nothing in place, overshoot, and settle, with no landing */
    @keyframes pnPop{0%{transform:rotate(var(--pn-tilt,0deg)) scale(0);opacity:0;animation-timing-function:cubic-bezier(.2,.9,.3,1.25)}
      20%{opacity:1}
      55%{transform:rotate(var(--pn-tilt,0deg)) scale(1.28);animation-timing-function:cubic-bezier(.4,0,.6,1)}
      80%{transform:rotate(var(--pn-tilt,0deg)) scale(.94);animation-timing-function:ease-out}
      100%{transform:rotate(var(--pn-tilt,0deg)) scale(1)}}
    .pn-stk.pop{animation:pnPop .38s linear}
    /* held: it grows in white; at a quarter second it turns into its sticker and breathes, every reaction alike. Only ✅ keeps the
       grey circle behind it while held: a bare check needs it, the others are shapes already */
    .pn-pill .rb{position:relative;overflow:visible}
    .pn-pill .rb .pn-rdy{position:absolute;left:6px;top:6px;pointer-events:none;opacity:0;transition:opacity .12s}
    .pn-pill .rb svg.pn-rdy:not(.pn-ic){left:3.5px;top:3.5px;width:25px;height:25px;overflow:visible}   /* the sticker art's box is 30 units to the icon's 24 */
    .pn-pill .rb[data-k=check] .pn-rdy path{stroke:#4fd17a;stroke-width:2.2}
    .pn-pill .rb.charging svg{transform:scale(1.3);transition:transform .2s cubic-bezier(.3,0,.6,1) .05s}
    /* ready: it swells on from where the grow left off and breathes at once. .show in the selector outranks the arrival
       stagger, which otherwise held the breath back by up to .12s, a different wait on each button */
    .pn-pill.show .rb.huge svg{transform:scale(1.45);animation:pnSwell .12s ease-out both,pnBreathe 1.1s ease-in-out .12s infinite}
    @keyframes pnSwell{from{transform:scale(1.3)}to{transform:scale(1.45)}}
    @keyframes pnBreathe{0%,100%{transform:scale(1.45)}50%{transform:scale(1.58)}}
    .pn-pill.stamped{transition:none;visibility:hidden}
    .pn-pill .rb.huge .pn-rdy{opacity:1}
    .pn-pill .rb:not([data-k=check]).huge svg:not(.pn-rdy){opacity:0}   /* the sticker replaces the white icon outright */
    .pn-pill .rb[data-k=check].hold{background:rgba(255,255,255,.14)}
    .pn-pill .rb:not([data-k=check]):is(.charging,.hold){background:none}
    .pn-stk.big{width:${SZ * 2}px;height:${SZ * 2}px}
    .pn-bit{position:absolute;width:5px;height:5px;border-radius:50%;pointer-events:none;z-index:2147483000}
    @media (prefers-reduced-motion: reduce){.pn-ui *,.pn-pill,.pn-stk{transition:none !important}.pn-pill *,.pn-stk,.pn-stk svg,.pn-stk::after{animation:none !important}
      .pn-pill .rb.charging:not(.huge) svg{transform:none}}   /* held, nothing grows: the sticker simply appears at a quarter second */
  `);

  // the page's own pieces: highlights (translucent, so overlapping ones read as one stretch, darker where they overlap), a
  // picture in a note ringed in the highlight's yellow rather than tinted, an edited line's green mark, and the colours they use
  const V_ = (k) => `var(--${P}${k})`;
  pageCss(`
    ${editColors()}
    mark.${P}mark{background:${V_('anc')};color:inherit;border-radius:2px;transition:background .2s;cursor:pointer}
    mark.${P}mark mark.${P}mark{border-radius:0}
    mark.${P}mark.${P}on{background:${V_('ancOn')}}
    mark.${P}mark.${P}lt{color:${V_('ink')}}
    pre mark.${P}mark{background:rgba(255,217,90,.25)} pre mark.${P}mark.${P}on{background:rgba(255,217,90,.5)}
    mark.${P}mark.${P}old{background:color-mix(in srgb,${V_('anc')} 45%,transparent)} mark.${P}mark.${P}old.${P}on{background:${V_('anc')}}
    /* a thread the agent started (its questions and replies, ids 'q:…') takes the agent's violet, as its cursor does; the user's
       own notes keep the yellow (the user, 2026-11-08: "the highlight color for a thread started by you is purple, kind of like
       your cursor and stuff, rather than this yellow, which is for me. Just make sure it's not so dark that I can't read the
       text"). Light enough that page ink keeps 7:1 or more on it in both modes, the picked one included. The user's picked
       yellow in dark mode went from .45 to .34 at the same time, since light text on it measured 3.7–4.0:1, under 4.5:1 */
    mark.${P}mark[data-id^="q:"]{background:${V_('ag')}}
    mark.${P}mark[data-id^="q:"].${P}on{background:${V_('agOn')}}
    pre mark.${P}mark[data-id^="q:"]{background:rgba(139,92,246,.2)} pre mark.${P}mark[data-id^="q:"].${P}on{background:rgba(139,92,246,.34)}
    mark.${P}mark[data-id^="q:"].${P}old{background:color-mix(in srgb,${V_('ag')} 45%,transparent)} mark.${P}mark[data-id^="q:"].${P}old.${P}on{background:${V_('ag')}}
    ${highlightCss()}
    /* an agent's question on exact words takes the same filled highlight as the user's notes (the user: "all threads in col3 get the yellow treatment
       in col2 like when i create the threads, not the dotted underline style which is inconsistent"; dotted until 1.120.3); violet since 2026-11-08 */
    .${P}img{outline:3px solid ${V_('ancOn')};outline-offset:3px;cursor:pointer;transition:outline-color .2s,outline-width .2s}
    .${P}img.${P}on{outline:5px solid #ffcf28}
    ${editCss()}
    @media (prefers-reduced-motion: reduce){mark.${P}mark{transition:none !important}}
  `);

  window.PN = { PAGE, state, save, addHl, removeHl, restoreHl, hlIn, icon, brandIcon, esc, el, css, art, pathsOf, newId, blocks, blockEl, blockOf, blockLabel, anchorFromSelection, applyMarks, marksOf, unlight, midOf, posAt,
    UI, toFrame, frameAt, sorted, serialize, copyText, copy, count, feedbackCount, grow, copyButton, selectionPill, initEdits, edited, editEl, editParts, revertEdit: (label) => { finishFrameEdit(); revertEdit(label); }, openEdit: (...args) => { finishFrameEdit(); openEdit(...args); },
    closeEdit, editBlockAt, spanHead, editHist, undoKey,
    editIsOpen, editFresh, editStepAt, frameEditRef, frameEditNode, frameEditLabel, frameRef, frameFor, frameSender, connectFrame, openFrameEdit, finishFrameEdit, keepFrameEdit, editPart, editHome, shownText, originals, noteDone, REACT, has, live, sticker, stick, V, pastOverall, editLocked, ASKS, ASKS_OPEN, fromRound, answerable, answerOf, answered, replied, repliesOf, setReplies, holdToGrow, reactButtons,
    sentOn, rcvdOn, gotIt, sentAt: () => sent.at, gotAll: () => (sent.got || 0) >= (sent.to || 0), ovSent, answerSent, unlock, PAST, locked: (n) => PAST || (n.created || 0) < ROUND_START || wasSent(n.edited || n.created),
    keepFiles, ovFiles, keepOvFiles, saveWaiting, begin, saveTimes, isSaving: (f) => saving.has(f), waitingFiles, sideNeeds, canSide, savable: (f) => !!f.wait && unsaved.has(f.wait), fileSent: (f) => wasSent(f.at), ROUND: +script.dataset.round || 1,
    ROUND_AT: Date.parse(LIST[CUR]?.at || '') || Date.parse(LIST[CUR]?.made || ''),
    MADE: Date.parse(script.dataset.made || '') || 0,   // when add_notes.py last wrote the tag
    LISTED, PICTURES, COUNT_PAGE: LISTED ? LIST[0].page : PAGE,
    AGENT: (script.dataset.agent || '').trim(),   // the agent that tagged the page, as it named itself (add_notes.py --agent)
    // the lead and the agents that helped it, each helper with the parts it made (add_notes.py --helper, --owns)
    AGENTS: tagList('agents'),
    P, HOST, root: ROOT, WRAP, pageCss, rootCls, tgt, inLayer, away, showPart, tabOf, threadClosed, labelOf };
})();

/* The notes UI: an outline of the page on the left; notes on the right as plain rows placed level with
   what they're about, tied to it by the writing app's connector line. Both sides collapse to a slim rail.
   Every note can be edited or deleted; a delete can be undone. A line or paragraph the user opens with the pill's Edit
   is typed into directly; each changed one gets a row with its old words, its new ones and an undo. */
(function () {
  if (window.PN_FRAME) return;   // a framed page's layer only passes selections up
  const { P, root: ROOT, WRAP, HOST, pageCss, rootCls, tgt, inLayer, away, showPart, tabOf, labelOf } = PN;
  rootCls('pn-past', !!PN.PAST);   // an earlier version: read only (no rail Copy, no Overall paperclip)
  const { UI, state, save, icon, brandIcon, esc, el, css, newId, blocks, blockEl, applyMarks, marksOf, unlight, midOf, count, grow, copyButton, frameAt, selectionPill, edited, editEl, revertEdit, REACT, has, sticker, stick, V } = PN;
  const blank = (n) => !has(n) && !(n.draft || '').trim();   // a new note with no words, sticker or picture yet
  // the Outline and the notes column share one width (the user, 1.85.0: "col1 and col3 ar ealso not the asme size ... find a
  // compromise"): 260 and 360 from the first version until then. 340 leans to the notes column, which holds bubbles, boxes
  // and, under a note being rewritten, Save, Select folder and Cancel with Delete still set apart; and it gives the Outline's
  // labels room to sit on one line. On screen it's about the midpoint of the two old widths (315 and 436 px). 15% narrower
  // in 1.96.0 (the user: "col1 and col3 seem a little too wide, make them a little narrower, maybe 15% less. make sure they're
  // equal width in all conditions"): both still read COL, and a test holds them equal at every window width
  const COL = 289, L = COL, R = COL, RAIL = 56;
  const TIE = 26;   // a row's tie point: the middle of its label line
  const GROUND = 300;   // the bar's ground changing (light, dark, green): a crossfade in place, ms
  const DRAW_AT = 150;   // a state's check starts drawing this far into that fade, ms; its last stroke ends 410 ms later
  const RCV_HOLD = 2200;   // a receipt arriving reads Received this long, then Updating
  const UPD_MAX = 30 * 60e3;   // Updating for at most this long after the receipt: never a spinner forever
  const ROLL = 480;   // a new round's number rolling up, ms
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // the user is looking: the tab in view and Chrome the window the user is in. A tab show.py opens with `open -g` is in view behind the user's
  // terminal, so an arrival there played to no one and the user came back to it at rest (the user: "if i close the tab and you reopen
  // it, animations ... don't appear when i navigate there or tab opens"). An arrival waits for both; `back` fires on either.
  // A page shown in another page's frame can't know its window has focus, so there being in view is enough
  const watching = () => !document.hidden && (window.top !== window || document.hasFocus());
  const back = (fn) => { document.addEventListener('visibilitychange', fn); addEventListener('focus', fn); };
  // room in the page for the columns, a part landing clear of the top, a heading flashed by a jump, the native scrollbar
  // hidden (the layer draws its own), and the spacer that lets the last part scroll above the footer. The padding is
  // !important because an email's inline <body style="padding:…"> otherwise wins and leaves the page under the outline.
  pageCss(`
    /* tabs: a closed panel stays closed whatever display the page gives it. A bare tablist, one with no class of its own, gets a plain
       sticky bar; a page that styles its tabs gives the list a class, and :where keeps all this below any rule of the page's */
    [role="tabpanel"][hidden]{display:none!important}
    :where([role="tablist"]:not([class])){position:sticky;top:0;z-index:5;display:flex;gap:20px;overflow-x:auto;scrollbar-width:none;margin-bottom:20px;background:var(--${P}tabbg,Canvas);border-bottom:1px solid color-mix(in srgb,currentColor 18%,transparent)}
    :where([role="tablist"]:not([class]) [role="tab"]:not([class])){flex:none;padding:12px 0 10px;border:0;border-bottom:2px solid transparent;background:none;font:inherit;font-weight:600;color:inherit;opacity:.6;white-space:nowrap;cursor:pointer}
    :where([role="tablist"]:not([class]) [role="tab"][aria-selected="true"]:not([class])){opacity:1;border-bottom-color:currentColor}
    body.${P}ready{transition:padding .28s ease}   /* only a click moves the page; the first layout lands in place */
    body.${P}L-open:not(.${P}overL){padding-left:${L}px!important} body.${P}L-rail:not(.${P}tight){padding-left:${RAIL}px!important}
    body.${P}R-open:not(.${P}overR){padding-right:${R + 48}px!important} body.${P}R-rail:not(.${P}tight){padding-right:${RAIL}px!important}
    body.${P}overL.${P}L-open:not(.${P}tight){padding-left:${RAIL}px!important} body.${P}overR.${P}R-open:not(.${P}tight){padding-right:${RAIL}px!important}
    /* the notes column's 48 px gutter matched on the left, so a centred page sits centred between the two sidebars */
    body.${P}R-open:not(.${P}overR).${P}L-open{padding-left:${L + 48}px!important} body.${P}R-open:not(.${P}overR).${P}L-rail{padding-left:${RAIL + 48}px!important}
    body.${P}R-open:not(.${P}overR).${P}overL.${P}L-open{padding-left:${RAIL + 48}px!important}
    [data-note]{scroll-margin-top:24px}
    .${P}cue{animation:${P}cue 1.2s ease}
    mark.${P}mark.${P}cue,.${P}img.${P}cue{animation:${P}pulse .6s ease}
    mark.${P}mark[data-id^="q:"].${P}cue{animation-name:${P}pulseAg}
    @keyframes ${P}pulse{0%{box-shadow:0 0 0 0 var(--${P}ancOn)}40%{box-shadow:0 0 0 4px var(--${P}ancOn)}100%{box-shadow:0 0 0 0 transparent}}
    @keyframes ${P}pulseAg{0%{box-shadow:0 0 0 0 var(--${P}agOn)}40%{box-shadow:0 0 0 4px var(--${P}agOn)}100%{box-shadow:0 0 0 0 transparent}}
    @keyframes ${P}cue{0%,30%{background:var(--${P}ancOn)}100%{background:transparent}}
    html.${P}sb:not(.${P}tight){scrollbar-width:none} html.${P}sb:not(.${P}tight)::-webkit-scrollbar{display:none}
    .${P}sp{display:none} body.${P}R-open .${P}sp{display:block;height:var(--${P}foot,0px)}
  `);
  css(`
    .pn-root{display:contents}
    /* a column opened as a sheet (fitCols) lies over the page, which keeps its rail-width margin */
    .pn-overL.pnL-open .pnO,.pn-overR.pnR-open .pnN,.pn-overR.pnR-open .pnN-bar{box-shadow:0 0 28px rgba(0,0,0,.22)}
    @media (max-width:${R + RAIL + 1}px){html.pn-overR.pnR-open .pnO{visibility:hidden}}   /* too narrow for both: the sheet covers the outline's rail */
    .pn-overR.pnR-open .pnN{max-width:calc(100vw - 1px)} .pn-overR.pnR-open :is(.pnN-bar,.pnN-row,.pnN-ov){max-width:100vw}   /* a sheet no wider than the window */

    /* left: the outline; it resets what a page's own nav styles (sticky, align-self:start, margins, box-sizing) would do to it */
    .pnO{position:fixed;top:0;left:0;bottom:0;z-index:2147482000;box-sizing:content-box;width:${L}px;height:auto;max-height:none;margin:0;align-self:stretch;justify-self:stretch;display:flex;flex-direction:column;background:var(--pn-side);border-right:1px solid var(--pn-hair);transition:width .28s ease}
    .pnL-rail .pnO{width:${RAIL}px}
    .pnO .hd{flex:none;display:flex;align-items:center;gap:4px;height:60px;padding:0 8px 0 20px;border-bottom:1px solid var(--pn-hair);background:#e9e9ec}
    :root:where(.pn-dark):not([data-theme="light"]) .pnO .hd{background:#171719}
    /* the tool's name heads the Outline, beside the mark, and opens the same About card the mark does (1.96.0; the user: "that
       title shouldn't even be there with the tooltip, it should just say 'human-feedback' and it should have the same tooltip
       as the icon hover"). The page's title had sat here since 1.85.0, cut to one line with its whole self in a tooltip */
    /* Editorial wordmark chosen 2026-11-11: the slash is part of the visible name; the marker keeps its graphite face. */
    .pnO-about{display:flex;align-items:center;gap:11px;flex:1;min-width:0;min-height:44px;margin:0;padding:0;border:0;
      background:none;cursor:pointer;color:var(--pn-ink);text-align:left}
    .pnO-about .ttl{min-width:0;font:500 21.5px/1.15 Georgia,"Times New Roman",serif;letter-spacing:-1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .pnO .hd .tg{flex:none;width:32px;height:36px;margin-left:auto}
    .pnO-about:hover .ttl{color:var(--pn-ink2)} .pnO-about:focus-visible{outline:2px solid var(--pn-ink2);outline-offset:-2px}
    /* the tool's mark, as on the tab: on every page, before human-feedback (the user's pick, A + C). Hugeicons HighlighterIcon with its tip filled since 1.96.0
       (the user: "change the icon for human-feedback to Hugeicons HighlighterIcon and fill the tip"); Edit02Icon until then */
    .pnO-mk{flex:none;display:grid;place-items:center;width:24px;height:24px;margin-right:0;border-radius:5.5px} .pnO-mk .pn-brand{display:block;width:100%;height:100%}
    .pnL-rail .pnO-about{display:none}
    /* about: the mark opens a card on who made the tool and how to reach them, on hover or a click (the user's pick, F6) */
    .pnO-mk{transition:box-shadow .15s} .pnO-about[aria-expanded=true] .pnO-mk{box-shadow:0 0 0 3px var(--pn-hair2)}
    .pnA{position:fixed;z-index:2147482100;width:316px;box-sizing:border-box;padding:16px 8px 8px;border-radius:var(--pn-R2);background:var(--pn-white);
      border:1px solid var(--pn-hair);box-shadow:0 12px 32px rgba(0,0,0,.14);opacity:0;visibility:hidden;transform:translateY(-4px);
      transition:opacity .16s ease,transform .16s ease,visibility 0s .16s}
    .pnA.on{opacity:1;visibility:visible;transform:none;transition:opacity .16s ease,transform .16s ease}
    .pnL-rail .pnA{display:none}
    .pnA h3{margin:0 12px 2px;font:600 15px/1.3 var(--pn-ui);color:var(--pn-ink)} .pnA h3 span{margin-left:6px;font-weight:400;color:var(--pn-muted)}
    .pnA p{margin:0 12px 8px;font:13.5px/1.45 var(--pn-ui);color:var(--pn-ink2)}
    .pnA .pnA-local{margin-top:12px;margin-bottom:2px;font-size:12px;color:var(--pn-muted)} .pnA .pnA-count{margin-top:0;font-size:12px;color:var(--pn-muted)}
    .pnA-count button{--pn-ln:#a9c1e6;appearance:none;border:0;background:none;padding:0;margin-left:6px;font:inherit;color:inherit;cursor:pointer;
      text-decoration:underline 1px var(--pn-ln);text-underline-offset:3px}
    .pnA-count button:hover{text-decoration-color:currentColor} .pnA-count button:focus-visible{outline:2px solid var(--pn-me);outline-offset:2px}
    /* its links in a plain reading style: the text's own ink, a
       thin soft blue underline that turns to the ink on hover, and a small arrow after the words for a new tab */
    .pnA a{--pn-ln:#a9c1e6;display:flex;align-items:center;gap:10px;padding:7px 12px;border-radius:var(--pn-R1);font:13.5px/1.3 var(--pn-ui);color:var(--pn-ink);text-decoration:none}
    .pnA a span{text-decoration:underline 1px var(--pn-ln);text-underline-offset:3px;transition:text-decoration-color .15s}
    .pnA a span::after{content:"";display:inline-block;width:.62em;height:.62em;margin-left:.3em;vertical-align:.08em;background:currentColor;opacity:.55;
      -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8 16 17 7M9 7h8v8'/%3E%3C/svg%3E") center/contain no-repeat;
              mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8 16 17 7M9 7h8v8'/%3E%3C/svg%3E") center/contain no-repeat}
    .pnA a:hover span{text-decoration-color:currentColor} .pnA a:focus-visible{outline:2px solid var(--pn-me);outline-offset:-2px}
    .pnA a .pn-ic{flex:none;width:18px;height:18px;color:var(--pn-muted);transition:color .15s} .pnA a:hover .pn-ic{color:var(--pn-ink)}
    .pnA .soon{margin:8px 12px 4px;padding-top:12px;border-top:1px solid var(--pn-hair)}
    .pnA .soon h4{margin:0 0 6px;font:600 13px/1.3 var(--pn-ui);color:var(--pn-muted)}
    .pnA .soon ul{margin:0;padding-left:18px;font:13.5px/1.45 var(--pn-ui);color:var(--pn-ink2)} .pnA .soon li+li{margin-top:4px}
    :root:where(.pn-dark):not([data-theme="light"]) .pnA a,:root:where(.pn-dark):not([data-theme="light"]) .pnA-count button{--pn-ln:#4a6a9c}
    @media (prefers-reduced-motion: reduce){.pnO-mk,.pnA,.pnA.on,.pnA a span,.pnA a .pn-ic{transition:none}}
    .pnL-rail .pnO .hd{padding:0 10px;justify-content:center}
    /* the list keeps its full width while the column slides, so no label rewraps on the way; it fades out as the column closes */
    .pnO{overflow:hidden} .pnO .ol{width:${L}px;box-sizing:border-box;transition:opacity .2s ease .06s,visibility 0s}
    .pnL-rail .pnO .ol{opacity:0;visibility:hidden;transition:opacity .14s ease,visibility 0s .14s}
    /* Round and thread navigation read left to right: arrows, count, then the secondary action. */
    .pnV-step{flex:1;min-width:0;display:flex;align-items:center;gap:2px}
    .pnV-step .pn-icb{width:30px;height:30px;color:var(--pn-ink2)} .pnV-step .pn-icb:hover{color:var(--pn-ink)}
    .pnV-step .pn-icb:disabled{opacity:.3;pointer-events:none}
    .pnV-step .pn-icb,.pnN-thr .pn-icb{flex:none}
    .pnR-rail .pnN-thr>.tl{order:-1}
    .pnN-thr .pos{min-width:44px;margin:0 4px;text-align:center;font:400 13px/1.4 var(--pn-ui);color:var(--pn-ink2);font-variant-numeric:tabular-nums}
    .pnO .ol{flex:1;min-height:0;overflow:auto;padding:8px 0 20px}
    /* the update shelf stays at the column's foot while its list scrolls */
    .pnU{flex:none;box-sizing:border-box;width:100%;padding:24px 22px;border-top:1px solid var(--pn-hair);background:var(--pn-side);font-family:var(--pn-ui)}
    .pnU h3{margin:0;font:600 16px/1.3 var(--pn-ui);color:var(--pn-del)}  /* the one red word on the shelf; its Copy button stays black */
    .pnU-ver{margin:6px 0 16px;font:13.5px/1.4 var(--pn-ui);color:var(--pn-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
    .pnU-ask{margin:0 0 16px;font:16px/1.4 var(--pn-ui);color:var(--pn-ink);user-select:text}
    .pnU-ask span{white-space:nowrap} .pnU .pn-btn{box-sizing:border-box;height:40px}
    .pnL-rail .pnU{display:none}
    .pnAppearance{flex:none;box-sizing:border-box;padding:12px 20px 15px;border-top:1px solid var(--pn-hair)}
    .pnL-rail .pnAppearance{display:none}
    .pnAppearance .modes{display:flex;gap:2px;padding:2px;border:1px solid var(--pn-hair2);border-radius:5.4px}
    .pnAppearance button{display:flex;align-items:center;justify-content:center;gap:5px;flex:1;min-width:0;height:29px;padding:0;
      border:0;border-radius:3px;background:none;color:var(--pn-ink2);font:500 12px/1 var(--pn-ui);cursor:pointer}
    .pnAppearance button:hover{background:var(--pn-hov);color:var(--pn-ink)}
    .pnAppearance button[aria-pressed="true"]{background:var(--pn-sel);color:var(--pn-ink);box-shadow:0 0 0 1px var(--pn-hair2)}
    .pnAppearance button:focus-visible{outline:2px solid var(--pn-me);outline-offset:-1px}
    .pnAppearance .glyph{display:grid;place-items:center;flex:none;width:16.2px;height:16.2px}
    .pnAppearance svg{width:16.2px;height:16.2px}
    /* At 18 px the crescent draws 17% more ink than the sun, and both moon glyphs sit low in their boxes. */
    .pnAppearance [data-mode="auto"] svg{width:15.3px;height:15.3px;translate:.75px -1.25px}
    .pnAppearance [data-mode="dark"] svg{width:15px;height:15px;translate:.9px -1px}
        /* hierarchy: a caption heads its section (largest, boldest, a gap above); a top-level part is medium; a part inside a
       caption or another part is smaller and lighter; the part in view is bold with a bar on its left edge. Tabs are captions
       too, at their place in the tree */
    .pnO .pn-cap{display:block;width:100%;margin-top:10px;font:600 14px/1.35 var(--pn-ui);color:var(--pn-ink);padding:8px 16px 8px 20px;border:0;background:none;text-align:left;cursor:pointer}
    .pnO .pn-cap:first-child{margin-top:0}
    .pnO .pn-cap:hover{background:var(--pn-hov)}
    .pnO .pn-cap,.pnO .r .nm>span,.pnO .r .nm::after{overflow-wrap:anywhere}   /* one long word breaks rather than push the column sideways, however deep its row */
    .pnO .pn-cap.pnO-sub{margin-top:4px;padding-top:6px;padding-bottom:6px;font-size:13.5px}   /* a caption inside a tab or section: still a heading, one step down */
    .pnO .r{display:flex;align-items:flex-start;gap:10px;width:100%;min-height:34px;margin:0;padding:8px 16px 8px 20px;border:0;background:none;text-align:left;font:13.5px/1.35 var(--pn-ui);color:var(--pn-ink2);cursor:pointer}
    .pnO .r:hover{background:var(--pn-hov)}
    .pnO .r:not(.pnO-sub){font-weight:500;color:var(--pn-ink)}
    /* prefixed: a page's own .sub rule (a subtitle's 24px margin) spread the nested rows apart */
    .pnO .r.pnO-sub{font-size:13px;min-height:30px;padding-top:6px;padding-bottom:6px}
    .pnO .r.here{color:var(--pn-ink);font-weight:600;box-shadow:inset 3px 0 0 var(--pn-ink)}
    .pnO .r .nm{flex:1;min-width:0;display:grid}
    .pnO .r .nm::after{content:attr(data-t);font-weight:600;visibility:hidden;grid-area:1/1}   /* bold text's size held, so the row in view never rewraps */
    .pnO .r .nm>span{grid-area:1/1}
    /* "badges should awyas be the same size": the number overlays the circle, through 999, without widening it. */
    .pnO .r .qd{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;box-sizing:border-box;margin-top:-2px;border-radius:50%;font:600 12px/22px var(--pn-ui);font-variant-numeric:tabular-nums;
      background:var(--pn-ink);color:var(--pn-white);transition:filter .15s}
    .pnO .r .qd>.pn-total-number,.pn-total-badge>.pn-total-number{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
    .pnO .r .qd.pn-three{font-size:10px}
    @keyframes pnQdCue{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--pn-ink) 60%,transparent)}40%{box-shadow:0 0 0 5px color-mix(in srgb,var(--pn-ink) 30%,transparent)}100%{box-shadow:0 0 0 0 transparent}}
    .pnO .r .qd.pn-cue{animation:pnQdCue 1.2s ease}
    .pnO .r .qd:hover{filter:brightness(.92)}
    @media (prefers-reduced-motion: reduce){.pnO .r .qd.pn-cue{animation:none}}

    /* right: the notes column, as long as the page, so each row sits beside its part */
    .pnN{position:absolute;top:0;right:0;box-sizing:content-box;margin:0;width:${R}px;z-index:2147481000;background:var(--pn-side);border-left:1px solid var(--pn-hair);transition:width .28s ease}
    .pnR-rail .pnN{width:${RAIL}px}
    .pnN-bar{position:fixed;top:0;right:0;box-sizing:border-box;width:${R + 1}px;z-index:2147482000;display:flex;align-items:center;gap:8px;height:60px;padding:0 8px 0 20px;
      background:var(--pn-side);border-left:1px solid var(--pn-hair);border-bottom:1px solid var(--pn-hair)}
    .pnN.slide{clip-path:inset(0) !important}
    .pnN-bar{overflow:hidden;justify-content:flex-end} .pnN-bar>*{flex:none}   /* sliding: the toggle stays at the right edge */
    /* a second line only while questions are open; the last answer folds it away */
    .pnN-bar.pn-questions{height:102px;padding-bottom:42px}
    .pn-questions:is([data-st=received],[data-st=updating]){height:116px;padding-bottom:56px}
    .pnN-bar .ttl{font:600 16px/1.4 var(--pn-ui);white-space:nowrap} .pnN-bar .sp{flex:1}
    .pnN-bar .ttl[data-round-date]{cursor:pointer;border-radius:4px}
    .pnN-bar .ttl[data-round-date]:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    .pnR-open .pnN-bar:has(>.pnV){
      display:grid;grid-template-columns:max-content minmax(0,1fr) max-content;column-gap:3px;padding-inline-start:8px
    }
    .pnR-open .pnN-bar > .pnV{grid-area:1/1;gap:2px}
    .pnR-open .pnN-bar > .pnV > .pn-icb,.pnR-open .pnN-bar > .pnV-act > .pnRp{width:26px}
    .pnN-bar .pnV .rn{display:inline-block;inline-size:var(--pn-round-digits);font-variant-numeric:tabular-nums}
    .pnN-bar .pnV .pnN-roll{vertical-align:baseline}
    .pnR-open .pnN-bar:has(>.pnV) > .sp{display:none}
    .pnR-open .pnN-bar:has(>.pnV) > .tg{grid-area:1/3}
    .pnR-open .pnN-bar:has(>.pnV) > :is(.pnV-act,.rcv){grid-area:1/2;justify-self:center}
    /* Replay is an icon like the arrows, centred between Next's centre and the Notes toggle's (the user, 2026-11-09: "center
       replay between the icons it's between"). Its column is centred between their edges, so it moves over by a quarter of
       the toggle's extra width (36px against Next's 26px). The status takes the same spot while it shows, and Done drops
       Replay for good ("when done i don't think we need a replay"). Replay is for a round that just took in the user's notes,
       so it goes once they copy ("i thin kwe only need the replay button once feedback has bene incorporated"). The state
       sits on the same centre ("converge on choice A, center it between the > and sidebar close icon"): Next's on the latest
       round, Latest's on an earlier one */
    .pnR-open .pnN-bar:has(>.pnV) > :is(.pnV-act,.rcv){translate:calc((36px - 26px) / 4) 0}
    /* centred by what's drawn, not by the buttons (the user, 2026-11-09: "i don't think they're centered between teh > and the
       column close icon when measured by where the icons actually are visually (not their padding etc)"): the toggle's
       panel is drawn wider than Next's thin chevron, so on the latest round Replay sits on its column's own centre and the
       state a hair right of it, which leaves the same drawn gap each side (measured within 0.3 px). On an earlier round »
       is drawn wide enough that the shift above already does */
    .pnR-open .pnN-bar:has(>.pnV):not(:has(.latest)) > .pnV-act{translate:none}
    .pnR-open .pnN-bar:has(>.pnV):not(:has(.latest)) > .rcv{translate:.5px 0}
    .pnN-bar > .pnV-act > .pnRp{margin:0}
    .pnN-bar:is([data-st=copied],[data-st=received],[data-st=updating],[data-st=done]) > .pnV-act,.pnN-bar.pn-done > .pnV-act{visibility:hidden}
    .pnN-bar:is([data-st=received],[data-st=updating],[data-st=done]) :is(.pnV,.pnV-act)>.pn-icb{color:inherit}
    .pnN-bar:is([data-st=received],[data-st=updating],[data-st=done]) :is(.pnV,.pnV-act)>.pn-icb:hover:not(:disabled){background:color-mix(in srgb,currentColor 14%,transparent)}
    .pnN-bar > .pnV-act:empty{display:none}
    /* glyph columns (the user, 2026-11-09: "fix spacing/alignment/margins/padding etc"): the round's ‹ and the threads' ‹
       start on the column's 20px text edge, where the Overall box and the Outline's mark start; the open-threads dot sits
       under the Notes toggle's centre; » sits as far from › as Round's words sit from their arrows */
    .pnR-open .pnN-bar:has(>.pnV){padding-inline-start:9.5px}
    .pnR-open .pnN-thr{padding-inline:7.5px 13px}
    .pnR-open .pnN-bar > .pnV > .latest{margin-inline-start:-7px}
    .pnN-thr{position:absolute;left:0;right:0;bottom:0;z-index:2;height:42px;display:flex;align-items:center;gap:2px;padding:0 8px;border-top:1px solid var(--pn-hair);background:var(--pn-side);color:var(--pn-ink)}
    .pnN-row>.h{position:relative;padding-left:0;padding-right:20px}
    .pn-open-dot{position:absolute;right:0;top:50%;transform:translateY(-50%);display:block;width:10px;height:10px;border-radius:50%;background:var(--pn-open)}
    .pn-loop-pop{position:fixed;z-index:2147483000;pointer-events:none;border-radius:50%;background:var(--pn-open)}
    :root{--pn-open:#965de4}
    :root:where(.pn-dark){--pn-open:#b18af1}
    .pnN-thr .tl{display:inline-flex;align-items:center;gap:7px}
    .pn-open-key{flex:none;display:inline-block;width:10px;height:10px;background:var(--pn-open);border-radius:50%}
    .pnO .r .qd{position:relative}
    .pn-badge-dot{position:absolute;right:-3px;top:-3px;width:8px;height:8px;border-radius:50%;background:var(--pn-open);box-shadow:0 0 0 2px var(--pn-side)}
    .pnR-rail .pnN-thr .tl{display:flex;flex-wrap:wrap;justify-content:center;gap:4px}
    .pnR-rail .pnN-thr .pos{white-space:normal;text-align:center;max-width:100%;line-height:1.4}
    .pnN-thr[hidden]{display:none}
    .pnN-thr .tl{flex:0 1 auto;min-width:0;font:500 13px/1.4 var(--pn-ui);white-space:nowrap;text-align:left;background:none;border:0;border-radius:8px;padding:5px 8px;margin:0 0 0 auto;color:inherit;cursor:pointer}
    /* the label takes the user to the first open question (the user: '"open questions" on top right should link to the first
       open question'). Hover is the soft grey the bar's other buttons take, not an
       underline (the user: 'hover state for "open questions" should be consistent with the style of the ui') */
    .pnN-thr .tl:hover:not(:disabled){background:var(--pn-hov)}
    .pnN-thr .tl:disabled{cursor:default}
    .pnN-thr .tl:focus-visible{outline:2px solid var(--pn-ink2);outline-offset:0}
    .pnN-thr .pn-icb{width:30px;height:30px;color:var(--pn-ink2)} .pnN-thr .pn-icb:hover{color:var(--pn-ink)}
    .pnN-thr .pn-icb:disabled{opacity:.3;cursor:default;pointer-events:none}
    /* The full toolbar shows the total; the rail shows the selected position. */
    .pnN-thr .pos{flex:none;white-space:nowrap;display:inline-grid;justify-items:center;font-variant-numeric:tabular-nums}
    .pnN-thr .pos>*{grid-area:1/1}
    .pnN-thr .pn-icb:focus-visible{outline:2px solid var(--pn-ink2);outline-offset:1px}
    .pnR-rail .pnN-bar{width:${RAIL + 1}px;flex-direction:column;height:auto;padding:12px 0 0;gap:6px}
    .pnR-rail .pnN-bar>:not(.tg,.cpi,.ttl,.rcv,.pnN-thr,.pnV){display:none}
    /* on the rail, Round small and grey over its number, and under it previous, the count and next, stacked */
    .pnR-rail .pnN-bar>.pnV{order:3;flex:none}
    .pnR-rail .pnN-bar>.pnV>.pn-icb{display:none}
    .pnR-rail .pnN-bar .ttl{display:flex;flex-direction:column;align-items:center;gap:2px;order:3;width:100%;margin:9px 0 10px}
    .pnR-rail .pnN-bar .ttl .rw{font:500 13px/1.4 var(--pn-ui);color:var(--pn-muted)} .pnR-rail .pnN-bar .ttl .rn{font-size:24px;line-height:1.2}
    .pnR-rail .pnN-thr{position:relative;order:4;flex-direction:column;height:auto;width:100%;padding:12px 0 10px;gap:3px}
    .pnR-rail .pnN-thr .tl{display:block;white-space:normal;text-align:center;font-size:12px;line-height:1.35;padding:4px 3px;margin:0;width:100%}
    .pnR-rail .pnN-thr .pos{margin:4px 0;font-size:11px}
    .pnR-open .pnN-bar .cpi{display:none}
    /* the round's state: one slot right after Round N says where the round is, and changes in place (the user: "i don't like
       how "feedback received" replaces round number content, especially given rounds increment ... displaying as different
       indicators based on the given state ... so that current or important information is never hidden"; options B and
       R2 B). Nothing while the user writes, nor once the user has copied (1.143.0: the Copy button says it); Received ✓✓ once the agent has the user's paste, then after a beat Updating with a spinner while it makes the next
       version; Done with the circled check once it's called done (two ticks for Received, so it isn't Done's check: "it's
       weird that both received and done are checkboxes, can we distinguish?"). The ground says whose turn it is: light
       while the round is the user's, dark while the agent has it (light in dark mode, as the inks swap), green when done. Each
       change of ground is a crossfade in place under words that stay put, never a sweep ("is there a way to do it that's
       less annoying than constant wiping?" ... "i do like the fade"). The receipt's time is on hover */
    .pnN-bar{transition:width .28s ease,background ${GROUND}ms ease,color ${GROUND}ms ease,border-color ${GROUND}ms ease}
    .pnN-bar.pn-still{transition:width .28s ease}   /* a state loaded or followed from another tab, not arriving: no fade */
    .pnN-bar .rcv{display:flex;align-items:center;gap:7px;min-width:0;white-space:nowrap;font:500 14px/1.4 var(--pn-ui);color:inherit}
    .pnN-bar:not([data-st=copied]) .rcv:empty,.pnR-rail .pnN-bar .rcv:empty{display:none}
    .pnN-bar[data-st=copied] .rcv:empty{min-height:1.4em}   /* copied: an empty slot a line tall, where the cursor clicks Received in */
    .pnN-bar .rcv .pn-ic{flex:none;width:17px;height:17px}
    .pnN-bar[data-st=copied] .rcv{color:var(--pn-muted)}
    .pnN-bar:is([data-st=received],[data-st=updating]){background:var(--pn-ink);color:var(--pn-white)}
    .pnN-bar:is([data-st=received],[data-st=updating],[data-st=done]){backdrop-filter:none;-webkit-backdrop-filter:none}
    .pnN-bar:is([data-st=received],[data-st=updating],[data-st=done])>.pn-icb,.pnN-bar:is([data-st=received],[data-st=updating],[data-st=done])>.cpi .pn-icb{color:inherit}
    .pnN-bar:is([data-st=received],[data-st=updating],[data-st=done])>.pn-icb:hover,.pnN-bar:is([data-st=received],[data-st=updating],[data-st=done])>.cpi .pn-icb:hover{background:color-mix(in srgb,currentColor 14%,transparent)}
    /* Updating: the spinner the user picked (option B): Loading03 turning
       whole about its centre, a turn every .9 s, linear. It turns through the state's fade-in too: the fade below once took its
       place and left it still (the user: "the updated spinning animation doesnt' spin like our mockup, fix that") */
    .pnN-bar .rcv .pnN-spin{animation:pnSpin .9s linear infinite}
    @keyframes pnSpin{to{transform:rotate(360deg)}}
    /* a state arriving: its word and glyph fade in where the last one was, with the ground; Received's ticks and Done's
       check draw themselves, the last stroke after the first */
    .pnN-bar .rcv.in>*{animation:pnStIn ${GROUND}ms ease-out both}
    .pnN-bar .rcv.in>.pnN-spin{animation:pnStIn ${GROUND}ms ease-out both,pnSpin .9s linear infinite}
    @keyframes pnStIn{from{opacity:0}}
    .pnN-bar .rcv .pnN-draw>path{stroke-dasharray:1}
    .pnN-bar .rcv.in .pnN-draw>path{animation:pnRcvDraw .3s cubic-bezier(.3,0,.2,1) ${DRAW_AT}ms both}
    .pnN-bar .rcv.in .pnN-draw>path:last-child{animation-duration:.2s;animation-delay:${DRAW_AT + 210}ms}
    @keyframes pnRcvDraw{from{stroke-dashoffset:1}}
    /* collapsed: Round small over its number, always, and the state's glyph under it; on the dark and green grounds Round
       takes 70% of their ink, so it stays readable there */
    .pnR-rail .pnN-bar>.rcv{order:3;flex-direction:column;margin:-8px 0 10px}
    .pnR-rail .pnN-bar .rcv .pnN-sw{display:none}
    .pnR-rail .pnN-bar .rcv .pn-ic{width:20px;height:20px}
    .pnR-rail .pnN-bar:is([data-st=received],[data-st=updating],[data-st=done]) .ttl .rw{color:color-mix(in srgb,currentColor 70%,transparent)}
    /* a receipt that lands while the tab is out of view waits for the user (the user: "i like the delay until i come back if i left.
       if i didnt' leave then immedeiadiately"): until the user is back, the bar still reads Copied */
    @media (prefers-reduced-motion: reduce){.pnN-bar{transition:width .28s ease}.pnN-bar .rcv.in>*,.pnN-bar .rcv .pnN-spin,.pnN-bar .rcv.in>.pnN-spin,.pnN-bar .rcv.in .pnN-draw>path{animation:none}}
    /* done: the agent decided you've converged. The bar turns the ✅ sticker's green and its slot reads Done, a summary
       covers the notes down to Copy and Unlock, and the stepper stays as it was (the user's pick, round 3). Its arrival: the green fades in, the check draws, and as it
       finishes two rings burst from it, the held ✅'s, white where they cross the green (rings below; the user: "green bg with
       green circle animation is green on green which means you can't see it, fix") */
    .pnN-bar[data-st=done]{background:#30b456;color:#fff}
    .pnN-bar.pn-done>.cpi{display:none} .pnN-bar .cpi .pn-icb:disabled{opacity:.35;pointer-events:none} .pn-past .pnN-bar>.cpi,.pn-past .pnN-ov .pnF-at{display:none}
    /* the summary: What we did, Final file, Next steps; section headings in Codex's style, each with its icon left of it */
    .pnN-done{position:fixed;right:0;top:102px;bottom:0;width:${R + 1}px;box-sizing:border-box;z-index:2147481900;overflow-y:auto;overscroll-behavior:contain;
      padding:24px 20px 28px;background:var(--pn-side);border-left:1px solid var(--pn-hair);display:none;scrollbar-width:thin;font:400 15px/1.55 var(--pn-ui);color:var(--pn-text)}
    .pn-done .pnN-done{display:block} .pnR-rail .pnN-done{display:none}
    /* under Done the threads are covered and none should be open, so the Open questions row would have no job: the
       bar goes back to one line and the summary starts under it; Unlock restores any open questions */
    .pn-done.pnR-open .pnN-bar{height:102px;padding-bottom:42px} .pn-done.pnR-open .pnN-done{top:102px}
    .pn-done.pnR-open .pnN-links{display:none} .pn-done .pnN-ov .pnF-at{display:none}
    /* under Done the Overall box goes but for Copy and Unlock, and the summary runs down to them (the user: "the 'Overall
       feedback' box on bottom right should go away when col3 is done bc the rest of the feedback is hidden too"); Unlock
       brings it back with the user's words */
    .pn-done .pnN-ov>:not(.row){display:none} .pn-done .pnN-ov .row{margin-top:0}
    /* Copy does nothing under Done, so it goes and Unlock stands alone across the row */
    .pn-done .pnN-ov .row>.pn-btn.pri{display:none} .pn-done .pnN-ov .row>.pn-btn.un.on{flex:1 1 auto;max-width:100%;margin-left:0}
    .pn-done.pnR-open .pnN-row{visibility:hidden}   /* under the summary, rows don't draw: a row's sticker hung past the column's edge, beside it (the user: "fix the overlay bug that happens when the done sweep happens") */
    .pnN-done .pnD-mt{font-size:13px;color:var(--pn-muted);margin:0 0 10px;font-variant-numeric:tabular-nums}
    .pnN-done .pnD-g{margin:0 0 24px} .pnN-done .pnD-g+.pnD-g{border-top:1px solid var(--pn-hair);padding-top:22px}
    .pnN-done h2{display:flex;align-items:center;gap:8px;font:600 15px/1.4 var(--pn-ui);color:var(--pn-ink);margin:0 0 9px}
    .pnN-done h2 .pn-ic{width:18px;height:18px;flex:none;color:var(--pn-ink2)}
    .pnN-done p{margin:0;overflow-wrap:anywhere}
    .pnN-done ul{margin:0;padding-left:18px} .pnN-done li{margin:0 0 6px} .pnN-done li:last-child{margin:0}
    .pnN-done .pnD-fn{font-size:16px;font-weight:500;color:var(--pn-ink)}
    .pnN-done a{color:inherit;text-decoration:underline;text-decoration-color:color-mix(in srgb,var(--pn-me) 45%,transparent);text-underline-offset:4px}
    .pnN-done a:hover{text-decoration-color:var(--pn-me)}
    .pnN-done .pnD-path{font-size:13px;color:var(--pn-muted);margin-top:6px}
    .pnN-done>:last-child{margin-bottom:0}
    .pnN-done.in{animation:pnDnRise .32s cubic-bezier(.2,.7,.3,1) ${Math.round(GROUND * 0.4)}ms both}
    .pnN-done.out{display:block;animation:pnDnOut .2s ease both} .pnR-rail .pnN-done.out{display:none}   /* Unlock: the summary leaves */
    @keyframes pnDnOut{to{opacity:0}}
    @keyframes pnDnRise{from{opacity:0;transform:translateY(8px)}}
    @media (prefers-reduced-motion: reduce){.pnN-done.in{animation:none}}
    /* a new round: the first time the latest version is in view, the bar opens in the look the user left the last one in, its
       number and all: dark and Updating, or green and Done when it had been called done. After a beat that ground fades
       away and the number rolls up, odometer style, the old one leaving upward as the new one rises into its place (the user:
       "i'd rather see a round indicator increment animation at the appropriate time"; "i don't understand what happens
       between done and the next round though, that's part of the problem.. let's solve for that too") */
    .pnN-roll{display:inline-grid;overflow:hidden;vertical-align:top}
    .pnN-roll>span{grid-area:1/1;transition:transform ${ROLL}ms cubic-bezier(.65,0,.35,1),opacity ${ROLL}ms cubic-bezier(.65,0,.35,1)}
    .pnN-roll>:last-child{transform:translateY(100%);opacity:0}
    .pnN-roll.go>:first-child{transform:translateY(-100%);opacity:0} .pnN-roll.go>:last-child{transform:none;opacity:1}
    /* a thread stepped to from the bar: its bubble settles in once the scroll has stopped */
    .pnN-row .qb.pn-pick{animation:pnPick .24s ease-out}
    @keyframes pnPick{from{opacity:.55;transform:translateY(3px)}}
    @media (prefers-reduced-motion: reduce){.pnN-roll>span{transition:none}.pnN-row .qb.pn-pick{animation:none}}
    /* bottom right: the Overall note and Copy, always on screen */
    .pnN-ov{position:fixed;right:0;bottom:0;box-sizing:border-box;width:${R + 1}px;z-index:2147482000;padding:14px 20px 16px;
      background:color-mix(in srgb,var(--pn-side) 92%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-left:1px solid var(--pn-hair);border-top:1px solid var(--pn-hair)}
    .pnN-ov .pn-ta{min-height:calc(2 * 1.45em + 20px);max-height:30vh;overflow-y:auto;scrollbar-width:none} .pnN-ov .pn-ta::-webkit-scrollbar{display:none}
    .pnN-ov .row{display:flex;margin-top:12px}
    .pnN-ov .row .pn-btn{width:100%;height:46px;gap:8px;padding:0 12px 0 10px;border-radius:var(--pn-R1);font:600 15px/1 var(--pn-ui)}   /* near-black from .pri; inverts in dark mode */
    .pnN-row .lbl{font-size:12px;font-weight:600;color:var(--pn-muted)}
    /* a link in an agent's words to a part of the page (add_notes.py [[Part label]]): italic, so it reads as a section's name, with the
       outline's soft blue underline. Back to thread is a plain button (the user: "it's clear it's a section. like put it in italics.
       stop adding new weird stylings like the black underline, we need to be consistent throughout human-feedback") */
    .pn-go{--pn-ln:#a9c1e6;all:unset;font-style:italic;cursor:pointer;text-decoration:underline 1px var(--pn-ln);text-underline-offset:3px}
    .pn-go:focus-visible{outline:2px solid var(--pn-me);outline-offset:2px}
    @media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .pn-go{--pn-ln:#4a6a9c}}
    .pnN-ov>.pn-btn.pn-bk{width:100%;margin:0 0 12px}
    .pn-done .pnN-ov>.pn-btn.pn-bk:not([hidden]){display:flex}
    .pn-btn.pn-bk[hidden]{display:none}
    .pnN-ov .lbl{font:600 15px/1.4 var(--pn-ui);color:var(--pn-ink);margin-bottom:9px}   /* a section heading, like What we did */
    /* sent: Copy again in grey, Unlock sliding in beside it */
    .pnN-ov .row>.pn-btn.pri{flex:1 1 auto;width:auto;transition:background .2s ease,color .2s ease,border-color .2s ease}
    .pnN-ov .row>.pn-btn.pri.again{background:var(--pn-bub);border-color:var(--pn-bub);color:var(--pn-ink)}
    .pnN-ov .row>.pn-btn.pri.again:hover{background:#e2e2e6;border-color:#e2e2e6}
    .pnN-ov .row>.pn-btn.pri.anyway,.pnN-ov .row>.pn-btn.pri.anyway.again{background:var(--pn-del);border-color:var(--pn-del);color:#fff}
    .pnN-ov .row>.pn-btn.pri.anyway:hover{background:var(--pn-delh);border-color:var(--pn-delh)}
    :root:where(.pn-dark):not([data-theme="light"]) .pnN-ov .row>.pn-btn.pri.anyway{color:#1d1d1f}
    .pnN-ov .row>.pn-btn.un{flex:none;width:auto;max-width:0;margin-left:0;padding:0;border-width:0;opacity:0;overflow:hidden;
      transition:max-width .28s cubic-bezier(.4,0,.2,1),margin .28s cubic-bezier(.4,0,.2,1),padding .28s cubic-bezier(.4,0,.2,1),border-width 0s .28s,opacity .16s ease}
    .pnN-ov .row>.pn-btn.un.on{max-width:160px;margin-left:6px;padding:0 12px 0 10px;border-width:1px;opacity:1;
      transition:max-width .28s cubic-bezier(.4,0,.2,1),margin .28s cubic-bezier(.4,0,.2,1),padding .28s cubic-bezier(.4,0,.2,1),border-width 0s,opacity .2s ease .08s}
    .pnN-ov .pn-ta{transition:background .25s ease,color .25s ease,border-color .25s ease,height .32s cubic-bezier(.4,0,.2,1)}
    .pnN-ov .pn-ta.sent{background:var(--pn-bub);color:var(--pn-text);border-color:transparent;cursor:default}   /* sent: grey, read-only, the user's words in normal ink (1.80.0) */
    :where(.pn-dark) .pnN-ov .row>.pn-btn.pri.again:hover{background:#3a3a3d;border-color:#3a3a3d}
    /* the window's scrollbar, drawn at the page's right edge beside the notes column rather than past it; the native one is hidden.
       It sits under the notes column, so a row's sticker hanging over the column's edge is laid over the thumb, not under it */
    .pnSB{position:fixed;top:0;bottom:0;right:${R + 1}px;width:14px;z-index:2147480900;transition:right .28s ease}
    .pnR-rail .pnSB{right:${RAIL + 1}px} .pnSB.none{display:none}
    .pnSB i{position:absolute;right:3px;width:7px;min-height:32px;border-radius:4px;background:rgba(128,128,128,.55);transition:width .12s ease,background .12s ease}
    .pnSB:hover i,.pnSB.drag i{width:9px;background:rgba(128,128,128,.8)}
    /* top and bottom of the page: round buttons stacked at the page's bottom right, beside the scrollbar, each fading in
       place when it has nowhere to go (the user picked "A · Corner pair") */
    .pnTB{position:fixed;bottom:22px;right:${R + 1 + 14 + 10}px;z-index:2147480800;display:flex;flex-direction:column;gap:8px;transition:right .28s ease}
    .pnR-rail .pnTB{right:${RAIL + 1 + 14 + 10}px}
    .pnTB button{width:40px;height:40px;padding:0;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;
      border:1px solid var(--pn-hair);background:var(--pn-white);color:var(--pn-ink2);box-shadow:0 2px 10px rgba(0,0,0,.08);
      transition:opacity .2s ease,visibility 0s,color .15s,background .15s}
    .pnTB button:hover{color:var(--pn-ink);background:var(--pn-hov)}
    .pnTB button.off{opacity:0;visibility:hidden;pointer-events:none;transition:opacity .2s ease,visibility 0s .2s}
    @media (prefers-reduced-motion: reduce){.pnTB,.pnTB button,.pnTB button.off{transition:none}}
    /* closing, the rows and footer fade as the column slides shut; opening, they're uncovered in place as it slides open */
    .pnR-rail .pnN-ov,.pnR-rail .pnN-row{opacity:0;visibility:hidden;pointer-events:none;transition:opacity .14s ease,visibility 0s .14s}
    .pnN-ov{clip-path:inset(0 0 0 0);transition:clip-path .28s ease,opacity .2s ease .06s,visibility 0s}   /* slides with the column */
    .pnR-rail .pnN-ov{clip-path:inset(0 0 0 100%);transition:clip-path .28s ease,opacity .14s ease,visibility 0s .28s}
    .pnN-row.pin{position:fixed}   /* an Overall question held under the bar while the page scrolls (layout's pin) */
    .pnN-row{position:absolute;right:0;width:${R}px;box-sizing:border-box;padding:12px 16px 10px 20px;border-top:1px solid var(--pn-hair);border-bottom:1px solid var(--pn-hair);cursor:pointer;transition:background .15s,opacity .2s ease .06s,visibility 0s}
    .pnN-row:hover{background:color-mix(in srgb,var(--pn-white) 55%,transparent)}
    .pnN-row.sel{background:var(--pn-sel);z-index:1}
    /* the writing app's focus: with a row selected, the others' content dims slightly and hover restores it, so the white
       band stands out on a column only a shade darker (the user: "easier to see which box is selected"). Hairlines stay full */
    .pnN-row>*{transition:opacity .15s}
    .pn-thread-position{margin:0 0 6px;color:var(--pn-muted);font:600 13px/18px var(--pn-ui);font-variant-numeric:tabular-nums}
    .pnN:has(.pnN-row.sel) .pnN-row:not(.sel):not(.ew-sel):not(:hover)>:not(.pn-thread-position){opacity:.62}
    /* the writing app's folded rows: a row not selected keeps its label line, where it ties to the page, and one line each of
       quote and words, so many notes fit beside the text they're about; selecting one unfolds it */
    .pnN-row:not(.ask) .h{margin-bottom:2px}   /* the quote stays put as a row folds and unfolds */
    /* a row with nothing under its quote (a sticker on its own) unfolds only as far as a longer quote needs (the user: "it resizes at the bottom") */
    .pnN-row.bare .q{margin-bottom:0}
    /* a note's pictures sit where its quote goes, behind the same yellow edge, and join the quote when there is one */
    .pnN-row .qi{display:flex;flex-wrap:wrap;align-items:flex-start;gap:6px;border-left:3px solid #ecc23e;padding:2px 0 2px 10px;margin-bottom:6px}
    .pnN-row .qi:has(+ .q){margin-bottom:0;padding-bottom:6px}
    .pnN-row.bare .qi:not(:has(+ .q)){margin-bottom:0}
    /* the user's pictures and the user's bubble are one stack on the user's side, flush to one right edge, 4 px apart as the user's bubbles in a row
       are; a chip is as wide as its picture and name, no wider than the user's bubbles can be (88%). The same in a note, a thread,
       an answer and the Overall box (the user, on round 5: spacing and alignment "you can do better") */
    .pnF{display:flex;flex-direction:column;align-items:flex-end;gap:4px;margin:0 0 4px}
    .pnF-c{display:flex;align-items:center;gap:8px;max-width:88%;height:36px;padding:0 4px;border-radius:10px;background:var(--pn-bub);color:var(--pn-ink);font:500 13px/1.2 var(--pn-ui);text-decoration:none}
    .pnF-c.old{opacity:.55}
    /* a picture that can't be saved yet: a prompt where its chip will land, ink text with one glyph, no fill (1.84.0) */
    .pnF-ask{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:8px;margin:0 0 8px;color:var(--pn-ink);font:13px/1.45 var(--pn-ui);text-align:left}
    .pnF-ask>.pn-ic{width:18px;height:18px;margin-top:1px}
    .pnF-ask .say{grid-column:2;margin:0}
    .pnF-ask .what{grid-column:2;display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:8px;color:var(--pn-muted)}
    .pnF-ask .it{display:flex;align-items:center;gap:6px;min-width:0;max-width:100%;opacity:.65}
    :root:where(.pn-dark):not([data-theme="light"]) .pnF-ask .it{opacity:.8}   /* muted at .65 sank into the dark row (about 3:1) */
    .pnF-ask .it img{width:24px;height:24px;flex:none;object-fit:cover;border-radius:5px;border:1px solid var(--pn-hair);background:var(--pn-white)}
    .pnF-ask .it span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pnF-ask .acts{grid-column:2;display:flex;align-items:center;gap:14px;margin-top:10px} .pnF-ask.joined .acts{display:none}
    .pnF-ask.in{animation:pnStIn .25s ease-out backwards}
    .pnF-c.in{animation:pnLand .3s cubic-bezier(.2,.7,.25,1) backwards}
    @keyframes pnLand{from{opacity:0;translate:0 6px}}
    @media (prefers-reduced-motion: reduce){.pnF-ask.in,.pnF-c.in{animation:none}}
    .pnF-c img{width:28px;height:28px;flex:none;object-fit:cover;border-radius:6px;border:1px solid var(--pn-hair);background:var(--pn-white)}
    .pnF-c span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:6px}
    .pnF-c button,.pnF-at{width:26px;height:26px;flex:none;border:0;border-radius:50%;background:none;color:var(--pn-muted);display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer}
    .pnF-c button svg{width:14px;height:14px}
    /* saving: the chip is in at once, with Updating's spinner, small, in its remove button's place until the write ends */
    .pnF-sv{width:26px;height:26px;flex:none;display:flex;align-items:center;justify-content:center;color:var(--pn-muted)}
    .pnF-sv svg{width:14px;height:14px;animation:pnSpin .9s linear infinite}
    .pnF-c:not(.saving)>.pnF-sv,.pnF-c.saving>button{display:none}
    @media (prefers-reduced-motion: reduce){.pnF-sv svg{animation:none}}
    .pnF-c button:hover,.pnF-at:hover{background:var(--pn-hov);color:var(--pn-ink)}
    .pnN-ov .lbl{display:flex;align-items:center} .pnN-ov .lbl > span{flex:1}
    .pnF-at{width:28px;height:28px;margin:-7px -6px -7px 0} .pnF-at svg{width:18px;height:18px}
    .pnN-row.pnF-over,.pnN-ov .pn-ta.pnF-over{box-shadow:inset 0 0 0 2px var(--pn-me);background:color-mix(in srgb,var(--pn-me) 6%,var(--pn-white))}
    /* a dragged picture outlines every row and box that would take it */
    .pnN-row.pnF-can,.pnN-ov .pn-ta.pnF-can{outline:1.5px dashed var(--pn-me);outline-offset:-4px}
    /* the paperclip at the right end of a Comment or Reply box, level with its last line */
    .pnF-box{position:relative} .pnF-box>.pn-ta{padding-right:40px}
    .pnF-in{position:absolute;right:6px;bottom:6px;width:28px;height:28px;border:0;border-radius:50%;background:none;color:var(--pn-muted);display:flex;align-items:center;justify-content:center;padding:0;cursor:pointer}
    .pnF-in:hover{background:var(--pn-hov);color:var(--pn-ink)} .pnF-in svg{width:18px;height:18px}
    .pnN-toast .ic{display:none} .pnN-toast.cp{gap:8px} .pnN-toast.cp .ic{display:flex} .pnN-toast.cp button{display:none} .pnN-toast .ic svg{width:18px;height:18px}
    .pnN-row .qi img{display:block;width:auto;height:auto;max-width:100%;max-height:72px;margin:0;border:1px solid var(--pn-hair);border-radius:var(--pn-R0);object-fit:contain}
    .pnN-row.fold .qi img{max-height:40px}
    .pnN-row .qi span{font:13px/1.4 var(--pn-ui);color:var(--pn-muted)}
    .pnN-row.dm .qi{border-left-color:var(--pn-hair2)} .pnN-row.dm .qi img{opacity:.6}
    .pnN-row.fold .q{-webkit-line-clamp:1}
    .pnN-row.fold .b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .pnN-row .h{display:flex;align-items:center;gap:4px;min-height:28px;margin-bottom:6px}
    .pnN-row .lbl{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .pnN-row .ib{width:28px;height:28px;border-radius:50%;border:0;background:none;color:var(--pn-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;transition:opacity .12s}
    .pnN-row .ib svg{width:18px;height:18px}
    .pnN-row:hover .ib,.pnN-row.sel .ib,.pnN-row .ib:focus-visible{opacity:1}
    /* Pin content reactions to the callout's bottom right, with the same overhang as a message bubble.
       Keep room for the held size even before reacting, so the quote and comment don't move. */
    .pnN-row .pn-note-target{display:flex;align-items:center;gap:8px;border-inline-start:3px solid #ecc23e;padding-inline:10px 20px;margin-block-end:6px}
    .pn-note-target:has(>.pn-note-rx){position:relative;min-block-size:38px;padding-right:42px;margin-right:8px;margin-block-end:24px}
    .pnN-row.bare .pn-note-target{margin-block-end:0}
    .pnN-row.dm .pn-note-target{border-color:var(--pn-hair2)}
    .pn-note-target .pn-note-content{flex:1;min-inline-size:0;overflow-wrap:anywhere}
    .pnN-row .pn-note-content>:is(.q,.qi){border:0;padding-inline:0;margin-block:0}
    .pn-note-target .pn-note-rx{position:absolute;right:0;bottom:0}
    .pn-note-rx>.pn-stk{right:-14px;bottom:-11px;width:36px;height:36px;z-index:4}
    .pn-note-rx>.pn-stk.big{right:-17px;bottom:-17px;width:54px;height:54px}
    .pn-note-rx>.ib.rx{position:absolute;right:-11px;bottom:-8px;width:29px;height:29px;z-index:3;background:#fff;color:#8e8e93;transform:rotate(-8deg);
      box-shadow:0 0 0 2.5px #fff,0 1px 4px rgba(0,0,0,.22),0 0 0 3.5px rgba(0,0,0,.05)}
    .pn-note-rx>.ib.rx:hover{background:#fff;color:#1d1d1f;transform:rotate(-8deg) scale(1.08)}
    .pn-note-rx>.ib.rx svg{width:17px;height:17px}
    .pnN-row:focus-within .pn-note-rx>.ib.rx,.pn-note-rx>.ib.rx.open{opacity:1}
    .pn-note-rx.stuck>.ib.rx{visibility:hidden}
    :root:where(.pn-dark):not([data-theme="light"]) :is(.pn-note-rx,.pnN-row .qb)>.ib.rx{background:#3a3a3d;color:var(--pn-muted);
      box-shadow:0 0 0 2.5px #3a3a3d,0 1px 4px rgba(0,0,0,.5),0 0 0 3.5px rgba(255,255,255,.12)}
    :root:where(.pn-dark):not([data-theme="light"]) :is(.pn-note-rx,.pnN-row .qb)>.ib.rx:hover{background:#48484c;color:var(--pn-ink);
      box-shadow:0 0 0 2.5px #48484c,0 1px 4px rgba(0,0,0,.5),0 0 0 3.5px rgba(255,255,255,.16)}
    .pnN-row .ib:hover{background:var(--pn-hov);color:var(--pn-ink)}
    .pnN-row .q{font:14.5px/1.45 var(--pn-ui);color:var(--pn-text);border-left:3px solid #ecc23e;padding:1px 0 1px 10px;margin-bottom:6px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .pnN-row[data-id^="q:"] .q,.pnN-row[data-id^="q:"] .qi{border-left-color:var(--pn-agent)}
    /* "vertical margin bt the block quote and bubble 1 is the same as bubble 1 and bubble 2": a thread's 20 px,
       also above an agent's split reply, so the quote never crowds its first bubble. Nothing inside a bubble adds to its gap. */
    .pnN-row.ask>.q{margin-bottom:20px}
    /* the user's words are always on the right, like a chat (the user: "me on right"); the quote and the agent's questions stay on the left */
    .pnN-row .b{display:block;width:fit-content;max-width:88%;margin-left:auto;background:var(--pn-me);color:#fff;font-size:14.5px;line-height:1.45;padding:8px 12px 9px;border-radius:var(--pn-R2);border-top-right-radius:var(--pn-R0);white-space:pre-wrap;overflow-wrap:anywhere;cursor:text}
    .pnN-row .et{font:14.5px/1.45 var(--pn-ui);color:var(--pn-text);border-left:3px solid var(--pn-ins);padding:1px 0 1px 10px;white-space:pre-wrap;overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical}
    .pnN-row .row{display:flex;align-items:center;gap:14px;margin-top:10px}
    /* Delete, while the user edits one of the user's bubbles: a red link at the right end of Save and Cancel. A click swaps that row, at
       its height, for a one-line confirm: the question on the left, Cancel and a red Delete button where the link was, and
       the user's words struck through above it (the user's pick, Option A) */
    .pnN-row .row>.pn-lnk.pn-dl{margin-left:auto;color:var(--pn-del);transition:color .15s} .pnN-row .row>.pn-lnk.pn-dl:hover{color:var(--pn-delh)}
    .pnN-row .row.pn-cf{min-height:36px} .pnN-row .row.pn-cf.pn-swap{animation:pnSwap .2s ease-out}
    @keyframes pnSwap{from{opacity:0;transform:translateY(-3px)}}
    .pnN-row .pn-cfq{margin-right:auto;font:600 13px/1.3 var(--pn-ui);color:var(--pn-ink)}
    .pn-btn.pn-red{background:var(--pn-del);border-color:var(--pn-del);color:#fff} .pn-btn.pn-red:hover{background:var(--pn-delh);border-color:var(--pn-delh)}
    :root:where(.pn-dark):not([data-theme="light"]) .pn-btn.pn-red{color:#1d1d1f}   /* near-black on the light red, as the dark primary button */
    .pnN-row .pn-ta.doomed{color:var(--pn-muted);text-decoration:line-through;text-decoration-color:var(--pn-del);border-color:var(--pn-hair2)}
    @media (prefers-reduced-motion: reduce){.pnN-row .row.pn-cf.pn-swap{animation:none}}
    @keyframes pnPeel{to{transform:translate(14px,-22px) rotate(calc(var(--pn-tilt,0deg) + 40deg)) scale(.55);opacity:0}}
    .pn-stk.peel{animation:pnPeel .26s cubic-bezier(.5,0,.75,0) forwards;pointer-events:none}   /* lifts off a corner and flies away */
    .pnN-rx .rb.on{background:rgba(255,255,255,.22)}
    /* grown from a Sticker button: it's already where it lands, so no rise; its reactions come in from the button's end */
    .pnN-rx.grow{transform:none;transition:opacity .06s}
    .pnN-rx.grow.show .rb svg{animation-delay:0s}
    .pnN-rx.grow.show .rb:nth-last-of-type(2) svg{animation-delay:.03s} .pnN-rx.grow.show .rb:nth-last-of-type(3) svg{animation-delay:.06s}
    .pnN-rx.grow.show .rb:nth-last-of-type(4) svg{animation-delay:.09s} .pnN-rx.grow.show .rb:nth-last-of-type(5) svg{animation-delay:.12s}
    /* sent: what the user sent stays as it was, the way a chat app keeps a sent message readable and marks it with a receipt
       (the user, of the pale wash and a blur: "not sure i love blur ... what's trending/best practice?", then of ticks: "oh this
       is smart i think we should do ticks in addition to our other changes"; R2 C). The user's bubbles keep the user's blue and white words, their quotes their ink and edge, and the agent's words in a thread the user
       answered their ink; only the label dims, and a sent bubble takes no click and doesn't darken under the pointer. Each
       bubble that went has a tick in its bottom right corner (.tk, below); the user's notes from an earlier round quoted in a thread
       (.b.was) and the agent's done marks keep their own looks (1.80.0; through 1.79 a sent bubble took the pale wash of .was) */
    .pnN-row.old .b{cursor:default}
    .pnN-row.old .lbl{color:var(--pn-muted)}
    .pnN-row.dm .q,.pnN-row.old .et{color:var(--pn-muted);border-left-color:var(--pn-hair2)}
    /* the receipt: Tick02 once the user has copied it, TickDouble02 once the agent has the user's paste (add_notes.py --received) or on an
       earlier version, in the bubble's own white, level with its last line, and it pops in as it comes or turns to two. The
       bubble makes room for it at the end of its last line only, as WhatsApp fits its time and ticks: a spacer after the user's
       words, so they never run under it and wrap a line early only when the last line is full (the user, of option B: "do the same"; a 34 px strip down the
       whole bubble through 1.90.0). A folded bubble is one clipped line, so it keeps the strip */
    .pnN-row .b.tk-on{position:relative}
    .pnN-row .b.tk-on>span::after{content:'\\00a0';padding-left:18px}   /* a no-break space, so it wraps with the user's last word; an inline-block could wrap alone onto a line of its own (1.96.0) */
    .pnN-row.fold .b.tk-on{padding-right:34px} .pnN-row.fold .b.tk-on>span::after{display:none}
    .pnN-row .b>.tk{position:absolute;right:10px;bottom:10.5px;width:17px;height:17px;color:rgba(255,255,255,.78);pointer-events:none;line-height:0}
    .pnN-row .b>.tk svg{display:block;width:100%;height:100%}
    .pnN-row .b>.tk.in{animation:pnTk .25s cubic-bezier(.2,.7,.3,1) both}
    @keyframes pnTk{from{opacity:0;transform:scale(.6)}}
    @media (prefers-reduced-motion: reduce){.pnN-row .b>.tk.in{animation:none}}
    .pnN-row.ovp{cursor:default} .pnN-row.ovp:hover{background:none}
    /* a question: the agent's words on the left in grey, the user's reply on the right in the user's blue, like a chat. A
       pale wash of the agent's violet ran from 2026-11-08 to 2026-11-09, and the user turned it down (2026-11-09: "i don't
       like the purple bubbles. undo") */
    .pnN-row .qb{display:table;max-width:88%;background:var(--pn-bub);color:var(--pn-ink);font-size:14.5px;line-height:1.45;padding:8px 12px 9px;
      border-radius:var(--pn-R2);border-top-left-radius:var(--pn-R0);white-space:pre-wrap;overflow-wrap:anywhere}
    .pnN-row .b.re{margin-top:8px}
    /* the user's reaction to the agent's message sits on its bottom right corner, as a sticker (2026-10-21: "an emoji
       button on the bottom right of the message, and that's where the emoji would go"). The bubble makes room for it at the
       end of its last line only, as WhatsApp fits its time and ticks (option B, the user's pick; a 27 px strip down its whole right side
       through 1.90.0, which wrapped every line short): a spacer after the words, so no word sits under the sticker or the
       React button and the words wrap a line early only when the last line is full. A gap under it so the sticker stops
       short of what follows */
    .pn-pill .rb[hidden]{display:none}   /* Celebrate left out of an answer's picker: the buttons' own display hid nothing */
    .pnN-row .qb{position:relative}
    /* every message in a thread keeps the same 20 px under it, room for a reaction or a ✅ hanging off its corner whether or
       not one is on, so marks overlap their bubble's corner as iMessage's, WhatsApp's and Messenger's do and never change the
       space between messages (the user: "when there's an emoji, the vertical spacing between each message changes to make room
       for the emoji, i don't think that's a best practice"); the user's replies in a row stay grouped 4 px apart */
    .pnN-row.ask .qb{margin-bottom:20px} .pnN-row.ask .qb::after{content:'';display:inline-block;width:15px}
    .pnN-row.ask>.qb:has(+.pnF-box){margin-bottom:24px}
    .pnN-row.ask .qb:has(+.qb){margin-bottom:4px} .pnN-row.ask .qb:has(+.qb)::after{display:none} .pnN-row.ask .qb+.qb{border-top-left-radius:var(--pn-R2)}   /* "break things up into paragraphs" */
    .pnN-row.ask .b.re{margin-bottom:20px} .pnN-row.ask .b.re:has(+.b.re){margin-bottom:4px}
    /* always shown on an open thread, so the user can see reactions exist without pointing at the bubble (1.74.0) */
    .pnN-row .qb>.ib.rx{position:absolute;right:-11px;bottom:-8px;width:29px;height:29px;z-index:3;background:#fff;color:#8e8e93;transform:rotate(-8deg);opacity:1;
      box-shadow:0 0 0 2.5px #fff,0 1px 4px rgba(0,0,0,.22),0 0 0 3.5px rgba(0,0,0,.05);transition:opacity .15s ease,transform .15s cubic-bezier(.34,1.56,.64,1),color .15s}
    .pnN-row .qb>.ib.rx svg{width:17px;height:17px}
    .pnN-row .qb>.ib.rx:hover{background:#fff;color:#1d1d1f;transform:rotate(-8deg) scale(1.08)}
    .pnN-row:hover .qb>.ib.rx,.pnN-row.sel .qb>.ib.rx,.pnN-row:focus-within .qb>.ib.rx,.pnN-row .qb>.ib.rx.open{opacity:1}
    .pnN-row .qb.stuck>.ib.rx{visibility:hidden}
    .pnN-row .qb>.pn-stk{right:-14px;bottom:-11px;width:36px;height:36px;z-index:4}
    .pnN-row.old .qb>.pn-stk{cursor:default}
    .pnN-row.old .qb>.pn-stk:hover{transform:rotate(var(--pn-tilt,0deg))}
    /* the user's replies in a row group like a chat app's: 4 px apart, and only the first keeps the sharp top right corner
       (the user: "make it look like messaging apps like imessage do. make only the first one get the sharp top right corner") */
    .pnN-row .b.re+.b.re{margin-top:4px;border-top-right-radius:var(--pn-R2)}
    /* a note split by its blank lines, as the agent's replies are: bubbles 4 px apart, the later ones square at the top corner, the room under the last as a single bubble has */
    .pnN-row .b.sp+.b.sp{margin-top:4px;border-top-right-radius:var(--pn-R2)} .pnN-row .b.sp:has(+.b.sp){margin-bottom:4px}
    /* what comes after the user's pictures (the user's bubble, the box the user is writing in) starts at their 4 px, not its own top margin */
    .pnN-row>:is(.pnF,.pnF-ask)+:is(.b,.pnF-box,.pnF-ask),.pnN-row>:is(.pnF,.pnF-ask)+.pnF-box>.pn-ta{margin-top:0}
    .pnN-row:not(.old)>.b:not(.was){transition:filter .12s}
    .pnN-row:not(.old)>.b:not(.was):hover{filter:brightness(.92)}   /* the user's bubble darkens under the pointer: a click rewrites it */
    .pnN-row .qk{width:34px;height:34px} .pnN-row .qk svg{display:block;width:100%;height:100%} .pnN-row.old .qk{opacity:.6}   /* a done mark: the agent's ✅, the check sticker's art */
    /* A done check shares the reaction's size and vertical overlap (.qb>.pn-stk). On the left it sits
       outside the text padding, so it clears the last line without widening or lengthening the user's bubble. */
    .pnN-row .b.tb{position:relative;margin-bottom:20px}
    .pnN-row .b.tb>.qk{position:absolute;left:-24px;bottom:-11px;width:36px;height:36px;line-height:0;transform:rotate(8deg);z-index:2}
    /* a done mark with no words of the user's to sit on: on the row's bottom left corner, as the user's sticker sits on its bottom right */
    .pnN-row>.qk{position:absolute;left:10px;bottom:-24px;width:42px;height:42px;z-index:2} .pnN-row:has(>.qk)>.q{margin-bottom:10px}
    .pnN-row .b.tb>.qk svg,.pnN-row>.qk svg{overflow:visible;filter:drop-shadow(0 1px 1px rgba(0,0,0,.24)) drop-shadow(0 3px 5px rgba(0,0,0,.14))}
    /* the user's earlier note in a pale wash of the user's blue; the agent's bubbles stay grey */
    .pnN-row .b.was{background:color-mix(in srgb,var(--pn-me) 13%,var(--pn-white));color:var(--pn-ink2);cursor:default;margin-bottom:20px}   /* a thread's 20 px, as .qb */
    .pnN-row .b.was .pn-gist{display:block;margin-top:4px;font-size:12px;color:inherit;text-decoration:underline}   /* "condense what I say" */
    /* New marks a question first asked this round, and stays when the user answers it */
    .pnN-row>.new,.pnN-row>.h>.new{margin-bottom:8px;flex:none;display:inline-flex;align-items:center;height:17px;padding:0 7px;border-radius:9px;background:var(--pn-ink);color:var(--pn-white);font:600 12px/17px var(--pn-ui)}
    .pnN-row .b.pn-in{animation:pnRise .28s cubic-bezier(.2,.7,.25,1) backwards}   /* a new bubble slides up into place, as in the writing app's chat */
    @keyframes pnRise{from{opacity:0;translate:0 10px}}
    @media (prefers-reduced-motion: reduce){.pnN-row .b.pn-in{animation:none}}
    .pnN-row textarea.re{margin-top:8px}
    .pnN-row.dm .qb{color:var(--pn-muted)}
    /* a thread the user answered in chat (add_notes.py --answered): the agent's question, then the user's words as the user's reply in the user's
       dimmed blue with the agent's ✅ on its corner, as a done mark has it, and "Answered in chat" under it; the label as it
       was. The first time the user sees it, the agent's cursor closes it (the cursor, below). Until the cursor reaches it, its
       Reply box is dimmed and takes no click (the user: "make sure i can't click and try replying to something that's about to
       get obsoleted by the animation"); the cursor clicks in, types the user's words, and leaves the box, which folds away as the user's
       bubble rises in with "Answered in chat" under it (the user: "the 'in chat' words should appear when my bubble is added
       with my response"); then it stamps the check on */
    .pnN-row.ew{transition:background .15s,box-shadow .2s,opacity .2s ease .06s,visibility 0s}
    .pnN-row.ew-sel{background:var(--pn-sel);box-shadow:0 0 18px rgba(0,0,0,.09);z-index:1}
    .pnN-row.ew .qb{margin-bottom:12px}   /* and the fold's 8: a thread's 20 px under it, sticker or not */
    .pnN-row .ew-f{display:grid;grid-template-rows:1fr;transition:grid-template-rows .4s ease-in-out,opacity .3s ease-in-out}
    .pnN-row .ew-f>div{min-height:0;overflow:hidden;transition:padding .4s ease-in-out}
    .pnN-row .ew-f.shut{grid-template-rows:0fr;opacity:0}
    .pnN-row .ew-box>div{padding-top:8px} .pnN-row .ew-box.shut>div{padding-top:0}
    .pnN-row .ew-ans>div{padding:8px 0 13px}   /* room for the check and its stamp, inside the fold */
    .pnN-row .ew-re{position:relative;min-height:40px;padding:9px 12px;border:1px solid var(--pn-hair2);border-radius:var(--pn-R1);background:var(--pn-white);
      color:var(--pn-muted);font:14.5px/1.45 var(--pn-ui);cursor:default;user-select:none;transition:border-color .2s ease,opacity .2s ease}
    .pnN-row.ew-live:not(.ew-sel) .ew-re{opacity:.45;cursor:not-allowed}   /* waiting for the cursor */
    .pnN-row .ew-re .tx{position:absolute;left:12px;right:12px;top:9px;color:var(--pn-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .pnN-row .ew-re .ph{transition:opacity .2s ease} .pnN-row .ew-re.typed .ph{opacity:0}
    .pnN-row .ew-re.focus{border-color:var(--pn-ink2)}
    .pnN-row .ew-re .cr{display:none;width:1.5px;height:17.4px;margin-left:1px;vertical-align:-3.3px;background:var(--pn-ink)}   /* the caret */
    .pnN-row .ew-re.focus .cr{display:inline-block} .pnN-row .ew-re.focus:not(.busy) .cr{animation:pnBlink 1.06s steps(1) infinite}
    @keyframes pnBlink{50%{opacity:0}}
    .pnN-row .ew-ans .b.was.tb{margin-bottom:0}
    .pnN-row .ew-src{margin-top:26px;font:500 13px/1.3 var(--pn-ui);color:var(--pn-muted);text-align:right}   /* clears the check hanging under a short bubble */
    .pnN-row.ew .qk{opacity:.6} .pnN-row.ew-live .qk{opacity:0}   /* the check is in the cursor's hand until stamped */
    .pnN-row .ew-ans .ew-rise{animation:pnRise .28s cubic-bezier(.2,.7,.25,1) both}
    .pnN-row .rg{position:absolute;box-sizing:border-box;border-radius:50%;border:2px solid #30b456;opacity:0;pointer-events:none}   /* the ring a stamped check sends out */
    .pnN-row.dm .lbl.pn-wi{animation:pnWordIn .18s ease-out} .pnN-row.dm .lbl.pn-wo{animation:pnWordOut .1s ease-in forwards}   /* its label turning to Done */
    .pnN-row.ew-still,.pnN-row.ew-still *{transition:none !important}   /* measuring its two heights */
    /* a question or reply of the agent's not yet arrived (postArrive): under its label, quote and the user's note,
       a one-line bubble with three dots typing in it, as a messaging app shows the other side typing, and no Reply box or
       Reply box yet. It takes no click till it arrives. On a first round it waits hidden (ph) until the cursor taps it in */
    .pnN-row.ty{pointer-events:none}
    .pnN-row.ph{pointer-events:none} .pnN-row.ph:not(.rp),.pnN-row.ph.rp>.qb{visibility:hidden}   /* a reply's row shows the user's note */
    .pnN-row .qb.ty{display:block;width:fit-content}
    .pnN-row .qb .td{display:inline-flex;align-items:center;gap:5px;height:21px;vertical-align:top}
    .pnN-row .qb .td i{width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.28;animation:pnDots 1.2s ease-in-out infinite;animation-delay:var(--pn-ph,0ms)}
    .pnN-row .qb .td i+i{animation-delay:calc(var(--pn-ph,0ms) + .15s)} .pnN-row .qb .td i+i+i{animation-delay:calc(var(--pn-ph,0ms) + .3s)}
    @keyframes pnDots{0%,60%,100%{opacity:.28}30%{opacity:.85}}
    @media (prefers-reduced-motion: reduce){.pnN-row .qb .td i{animation:none;opacity:.5}}
    @media (prefers-reduced-motion: reduce){.pnN-row.ew,.pnN-row.ew *{transition:none !important;animation:none !important}}
    .pnN-mk{position:absolute;left:10px;width:36px;height:36px;border-radius:50%;display:none;align-items:center;justify-content:center;border:0;background:var(--pn-white);color:var(--pn-me);box-shadow:0 1px 3px rgba(0,0,0,.12);cursor:pointer}
    .pn-rail-dot{position:absolute;right:1px;top:1px;width:8px;height:8px;border-radius:50%;background:var(--pn-open);box-shadow:0 0 0 2px var(--pn-side);pointer-events:none}
    .pnN-mk.wt{color:var(--pn-ink)} .pnN-mk.ans{color:var(--pn-muted)}
    .pnR-rail .pnN-mk{display:flex;animation:pnMkIn .2s ease .16s backwards}   /* the rail's markers arrive as it finishes closing */
    @keyframes pnMkIn{from{opacity:0;transform:scale(.6)}}
    .pnN-mk.stk{background:none;box-shadow:none;padding:0} .pnN-mk.stk svg{flex:none;width:34px;height:34px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.24)) drop-shadow(0 3px 5px rgba(0,0,0,.14))}
    .pnN-links{position:absolute;left:0;top:0;pointer-events:none;z-index:2147481500;overflow:visible}
    .pnN-links path{fill:none;stroke:#d9a81a;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;opacity:.85}
    .pnN-links circle{fill:#d9a81a}
    .pnN-links path.brk{stroke-width:3;opacity:1}
    .pnN-links.ed path{stroke:var(--pn-ins)} .pnN-links.ed circle{fill:var(--pn-ins)}
    /* an edit's removed words; not .b.was, the user's own note's bubble on a reply row */
    .pnN-row .was:not(.b){font:14.5px/1.45 var(--pn-ui);color:var(--pn-del);text-decoration:line-through;text-decoration-color:var(--pn-del);text-decoration-thickness:1.5px;
      padding:1px 0 1px 13px;margin-bottom:4px;white-space:pre-wrap;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}
    .pnN-row .was:not(.b) span{background:var(--pn-delbg);border-radius:2px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
    .pnN-toast{position:fixed;right:20px;bottom:20px;z-index:2147482500;display:flex;align-items:center;gap:14px;height:40px;padding:0 16px;border-radius:20px;background:#1d1d1f;color:#fff;font:500 13px/1 var(--pn-ui);
      box-shadow:0 8px 24px rgba(0,0,0,.18);opacity:0;transform:translateY(8px);pointer-events:none;transition:opacity .2s,transform .2s}
    .pnR-open .pnN-toast{bottom:calc(var(--pn-foot,0px) + 12px)}
    /* a long message (the attachment folder's) wraps, no wider than the notes column, its button kept on one line */
    .pnN-toast.wr{height:auto;min-height:40px;max-width:min(${R - 20}px,calc(100vw - 40px));box-sizing:border-box;padding:10px 16px;border-radius:14px}
    .pnN-toast.wr span{line-height:1.4} .pnN-toast.wr button{white-space:nowrap}
    .pnN-toast.show{opacity:1;transform:none;pointer-events:auto}
    .pnN-toast button{border:0;background:none;color:#87afff;font:600 13px/1 var(--pn-ui);cursor:pointer;padding:0}
    /* unanswered questions: an ink banner over Overall, unfolding clear of the picked question */
    .pnN-nz{display:grid;grid-template-rows:0fr;opacity:0;margin:0 -20px;
      transition:grid-template-rows .28s cubic-bezier(.4,0,.2,1),margin .28s cubic-bezier(.4,0,.2,1),opacity .18s ease}
    .pnN-ov.nz .pnN-nz{grid-template-rows:1fr;opacity:1;margin:-14px -20px 14px;
      transition:grid-template-rows .28s cubic-bezier(.4,0,.2,1),margin .28s cubic-bezier(.4,0,.2,1),opacity .2s ease .08s}
    .pnN-nz>div{min-height:0;overflow:hidden}
    .pnN-nz .in{display:grid;grid-template-columns:1fr;align-items:center;background:var(--pn-ink);color:var(--pn-white);padding:12px 20px 13px}
    .pnN-nz .t{display:flex;align-items:center;gap:8px;font:650 16px/1.3 var(--pn-ui)}
    .pnN-nz .t .pn-ic{flex:none;width:20px;height:20px}
    .pnN-nz .s{grid-column:1/-1;margin-top:3px;padding-left:28px;font:14px/1.4 var(--pn-ui);color:inherit}
    /* words that change in the banner and on Copy cross-fade: the old lift away, the new rise in */
    @keyframes pnWordIn{from{opacity:0;transform:translateY(4px)}}
    @keyframes pnWordOut{to{opacity:0;transform:translateY(-4px)}}
    .pnN-ov .row>.pn-btn>*{animation:pnWordIn .18s ease-out}
    .pnN-ov .pn-wi{animation:pnWordIn .18s ease-out}
    .pnN-ov .pn-wo,.pnN-ov .row>.pn-btn>.pn-wo{animation:pnWordOut .1s ease-in forwards}
    /* the Copy reminder's question cue, in the same ink as its Outline counts */
    @keyframes pnAskCue{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--pn-ink) 60%,transparent)}40%{box-shadow:0 0 0 6px color-mix(in srgb,var(--pn-ink) 28%,transparent)}100%{box-shadow:0 0 0 0 transparent}}
    .pnN-row .qb.pn-cue{animation:pnAskCue 1.2s ease}
    @media (prefers-reduced-motion: reduce){.pnN-nz,.pnN-ov.nz .pnN-nz{transition:none}
      .pnN-ov .pn-ta{transition:background .25s ease,color .25s ease,border-color .25s ease}
      .pnN-ov .row>.pn-btn>*,.pnN-ov .pn-wi,.pnN-ov .pn-wo,.pnN-ov .row>.pn-btn>.pn-wo,.pnN-row .qb.pn-cue{animation:none}}
  `);

  // the columns' open or collapsed state is one setting for every page, round and version
  const UIK = 'human-feedback:ui';
  let shared = null; try { shared = JSON.parse(localStorage.getItem(UIK)); } catch (e) { /* storage blocked */ }
  // pref is what the user chose; ui is what's showing, which a narrow window can hold back (fitCols)
  const pref = state.ui.v2 = { outline: true, notes: true, ...state.ui.v2, ...(shared || {}) };
  const ui = { ...pref };
  const keepUi = () => { try { localStorage.setItem(UIK, JSON.stringify({ outline: pref.outline, notes: pref.notes })); } catch (e) { /* storage blocked */ } };
  // a narrow window (a phone, a half-screen window) keeps the page at least 360 px wide: the two columns open one at a
  // time, and a column that would squeeze the page even alone opens over it as a sheet instead of pushing it aside. Both
  // start on their rails there, and a choice made in a sheet isn't kept for wider windows
  const MINW = 360;
  // tight: no room for the page with both columns open, or too short to hold a rail's buttons (a phone on its side). The
  // columns go altogether, the page takes the whole window, and a round button opens the notes column as a sheet. 480
  // clears every phone's landscape height and a laptop window's (the user: "should not display if it's unable to display with
  // the columns opened, not closed. so it needs to be much more aggressive in hiding it")
  const TIGHT_H = 480;
  const roomy = (l, r) => innerWidth - ((l ? L : RAIL) + (r ? R + 96 : RAIL)) * UI >= MINW;   // the CSS draws every px at UI
  const tight = () => !roomy(true, true) || innerHeight < TIGHT_H;
  const overL = () => tight() || !roomy(true, false), overR = () => tight() || !roomy(false, true);
  function fitCols() {
    const oL = overL(), oR = overR();
    rootCls('pn-tight', tight()); rootCls('pn-overL', oL); rootCls('pn-overR', oR);
    let l = pref.outline && !oL, r = pref.notes && !oR;
    if (l && r && !roomy(true, true)) l = false;   // the notes column stays, the outline goes to its rail
    return { l, r };
  }
  // a comment being typed when the page closed opens again as it was; an empty one is dropped
  state.notes.filter(blank).forEach((n) => state.notes.splice(state.notes.indexOf(n), 1));
  let editing = state.notes.find((n) => n.draft != null)?.id || null, sel = editing, animateLine = false, hold = null;
  // the open-threads reminder: showing, and the thread the user was sent to
  const nudge = { on: false, at: null, t: [] };
  const isEdit = (id) => typeof id === 'string' && id.startsWith('e:');

  // ---------- left: the outline ----------
  // the tab says it's a feedback page: the same mark in place of the page's own icon, and Feedback before its title
  if (!/^Feedback · /.test(document.title)) document.title = 'Feedback · ' + (document.title || PN.PAGE.split('/').pop());
  document.querySelectorAll('link[rel~="icon"]').forEach((l) => l.remove());
  document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'icon', href: 'data:image/svg+xml,' + encodeURIComponent(brandIcon('hf-tab')) }));
  const out = el(`<nav class="pn-ui pnO"><div class="hd"><button type="button" class="pnO-about" aria-label="About human-feedback" aria-haspopup="dialog" aria-expanded="false"><span class="pnO-mk" aria-hidden="true">${brandIcon('hf-outline')}</span><span class="ttl">/human-feedback</span></button><button type="button" class="pn-icb tg"></button></div><div class="ol"></div></nav>`);
  WRAP.appendChild(out);
  const APPEARANCE = document.currentScript.dataset.appearance;
  const HAS_APPEARANCE = APPEARANCE === 'sidebars' || APPEARANCE === 'page';
  const MODES = { auto: ['Auto', 'SunMoonIcon'], light: ['Light', 'Sun03Icon'], dark: ['Dark', 'Moon02Icon'] };
  // Chrome's local files can share a storage area. Use the first round's full path to separate reviews in different folders.
  function appearancePath() {
    const first = V?.list[0];
    if (!first?.file) return location.pathname || PN.PAGE;
    try { return new URL(first.file.split('/').map(encodeURIComponent).join('/'), location.href).pathname; }
    catch (e) { return first.page || PN.PAGE; }
  }
  const APPEARANCE_KEY = 'human-feedback:appearance/' + appearancePath();
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  const knownMode = (value) => Object.hasOwn(MODES, value) ? value : 'auto';
  let appearanceMode = 'auto';
  if (HAS_APPEARANCE) try { appearanceMode = knownMode(localStorage.getItem(APPEARANCE_KEY)); } catch (e) { /* storage blocked */ }
  const pageAppearance = () => APPEARANCE === 'page' && appearanceMode !== 'auto' ? appearanceMode : '';
  const appearance = HAS_APPEARANCE ? el(`<div class="pnAppearance"><div class="modes" role="group" aria-label="Appearance">${Object.entries(MODES).map(([mode, [label, glyph]]) =>
    `<button type="button" data-mode="${mode}" aria-pressed="${mode === appearanceMode}"${mode === 'auto' ? ' title="Follow system appearance"' : ''}><span class="glyph">${icon(glyph)}</span>${label}</button>`).join('')}</div></div>`) : null;
  if (appearance) {
    out.appendChild(appearance);
    appearance.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      appearanceMode = button.dataset.mode;
      try { localStorage.setItem(APPEARANCE_KEY, appearanceMode); } catch (e) { /* use the in-memory choice */ }
      theme(); rematch();
    });
    addEventListener('storage', (event) => {
      if (event.key !== APPEARANCE_KEY) return;
      appearanceMode = knownMode(event.newValue);
      theme(); rematch();
    });
  }
  const otg = out.querySelector('.tg');

  // ---------- about: hovering the mark, or /human-feedback beside it, opens a card on who made the tool; a click pins it
  // open, and Esc, a click elsewhere or leaving both closes it. The repo links point at the public repo before it exists
  // (the user: "if the link doesn't work yet that's ok"). `soon` lists what's on the way, plain benefits with no
  // dates: picture attachments come out of the plugin build until they're ready, and wait here meanwhile (README, "Turning
  // it into a plugin"). Each item shows only while its feature is off on this page, so a page with pictures on never
  // offers them as coming; the rest (team review, notes kept across browsers, pages shared online; the user, 2026-11-11:
  // "Multiplayer (team) support, Persistent notes so that they aren't lost if you switch browsers, cloud/artifact support")
  // aren't built anywhere yet, so they always show. `version` matches SKILL.md (scripts/test_about_version.py checks) ----------
  const ABOUT = { version: '1.147.7', repo: 'https://github.com/jasonericsiegel/human-feedback', linkedin: 'https://www.linkedin.com/in/jasonericsiegel',
    github: 'https://github.com/jasonericsiegel', soon: [['Attach screenshots to your notes', !PN.PICTURES], ['Review with your team', true],
      ['Keep your notes when you switch browsers', true]].filter(([, off]) => off).map(([s]) => s) };
  // ---------- anonymous counts: local installs only, sent once and forgotten ----------
  const ANALYTICS_URL = '';
  const counterUrl = document.currentScript.getAttribute('data-analytics-url') ?? ANALYTICS_URL;
  const countingDefault = document.currentScript.dataset.localReview === '1' ? 'off' : 'on';
  const counterAgent = (document.currentScript.dataset.agent || '').replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 40) || 'unknown';
  const COUNTING_KEY = 'human-feedback:counting', COPY_CODE_KEY = 'human-feedback:copy-code', PAGE_CODE_PREFIX = 'human-feedback:page-code/';
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  let countingBlocked = false;
  function usageOff() {
    if (countingBlocked) return true;
    try { return (localStorage.getItem(COUNTING_KEY) ?? countingDefault) === 'off'; } catch (e) { return true; }
  }
  function randomCode() {
    if (crypto.randomUUID) return crypto.randomUUID().toLowerCase();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }
  function sendUsage(event, counts) {
    if (!counterUrl || usageOff() || !(location.protocol === 'file:' || (location.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(location.hostname)))) return;
    try {
      // Page names identify a storage slot only. The value sent is independently random, never a name or its hash.
      const code = (key) => {
        let value = localStorage.getItem(key);
        if (!UUID_V4.test(value)) value = randomCode();
        localStorage.setItem(key, value);
        return localStorage.getItem(key) === value && UUID_V4.test(value) ? value : null;
      };
      const copy_code = code(COPY_CODE_KEY), page_code = code(PAGE_CODE_PREFIX + PN.COUNT_PAGE);
      if (!copy_code || !page_code) return;
      const data = { event, copy_code, page_code, agent: counterAgent, version: ABOUT.version };
      if (event === 'copied') {
        const fields = ['round', 'notes', 'edits', 'questions_answered', 'questions_open', 'replies_answered', 'agent_questions', 'agent_replies', 'agent_done', 'agent_carried', 'versions'];
        const whole = (n) => Number.isInteger(n) && n >= 0 && n <= 100000;
        if (!counts || !fields.every((k) => whole(counts[k])) || typeof counts.overall !== 'boolean' || typeof counts.copied_before !== 'boolean') return;
        fields.forEach((k) => { data[k] = counts[k]; });
        data.overall = counts.overall; data.copied_before = counts.copied_before;
        data.reactions = {};
        for (const key of ['check', 'up', 'heart', 'ask', 'down', 'party']) {
          if (!whole(counts.reactions?.[key])) return;
          data.reactions[key] = counts.reactions[key];
        }
      }
      fetch(counterUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(data), credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true }).catch(() => {});
    } catch (e) { /* storage, randomness and sending can fail silently */ }
  }
  PN.countCopied = (counts) => sendUsage('copied', counts);
  // its marks filled, from Hugeicons' own paths as the stickers are (the user: "give the modal icons appropriate fills";
  // ui-ux-principles, Glyphs): the star solid, GitHub's cat solid with its arm still a line, LinkedIn's tile solid with
  // its "in" cut out of it. The number is the solid shape's place among the icon's subpaths
  // Report a problem or idea takes the Comment button's speech bubble (the user, 2026-11-11, approving it: "k.let's make sure we
  // get the links to work"), so it no longer shares GitHub's cat with More of my work: the bubble solid, its two dots cut out
  // of it, the plus still a line. CUT names the subpaths drawn in the card's white
  const SOLID = { StarIcon: 0, Github01Icon: 1, Linkedin01Icon: 6, ChatAdd01Icon: 0 };
  const CUT = { Linkedin01Icon: () => true, ChatAdd01Icon: (i) => i >= 3 };
  const solid = (n) => {
    const subs = PN.pathsOf(n).flatMap((d) => d.split(/(?=M)/)), k = SOLID[n], cut = (i) => (CUT[n]?.(i) ? ' style="stroke:var(--pn-white)"' : '');
    const ink = subs.map((d, i) => (i === k ? '' : `<path d="${d}" fill="none" stroke="currentColor"${cut(i)}/>`)).join('');
    return `<svg class="pn-ic" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><g stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${subs[k]}" fill="currentColor" stroke="currentColor"/>${ink}</g></svg>`;
  };
  const aboutLink = (href, ic, words) => `<a href="${href}" target="_blank" rel="noopener">${solid(ic)}<span>${words}</span></a>`;
  const about = el(`<div class="pn-ui pnA" role="dialog" aria-label="About human-feedback"><h3>human-feedback<span>${ABOUT.version}</span></h3>
    <p>Made by Jason Eric Siegel. Found a problem or have an idea? I'd like to hear it.</p>
    ${aboutLink(ABOUT.repo + '/issues/new/choose', 'ChatAdd01Icon', 'Report a problem or idea')}${aboutLink(ABOUT.repo, 'StarIcon', 'Star it on GitHub')}${aboutLink(ABOUT.linkedin, 'Linkedin01Icon', 'Message me on LinkedIn')}${aboutLink(ABOUT.github, 'Github01Icon', 'More of my work on GitHub')}
    <p class="pnA-local">Your notes stay on this computer.</p><p class="pnA-count" hidden><span></span><button type="button"></button></p>
    ${ABOUT.soon.length ? `<div class="soon"><h4>Coming soon</h4><ul>${ABOUT.soon.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}</div>`);
  WRAP.appendChild(about);
  function paintUsage() {
    const off = usageOff();
    about.querySelector('.pnA-count span').textContent = off ? 'Usage counts are off.' : 'Sends anonymous usage counts. Nothing from your pages.';
    about.querySelector('.pnA-count button').textContent = off ? 'Turn on' : 'Turn off';
  }
  about.querySelector('.pnA-count button').addEventListener('click', () => {
    const on = usageOff(); countingBlocked = true;
    try {
      if (on && countingDefault === 'off') localStorage.setItem(COUNTING_KEY, 'on');
      else if (on) localStorage.removeItem(COUNTING_KEY);
      else {
        localStorage.setItem(COUNTING_KEY, 'off'); localStorage.removeItem(COPY_CODE_KEY);
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i); if (key?.startsWith(PAGE_CODE_PREFIX)) localStorage.removeItem(key);
        }
      }
      countingBlocked = false;
    } catch (e) { /* stays off for this visit if storage is blocked */ }
    paintUsage();
  });
  addEventListener('storage', (e) => { if (e.key === COUNTING_KEY || e.key === null) paintUsage(); });
  paintUsage();
  const aboutButton = out.querySelector('.pnO-about');
  let aboutT = 0, aboutPin = false;
  const aboutOn = () => about.classList.contains('on');
  function showAbout(on) {
    clearTimeout(aboutT); if (!on) aboutPin = false;
    if (on === aboutOn()) return;
    if (on) { const r = aboutButton.getBoundingClientRect(); about.style.top = r.bottom + 4 + 'px'; about.style.left = Math.max(8, r.left) + 'px'; }
    about.classList.toggle('on', on); aboutButton.setAttribute('aria-expanded', on);
  }
  [aboutButton, about].forEach((x) => {
    x.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') showAbout(true); });
    x.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch' || aboutPin) return;
      clearTimeout(aboutT); aboutT = setTimeout(() => showAbout(false), 260);
    });
  });
  aboutButton.onclick = () => { if (aboutPin && aboutOn()) showAbout(false); else { showAbout(true); aboutPin = true; } };
  addEventListener('pointerdown', (e) => { if (aboutOn() && !e.composedPath().some((n) => n === about || n === aboutButton)) showAbout(false); }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && aboutOn()) { const refocus = about.contains(ROOT.activeElement); showAbout(false); if (refocus) aboutButton.focus(); } }, true);

  // ---------- updates: a quiet shelf for the person who installed the local layer ----------
  const UPDATE_URL = 'https://raw.githubusercontent.com/jasonericsiegel/human-feedback/main/VERSION';
  const updateUrl = document.currentScript.getAttribute('data-update-url') ?? UPDATE_URL;
  const UPDATE_KEY = 'human-feedback:update';
  const updateVersion = (v) => typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v);
  function showUpdate(latest) {
    if (!updateVersion(latest)) return;
    const a = latest.split('.').map(Number), b = ABOUT.version.split('.').map(Number), at = a.findIndex((n, i) => n !== b[i]);
    if (at < 0 || a[at] < b[at]) return;
    const shelf = el(`<section class="pnU" aria-label="Update available"><h3>Update available</h3>
      <p class="pnU-ver">Installed ${ABOUT.version} · Latest ${latest}</p>
      <p class="pnU-ask">Ask your agent to update <span>human-feedback</span></p>
      <button type="button" class="pn-btn pri">${icon('Copy01Icon')}<span>Copy instruction for agent</span></button></section>`);
    const ask = shelf.querySelector('.pnU-ask'), button = shelf.querySelector('.pn-btn');
    button.addEventListener('click', async () => {
      const ok = await PN.copyText('Update the human-feedback skill to the latest version from https://github.com/jasonericsiegel/human-feedback.');
      if (!ok) {
        const range = document.createRange(), selection = ROOT.getSelection?.() || getSelection();
        range.selectNodeContents(ask); selection.removeAllRanges(); selection.addRange(range);
      }
      button.innerHTML = icon(ok ? 'Tick02Icon' : 'Cancel01Icon') + `<span>${ok ? 'Copied' : 'Select and copy the line'}</span>`;
      clearTimeout(button._t); button._t = setTimeout(() => { button.innerHTML = icon('Copy01Icon') + '<span>Copy instruction for agent</span>'; }, 2400);
    });
    out.insertBefore(shelf, appearance);
  }
  async function checkUpdate() {
    if (location.protocol !== 'file:') return;
    const now = new Date(), day = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    let cached = null; try { cached = JSON.parse(localStorage.getItem(UPDATE_KEY)); } catch (e) { /* storage blocked */ }
    if (cached?.day === day) { showUpdate(cached.latest); return; }
    const keep = (latest) => { try { localStorage.setItem(UPDATE_KEY, JSON.stringify({ day, latest })); } catch (e) { /* storage blocked */ } };
    keep(null);   // even a failed check counts for today, including a reload before its response
    try {
      const response = await fetch(updateUrl, { credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) return;
      const latest = (await response.text()).trim();
      if (!updateVersion(latest)) return;
      keep(latest); showUpdate(latest);
    } catch (e) { /* offline or unreadable: no shelf */ }
  }
  checkUpdate();

  function setOutline(open, auto) {
    ui.outline = open; if (!auto && !overL()) { pref.outline = open; save(); keepUi(); }
    if (open && ui.notes && !roomy(true, true)) setNotes(false, true);
    rootCls('pnL-open', open); rootCls('pnL-rail', !open);
    otg.innerHTML = icon(open ? 'PanelLeftOpenIcon' : 'PanelLeftCloseIcon');   // Hugeicons names the panel's state: Open draws ←, Close draws →
    otg.title = open ? 'Collapse' : 'Show outline';
    relayoutSoon();
  }
  otg.onclick = () => setOutline(!ui.outline);

  // the Outline's counts change in the same draw as the bar and the arriving bubble
  const QD = { shown: new Map(), ready: false, at: new Map(), log: [] };
  PN.badgeLog = QD.log;
  const QD_POP = 340;
  // an Outline row's depth: one step under a caption, and one for each part it sits inside (this page's or, in the wipe, an
  // earlier version's)
  // the Outline's rows in page order, each with its depth: captions (section headings outside any part), tabs and parts.
  // A tab is a level of the hierarchy: it sits where its panel sits on the page, and what's in the panel sits one level in,
  // so tabs at the top of the page are the top level and tabs in a section are that section's children. A section runs
  // until the next heading at its level, or the end of the <section> or <article> holding its heading
  function olItems(doc, isPart) {
    const heading = (n) => /^H[23]$/.test(n.tagName) && !n.closest('[data-note]'), items = [], levels = [{ el: doc.body, depth: 0, head: null }];
    const depthIn = (n, lv) => { let d = lv.depth + (lv.head ? 1 : 0); for (let a = n.parentElement?.closest('[data-note]'); a && lv.el.contains(a); a = a.parentElement?.closest('[data-note]')) d++; return d; };
    const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (n.closest('.pn-ui') ? NodeFilter.FILTER_REJECT : isPart(n) || tabPanel(n) || heading(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    for (let n; (n = walk.nextNode());) {
      while (!levels.at(-1).el.contains(n)) levels.pop();
      let lv = levels.at(-1);
      if (heading(n)) { items.push({ n, kind: 'cap', depth: lv.depth }); lv.head = n; continue; }
      if (tabPanel(n)) {
        const sec = lv.head?.closest('section,article'); if (sec && !sec.contains(n)) lv.head = null;
        const depth = depthIn(n, lv);
        items.push({ n, kind: 'tab', depth }); levels.push(lv = { el: n, depth: depth + 1, head: null });
        if (!isPart(n)) continue;   // a panel that's also a part: its tab, then the part one level in
      }
      items.push({ n, kind: 'part', depth: depthIn(n, lv) });
    }
    return items;
  }
  // a caption: the top level is the stylesheet's own; deeper, it's inset as a part's row is and steps down a size
  function olCap(name, depth) {
    return `<button type="button" class="pn-cap${depth ? ' pnO-sub' : ''}"${depth ? ` style="padding-left:${(20 + 12 * depth) * UI}px"` : ''}>${esc(name)}</button>`;
  }
  // a part's Outline row, inset by its depth; `attrs` and `end` are the live Outline's (its keys, its counts and badge)
  function olRow(label, depth, attrs = '', end = '') {
    return `<button type="button" class="r${depth ? ' pnO-sub' : ''}" style="padding-left:${(20 + 12 * depth) * UI}px"${attrs}><span class="nm" data-t="${esc(label)}"><span>${esc(label)}</span></span>${end}</button>`;
  }
  function outline() {
    const ol = out.querySelector('.ol'); const keep = ol.scrollTop;
    const beforeDots = new Map([...ol.querySelectorAll('.pn-badge-dot')].map((d) => [d.closest('.r').dataset.qk, d.getBoundingClientRect()])); ol.innerHTML = '';
    const parts = blocks(); const partEls = new Set(parts.map((p) => p.el)), labelAt = new Map(parts.map((p) => [p.el, p.label]));
    let caps = [];   // captions waiting for the part under them, which a jump to the caption marks
    // every row jumps to what it names: a caption to its heading, a part to the part
    const jump = (n, label) => { showPart(n); pin = label; spy(); goTo(n.getBoundingClientRect().top + scrollY - topCover(n) - 24, label); const h = /^H\d$/.test(n.tagName) ? n : n.querySelector('h1,h2,h3,h4') || n; h.classList.remove(P + 'cue'); void h.offsetWidth; h.classList.add(P + 'cue'); };
    PN.jump = jump;
    // questions on no part (or a part no longer on the page) head the list as Overall
    const asks = allThreads().map((t) => ({ ...(t.id.startsWith('q:') ? askBy(t.id.slice(2)) : noteOf(t.id)), block:partOfRow(t.id), _rowId:t.id }));
    const asksOn = (label) => asks.filter((a) => (label == null ? !parts.some((p) => p.label === a.block) : a.block === label));
    const waiting = (list) => list.filter((a) => a._rowId ? threadWaiting({ id:a._rowId }) : openQuestion(a));
    const outlineGo = (a) => a._rowId ? thrGo({ id:a._rowId, row:col.querySelector(`.pnN-row[data-id="${CSS.escape(a._rowId)}"]`) }) : askGo(a, true);
    const qd = (list, key) => qdHtml(qdNum(key, list.length), waiting(list).length > 0);
    const overall = asksOn(null);
    if (overall.length) {
      const r = el(`<button type="button" class="r" data-qk="o"><span class="nm" data-t="Overall"><span>Overall</span></span>${qd(overall, 'o')}</button>`);
      r.onclick = () => { const a = waiting(overall)[0]; if (a) outlineGo(a); else goTo(0); };
      ol.appendChild(r);
    }
    // section headings outside any part become captions, and so does each tab, by its name; every row is inset by its depth
    for (const { n, kind, depth } of olItems(document, (x) => partEls.has(x))) {
      if (kind !== 'part') { const tab = kind === 'tab', c = el(olCap((tab ? tabOf(n).textContent : PN.shownText(n)).trim(), depth)); c.panel = tab ? n : null; c.onclick = () => jump(n, c.pinTo); ol.appendChild(c); caps.push(c); continue; }
      const label = labelAt.get(n), onPart = asksOn(label);
      caps.forEach((c) => { if (!c.panel || c.panel.contains(n)) c.pinTo = label; }); caps = [];   // a tab marks only a part in its own panel
      const r = el(olRow(label, depth, ` data-label="${esc(label)}" data-qk="${esc('p:' + label)}"`, qd(onPart, 'p:' + label)));
      r.onclick = (e) => { const a = e.target.closest('.qd') && waiting(asksOn(label))[0]; if (a) { pin = label; spy(); outlineGo(a); } else jump(n, label); };
      ol.appendChild(r);
    }
    ol.scrollTop = keep;
    qdAfter();
    beforeDots.forEach((rect, key) => { if (!qdRow(key)?.querySelector('.pn-badge-dot')) popLoop(rect); });
    if (QD.ready) ol.querySelectorAll('.pn-badge-dot').forEach(dot => { const key=dot.closest('.r').dataset.qk; if (!beforeDots.has(key)) popLoopIn(dot,'section:'+key); });
    spy();
  }
  // ---------- new questions count as their bubbles land; carried questions count from the first draw, without a pop.
  // A rise pops in that same draw, never queued behind another badge. None under reduced motion ----------
  function openWords(k) { return `${k} open question${k > 1 ? 's' : ''}`; }
  function qdHtml(k, hasOpen = false) {
    if (!k) return '';
    const t = `${k} thread${k === 1 ? '' : 's'}${hasOpen ? ', with open threads' : ''}`;
    return `<span class="qd${k >= 100 ? ' pn-three' : ''}" role="img" title="${t}" aria-label="${t}"><span class="pn-total-number">${Math.min(k, 999)}</span>${hasOpen ? '<span class="pn-badge-dot" aria-hidden="true"></span>' : ''}</span>`;
  }
  function qdNum(key, k) {
    const s = QD.shown.get(key) || 0;
    QD.shown.set(key, k);
    if (k > s && QD.ready && !reduced()) QD.at.set(key, { t: performance.now(), fresh: !s, log: true });
    else if (k < s) QD.at.delete(key);
    return k;
  }
  const qdRow = (key) => [...out.querySelectorAll('.ol .r[data-qk]')].find((r) => r.dataset.qk === key);
  function qdAnim(b, fresh, t) {
    const a = b.animate(fresh ? [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.32)', opacity: 1, offset: 0.55 }, { transform: 'scale(.94)', offset: 0.8 }, { transform: 'scale(1)' }]
      : [{ transform: 'scale(1)' }, { transform: 'scale(1.32)', offset: 0.5 }, { transform: 'scale(.94)', offset: 0.8 }, { transform: 'scale(1)' }],
    { duration: QD_POP * SLOW, easing: 'cubic-bezier(.3,0,.3,1)' });
    if (t) a.currentTime = t;
  }
  // a redraw midway carries a pop on from where it was
  function qdAfter() {
    const now = performance.now();
    QD.at.forEach((p, key) => {
      const t = now - p.t; if (t >= QD_POP * SLOW) { QD.at.delete(key); return; }
      const b = qdRow(key)?.querySelector('.qd'); if (b) qdAnim(b, p.fresh, t);
      if (p.log && b) { p.log = false; if (QD.log.length < 200) QD.log.push({ t: Math.round(p.t), key, k: QD.shown.get(key), y: Math.round(b.getBoundingClientRect().top) }); }
    });
    QD.ready = true;
  }
  // how far down the window the page's own sticky or fixed header reaches once part n is at the top, so a jump lands
  // the part under it instead of beneath it. A sticky one counts only if its box starts above n and runs past it.
  function topCover(n) {
    const r = n.getBoundingClientRect(); let cover = 0;
    for (const x of document.body.querySelectorAll('*')) {
      if (x.closest('.pn-ui') || x.contains(n) || n.contains(x)) continue;
      const cs = getComputedStyle(x);
      if (cs.position !== 'sticky' && cs.position !== 'fixed') continue;
      const b = x.getBoundingClientRect();
      if (!b.height || cs.visibility === 'hidden' || b.height > innerHeight / 2 || b.right <= r.left || b.left >= r.right) continue;
      if (cs.position === 'fixed') { if (b.top <= 1 && b.bottom > 0) cover = Math.max(cover, b.bottom); continue; }
      const p = x.parentElement?.getBoundingClientRect(), t = parseFloat(cs.top);
      if (p && !Number.isNaN(t) && t < innerHeight / 2 && p.top <= r.top && p.bottom >= r.top + b.height) cover = Math.max(cover, t + b.height);
    }
    return cover;
  }
  // a tab's panel, named in the outline as a section heading is
  function tabPanel(n) { return n.matches('[role="tabpanel"]') && !!tabOf(n); }
  // the part in view is bold in the outline: the last one to reach a reading line just under where a jump lands it, the
  // first of a row of parts side by side. A part the user jumps to stays bold until the user scrolls or clicks elsewhere themselves:
  // short parts below it (table rows, cards side by side) reached the old line, 40% down, so the outline bolded a part
  // two or three rows past the one the user picked (the user: "scrolling is buggy … it goes to the wrong place")
  let pin = null, spyOn = null;   // spyOn: the outline row last marked, kept in view
  function spy() {
    const all = blocks().filter((p) => !away(p.el)), end = scrollY >= document.documentElement.scrollHeight - innerHeight - 2;
    const line = end ? innerHeight * 0.5 : Math.min(innerHeight * 0.4, 64);
    // the part across the reading line, the innermost when parts nest; once a part has scrolled up past the line, the
    // next one down is marked straight away rather than when it reaches the line, so the mark never trails the view
    let here = pin && all.some((p) => p.label === pin) ? pin : null, at = -Infinity, next = null, nt = Infinity;
    if (!here) all.forEach(({ el: b, label }) => {
      const r = b.getBoundingClientRect(); if (r.bottom <= line) return;
      if (r.top <= line) { if (r.top > at + 1) { here = label; at = r.top; } } else if (r.top < nt) { next = label; nt = r.top; }
    });
    // above the first part (the page's top, or the header's title clicked) the first part is marked, the Outline's top row
    // (the user: "being at top of document, or clicking top item on outline, doesn't select top item in outline")
    if (!here) here = next || all[all.length - 1]?.label || null;
    if (!pin && end && scrollY > 0) {   // scrolled to the end: the last part fully in view, which the line may never reach
      const fit = all.filter(({ el: b }) => { const r = b.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight + 1; });
      if (fit.length) here = fit[fit.length - 1].label;
    }
    out.querySelectorAll('.r').forEach((r) => r.classList.toggle('here', r.dataset.label === here));
    // the outline keeps its marked row in view as the mark moves, so Top and Bottom (or a long scroll) carry the outline
    // along (the user: "scroll to top/bottom buttons don't scroll the col1 when the highlight passes the bottom/top")
    const on = out.querySelector('.r.here');
    if (on && on !== spyOn) { spyOn = on; keepRow(on); }
  }
  function keepRow(r) {
    const ol = out.querySelector('.ol'), o = ol.getBoundingClientRect(), b = r.getBoundingClientRect(), pad = 24 * UI;
    const d = r === ol.firstElementChild ? -ol.scrollTop : b.top < o.top + pad ? b.top - o.top - pad : b.bottom > o.bottom - pad ? b.bottom - o.bottom + pad : 0;
    if (Math.abs(d) > 1) ol.scrollBy({ top: d, behavior: reduced() ? 'auto' : 'smooth' });
  }
  let spyRaf = 0; addEventListener('scroll', () => { cancelAnimationFrame(spyRaf); spyRaf = requestAnimationFrame(spy); }, { passive: true });
  const unpin = () => { if (pin) { pin = null; spy(); } };
  ['wheel', 'touchmove', 'keydown'].forEach((t) => addEventListener(t, unpin, { passive: true }));
  addEventListener('pointerdown', (e) => { if (!tgt(e).closest?.('.pnO')) unpin(); }, { passive: true });

  // ---------- right: the notes column ----------
  const col = el(`<div class="pn-ui pnN"></div>`); let slideT = 0;
  const bar = el(`<div class="pn-ui pnN-bar"><span class="ttl"><span class="rw">Round</span> <span class="rn">${V ? V.cur + 1 : PN.ROUND}</span></span><span class="rcv" role="status" aria-live="polite"></span><span class="sp"></span>
      <button type="button" class="pn-icb tg"></button><span class="cpi"></span>
      <div class="pnN-thr" hidden role="group" aria-label="Thread navigation"><button type="button" class="pn-icb pv" title="Previous thread (⌥↑)" aria-label="Previous thread">${icon('ArrowLeft01Icon')}</button>
        <span class="pos" aria-live="polite"></span>
        <button type="button" class="pn-icb nx" title="Next thread (⌥↓)" aria-label="Next thread">${icon('ArrowRight01Icon')}</button><button type="button" class="tl" title="First open thread">0 open threads</button></div></div>`);
  const roundTitle = bar.querySelector('.ttl');
  const roundNumber = roundTitle.querySelector('.rn');
  const roundAction = el('<span class="pnV-step pnV-act"></span>');
  if (V) {
    const { list, cur, last } = V, v = list[cur];
    const shelf = el(`<div class="pnV pnV-step" role="group" aria-label="Round">
        <button type="button" class="pn-icb prev" title="Previous round (←)" aria-label="Previous round">${icon('ArrowLeft01Icon')}</button>
        <button type="button" class="pn-icb next" title="Next round (→)" aria-label="Next round">${icon('ArrowRight01Icon')}</button>${cur < last ? `<button type="button" class="pn-icb latest" title="Latest round" aria-label="Latest round">${icon('LatestChevronIcon')}</button>` : ''}</div>`);
    roundNumber.style.setProperty('--pn-round-digits', String(list.length).length + 'ch');
    bar.prepend(shelf);
    shelf.insertBefore(roundTitle, shelf.querySelector('.next'));
    bar.insertBefore(roundAction, bar.querySelector('.tg'));
    // moving keeps the reader at the same depth in the page; the columns stay as they were, since that's one setting
    const VIEW = 'human-feedback:version-view';
    const go = (i) => {
      if (i < 0 || i > last || i === cur) return;
      try { sessionStorage.setItem(VIEW, JSON.stringify({ page: list[i].page, y: scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight) })); } catch (e) { /* storage blocked */ }
      location.href = list[i].file.split('/').map(encodeURIComponent).join('/');
    };
    try {
      const was = JSON.parse(sessionStorage.getItem(VIEW));
      if (was && was.page === v.page) {
        sessionStorage.removeItem(VIEW);
        const land = () => scrollTo(0, was.y * (document.documentElement.scrollHeight - innerHeight));
        requestAnimationFrame(() => requestAnimationFrame(land));
        if (document.readyState !== 'complete') addEventListener('load', land, { once: true });   // images arriving change the depth
      }
    } catch (e) { /* storage blocked */ }
    shelf.querySelector('.prev').disabled = cur === 0;
    shelf.querySelector('.next').disabled = cur === last;
    shelf.querySelector('.prev').onclick = () => go(cur - 1);
    shelf.querySelector('.next').onclick = () => go(cur + 1);
    shelf.querySelector('.latest')?.addEventListener('click', () => go(last));   // earlier rounds only (the user, 2026-11-09: ">> woudl only be on earlier rounds")
    addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || tgt(e).closest?.('textarea,input,select,[contenteditable]') || getSelection()?.toString()) return;
      if (e.key === 'ArrowLeft') go(cur - 1); else if (e.key === 'ArrowRight') go(cur + 1);
    });
  }

  css(`
    /* Keep row labels available to assistive technology without spending a line on them. */
    .pnN-row .lbl{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    .pnN-row>.h:not(:has(>.ib)){min-height:0;height:0;margin-bottom:0}
    .pnN-row>.h{justify-content:flex-end}
    .pnN-row>.h:has(>.new){min-height:17px;height:17px;margin-bottom:8px;justify-content:flex-start}
    .pnN-row>.h>.new{margin-bottom:0}
    .pnN-row>.h:has(>.new)>.pn-open-dot{top:50%}
    .pnN-row>.h>.pn-open-dot{top:11.5px}
    .pnN-row>.new+.h>.pn-open-dot{top:-17px}
    .pnN-row:has(>.h>.pn-open-dot)>.q{padding-right:20px}
    .pnN-row:has(>.h>.pn-open-dot):not(:has(>.q))>.b.was{margin-right:20px}
    .pn-loop-pop{background:none}
    .pn-loop-core,.pn-loop-ring{position:absolute;inset:0;box-sizing:border-box;border-radius:50%;pointer-events:none}
    .pn-loop-core,.pn-loop-spark{background:var(--pn-open)} .pn-loop-ring{border:2px solid var(--pn-open)}
    .pn-loop-spark{position:absolute;left:50%;top:50%;width:3px;height:3px;border-radius:50%}
    .pn-open-label{display:inline-flex;align-items:center;gap:10px}
    .pn-total-badge{position:relative;flex:none;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;box-sizing:border-box;border-radius:50%;background:var(--pn-ink);color:var(--pn-white);font:600 13px/24px var(--pn-ui);font-variant-numeric:tabular-nums}
    .pn-total-badge.pn-three{font-size:11px}
    .pn-badge-dot[hidden]{display:none} .pn-rail-total,.pnO-total,.pn-pos-compact{display:none}
    .pnL-rail .pnO-total{display:flex;justify-content:center;flex:none;padding:14px 0}
    .pn-overR.pnR-open :is(.pnN-links,.pnSB){display:none}
    .pnR-rail .pnN{overflow:hidden}
    .pnR-rail .pnN-thr>.tl{display:flex;align-items:center;justify-content:center;width:100%;margin:0;padding:5px 0}
    .pnR-rail .pnN-thr>.tl .pn-open-label{display:none}
    .pnR-rail .pnN-thr>.tl .pn-rail-total{display:inline-flex}
    .pnR-rail .pn-pos-full{display:none}.pnR-rail .pn-pos-compact{display:inline}
    .pnN-row.ask .qb>.pn-stk.big{width:54px;height:54px;right:-17px;bottom:-17px}
    .pnN-row.ask .qb:has(>.pn-stk.big){margin-bottom:20px}
    /* The last word carries the same clearance for every sticker; the spacer cannot wrap alone. */
    .pnN-row.ask .qb::after{content:'\\00a0';display:inline;width:auto;padding-left:28px}
    .pnN-row.ask .qb:has(>.pn-stk.big)::after{width:auto}
    .pnN-row:not(.ask) .b{margin-right:12px}
    .pnN-row:not(.ask):has(>.b)>:is(.pnF,.pnF-ask){margin-right:12px}
    .pnN-row:not(.ask){padding-bottom:28px}
    .pnN-row:not(.ask) .b{position:relative;overflow:visible}
    .pnN-row.fold:not(.ask) .b{white-space:normal;overflow:visible;text-overflow:clip}
    .pnN-row.fold:not(.ask) .b>span:first-child{display:block;box-sizing:border-box;width:100%;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    @media(max-width:700px){.pnL-rail .pnTB{left:${(RAIL - 40)/2}px;right:auto}}
    /* tight (fitCols): the rails go and the page takes the whole window. One round button stays, so notes and questions can
       still be reached; it opens the notes column as a sheet, and carries a dot while questions wait (the user: "responsive
       design and disappears if there isn't enough vertical room, so it's still mobile friendly") */
    .pn-tight.pnL-rail .pnO,.pn-tight.pnR-rail .pnN,.pn-tight .pnSB,.pn-tight .pnTB{display:none}
    .pn-tight.pnR-rail .pnN-bar{top:auto;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));width:42px;height:42px;padding:0;gap:0;justify-content:center;
      overflow:visible;border:1px solid var(--pn-hair);border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,.24)}
    .pn-tight.pnR-rail .pnN-bar>:not(.tg){display:none}
    .pn-tight.pnR-rail .pnN-bar.pn-questions::after{content:"";position:absolute;top:0;right:0;width:10px;height:10px;border-radius:50%;background:var(--pn-open);box-shadow:0 0 0 2px var(--pn-side)}
    /* a thread on a part in a closed tab waits with its part; stepping to it opens the tab (showPart) */
    .pnN-row.pn-away,.pnR-rail .pnN-mk.pn-away{display:none}
  `);
  const ovBox = el(`<div class="pn-ui pnN-ov"><div class="lbl"><span>Overall feedback</span></div><textarea class="pn-ta" rows="2"></textarea><div class="row"></div></div>`);
  const spacer = el(`<div class="${P}sp" aria-hidden="true"></div>`);   // in the page, so the page itself grows
  const links = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); links.setAttribute('class', 'pnN-links');
  // 1 px, drawing past its edge: sized to the page, it kept the page as tall as the column had ever been, and the page
  // showed through under the column once the column shrank back
  links.setAttribute('width', 1); links.setAttribute('height', 1);
  const toast = el(`<div class="pn-ui pnN-toast"><i class="ic">${icon('AttachmentIcon')}</i><span>Comment deleted</span><button type="button">Undo</button></div>`);
  ovBox.querySelector('.row').appendChild(copyButton());
  const barCopy = bar.querySelector('.cpi').appendChild(copyButton('', 'pn-icb'));
  document.body.append(spacer); WRAP.append(bar, ovBox, toast);
  WRAP.append(col, links);   // placed against the page itself, so a centered or margined body can't shift them
  // the Overall box at its words' full height only while the user is in it; out of it, it folds back to two lines, so a tall
  // box never sits over a thread (the user, 2026-11-08: "the overall feedback box should only expand to full size when there's
  // focus in it. Otherwise, it should shrink back down with a nice animation"). Typing still grows it at once
  let ovIn = false, ovMoving = false, ovT = 0;
  const ovCap = (h) => { const cs = getComputedStyle(ovBox.querySelector('textarea')), lo = parseFloat(cs.minHeight) || 0; return ovIn ? h : Math.max(lo, Math.min(h, lo)); };
  const ov = grow(ovBox.querySelector('textarea'), ovCap); ov.value = state.overall;
  // grows or folds from the height it shows now: the rows above it follow it frame by frame, and a folded box shows its first lines
  function ovTo() {
    const from = ov.getBoundingClientRect().height;
    ov.style.transition = 'none'; ov.pnFit(); const to = ov.getBoundingClientRect().height;
    if (!ovIn) ov.scrollTop = 0;
    if (Math.abs(to - from) < 1 || reduced()) { ov.style.transition = ''; layout(); return; }
    ov.style.height = from + 'px'; void ov.offsetHeight; ov.style.transition = ''; ov.style.height = to + 'px';
    ovMoving = true; clearTimeout(ovT); ovT = setTimeout(() => { ovMoving = false; layout(); }, 360);
  }
  ov.addEventListener('focus', () => { ovIn = true; ovTo(); });
  ov.addEventListener('blur', () => { ovIn = false; ovTo(); });
  new ResizeObserver(() => { if (ovMoving) layout(); }).observe(ovBox);
  PN.onOverall = () => { ov.value = state.overall; ov.dispatchEvent(new Event('input')); };   // the round's box, typed in on another version
  ov.addEventListener('input', () => { state.overall = ov.value; save(); counts(); layout(); });

  const ntg = bar.querySelector('.tg');
  const ntgDraw = () => { ntg.innerHTML = icon(ui.notes ? 'PanelRightCloseIcon' : tight() ? 'ChatIcon' : 'PanelRightOpenIcon'); ntg.title = ui.notes ? 'Collapse' : 'Show notes'; };
  function setNotes(open, auto) {
    ui.notes = open; if (!auto && !overR()) { pref.notes = open; save(); keepUi(); }
    if (open && ui.outline && !roomy(true, true)) setOutline(false, true);
    if (laidOut || !open) { col.classList.add('slide'); clearTimeout(slideT); slideT = setTimeout(() => col.classList.remove('slide'), 400); }   // while it slides, nothing hangs past its edge
    rootCls('pnR-open', open); rootCls('pnR-rail', !open);
    ntgDraw();
    links.innerHTML = '';
    relayoutSoon();
  }
  ntg.onclick = () => {
    setNotes(!ui.notes);
    // on a phone the sheet covers the page, so threads waiting only in closed tabs would leave it blank under its dot: it goes to the first
    if (ui.notes && tight()) { const waits = allThreads().filter(threadWaiting); if (waits.length && waits.every((t) => t.gone)) thrGo(waits[0]); }
  };
  let relayT = 0; function relayoutSoon() { clearTimeout(relayT); layout(); relayT = setTimeout(layout, 300); }

  // ---------- open threads: Copy with an agent's question or reply unanswered copies nothing the first
  // time. An ink banner unfolds over the Overall box, the first open one is picked with the cursor in its Reply box (the
  // bar's Open questions row steps through them; the banner has no stepper of its own), and
  // the button reads Copy anyway, which copies. Saving an answer moves on to the next open one; once all are answered the
  // banner folds away. Every change moves; reduced motion turns that off ----------
  const NZ = 280;   // the banner's unfold, the columns' own slide length
  const nzBox = el(`<div class="pnN-nz" role="status"><div><div class="in"><span class="t">${icon('Alert02Icon')}Open threads</span>
      <span class="s">Answer them first, or copy anyway.</span></div></div></div>`);
  ovBox.prepend(nzBox);
  const mainCopy = ovBox.querySelector('.row > .pn-btn');

  // ---------- the bar steps through open questions in page order, with the same landed count as the Outline ----------
  const thr = bar.querySelector('.pnN-thr'), thrPos = thr.querySelector('.pos'), thrPv = thr.querySelector('.pv'), thrNx = thr.querySelector('.nx'), thrTl = thr.querySelector('.tl');
  let thrAt = null;   // the thread the user is on: the last one picked
  let thrShown = false, thrFold = [];
  function thrShow(on) {
    if (on === thrShown) return;
    thrShown = on; thrFold.forEach((a) => a.cancel()); thrFold = [];
    const cs = getComputedStyle(thr), from = { height: cs.height, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, borderTopWidth: cs.borderTopWidth, opacity: 1 };
    const before = { height: bar.offsetHeight + 'px', paddingBottom: getComputedStyle(bar).paddingBottom }, h = thr.offsetHeight;
    bar.classList.toggle('pn-questions', on); thr.hidden = !on;
    thr.setAttribute('aria-hidden', String(!on)); thr.inert = !on;
    if (on || !h || reduced()) return;
    const after = { height: bar.offsetHeight + 'px', paddingBottom: getComputedStyle(bar).paddingBottom };
    thr.hidden = false;   // still drawn while it folds, but no longer a control
    const timing = { duration: 500, easing: 'ease-in-out', fill: 'forwards' };
    const fold = thrFold = [bar.animate([before, after], timing), thr.animate([from, { height: '0px', paddingTop: '0px', paddingBottom: '0px', borderTopWidth: '0px', opacity: 0 }], timing)];
    Promise.all(fold.map((a) => a.finished.catch(() => null))).then(() => {
      if (thrFold !== fold) return;
      thr.hidden = true; thrFold = []; fold.forEach((a) => a.cancel()); reflow();
    });
  }
  // the agent's threads in the column's order: by where each sits beside the page, the overall ones first, ties as listed
  function byPage(list) { return list.map((a, i) => ({ a, i, y: anchorY('q:' + a.id) })).sort((p, q) => p.y - q.y || p.i - q.i).map((p) => p.a); }
  // ---------- answered in chat (add_notes.py --answered): one of the agent's threads the user answered somewhere else closes in the
  // column like a reply the user just sent, the first time the user sees it (the user: "make sure it animates like it was just submitted,
  // when i see the thread for the first time. test edge cases etc."): the agent's own cursor closes it (the cursor, below)
  // once its row is nearly all in view and the window has held still. Until then it shows open in its own row, but it
  // never counts as an open thread: not in the bar's Open threads, not in an Outline badge (1.103.2; the user: "col3 shows a
  // badge with "1" when there's no thread, then col1 shows "1" when still ther'es no thread, then the badge on col3
  // disappeares. this is confusing"), since it asks nothing of the user. Seen once (kept per page and thread in human-feedback:answered/<page>),
  // under reduced motion, or on an earlier version, it shows closed and still. The Copy reminder never stops for it, nor
  // does the copy hold it (the user: "make sure it goes away once i've responded in a way that would close the loop").
  // ----------
  const EW_KEY = 'human-feedback:answered/' + PN.PAGE;
  let ewSeen = {}; try { ewSeen = JSON.parse(localStorage.getItem(EW_KEY)) || {}; } catch (e) { /* storage blocked */ }
  if (typeof ewSeen !== 'object' || Array.isArray(ewSeen)) ewSeen = {};
  const ewKeep = (id) => { ewSeen[id] = Date.now(); try { localStorage.setItem(EW_KEY, JSON.stringify(ewSeen)); } catch (e) { /* storage blocked */ } };
  const ewLive = new Set();   // still to close: shown open until the cursor closes it
  // a message of the agent's from this round (a question, a reply), open and not seen before: it waits hidden
  // ('held') until the agent's cursor taps it in where it's written, the first time the user sees it; then ('tap') it's a one-line
  // typing bubble until it grows into the message (postArrive; the user: "the cursor needs to go to the
  // place a bubble is written in col3"). A reply's row shows the user's note meanwhile: that's the user's side, there already
  const postLive = new Set(), postStep = new Map();
  let building = false;   // the round's opening is under way (the opening, below): arrivals wait for it
  let roundTurn = null, turnNow = null, turnBack = null;   // the bar's turn to a new round, as the opening plays it, its end at once, and Replay's turn back (below)
  if (PN.ASKS_OPEN) PN.ASKS.filter((a) => a.ew && !ewSeen[a.id]).forEach((a) => { if (reduced()) ewKeep(a.id); else ewLive.add(a.id); });
  if (PN.ASKS_OPEN) PN.ASKS.filter((a) => PN.answerable(a) && !PN.fromRound(a) && !PN.replied(state.answers[a.id]) && !ewSeen[a.id]).forEach((a) => { if (reduced()) ewKeep(a.id); else { postLive.add(a.id); postStep.set(a.id, 'held'); } });
  const ewOpen = (a) => !!a.ew && ewLive.has(a.id);
  // new questions count when the bubble lands; carried questions are there from the start
  const openQuestion = (a) => PN.answerable(a) && !postLive.has(a.id) && !PN.threadClosed(a);
  const newQuestion = (a) => !a.reply && !a.carried;
  const newTag = (a) => newQuestion(a) ? '<span class="new">New</span>' : '';
  // while the cursor works on one, the step it's at: 1 clicked into its Reply box and typing (ewTyped: how much is in), 2
  // out of the box with the user's bubble in, 3 the ✅ stamped on, 4 let go
  const ewStep = new Map(), ewTyped = new Map();
  let ewIdle = 0, ewAt = 0;
  // enough of the thread in what the bar and the footer leave of the window for the cursor to do its work: the part it acts
  // on (JOBS[kind].at: the bubble it types into, the ✅ it stamps, the Reply box it fills), its top and two lines of it or
  // all of it, wherever the rest of the row is. Through 1.79 nearly all of the row had to be in view (90%), so a thread
  // partly below the fold, or under the top bar, was passed over (1.80.0; the user: "i wonder if it didn't click the 2nd thread
  // bc it didn't display 100%? it should still do its thing on a thread that only partially shows")
  const ewInView = (kind, id) => {
    const p = JOBS[kind].at(id); if (!p) return false;
    const b = p.getBoundingClientRect(), lo = bar.getBoundingClientRect().bottom, hi = ovBox.getBoundingClientRect().top;
    return b.height > 0 && b.top >= lo - 1 && Math.min(b.bottom, b.top + 44 * UI) <= hi + 1;
  };
  const ewEl = (id) => col.querySelector(`.pnN-row[data-id="q:${CSS.escape(id)}"]`);
  const partOf = (id, s) => ewEl(id)?.querySelector(s);
  const lastQb = (r) => [...(r?.querySelectorAll(':scope > .qb') || [])].pop();   // "multiple bubbles of replies": the last holds the reaction
  // look once the window has held still this long; a later look already waiting keeps its time
  function ewArm(ms = 160) {
    if (!ewLive.size && !postLive.size) return;
    const at = performance.now() + ms; if (ewIdle && ewAt > at) return;
    clearTimeout(ewIdle); ewAt = at; ewIdle = setTimeout(() => { ewIdle = 0; ewLook(); }, ms);
  }
  // the user is looking, the column is open and not under the done summary: unless the cursor is out already, every row in view
  // still to post or close gets a visit, top to bottom, and everything else lands as it goes (landAll). With nothing
  // in view to watch arrive, or once that visit has played, it's all simply there: nothing waits for a scroll
  function ewLook() {
    if ((!ewLive.size && !postLive.size) || !watching() || !ui.notes || WRAP.classList.contains('pn-done')) return;
    if (bar.classList.contains('pn-turn') || building) return ewArm(300);   // the round turning, or its opening, first: one motion at a time
    if (cBusy) return;
    const todo = landed ? [] : jobsInView();
    if (todo.length) visit(todo); else landAll();
  }
  // a step's look on the row, as the cursor gets there; a row redrawn midway takes it from ewStep with no motion
  function ewShow(id, step) {
    ewStep.set(id, step); const r = ewEl(id); if (!r) return;
    const box = r.querySelector('.ew-box'), ans = r.querySelector('.ew-ans');
    r.classList.toggle('ew-sel', step < 4); r.querySelector('.ew-re')?.classList.toggle('focus', step === 1);
    if (step === 2) { box?.classList.add('shut'); ans?.classList.remove('shut'); ans?.querySelectorAll('.b, .ew-src').forEach((x) => x.classList.add('ew-rise')); }
    if (step >= 3) { r.classList.remove('ew-live'); r.classList.add('ew-done'); }
  }
  function askBy(id) { return PN.ASKS.find((q) => q.id === id); }   // one of the agent's threads, by its own id
  // a close cut short (the column shut, or the done summary covered it) shows closed at once
  function ewFinish(id) {
    ewStep.delete(id); ewTyped.delete(id);
    if (!ewLive.delete(id)) return;
    renderRows();
  }
  // a message's label; a reply waiting to be tapped in is still just the user's note, so it's labelled with the user's note's part
  const asker = (a) => HELPERS.find((h) => h.owns.has(normLabel(a.block)))?.name;
  const postLabel = (a, held) => (PN.fromRound(a) ? PN.fromRound(a) + ' · ' : '') + (asker(a) ? asker(a) + ' · ' : '') + (held && a.reply && a.said ? a.block || 'Page'
    : (a.reply ? 'Reply' : a.block ? 'Question' : 'Overall question') + (a.block ? ' · ' + a.block : ''));
  // the three dots typing in a waiting bubble, their pulse carried on from where it was, so a redraw never restarts it
  const dots = () => `<span class="td" role="img" aria-label="${esc(PN.AGENT || 'Agent')} is typing" style="--pn-ph:-${Math.round(performance.now() % 1200)}ms"><i></i><i></i><i></i></span>`;
  // it arrives (the user: "the bubble starting as 1 line and expanding like a real message once it comes through, the thread
  // box growing with it"; "research how popular messaging platforms like imessage would display this ... and just do it
  // the same way"): the bubble grows from the dots to the whole message in one quick spring, its words, set at the width
  // they end at so they never reflow, fading in as it opens, and the Reply box unfolds under it in the same move, so the
  // thread grows once. The rows below follow it frame by frame (layout's glides wait for it)
  const GROW = 'cubic-bezier(.3,1.25,.55,1)';   // a quick spring, a touch past and back
  function postArrive(id) {
    const from = lastQb(ewEl(id))?.getBoundingClientRect();
    if (!postLive.has(id)) return;
    postLive.delete(id); postStep.delete(id); ewKeep(id);
    opNote(AGENT, 'arrive:' + id);
    if (from && !reduced()) moving.set('q:' + id, { kind: 'grow', t0: performance.now(), ms: 400 * SLOW, play: (r, t) => growIn(r, from, t) });
    renderRows();   // which plays the grow on the redrawn row (replayMoves)
    if (sel === 'q:' + id) ewEl(id)?.querySelector('textarea')?.focus({ preventScroll: true });   // the user picked it while it typed: the user's Reply box is ready
  }
  // the grow, `t` ms in: its words, in a wrapper at the width they end at, are only uncovered as the bubble opens
  function growIn(r, from, t) {
    if (r.querySelectorAll(':scope > .qb').length > 1) return;   // "break things up into paragraphs": after one typing bubble, all appear together
    const qb = lastQb(r); if (!qb) return;
    const to = qb.getBoundingClientRect(), cs = getComputedStyle(qb), ms = 340 * SLOW;
    const words = document.createElement('span'); words.className = 'qg';
    [...qb.childNodes].filter((n) => n.nodeType === 3).forEach((n, i) => { if (!i) n.before(words); words.append(n); });
    Object.assign(words.style, { display: 'block', width: (to.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) + 'px' });
    Object.assign(qb.style, { display: 'block', overflow: 'hidden' });
    const anims = [qb.animate([{ width: from.width + 'px', height: from.height + 'px' }, { width: to.width + 'px', height: to.height + 'px' }], { duration: ms, delay: -t, easing: GROW }),
      words.animate([{ opacity: 0 }, { opacity: 0, offset: 0.2 }, { opacity: 1 }], { duration: ms * 1.15, delay: -t, easing: 'ease-out' })];
    // what comes in under the bubble (the Reply box) unfolds from nothing as it opens
    const under = []; for (let x = qb.nextElementSibling; x; x = x.nextElementSibling) under.push(x);
    under.forEach((x) => {
      const h = x.offsetHeight, m = getComputedStyle(x).marginTop; x.style.overflow = 'hidden';
      anims.push(x.animate([{ height: '0px', marginTop: '0px', opacity: 0 }, { height: h + 'px', marginTop: m, opacity: 1 }], { duration: ms, delay: -t, easing: 'cubic-bezier(.2,.7,.25,1)' }));
    });
    Promise.all(anims.map((x) => x.finished.catch(() => null))).then(() => {
      if (!r.isConnected) return;
      if (words.isConnected) { words.replaceWith(...words.childNodes); qb.normalize(); }
      qb.style.display = qb.style.overflow = ''; under.forEach((x) => { x.style.overflow = ''; });
      reflow();
    });
  }
  // a motion under way on a row (a grow, a lift), kept by the row's id, so a redraw midway carries it on from where it
  // was rather than dropping it: each draw plays it on the new row, `t` ms in. Played once the column is laid out
  const moving = new Map();
  const movingNow = (kind) => [...moving.values()].some((m) => m.kind === kind && performance.now() - m.t0 < m.ms);
  function replayMoves() {
    let grew = false;
    moving.forEach((m, id) => {
      const t = performance.now() - m.t0; if (t >= m.ms) { moving.delete(id); return; }
      const r = col.querySelector(`.pnN-row[data-id="${CSS.escape(id)}"]`); if (!r || r === m.row) return;
      m.row = r; m.play(r, t); grew ||= m.kind === 'grow';
    });
    if (grew) layout();   // the rows below start from where the bubble is now, not from the message's full height
  }
  pageCss(`mark.${P}mark.${P}ask{transition:background .4s ease} mark.${P}mark.${P}ask.${P}pw{background:transparent;transition:none}`);   // in only, so it never flashes away at load
  // a row still to close keeps the taller of its two heights from the start, so nothing around it moves as it closes
  function ewReserve(r) {
    const body = r.querySelector('.ew-body'), box = r.querySelector('.ew-box'), ans = r.querySelector('.ew-ans'); if (!body || !box || !ans) return;
    const was = [box.className, ans.className]; r.classList.add('ew-still'); body.style.minHeight = '';
    box.classList.remove('shut'); ans.classList.add('shut'); const open = body.offsetHeight;
    box.classList.add('shut'); ans.classList.remove('shut'); const shut = body.offsetHeight;
    box.className = was[0]; ans.className = was[1]; void body.offsetHeight; r.classList.remove('ew-still');
    body.style.minHeight = Math.max(open, shut) + 'px';
  }
  addEventListener('scroll', () => ewArm(), { passive: true });
  back(() => { if (watching()) ewArm(150); });

  // ---------- the agent's cursor: when the agent closes a thread the user answered in chat, or types a message,
  // its own cursor does it on screen (the user: "build human-feedback's agent cursor so I see the agent itself close
  // threads I answered in chat"; the user approved round 3, "love it").
  // It's the writing app's collaborator cursor in the
  // layer's agent violet, since violet means the agent here, and its tag carries the agent's own mark and name. One visit
  // takes the rows in view top to bottom: in from off the window, one job at a time, then off again. Each kind of job is an
  // entry in JOBS: the ids still to do (live), where the cursor first heads (at, fx), whether it arrives holding the ✅
  // (carry), the job (run), and its end state at once when a visit is cut short (finish). A new kind plugs in there ----------
  const SLOW = Math.min(20, Math.max(1, +new URLSearchParams(location.search).get('hf-slow') || 1));   // ?hf-slow=8 plays it 8× slower, for checking frames
  const rnd = (a, b) => a + Math.random() * (b - a), sign = () => (Math.random() < 0.5 ? -1 : 1);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mj = (t) => t * t * t * (10 - 15 * t + 6 * t * t);   // minimum jerk: the speed curve of a hand reaching for a point
  const STOP = new Error('stop'), JUMP = new Error('jump');   // JUMP: a status visit hands its cursor on to Done
  // the arrow's box: 26 px at the layer's scale until 1.85.0 (the writing app's size), and scaled with the layer since
  const CUR = 21.49 * UI;
  const HOT = CUR / 24 * 3.41448;   // the arrow's tip in its box (the writing app's hotspot, scaled)
  const AR_AT = `translate(${-HOT}px,${-HOT}px)`, BM_AT = `translate(-1px,${-CUR / 2}px)`;
  const ARROW = 'M9.80282 4.62973L15.8364 6.99069C19.3164 8.35243 21.0564 9.03329 20.9987 10.1133C20.941 11.1934 19.1251 11.6886 15.4933 12.6791C14.412 12.974 13.8713 13.1215 13.4964 13.4963C13.1215 13.8712 12.9741 14.4119 12.6791 15.4933C11.6887 19.125 11.1934 20.9409 10.1134 20.9986C9.03335 21.0563 8.35249 19.3163 6.99075 15.8363L4.62979 9.80276C3.20411 6.15934 2.49127 4.33764 3.41448 3.41442C4.3377 2.49121 6.15941 3.20405 9.80282 4.62973Z';
  // each agent names itself when it turns notes on, and its cursor carries its own Hugeicons mark, else its maker's, else
  // the bot, always with the name it gave (round 3, "Agent marks")
  const MARKS = [[/claude/i, 'ClaudeIcon'], [/codex/i, 'ChatGptIcon'], [/copilot/i, 'CopilotIcon'], [/grok/i, 'GrokIcon'], [/kimi/i, 'KimiAiIcon'],
    [/mistral/i, 'MistralIcon'], [/qwen|lingma/i, 'QwenIcon'], [/replit/i, 'ReplitIcon'], [/windsurf/i, 'WindSurfIcon'],
    [/antigravity|jules|gemini/i, 'GoogleGeminiIcon'], [/kiro/i, 'AmazonIcon']];
  const markOf = (name) => (MARKS.find(([re]) => re.test(name)) || [0, 'BotIcon'])[1];
  const AGENT = PN.AGENT || 'Agent', MARK = markOf(AGENT);
  css(`
    .pnC{position:fixed;left:0;top:0;width:0;height:0;z-index:2147483100;pointer-events:none;will-change:transform}   /* its point is the origin */
    .pnC:not([style*="transform:"]){visibility:hidden}   /* the shared opening can wait before put positions this cursor */
    .pnC>*{position:absolute;left:0;top:0}
    .pnC .ar{width:21.49px;height:21.49px;overflow:visible;transition:opacity calc(.12s * var(--pn-k,1)) ease}
    .pnC .ar .in{fill:var(--pn-agent);stroke:var(--pn-agent)}
    .pnC .bm{width:2px;height:21.49px;background:var(--pn-agent);box-shadow:0 0 0 1px #fff;opacity:0;transition:opacity calc(.12s * var(--pn-k,1)) ease}
    .pnC.beam .ar{opacity:0} .pnC.beam .bm{opacity:1}   /* over a box it could type in, the arrow turns to a text beam */
    .pnC .tg{display:flex;align-items:center;gap:4.96px;white-space:nowrap;padding:4.13px 9.09px 4.13px 6.61px;border:1px solid #fff;border-radius:3.31px 11.57px 11.57px 11.57px;
      background:color-mix(in srgb,var(--pn-agent) 88%,transparent);-webkit-backdrop-filter:blur(2.48px);backdrop-filter:blur(2.48px);font:500 11.57px/15.7px var(--pn-ui);color:#fff;
      transition:transform calc(.28s * var(--pn-k,1)) cubic-bezier(.2,.7,.25,1),opacity calc(.12s * var(--pn-k,1)) ease}
    .pnC .tg svg{width:14.05px;height:14.05px}
    .pnC.tgo .tg{opacity:0}   /* the name waits for the pointer to enter; its fixed attachment may cross the edge */
    .pnC.nt .tg{transition:none}
    .pnC .sk{left:-17.77px;top:-17.77px;width:35.54px;height:35.54px;opacity:0;filter:drop-shadow(0 2px 2px rgba(0,0,0,.2)) drop-shadow(0 8.26px 9.92px rgba(0,0,0,.2))}   /* the ✅ it holds */
    .pnC .sk svg{display:block;width:100%;height:100%;overflow:visible}
    .pnC.carry .sk{opacity:1}
    .pnRg{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:2px solid var(--pn-agent);pointer-events:none;z-index:2147483090;opacity:0}   /* a tap */
  `);
  let cBusy = false;   // a visit is under way
  const winW = () => document.documentElement.clientWidth;
  // a visit ends once the column shuts or the done summary covers it
  let cCut = false;   // the round's opening, or the visit, was cut short: the visit under way stops where it is (opCut)
  const cDead = () => cCut || !ui.notes || WRAP.classList.contains('pn-done');
  let cNow = null;   // the visit's cursor
  // a visit cut short stops where it is, and its cursor fades now, not once the beat it's in is out (up to 0.9 s while a
  // message's dots run). Once it has set off it flies on out (visit), as everything has landed
  function cStop() {
    cCut = true; const c = cNow; if (!c || c.leaving || c.gone) return;
    c.gone = true; fadeOff(c.el);
  }
  // a passing element goes once its animation ends, or is cut short; fadeOff fades it out first
  function goneAfter(a, n) { return a.finished.then(() => n.remove(), () => n.remove()); }
  function fadeOff(n) { return goneAfter(n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150 }), n); }
  // the user scrolled, clicked or pressed a key while it works, or while the round opens (opCut): everything lands at once. A
  // press or a touch lands once the user lets go and the user's click has gone through (or 300 ms after, with no click), as landAll
  // redraws the rows: landed in the press itself, it took the row under the user's pointer away, and the click picking it was lost.
  // The opening's cut waits for the click the same way (1.82.1): a click in its wipe picks the row the user clicked
  const openingStarted = () => OP.live && OP.started;
  const cCutNow = () => { if (openingStarted()) opCut(); else if (cBusy && !cCut) { landAll(); cStop(); } };
  const UPS = ['pointerup', 'pointercancel', 'touchend', 'touchcancel'];
  let cPress = false;
  function cLetGo() {
    if (!cPress) return; cPress = false; UPS.forEach((k) => removeEventListener(k, cLetGo, true));
    const go = () => { clearTimeout(t); removeEventListener('click', go); cCutNow(); }, t = setTimeout(go, 300);
    addEventListener('click', go);   // bubbling, after the click's own handlers
  }
  ['wheel', 'keydown'].forEach((k) => addEventListener(k, (e) => { if (e.isTrusted) cCutNow(); }, { capture: true, passive: true }));
  ['pointerdown', 'touchstart'].forEach((k) => addEventListener(k, (e) => {
    if (!e.isTrusted || cPress || !(openingStarted() || (cBusy && !cCut))) return;
    cPress = true; UPS.forEach((u) => addEventListener(u, cLetGo, true));
  }, { capture: true, passive: true }));
  // a click in a frame on the page (a framed mock-up) never reaches the listeners above: its own layer says so, and a frame without one
  // takes the window's focus (blur, with the frame the active element). A press in a frame has no row of ours under it, so it cuts at once
  addEventListener('message', (e) => {
    const d = e.data; if (!d || !d.hf || d.kind !== 'cut' || ![...document.querySelectorAll('iframe')].some((f) => f.contentWindow === e.source)) return;
    cCutNow();
  });
  addEventListener('blur', () => setTimeout(() => { if (document.hasFocus() && document.activeElement?.tagName === 'IFRAME') cCutNow(); }, 0));
  // a beat of the cursor's: while the user is away it waits for the user, so nothing moves on without the user
  const beat = (ms) => new Promise((ok) => setTimeout(ok, ms * SLOW)).then(() => (watching() ? null : new Promise((ok) => {
    const on = () => { if (!watching()) return; document.removeEventListener('visibilitychange', on); removeEventListener('focus', on); ok(); };
    back(on);
  })));
  function cursor(name = AGENT) {
    const mark = name === AGENT ? MARK : markOf(name);
    const c = el(`<div class="pnC" aria-hidden="true" style="--pn-k:${SLOW}"><span class="sk">${PN.art('check')}</span>`
      + `<svg class="ar" viewBox="0 0 24 24"><path class="ou" d="${ARROW}" fill="none" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"/><path class="in" d="${ARROW}" stroke-width="1.5" stroke-linejoin="round"/></svg>`
      + `<span class="bm"></span><span class="tg">${icon(mark).replace('<svg ', `<svg data-mark="${mark}" `)}<span>${esc(name)}</span></span></div>`);
    const ar = c.querySelector('.ar'), bm = c.querySelector('.bm');
    ar.style.transform = AR_AT; ar.style.transformOrigin = `${HOT}px ${HOT}px`; bm.style.transform = BM_AT;
    WRAP.appendChild(c);
    return { el: c, x: 0, y: 0, vx: 0, tilt: 14, shape: 'pointer', carry: false, tag: c.querySelector('.tg'), ar, bm, sk: c.querySelector('.sk') };
  }
  // the arrow turns to a text beam over a box it could type in, as a real pointer does: a Reply box, or the bubble it's
  // typing a post into. Not over a waiting row's, which can't be seen yet
  function shapeFor(cur) {
    let beam = false;
    if (!cur.carry) for (const re of WRAP.querySelectorAll('.pnN-row .ew-box:not(.shut) .ew-re, .pnN-row:not(.ty) textarea')) {
      const r = re.getBoundingClientRect(); if (cur.x >= r.left && cur.x <= r.right && cur.y >= r.top && cur.y <= r.bottom) { beam = true; break; }
    }
    const ty = !beam && !cur.carry && cur.typeAt?.()?.getBoundingClientRect();   // where it's about to type a message (doPost)
    if (ty && cur.x >= ty.left - 4 && cur.x <= ty.right + 4 && cur.y >= ty.top - 4 && cur.y <= ty.bottom + 4) beam = true;
    const s = beam ? 'beam' : 'pointer'; if (cur.shape !== s) { cur.shape = s; cur.el.classList.toggle('beam', beam); }
  }
  function put(cur, x, y) {
    const now = performance.now(), dt = now - (cur.t || now);   // its speed in px per ms, for the tag as it leaves (tagIn)
    if (dt > 0) cur.v = { x: (x - cur.x) / dt, y: (y - cur.y) / dt };
    cur.t = now;
    cur.vx = x - cur.x; cur.x = x; cur.y = y;
    cur.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    if (cur.parked) showTag(cur); else tagIn(cur);
    if (cur.carry) {   // a held ✅ swings a little behind the motion
      cur.tilt += (clamp(14 - cur.vx * 1.1, -6, 34) - cur.tilt) * 0.22;
      cur.sk.style.transform = `rotate(${cur.tilt.toFixed(1)}deg) scale(1.2)`;
    }
    shapeFor(cur);
  }
  // The name stays attached below-right, including Updating and viewport edges (the user, 2026-11-11).
  function showTag(cur, parked = !!cur.parked) {
    cur.parked = parked;
    const w = cur.tag.offsetWidth, h = cur.tag.offsetHeight;
    const dx = cur.carry ? 24 : 16, dy = cur.carry ? 26 : 18;
    cur.tag.style.transform = `translate(${dx}px,${dy}px)`;
    cur.tb = { dx, dy, w, h }; tagIn(cur);
  }
  // The name shows once its pointer enters, even if the attached tag is clipped by the viewport.
  // As the cursor leaves, the tag goes with it and fades
  // over the last TAG_GO ms before any side of it would meet the edge it's heading for, so it's gone the moment it would be
  // cut, and never comes back (the user: "the agent cursor seemed to have started disappearing before it left the whole page":
  // through 1.79.0 it hid the moment the cursor set off, often a thousand pixels from the edge)
  const TAG_GO = 60;   // ms: about four frames, so at its exit speed the tag goes in the last stretch before the edge
  function tagIn(cur) {
    const b = cur.tb; if (!b) return;
    const W = winW(), H = innerHeight, l = cur.x + b.dx, t = cur.y + b.dy, r = l + b.w, d = t + b.h;
    const outside = l < 0 || t < 0 || r > W || d > H;
    if (cur.leaving) {
      const v = cur.v || { x: 0, y: 0 }, ms = (gap, s) => (s > 0.01 ? gap / s : Infinity);   // until that side meets its edge
      const left = outside ? 0 : Math.min(ms(W - r, v.x), ms(l, -v.x), ms(H - d, v.y), ms(t, -v.y));
      const was = cur.tag.style.opacity === '' ? 1 : +cur.tag.style.opacity;
      cur.tag.style.opacity = Math.min(was, clamp(left / (TAG_GO * SLOW), 0, 1)).toFixed(3);
      return;
    }
    const pointerOutside = cur.x < 0 || cur.y < 0 || cur.x > W || cur.y > H;
    if (pointerOutside !== cur.el.classList.contains('tgo')) cur.el.classList.toggle('tgo', pointerOutside);
  }
  // it sets off for the window's edge: the tag takes its opacity over from the class as it stands (one hidden near an edge
  // stays hidden), and from here tagIn sets it each frame, with no transition to lag behind the edge
  function leave(cur) {
    cur.tag.style.opacity = getComputedStyle(cur.tag).opacity; cur.tag.style.transition = 'none';
    cur.leaving = true;
  }
  function carry(cur, on, instant) {
    cur.carry = on; cur.el.classList.toggle('carry', on);
    if (on) {
      cur.tilt = 14; cur.sk.style.transform = 'rotate(14deg) scale(1.2)';
      if (!instant) cur.sk.animate([{ opacity: 0, transform: 'rotate(34deg) scale(.4)' }, { opacity: 1, transform: 'rotate(14deg) scale(1.2)' }], { duration: 220 * SLOW, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    }
    showTag(cur);
  }
  // where a part of a row is now, read every frame so the cursor follows a row that moves; where it was last seen, while a
  // redraw has taken it away
  function spot(cur, get, fx, fy) {
    let seen = null;
    return () => {
      const n = get(), r = n?.isConnected && n.getBoundingClientRect();
      if (r && (r.width || r.height)) seen = { x: r.left + r.width * fx, y: r.top + r.height * fy };
      return seen || { x: cur.x, y: cur.y };
    };
  }
  // one reach: a curved path with a minimum-jerk speed curve, landing a few pixels past the spot, then a small correction
  // back onto it, the way a hand moves a mouse. It holds still while the user is away
  // `o.dead`: when to stop, if not when a visit ends (cDead)
  function fly(cur, target, o = {}) {
    const dead = o.dead || cDead, p0 = { x: cur.x, y: cur.y }, t1 = target();
    const dist = Math.hypot(t1.x - p0.x, t1.y - p0.y);
    // × 0.75: a third faster than the hand's pace (the user: "the agent cursor moves on the page like 1/3 faster")
    const dur = (200 + 125 * Math.log2(1 + dist / 28)) * 0.75 * (o.pace || rnd(0.9, 1.15)) * SLOW;
    const bend = (o.bend != null ? o.bend : rnd(0.06, 0.2)) * sign();
    const over = o.over != null ? o.over : (dist > 110 ? rnd(4, 11) : 0), drift = over ? rnd(-3, 3) : 0;
    return new Promise((done) => {
      let t0 = performance.now(), last = t0;
      const step = () => {
        if (dead()) return done();
        const now = performance.now(); if (!watching() || now - last > 250) t0 += now - last; last = now;   // held while the user is away, or the tab was hidden
        const t = Math.min(1, (now - t0) / dur), e = mj(t), p1 = target();
        const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
        const end = { x: p1.x + ux * over - uy * drift, y: p1.y + uy * over + ux * drift };
        const c = { x: (p0.x + end.x) / 2 - uy * bend * len, y: (p0.y + end.y) / 2 + ux * bend * len }, u = 1 - e;
        put(cur, u * u * p0.x + 2 * u * e * c.x + e * e * end.x, u * u * p0.y + 2 * u * e * c.y + e * e * end.y);
        if (t < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    }).then(() => (over && !dead() ? settle(cur, target, rnd(130, 190)) : null));
  }
  function settle(cur, target, ms) {
    const p0 = { x: cur.x, y: cur.y };
    return new Promise((done) => {
      let t0 = performance.now(), last = t0;
      const step = () => {
        if (cDead()) return done();
        const now = performance.now(); if (!watching() || now - last > 250) t0 += now - last; last = now;
        const t = Math.min(1, (now - t0) / (ms * SLOW)), e = mj(t), p1 = target();
        put(cur, p0.x + (p1.x - p0.x) * e, p0.y + (p1.y - p0.y) * e);
        if (t < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
  }
  // a click: the arrow (or beam) shrinks a little toward its tip and back
  function press(cur) {
    const beam = cur.shape === 'beam', node = beam ? cur.bm : cur.ar, base = beam ? BM_AT : AR_AT;
    node.animate([{ transform: base }, { transform: base + ' scale(.84)', offset: 0.4 }, { transform: base }], { duration: 190 * SLOW, easing: 'ease-out' });
    return beat(110);
  }
  // it starts off the window: mostly from the right, where the notes column is, sometimes from below or above, far enough
  // out that it's already moving fast when it comes into view
  function entry(t, tw) {
    const W = winW(), H = innerHeight, r = Math.random(), far = rnd(140, 260);
    if (r < 0.55) return { x: W + far + tw, y: clamp(t.y + rnd(-240, 240), -60, H + 60) };
    if (r < 0.8) return { x: clamp(t.x + rnd(-260, 200), -40, W + 60), y: H + far * 0.7 + 60 };
    return { x: clamp(t.x + rnd(-260, 200), -40, W + 60), y: -far * 0.7 - 90 };
  }
  // and leaves by an edge drawn at random, nearer edges likelier, far enough out that its name tag clears the window too
  function exit(cur) {
    const W = winW(), H = innerHeight, tw = cur.tag.offsetWidth;
    const edges = [['right', W - cur.x, 0.45], ['bottom', H - cur.y, 0.35], ['top', cur.y, 0.2]].map((e) => [e[0], e[1], e[2] / (1 + Math.max(0, e[1]) / 700)]);
    let roll = Math.random() * edges.reduce((sum, e) => sum + e[2], 0), pick = edges[0];
    for (const e of edges) { roll -= e[2]; if (roll <= 0) { pick = e; break; } }
    const go = rnd(80, 280) * sign();
    if (pick[0] === 'right') return { x: W + tw + rnd(60, 160), y: cur.y + go };
    if (pick[0] === 'bottom') return { x: cur.x + go, y: H + rnd(110, 200) };
    return { x: cur.x + go, y: -rnd(120, 200) };
  }
  // the held ✅ goes down on the user's bubble: it lands, squashes a little, and settles to the dimmed check, with one green ring
  const HELD_SHADOW = 'drop-shadow(0 2px 2px rgba(0,0,0,.2)) drop-shadow(0 10px 12px rgba(0,0,0,.2))';
  async function stamp(cur, id, landed) {
    press(cur); await beat(70);
    carry(cur, false); landed();
    const k = partOf(id, '.qk'), sv = k?.querySelector('svg');
    if (k && sv) {
      const turn = k.closest('.b') ? 8 : 0, rest = getComputedStyle(sv).filter;
      k.animate([
        { opacity: 1, transform: 'rotate(14deg) scale(1.2)', easing: 'cubic-bezier(.5,0,.9,.6)' },
        { opacity: 1, transform: `rotate(${turn}deg) scale(.86)`, offset: 0.4, easing: 'cubic-bezier(.2,.7,.3,1)' },
        { opacity: 0.9, transform: `rotate(${turn}deg) scale(1.05)`, offset: 0.68, easing: 'ease-in-out' },
        { opacity: 0.6, transform: `rotate(${turn}deg) scale(1)` }], { duration: 400 * SLOW });
      sv.animate([{ filter: HELD_SHADOW }, { filter: rest, offset: 0.4 }, { filter: rest }], { duration: 400 * SLOW });
      const host = k.offsetParent;
      if (host) {
        const ring = el('<span class="rg"></span>');
        Object.assign(ring.style, { left: k.offsetLeft + 'px', top: k.offsetTop + 'px', width: k.offsetWidth + 'px', height: k.offsetHeight + 'px' });
        host.appendChild(ring);
        goneAfter(ring.animate([{ opacity: 0.6, transform: 'scale(.9)' }, { opacity: 0, transform: 'scale(1.8)' }], { duration: 300 * SLOW, delay: 140 * SLOW, easing: 'ease-out' }), ring);
      }
    }
    await beat(240);
  }
  async function type(id, s, alive) {
    const re = () => partOf(id, '.ew-re');
    re()?.classList.add('busy');
    const per = Math.max(1, Math.ceil(s.length / 16));   // a long answer goes in a few letters at a time
    for (let i = 0; i < s.length; i += per) {
      await beat(i === 0 ? rnd(150, 240) : rnd(45, 100) + (/[ ,.]/.test(s[i - 1]) ? rnd(30, 90) : 0)); alive();
      const n = Math.min(s.length, i + per), x = re(); ewTyped.set(id, n);
      if (x) { x.querySelector('.w').textContent = s.slice(0, n); x.classList.add('typed'); }
    }
    re()?.classList.remove('busy');
  }
  // answered in chat: over the Reply box the arrow turns to a beam; it clicks in and types the user's words, leaves the box (it
  // folds, the user's bubble rises in with "Answered in chat"), picks up the ✅ and stamps it on the user's bubble's bottom left corner.
  // Its counts stay unchanged: a question answered in chat asks nothing of the user
  async function doChat(cur, id, alive) {
    const a = askBy(id), off = rnd(34, 96), dy = rnd(-3, 3);
    ewKeep(id);   // seen from the cursor's first move toward it, so a reload midway finds it closed
    const box = spot(cur, () => partOf(id, '.ew-re'), 0, 0.5);
    await fly(cur, () => { const p = box(); return { x: p.x + off, y: p.y + dy }; }); alive();
    await beat(rnd(70, 170)); alive();
    await press(cur); alive();
    ewShow(id, 1);
    await type(id, a.ew, alive);
    await beat(rnd(200, 360)); alive();
    ewShow(id, 2); carry(cur, true);
    await fly(cur, spot(cur, () => partOf(id, '.qk'), 0.5, 0.5), { over: rnd(1.5, 4) }); alive();
    await beat(rnd(60, 150)); alive();
    await stamp(cur, id, () => ewShow(id, 3)); alive();
    ewShow(id, 4); ewStep.delete(id); ewTyped.delete(id); ewLive.delete(id);
  }
  // a tap where a message goes: its row comes in with its typing bubble, rising as the user's bubbles do (on a reply, the user's note is
  // there already, so only the bubble comes in, and the label turns from the user's note's part to Reply)
  function postTap(id) {
    if (postStep.get(id) !== 'held') return;
    postStep.set(id, 'tap');
    const r = ewEl(id); if (!r) return;
    const a = askBy(id), mine = r.classList.contains('rp');
    r.classList.remove('ph', 'rp'); lightMarks();
    if (mine && a) swapWords(r.querySelector('.lbl'), postLabel(a, false));
    const ins = mine ? [lastQb(r)].filter(Boolean) : [...r.children];
    if (!mine) r.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 * SLOW, easing: 'ease-out' });
    ins.forEach((x) => x.animate([{ opacity: 0, translate: '0 12.1px' }, { opacity: 1, translate: '0 0' }], { duration: 280 * SLOW, easing: 'cubic-bezier(.2,.7,.25,1)', fill: 'backwards' }));
  }
  // a message cut short (the user scrolled, clicked or pressed a key in the opening, or the column shut): it's there at once
  function postLand(id) {
    if (!postLive.has(id)) return;
    postLive.delete(id); postStep.delete(id); ewKeep(id);
    thrSync(); renderRows(); outline();
  }
  // the agent does what's in view visibly, in one visit, then the rest are there (the user: "in col3 when the agent is
  // creating replies/comments/threads, have it do that once visibly, and then once it flies off, all the other threads/
  // comments/replies/emojis wouuld already be there so we don't ahve to wait for more animations"; since 1.81, "Click each
  // thread in view"): every message still to post and thread still to close, in view or not, goes in at
  // once and still, kept as seen, and the bar's count and the Outline's badges catch up with no swap or
  // fade. Through 1.73.0 each waited for its own visit, which came only once its row was in view and the window held
  // still, so a row the user scrolled past or never reached kept showing the user's note with no answer
  let landed = false;   // the one visible visit has played, or was cut short: from here on nothing waits for the cursor
  function landAll() {
    landed = true;
    const ids = [...postLive, ...ewLive]; if (!ids.length) return;
    const t = Date.now(); ids.forEach((id) => { ewSeen[id] = t; ewStep.delete(id); ewTyped.delete(id); });
    try { localStorage.setItem(EW_KEY, JSON.stringify(ewSeen)); } catch (e) { /* storage blocked */ }
    postLive.clear(); postStep.clear(); ewLive.clear();
    stillTill = performance.now() + 250 * SLOW; renderRows();   // the rows take their new places at once, with no glide, their first resize reports included
    thrSync();
  }
  // a message, typed where it goes, as anyone types into a box: the cursor comes to where the message starts, turning to a
  // text beam over it, clicks once to put its caret there, and stays put while it types. The typing bubble comes in around
  // the caret, the dots run, and the message grows out from it; only once it's in does the cursor move on (the user: "it can't
  // fly away until the message is posted"; "weird that you clicked to start the ellipsis and then moved out of the way when
  // the agent was supposed to be typing"). One at a time: a typing bubble is the agent typing, in one place at a time
  async function doPost(cur, id, alive) {
    const qb = () => lastQb(ewEl(id)), at = spot(cur, qb, 0, 0);
    cur.typeAt = qb;
    try {
      await fly(cur, () => { const q = at(); return { x: q.x + 7, y: q.y + 21 }; }); alive();   // its first line's start, inside the bubble's edge
      await beat(rnd(60, 140)); alive();
      press(cur); postTap(id);
      await beat(rnd(650, 900)); alive();   // the dots' beat
      postArrive(id);
      await beat(460); alive();   // the bubble grows into the message
    } finally { cur.typeAt = null; shapeFor(cur); }
  }
  // the messages still to post: those still held (one tapped in is on its way)
  const postHeld = { has: (id) => postLive.has(id) && postStep.get(id) === 'held', [Symbol.iterator]: () => [...postLive].filter((id) => postStep.get(id) === 'held')[Symbol.iterator]() };
  const JOBS = {
    chat: { live: ewLive, at: (id) => partOf(id, '.ew-re'), fx: 0, carry: false, run: doChat, finish: ewFinish },
    post: { live: postHeld, at: (id) => lastQb(ewEl(id)), fx: 0, carry: false, run: doPost, finish: postLand },
  };
  // the jobs on rows in view, top to bottom
  const jobsInView = () => Object.entries(JOBS).flatMap(([kind, J]) => [...J.live].map((id) => ({ kind, id, r: ewEl(id) })))
    .filter((x) => x.r && ewInView(x.kind, x.id)).sort((p, q) => p.r.getBoundingClientRect().top - q.r.getBoundingClientRect().top);
  // one visit: in from off the window, each job still in view, top to bottom, then off again; what isn't in view lands as
  // it sets off (landAll). Each job's own flight takes it to the next, so it moves from thread to thread as it moves
  // anywhere, with no stop between (2026-10-25, of a round with What changed and three replies: "it should still do
  // its thing on a thread that only partially shows"; asked to keep one visible arrival or visit every thread in
  // view, the user chose "Click each thread in view". Through 1.80 it did the topmost and landed the rest as it left)
  // `have`: the opening's cursor, already on the page, goes on to the notes column
  async function visit(todo, have) {
    cBusy = true; cCut = false; unpark();
    const cur = cNow = have || cursor(), alive = () => { if (cDead()) throw STOP; };
    let job = null, cut = false;
    try {
      if (!have) {
        const J = JOBS[todo[0].kind], dest = spot(cur, () => J.at(todo[0].id), J.fx, 0.5)();
        if (J.carry) carry(cur, true, true);
        const p = entry(dest, cur.tag.offsetWidth);
        cur.el.classList.add('nt'); put(cur, p.x, p.y); showTag(cur); void cur.el.offsetWidth; cur.el.classList.remove('nt');
      }
      // each still in view as it comes to it, top to bottom; one an earlier message pushed out of view lands with the rest
      for (let i = 0; i < todo.length; i++) {
        const { kind, id } = todo[i], K = JOBS[kind], r = ewEl(id);
        if (!K.live.has(id) || !r || !ewInView(kind, id)) continue;
        job = todo[i]; await K.run(cur, id, alive); job = null; alive();
      }
      await beat(rnd(220, 520)); alive();
      landAll();
      // once it sets off, a cut or the column shutting stops it no more: it flies on out past the edge, as everything has landed
      const away = exit(cur); leave(cur);
      await fly(cur, () => away, { over: 0, pace: rnd(0.8, 0.95), dead: () => false });
    } catch (e) {
      if (e !== STOP) throw e;
      cut = true; if (job) JOBS[job.kind].finish(job.id);
      landAll();
    } finally {
      if (cut && !cur.gone) fadeOff(cur.el);
      else if (!cut) cur.el.remove();
      cBusy = false; cCut = false; cNow = null;
      setTimeout(ewLook, rnd(450, 800) * SLOW); syncPark();
    }
  }
  // Every row is a thread; only the agent's messages open a loop, and a committed response or the agent closing it resolves it.
  const loopStates = new Map();
  function allThreads() {
    // a thread in a closed tab has no place on the page: tabs go in page order, so the arrows' order doesn't change as they open
    const home = (t) => { const b = blockEl(partOfRow(t.id)); return { b, panel: b?.closest('[role="tabpanel"]') || null, gone: away(b) }; };
    return [...col.querySelectorAll('.pnN-row[data-id]')].map((row, i) => ({ id: row.dataset.id, row, i, y: anchorY(row.dataset.id), ...home({ id: row.dataset.id }) }))
      .sort((a, b) => {
        if (a.b && b.b && a.b !== b.b && (a.panel !== b.panel || (a.gone && b.gone))) return a.b.compareDocumentPosition(b.b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        return a.y - b.y || a.i - b.i;
      });
  }
  function threadWaiting(t) {
    const a = t.id.startsWith('q:') && askBy(t.id.slice(2));
    return !!a && openQuestion(a);   // open means waiting on the user: the user's own notes and edits never count (the user: "open because they're waiting on me to close them, not threads i just created myself")
  }
  function popLoop(rect, id = 'badge') {
    if (reduced() || !rect || !rect.width || rect.top < 0 || rect.bottom > innerHeight) return;
    const puff = el('<span class="pn-loop-pop" aria-hidden="true"><i class="pn-loop-core"></i><i class="pn-loop-ring"></i></span>');
    Object.assign(puff.style, { left:rect.left+'px', top:rect.top+'px', width:rect.width+'px', height:rect.height+'px' });
    WRAP.append(puff); PN.loopPopLog ||= []; PN.loopPopLog.push({ id, at:performance.now(), x:rect.left, y:rect.top, width:rect.width, height:rect.height });
    const timing = { duration:380, easing:'cubic-bezier(.35,0,.4,1)', fill:'forwards' };
    const animations = [
      puff.querySelector('.pn-loop-core').animate([{transform:'scale(1)',opacity:1},{transform:'scale(1.5)',opacity:1,offset:.25},{transform:'scale(0)',opacity:0}],timing),
      puff.querySelector('.pn-loop-ring').animate([{transform:'scale(.8)',opacity:.95},{transform:'scale(2.1)',opacity:.9,offset:.45},{transform:'scale(3.4)',opacity:0}],timing),
    ];
    for (let i=0;i<5;i++) {
      const spark=el('<i class="pn-loop-spark"></i>');puff.append(spark);const a=i*Math.PI*2/5;
      animations.push(spark.animate([{transform:'translate(-50%,-50%) scale(1)',opacity:1},{transform:`translate(calc(-50% + ${Math.cos(a)*20}px),calc(-50% + ${Math.sin(a)*20}px)) scale(0)`,opacity:0}],timing));
    }
    Promise.all(animations.map(a=>a.finished.catch(()=>{}))).finally(()=>puff.remove());
    setTimeout(()=>puff.remove(),500);
  }
  function popLoopIn(dot, id = 'badge') {
    if (reduced()) return;
    requestAnimationFrame(() => {
      if (!dot?.isConnected) return;
      const rect = dot.getBoundingClientRect();
      if (!rect.width || rect.top < 0 || rect.bottom > innerHeight) return;
      PN.loopPopInLog ||= []; PN.loopPopInLog.push({ id, at:performance.now(), x:rect.left, y:rect.top, width:rect.width, height:rect.height });
      dot.animate([{scale:'0',opacity:0},{scale:'1.6',opacity:1,offset:.55},{scale:'1',opacity:1}],{duration:360,easing:'cubic-bezier(.25,.7,.3,1)'});
    });
  }
  function totalBadge(n, open) {
    const badge=el('<span class="pn-total-badge" role="img"><span class="pn-total-number"></span><span class="pn-badge-dot" aria-hidden="true"></span></span>');
    updateTotal(badge,n,open);return badge;
  }
  function updateTotal(badge,n,open) {
    const dot=badge.querySelector('.pn-badge-dot'), wasHidden=dot.hidden, rect=dot.getBoundingClientRect();
    badge.querySelector('.pn-total-number').textContent=String(Math.min(n,999));badge.classList.toggle('pn-three',n>=100);dot.hidden=!open;
    if (wasHidden && open) popLoopIn(dot,'total');
    else if (!wasHidden && !open) popLoop(rect);
    badge.setAttribute('aria-label',`${n} total thread${n === 1 ? '' : 's'}${open ? ', with open threads' : ''}`);
  }
  function thrSync() {
    const threads = allThreads(), waiting = threads.filter(threadWaiting), n = threads.length;
    thrAt = sel || null;
    const i = threads.findIndex((a) => a.id === thrAt);
    if (!thrPos.querySelector('.pn-pos-full')) thrPos.replaceChildren(el('<span class="pn-pos-full"></span>'),el('<span class="pn-pos-compact"></span>'));
    thrPos.querySelector('.pn-pos-full').textContent = `${n} thread${n === 1 ? '' : 's'}`;
    thrPos.querySelector('.pn-pos-compact').textContent = `${i < 0 ? '–' : i + 1}/${n}`;
    thrPos.title = `${n} total thread${n === 1 ? '' : 's'}`; thrPos.setAttribute('aria-label', thrPos.querySelector('.pn-pos-full').textContent);
    if (!thrTl.querySelector('.pn-open-label')) { const label=el('<span class="pn-open-label"><span class="pn-open-number"></span><span class="pn-open-key" aria-hidden="true"></span></span>'); const badge=totalBadge(n,waiting.length>0);badge.classList.add('pn-rail-total');thrTl.replaceChildren(label,badge); }
    thrTl.querySelector('.pn-open-number').textContent = `${waiting.length} open`; updateTotal(thrTl.querySelector('.pn-rail-total'),n,waiting.length>0);
    let leftTotal=out.querySelector('.pnO-total');if(!leftTotal){leftTotal=el('<div class="pnO-total"></div>');leftTotal.append(totalBadge(n,waiting.length>0));out.querySelector('.hd').after(leftTotal);}updateTotal(leftTotal.querySelector('.pn-total-badge'),n,waiting.length>0);
    thrTl.disabled = !waiting.length; thrPv.disabled = thrNx.disabled = !n; thrShow(true);
    const ids = new Set(waiting.map((a) => a.id)), reopened = new Set(threads.filter(t => ids.has(t.id) && loopStates.get(t.id)?.open === false).map(t => t.id));
    for (const [index, t] of threads.entries()) {
      let position = t.row.querySelector(':scope > .pn-thread-position');
      if (!position) {
        position = el('<div class="pn-thread-position"></div>');
        t.row.prepend(position);
      }
      const number = `${index + 1} of ${n}`;
      if (position.textContent !== number) position.textContent = number;
      const on = ids.has(t.id), before = loopStates.get(t.id), h = t.row.querySelector('.h');
      t.row.classList.toggle('wait', on);
      let dot = h?.querySelector('.pn-open-dot');
      if (on && h && !dot) { dot = el('<span class="pn-open-dot" role="img" aria-label="Open thread" title="Open thread"></span>'); h.prepend(dot); }
      if (!on && dot) dot.remove();
      if (before?.open === false && on && ui.notes) popLoopIn(dot,t.id);
      if (before?.open && !on) popLoop(before.rect,t.id);
      loopStates.set(t.id, { open:on, rect:dot?.getBoundingClientRect() || null });
    }
    for (const id of loopStates.keys()) if (!threads.some((t) => t.id === id)) loopStates.delete(id);
    col.querySelectorAll('.pnN-mk').forEach((m) => {
      const w = ids.has(m.dataset.id); m.classList.toggle('wt', w); m.classList.toggle('ans', !w);
      let dot = m.querySelector('.pn-rail-dot');
      if (w && !dot) { dot = el('<span class="pn-rail-dot" role="img" aria-label="Open thread"></span>'); m.append(dot); }
      if (!w && dot) dot.remove();
      if (!ui.notes && reopened.has(m.dataset.id)) popLoopIn(dot,m.dataset.id);
      if (w && dot && !ui.notes) { const item = loopStates.get(m.dataset.id); if (item) item.rect = dot.getBoundingClientRect(); }
    });
  }
  // top: a move to an open thread starts at its head (threadTop); the arrows, stepping through every thread, keep their usual placement
  function thrGo(t, quiet = 'step', top = true) {
    if (!t) return;
    const id = t.row ? t.id : 'q:' + t.id;
    clearTimeout(nextT); thrAt = id;
    const part = blockEl(partOfRow(id)), panel = showPart(part);
    if (quiet === 'next' && panel && !away(part)) {
      quiet = 'next-tab';
      if (!reduced()) {
        const fade = [{ opacity: 0 }, { opacity: 1 }];
        const timing = { duration: 240, easing: 'ease-out' };
        [panel, col, links].forEach((element) => element.animate(fade, timing));
      }
    }
    if (id.startsWith('q:')) { const a = askBy(id.slice(2)); if (nudge.on) nudge.at = a.id; askGo(a, quiet, top); }
    else { if (col.contains(ROOT.activeElement)) ROOT.activeElement.blur(); replying = null; rewriting = null; if (!ui.notes) setNotes(true); shown = null; questionMove = quiet === 'next'; try { select(id, top); } finally { questionMove = false; } }
  }
  function thrStep(d) {
    const threads = allThreads(); if (!threads.length) return;
    const here = threads.findIndex((t) => t.id === (sel || thrAt));
    thrGo(threads[here < 0 ? (d > 0 ? 0 : threads.length - 1) : (here + d + threads.length) % threads.length], 'step', false);
  }
  thrPv.onclick = () => thrStep(-1); thrNx.onclick = () => thrStep(1);
  thrTl.onclick = () => thrGo(allThreads().find(threadWaiting));
  thr.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });   // the Reply box the user is in keeps its focus
  thr.addEventListener('keydown', (e) => {
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    e.preventDefault(); e.stopPropagation(); thrStep(e.key === 'ArrowLeft' ? -1 : 1);
  });
  addEventListener('keydown', (e) => {
    if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || e.isComposing || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const field = tgt(e).closest?.('input,textarea,select,[contenteditable]');
    if (field && !(col.contains(field) && field.matches('textarea.re'))) return;
    e.preventDefault(); thrStep(e.key === 'ArrowUp' ? -1 : 1);
  });

  // ---------- the opening: every round opens the same way (the user picked "E · Wipe", then widened it: "do a wipe for all rounds"). The page opens as the user
  // left it: the version before this one in a sealed frame over the page (add_notes.py's snapshot of it, `.<page
  // file>.prev.js`), or on round one a blank page, and on a later round the bar in the look the user left (Updating, or Done) with the
  // Outline naming the version the user left. The round turns (the bar's fade and roll, "a new round" below: "that's what kicks off the
  // subsequent round's animations"). Then the agent's cursor clicks the top left of the page's content in the window, and a
  // soft edge runs down the window from there, the new version above it and the old one below, while the cursor waits at
  // its click ("cursor needs to click on top left of [the] content to get the wipe started"). Only then does it go to the
  // notes column and post its messages there, one at a time ("the agent can only be on screen in one place at a time").
  // Only the window plays; below it the page is simply there. A scroll, click or key finishes it at once. Once per round,
  // kept in human-feedback:built/<page> once it finishes or the user skips it. An unseen round waits for its first visit. add_notes.py
  // hides the page from its first paint with a style in its head, until the layer takes over here (`drawn`) ----------
  const OP_KEY = 'human-feedback:built/' + PN.PAGE;
  const OP_STAMP = 'round:' + PN.ROUND;
  const opKeep = () => { try { localStorage.setItem(OP_KEY, OP_STAMP); } catch (e) { /* storage blocked */ } };
  let opSeen = null; try { opSeen = localStorage.getItem(OP_KEY); } catch (e) { /* storage blocked */ }
  // Older layers kept the last run's made time. Round one is already seen even after a rerun refreshes made. A plain
  // page's later in-place rounds could not play before this fix; only an exact timestamp marks a legacy later round.
  if (/^[1-9]\d*$/.test(opSeen || '') && (PN.ROUND === 1 || opSeen === String(PN.MADE))) {
    opSeen = OP_STAMP;
    opKeep();
  }
  // a plain page's current round, or the latest version (a page that takes its notes in place has no earlier file)
  const OP_ON = ((!V && PN.LISTED <= 1) || (!!V && V.cur === V.last)) && opSeen !== OP_STAMP && !reduced();
  // WIPE: the edge's run down the window, at half the mockup's speed (the user: "speed 50%", "Just the wipe"); SOFT: its band,
  // the old words fading out over its lower half and the new ones in over its upper half, so the two never show at once
  const OP = { WIPE: 1800, SOFT: 140, live: false, over: false, cur: null, cover: null, veil: null, fr: null, ol: null };
  if (OP_ON) {
    building = true; OP.live = true;
    pageCss(`html.${P}wait body{visibility:hidden!important}`);
    document.documentElement.classList.add(P + 'wait');
    WRAP.classList.add('pn-opwait');   // the Outline's words wait too, until the earlier ones are over them
  }
  document.documentElement.classList.add(P + 'drawn');   // add_notes.py's hold goes; ours, if any, has taken over
  // the cover sits over the page and under everything of the layer's: the notes column, its scrollbar and buttons too.
  // The ties from the notes to their parts point at the new version's words, so they wait until the cover has gone
  css(`.pnWp{position:fixed;inset:0;z-index:2147480700;pointer-events:none;overflow:hidden}
    .pnWp>*{position:absolute;left:0;top:0;width:100%;height:100%;margin:0;border:0;display:block}
    .pnWp.gone{opacity:0;transition:opacity calc(.15s * var(--pn-k,1)) ease-out}
    .pn-wiping .pnN-links{opacity:0} .pnN-links{transition:opacity calc(.2s * var(--pn-k,1)) ease}
    .pn-opwait .pnO:not(.pnWo) :is(.ol,.hd .ttl,.pnV){visibility:hidden}
    .pnWo-v{position:fixed;left:0;top:0;bottom:0;z-index:2147482040;box-sizing:border-box;background:var(--pn-side);border-right:1px solid var(--pn-hair);pointer-events:none}
    .pnO.pnWo{z-index:2147482050;pointer-events:none}`);
  const frClear = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
  // ---------- tabs: role="tab" with aria-controls, naming a role="tabpanel", is all a page needs (the user: "make sure human-feedback
  // can natively handle tabs"). The layer switches panels and keeps aria-selected only when the page's own script hasn't; it
  // never binds keys, since ← and → are the version stepper's. The tab in view is kept for this browser tab, across reloads and
  // versions, so a saved scroll depth lands in the panel it was read in. A link to something in a closed panel opens it ----------
  const panelOf = (t) => document.getElementById(t.getAttribute('aria-controls') || '') || (t.id && document.querySelector(`[role="tabpanel"][aria-labelledby="${CSS.escape(t.id)}"]`)) || null;
  const tabSet = (t) => t.closest('[role="tablist"]') || t.parentElement;
  const tabsIn = (set) => [...set.querySelectorAll('[role="tab"]')].filter(panelOf);
  const tabSets = () => [...new Set([...document.querySelectorAll('[role="tab"]')].filter((t) => !inLayer(t) && panelOf(t)).map(tabSet))];
  const tabKey = (t) => t.getAttribute('aria-controls') || t.id;
  const TABS = 'human-feedback:tabs/' + PN.COUNT_PAGE;
  const tabsKept = () => { try { return JSON.parse(sessionStorage.getItem(TABS)) || {}; } catch (e) { return {}; } };
  function openTab(t) { tabsIn(tabSet(t)).forEach((x) => { x.setAttribute('aria-selected', String(x === t)); panelOf(x).hidden = x !== t; }); }
  let barBg = '';
  function tabBar() {   // a sticky bar needs the page's own colour behind it; a mutation of this style calls here again, so only a change writes
    const c = opBg(); if (c !== barBg) document.documentElement.style.setProperty(`--${P}tabbg`, barBg = c);
  }
  document.addEventListener('click', (e) => {
    const t = tgt(e).closest?.('[role="tab"]'), panel = t && !inLayer(t) && panelOf(t); if (!panel) return;
    if (away(panel)) {   // the page's own script, if it has one, ran first and didn't open it
      openTab(t);
      if (!away(panel)) {   // landed clear of a sticky bar, or at the bar when it scrolled away
        const c = topCover(panel), y = (c ? panel : t).getBoundingClientRect().top; if (y < c) scrollTo(0, y + scrollY - c);
        dispatchEvent(new Event('resize'));   // what the page's own scripts measured in a closed panel measures again
      }
    }
    try { sessionStorage.setItem(TABS, JSON.stringify({ ...tabsKept(), [tabSets().indexOf(tabSet(t))]: tabKey(t) })); } catch (e) { /* storage blocked: the first tab next time */ }
  });
  addEventListener('hashchange', () => {
    const n = document.getElementById(decodeURIComponent(location.hash.slice(1))); if (!n || !away(n)) return;
    showPart(n); scrollTo(0, n.getBoundingClientRect().top + scrollY - topCover(n));
  });
  function bootTabs() {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1))), kept = tabsKept();
    tabSets().forEach((set, i) => {
      const tabs = tabsIn(set), open = tabs.filter((t) => !away(panelOf(t)));
      const pick = tabs.find((t) => target && panelOf(t).contains(target)) || tabs.find((t) => tabKey(t) === kept[i])
        || tabs.find((t) => t.getAttribute('aria-selected') === 'true') || open[0] || tabs[0];
      if (open.length !== 1) openTab(pick);   // written with none closed: only the one in view stays
      else if (open[0] !== pick) pick.click();   // the click, so a page's own script opens it too
      else if (!tabs.some((t) => t.getAttribute('aria-selected') === 'true')) pick.setAttribute('aria-selected', 'true');
    });
  }
  // the page's own background: the blank page, and the veil the new words fade in from
  function opBg() {
    for (const x of [document.body, document.documentElement]) { const c = getComputedStyle(x).backgroundColor; if (!frClear(c)) return c; }
    const cs = getComputedStyle(document.documentElement).colorScheme;
    return /dark/.test(cs) && (!/light/.test(cs) || matchMedia('(prefers-color-scheme: dark)').matches) ? 'rgb(18, 18, 18)' : '#fff';
  }
  // the snapshot add_notes.py took of the version before this one, when it made this one: a script beside the page, so it
  // loads from file:// with no server. One taken from any other version is none, and so is a version made before 1.69.0:
  // it opens on a blank page, as round one does
  const PREV_JS = '.' + (decodeURIComponent(location.pathname.split('/').pop()) || 'index.html') + '.prev.js';
  function opPrev() {
    return new Promise((ok) => {
      let got = null;
      const from = V.list[V.cur - 1].file, sc = document.createElement('script');
      window.PN_PREV = (d) => { if (d && typeof d.html === 'string' && d.from === from) got = d.html; };
      const end = () => { sc.remove(); delete window.PN_PREV; ok(got); };
      sc.onload = sc.onerror = end; setTimeout(end, 2500);
      sc.src = PREV_JS; document.head.appendChild(sc);
    });
  }
  // the old version in a sealed frame: its own styles and pictures and none of its scripts, laid out at the window's width
  // with the layer's room at its sides, so it sits where the user saw it
  function opFrame(html) {
    const cs = getComputedStyle(document.body);
    const fit = `<style>html{scrollbar-width:none}html::-webkit-scrollbar{display:none}body{padding-left:${cs.paddingLeft}!important;padding-right:${cs.paddingRight}!important}</style>`;
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-same-origin'); f.setAttribute('tabindex', '-1'); f.setAttribute('aria-hidden', 'true');
    f.srcdoc = /<\/head\s*>/i.test(html) ? html.replace(/<\/head\s*>/i, (m) => fit + m) : fit + html;
    return f;
  }
  // the edge at `y` in the window: the new version above it, the old one below. The old words fade out over the band's
  // lower half and a veil of the background fades the new ones in over its upper half (the mockup's edge())
  const opRamp = (a, b) => `linear-gradient(to bottom,transparent 0,transparent ${a.toFixed(1)}px,#000 ${b.toFixed(1)}px)`;
  function opMask(y, old, veil) {
    const s = OP.SOFT / 2, o = opRamp(y, y + s), v = opRamp(y - s, y + 0.01);
    if (old) { old.style.webkitMaskImage = o; old.style.maskImage = o; segOff(old); }
    veil.style.webkitMaskImage = v; veil.style.maskImage = v; segOff(veil);
  }
  const opEdge = (y) => opMask(y, OP.fr, OP.veil), opOlEdge = (y) => opMask(y, OP.ol.c, OP.ol.v);
  // the earlier version's Outline rows, from its page in the frame: its captions and its parts, as outline() lists them,
  // without counts (the copy's header is the new version's own)
  function opRows(doc) {
    const parts = [...doc.querySelectorAll('[data-note]')], set = new Set(parts), rows = [];
    const lab = (b) => { if (b.dataset.note) return b.dataset.note; const s = (b.querySelector('h1,h2,h3,h4,h5,h6') || b).textContent.replace(/\s+/g, ' ').trim(); return s.length > 60 ? s.slice(0, 57) + '…' : s; };
    for (const { n, kind, depth } of olItems(doc, (x) => set.has(x))) rows.push(el(kind === 'part' ? olRow(lab(n), depth) : olCap((kind === 'tab' ? tabOf(n) : n).textContent.trim(), depth)));
    return rows;
  }
  // the Outline as the user left it: a copy laid over it, over a veil of its own background, with the earlier version's rows (none
  // on round one). Both are cut off at the bar's bottom hairline, so the bar (the tool's
  // name, the About mark and the collapse button) is the new version's throughout and never takes part in the wipe (the user,
  // 1.85.0: "have it start at the top of the outline below the horiz bar, so not including the title"). None while it's on
  // its rail or hidden
  function opOutline() {
    if (WRAP.classList.contains('pnL-rail') || getComputedStyle(out).visibility === 'hidden' || !out.offsetWidth) return null;
    const c = out.cloneNode(true), ol = c.querySelector('.ol');
    c.classList.add('pnWo'); c.setAttribute('aria-hidden', 'true'); c.inert = true; ol.innerHTML = '';
    let doc = null; try { doc = OP.fr?.contentDocument; } catch (e) { /* a frame we can't reach: no rows */ }
    if (doc?.body) opRows(doc).forEach((x) => ol.appendChild(x));
    const v = el('<div class="pnWo-v" aria-hidden="true"></div>'), o = out.getBoundingClientRect(), top = opOlTop();
    v.style.width = o.width + 'px'; c.style.clipPath = v.style.clipPath = `inset(${top}px 0 0 0)`;
    WRAP.append(v, c);
    return { c, v, top };
  }
  // the top of the Outline under its bar: the bar's bottom hairline's foot, where the shelf or the list starts
  const opOlTop = () => out.querySelector('.hd').getBoundingClientRect().bottom;
  // the foot of the Outline's words, its earlier rows' or its new ones', whichever runs further
  const opOlEnd = () => textEnd(OP.ol?.c.querySelector('.ol'), out.querySelector('.ol'));
  function opOutlineGone() { OP.ol?.c.remove(); OP.ol?.v.remove(); OP.ol = null; }
  const opScroll = () => { try { OP.fr?.contentDocument?.scrollingElement?.scrollTo(scrollX, scrollY); } catch (e) { /* a frame we can't reach shows its top */ } };
  async function opCoverUp(atEnd) {
    const html = OP.prevHtml !== undefined ? OP.prevHtml : (OP.prevHtml = V && V.cur > 0 ? await opPrev() : null);
    const c = el(`<div class="pnWp" aria-hidden="true" style="--pn-k:${SLOW}"><div></div></div>`);
    OP.veil = c.firstChild; OP.veil.style.background = opBg();
    let loaded = null;
    if (html) { OP.fr = opFrame(html); loaded = new Promise((ok) => { OP.fr.onload = ok; setTimeout(ok, 2500); }); c.append(OP.fr); }
    const y = atEnd ? innerHeight + OP.SOFT : -OP.SOFT * 2;
    OP.cover = c; opEdge(y); WRAP.appendChild(c); WRAP.classList.add('pn-wiping');
    if (loaded) await loaded;
    try { document.querySelectorAll('[role="tabpanel"][id]').forEach((p) => { const was = OP.fr?.contentDocument?.getElementById(p.id); if (was) was.hidden = p.hidden; }); } catch (e) { /* a frame we can't reach shows its first tab */ }   // the version before, on the tab in view
    opScroll();
    if (!OP.over && (OP.ol = opOutline())) opOlEdge(y);
    WRAP.classList.remove('pn-opwait');
  }
  // where the first line of words in view starts, inside `root`
  function textStart(root) {
    const H = innerHeight, rg = document.createRange();
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (/\S/.test(n.data) && !n.parentElement.closest('script,style,svg,textarea,noscript') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    for (let n; (n = tw.nextNode());) {
      rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (r.width > 0 && r.top >= 0 && r.top < H - 40) return { x: r.left, y: r.top };
    }
    return null;
  }
  // where the last words or picture in view end, inside each of `roots`: the foot of what a wipe there changes (null: none)
  function textEnd(...roots) {
    const H = innerHeight, rg = document.createRange(); let end = null;
    const see = (r) => { if (r.width > 0 && r.height > 0 && r.top < H && r.bottom > 0) end = Math.max(end ?? 0, Math.min(H, r.bottom)); };
    for (const root of roots) {
      if (!root) continue;
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: (n) => (n.nodeType === 1 ? (n.matches('script,style,textarea,noscript,.pn-ui') ? NodeFilter.FILTER_REJECT : n.matches('img,svg,video,canvas,picture,iframe') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) : (/\S/.test(n.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)) });
      for (let n; (n = tw.nextNode());) {
        if (n.nodeType === 1) { see(n.getBoundingClientRect()); continue; }
        rg.selectNodeContents(n); for (const r of rg.getClientRects()) see(r);
      }
    }
    return end;
  }
  // the top left of the page's content in the window
  function opStart() {
    const b = document.body.getBoundingClientRect(), cs = getComputedStyle(document.body);
    return textStart(document.body) || { x: b.left + parseFloat(cs.paddingLeft), y: clamp(b.top + parseFloat(cs.paddingTop), 24, innerHeight / 3) };
  }
  function tapRing(x, y, cls) {
    const r = el(`<div class="pnRg${cls ? ' ' + cls : ''}"></div>`); r.style.left = x + 'px'; r.style.top = y + 'px'; WRAP.appendChild(r);
    goneAfter(r.animate([{ opacity: 0.7, transform: 'scale(.3)' }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 420 * SLOW, easing: 'cubic-bezier(.2,.7,.25,1)' }), r);
  }
  // ---------- agents do only what they own (the user, on round 3: "each
  // agent can't misrepresent what they owned ... they should move independently ... except that the key actions need to
  // happen in sequence"; the user "loves it"). add_notes.py --helper and --owns write who helped and what each made into the tag
  // (data-agents). The key actions keep their order: the round number, then the Outline, then the page, then the notes.
  // Between them each agent moves on its own: it comes in when it likes, waits only for the key action before its own, and
  // leaves once its last job is done. The round number is a helper's (the first with nothing of its own in view, else the
  // first); the Outline is the lead's; on the page each agent wipes only its own parts in view, each with its own edge, so two
  // can wipe at once; the notes are the lead's, since it wrote every message. A helper with no job in view doesn't come.
  // With no helper none of this runs: the opening is the one agent's, as it always was ----------
  const normLabel = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const HELPERS = PN.AGENTS.filter((a) => a && !a.lead && a.name).slice(0, 3)
    .map((a) => ({ name: String(a.name), owns: new Set((Array.isArray(a.owns) ? a.owns : []).map(normLabel)) }));
  // the lead keeps --pn-agent (violet); Codex is magenta and Gemini indigo, as in the mockup, and any other the next free one
  const HUES = [['#c026d3', '#d65bf0'], ['#4f46e5', '#8b87f7'], ['#db2777', '#f0609e']];
  const HUE_FOR = [[/codex|openai|chatgpt/i, 0], [/gemini|jules|antigravity/i, 1]];
  {
    const used = new Set();
    HELPERS.forEach((h) => { const k = HUE_FOR.find(([re]) => re.test(h.name)); if (k && !used.has(k[1])) { h.hue = k[1]; used.add(k[1]); } });
    HELPERS.forEach((h) => { if (h.hue == null) { h.hue = [0, 1, 2].find((k) => !used.has(k)); used.add(h.hue); } });
  }
  if (HELPERS.length) {
    css(HELPERS.map((h, i) => `.pnC.h${i}{--pn-agent:${HUES[h.hue][0]};z-index:${2147483099 - i}} .pnRg.h${i}{border-color:${HUES[h.hue][0]}}
      :where(.pn-dark) .pnC.h${i}{--pn-agent:${HUES[h.hue][1]}} :where(.pn-dark) .pnRg.h${i}{border-color:${HUES[h.hue][1]}}`).join('\n'));
  }
  // what each agent did, in order, for checking the order (the tests read it): [ms since the opening began, agent, what]
  const OPLOG = []; PN.opLog = OPLOG;
  let opT0 = performance.now();
  const opNote = (who, what, c) => { if (OPLOG.length < 500) OPLOG.push([Math.round(performance.now() - opT0), who, what, ...(c ? [Math.round(c.x), Math.round(c.y)] : [])]); };
  PN.opT0 = () => opT0;
  const AG_LIVE = new Set();   // the helpers' cursors on screen
  function agCursor(i) { const h = cursor(HELPERS[i].name); h.el.classList.add('h' + i); h.cls = 'h' + i; h.who = HELPERS[i].name; AG_LIVE.add(h); return h; }
  function agGone() {
    AG_LIVE.forEach((h) => { if (h.leaving) return; fadeOff(h.el); });
    AG_LIVE.clear();
  }
  const helperOf = (n) => HELPERS.findIndex((h) => h.owns.has(normLabel(PN.blockLabel(n))));
  // helper i's parts in the window, top to bottom, each a band of the window with the spot it clicks (its first words)
  function agBands(i) {
    const H = innerHeight;
    return [...document.querySelectorAll('[data-note]')].filter((n) => !n.closest('.pn-ui') && helperOf(n) === i).map((n) => ({ n, r: n.getBoundingClientRect() }))
      .filter(({ r }) => r.height > 0 && r.bottom > 40 && r.top < H - 60)
      .map(({ n, r }) => ({ n, s0: Math.max(0, r.top - 8), s1: Math.min(H, r.bottom + 8), at: textStart(n) || { x: r.left + 20, y: Math.max(r.top + 20, 24) } }));
  }
  function place(c, p) { c.placed = true; c.el.classList.add('nt'); put(c, p.x, p.y); showTag(c); void c.el.offsetWidth; c.el.classList.remove('nt'); }
  const gate = () => { let open; const p = new Promise((ok) => { open = ok; }); p.open = open; return p; };
  // the page's edge, split by owner: each band of the window has its own edge, one mask layer per band (opMask clears it)
  function segOff(n) { ['maskSize', 'webkitMaskSize', 'maskPosition', 'webkitMaskPosition', 'maskRepeat', 'webkitMaskRepeat'].forEach((k) => { n.style[k] = ''; }); }
  function opSegs(segs) {
    const s = OP.SOFT / 2;
    const img = (a, b) => segs.map((q) => opRamp(a(q.y) - q.s0, b(q.y) - q.s0)).join(',');
    const size = segs.map((q) => `100% ${(q.s1 - q.s0).toFixed(1)}px`).join(','), pos = segs.map((q) => `0 ${q.s0.toFixed(1)}px`).join(',');
    const set = (n, m) => { if (!n) return; n.style.webkitMaskImage = n.style.maskImage = m; n.style.webkitMaskSize = n.style.maskSize = size; n.style.webkitMaskPosition = n.style.maskPosition = pos; n.style.webkitMaskRepeat = n.style.maskRepeat = 'no-repeat'; };
    set(OP.fr, img((y) => y, (y) => y + s)); set(OP.veil, img((y) => y - s, (y) => y + 0.01));
  }
  // an edge's run from y0 down past `foot`, at the full wipe's speed: `bottom` the moment it reaches `foot`, where its agent
  // moves on, `done` once it's out. `whole`: the full wipe's time however far it runs, as the lone agent's edge from its
  // click to below the window's foot. `go` (default `foot`): `bottom` opens once the edge passes it instead, as at a column's
  // last words, so the agent needn't wait out the run's slow end through the empty space below them. It holds while the user is away
  function wipeRun(y0, foot, edge, whole = false, go = foot) {
    const cover = OP.cover;
    const from = y0 - OP.SOFT / 2, to = foot + OP.SOFT / 2;
    const ms = OP.WIPE * SLOW * (whole ? 1 : clamp((to - from) / (innerHeight + OP.SOFT), 0.35, 1));
    const bottom = gate();
    const done = new Promise((ok) => {
      let t0 = performance.now(), last = t0;
      const step = () => {
        if (OP.over || OP.cover !== cover) { bottom.open(); return ok(); }
        const now = performance.now(); if (!watching() || now - last > 250) t0 += now - last; last = now;
        const t = Math.min(1, (now - t0) / ms), y = from + (to - from) * mj(t);
        edge(y); if (y >= Math.min(go, foot)) bottom.open();
        if (t < 1) requestAnimationFrame(step); else { bottom.open(); ok(); }
      };
      requestAnimationFrame(step);
    });
    return { bottom, done };
  }
  // the shared opening: returns the lead's cursor, on the page or not, once every share of the page has reached its bottom
  async function opShared() {
    const dead = () => OP.over, H = innerHeight, cover = OP.cover;
    const bands = HELPERS.map((h, i) => agBands(i));
    const free = bands.findIndex((b) => !b.length), turnBy = roundTurn ? (free >= 0 ? free : 0) : -1;
    // the window's bands by owner: each helper part's, and the lead's in between; one edge each
    const own = [];
    bands.forEach((bs, i) => bs.forEach((b) => own.push({ s0: b.s0, s1: b.s1, y: -OP.SOFT * 2, who: i, b })));
    own.sort((p, q) => p.s0 - q.s0);
    for (let k = 1; k < own.length; k++) own[k].s0 = Math.max(own[k].s0, own[k - 1].s1);   // parts that touch don't overlap
    const lead = []; let y0 = 0;
    own.forEach((q) => { if (q.s0 > y0 + 1) lead.push({ s0: y0, s1: q.s0, y: -OP.SOFT * 2, who: 'L' }); y0 = Math.max(y0, q.s1); });
    if (y0 < H - 1) lead.push({ s0: y0, s1: H, y: -OP.SOFT * 2, who: 'L' });
    const segs = [...own, ...lead].filter((q) => q.s1 - q.s0 > 1).sort((p, q) => p.s0 - q.s0);
    PN.opSegs = segs.map((q) => ({ s0: q.s0, s1: q.s1, who: q.who === 'L' ? AGENT : HELPERS[q.who].name }));
    const edgeOf = (who, b) => (v) => { segs.forEach((q) => { if (q.who === who && (!b || q.b === b)) q.y = v; }); opSegs(segs); };
    opSegs(segs);
    // the lead's first words in view, outside every helper's parts
    const theirs = (n) => { for (let q = n.parentElement?.closest('[data-note]'); q; q = q.parentElement?.closest('[data-note]')) if (helperOf(q) >= 0) return true; return false; };
    const leadStart = () => {
      const rg = document.createRange();
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (/\S/.test(n.data) && !n.parentElement.closest('script,style,svg,textarea,noscript,.pn-ui') && !theirs(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
      for (let n; (n = tw.nextNode());) {
        rg.selectNodeContents(n);
        for (const r of rg.getClientRects()) if (r.width > 0 && r.top >= 0 && r.top < H - 40 && lead.some((q) => r.top >= q.s0 && r.top < q.s1)) return { x: r.left, y: r.top };
      }
      const q = lead[0]; return { x: opStart().x, y: clamp(q.s0 + 24, 24, H - 40) };
    };
    // the key actions' ends, in their order: the round turned, the Outline's wipe at its bottom, each share of the page at its
    const G = { turn: gate(), outline: gate(), lead: gate() }, ends = bands.map((bs) => bs.map(() => gate())), pageDone = [];
    if (turnBy < 0) G.turn.open();
    const cur = OP.cur = cursor();
    const flyIn = async (c, at) => { if (!c.placed) { place(c, entry(at, c.tag.offsetWidth)); opNote(c.who || AGENT, 'enter'); } await fly(c, () => at, { over: 0, dead }); };
    // the lead: the Outline, then its share of the page; it may come in before the round turns, or after
    (async () => {
      try {
        await beat(rnd(0, 1500)); if (dead()) return;
        const olb = OP.ol && OP.ol.c.querySelector('.ol').getBoundingClientRect();
        if (olb && olb.height > 0) {
          const at = { x: olb.left + 20 * UI, y: olb.top + 6 * UI };
          await flyIn(cur, at); if (dead()) return;
          await G.turn; if (dead()) return;
          press(cur); tapRing(at.x, at.y); opNote(AGENT, 'outline', cur);
          const w = wipeRun(OP.ol.top, H, opOlEdge, false, opOlEnd() ?? H); w.done.then(opOutlineGone);
          await w.bottom; opNote(AGENT, 'outline bottom'); if (dead()) return;
        } else { opOutlineGone(); await G.turn; if (dead()) return; }
        G.outline.open();
        if (lead.length) {
          const at = leadStart();
          await flyIn(cur, at); if (dead()) return;
          press(cur); tapRing(at.x, at.y); opNote(AGENT, 'page', cur);
          const w = wipeRun(at.y, H, edgeOf('L')); pageDone.push(w.done);
          await w.bottom; opNote(AGENT, 'page bottom');
        }
      } finally { G.outline.open(); G.lead.open(); }
    })();
    // each helper: the round number if it's its job, then its own parts in view; then it goes, whatever the others are doing
    const helperDone = HELPERS.map((a, i) => (async () => {
      const mine = bands[i], turn = i === turnBy;
      try {
        if (!mine.length && !turn) return;
        await beat(turn ? rnd(0, 700) : rnd(150, 1700)); if (dead()) return;
        const h = agCursor(i);
        if (turn) {
          const r = bar.querySelector('.rn').getBoundingClientRect(), at = { x: r.left + r.width * 0.5, y: r.top + r.height * 0.55 };
          await flyIn(h, at); if (dead()) return;
          press(h); tapRing(at.x, at.y, h.cls); opNote(a.name, 'round', h);
          await roundTurn(); opNote(a.name, 'round done'); G.turn.open(); if (dead()) return;
        }
        for (let k = 0; k < mine.length; k++) {
          const b = mine[k];
          await flyIn(h, b.at); if (dead()) return;
          await G.outline; if (dead()) return;
          await beat(rnd(30, 380)); if (dead()) return;   // its own moment, not the lead's
          press(h); tapRing(b.at.x, b.at.y, h.cls); opNote(a.name, 'part:' + PN.blockLabel(b.n), h);
          const w = wipeRun(b.at.y, b.s1, edgeOf(i, b)); pageDone.push(w.done);
          await w.bottom; opNote(a.name, 'part bottom:' + PN.blockLabel(b.n)); ends[i][k].open(); if (dead()) return;
        }
        await beat(rnd(60, 260)); if (dead()) return;
        const away = exit(h); leave(h); opNote(a.name, 'leave');
        await fly(h, () => away, { over: 0, pace: rnd(0.8, 0.95), dead: () => false });
        h.el.remove(); AG_LIVE.delete(h);
      } finally { ends[i].forEach((e) => e.open()); if (turn) G.turn.open(); }
    })());
    // the notes wait for every share of the page to reach its bottom
    await Promise.all([G.lead, ...ends.flat()]);
    Promise.all(pageDone).then(() => { if (!cover) return; if (!cover.classList.contains('gone')) cover.remove(); if (OP.cover !== cover) return; OP.cover = null; WRAP.classList.remove('pn-wiping'); });
    return { cur, done: Promise.all([...pageDone, ...helperDone]) };
  }
  async function opRun() {
    if (!rpOn) { OPLOG.length = 0; opT0 = performance.now(); }   // Replay's log starts at its press
    rpSync();
    if (!OP.cover) await opCoverUp(); if (OP.over) return;
    document.documentElement.classList.remove(P + 'wait');
    await beat(300); if (OP.over) return;   // a beat on the page as the user left it
    if (HELPERS.length) {
      const { cur: lead, done } = await opShared(); if (OP.over) return;
      building = false;
      const have = lead.placed ? lead : null; if (!have) lead.el.remove();
      const todo = ui.notes ? jobsInView() : [];
      opNote(AGENT, 'notes');
      if (todo.length) await visit(todo, have || undefined);
      else { if (ui.notes) landAll(); if (have) { const away = exit(have); leave(have); await fly(have, () => away, { over: 0, pace: rnd(0.8, 0.95), dead: () => false }); have.el.remove(); } }
      await done; if (OP.over || OP.cur !== lead) return;
      opKeep();
      OP.cur = null; OP.live = false; OP.over = true; rpSync();
      ewArm(200);
      return;
    }
    if (roundTurn) { opNote('', 'round'); await roundTurn(); if (OP.over) return; opNote('', 'round done'); }
    // the agent comes in and wipes each column in turn, the Outline, then the page, then the notes (the user: "column one ...
    // happens first, and then column two happens second, and then column three happens third"): it clicks the top left of
    // the column's words, and the click starts its wipe ("simultaneously with the start of the animation")
    const cur = OP.cur = cursor(), dead = () => OP.over;
    let fresh = true;
    // it moves on as the edge passes the column's last words (the user, 1.97.2: "make it feel to the user that there's zero
    // wait between when an animation ... finishes and when it starts moving over to column two"); the edge runs on out
    // below them while it flies, and `start` returns that run's end as `{ done }` (a bare promise would be awaited too)
    const start = async (at, edge, y0 = at.y, go) => {
      if (fresh) { fresh = false; const p = entry(at, cur.tag.offsetWidth); cur.el.classList.add('nt'); put(cur, p.x, p.y); showTag(cur); void cur.el.offsetWidth; cur.el.classList.remove('nt'); }
      await fly(cur, () => at, { over: 0, dead }); if (OP.over) return null;
      press(cur); tapRing(at.x, at.y);
      const w = wipeRun(y0, innerHeight, edge, true, go?.() ?? innerHeight);
      await w.bottom; return { done: w.done };
    };
    // the Outline's click is at the top left of its list, where the agent writes it, never on a row's words or the header
    // (the user: "the agent should be clicking at the top of the outline, not the first row ... It's the outline that the
    // personified agent is writing"). Its wipe starts at the bar's foot, so nothing above it changes, and runs down through
    // the version shelf (the version the user left to this one) and the list
    if (OP.ol) {
      const b = OP.ol.c.querySelector('.ol').getBoundingClientRect();
      let out = null;
      if (b.height > 0) { opNote(AGENT, 'outline'); out = await start({ x: b.left + 20 * UI, y: b.top + 6 * UI }, opOlEdge, OP.ol.top, opOlEnd); if (OP.over) return; opNote(AGENT, 'outline bottom'); }
      const ol = OP.ol; (out?.done || Promise.resolve()).then(() => { if (OP.ol === ol) opOutlineGone(); });
    }
    // the cursor moves on the moment each wipe reaches the column's foot, with no pause after it (the user, 1.85.0: "the cursor
    // animation seems ot wait after the column finishes animating, can it move as soon as the animation finishes")
    opScroll(); opNote(AGENT, 'page');
    const cover = OP.cover, pageOut = await start(opStart(), opEdge, undefined, () => textEnd(document.body, OP.fr?.contentDocument?.body)); if (OP.over) return; opNote(AGENT, 'page bottom');
    pageOut.done.then(() => { if (!cover.classList.contains('gone')) cover.remove(); if (OP.cover !== cover) return; OP.cover = null; WRAP.classList.remove('pn-wiping'); });
    // then the notes column, with the same cursor: each message in view, top to bottom, then the rest land as it goes
    // (visit). With nothing there for it it goes, and what's further down is there as it does; with the column shut, the
    // rest wait for it
    building = false;
    const todo = ui.notes ? jobsInView() : [];
    opNote(AGENT, 'notes');
    if (todo.length) await visit(todo, cur);
    else { if (ui.notes) landAll(); const away = exit(cur); leave(cur); await fly(cur, () => away, { over: 0, pace: rnd(0.8, 0.95), dead: () => false }); cur.el.remove(); }   // a cut as it goes doesn't stop it (opCut)
    await pageOut.done; if (OP.over || OP.cur !== cur) return;
    opKeep();
    OP.cur = null; OP.live = false; OP.over = true; rpSync();
    ewArm(200);
  }
  // the user scrolled, clicked or pressed a key: everything playing lands at once, and so does every message further down. A
  // scroll or key comes at once; a press or touch once the user lets go and the user's click has gone through (cCutNow, cLetGo), as the
  // landing redraws the notes column and the Outline: done in the press, the row the user pressed went and the user's click was lost
  function opCut() {
    if (OP.over || !OP.live) return;
    OP.over = true; OP.live = false; building = false;
    opKeep();
    turnNow?.(); agGone(); rpSync();
    document.documentElement.classList.remove(P + 'wait'); WRAP.classList.remove('pn-opwait');
    opOutlineGone();
    if (OP.cover) { const c = OP.cover; OP.cover = null; c.classList.add('gone'); setTimeout(() => c.remove(), 200 * SLOW); }
    WRAP.classList.remove('pn-wiping');
    landAll();   // every message, ✅ and close, in view or not
    if (cBusy) cStop();   // the visit under way stops where it is, and its cursor goes
    // one already leaving flies on out past the edge (opRun)
    else if (OP.cur && !OP.cur.leaving) fadeOff(OP.cur.el);
    OP.cur = null;
    ewArm(200);
  }
  if (OP_ON) {
    // A selected tab can be visible behind another app. Wait for focus before starting its opening.
    let ready = document.readyState === 'complete', queued = false;
    const go = () => {
      if (!ready || queued || OP.started || OP.over || !watching()) return;
      queued = true;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        queued = false;
        if (OP.over || !watching()) return;
        document.removeEventListener('visibilitychange', go);
        removeEventListener('focus', go);
        OP.started = true;
        opRun().catch((e) => { opCut(); throw e; });   // a fault mid-way never leaves the page hidden
      }));
    };
    back(go);
    if (ready) go();
    else {
      const loaded = () => { ready = true; go(); };
      addEventListener('load', loaded, { once: true });
      setTimeout(loaded, 2500);   // start even if a picture never finishes loading
    }
  }
  // ---------- Replay in the Notes header of the latest version. Press it and both columns go back in one quick wipe up while the
  // round number rolls back and this round's messages fold away; then the opening plays again, with every agent as it
  // first did. A scroll, click or key finishes it at once, as it does the opening. Off while either plays; none under
  // reduced motion ----------
  let rpBtn = null, rpOn = false;
  function rpSync() { if (rpBtn) rpBtn.disabled = OP.live || rpOn; }
  if (V && V.cur === V.last && !reduced()) {
    // an icon button like the arrows beside it (the user: "the styling of
    // 'replay' is inconsistent with the rest of the webapp, fix that")
    rpBtn = el(`<button type="button" class="pn-icb pnRp" title="Replay how this version opened" aria-label="Replay how this version opened">${icon('ReplayIcon')}</button>`);
    roundAction.append(rpBtn);
    rpBtn.addEventListener('click', () => { replay().catch((e) => { opCut(); throw e; }); });
    rpSync();
  }
  const frame = () => new Promise((ok) => requestAnimationFrame(ok));
  // the round's messages and threads closed in chat, as they were before the opening played
  const rwPosts = () => (PN.ASKS_OPEN ? PN.ASKS.filter((a) => PN.answerable(a) && !PN.fromRound(a) && !PN.replied(state.answers[a.id])).map((a) => a.id) : []);
  const rwMarks = () => (PN.ASKS_OPEN ? PN.ASKS.filter((a) => a.ew) : []);
  async function replay() {
    if (OP.live || rpOn) return;
    rpOn = true; rpSync();
    try {
      if (scrollY > 1) {
        scrollTo({ top: 0, behavior: 'smooth' });
        const t0 = performance.now(); while (scrollY > 1 && performance.now() - t0 < 1500) await frame();
      }
      OP.over = false; OP.live = true; OP.started = true; building = true; landed = false; cCut = false;
      OPLOG.length = 0; opT0 = performance.now(); opNote(AGENT, 'replay');
      await opCoverUp(true); if (OP.over) return;
      await rwWipe(); if (OP.over) return;
      opNote(AGENT, 'rewound');
      await beat(340); if (OP.over) return;
      await opRun();
    } finally { rpOn = false; rpSync(); }
  }
  // one quick wipe back up over both columns: the messages fold away, the round number rolls back down, and the version
  // before comes back up from the bottom of the window
  async function rwWipe() {
    const H = innerHeight, from = H + OP.SOFT / 2, to = -OP.SOFT * 2, ms = 650 * SLOW, posts = rwPosts(), marks = rwMarks();
    posts.filter((id) => !postLive.has(id)).forEach((id) => ewEl(id)?.querySelectorAll(':scope > .qb').forEach((qb) => qb.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.97)' }], { duration: 160 * SLOW, easing: 'ease-in', fill: 'forwards' })));
    turnBack?.();
    setTimeout(() => {
      if (OP.over) return;
      posts.forEach((id) => { postLive.add(id); postStep.set(id, 'held'); delete ewSeen[id]; });
      marks.forEach((a) => { ewLive.add(a.id); delete ewSeen[a.id]; });
      renderRows(); thrSync(); outline();
    }, 170 * SLOW);
    const t0 = performance.now();
    while (!OP.over) {
      const u = Math.min(1, (performance.now() - t0) / ms), y = from + (to - from) * mj(u);
      opEdge(y); if (OP.ol) opOlEdge(y);
      if (u >= 1) break;
      await frame();
    }
    await beat(180);
  }

  // ---------- sent: once the user copies, the button reads Copy again (grey, it copies everything and leaves it locked) or Copy
  // 1 new note, and Unlock slides in beside it. Beside Round N the bar says where the round is: Copied, then Received once
  // the agent has the user's paste, Updating while it makes the next version, and Done ----------
  const rcv = bar.querySelector('.rcv');
  const unBtn = el(`<button type="button" class="pn-btn un" tabindex="-1" title="Make what you sent editable again">${icon('SquareUnlock02Icon')}<span>Unlock</span></button>`);
  mainCopy.after(unBtn);
  const copyLabel = () => { if (PN.PAST) return 'Earlier round: read only'; if (!PN.sentOn()) { const n = PN.feedbackCount(); return n ? `Copy ${n} note${n > 1 ? 's' : ''}` : 'Copy my feedback'; } const n = count(); return n ? `Copy ${n} new note${n > 1 ? 's' : ''}` : 'Copy again'; };
  let held = false, arriveT = 0;   // held: a receipt landed while the tab was out of view, so its arrival waits
  // the round's state, from the records: '' while the user writes, copied, received, updating, done. A receipt reads Received for
  // a beat as it arrives (rcvAt), then Updating until the next version opens, for 30 minutes at most (a page opened later
  // is past the beat); an earlier version only says Received. look: the state a new round opens in, the one the user left the
  // round before in, until it turns (a new round, below)
  // copied says nothing here: the Copy button already reads Copy again (the user, 2026-11-09: "i realized we don't really
  // need "copied" right? it's already in the bottom right submit button CTA"). The state stays, for the ground and Replay
  const STATES = { copied: ['', ''], received: ['Received', 'TickDouble02Icon'], updating: ['Updating', 'Loading03Icon'], done: ['Done', 'CheckmarkCircle02Icon'] };
  let rcvAt = 0, stT = 0, stAnim = false, stillT = 0, look = null;
  // the states the agent causes come by its cursor, which clicks each one in (statusVisit, doneVisit; the user: "update
  // human-feedback so that 'feedback received', 'updating,' etc. are initiated by the agent cursor like 'done' status is";
  // of the mockup: "I don't like how it brings the checkboxes over. It
  // should just be the done state where it just clicks on it"). stGate: { to, from }, a state the cursor is on its way to
  // click in; until it does, the bar keeps reading `from`. to 'done': Done is waiting to land, so nothing before it plays
  let stGate = null;
  // a Done that arrived and the user hasn't seen yet (set with the done record, below): the user wasn't looking while the states
  // ripened, so the cursor goes straight to the state they reached (the user: "if i haven't viewed the page since a step
  // became ripe ... it moves to the current state next rather than cycling through everything that happened")
  let dnPend = () => false;
  function barState() {
    const s = rawState();
    if (stGate && s !== 'received' && s !== 'updating') stGate = null;   // something else came first (Unlock, a new copy)
    return stGate ? stGate.from : s;
  }
  function rawState() {
    if (look) return look;
    if (bar.classList.contains('pn-done')) return 'done';
    if (bar.classList.contains('rcvd') && !bar.classList.contains('pn-wait')) {
      if ((V && V.cur !== V.last) || Date.now() - (PN.sentAt() || 0) >= UPD_MAX) return 'received';
      return Date.now() - rcvAt < RCV_HOLD ? 'received' : 'updating';
    }
    return PN.sentOn() ? 'copied' : '';
  }
  // a state arriving (stAnim: the user's copy, the receipt, Done, Unlock, the clock, the round turning) fades in with its ground,
  // its check drawing; one loaded or followed from another tab is simply there. Round N, before it, never changes here
  function paintState(anim = stAnim) {
    const raw = rawState(), was = bar.dataset.st ?? null;
    // a receipt arriving in view: the cursor clicks it in, then Updating (statusVisit). Back after Received's beat, it
    // clicks Updating in at once; with Done waiting, neither plays and the bar keeps reading `was` until Done lands.
    // Loaded, followed from another tab, under reduced motion, with the column shut or while the cursor is busy, it's
    // simply there
    if (!stGate && (raw === 'received' || (raw === 'updating' && was !== 'received')) && was !== null && was !== raw && anim && !reduced() && ui.notes && !cBusy && !OP.live) {
      if (dnPend()) stGate = { to: 'done', from: was }; else { stGate = { to: raw, from: was }; statusVisit(); }
    }
    const s = barState();
    clearTimeout(stT);   // Received turns to Updating after its beat, and Updating back to Received after 30 minutes
    const due = look ? 0 : s === 'received' ? rcvAt + RCV_HOLD : s === 'updating' ? (PN.sentAt() || 0) + UPD_MAX : 0;
    if (due > Date.now()) stT = setTimeout(() => paintState(true), due - Date.now() + 20);
    if (s === was) return;
    const go = anim && was !== null && !reduced();
    if (!go) {
      bar.classList.add('pn-still'); cancelAnimationFrame(stillT);
      stillT = requestAnimationFrame(() => { stillT = requestAnimationFrame(() => bar.classList.remove('pn-still')); });
    } else { cancelAnimationFrame(stillT); bar.classList.remove('pn-still'); }
    bar.dataset.st = s;
    const [w, ic] = STATES[s] || [];
    rcv.innerHTML = w ? `<span class="pnN-sw">${w}</span>${icon(ic, s === 'updating' ? 'pnN-spin' : s === 'copied' ? '' : 'pnN-draw')}` : '';
    rcv.querySelectorAll('.pnN-draw>path').forEach((p) => p.setAttribute('pathLength', '1'));   // the check draws as a fraction of itself
    rcv.classList.remove('in'); if (go && s) { void rcv.offsetWidth; rcv.classList.add('in'); }
    syncPark();
  }
  // the cursor clicks where the state's word is, and parks beside the state while the agent works (the user, asked
  // whether it should stay parked beside Updating instead of flying off: "yes"), in the bar's top row, clear of Round N,
  // the word and the Open questions row's buttons. Since 1.143.0 the state sits halfway to the Notes toggle, so the cursor
  // points up at the spinner from just under it: right of the state it would cover the toggle
  const stWord = (cur) => spot(cur, () => rcv.querySelector('.pnN-sw') || rcv, 0.45, 0.55);
  const parkAt = (cur) => spot(cur, () => rcv, 1, 1);
  const parkSpot = (cur) => { const at = parkAt(cur); return () => { const p = at(); return { x: p.x - 9, y: p.y + 3 }; }; };
  let parkC = null;   // the cursor parked beside Updating
  // it's parked whenever the bar reads Updating with the column open, the cursor not busy elsewhere: on a reload too,
  // where it's simply there. Updating over (Unlock, a new copy, 30 minutes): it flies off; the column shut: it goes
  function syncPark() {
    const want = barState() === 'updating' && !look && !stGate && ui.notes && !reduced() && !cBusy && !WRAP.classList.contains('pn-done');
    if (want && !parkC) {
      const cur = parkC = cursor(), p = parkSpot(cur)();
      cur.el.classList.add('nt'); put(cur, p.x, p.y); showTag(cur, true); void cur.el.offsetWidth; cur.el.classList.remove('nt');
      cur.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 * SLOW, easing: 'ease-out' });
    } else if (want && parkC) { const p = parkSpot(parkC)(); put(parkC, p.x, p.y); }
    else if (!want && parkC) unpark(ui.notes && !cBusy && !reduced());
  }
  function unpark(fly) {
    const cur = parkC; if (!cur) return; parkC = null;
    showTag(cur, false);
    if (fly && watching()) flyOut(cur).then(() => cur.el.remove()); else { cur.gone = true; fadeOff(cur.el); }
  }
  new ResizeObserver(() => syncPark()).observe(bar);   // the column shut or opened, or the window resized
  async function flyIn(cur, to) {
    const p = entry(to(), cur.tag.offsetWidth);
    cur.el.classList.add('nt'); put(cur, p.x, p.y); showTag(cur); void cur.el.offsetWidth; cur.el.classList.remove('nt');
    await fly(cur, to);
  }
  async function flyOut(cur) {
    const away = exit(cur); leave(cur);
    await fly(cur, () => away, { over: 0, pace: rnd(0.8, 0.95), dead: () => false });
  }
  // a click that sets a state: the arrow presses, the state comes in under it (paint) with its usual fade and drawn
  // check, and a tap ring goes out from the point
  async function clickIn(cur, paint) {
    await press(cur); paint(); tapRing(cur.x, cur.y);
    await beat(240);
  }
  const paintNow = () => { stAnim = true; try { paintState(true); } finally { stAnim = false; } };
  // the receipt: in from off the window to Copied, a click and it reads Received; it steps aside while that reads, clicks
  // the word again and it reads Updating, and parks beside it until the next version or Done. Back after Received's
  // beat, one click and it reads Updating. Done arriving on the way: the cursor leaves the rest and goes to click Done in
  async function statusVisit() {
    cBusy = true; cCut = false;
    const cur = cNow = cursor(), word = stWord(cur), upd = stGate.to === 'updating';
    const alive = () => { if (cDead() || !stGate) throw STOP; if (dnPend()) throw JUMP; };
    let parked = false, jumped = false;
    try {
      await flyIn(cur, word); alive();
      await beat(rnd(60, 150)); alive();
      if (!upd) {
        // an earlier version only reads Received: one click, and it goes
        const last = !V || V.cur === V.last;
        await clickIn(cur, () => { stGate = last ? { to: 'updating', from: 'received' } : null; paintNow(); });
        if (!last) { if (!cDead()) { await beat(rnd(300, 450)); await flyOut(cur); cur.el.remove(); cur.gone = true; } throw STOP; }
        alive();
        await fly(cur, parkSpot(cur), { over: 0 }); alive();
        while (Date.now() - rcvAt < RCV_HOLD) { await beat(120); alive(); }
        await beat(rnd(250, 400)); alive();
        await fly(cur, word, { over: 0 }); alive();
        await beat(rnd(80, 160)); alive();
      }
      await clickIn(cur, () => { stGate = null; paintNow(); });
      if (cDead()) throw STOP;
      await fly(cur, parkSpot(cur), { over: 0 });
      if (cDead()) throw STOP;
      if (barState() === 'updating' && ui.notes) { parkC = cur; parked = true; showTag(cur, true); }
    } catch (e) {
      // Done is waiting: the bar keeps reading what it reads, and this cursor clicks Done in (doneVisit takes it as parked)
      if (e === JUMP) { stGate = { to: 'done', from: barState() }; parkC = cur; parked = jumped = true; } else if (e !== STOP) throw e;
    } finally {
      if (!parked && !cur.gone) { cur.gone = true; fadeOff(cur.el); }
      cBusy = false; cCut = false; cNow = null;
      if (stGate && !jumped) { stGate = null; paintState(); }
      if (jumped) doneArrive(); else syncPark();
    }
  }
  // Done: the parked cursor (else one in from off the window) clicks the state, Done comes in with the summary, and it
  // flies off. Cut short, Done is there at once
  async function doneVisit(land) {
    cBusy = true; cCut = false;
    const had = parkC; parkC = null;
    const cur = cNow = had || cursor(), word = stWord(cur);
    if (had) showTag(cur, false);
    let landed = false;
    const go = () => { if (!landed) { landed = true; land(); } };
    try {
      if (had) await fly(cur, word, { over: 0 }); else await flyIn(cur, word);
      if (cDead()) throw STOP;
      await beat(rnd(80, 160));
      if (cDead()) throw STOP;
      await clickIn(cur, go);
      await beat(rnd(300, 450));
      await flyOut(cur); cur.el.remove();
    } catch (e) {
      if (e !== STOP) throw e;
      go(); if (!cur.gone) { cur.gone = true; fadeOff(cur.el); }
    } finally {
      cBusy = false; cCut = false; cNow = null;
    }
  }
  function sentUi() {
    // dark once the agent has the user's last copy: a copy made since its receipt reads Copied until that copy's own comes
    const on = PN.sentOn(), got = PN.rcvdOn() && PN.gotAll();
    bar.classList.toggle('rcvd', got);
    if (!got) { held = false; bar.classList.remove('pn-wait'); }
    const tip = got ? `${count() ? 'Earlier feedback received' : 'Feedback received'} at ${new Date(PN.sentAt()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : '';
    if (rcv.title !== tip) rcv.title = tip;
    // under Done the round is closed: no copying, no Overall typing, until Unlock brings the notes back (the user: "i can copy
    // my feedback even after it's done ... to do either i should have to unlock")
    const dnOn = WRAP.classList.contains('pn-done');
    // an earlier version is locked for good (PN.PAST): no Copy or Overall typing, and no Unlock to undo it
    const un = (on || dnOn) && !PN.PAST;
    unBtn.classList.toggle('on', un); unBtn.tabIndex = un ? 0 : -1;
    // nothing written yet (no note, sticker, edit, Overall words or answer; a highlight is the user's alone and copies nothing
    // the user would want answered): both Copy buttons wait (the user: "can we disable the copy feedback button until there's feedback to copy")
    const none = !on && !count();
    mainCopy.classList.toggle('again', on && !count()); mainCopy.disabled = dnOn || PN.PAST || none; barCopy.disabled = none;
    // a copy locks the Overall box too, empty or not, as it hides the pop-up: new words wait for Unlock (the user: "i'm able to
    // create overall feedback even after the page has locked")
    const ovLock = on || dnOn || PN.PAST; ov.readOnly = ovLock; ov.classList.toggle('sent', ovLock);
    if (!nudge.on) copyWords(copyLabel());
    paintState();
  }
  // the receipt arrives at once with the tab in view; out of view the bar keeps reading Copied until the user is back (watching),
  // then a beat for the page to paint again, and it arrives as it stands now: Received inside its beat, Updating after
  // it, Done if that's waiting too (paintState)
  back(() => {
    if (!watching() || !held) return;
    clearTimeout(arriveT);
    arriveT = setTimeout(() => { if (!held || !watching()) return; held = false; bar.classList.remove('pn-wait'); paintState(true); }, 150);
  });
  // 'lock': the user copied, so what went locks and takes its tick, and the bar reads Copied; 'rcv': the agent's receipt, so the
  // ticks turn to two and the bar reads Received; 'relock': both; false: another tab, followed without a fade
  PN.onSent = (why) => {
    if (why === 'rcv' || why === 'relock') { rcvAt = Date.now(); held = !watching(); bar.classList.toggle('pn-wait', held); }
    stAnim = !!why; try { render(); } finally { stAnim = false; }
    if (why && why !== 'lock') watchDone();
  };
  // Unlock hands the round back: a done the agent sent is withdrawn too, so the user's notes are the user's to edit again
  // (the user: "i don't understand what happens between done and the next round"): the green fades back to the user's light bar,
  // the summary leaves, and the slot empties, Round N the user's to edit
  unBtn.onclick = () => {
    PN.unlock(); stAnim = true;
    try {
      if (done) { dn.reopened = done.at; keepDn(); done = null; showDone(false); if (!reduced()) replayCls(sheet, 'out', 240); }
      render();
    } finally { stAnim = false; }
  };

  // ---------- done: when the agent decides you've converged it runs add_notes.py --converged, which writes
  // `.<page file>.done.js` beside every version, calling PN_DONE with the time and a summary: what changed across every
  // version (`changed`) and what's next (`next`). The bar turns green and reads Done, the summary covers the notes down to
  // Copy and Unlock; the stepper stays as it was. It arrives once: at once with the tab in view, else
  // when the user is back, or the first time the user opens the page after. Unlock reopens. One record for the set: the done the user saw and
  // the done the user reopened (the user's pick, round 3) ----------
  const VL = V ? V.list : null;
  const DK = 'human-feedback:done/' + (VL ? VL[0].page + '@' + VL[V.last].page : PN.PAGE);
  let dn = {}; try { dn = JSON.parse(localStorage.getItem(DK)) || {}; } catch (e) { /* storage blocked */ }
  const keepDn = () => { try { localStorage.setItem(DK, JSON.stringify(dn)); } catch (e) { /* storage blocked */ } };
  let done = null, dnHeld = false, dnT = 0, dnPoll = 0;
  dnPend = () => !!done && (dn.seen || 0) < done.at;
  const sheet = el(`<div class="pn-ui pnN-done" role="region" aria-label="Summary"></div>`);
  WRAP.append(sheet);
  new ResizeObserver(() => { sheet.style.bottom = ovBox.offsetHeight + 'px'; }).observe(ovBox);   // it stops at the Overall box (under Done, just Copy and Unlock)
  // the user's notes on every version, for the count
  const notesIn = (v) => { try { return (JSON.parse(localStorage.getItem('human-feedback:' + v.page + '#' + (v.round || 1)))?.notes || []).length; } catch (e) { return 0; } };
  // three sections, each with an icon (the user: "how about 'What we did' which summarizes what was reviewed and what changed
  // along the way, 'Final file', then 'Next steps' which is what's next given the review is done? keep it brief"; "maybe
  // each needs an icon"). What we did is bullets only (the user: "bullets only, don't fix format"), so an older summary's
  // What didn't (`didnt`) isn't drawn; Next steps is left out when there are none (an older .done.js has no `next`).
  // The icons in one place, so a swap is one line
  const DONE_IC = { did: 'CheckmarkCircle02Icon', file: 'FileCheckIcon', next: 'ArrowRightDoubleIcon' };
  function fillDone(d) {
    const rounds = VL ? VL.length : 1, n = VL ? VL.reduce((k, v) => k + notesIn(v), 0) : state.notes.length;
    const fin = VL ? VL[V.last] : { page: PN.PAGE, file: '' }, name = fin.page.split('/').pop();
    const href = fin.file.split('/').map(encodeURIComponent).join('/');
    const hd = (k, t) => `<h2>${icon(DONE_IC[k])}<span>${t}</span></h2>`, ul = (l) => (l.length ? `<ul>${l.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '');
    sheet.innerHTML = `<div class="pnD-g" data-s="did">${hd('did', 'What we did')}<p class="pnD-mt">${rounds} round${rounds === 1 ? '' : 's'}${n ? ` · ${n} note${n === 1 ? '' : 's'}` : ''}</p>${ul(d.changed)}</div>`
      + `<div class="pnD-g" data-s="file">${hd('file', 'Final file')}<p class="pnD-fn">${!VL || V.cur === V.last ? esc(name) : `<a href="${esc(href)}">${esc(name)}</a>`}</p><p class="pnD-path">${esc(fin.page)}</p></div>`
      + (d.next.length ? `<div class="pnD-g" data-s="next">${hd('next', 'Next steps')}${ul(d.next)}</div>` : '');
  }
  function showDone(on) {
    rootCls('pn-done', on); bar.classList.toggle('pn-done', on);
    if (!on) ov.pnFit();   // the Overall box back from under Done, the user's words at their height
    thrSync(); sentUi(); relayoutSoon();
  }
  const replayCls = (x, c, ms) => { x.classList.remove(c); void x.offsetWidth; x.classList.add(c); setTimeout(() => x.classList.remove(c), ms); };
  function doneArrive() {
    clearTimeout(dnT); if (!done) return;
    if (!watching()) { dnHeld = true; return; }   // out of view, or Chrome not the user's window: nothing changes until the user is back
    // the round first: its turning, its opening and the cursor's work in view, then Done
    if (OP.live || building || cBusy || bar.classList.contains('pn-turn') || (ui.notes && jobsInView().length)) { dnHeld = true; dnT = setTimeout(doneArrive, 400); return; }
    dnHeld = false;
    // in view with the column open, the cursor clicks Done in (doneVisit); it's seen from the moment it sets off
    if (!reduced() && ui.notes) { dn.seen = done.at; keepDn(); doneVisit(doneLand); return; }
    doneLand();
  }
  function doneLand() {
    if (!done) return;
    stAnim = true; try { showDone(true); } finally { stAnim = false; }   // the green fades in and the check draws
    dn.seen = done.at; keepDn();
    if (reduced()) return;
    replayCls(sheet, 'in', 900);
    dnT = setTimeout(() => rings(rcv.querySelector('.pn-ic'), bar), DRAW_AT + 410);   // as the tick finishes drawing, white on the green
  }
  window.PN_DONE = (d) => {
    const at = Number(d?.at) || 0;
    if (!at || at <= (dn.reopened || 0) || done?.at === at) return;   // reopened since, or showing already
    done = { at, changed: (Array.isArray(d.changed) ? d.changed : []).map(String), next: (Array.isArray(d.next) ? d.next : []).map(String) };
    fillDone(done); clearTimeout(dnPoll);
    if ((dn.seen || 0) >= at) showDone(true); else doneArrive();
  };
  back(() => {
    if (document.hidden) return;
    if (dnHeld && watching()) { clearTimeout(dnT); dnT = setTimeout(doneArrive, held ? 200 : 150); }   // after the receipt, which then lands quietly under it
    watchDone();
  });
  // a script beside the page, so it loads from file:// with no server: once on opening, then, once the agent has the user's paste,
  // every few seconds while the page is in view, for two hours
  const DONE_JS = '.' + (decodeURIComponent(location.pathname.split('/').pop()) || 'index.html') + '.done.js';
  function checkDone() { const sc = document.createElement('script'); sc.src = DONE_JS + '?t=' + Date.now(); sc.onload = sc.onerror = () => sc.remove(); document.head.appendChild(sc); }
  function watchDone() {
    clearTimeout(dnPoll);
    if (done || document.hidden || !PN.rcvdOn() || Date.now() - (PN.sentAt() || 0) > 2 * 3600e3) return;
    checkDone(); dnPoll = setTimeout(watchDone, 4000);
  }
  checkDone(); dnPoll = setTimeout(watchDone, 4000);
  // the questions and replies still waiting, in page order; the one the user is typing an answer to stays in until the user saves it,
  // unless it was the last, so the reminder goes as soon as every one has an answer (the user: "once i complete unanswered questions
  // when trying to copy, the alert goes away")
  const unanswered = () => {
    if (!PN.ASKS_OPEN) return [];
    const open = (a) => PN.answerable(a) && !PN.threadClosed(a);   // one answered in chat is closed
    return PN.ASKS.some(open) ? byPage(PN.ASKS.filter((a) => open(a) || (PN.answerable(a) && a.id === nudge.at && replying === a.id))) : [];
  };
  // words that change lift away and the new ones rise in
  function swapWords(w, text) {
    if (!w || w.textContent === text || w.dataset.to === text) return;
    if (reduced() || !w.textContent) { w.textContent = text; return; }
    w.dataset.to = text; w.classList.remove('pn-wi'); w.classList.add('pn-wo');
    setTimeout(() => { w.textContent = text; delete w.dataset.to; w.classList.remove('pn-wo'); void w.offsetWidth; w.classList.add('pn-wi'); }, 100);
  }
  function copyWords(text) {
    mainCopy._label = text;
    const w = mainCopy.querySelector('span'); if (w && /^Copy\b/.test(w.dataset.to || w.textContent)) swapWords(w, text);   // not over Copied
  }
  // after an answer, a sticker, a delete or a reload of the rows: with none left it folds away
  function nudgeSync() {
    if (nudge.on && !unanswered().length) nudgeEnd();
  }
  function nudgeEnd() {
    nudge.on = false; nudge.t.forEach(clearTimeout); nudge.t = [];
    ovBox.classList.remove('nz'); mainCopy.classList.remove('anyway'); copyWords(copyLabel()); relayoutSoon();
  }
  let askCue = 0;   // a newer pick cancels the flash still waiting for the last one
  // pick the question, open its Reply box, and flash it once it's in view: from the banner, or a part's badge in the outline
  // quiet: a thread the agent opened, reached from its outline badge, only scrolls into view; the user has read it already (the user:
  // "only scroll to it if i click the badge, or i try to copy and get the warning"). The warning's own step still pulses it.
  // 'step': from the bar's Open questions row, with no ring; the agent's bubble settles in once the scroll stops
  function askGo(a, quiet, top = true) {
    // a Reply box the user is in lets go first: removed by the redraw, its blur would land after this and drop the new one's focus
    if (col.contains(ROOT.activeElement)) ROOT.activeElement.blur();
    showPart(blockEl(a.block)); if (!ui.notes) setNotes(true);
    // shown cleared: the layout scrolls only to a newly picked row, and a question already picked may be far off-screen
    replying = a.ew ? null : a.id; sel = 'q:' + a.id; threadTop = top ? sel : null; footHold = null; shown = null; animateLine = true;
    questionMove = quiet === 'next' || quiet === 'next-tab' ? quiet : false;
    try { renderRows(); } finally { questionMove = false; }   // one closed in chat has no Reply box
    // the flash waits for the scroll to it to finish, so one off-screen isn't over before the user sees it (the user: "the message
    // flashing red should flash only after the scroll gets there")
    const go = ++askCue;
    if (quiet === 'step' || quiet === 'next' || quiet === 'next-tab') {
      if (!reduced()) setTimeout(() => afterScroll(() => { if (go === askCue) { const qb = lastQb(ewEl(a.id)); if (qb) replayCls(qb, 'pn-pick', 300); } }), 120);
      return;
    }
    if (quiet && !a.reply) return;
    setTimeout(() => afterScroll(() => {
      if (go !== askCue) return;
      const qb = lastQb(ewEl(a.id)); if (qb) { qb.classList.remove('pn-cue'); void qb.offsetWidth; qb.classList.add('pn-cue'); }
    }), 120);
  }
  // once the window has held still for a few frames (or after 1.5 s, whatever it's doing)
  function afterScroll(fn) {
    let y = scrollY, still = 0; const t0 = performance.now();
    const tick = () => {
      if (scrollY === y) still++; else { y = scrollY; still = 0; }
      if (still >= 4 || performance.now() - t0 > 1500) fn(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function nudgeGo(a) { nudge.at = a.id; thrAt = a.id; askGo(a); }
  // Completing any thread moves to the next open thread below, in the same order as the manual arrows.
  let nextT = 0;
  function nudgeNext(a, picked = sel) { nextOpenThread('q:' + a.id, picked); }
  function nextOpenThread(id, picked = sel) {
    if (threadWaiting({id})) return;
    clearTimeout(nextT);
    nextT = setTimeout(() => afterPress(() => {
      if (sel !== picked || rewriting || threadWaiting({id})) return;
      const all = allThreads(), i = all.findIndex((t) => t.id === id);
      if (!nudge.on && all[i]?.gone) return;   // the user switched tabs while the answered dot was fading
      const open = all.filter((t) => threadWaiting(t) && (nudge.on || !t.gone || (t.panel && away(t.panel) && tabOf(t.panel))));
      // past the last one down the page it wraps up to the first still open above (the user, 2026-11-08: "it doesn't seem to go
      // back to the top threads that are higher and cycle through them again"); once none is open it stops where it is, with
      // the cursor in Overall ("once all open threads are answered, if I'm doing that loop, I want it to just stop there and
      // stop auto-scrolling"). 1.129.1 read "when I close the last open thread, it doesn't scroll back up to the top" as no
      // wrap at all; it meant the last one left open
      const next = open.find(t => all.indexOf(t) > i) || open[0] || null;
      if (!next) {
        if (nudge.on) nudgeEnd();
        replying = null; sel = null; renderRows(); ov.focus({ preventScroll: true }); ov.setSelectionRange(ov.value.length, ov.value.length); return;
      }
      thrGo(next, 'next');
    }), reduced() ? 0 : 520);
  }
  PN.beforeCopy = () => {
    if (nudge.on) { nudge.on = false; nudge.t.forEach(clearTimeout); nudge.t = []; ovBox.classList.remove('nz'); mainCopy.classList.remove('anyway'); mainCopy._label = copyLabel(); relayoutSoon(); return true; }   // the user has seen them: copy
    const open = unanswered(); if (!open.length) return true;
    const wasRail = !ui.notes; if (wasRail) setNotes(true);
    nudge.on = true; nudge.at = thrAt = open[0].id; thrSync(); outline();
    if (!reduced()) out.querySelectorAll('.qd').forEach((b) => b.classList.add('pn-cue'));   // the question counts pulse in ink
    // the banner unfolds (once the column has slid open), then the jump follows as it finishes, so the layer scrolls the
    // question clear of the footer's new height
    const unfold = wasRail && !reduced() ? NZ : 0;
    nudge.t.push(setTimeout(() => { ovBox.classList.add('nz'); mainCopy.classList.add('anyway'); copyWords('Copy anyway'); }, unfold));
    nudge.t.push(setTimeout(() => { if (nudge.on) nudgeGo(open[0]); }, reduced() ? unfold : unfold + NZ));
    return false;
  };

  // the window's scrollbar at the page's right edge: the native one sits past the notes column, at the window's edge
  const sb = el(`<div class="pn-ui pnSB" aria-hidden="true"><i></i></div>`), thumb = sb.firstChild;
  WRAP.append(sb); document.documentElement.classList.add(P + 'sb');
  const sbSize = () => { const H = document.documentElement.scrollHeight, W = innerHeight; return { H, W, h: Math.max(32, W * W / H) }; };
  // top and bottom of the page in one click: Top shows once the user is half a window down, Bottom until the user reaches the end.
  // ⌘↑ and ⌘↓ do the same outside a text box, so their tooltips show them
  const ends = el(`<div class="pn-ui pnTB"><button type="button" class="off" title="Top of page   ⌘↑" aria-label="Top of page">${icon('ArrowUpToLineIcon')}</button><button type="button" class="off" title="Bottom of page   ⌘↓" aria-label="Bottom of page">${icon('ArrowDownToLineIcon')}</button></div>`);
  WRAP.append(ends);
  const [toTop, toEnd] = ends.children;
  toTop.onclick = () => goTo(0);
  toEnd.onclick = () => goTo(document.documentElement.scrollHeight - innerHeight);
  function sbDraw() {
    const { H, W, h } = sbSize(); sb.classList.toggle('none', H <= W + 1);
    toTop.classList.toggle('off', scrollY < W / 2); toEnd.classList.toggle('off', scrollY >= H - W - 2);
    if (H <= W + 1) return;
    thumb.style.height = h + 'px'; thumb.style.top = Math.min(1, Math.max(0, scrollY / (H - W))) * (W - h) + 'px';
  }
  sb.addEventListener('pointerdown', (e) => {
    e.preventDefault(); const { H, W, h } = sbSize();
    if (e.target !== thumb) { scrollBy({ top: Math.sign(e.clientY - thumb.getBoundingClientRect().top) * (W - 40), behavior: 'instant' }); return; }   // the track pages, as the native one does
    const y0 = e.clientY, s0 = scrollY; sb.classList.add('drag'); sb.setPointerCapture(e.pointerId);
    const move = (m) => scrollTo({ top: s0 + (m.clientY - y0) * (H - W) / Math.max(1, W - h), behavior: 'instant' });
    const end = () => { sb.classList.remove('drag'); sb.removeEventListener('pointermove', move); sb.removeEventListener('pointerup', end); sb.removeEventListener('pointercancel', end); };
    sb.addEventListener('pointermove', move); sb.addEventListener('pointerup', end); sb.addEventListener('pointercancel', end);
  });
  addEventListener('scroll', sbDraw, { passive: true }); addEventListener('resize', sbDraw);

  // a new note's box left blank goes once the user moves on: to other words, another sticker, or a click anywhere else
  // (the user: "If there's no emoji or comment, it should disappear when I navigate away")
  function dropBlank() {
    const gone = state.notes.filter(blank); if (!gone.length) return false;
    gone.forEach((n) => { state.notes.splice(state.notes.indexOf(n), 1); if (sel === n.id) sel = null; if (editing === n.id) editing = null; });
    save(); return true;
  }
  // checked after the click, so no mark is redrawn mid-drag, and not while new words are selected: Comment or a sticker
  // on them drops it then. Only its row and pin go, so a box the user clicked into elsewhere keeps its focus
  document.addEventListener('mouseup', (e) => {
    const n = noteOf(editing); if (!n || !blank(n) || tgt(e).closest?.(`[data-id="${CSS.escape(n.id)}"]`)) return;
    setTimeout(() => {
      if (!state.notes.includes(n) || !blank(n) || !getSelection().isCollapsed || col.querySelector(`.pnN-row[data-id="${CSS.escape(n.id)}"]`)?.contains(ROOT.activeElement)) return;
      dropBlank(); col.querySelectorAll(`[data-id="${CSS.escape(n.id)}"]`).forEach((x) => x.remove());
      applyMarks(); lightMarks(); counts(); outline(); layout(true);
    }, 0);
  });
  // typed: the keys the user typed over the words to start it (the pill's type-to-comment), already in its box, which takes the
  // focus now rather than a beat later, so the next key lands in it
  function create(a, typed = '') {
    if (PN.PAST) return;
    dropBlank();
    const n = { id: newId(), block: a.block, quote: a.quote, pos: a.pos, text: '', draft: typed, created: Date.now(), ...(a.frame ? { frame: true, ...(a.fi != null ? { fi: a.fi, fsrc: a.fsrc } : {}) } : {}), ...(a.imgs ? { imgs: a.imgs } : {}) };
    state.notes.push(n); save(); editing = sel = n.id; animateLine = true;
    if (a.at) framed.set(n.id, a.at);   // words in a frame: their place is known now, not once the frame has marked them, so the first row (and the scroll to it) is level with them
    if (!ui.notes) setNotes(true);
    render();
    const ta = typed && commentBox(n.id); if (ta) { ta.focus({ preventScroll: true }); ta.setSelectionRange(typed.length, typed.length); }
  }
  const commentBox = (id) => col.querySelector(`.pnN-row[data-id="${CSS.escape(id)}"] textarea.pn-ta`);
  // a key a framed page sent up after its first started the comment: in at the caret, as if typed there
  const typeOn = (key) => {
    const ta = editing && commentBox(editing); if (!ta) return;
    ta.setRangeText(key, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input'));
  };
  function react(a, k, big) {
    if (PN.PAST) return;
    dropBlank();
    const n = { id: newId(), block: a.block, quote: a.quote, pos: a.pos, text: '', react: k, created: Date.now(), ...(big ? { big: true } : {}), ...(a.frame ? { frame: true, ...(a.fi != null ? { fi: a.fi, fsrc: a.fsrc } : {}) } : {}), ...(a.imgs ? { imgs: a.imgs } : {}) };
    state.notes.push(n); save(); sel = n.id; animateLine = true;
    if (a.at) framed.set(n.id, a.at);   // as in create
    if (!ui.notes) setNotes(true);
    render(); cheer(n, big);
  }
  // a reaction is slapped on: its stickers in the page and on its row drop in and land; Celebrate throws a puff of dots as
  // they hit, and Love it a puff of little hearts. Held on (huge), each bursts as well: see HELD below
  function cheer(n, huge, from = 'page') {
    if (reduced()) return;
    const id = CSS.escape(n.id);
    const pageStk = () => ROOT.querySelector(`.pn-stk.pg[data-id="${id}"]`), rowStk = () => col.querySelector(`.pnN-row[data-id="${id}"] .pn-stk`);
    const lit = x => { if(!x)return false;const c=getComputedStyle(x),r=x.getBoundingClientRect();return c.display!=='none'&&c.visibility!=='hidden'&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight; };
    const both = [pageStk(), rowStk()].filter(lit);
    const how = n.react === 'heart' || n.react === 'party' ? 'pop' : 'slap';
    both.forEach((x) => { x.classList.remove('slap', 'pop'); void x.offsetWidth; x.classList.add(how);
      const end = (e) => { if (e.target !== x) return; x.classList.remove(how); x.removeEventListener('animationend', end); };   // the sticker's own, not its art's
      x.addEventListener('animationend', end); });
    // the hearts and confetti fly out as the pop swells to its fullest
    const times = n.big ? 2 : 1;   // a big one throws twice as much
    for (let i = 0; i < times; i++) {
      if (n.react === 'party') setTimeout(() => both.forEach((x) => x.isConnected && burst(x)), 150 + i * 120);
      if (n.react === 'heart') setTimeout(() => both.forEach((x) => x.isConnected && hearts(x)), 150 + i * 120);
    }
    // the burst comes from the sticker the user stamped: the page's from the selection pop-up, the row's from its Sticker button
    // (the user: "explode from where i stamped the emoji from, so col2 if it was col2 and col3 emoji button if it was col3"),
    // found again when it fires in case the rows were redrawn meanwhile, else from the other one
    if (huge) setTimeout(() => { const at = (from === 'row' ? [rowStk(), pageStk()] : [pageStk(), rowStk()]).find(lit); if (at) HELD[n.react]?.(at); }, 150);
  }
  function burst(at) {
    const r = at.getBoundingClientRect(); const cx = r.left + r.width / 2 + scrollX, cy = r.top + r.height / 2 + scrollY;
    for (let i = 0; i < 10; i++) {
      const d = document.createElement('i'); d.className = 'pn-bit';
      d.style.cssText = `left:${cx - 2.5}px;top:${cy - 2.5}px;background:${i % 2 ? 'var(--pn-me)' : '#ecc23e'}`;
      WRAP.appendChild(d);
      const ang = (i / 10) * Math.PI * 2 + Math.random() * 0.4, dist = 22 + Math.random() * 14;
      d.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist}px) scale(.4)`, opacity: 0 }],
        { duration: 380, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => d.remove();
      setTimeout(() => d.remove(), 600);   // a tab in the background holds back the finish event: never leave a bit behind
    }
  }
  // Celebrate held on for two seconds: Codex's Ribbon Bloom, aimed somewhere new each throw (the user picked "Random aim"). A fan of tumbling paper and curling ribbons blooms from
  // the sticker, and every piece falls until it has left the bottom of the window
  const CONFETTI = ['#ffc83d', '#f5b400', '#ff5d73', '#0a66ff', '#30b456', '#a463f2', '#ff8a00'];
  function confetti(at) {
    if (reduced() || document.hidden || !at.isConnected) return;
    const rnd = (a, b) => a + Math.random() * (b - a), DEG = Math.PI / 180;
    const aim = rnd(-160, -20) * DEG, half = 55 * DEG;   // a 110° fan, pointed anywhere from low left to low right
    // a row still gliding to its place throws from where it lands
    const row = at.closest('.pnN-row'), glide = row ? row.getBoundingClientRect().top - col.getBoundingClientRect().top - (parseFloat(row.style.top) || 0) : 0;
    const box = at.getBoundingClientRect(), ox = box.left + box.width / 2 + scrollX, oy = box.top + box.height / 2 + scrollY - 6 - glide;
    const cv = document.createElement('canvas'), cx = cv.getContext('2d');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483001';
    const ps = Array.from({ length: 108 }, (_, i) => {
      const ribbon = i >= 100, a = aim - half + ((i % 20) + Math.random()) / 20 * half * 2, sp = rnd(ribbon ? 480 : 560, ribbon ? 700 : 950);
      return { ribbon, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: rnd(1.5, 2), gravity: ribbon ? 820 : rnd(1050, 1300),
        delay: rnd(0, 0.11), x: rnd(-7, 7), y: rnd(-5, 5), w: rnd(5, 9), h: rnd(8, 14), length: rnd(30, 52),
        phase: rnd(0, Math.PI * 2), spin: rnd(-5, 5), flutter: rnd(7, 12), color: CONFETTI[i % CONFETTI.length], out: false };
    });
    let raf = 0, done = false, W = 0, H = 0, ratio = 0;
    const t0 = performance.now();
    const clean = () => { if (done) return; done = true; cancelAnimationFrame(raf); clearTimeout(cap); removeEventListener('visibilitychange', hide); cv.remove(); };
    const hide = () => document.hidden && clean();
    const cap = setTimeout(clean, 6000);   // a background tab holds back frames: never leave the canvas behind
    function draw(now) {
      if (done) return;
      const s = (now - t0) / 1000, vw = innerWidth, vh = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
      if (vw !== W || vh !== H || dpr !== ratio) { W = vw; H = vh; ratio = dpr; cv.width = vw * dpr; cv.height = vh * dpr; }
      cx.setTransform(ratio, 0, 0, ratio, 0, 0); cx.clearRect(0, 0, W, H);
      const x0 = ox - scrollX, y0 = oy - scrollY; let live = 0;
      for (const p of ps) {
        if (p.out) continue;
        const t = s - p.delay; if (t < 0) { live++; continue; }
        const travel = (1 - Math.exp(-p.drag * t)) / p.drag, fall = p.gravity / p.drag;   // thrown, slowed by the air, pulled down
        const sway = Math.sin(p.phase + t * 9) - Math.sin(p.phase);
        const x = x0 + p.x + p.vx * travel + sway * 7 * Math.min(t, 1), y = y0 + p.y + (p.vy - fall) * travel + fall * t;
        if (y > H + 40 && t > 0.3) { p.out = true; continue; }
        live++;
        cx.save(); cx.translate(x, y); cx.rotate(p.phase + p.spin * t); cx.fillStyle = p.color;
        if (p.ribbon) {
          cx.strokeStyle = p.color; cx.lineWidth = 2.6; cx.lineCap = 'round'; cx.beginPath();
          for (let j = 0; j <= 20; j++) { const u = j / 20, rx = Math.sin(u * Math.PI * 3 + t * 7 + p.phase) * 5, ry = (u - 0.5) * p.length; if (j) cx.lineTo(rx, ry); else cx.moveTo(rx, ry); }
          cx.stroke();
        } else { cx.scale(0.18 + 0.82 * Math.abs(Math.cos(p.phase + t * p.flutter)), 1); cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }   // paper tumbles edge-on
        cx.restore();
      }
      if (!live) return clean();
      raf = requestAnimationFrame(draw);
    }
    WRAP.appendChild(cv);
    addEventListener('visibilitychange', hide);
    raf = requestAnimationFrame(draw);
  }
  // where a burst starts: the sticker's centre in the window, from where a row still gliding to its place will land
  function originOf(at) {
    const row = at.closest('.pnN-row'), glide = row ? row.getBoundingClientRect().top - col.getBoundingClientRect().top - (parseFloat(row.style.top) || 0) : 0;
    const box = at.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 - glide };
  }
  // one canvas over the window for a burst; frame(c, t, x, y, H) draws second t around the sticker (scrolling carries it
  // along) and returns false once everything has gone. Gone when the tab goes to the background, and never left behind
  function overlay(at, secs, frame) {
    if (reduced() || document.hidden || !at.isConnected) return;
    const o = originOf(at), ox = o.x + scrollX, oy = o.y + scrollY;
    const cv = document.createElement('canvas'), c = cv.getContext('2d');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483001';
    let raf = 0, done = false, W = 0, H = 0, ratio = 0;
    const t0 = performance.now();
    const clean = () => { if (done) return; done = true; cancelAnimationFrame(raf); clearTimeout(cap); removeEventListener('visibilitychange', hide); cv.remove(); };
    const hide = () => document.hidden && clean();
    const cap = setTimeout(clean, secs * 1000 + 1500);   // a background tab holds back frames
    function draw(now) {
      if (done) return;
      const t = (now - t0) / 1000, vw = innerWidth, vh = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
      if (vw !== W || vh !== H || dpr !== ratio) { W = vw; H = vh; ratio = dpr; cv.width = vw * dpr; cv.height = vh * dpr; }
      c.setTransform(ratio, 0, 0, ratio, 0, 0); c.clearRect(0, 0, W, H);
      if (t > secs || frame(c, t, ox - scrollX, oy - scrollY, H) === false) return clean();
      raf = requestAnimationFrame(draw);
    }
    WRAP.appendChild(cv);
    addEventListener('visibilitychange', hide);
    raf = requestAnimationFrame(draw);
  }
  // easeOut is the one the line uses, further down
  // ✅ held: two green rings spread out from the sticker and fade (held-reactions round 3: "get rid of all the other stuff
  // besides the two rings"). Over `on`, the bar gone green for Done, they're white, so they show on its green (the user: "green
  // bg with green circle animation is green on green which means you can't see it, fix")
  function rings(at, on, hue = '#30b456') {
    overlay(at, 0.75, (c, t, x, y, H) => {
      const ring = (col) => {
        for (const [d, w] of [[0, 7], [0.12, 4]]) {
          const p = clamp((t - d) / 0.6, 0, 1); if (t < d || p >= 1) continue;
          c.globalAlpha = 1 - p; c.strokeStyle = col; c.lineWidth = w * (1 - p);
          c.beginPath(); c.arc(x, y, 36 + easeOut(p) * 130, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
        }
      };
      if (!on) return void ring(hue);
      const b = on.getBoundingClientRect();
      c.save(); c.beginPath(); c.rect(0, 0, innerWidth, H); c.rect(b.left, b.top, b.width, b.height); c.clip('evenodd'); ring(hue); c.restore();
      c.save(); c.beginPath(); c.rect(b.left, b.top, b.width, b.height); c.clip(); ring('#fff'); c.restore();
    });
  }
  // 👍 / 👎 held: Codex's Coiled punch without its wind-up. A giant copy of the sticker punches straight out (up for 👍, down
  // for 👎; dir -1 or 1, only travel and turn mirrored), holds, and pulls back in; the sticker hides meanwhile, so there's
  // never two thumbs at once (round 6: "there's two different thumbs ups ... get rid of the first one")
  function punch(at, k, dir) {
    if (reduced() || document.hidden || !at.isConnected) return;
    const o = originOf(at), d = document.createElement('div');   // fixed to the window, so a punch near the bottom adds no scrollbar
    d.setAttribute('aria-hidden', 'true'); d.innerHTML = PN.art(k);
    d.style.cssText = `position:fixed;left:${o.x - 80}px;top:${o.y - 80}px;width:160px;height:160px;pointer-events:none;z-index:2147483001;opacity:0`;
    d.firstElementChild.style.cssText = 'display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 1px 1px rgba(0,0,0,.24)) drop-shadow(0 3px 5px rgba(0,0,0,.14))';
    const pose = (offset, travel, sx, sy, turn, opacity, easing) => ({ offset, opacity, easing, transform: `translateY(${dir * travel}px) rotate(${dir * turn}deg) scale(${sx},${sy})` });
    WRAP.appendChild(d);
    // the sticker hides by a rule on its note's id rather than on the element, so a redraw meanwhile stays hidden too
    const id = CSS.escape(at.dataset.id || ''), gone = document.createElement('style');
    gone.textContent = at.classList.contains('pg') ? `.pn-stk.pg[data-id="${id}"]{visibility:hidden}` : `.pnN-row[data-id="${id}"] .pn-stk{visibility:hidden}`;
    ROOT.appendChild(gone);
    const done = () => { d.remove(); gone.remove(); };
    d.animate([
      pose(0, 0, 0.425, 0.425, -10, 0, 'ease-out'), pose(0.035, 0, 0.425, 0.425, -10, 1, 'cubic-bezier(.2,0,.4,1)'),
      pose(0.34, 116, 0.96, 1.08, 8, 1, 'cubic-bezier(.2,0,.4,1)'), pose(0.4, 112, 1, 1, 4, 1, 'ease-in-out'),   // the punch
      pose(0.54, 112, 1, 1, 4, 1, 'cubic-bezier(.5,0,.8,.6)'), pose(0.64, 104, 0.96, 0.98, 2, 1, 'cubic-bezier(.4,0,.3,1)'),
      pose(0.92, 0, 0.425, 0.425, 0, 1, 'ease-out'), pose(1, 0, 0.425, 0.425, 0, 0, 'linear'),   // back into the sticker
    ], { duration: 1400, fill: 'both' }).onfinish = done;
    setTimeout(done, 1800);   // a tab in the background holds back the finish event
  }
  // ❤️ held: a stream of hearts, a few of them stickers, rises from the sticker swaying like balloons, up and off the top
  // of the window
  const HEART_D = (PN.icon('HeartIcon').match(/ d="([^"]+)"/) || [])[1], HEART_TINTS = ['#ff4467', '#ff7a93', '#e8193f', '#ff9fb1'];   // the heart's reds and pinks
  const HEART_PATH = new Path2D(HEART_D || '');
  let heartArt = null;
  function floatHearts(at) {
    if (!heartArt) { heartArt = new Image(); heartArt.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(PN.art('heart').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" ')); }
    const ps = Array.from({ length: 32 }, (_, i) => ({ at: i / 32 + rnd(0, 0.06), vx: rnd(-340, 340), vy: rnd(220, 320), lift: rnd(160, 260), size: rnd(16, 32), sway: rnd(8, 18), ph: rnd(0, Math.PI * 2), sticker: i % 4 === 0, c: HEART_TINTS[i % 4] }));
    overlay(at, 6, (c, t, x, y) => {
      let live = 0;
      for (const q of ps) {
        const s = t - q.at; if (s <= 0) { live++; continue; }
        const tr = (1 - Math.exp(-2.5 * s)) / 2.5, py = y - q.vy * s - 0.5 * q.lift * s * s;
        if (py < -40) continue;   // gone off the top
        live++;
        const px = x + q.vx * tr + Math.sin(q.ph + s * 3.2) * q.sway, g = clamp(s / 0.25, 0, 1), size = q.size * (1 + 2.9 * (g - 1) ** 3 + 1.9 * (g - 1) ** 2);
        c.save(); c.translate(px, py); c.rotate(Math.sin(q.ph + s * 3.2) * 0.25);
        if (q.sticker && heartArt.complete && heartArt.naturalWidth) c.drawImage(heartArt, -size * 0.65, -size * 0.65, size * 1.3, size * 1.3);
        else { c.scale(size / 24, size / 24); c.translate(-12, -12); c.fillStyle = q.c; c.fill(HEART_PATH); }
        c.restore();
      }
      return live > 0;
    });
  }
  // the burst each reaction plays when it was held: approved together in held-reactions round 9
  // ❓ held plays ✅'s rings in its own orange (1.103.0)
  const HELD = { check: rings, ask: (at) => rings(at, null, '#f97316'), up: (at) => punch(at, 'up', -1), down: (at) => punch(at, 'down', 1), heart: floatHearts, party: confetti };
  // little filled hearts, in the sticker's reds and pinks, float up and out from where it landed, turning as they go
  const HEART = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${HEART_D}" fill="currentColor"/></svg>`;
  function hearts(at) {
    const r = at.getBoundingClientRect(); const cx = r.left + r.width / 2 + scrollX, cy = r.top + r.height / 2 + scrollY;
    for (let i = 0; i < 7; i++) {
      const d = document.createElement('i'); d.className = 'pn-bit lv'; d.innerHTML = HEART;
      const s = 0.7 + Math.random() * 0.5;
      d.style.cssText = `left:${cx - 6}px;top:${cy - 6}px;color:${HEART_TINTS[i % HEART_TINTS.length]}`;
      WRAP.appendChild(d);
      const ang = -Math.PI * (0.12 + 0.76 * (i / 6)) + (Math.random() - 0.5) * 0.3, dist = 26 + Math.random() * 18, turn = (Math.random() - 0.5) * 50;
      d.animate([{ transform: 'translate(0,0) scale(.3)', opacity: 1 }, { transform: `translate(${Math.cos(ang) * dist * 0.6}px,${Math.sin(ang) * dist * 0.6}px) scale(${s})`, opacity: 1, offset: 0.45 },
        { transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist - 8}px) rotate(${turn}deg) scale(${s * 0.8})`, opacity: 0 }],
        { duration: 390, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => d.remove();
      setTimeout(() => d.remove(), 600);
    }
  }
  // ---------- tooltips in the layer's own look (the user: "give tooltips like 'Attach a picture' an appropriate in-style
  // tooltip (black etc)"): every title in the layer shows as a small ink label, the Undo toast's colours, under its control,
  // or above it where the window's foot is near. It waits a moment on the first control and shows at once while the user moves
  // between controls, as the Mac's do. While the pointer is on a control its title waits in data-pn-tip, so the browser's
  // own grey box never shows, and goes back when it leaves. A shortcut after three spaces ("Top of page   ⌘↑") is set apart ----------
  css(`
    .pnT{position:fixed;left:0;top:0;z-index:2147483050;max-width:260px;box-sizing:border-box;padding:6px 9px;border-radius:var(--pn-R1);
      background:#1d1d1f;color:#fff;font:500 13px/1.3 var(--pn-ui);text-wrap:balance;box-shadow:0 4px 14px rgba(0,0,0,.18);pointer-events:none;
      opacity:0;transform:translateY(var(--pn-tipy,-2px));transition:opacity .12s ease,transform .12s ease;visibility:hidden}
    .pnT.on{opacity:1;transform:none;visibility:visible}
    .pnT .k{margin-left:6px;padding-left:6px;border-left:1px solid rgba(255,255,255,.3);opacity:.75;white-space:nowrap}
    :root:where(.pn-dark):not([data-theme="light"]) .pnT{background:#3a3a3d;box-shadow:0 0 0 1px rgba(255,255,255,.1),0 4px 14px rgba(0,0,0,.4)}
    @media (prefers-reduced-motion: reduce){.pnT{transition:none;transform:none}}`);
  const tipEl = el('<div class="pn-ui pnT" role="tooltip" aria-hidden="true"></div>'); WRAP.appendChild(tipEl);
  let tipAt = null, tipT = 0, tipWarm = 0;
  function tipShow() {
    const x = tipAt; if (!x?.isConnected) return;
    const [words, key] = x.dataset.pnTip.split(/ {3,}/);
    tipEl.textContent = words; if (key) tipEl.append(Object.assign(document.createElement('span'), { className: 'k', textContent: key }));
    const r = x.getBoundingClientRect(), bounds = x.closest('.pn-pill')?.getBoundingClientRect() || r;
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight, below = bounds.bottom + 8 + h <= innerHeight - 8;
    tipEl.style.left = Math.round(Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))) + 'px';
    tipEl.style.top = Math.round(below ? bounds.bottom + 8 : bounds.top - 8 - h) + 'px';
    tipEl.style.setProperty('--pn-tipy', below ? '-2px' : '2px');
    tipEl.classList.add('on');
  }
  // the label goes, and the title stays parked while the pointer is still on the control (a click, a key, a scroll):
  // back on it, the browser would show its own box a second later
  const tipHide = (warm = true) => { clearTimeout(tipT); if (tipEl.classList.contains('on') && warm) tipWarm = Date.now(); tipEl.classList.remove('on'); };
  function tipOff() {
    tipHide();
    if (tipAt && tipAt.dataset.pnTip != null) { if (!tipAt.hasAttribute('title')) tipAt.setAttribute('title', tipAt.dataset.pnTip); delete tipAt.dataset.pnTip; }
    tipAt = null;
  }
  let tipBy = '';
  function tipOn(x, by) {
    if (x === tipAt) return;
    tipOff(); const t = x.getAttribute('title'); if (!t?.trim()) return;
    tipAt = x; tipBy = by; x.dataset.pnTip = t; x.removeAttribute('title');
    if (!x.hasAttribute('aria-label') && !x.textContent.trim()) x.setAttribute('aria-label', t.split(/ {3,}/)[0]);   // the title named an icon-only button
    tipT = setTimeout(tipShow, by === 'key' || x.dataset.pnNow != null || Date.now() - tipWarm < 600 ? 0 : 450);   // data-pn-now: no wait (the Outline's title)
  }
  ROOT.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch' || (tipAt && tipAt.contains(e.target))) return;
    const x = e.target.closest?.('[title]'); if (x) tipOn(x, 'pointer'); else if (tipAt) tipOff();
  });
  ROOT.addEventListener('pointerout', (e) => { if (tipAt && tipBy === 'pointer' && !(e.relatedTarget && tipAt.contains(e.relatedTarget))) tipOff(); });
  ROOT.addEventListener('focusin', (e) => {
    const x = e.target.closest?.('[title]'); let key = false;
    try { key = !!x?.matches(':focus-visible'); } catch (err) { /* a browser without :focus-visible: no tip */ }
    if (key) tipOn(x, 'key');
  });
  ROOT.addEventListener('focusout', () => { if (tipBy === 'key') tipOff(); });
  const roundDateFormat = new Intl.DateTimeFormat(undefined, {
    year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short'
  });
  function updateRoundDate() {
    const roll = roundNumber.querySelector('.pnN-roll');
    const index = V ? Math.max(0, V.cur - (roll && !roll.classList.contains('go') ? 1 : 0)) : 0;
    const entry = V?.list[index];
    roundTitle.setAttribute('aria-label', `Round ${V ? index + 1 : PN.ROUND}`);
    const at = Date.parse(entry?.at || '') || Date.parse(entry?.made || '') || PN.ROUND_AT || PN.MADE;
    if (!at) return;
    const label = roundDateFormat.format(at);
    if (roundTitle === tipAt) {
      roundTitle.dataset.pnTip = label;
      if (tipEl.classList.contains('on')) tipShow();
    } else roundTitle.title = label;
    roundTitle.setAttribute('aria-description', label);
  }
  if (PN.MADE || V?.list.some((entry) => entry.at || entry.made) || PN.ROUND_AT) {
    roundTitle.dataset.roundDate = '';
    roundTitle.tabIndex = 0;
    roundTitle.setAttribute('role', 'button');
    updateRoundDate();
    new MutationObserver(updateRoundDate).observe(roundNumber, {
      childList:true, subtree:true, attributes:true, attributeFilter:['class']
    });
    roundTitle.addEventListener('click', () => {
      if (tipAt === roundTitle) {
        if (tipEl.classList.contains('on')) tipOff(); else tipShow();
      } else tipOn(roundTitle, 'key');
    });
    roundTitle.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      roundTitle.click();
    });
  }
  ['pointerdown', 'keydown', 'wheel'].forEach((t) => addEventListener(t, (event) => { if (t !== 'pointerdown' || tgt(event).closest?.('[data-round-date]') !== roundTitle) tipHide(false); }, { capture: true, passive: true }));
  addEventListener('scroll', () => tipHide(false), { capture: true, passive: true });
  document.addEventListener('visibilitychange', tipOff);
  // one toast offers Undo for whatever was just taken away
  let undo = null, toastT = 0, toastAt = 0;
  // a hyphenated word stays on one line ("human-feedback" had wrapped as "human- / feedback")
  const unbroken = (label) => label.split(/(\S+-\S+)/).map((w, i) => { if (!(i % 2)) return w; const n = document.createElement('span'); n.textContent = w; n.style.whiteSpace = 'nowrap'; return n; });
  function offer(label, fn, act = 'Undo', ms = 6000) {
    undo = fn; toastAt = Date.now(); toast.classList.remove('cp'); toast.classList.toggle('wr', label.length > 60);
    toast.querySelector('span').replaceChildren(...unbroken(label)); toast.querySelector('button').textContent = act; toast.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), ms);
  }
  toast.querySelector('button').onclick = () => { const fn = undo; undo = null; toast.classList.remove('show'); if (fn) fn(); };
  // deleting the selected note leaves nothing selected, which re-stacked every row from the top (the user: "col3 shouldn't
  // scroll to top"): the row after it takes its place instead, or the one before stays where it is, until another is picked
  function holdAround(id) {
    const rs = [...col.querySelectorAll('.pnN-row')].sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));
    const i = rs.findIndex((r) => r.dataset.id === id); if (i < 0) return;
    const nb = rs[i + 1] || rs[i - 1];
    hold = nb ? { id: nb.dataset.id, y: parseFloat((rs[i + 1] ? rs[i] : nb).style.top), below: !!rs[i + 1] } : null;
  }
  function remove(n, what = 'Comment') {   // the toast names what the user took off, not the thread (the user: "make sure that word 'thread' is responsive to what will actually be deleted")
    if (sel === n.id) holdAround(n.id);
    const i = state.notes.indexOf(n); state.notes.splice(i, 1); save();
    if (sel === n.id) sel = null; if (editing === n.id) editing = null;
    if (has(n)) offer(what + ' deleted', () => { state.notes.splice(i, 0, n); save(); sel = n.id; animateLine = true; render(); });
    render();
  }
  // ---------- the user's pictures: a paperclip on each live note and on Overall opens the file picker; a picture dragged onto a
  // note or the Overall box, or pasted with ⌘V, goes on too. Each is saved for the agent (the workspace's attachments
  // folder, else Downloads), and the toast says so (the user's pick, rounds 1–4). The toast names the agent the page was made by (add_notes.py --agent), else "Agent" (the user,
  // 2026-10-26: "what if we called it "Claude's workspace folder", "ChatGPT's workspace folder," etc.", and with no name:
  // "just "Agent" is fine") ----------
  const agentIs = () => PN.AGENT || 'Agent', wsOf = () => agentIs() + "'s workspace folder";
  function told(k, where = PN.canSide() ? 'saved for ' + agentIs() : 'copied to Downloads') {
    undo = null; toast.classList.remove('wr'); toast.querySelector('span').textContent = k > 1 ? `${k} attachments ${where}` : where[0].toUpperCase() + where.slice(1);
    toast.classList.add('cp'); toast.classList.remove('show'); void toast.offsetWidth; toast.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), 4000);
  }
  const noteOf = (id) => state.notes.find((x) => x.id === id);
  // a thread of the agent's ('q:' + its id) takes pictures as part of the user's answer, while it's open for one, as its Reply box is
  const askOf = (id) => (typeof id === 'string' && id.startsWith('q:') ? PN.ASKS.find((a) => 'q:' + a.id === id) : null);
  const threadOpen = (a) => !!a && PN.answerable(a) && !PN.sentOn() && !PN.answerSent(state.answers[a.id]) && !WRAP.classList.contains('pn-done');
  const canTake = (t) => PN.PICTURES && (t === 'overall' ? !ov.readOnly : askOf(t) ? threadOpen(askOf(t)) : !!noteOf(t) && !PN.locked(noteOf(t)));
  async function attach(target, files) {
    if (!PN.PICTURES) return;
    const got = await PN.keepFiles(files); if (!got.length) return;
    if (target === 'overall') { PN.ovFiles.push(...got); PN.keepOvFiles(); } else {
      const a = askOf(target), n = a ? PN.answerOf(a) : noteOf(target); if (!n) return;
      n.files = [...(n.files || []), ...got]; if (a) n.at = Date.now(); else n.edited = Date.now(); save();
    }
    // the folder allowed: each starts saving now and its chip lands at once in the box's row, with a spinner until it's
    // written, and that says so (no toast); copied to Downloads, the toast says where
    if (got.dir) PN.begin(got.dir, got.filter((f) => f.wait), settled);
    if (got.some((f) => f.wait)) { askWhy = ''; askNeed = await PN.sideNeeds(); } else got.forEach((f) => landing.add(f));
    render();
    if (!PN.canSide()) told(got.length);
  }
  // ---------- a picture that can't be saved yet waits in a prompt under the box the user attached it in, where its chip will land
  // (2026-10-26, on 1.83.0's toast: "it needs to be right by where the attachment is, and the attachment shouldn't
  // look like it already attached if it hasn't been approved yet. also the toast disappeared. no good"). The prompt names
  // what's waiting, never times out, and each outcome rewrites it in place; saved, it goes and the chip lands in the row.
  // Chrome's folder dialog and its OK both need a click of the user's. The words date from 2026-10-26, with the agent named ----------
  let askWhy = '', askNeed = 'folder';   // the last try's outcome ('cancelled', 'wrong'), and what saving needs now ('folder', 'allow')
  const landing = new Set(), asked = new Set();   // pictures just saved, whose chips slide in once; boxes whose prompt has shown
  const filesOf = (target) => { if (target === 'overall') return PN.ovFiles; const a = askOf(target); return a ? state.answers[a.id]?.files : noteOf(target)?.files; };
  // the prompt's words and its button, for every box at once: what's needed is the same everywhere. A picture from an
  // earlier visit lost its file with the visit, so it can only be dropped
  function askSay(canSave) {
    if (!canSave) return ["Your attachment couldn't be saved.", ''];
    const pick = `In ${wsOf()}, select the human-feedback subfolder so ${agentIs()} can find your attachments.`, perm = ' If Chrome asks for permission, allow it.';
    if (askWhy === 'wrong') return ["That's not the human-feedback subfolder. " + pick, 'Select folder'];
    if (askWhy === 'cancelled') return ["Your attachment couldn't be saved. " + pick + perm, 'Select folder'];
    if (askNeed === 'allow') return [`Chrome needs your approval to save attachments for ${agentIs()}.`, 'Allow'];
    return [pick + perm, 'Select folder'];
  }
  function paintAsk(box) {
    const [say, act] = askSay((filesOf(box.dataset.for) || []).some(PN.savable));
    box.querySelector('.say').replaceChildren(...unbroken(say));
    const b = box.pnAct; box.pnSay = !!act;
    if (act) { b.textContent = act; b.dataset.pick = act === 'Allow' ? '' : '1'; }
    placeAsk(box);
  }
  // the prompt's button: its own, with Cancel; or, under a box the user is writing in, one more in that box's row of Save and
  // Cancel, so there's one set of actions and one Cancel (the user, 1.85.0, on two rows and two Cancels under a note the user was
  // writing). There it's outlined after Save, which stays the row's one primary, and the row's Cancel drops the waiting
  // pictures with the user's typing (unwait)
  function placeAsk(box) {
    const b = box.pnAct, j = box.pnJoin;
    box.classList.toggle('joined', !!j); b.classList.toggle('pri', !j);
    if (!box.pnSay) b.remove();
    else if (j) j.querySelector('.pn-btn.pri').after(b);
    else box.querySelector('.acts').prepend(b);
  }
  const joinAsk = (box, acts) => { if (box && box.pnJoin !== acts) { box.pnJoin = acts; placeAsk(box); } };
  // one prompt per box, covering every picture waiting there; one Select folder saves them all. `acts`: the Save and Cancel
  // of the box the user is writing in, which the prompt's button joins
  function askEl(target, list, acts) {
    if (!PN.PICTURES) return null;
    const w = (list || []).filter((f) => f.wait); if (!w.length) return null;
    const box = el(`<div class="pnF-ask" role="status" data-for="${esc(target)}">${icon('Alert02Icon')}<p class="say"></p><div class="what"></div><div class="acts"><button type="button" class="pn-btn pri"></button><button type="button" class="pn-lnk">Cancel</button></div></div>`);
    box.querySelector('.what').append(...w.map((f) => el(`<span class="it" title="${esc(f.name)}">${f.thumb ? `<img src="${esc(f.thumb)}" alt="">` : ''}<span>${esc(f.name)}</span></span>`)));
    box.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });   // the box the user is typing in keeps its focus
    box.addEventListener('click', (e) => e.stopPropagation());
    const pri = box.pnAct = box.querySelector('.pn-btn');
    pri.onclick = (e) => { e.stopPropagation(); saveFiles(pri.dataset.pick === '1'); };
    box.querySelector('.pn-lnk').onclick = () => dropWaiting(target);
    box.pnJoin = acts || null;
    paintAsk(box);
    if (!asked.has(target)) { asked.add(target); box.classList.add('in'); }
    return box;
  }
  async function askAgain(why) {
    askWhy = why || ''; askNeed = await PN.sideNeeds();
    ROOT.querySelectorAll('.pnF-ask').forEach(paintAsk);
  }
  // the moment Chrome answers (and the folder's marker checks out) the prompt goes and the chips land, saving: the write's
  // close() can take seconds in the user's Chrome while it checks the file, and nothing showed meanwhile (the user, round 6: "when i
  // approve, nothing happens for along time and it' shard to know if ti worked")
  async function saveFiles(pick) {
    const was = PN.waitingFiles(), k = await PN.saveWaiting(pick, settled);
    if (typeof k === 'string') return askAgain(k);
    const done = was.filter((f) => f.path); restamp(done);
    done.forEach((f) => landing.add(f)); askWhy = ''; askNeed = '';
    render();
  }
  // a picture that starts saving after the user copied it waiting (it went as "Image: (not saved)") goes again with its path, and
  // one whose write then fails goes again as not saved
  function restamp(list) {
    const now = Date.now(), on = (x) => x?.files?.some((f) => list.includes(f));
    state.notes.forEach((n) => { if (on(n)) n.edited = now; });
    Object.values(state.answers).forEach((x) => { if (on(x)) x.at = now; });
    PN.ovFiles.forEach((f) => { if (list.includes(f) && PN.fileSent(f)) f.at = now; });
    save(); PN.keepOvFiles();
  }
  // a write ended: written, its chip's spinner goes, in place (no toast, nothing else redrawn); failed, the chip turns
  // back into the prompt, saying it couldn't be saved, as a refused OK does
  function settled(f, ok) {
    if (ok) { ROOT.querySelectorAll('.pnF-c.saving').forEach((c) => { if (c.pnFile === f) { c.classList.remove('saving'); c.removeAttribute('aria-busy'); } }); return; }
    restamp([f]); askWhy = 'cancelled'; render();
  }
  // Cancel: the box's waiting pictures go, with no Undo (nothing was attached yet); a note that was only them goes too
  function unwait(target) {
    const a = askOf(target), n = target === 'overall' ? null : a ? state.answers[a.id] : noteOf(target), list = n ? n.files : PN.ovFiles;
    if (list) list.splice(0, list.length, ...list.filter((f) => !f.wait));
    return { a, n, list };
  }
  function dropWaiting(target) {
    const { a, n, list } = unwait(target); if (!list) return;
    if (n && !a && !has(n) && editing !== n.id) return remove(n);
    if (n) save(); else PN.keepOvFiles();
    render();
  }
  // a picture off its note, with Undo; a note that was only that picture goes with it, as a sticker's does. Off an answer, the
  // thread stays, waiting again if that was all of it
  function unattach(target, i) {
    const a = askOf(target), n = target === 'overall' ? null : a ? state.answers[a.id] : noteOf(target), list = n ? n.files : PN.ovFiles; if (!list?.[i]) return;
    const [f] = list.splice(i, 1);
    if (n && !a && !has(n) && editing !== n.id) { list.splice(i, 0, f); return remove(n, 'Picture'); }
    if (n) { if (a) n.at = Date.now(); else n.edited = Date.now(); save(); } else PN.keepOvFiles();
    render();
    offer('Picture removed', () => { list.splice(i, 0, f); if (n) save(); else PN.keepOvFiles(); render(); });
  }
  const picker = el('<input type="file" accept="image/*" multiple hidden>'); let pickFor = null;
  picker.onchange = () => { if (pickFor) attach(pickFor, picker.files); picker.value = ''; };
  if (PN.PICTURES) WRAP.appendChild(picker);
  const clipBtn = (target, cls = 'ib') => {
    if (!PN.PICTURES) return null;
    const b = el(`<button type="button" class="${cls}" title="Attach a picture">${icon('AttachmentIcon')}</button>`);
    b.onclick = (e) => { e.stopPropagation(); if (target === 'overall' && ov.readOnly) return; pickFor = target; picker.click(); };
    return b;
  };
  // a Comment or Reply box with its paperclip at its right end, where the user is typing (the user: "add a paperclip (next to the
  // comment/reply box?)"). A press on it leaves the cursor in the box, so the user's typing isn't sent as the user reaches for it
  function withClip(ta, target) {
    const box = el('<div class="pnF-box"></div>'), b = clipBtn(target, 'pnF-in');
    box.appendChild(ta);
    if (b) { b.addEventListener('mousedown', (e) => e.preventDefault()); box.appendChild(b); }
    return box;
  }
  // small named chips; pointing at one shows the saved copy's path. A sent one (`old`) has no remove button
  function filesEl(target, list, old) {
    if (!list?.length) return null;
    if (!list.some((f) => !f.wait)) return null;   // a picture still waiting isn't attached yet: its prompt shows it (askEl)
    const box = el('<div class="pnF"></div>');
    list.forEach((f, i) => {
      if (f.wait) return;
      const gone = typeof old === 'function' ? old(f) : old;
      const sv = PN.isSaving(f);   // being written: a small spinner in its remove button's place, until settled()
      const c = el(`<a class="pnF-c${gone ? ' old' : ''}${landing.has(f) ? ' in' : ''}${sv ? ' saving" aria-busy="true' : ''}" href="${esc('file://' + encodeURI(f.path))}" target="_blank" title="${esc(f.path)}">${f.thumb ? `<img src="${esc(f.thumb)}" alt="">` : ''}<span>${esc(f.name)}</span>${sv ? `<i class="pnF-sv">${icon('Loading03Icon')}</i>` : ''}</a>`);
      c.pnFile = f; c.addEventListener('click', (e) => { if (c.classList.contains('saving')) e.preventDefault(); });   // not there yet
      if (!gone) {
        const x = el(`<button type="button" title="Remove">${icon('Cancel01Icon')}</button>`);
        x.onclick = (e) => { e.preventDefault(); e.stopPropagation(); unattach(target, i); };
        c.appendChild(x);
      }
      box.appendChild(c);
    });
    return box;
  }
  if (PN.PICTURES) ovBox.querySelector('.lbl').appendChild(clipBtn('overall', 'pnF-at'));
  function drawOvFiles() {
    ovBox.querySelectorAll(':scope > .pnF, :scope > .pnF-ask').forEach((x) => x.remove());
    const parts = [filesEl('overall', PN.ovFiles, PN.fileSent), askEl('overall', PN.ovFiles)].filter(Boolean); if (parts.length) ov.before(...parts);
  }
  // a dragged picture outlines every place that would take it (the user's live notes, the agent's open threads, the Overall box),
  // and lights up the one under the pointer, which takes it on the drop (the user: "a drop zone in each new thread")
  const carries = (dt) => [...(dt?.types || [])].includes('Files');
  let dropOn = null, dragging = false;
  function zoneAt(t) {
    if (!PN.PICTURES) return null;
    const row = t?.closest?.('.pnN-row'), id = row?.dataset.id;
    if (row && (askOf(id) || noteOf(id))) return canTake(id) ? row : null;
    return t?.closest?.('.pnN-ov') && !ov.readOnly ? ov : null;
  }
  const lightDrop = (z) => { if (z === dropOn) return; dropOn?.classList.remove('pnF-over'); dropOn = z; z?.classList.add('pnF-over'); };
  function showZones(on) {
    if (!PN.PICTURES) return;
    if (on === dragging) return; dragging = on;
    col.querySelectorAll('.pnN-row').forEach((r) => r.classList.toggle('pnF-can', on && canTake(r.dataset.id)));
    ov.classList.toggle('pnF-can', on && !ov.readOnly);
  }
  const endDrag = () => { lightDrop(null); showZones(false); };
  addEventListener('dragover', (e) => { if (!carries(e.dataTransfer)) return; e.preventDefault(); showZones(true); const z = zoneAt(tgt(e)); lightDrop(z); e.dataTransfer.dropEffect = z ? 'copy' : 'none'; });
  addEventListener('dragleave', (e) => { if (!e.relatedTarget) endDrag(); });
  addEventListener('drop', (e) => {
    if (!carries(e.dataTransfer)) return;
    e.preventDefault();   // a drop that misses must not open the picture in place of the page
    const z = zoneAt(tgt(e)); endDrag(); if (!z) return;
    attach(z === ov ? 'overall' : z.dataset.id, e.dataTransfer.files);
  });
  // pasted words go in from the paste itself. Chrome reads the clipboard a second time to put them in, and Raycast's
  // dictation pastes then puts back what the clipboard held before, so when that lands in between, nothing goes in
  // (the user: "sometimes, maybe about a third of the time, I can't type or dictate into the box"; logged 2026-10-21: the
  // paste held 9 characters, the insert a moment later found 0)
  document.addEventListener('paste', (e) => {
    const t = tgt(e)?.closest?.(`textarea.pn-ta, .${P}edit[contenteditable]`);
    if (!t || t.readOnly || t.disabled || [...(e.clipboardData?.files || [])].some((f) => /^image\//.test(f.type))) return;
    const text = e.clipboardData?.getData('text/plain'); if (!text) return;
    e.preventDefault();
    if (document.execCommand('insertText', false, text)) return;   // keeps ⌘Z, and fires input as typing does
    if (t.setRangeText) { t.setRangeText(text, t.selectionStart, t.selectionEnd, 'end'); t.dispatchEvent(new Event('input', { bubbles: true })); }
  }, true);
  // ⌘V with a picture on the clipboard: onto the note or thread the user is typing in, the Overall box the user is in, else the picked one
  addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => /^image\//.test(f.type)); if (!files.length) return;
    const a = ROOT.activeElement || document.activeElement, row = a?.closest?.('.pnN-row');
    let target = null;
    if (a === ov) target = 'overall';
    else if (row && (noteOf(row.dataset.id) || askOf(row.dataset.id))) target = row.dataset.id;
    else if (!/^(INPUT|TEXTAREA|SELECT)$/.test(a?.tagName || '') && !a?.isContentEditable && (noteOf(sel) || askOf(sel))) target = sel;
    if (!target || !canTake(target)) return;
    e.preventDefault(); attach(target, files);
  });
  // a sticker comes off with a click: it peels away, and Undo slaps it back. A note that was only the sticker goes with it.
  function peel(n) {
    const k = n.react, wasBig = !!n.big; if (!REACT[k]) return;
    const done = () => {
      // a question's row stays, and so does a new note whose box the user is still writing in (its draft isn't text yet)
      if (!(n.text || n.a || '').trim() && n.id !== editing && !String(n.id).startsWith('q:')) return remove(n, 'Sticker');
      delete n.react; delete n.big; save(); render();
      offer('Sticker removed', () => { n.react = k; if (wasBig) n.big = true; save(); render(); cheer(n); });
    };
    const s = col.querySelector(`.pnN-row[data-id="${CSS.escape(n.id)}"] .pn-stk`);
    if (!s || reduced()) return done();
    s.classList.add('peel'); s.addEventListener('animationend', done, { once: true });
  }
  // a row's sticker button: the reactions, to put one on any note, swap it, or pick it again to peel it off
  const rxBar = el(`<div class="pn-ui pn-pill pnN-rx">${PN.reactButtons()}</div>`);
  WRAP.appendChild(rxBar);
  let rxFor = null, rxFrom = 'row';   // rxFrom: which column's sticker opened it, so Celebrate's confetti blooms there
  let rxHover = false, rxFace = null, rxHoverT = 0, rxLeaveT = 0, rxAt = 0;   // rxHover: opened by pointing, so it closes once the pointer leaves
  const closeRx = () => {
    clearTimeout(rxHoverT); clearTimeout(rxLeaveT); rxHover = false; rxBar.getAnimations?.().forEach((a) => a.cancel());
    rxBar.classList.remove('show', 'grow'); rxBar._btn?.classList.remove('open'); rxFor = rxFace = null;
  };
  // grow: a Sticker button's picker grows out of the button itself, the same height as any picker, its last reaction where
  // the button was and the rest running left into the column (the user: "the button could expand into the black picker onhover
  // the button ... should probably be the same height etc right?"). `face` is what the user pointed at or clicked (the button, or
  // the sticker over it), which it grows from. On the page the picker opens next to the sticker, below it when there's room
  function openRx(n, btn, from = 'row', grow = false, face = btn) {
    tipHide(false);
    rxFor = n; rxFrom = from; rxFace = face; rxBar.querySelectorAll('.rb').forEach((b) => b.classList.toggle('on', b.dataset.k === n.react));
    rxBar.querySelector('.rb[data-k=party]').hidden = false;   // every reaction closes this round
    const r = btn.getBoundingClientRect(), w = rxBar.offsetWidth, h = rxBar.offsetHeight;
    let L, T;
    if (grow) {
      const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, c = col.getBoundingClientRect();
      L = Math.max(8, ui.notes ? c.left + 4 : 8, Math.min(innerWidth - w - 8, cx + h / 2 - w));
      T = Math.max(8, Math.min(innerHeight - h - 8, cy - h / 2));
    } else {
      L = Math.max(8, Math.min(innerWidth - w - 8, r.right - w + 6));
      T = r.bottom + 6 + h <= innerHeight - 8 ? r.bottom + 6 : Math.max(8, r.top - 6 - h);
    }
    rxBar.style.left = L + 'px'; rxBar.style.top = T + 'px';
    btn.classList.add('open'); rxBar._btn = btn;
    rxBar.classList.toggle('grow', grow);
    rxBar.classList.add('show');
    if (!grow || reduced() || !rxBar.animate) return;
    // from the button's own circle to the whole pill, its white to the picker's black
    const f = face.getBoundingClientRect(), d = Math.max(face.offsetWidth || 0, 20), fx = (f.left + f.right) / 2 - L, fy = (f.top + f.bottom) / 2 - T;
    const ins = (t, rr, b, l, rad) => `inset(${t}px ${rr}px ${b}px ${l}px round ${rad}px)`;
    rxBar.animate([
      { clipPath: ins(fy - d / 2, w - fx - d / 2, h - fy - d / 2, fx - d / 2, d / 2), backgroundColor: '#fff' },
      { clipPath: ins(0, 0, 0, 0, h / 2), backgroundColor: '#1d1d1f' },
    ], { duration: 240, easing: 'cubic-bezier(.3,.7,.2,1)' });
  }
  // pointing: a beat's wait before it opens, so a pass across the column doesn't flash it, and a grace once the pointer
  // leaves, so moving from the button onto a reaction (or back) keeps it open. Mouse only: a touch taps it open, as a click
  const INTENT = 200, GRACE = 300;
  const leaveSoon = () => {
    clearTimeout(rxLeaveT);
    rxLeaveT = setTimeout(() => {
      if (rxHover && !rxBar.matches(':hover') && !rxFace?.matches(':hover') && !rxBar._btn?.matches(':hover')) closeRx();
    }, GRACE);
  };
  function hoverRx(host, go, selector) {
    // Page stickers are replaced on redraw, so listen for them on the shadow root.
    const faceAt = (e) => selector ? e.target.closest?.(selector) : host;
    const crossed = (e, face) => e.pointerType === 'mouse' && face && (!selector || !face.contains(e.relatedTarget));
    host.addEventListener(selector ? 'pointerover' : 'pointerenter', (e) => {
      const face = faceAt(e); if (!crossed(e, face)) return;
      if (rxFor && (face === rxFace || face === rxBar._btn)) { clearTimeout(rxLeaveT); return; }
      clearTimeout(rxHoverT);
      rxHoverT = setTimeout(() => {
        if (!face.isConnected || !face.matches(':hover')) return;
        if (rxFor && !rxHover) return;
        if (rxFor) closeRx();
        go(face);
        if (rxFor) { rxHover = true; rxAt = performance.now(); }
      }, INTENT);
    });
    host.addEventListener(selector ? 'pointerout' : 'pointerleave', (e) => {
      if (!crossed(e, faceAt(e))) return;
      clearTimeout(rxHoverT); if (rxHover) leaveSoon();
    });
  }
  function pageStickerNote(sticker) {
    const n = noteOf(sticker.dataset.id);
    return n && !PN.locked(n) ? n : null;
  }
  hoverRx(ROOT, (sticker) => {
    const n = pageStickerNote(sticker); if (n) openRx(n, sticker, 'page');
  }, '.pn-stk.pg:not(.old)');
  rxBar.addEventListener('pointerenter', () => clearTimeout(rxLeaveT));
  rxBar.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && rxHover) leaveSoon(); });
  rxBar.addEventListener('mousedown', (e) => e.preventDefault());
  const heldRx = PN.holdToGrow(rxBar);
  // a reaction on a note, from any picker: the same one again peels it off; held on a small one, it grows. A big one peels
  // off clicked or held (the user: "clicking it changes i tto 1x instead. clicking or holding a 2x should unstick it"). The box
  // the user is writing in is drawn again with its words, and gets its caret back where it was. One from a picker in the notes
  // column leaves what's picked as it was, so no row moves (the user: "when i click an emoji like how i just did in this
  // thread, the thread box moves. that shouldn't happen"): picking the row the user reacted on lifted it level with its words.
  // A first reaction answering an open question then moves the user on, once the sticker has landed
  const caretOf = new WeakMap();
  let keptPill = null;   // the selection pill, once drawn: render() keeps its shrunk form in step with the note
  function stickOn(n, k, big, from) {
    if (PN.sentOn()) return;
    const a = ROOT.activeElement || document.activeElement;
    const keepEditing = n.id === editing && a?.tagName === 'TEXTAREA';
    if (keepEditing) caretOf.set(n, [a.selectionStart, a.selectionEnd]);
    if (n.react === k && (n.big || !big)) return peel(n);
    const wasOpen = threadWaiting({id:n.id});
    n.react = k; if (big) n.big = true; else delete n.big; save(); if (from !== 'row') sel = n.id; render(); cheer(n, big, from);
    if (wasOpen && !keepEditing && !threadWaiting({id:n.id})) nextOpenThread(n.id);
  }
  rxBar.addEventListener('click', (e) => {
    const b = e.target.closest('.rb'); const n = rxFor, from = rxFrom, big = heldRx();
    // a click just after it grew, on the reaction that took the button's place, was meant for the button: it only keeps
    // the picker open, so pointing and then clicking the button never puts on a sticker the user didn't choose
    if (b && from === 'row' && rxHover && performance.now() - rxAt < 450 && !b.nextElementSibling?.matches('.rb:not([hidden])')) { rxHover = false; clearTimeout(rxLeaveT); return; }
    closeRx(); if (!b || !n) return;
    stickOn(n, b.dataset.k, big, from);
  });
  document.addEventListener('mousedown', (e) => { const t = tgt(e); if (rxFor && !rxBar.contains(t) && !t.closest?.('.ib.rx, .pnN-row .pn-stk, .pn-stk.pg')) closeRx(); });
  // The picker grows from the content reaction or the agent's message, whichever it belongs to.
  function stickerSpot(host, noteOf, name = 'Sticker') {
    const rx = el(`<button type="button" class="ib rx" title="${name}" aria-label="${name}">${icon('StickerIcon')}</button>`);
    rx.addEventListener('mousedown', (e) => e.preventDefault());   // the box the user is typing in keeps its focus
    const open = (face = rx) => { const n = noteOf(); if (rxFor === n) closeRx(); else openRx(n, rx, 'row', true, face); };
    rx.onclick = (e) => { e.stopPropagation(); clearTimeout(rxHoverT); if (rxHover && rxFor === noteOf()) return; open(); };
    hoverRx(rx, () => open(rx));
    const s = host.querySelector(':scope > .pn-stk');
    if (s) {
      host.classList.add('stuck'); s.title = `${s.getAttribute('aria-label')} · click to change`; s.addEventListener('mousedown', (e) => e.preventDefault());
      s.onclick = (e) => { e.stopPropagation(); clearTimeout(rxHoverT); if (rxHover && rxFor === noteOf()) return; open(s); };
      hoverRx(s, () => open(s));
    }
    host.appendChild(rx);
  }
  addEventListener('scroll', () => { if (rxFor) closeRx(); }, { passive: true });
  const counts = () => { thrSync(); nudgeSync(); sentUi(); };
  function select(id, atTop = false) { if (sel !== id) animateLine = true; sel = id; threadTop = atTop ? id : null; toward = null; renderRows(); }
  // nothing picked: the rows stack from the top again, so ones slid above the page's top come back (the user: "became unable
  // to de-select it or scroll higher in col3")
  // its Reply box lets go too: kept, the redraw handed it the focus back, which picked the row again and pushed the column
  // back down to it (the user: "i'm unable to scroll up in col3, it keeps pushing me back there"). What the user typed stays a draft
  function unpick() {
    if (!sel && !hold) return;
    if (sel === 'q:' + replying) replying = null;
    sel = null; hold = null; animateLine = true; renderRows();
  }

  function render() { applyMarks(); renderRows(); keptPill?.sync(); }
  // an agent's words with [[Part label]] as a link to that part. The label is the Outline's, or the whole heading of a part whose
  // label the Outline clips. One no longer on the page stays plain words
  function partNamed(label) { return blockEl(label) || [...document.querySelectorAll('[data-note]')].find((b) => { const l = labelOf(b); return l.endsWith('…') && label.startsWith(l.slice(0, -1)); }) || null; }
  function linked(text) { return String(text).split(/\[\[(.+?)\]\]/).map((s, i) => (i % 2 && partNamed(s) ? `<button type="button" class="pn-go" data-to="${esc(s)}">${esc(s)}</button>` : esc(s))).join(''); }
  // The user's words as bubbles: a blank line starts the next, as the agent's replies split (the user, 2026-11-10: "apply the same
  // human-feedback bubble split logic to my own bubbles, so that subsequent rounds split my messages for me"). Only what is shown
  // splits: the stored words and Copy keep his paragraphs as he wrote them, and while he types he has the one box, so a note
  // splits once it is saved or sent. `sp` marks a split group, so a one-paragraph bubble keeps its single-bubble look
  const paragraphs = (t) => String(t ?? '').trim().split(/\r?\n\s*\r?\n/).map((x) => x.trim()).filter(Boolean);
  // `cls`: every bubble's own classes; `tail`: extra classes and markup for the last bubble only (a done check, the See original button)
  const userBubbles = (text, cls = '', tail = {}) => { const ps = paragraphs(text); if (!ps.length) ps.push(''); return ps.map((t, i) => { const end = i === ps.length - 1;
    return `<div class="b${cls}${ps.length > 1 ? ' sp' : ''}${end ? tail.cls || '' : ''}"><span>${esc(t)}</span>${end ? tail.html || '' : ''}</div>`; }).join(''); };
  const GIST_BTN = (open) => `<button type="button" class="pn-lnk pn-gist" aria-expanded="${open}">${open ? 'See summary' : 'See original'}</button>`;
  // "cut, don't reword": the gist changes only the bubble; said stays whole for matching and Copy. The toggle names what a
  // click shows: the gist is a cleaned-up summary, so See original opens the user's own words (in bubbles, a paragraph each) and
  // See summary folds back (the user, 2026-11-08: "your "show less" is really a cleaned up summary. vs. So it should say "See
  // original" and "See summary""; Show full note / Show less through 1.141.0)
  const noteWords = (a, full = false) => !a.said ? '' : a.gist && !full ? `<div class="b was nw"><span>${esc(a.gist)}</span>${GIST_BTN(false)}</div>`
    : userBubbles(a.said, ' was nw', { html: a.gist ? GIST_BTN(true) : '' });
  function noteGist(row, a) {
    const button = row.querySelector('.pn-gist'); if (!button) return;
    button.onclick = (e) => {
      e.stopPropagation(); const full = button.getAttribute('aria-expanded') !== 'true';
      const old = [...row.querySelectorAll(':scope > .b.nw')];
      old[0].insertAdjacentHTML('beforebegin', noteWords(a, full)); old.forEach((x) => x.remove());
      noteGist(row, a); layout(true);
    };
  }
  // "multiple bubbles of replies": a blank line starts the next; typing stays in one bubble
  const agentBubbles = (a, live = false) => (live ? [dots()] : String(a.text).trim().split(/\r?\n\s*\r?\n/).map((t) => linked(t.trim())))
    .map((t) => `<div class="qb${live ? ' ty' : ''}">${t}</div>`).join('');
  // a click goes to the part as the Outline does; the Notes footer holds the return control clear of the page's words
  let backTo = null;
  const backBtn = el('<button type="button" class="pn-btn pn-bk" hidden>Back to thread</button>');
  ovBox.prepend(backBtn);
  ROOT.addEventListener('click', (e) => {
    const go = tgt(e).closest?.('.pn-go'); if (!go) return;
    e.stopPropagation();
    const n = partNamed(go.dataset.to); if (!n) return;
    backTo ??= scrollY; backBtn.hidden = false; relayoutSoon();
    PN.jump(n, labelOf(n));
  }, true);
  backBtn.onclick = () => { const y = backTo; backTo = null; backBtn.hidden = true; relayoutSoon(); goTo(y); };
  function marker(id, title, k) {   // a reaction shows as its sticker, else the comment icon
    const mk = el(`<button type="button" class="pnN-mk${REACT[k] ? ' stk' : ''}" data-id="${esc(id)}" title="${esc(title.slice(0, 80))}">${REACT[k] ? PN.art(k) : icon('ChatIcon')}</button>`);
    mk.onclick = () => { sel = id; animateLine = true; setNotes(true); renderRows(); };
    return mk;
  }
  // a note's bubble holds its words; a reaction on its own has none
  // (one bubble a paragraph; a click on any of them rewrites the whole note, in its one box)
  const bubbles = (n) => (n.text ? [...el(`<div>${userBubbles(n.text)}</div>`).children] : []);
  // the check is already at rest when the user steps back. Earlier versions stay read only, with no cursor visit.
  function doneMark(row, id) {
    if (!PN.noteDone(id)) return false;
    row.classList.add('dm'); row.classList.remove('fold');   // a folded bubble would clip the check
    const b = [...row.querySelectorAll(':scope > .b')].pop(); if (b) b.classList.add('tb');   // the last bubble of a split note
    (b || row).append(el(`<div class="qk" role="img" aria-label="Done" title="Done">${PN.art('check')}</div>`));
    return true;
  }
  // the receipt on a bubble the user sent (1.80.0): Tick02 once the user has copied it, TickDouble02 once the agent has the user's paste or for
  // one from an earlier round. It pops in as it comes or turns to two, never on the first draw, and a redraw midway carries
  // the pop on from where it was. tickNow: this draw's ticks by row; tickWas: the last draw's
  let tickWas = new Map(), tickNow = new Map();
  function tick(b, key, two) {
    if (!b) return;
    const k = two ? 2 : 1, now = performance.now(), w = tickWas.get(key), at = w && w.k === k ? w.at : bubblesDrawn ? now : -1e9;
    tickNow.set(key, { k, at });
    const t = el(`<i class="tk" role="img" aria-label="${two ? 'Received' : 'Sent'}">${icon(two ? 'TickDouble02Icon' : 'Tick02Icon')}</i>`);
    if (now - at < 250 && !reduced()) { t.classList.add('in'); t.style.animationDelay = `${-Math.round(now - at)}ms`; }
    b.classList.add('tk-on'); b.append(t);
  }
  // a note's pictures, small, where its quote goes; one with no thumbnail (a drawing, a big inline image) by its name
  const thumbs = (n) => { const imgs = (n.imgs || []).filter((p) => p.src || p.name !== n.quote); return imgs.length ? `<div class="qi">${imgs.map((p) => (p.src ? `<img src="${esc(p.src)}" alt="${esc(p.name)}" title="${esc(p.name)}">` : `<span>${esc(p.name)}</span>`)).join('')}</div>` : ''; };   // a drawing named like the words beside it would only say them twice
  function lightMarks() {   // the picked note's or question's words light up in the page
    unlight();
    // a question waiting hidden for the cursor's tap on a first round has no highlight under its words till then
    document.querySelectorAll(`mark.${P}ask`).forEach((m) => { const id = m.dataset.id.slice(2); m.classList.toggle(P + 'pw', postLive.has(id) && postStep.get(id) === 'held'); });
    if (sel && !isEdit(sel)) marksOf(sel).forEach((m) => m.classList.add(P + 'on'));
    document.querySelectorAll('iframe').forEach((f) => PN.toFrame(f, { kind: 'on', id: sel }));
  }
  // true while the redraw takes the rows away: Chrome tells a box it lost focus then, though the user didn't leave it
  let drawing = false;
  function renderRows() {
    col.querySelectorAll('.pn-open-dot').forEach((dot) => { const item = loopStates.get(dot.closest('.pnN-row').dataset.id); if (item && dot.getBoundingClientRect().width) item.rect = dot.getBoundingClientRect(); });
    lightMarks();
    // where each row is on screen right now, mid-glide or not, so its redrawn row moves on from there
    if (ui.notes) col.querySelectorAll('.pnN-row').forEach((r) => { const p = was.get(r.dataset.id); if (p) p.y = r.getBoundingClientRect().top + scrollY; });
    drawing = true; col.querySelectorAll('.pnN-row,.pnN-mk').forEach((x) => x.remove()); drawing = false;
    tickNow = new Map();
    // the agent's questions: general ones at the top, the rest beside what they're about, with the user's reply under each
    PN.ASKS.forEach((a) => col.append(askRow(a), marker('q:' + a.id, a.text, PN.answerable(a) ? state.answers[a.id]?.react : '')));
    col.querySelectorAll('.pnN-row.ew-live').forEach(ewReserve);
    // last round's Overall, on the version it was about: the column's first row, dimmed like that round's notes
    const past = V && V.cur < V.last ? PN.pastOverall(V.cur) : '';
    if (past) { const r = el(`<div class="pnN-row old ovp" data-id="ov:past"><div class="h"><span class="lbl">Overall</span></div>${userBubbles(past)}</div>`); if (!doneMark(r, 'ov:past')) tick([...r.querySelectorAll('.b')].pop(), 'ov:past', true); col.append(r); }
    PN.sorted().forEach((n) => {
      const old = PN.locked(n);
      const row = el(`<div class="pnN-row${n.id === sel ? ' sel' : n.id === editing ? '' : ' fold'}${old ? ' old' : ''}" data-id="${n.id}"><div class="h"><span class="lbl">${esc(n.block || 'Page')}${n.lost ? (n.quote ? ' · text changed' : ' · picture changed') : ''}</span></div></div>`);
      const media = thumbs(n);
      const target = el(`<div class="pn-note-target"><div class="pn-note-content">${media}${n.quote || !media ? `<div class="q">${esc(n.quote || n.block || 'Page')}</div>` : ''}</div></div>`);
      if (REACT[n.react] || !old) {
        const spot = el('<div class="pn-note-rx"></div>');
        if (REACT[n.react]) spot.append(sticker(n));
        if (!old) stickerSpot(spot, () => n, 'React to content');
        target.append(spot);
      }
      row.append(target);
      if (n.id === editing) {
        const ta = grow(el(`<textarea class="pn-ta" rows="1" placeholder="Comment"></textarea>`)); ta.value = n.draft ?? n.text;
        const acts = el(`<div class="row"><button type="button" class="pn-btn pri">Save</button><button type="button" class="pn-lnk">Cancel</button></div>`);
        const saveBtn = acts.querySelector('.pn-btn');
        const sync = () => { n.draft = ta.value; save(); saveBtn.disabled = !ta.value.trim() && !REACT[n.react] && !n.files?.length; layout(true); };
        ta.addEventListener('input', sync); saveBtn.disabled = !ta.value.trim() && !REACT[n.react] && !n.files?.length;
        const done = () => { if (n.text !== ta.value.trim()) n.edited = Date.now(); n.text = ta.value.trim(); delete n.draft; editing = null; doom = null; if (!has(n)) return remove(n); liftFrom(ta, n.id, n.text); save(); render(); };
        const cancel = () => { unwait(n.id); delete n.draft; editing = null; doom = null; if (!has(n)) return remove(n); save(); render(); };
        saveBtn.onclick = done; acts.querySelector('.pn-lnk').onclick = cancel;
        let d = null;   // the user's saved comment can be deleted from here, once confirmed
        ta.addEventListener('keydown', (e) => {
          if (d?.asking()) { if (e.key === 'Escape') { e.preventDefault(); d.back(); } else if (e.key === 'Enter') e.preventDefault(); return; }
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!saveBtn.disabled) done(); } if (e.key === 'Escape') cancel();
        });
        row.append(withClip(ta, n.id), acts);
        if ((n.text || '').trim()) d = deletable(n.id, ta, acts, () => 'comment', (els) => dropComment(n, row, els));
        // the layout brings the row into view, clear of the footer; a sticker put on meanwhile gives the caret back where it was
        setTimeout(() => { ta.focus({ preventScroll: true }); const c = caretOf.get(n); if (c) { caretOf.delete(n); ta.setSelectionRange(...c); } }, 30);
      } else if (old) {
        const bs = bubbles(n); row.append(...bs);
        if (!doneMark(row, n.id) && bs.length) tick(bs[bs.length - 1], n.id, PN.gotIt(n.edited || n.created, n.created));
      } else {
        // a click on the user's bubble rewrites it, so there's no Edit button (the user: "make the bubble clickable to edit, we don't
        // need the edit icon on top right"); a sticker with no words gets a Comment box on its selected row instead
        // Delete is in the edit box, not the header (the user: "trash icon in col3 is really confusing")
        const bs = bubbles(n);   // a picture goes on from the Comment or edit box's own paperclip
        if (bs.length) bs.forEach((b) => { b.title = 'Click to edit'; b.onclick = (e) => { e.stopPropagation(); editing = sel = n.id; doom = null; render(); }; row.appendChild(b); });
        else if (n.id === sel) {
          const add = el('<textarea class="pn-ta" rows="1" placeholder="Comment"></textarea>');
          add.addEventListener('focus', () => { editing = n.id; render(); });
          row.appendChild(withClip(add, n.id));
        }
      }
      const fl = [filesEl(n.id, n.files, old), askEl(n.id, n.files, n.id === editing ? row.querySelector(':scope > .row') : null)].filter(Boolean);
      // the user's pictures sit above the user's bubble or the box the user is writing in, as a messaging app's do (the user: "attachmetn should
      // apepar above thebubble"); the prompt for a waiting one sits where its chip will land, after any chips already there
      if (fl.length) { const at = row.querySelector(':scope > .b, :scope > .pnF-box'); if (at) at.before(...fl); else row.append(...fl); }
      if (!row.querySelector(':scope > .b, :scope > .pnF-box')) row.classList.add('bare');
      row.addEventListener('click', (e) => { if (e.target.closest('textarea,button')) return; select(n.id); });
      col.append(row, marker(n.id, n.text || REACT[n.react]?.[1] || '', n.react));
    });
    // a part typed into: its new text, with an undo back to the page's own text
    edited().forEach((label) => {
      const id = 'e:' + label, field = editEl(label), old = PN.editLocked(label);   // an earlier round's edit: dimmed, and typing again makes it this round's
      // an edit over several blocks shows them all: every block's words struck, then what is left of them, one block a line
      const parts = PN.editParts(label), was = parts.map((x) => x.was).join('\n'), now = parts.map((x) => x.now).filter((t) => t.trim()).join('\n');
      const row = el(`<div class="pnN-row${id === sel ? ' sel' : ''}${old ? ' old' : ''}" data-id="${esc(id)}"><div class="h"><span class="lbl">${esc(PN.editPart(label))} · edited</span></div><div class="was"><span>${esc(was)}</span></div><div class="et">${esc(now || '(cleared)')}</div></div>`);
      const undo = el(`<button type="button" class="ib" title="Undo edit">${icon('Undo02Icon')}</button>`);
      undo.onclick = (e) => { e.stopPropagation(); revertEdit(label); if (sel === id) sel = null; render(); };
      if (!old) row.querySelector('.h').append(undo);
      else doneMark(row, id);
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        select(id); if (old) return;
        const f = PN.frameEditNode(label);
        if (f) PN.openFrameEdit(f, null, label); else PN.openEdit(field);
      });
      col.append(row, marker(id, state.edits[label] || ''));
    });
    tickWas = tickNow;
    drawOvFiles(); bubbleArrivals(); counts(); outline();
    landing.clear(); const asking = new Set([...ROOT.querySelectorAll('.pnF-ask')].map((x) => x.dataset.for)); asked.forEach((t) => { if (!asking.has(t)) asked.delete(t); });
    col.querySelectorAll('textarea').forEach((t) => t.pnFit?.());   // the redrawn boxes at their own height now, not a frame on: a row a pixel taller for one frame bobbed every row under it
    layout(true); replayMoves();
    rowsSeen.disconnect(); col.querySelectorAll('.pnN-row').forEach((r) => rowsSeen.observe(r));
  }

  // a bubble whose words are new since the last draw (a note just saved or changed, a reply just left) pops in as in the
  // writing app; several at once come one after another. Nothing animates on the first draw, and a redraw keeps the rest still.
  // One the user has just sent lifts out of the box the user typed it in instead (liftFrom, liftIn)
  const bubblesSeen = new Set(); let bubblesDrawn = false;
  function bubbleArrivals() {
    const fresh = [...col.querySelectorAll('.pnN-row > .b')].filter((b) => {
      const k = b.closest('.pnN-row').dataset.id + '\n' + b.textContent;
      return !bubblesSeen.has(k) && bubblesSeen.add(k);
    });
    const up = lift && performance.now() - lift.at < 1000 ? lift : null; lift = null;
    if (!bubblesDrawn) { bubblesDrawn = true; return; }
    fresh.forEach((b, k) => {
      if (up && !reduced() && b.closest('.pnN-row').dataset.id === up.id && b.textContent === up.text) {
        moving.set(up.id, { kind: 'lift', t0: performance.now(), ms: 400 * SLOW, play: (r, t) => liftIn(r, up, t) }); return;
      }
      b.classList.add('pn-in'); b.style.animationDelay = `${Math.min(5400, k * Math.min(850, 5400 / fresh.length))}ms`;
    });
  }
  // a redraw a box's blur asks for, held while a mouse button is down: the press that took the focus is half a click, and
  // a redraw before its release replaces what it pressed, so the click never fires (the user's reply, clicked to rewrite it
  // straight after sending it, didn't open). It runs once the button is let go and the click has landed, or after 2 s
  let pressed = false; const afterUp = [];
  const afterPress = (f) => { if (!pressed) return setTimeout(f, 0); afterUp.push(f); setTimeout(() => { const i = afterUp.indexOf(f); if (i >= 0) { afterUp.splice(i, 1); f(); } }, 2000); };
  addEventListener('pointerdown', () => { pressed = true; }, true);
  ['pointerup', 'pointercancel'].forEach((t) => addEventListener(t, () => { pressed = false; setTimeout(() => afterUp.splice(0).forEach((f) => f()), 0); }, true));
  // the user's words as they sit in the box the user typed them in, for the bubble they become to lift out of (the user, on copying how
  // messaging apps show "both my and their message": a reply's words "lift out of the Reply box into your bubble, the box
  // reopens empty under it"; a new note's "become your bubble right where you typed them, with the same lift")
  let lift = null;
  function liftFrom(ta, id, text) {
    if (!text || !ta?.isConnected || reduced()) return;
    const r = ta.getBoundingClientRect(), cs = getComputedStyle(ta);
    lift = { id, text, x: r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), y: r.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop), top: r.top, color: cs.color, at: performance.now() };
  }
  // the words move from where they were typed to the bubble's place as it takes its colour, as a sent message rises out of
  // the box it was typed in; an emptied Reply box under it glides down from where it was to make room. `t` ms in
  const LIFT = 'cubic-bezier(.25,1.12,.45,1)';
  function liftIn(r, up, t) {
    const first = paragraphs(up.text)[0], b = [...r.querySelectorAll(':scope > .b')].reverse().find((x) => x.textContent === first); if (!b) return;
    if (up.dx == null) { const w = (b.querySelector(':scope > span') || b).getClientRects()[0] || b.getBoundingClientRect(); up.dx = up.x - w.left; up.dy = up.y - w.top; }
    const cs = getComputedStyle(b), d = { duration: 400 * SLOW, delay: -t, easing: LIFT };
    // a note of several paragraphs lifts as one: every bubble of the group rises from the box, then they settle apart
    const group = [b]; for (let x = b.nextElementSibling; x?.matches('.b.sp'); x = x.nextElementSibling) group.push(x);
    group.forEach((g) => g.animate([{ translate: `${up.dx.toFixed(1)}px ${up.dy.toFixed(1)}px`, backgroundColor: 'transparent', color: up.color }, { translate: '0 0', backgroundColor: cs.backgroundColor, color: cs.color }], d));
    const box = [...r.querySelectorAll(':scope > .pnF-box')].find((x) => x.querySelector(':scope > textarea.re')), at = box?.getBoundingClientRect();   // no :has(), which older browsers throw on
    if (up.box == null && at) up.box = up.top - at.top;
    if (box && Math.abs(up.box || 0) > 1) box.animate([{ translate: `0 ${up.box.toFixed(1)}px` }, { translate: '0 0' }], { ...d, easing: 'cubic-bezier(.2,.7,.25,1)' });
  }
  // a thread the user answered in chat: the agent's question, then the user's words as the user's own reply with the agent's ✅ on its corner
  // and "Answered in chat" under it, the label as it was (the user, of a Done label there: "we don't need that, remove it").
  // No Reply box, open dot or count. Until the agent's cursor closes it (doChat) it shows open, with a dimmed Reply box the user's
  // words will be typed into before it folds away; a redraw midway shows the step it's at
  function ewRow(a) {
    const id = 'q:' + a.id, x = state.answers[a.id], step = ewStep.get(a.id) ?? (ewOpen(a) ? 0 : 4), n = ewTyped.get(a.id) || 0;
    const row = el(`<div class="pnN-row ask ew${step < 3 ? ' ew-live' : ' ew-done'}${step >= 1 && step <= 3 ? ' ew-sel' : ''}${id === sel ? ' sel' : ''}${PN.ASKS_OPEN ? '' : ' old'}" data-id="${esc(id)}">`
      + `<div class="h"><span class="lbl">${esc(postLabel(a, false))}</span>${newTag(a)}</div>`
      + `${a.quote ? `<div class="q">${esc(a.quote)}</div>` : ''}${noteWords(a)}${agentBubbles(a)}<div class="ew-body">`
      + (step < 3 ? `<div class="ew-f ew-box${step >= 2 ? ' shut' : ''}"><div><div class="ew-re${step === 1 ? ' focus' : ''}${n ? ' typed' : ''}" aria-hidden="true"${step ? '' : ` title="${esc(AGENT)} is filling this in from chat"`}>`
        + `<span class="ph">Reply</span><span class="tx"><span class="w">${esc(a.ew.slice(0, n))}</span><span class="cr"></span></span></div></div></div>` : '')
      + `<div class="ew-f ew-ans${step < 2 ? ' shut' : ''}"><div>${userBubbles(a.ew, ' was', { cls: ' tb', html: `<div class="qk" role="img" aria-label="Answered">${PN.art('check')}</div>` })}<div class="ew-src">Answered in chat</div></div></div></div></div>`);
    noteGist(row, a);
    if (x && REACT[x.react]) lastQb(row).appendChild(sticker(x));
    row.querySelector('.ew-re')?.addEventListener('click', (e) => e.stopPropagation());   // the cursor's to fill: a click there does nothing
    row.addEventListener('click', (e) => { if (e.target.closest('textarea,button')) return; select(id); });
    return row;
  }
  // a question row: the agent's words in a grey bubble, then the user's reply, typed in place and kept as the user types; it shows as the user's
  // own blue bubble once the user leaves the box, and a click on it reopens the box
  // Delete at the right end of Save and Cancel while the user edits one of the user's bubbles (the user: "it should show when i'm editing the
  // comment or reply, maybe next to cancel… it also needs a confirmation"; "i need to be able to delete a bubble… on either
  // bubble"). A click swaps that row, at its height, for "Delete reply?" with Cancel and a red Delete where the link was, and
  // strikes the user's words through; Cancel or Escape goes back to editing. `key` names the bubble, so a redraw midway keeps the
  // question up; what() says what would go ('reply' or 'comment'), go() takes it, given the parts to fold away
  let doom = null;   // the bubble whose Delete is waiting to be confirmed
  function deletable(key, ta, acts, what, go) {
    const link = el('<button type="button" class="pn-lnk pn-dl">Delete</button>'); acts.appendChild(link);
    let cf = null;
    const ask = (swap) => {
      doom = key;
      cf = el(`<div class="row pn-cf${swap ? ' pn-swap' : ''}"><span class="pn-cfq">Delete ${what()}?</span><button type="button" class="pn-lnk">Cancel</button><button type="button" class="pn-btn pn-red">Delete</button></div>`);
      cf.addEventListener('mousedown', (e) => e.preventDefault());   // the user's box keeps its focus, so Escape still reaches it
      cf.querySelector('.pn-lnk').onclick = (e) => { e.stopPropagation(); back(); };
      cf.querySelector('.pn-red').onclick = (e) => { e.stopPropagation(); cf.style.pointerEvents = 'none'; doom = null; go([ta.closest('.pnF-box') || ta, cf]); };
      acts.replaceWith(cf); ta.classList.add('doomed'); ta.readOnly = true; layout(true);
      if (swap) ta.focus({ preventScroll: true });   // a click on the link may have taken it
    };
    const back = () => {
      if (!cf) return; doom = null; cf.replaceWith(acts); cf = null;
      ta.classList.remove('doomed'); ta.readOnly = false; ta.focus({ preventScroll: true }); layout(true);
    };
    link.onclick = (e) => { e.stopPropagation(); ask(true); };
    if (doom === key) ask(false);
    return { asking: () => !!cf, back };
  }
  // what the user deleted folds shut, and what's below glides up into its room; the whole row fades first when it all goes
  const FOLD = 'cubic-bezier(.45,0,.55,1)';
  function foldAway(els, then) {
    if (reduced()) return then();
    els.forEach((x) => {
      const cs = getComputedStyle(x); x.style.overflow = 'hidden';
      x.animate([{ height: x.offsetHeight + 'px', marginTop: cs.marginTop, opacity: 1 }, { opacity: 0, offset: 0.6 }, { height: '0px', marginTop: '0px', opacity: 0 }], { duration: 500, easing: FOLD, fill: 'forwards' });
    });
    setTimeout(then, 520);
  }
  function fadeRow(row, then) {
    if (reduced()) return then();
    row.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-in-out', fill: 'forwards' });
    setTimeout(then, 320);
  }
  // the user's note's comment: with a sticker or a picture left the note stays with them, and a sticker-only note shows its Comment
  // box again; with nothing left the note goes, as remove() takes it
  function dropComment(n, row, els) {
    if (!(REACT[n.react] || n.files?.length)) return fadeRow(row, () => { delete n.draft; if (editing === n.id) editing = null; remove(n); });
    foldAway(els, () => {
      const was = { text: n.text, edited: n.edited };
      n.text = ''; delete n.draft; n.edited = Date.now(); if (editing === n.id) editing = null; save(); render();
      offer('Comment deleted', () => { n.text = was.text; if (was.edited == null) delete n.edited; else n.edited = was.edited; save(); sel = n.id; animateLine = true; render(); });
    });
  }
  // one of the user's replies; the rest, the user's sticker and the user's pictures stay. With none left the question waits for an answer again
  function dropReply(a, i) {
    if (!threadOpen(a)) return;
    const n = PN.answerOf(a), before = PN.repliesOf(n), at = n.at; if (i >= before.length) return;
    PN.setReplies(n, before.filter((_, k) => k !== i)); n.at = Date.now(); save(); render();
    offer('Reply deleted', () => { if (!threadOpen(a)) return; PN.setReplies(n, before); n.at = at; save(); sel = n.id; animateLine = true; render(); });
  }
  let replying = null;   // the question whose Reply box has the user's cursor
  let rewriting = null;   // { id, i }: the reply the user clicked to rewrite, in place of its bubble
  function askRow(a) {
    if (a.ew) return ewRow(a);
    const id = 'q:' + a.id, x = state.answers[a.id], open = PN.answerable(a) && !PN.answerSent(x), editable = threadOpen(a), rs = PN.repliesOf(x);
    // a reply to one of the user's notes shows the user's note's words first, on the user's side, then the agent's answer
    // an open question on the whole page pins under the bar as the page scrolls (layout's pin)
    const ovq = open && !a.block && !a.reply, wait = PN.answerable(a) && !PN.threadClosed(a);
    // not yet arrived (postArrive): a one-line bubble with the agent typing in it, and nothing under it; until the cursor
    // taps it in, hidden, all but a reply's note of the user's
    const live = postLive.has(a.id), held = live && postStep.get(a.id) === 'held';
    const pcls = live ? (held ? ` ty ph${a.reply && a.said ? ' rp' : ''}` : ' ty') : '';
    const lbl = esc(postLabel(a, held));
    const row = el(`<div class="pnN-row ask${id === sel ? ' sel' : ''}${open ? '' : ' old'}${ovq ? ' ovq' : ''}${wait ? ' wait' : ''}${pcls}" data-id="${esc(id)}">${newTag(a)}<div class="h"><span class="lbl">${lbl}</span></div>${a.quote ? `<div class="q">${esc(a.quote)}</div>` : ''}${noteWords(a)}${agentBubbles(a, live)}</div>`);
    noteGist(row, a);
    // the user's reaction goes on the agent's bubble's bottom right corner, where its Sticker button sits. Nothing in the header
    // deletes: each reply has its own Delete while the user rewrites it, and the sticker and pictures come off on their own
    const qb = lastQb(row);
    if (qb && !live && x && REACT[x.react]) qb.appendChild(sticker(x));
    // a copy locks every thread, including one left unanswered: replies, stickers and pictures wait for Unlock
    if (editable && qb && !live) stickerSpot(qb, () => PN.answerOf(a), 'React');
    // the user's pictures, on the user's side above the user's reply or the Reply box, as above a note's bubble (1.84.0 put them under; the user:
    // "the attachmetn appeared below my reply here even though i did it first. attachmetn should apepar above thebubble");
    // a sent thread's can't come off
    row.append(...[filesEl(id, x?.files, !editable), askEl(id, x?.files)].filter(Boolean));
    // the user's replies, one blue bubble each, oldest first; a click on one rewrites it where it is
    rs.forEach((t, i) => {
      if (editable && rewriting && rewriting.id === a.id && rewriting.i === i) return row.append(...rewriteBox(a, i, t));
      const bs = [...el(`<div>${userBubbles(t, ' re')}</div>`).children];   // a paragraph a bubble; a click on one rewrites the whole reply
      if (editable) bs.forEach((b) => { b.title = 'Click to edit'; b.onclick = (e) => { if (!threadOpen(a)) return; e.stopPropagation(); clearTimeout(nextT); rewriting = { id: a.id, i }; replying = null; doom = null; sel = id; renderRows(); }; });
      row.append(...bs);
    });
    // a thread the user sent: the user's last reply has the receipt; on an earlier version the agent has them all
    if (!open) tick([...row.querySelectorAll(':scope > .b.re')].pop(), id, !PN.ASKS_OPEN || PN.gotIt(x?.at));
    // the Reply box, while the thread is open and the user hasn't replied: one reply per thread, rewritten by a click on it
    if (editable && !live && !rs.length) row.append(...replyBox(a, row));
    row.addEventListener('click', (e) => { if (e.target.closest('textarea,button') || (editable && e.target.closest('.b.re'))) return; select(id); });
    return row;
  }
  // Save and Cancel under a box the user is typing in; a click on them mustn't blur the box first
  const boxActs = () => { const acts = el(`<div class="row"><button type="button" class="pn-btn pri">Save</button><button type="button" class="pn-lnk">Cancel</button></div>`); acts.addEventListener('mousedown', (e) => e.preventDefault()); return acts; };
  // the Reply box: what the user types is kept as the user goes, as the thread's reply. Enter, Save or leaving the box makes it a
  // bubble and the box goes (one reply per thread); Escape or Cancel throws the typing away. Save and Cancel show only
  // while there's something to save or throw away
  function replyBox(a, row) {
    const id = 'q:' + a.id, x = state.answers[a.id];
    const ta = grow(el('<textarea class="pn-ta re" rows="1" placeholder="Reply"></textarea>')); ta.value = (x || {}).draft || '';
    let restored = !!ta.value;
    const box = withClip(ta, id);
    const acts = boxActs(), saveBtn = acts.querySelector('.pn-btn');
    const showActs = () => { const on = ROOT.activeElement === ta && !!ta.value.trim(); if (on && !acts.isConnected) box.after(acts); else if (!on && acts.isConnected) acts.remove(); joinAsk(row.querySelector(':scope > .pnF-ask'), on ? acts : null); saveBtn.disabled = !ta.value.trim(); layout(true); };
    // the typing becomes a bubble and the box goes; with `stay` and nothing typed, the cursor stays in the box
    const commit = (stay) => {
      if (!ta.isConnected || !threadOpen(a)) return false;
      const wasOpen = openQuestion(a), n = PN.answerOf(a), t = (n.draft || '').trim(); delete n.draft;
      if (t) { PN.setReplies(n, [...PN.repliesOf(n), t]); n.at = Date.now(); liftFrom(ta, id, t); }
      save(); replying = stay && !t ? a.id : null; renderRows();
      if (t && wasOpen) nudgeNext(a);
      return !!t;
    };
    const cancel = () => { if (!ta.isConnected || !threadOpen(a)) return; const n = state.answers[a.id]; if (row.querySelector(':scope > .pnF-ask.joined')) unwait(id); if (n) { delete n.draft; save(); } replying = null; ta.blur(); renderRows(); };
    saveBtn.onclick = () => commit(true);
    acts.querySelector('.pn-lnk').onclick = cancel;
    ta.addEventListener('input', () => {
      if (!ta.isConnected || !threadOpen(a)) return;
      threadTop = null; const n = PN.answerOf(a); n.draft = ta.value; n.at = Date.now(); save();
      counts(); showActs();   // the thread's badges hold until the user's reply lands (PN.replied)
    });
    ta.addEventListener('focus', () => {
      if (!threadOpen(a)) { ta.blur(); return; }
      if (restored) { restored = false; afterPress(() => { if (ROOT.activeElement === ta) ta.setSelectionRange(ta.value.length, ta.value.length); }); }   // resume a restored draft at its end, after the click places the caret
      replying = a.id; rewriting = null; showActs(); if (sel === id) return;
      sel = id; animateLine = true; col.querySelectorAll('.pnN-row.sel').forEach((r) => r.classList.replace('sel', 'fold')); row.classList.remove('fold'); row.classList.add('sel'); lightMarks(); thrSync(); layout(true);
    });
    // leaving the box keeps what the user typed, as a bubble. It's kept at once, since a click on another row redraws the column
    // before anything waiting could run; the redraw itself waits for the mouse to be let go (afterPress), so that click still lands. A box taken away by a redraw
    // has nothing to do
    let tabbed = false;   // focus left by Tab: the typing stays in the box, not sent
    ta.addEventListener('blur', () => {
      if (!ta.isConnected || drawing || !threadOpen(a)) return;
      if (!document.hasFocus()) return;   // the window or tab lost focus (a tab switch, another app), not the box: the words stay here as a draft, and the box is still focused when the user is back
      if (replying === a.id) replying = null;
      if (tabbed) { tabbed = false; return; }
      const picked = sel, wasOpen = openQuestion(a), n = state.answers[a.id], t = (n?.draft || '').trim();
      if (t) { delete n.draft; PN.setReplies(n, [...PN.repliesOf(n), t]); n.at = Date.now(); liftFrom(ta, id, t); save(); }
      afterPress(() => { if (ta.isConnected) renderRows(); if (t && wasOpen) nudgeNext(a, picked); });
    });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') tabbed = true;
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!ta.value.trim()) return; if (nudge.on) { commit(false); ta.blur(); } else commit(true); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    if (replying === a.id) setTimeout(() => { if (ta.isConnected) ta.focus({ preventScroll: true }); }, 30);
    return [box];
  }
  // one of the user's replies, rewritten in place of its bubble: Enter, Save or leaving the box keeps the new words; Escape or
  // Cancel keeps the old ones; saved empty, the reply goes, with Undo
  function rewriteBox(a, i, t) {
    const id = 'q:' + a.id;
    const ta = grow(el('<textarea class="pn-ta re ed" rows="1"></textarea>')); ta.value = rewriting.v ?? t;   // a redraw midway keeps the user's typing
    const acts = boxActs(); let done = false;
    // `later`: the box lost focus to a click, so the new words are kept now and the column redraws once the click has landed
    const finish = (keep, later = false) => {
      if (done || !ta.isConnected || !threadOpen(a)) return; done = true; rewriting = null; doom = null;
      const picked = sel, n = PN.answerOf(a), list = PN.repliesOf(n), v = ta.value.trim(), before = [...list];
      const changed = keep && v !== list[i];
      if (changed) { if (v) list[i] = v; else list.splice(i, 1); PN.setReplies(n, list); n.at = Date.now(); save(); }
      const show = () => {
        render();
        if (changed && v) nudgeNext(a, picked);
        if (changed && !v) offer('Reply deleted', () => { if (!threadOpen(a)) return; PN.setReplies(n, before); n.at = Date.now(); save(); sel = n.id; animateLine = true; render(); });
      };
      if (later) afterPress(show); else show();
    };
    acts.querySelector('.pn-btn').onclick = () => finish(true);
    acts.querySelector('.pn-lnk').onclick = () => finish(false);
    ta.addEventListener('input', () => { if (rewriting) rewriting.v = ta.value; layout(true); });
    let tabbed = false;   // as in the Reply box: Tab leaves the rewrite open, so only Enter or Save keeps it
    ta.addEventListener('blur', () => { if (tabbed) { tabbed = false; return; } if (ta.isConnected && !drawing && document.hasFocus()) finish(true, true); });   // hasFocus() false: the window or tab lost focus, so the rewrite stays open
    ta.addEventListener('keydown', (e) => {
      if (d.asking()) { if (e.key === 'Escape') { e.preventDefault(); d.back(); } else if (e.key === 'Enter') e.preventDefault(); return; }
      if (e.key === 'Tab') tabbed = true;
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    // any one of the user's replies can go from here, not only the last (a fragment holds the two, so a redraw can reopen the question)
    const frag = document.createDocumentFragment(); frag.append(ta, acts);
    const d = deletable(`${id}#${i}`, ta, acts, () => 'reply', (els) => { done = true; rewriting = null; foldAway(els, () => dropReply(a, i)); });
    setTimeout(() => { if (!ta.isConnected) return; ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); }, 30);
    return [frag];
  }
  // a question's anchor, shaped like a note's
  const askNote = (id) => { const a = askOf(id); return a ? { id, block: a.block, quote: a.quote } : null; };

  // ---------- placement, as in the writing app: each row level with its part; rows that would overlap stack, sharing a
  // hairline; every row is a whole number of pixels tall, so neighbours meet exactly, never a sliver over or apart ----------
  // quoted words inside a framed page, from the frame's last report, in this window's coordinates
  const framed = new Map();
  function inFrame(id) {
    const v = framed.get(id); if (!v || !v.f.isConnected) return null;
    const { x, y, kx, ky } = frameAt(v.f), r = v.r, mid = y + (r.top + r.height / 2) * ky;
    return { left: x + r.left * kx, top: y + r.top * ky, right: x + (r.left + r.width) * kx, bottom: y + (r.top + r.height) * ky, height: r.height * ky, mid, end: x + r.end * kx };
  }
  // Every thread links to one line: its quoted words, else the first heading, else the first words in its part.
  function partLine(part) {
    if (!part) return null;
    const scope = part.matches('h1,h2,h3,h4,h5,h6') ? part : part.querySelector('h1,h2,h3,h4,h5,h6') || part;
    const w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT); let first = null, left, right;
    for (let n; (n = w.nextNode());) {
      if (!n.data.trim() || n.parentElement.closest('script,style,noscript,template')) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) {
        if (!r.width || !r.height) continue;
        if (!first) { first = r; left = r.left; right = r.right; }
        const mid = first.top + first.height / 2;
        if (r.top < mid && r.bottom > mid) { left = Math.min(left, r.left); right = Math.max(right, r.right); }
      }
    }
    return first && { left, right, top: first.top, bottom: first.bottom, height: first.height, mid: first.top + first.height / 2 };
  }
  function anchorY(id) {
    if (isEdit(id)) {
      const q = inFrame(id); if (q) return q.mid + scrollY;
      const f = editEl(id.slice(2)) || PN.frameEditNode(id.slice(2)); if (!f) return 0;
      const r = f.getBoundingClientRect(); return r.top + Math.min(r.height, 28) / 2 + scrollY;
    }
    const n = noteOf(id) || askNote(id); if (!n) return 0;
    const m = marksOf(n.id).find((m) => m.tagName === 'MARK');
    if (m) { const r = m.getClientRects()[0] || m.getBoundingClientRect(); return midOf(m, r) + scrollY; }
    const fq = inFrame(n.id); if (fq) return fq.mid + scrollY;
    const r = partLine(blockEl(n.block)); return r ? r.mid + scrollY : 0;
  }
  const SNAP = 48;   // a gap between rows shorter than this reads as a mistake, not as placement: close it
  const EASE = 'cubic-bezier(.4,0,.2,1)';
  let questionMove = false;   // an answered question glides within its tab and lands immediately in a new tab
  // A thread jump reads from its head, even after its Reply box takes focus (the user: "the thread is scrolling so the bottom
  // of the thread is visible but it should scroll so the top is visible"). The user's next action gives typing and part-sync back their usual placement.
  // A held key's repeats, a modifier pressed alone and a key the browser can't name aren't one (after a Shift, headless Chrome
  // sends a stream of "Unidentified" keydowns, which let go of the placement as it landed).
  let threadTop = null;
  const MODS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'Unidentified'];
  ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach((k) => addEventListener(k, (e) => { if (e.isTrusted && !(k === 'keydown' && (e.repeat || MODS.includes(e.key)))) threadTop = null; }, { capture: true, passive: true }));
  // scrollHold: the picked thread the user scrolled, kept where the user's scroll left it while it's taller than the room (layout).
  // ownScroll: the scroll that ends next is the user's (a wheel, a key, a touch, the scrollbar), not the app's. The user's typing,
  // a click off the thread or the app's own scroll lets it go
  let scrollHold = null, ownScroll = false;
  ['wheel', 'touchmove', 'keydown', 'pointerdown'].forEach((k) => addEventListener(k, (e) => { if (e.isTrusted) ownScroll = true; }, { capture: true, passive: true }));
  ['keydown', 'pointerdown', 'input'].forEach((k) => addEventListener(k, (e) => {
    if (!scrollHold || !e.isTrusted || (k === 'keydown' && (e.repeat || MODS.includes(e.key)))) return;
    if (k === 'pointerdown' && e.composedPath().some((x) => x.classList?.contains('pnN-row') && x.dataset.id === scrollHold)) return;   // a click inside the thread leaves it there
    scrollHold = null;
  }, { capture: true, passive: true }));
  const was = new Map();   // each row's last place and height, by id, so a redrawn or grown row moves on from where it was
  let shown = sel, laidOut = false, above = false, stillTill = 0;   // above: rows slid past the page's very top, out of scrolling's reach; stillTill: landAll's draw, where nothing glides
  let pinned = null;   // the overall questions' rows, their unpinned places, and how far they can move down before the next row
  let footHold = null;   // the row the user is typing in, and the top it rose to for the user's box (layout's keepFoot)
  let goingTo = null, goT = 0;   // where the app's own smooth scroll (reveal, goTo) is taking the window, until it ends
  let toward = null;   // the part the outline last jumped to, while its words are in the window
  // a row's top, risen clear of the Overall box when its words are in the window (scrolled to sy) but its place level with
  // them is under the box; else its own place. Never lower than its own place, nor under the top bar. A tall row rises
  // only until its head clears the box: risen whole, it sat in the same place for most of a window's scrolling and pulled
  // the user's eye back to it at every stop (the user: "it kept bringing me back to that thread")
  const RISE_HEAD = 160;
  const seen = (words, sy) => words >= sy && words <= sy + innerHeight;
  const roomTop = (sy) => Math.ceil(sy + bar.offsetHeight + 12);
  const rise = (top, h, words, sy) => {
    const floor = sy + innerHeight - ovBox.offsetHeight - 12, need = Math.min(h, RISE_HEAD * UI);
    if (top + need <= floor || !seen(words, sy)) return top;
    return Math.min(top, Math.max(Math.floor(floor - need), roomTop(sy)));
  };
  // and its top dropped clear of the top bar when its words are in the window but its place level with them is under the
  // bar, as when the outline lands a part at the window's top (the user: "col3 thread should stop when it needs to stop, and
  // the connector should just bend")
  const drop = (top, words, sy) => (seen(words, sy) ? Math.max(top, roomTop(sy)) : top);
  // the row the user is typing in (the user's Reply box, the user's note's box, a reply the user is rewriting, or the Reply box Open questions readied):
  // while some of it is in the window, its foot stays clear of the Overall box, so as its box grows the row rises, its head
  // sliding under the top bar if it must, rather than the page scrolling under the user or the box going under the footer (the user:
  // "if there's not enough room, the thread should gracefully move up to make room for my expanding reply box")
  const typingIn = (x) => x.id === 'q:' + replying || x.id === editing || (!!rewriting && x.id === 'q:' + rewriting.id) || (x.r.contains(ROOT.activeElement) && ROOT.activeElement.tagName === 'TEXTAREA');
  const footRoom = (sy) => Math.floor(sy + innerHeight - ovBox.offsetHeight - 12);
  const keepFoot = (top, h, sy) => (top < footRoom(sy) && top + h > sy ? Math.min(top, footRoom(sy) - h) : top);
  const partOfRow = (id) => (isEdit(id) ? PN.editHome(id.slice(2)) || undefined : (noteOf(id) || askNote(id))?.block);
  const pinBy = () => Math.max(0, Math.min(scrollY + pinned.top0 - pinned.base[0], pinned.room));
  function pinRows() {
    if (!pinned) return;
    const raw = scrollY + pinned.top0 - pinned.base[0], held = raw >= 0 && raw < pinned.room, d = pinBy();
    const at = held ? 'held' : d; if (pinned.at === at) return;   // held to the window, or parked: nothing changes as it scrolls
    pinned.at = at;
    pinned.rows.forEach((x, k) => {
      const t = pinned.base[k] + d; x.r.classList.toggle('pin', held);
      x.r.style.top = (held ? pinned.base[k] - pinned.base[0] + pinned.top0 : t) + 'px';
      const w = was.get(x.id); if (w) w.y = t;
    });
  }
  // the app's own scroll to a picked row (reveal) is stepped here, frame by frame, on the rows' glide curve, and a row that
  // moves meanwhile glides in the window's frame: from where it shows to where it will show once the scroll is done, placed
  // in the same frame as the scroll. With the browser's smooth scroll, on its own clock, a row rode the scroll one way and
  // glided back the other (the user: "when a thread is mostly visible on screen and i click on it it moves down and then up
  // which is weird"), and correcting for it a frame late only made it shake
  const glideK = (t) => {   // EASE, cubic-bezier(.4,0,.2,1): the share of the way at time share t
    let u = t;
    for (let j = 0; j < 8; j++) { const x = 1.2 * (1 - u) ** 2 * u + 0.6 * (1 - u) * u * u + u ** 3 - t, dx = 1.2 * (1 - u) ** 2 - 1.2 * (1 - u) * u + 2.4 * u * u; if (Math.abs(x) < 1e-6 || !dx) break; u = Math.min(1, Math.max(0, u - x / dx)); }
    return 3 * (1 - u) * u * u + u ** 3;
  };
  const ride = { on: false, y0: 0, to: 0, t0: 0, ms: 0, at: 0, e: 0, f: 0 };   // the window's own scroll under way, and how far along (e)
  const slides = new Map();   // row → { s0: its top in the window as it set off, pos: its place in the page, e0: the scroll's share done then }
  function rideTo(to) {
    cancelAnimationFrame(ride.f);
    slides.forEach((sl, r) => { sl.s0 = r.getBoundingClientRect().top; sl.e0 = 0; });   // a new scroll midway: rows moving on go from where they show
    Object.assign(ride, { on: true, y0: scrollY, to, t0: performance.now(), ms: questionMove ? 500 : Math.min(560, 280 + Math.abs(to - scrollY) * 0.2), question: questionMove, at: scrollY, e: 0 });
    ride.f = requestAnimationFrame(rideStep);
  }
  function slideRow(r, s0, pos) { slides.set(r, { s0, pos, e0: ride.e }); r.style.transform = `translateY(${s0 - (pos - scrollY)}px)`; }
  function unslide(r) { if (slides.delete(r)) r.style.transform = ''; }
  function rideStep(now) {
    if (Math.abs(scrollY - ride.at) > 1) return rideEnd(false);   // the user scrolled meanwhile: the user's scroll wins
    const k = Math.min(1, Math.max(0, (now - ride.t0) / ride.ms)); ride.e = ride.question ? (k < .5 ? 2 * k * k : 1 - 2 * (1 - k) ** 2) : glideK(k);
    scrollTo({ top: ride.y0 + (ride.to - ride.y0) * ride.e, behavior: 'instant' }); ride.at = scrollY;
    slides.forEach((s, r) => {
      if (!r.isConnected) return slides.delete(r);   // redrawn: the new row moves on from where this one was
      const want = s.s0 + (s.pos - ride.to - s.s0) * (s.e0 < 1 ? (ride.e - s.e0) / (1 - s.e0) : 1);
      r.style.transform = `translateY(${want - (s.pos - scrollY)}px)`;
    });
    if (k < 1) ride.f = requestAnimationFrame(rideStep); else rideEnd(true);
  }
  function rideEnd(done) {
    cancelAnimationFrame(ride.f); ride.on = false;
    // cut short, each row glides the rest of the way to its place in the page
    slides.forEach((s, r) => { const off = parseFloat(r.style.transform.slice(11)) || 0; r.style.transform = ''; if (!done && r.isConnected && Math.abs(off) > 0.5) { r.pnTo = s.pos; r.animate([{ transform: `translateY(${off}px)` }, { transform: 'none' }], { duration: 200, easing: EASE }).id = 'pn-move'; } });
    slides.clear(); scrolled();
  }
  // glide: the rows move because of something the user did (a click, a note opening, the user's typing), so they slide to their new
  // places; when the page moves on its own (images loading, a resize), they stay level with it and move at once
  function layout(glide = false) {
    document.body.style.setProperty(`--${P}foot`, ovBox.offsetHeight + 'px'); WRAP.style.setProperty('--pn-foot', ovBox.offsetHeight + 'px');   // the page's spacer, and the toast
    const open = ui.notes, motion = glide && questionMove !== 'next-tab' && performance.now() >= stillTill && open && laidOut && !reduced() && !movingNow('grow');   // a bubble growing in: the rows below follow it frame by frame
    const gone = (x) => { const a = away(blockEl(partOfRow(x.dataset.id))); x.classList.toggle('pn-away', a); return a; };   // a part in a closed tab: its row and marker wait
    const els = [...col.querySelectorAll('.pnN-row')].filter((r) => !gone(r));
    col.querySelectorAll('.pnN-mk').forEach(gone);
    // each anchor read once a layout, for its row and its rail marker alike: nothing in between moves the page's words
    const ays = new Map(), ay = (id) => { if (!ays.has(id)) ays.set(id, anchorY(id)); return ays.get(id); };
    els.forEach((r) => { r.style.minHeight = ''; });   // each row's own height, then rounded up to whole pixels below
    const rows = els.map((r) => {
      const b = r.getBoundingClientRect();
      // hang: how far its sticker hangs below its bottom edge, kept clear of the footer with the row when it's picked. Not
      // the blank Sticker button: counting it lifted every picked row at the page's foot off its words, and the button
      // still shows most of itself above the footer
      // The agent's ✅ on the user's bubble's or the row's bottom left hangs the same way (1.77.0)
      const hang = Math.max(0, ...[...r.querySelectorAll('.pn-stk, .qk, .ib.rx')].map((k) => k.getBoundingClientRect()).filter((k) => k.height).map((k) => Math.ceil(k.bottom - b.bottom)));
      return { r, id: r.dataset.id, w: Math.round(ay(r.dataset.id) - TIE * UI), h: Math.ceil(b.height - 0.01), hang, from: r.style.top ? b.top + scrollY : was.get(r.dataset.id)?.y };
    }).sort((a, b) => a.w - b.w);
    const top0 = bar.offsetHeight + 20;
    const si = rows.findIndex((x) => x.id === sel);
    const head = threadTop === sel && si >= 0;
    const pos = rows.map(() => 0), step = (i) => rows[i].h + rows[i].hang + 12 * UI;   // neighbours share one hairline
    const down = (i) => { const want = i ? pos[i - 1] + step(i - 1) : top0; const t = Math.max(rows[i].w, want); return t - want < SNAP ? want : t; };
    const up = (i) => { const want = pos[i + 1] - step(i); const t = Math.min(rows[i].w, want); return want - t < SNAP ? want : t; };
    if (si >= 0) hold = null;
    const hi = si < 0 && hold ? rows.findIndex((x) => x.id === hold.id) : -1, pi = si >= 0 ? si : hi;
    above = false;
    if (pi < 0) rows.forEach((x, i) => { pos[i] = down(i); });
    else {   // the selected row (or, after a delete, the held one) sits level with its part; the rest stack away from it, up and down
      pos[pi] = si >= 0 ? Math.max(rows[si].w, top0) : hold.below ? Math.max(rows[hi].w, hold.y) : hold.y;
      for (let i = pi + 1; i < rows.length; i++) pos[i] = down(i);
      for (let i = pi - 1; i >= 0; i--) pos[i] = up(i);
      // the selected row never leaves its text (the user: "it doesn't shift up so i can see col2 and col3 linked parts"):
      // rows above it that don't fit slide up past the column's top, under the bar, as in Google Docs, and come back
      // when another row is picked. Only a sliver of space under the top closes, which moves the rows by less than SNAP.
      if (rows.length && pos[0] >= top0 && pos[0] - top0 < SNAP) {
        pos[0] = top0;
        for (let i = 1; i < rows.length; i++) pos[i] = Math.max(pos[i], pos[i - 1] + step(i - 1));
      }
      above = open && rows.length > 0 && pos[0] < top0 - 1;
    }
    // the overall questions belong to no part, so they head the column. As the page scrolls they stay in view under the
    // bar, like a sticky header, until the next row comes up to them and pushes them on up (the user: "overall questions on
    // col3 don't scroll off the page until they're hitting subsequent comments")
    const base = pos.slice(), g0 = rows.findIndex((x) => x.r.classList.contains('ovq'));
    pinned = null;
    if (open && g0 >= 0) {
      let g1 = g0; while (g1 + 1 < rows.length && rows[g1 + 1].r.classList.contains('ovq')) g1++;
      // a picked one the pinned group would hold under the Overall box (two long ones are taller than the room under the
      // bar): the group sits higher by just enough to show it whole, the ones above it sliding under the bar, top first if
      // it can't fit (on the user's plan page at 1600 x 1000 the arrow picked the second out of sight)
      const raiseBy = si >= g0 && si <= g1 ? head ? base[si] - base[g0] : Math.max(0, Math.min(top0 + base[si] - base[g0] + rows[si].h - (innerHeight - ovBox.offsetHeight - 12), base[si] - base[g0])) : 0;
      pinned = { rows: rows.slice(g0, g1 + 1), base: base.slice(g0, g1 + 1), top0: top0 - raiseBy, room: g1 + 1 < rows.length ? pos[g1 + 1] - pos[g1] - step(g1) : Infinity, at: null };
      const d = pinBy(); for (let i = g0; i <= g1; i++) pos[i] += d;
    }
    // the column runs the page's length, and past it far enough that the last row can scroll clear of the footer
    const end = open && rows.length ? Math.max(Math.max(...rows.map((x, i) => base[i] + x.h)) + ovBox.offsetHeight + 24, head ? base[si] + innerHeight - bar.offsetHeight - 12 : 0) : 0;   // unpinned, so scrolling can't grow it; a jump leaves room for the last thread's head
    const pageEnd = document.body.getBoundingClientRect().bottom + scrollY + (parseFloat(getComputedStyle(document.body).marginBottom) || 0);
    // never shorter than the window's foot: a row let go at the page's end shrank the page under the user, and the browser
    // pulled the page up mid-click, so a triple-click's later clicks landed on the block above
    col.style.height = Math.ceil(Math.max(pageEnd, document.body.scrollHeight, innerHeight, end, scrollY + innerHeight)) + 'px';
    // the selected row comes fully into view, clear of the top bar and the footer: when it's picked, and while its box grows.
    // After the column's height: a smooth scroll stops at the page's end as it was when it started, so a row at the bottom
    // stayed half under the footer (the user: "left part of the box covered")
    // A box growing as the user types doesn't scroll the page: its row rises instead (keepFoot, below). The page's scroll and the
    // rows' glide ran on different clocks, so a row held level with them moved up and down a line's height at each one
    let sy = goingTo ?? scrollY;   // where the window is, or where reveal's scroll is taking it
    // saving an answer moves on to the next open question: it lands at col3's top, under the bar, not just inside the
    // window's foot, so the thread reads down from there (the user: "when it auto scrolls to the next open question, it scrolls
    // the thread to the top of col3 not the bottom")
    if (si >= 0 && open && sel !== shown) sy = reveal(pos[si], rows[si].h + rows[si].hang, typingIn(rows[si]), questionMove || (head && 'head'));
    // with its words in the window, the selected row, and each row on the part the outline jumped to, is never left under
    // the Overall box or the top bar (2026-10-22: "Comment should appear above the bottom right overall feedback
    // section so that I can see it"; "col3 thread should stop when it needs to stop"). When its place level with them is
    // under one, because the page scrolled, resized, can't scroll that far or landed a part at its top, it stops at that
    // edge, the rows beside it making way, and the tie bends to it. The top wins when both can't fit. Only when the column
    // lays out, which a scroll ending does, never during a scroll: it still scrolls with the page and leaves the window
    // with its words (1.54.1)
    const tp = open && !head && si >= 0 && typingIn(rows[si]) ? si : -1, footOf = (i) => footRoom(sy) - rows[i].h - rows[i].hang;
    if (open && (si >= 0 || toward)) {
      const held = rows.map((x, i) => i).filter((i) => !rows[i].r.classList.contains('ovq') && (i === si || (toward && partOfRow(rows[i].id) === toward)));
      const words = (i) => rows[i].w + TIE * UI;
      if (toward && !held.some((i) => seen(words(i), sy))) toward = null;   // the user scrolled away from the part: it's let go
      // risen to make room for the user's box, it stays risen while the user types, so a box shrinking back a line moves nothing
      const kept = tp >= 0 && footHold?.id === rows[tp].id ? footHold.top : Infinity;
      for (const i of [...held].reverse()) {
        const t = Math.min(rise(pos[i], rows[i].h + rows[i].hang, words(i), sy), i === tp ? Math.min(keepFoot(pos[i], rows[i].h + rows[i].hang, sy), kept) : Infinity); if (t >= pos[i]) continue;
        pos[i] = t;
        for (let j = i - 1; j >= 0 && !rows[j].r.classList.contains('ovq') && pos[j] > pos[j + 1] - step(j); j--) pos[j] = pos[j + 1] - step(j);
      }
      for (const i of held) {
        const t = i === tp ? Math.min(drop(pos[i], words(i), sy), Math.max(pos[i], Math.min(footOf(i), kept))) : drop(pos[i], words(i), sy); if (t <= pos[i]) continue;
        pos[i] = t;
        for (let j = i + 1; j < rows.length && pos[j] < pos[j - 1] + step(j - 1); j++) pos[j] = pos[j - 1] + step(j - 1);
      }
      above = pos[0] < top0 - 1;
    }
    // a picked thread taller than the room that the user scrolled (scrollHold) stays where the scroll left it while it fills the
    // room. Otherwise it goes only as far as its nearer edge: its head down to the room's top, or its foot up to the room's foot,
    // never back level with its words. Words in a sticky bar ride with the window, so a thread on them went back to the
    // column's top at every scroll's end and its foot never showed (the user, 2026-11-08, of a reply whose words were found in
    // a tab's name: "it keeps pushing the thread back down even though it's too long for the viewport"). A thread that fits
    // the room is placed as before
    if (scrollHold && scrollHold !== sel) scrollHold = null;
    if (open && si >= 0 && scrollHold === rows[si].id && was.has(scrollHold) && !rows[si].r.classList.contains('ovq')) {
      const H = rows[si].h + rows[si].hang, hi = roomTop(sy), lo = footRoom(sy) - H, at = was.get(scrollHold).y;
      const t = lo >= hi ? pos[si] : at > hi ? Math.max(pos[si], hi) : at < lo ? Math.min(pos[si], lo) : at;
      if (Math.abs(t - pos[si]) > 0.5) {
        pos[si] = t;
        const own = (i) => toward && partOfRow(rows[i].id) === toward;   // the part the outline jumped to keeps its rows' places
        for (let i = si + 1; i < rows.length && !rows[i].r.classList.contains('ovq'); i++) pos[i] = own(i) ? Math.max(pos[i], pos[i - 1] + step(i - 1)) : down(i);
        for (let i = si - 1; i >= 0 && !rows[i].r.classList.contains('ovq'); i--) pos[i] = own(i) ? Math.min(pos[i], pos[i + 1] - step(i)) : up(i);
        above = pos[0] < top0 - 1;
        const need = Math.ceil(t + H + ovBox.offsetHeight + 24); if (need > parseFloat(col.style.height)) col.style.height = need + 'px';   // room to scroll to its foot
      }
    }
    // the user's box held at the Overall box's edge: when its own lines grow or shrink, the row moves in the same frame, so the box
    // and the words the user is typing hold still and the thread above makes the room, as a chat app's box grows; a glide there
    // bobbed the user's box down a line and back at each one. What appears under the box (Save and Cancel) glides up into view
    const ta = tp >= 0 && rows[tp].r.contains(ROOT.activeElement) && ROOT.activeElement.tagName === 'TEXTAREA' ? ROOT.activeElement.offsetHeight : 0;
    const atFoot = tp >= 0 && pos[tp] + rows[tp].h + rows[tp].hang >= footRoom(sy) - 1;
    const boxGrew = atFoot && footHold?.id === rows[tp].id && ta && footHold.ta && Math.abs(ta - footHold.ta) > 2;
    shown = sel; footHold = tp >= 0 ? { id: rows[tp].id, top: pos[tp], ta } : null;
    rows.forEach((x, i) => {
      x.r.classList.remove('pin'); x.r.style.top = pos[i] + 'px'; if (open) x.r.style.minHeight = x.h + 'px';
      if (!motion || (i === tp && boxGrew && !x.r.getAnimations().some((a) => a.id === 'pn-move' && a.playState === 'running'))) { unslide(x.r); return; }
      const prev = was.get(x.id), sl = slides.get(x.r);
      if (x.from == null) x.r.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });   // a new note fades in where it lands
      else if (Math.abs(x.from - pos[i]) > 1 || sl) {
        // a glide already heading here runs on: the rows' first resize report lays out again a frame later, and restarting
        // every glide from a standstill there made the column stutter (the user: "emojis and col2 and col3 sometimes stutter")
        const run = x.r.getAnimations().find((a) => a.id === 'pn-move' && a.playState === 'running');
        if (run && Math.abs(x.r.pnTo - pos[i]) < 1) return;
        if (sl && Math.abs(sl.pos - pos[i]) < 1) return;
        run?.cancel(); x.r.pnTo = pos[i];
        if (ride.on && !x.r.classList.contains('ovq')) slideRow(x.r, x.from - scrollY, pos[i]);
        else { unslide(x.r); x.r.animate([{ transform: `translateY(${x.from - pos[i]}px)` }, { transform: 'none' }], { duration: questionMove ? 500 : 280, easing: questionMove ? 'ease-in-out' : EASE }).id = 'pn-move'; }
      }
      // a row that grew unfolds downward as the rows below make way, so it never covers them on the way; it ends open below
      // too, so the sticker hanging off its bottom edge shows as it lands
      // held at the Overall box's edge as it grows, its foot stays put while it rises: the new line shows as it comes up
      if (prev?.h && x.h > prev.h + 2) x.r.animate([{ clipPath: `inset(-60px -60px ${x.h - prev.h}px -60px)` }, { clipPath: `inset(-60px -60px ${i === tp && atFoot ? 0 : -80}px -60px)` }], { duration: 280, easing: EASE });
    });
    if (open) rows.forEach((x, i) => was.set(x.id, { y: pos[i], h: x.h })); else { was.clear(); laidOut = false; }
    if (open && rows.length) laidOut = true;
    let last = -99;
    [...col.querySelectorAll('.pnN-mk')].map((m) => ({ m, w: ay(m.dataset.id) - 18 * UI })).sort((a, b) => a.w - b.w)
      .forEach(({ m, w }) => { const t = Math.max(w, last + 42 * UI); m.style.top = t + 'px'; last = t; });
    pinRows(); stick(); clipEdge(); sbDraw();
    requestAnimationFrame(drawLine);
    ewArm();   // rows moved, the column opened or the window changed: one answered in chat may have come into view
  }
  // scrolling up at the page's top, with rows slid above it, lets the picked row go so they come back down into reach
  const atTop = () => scrollY <= 1 && above;
  addEventListener('wheel', (e) => { if (e.deltaY < 0 && atTop()) unpick(); }, { passive: true });
  addEventListener('keydown', (e) => { if (['ArrowUp', 'PageUp', 'Home'].includes(e.key) && atTop() && !tgt(e).closest?.('input,textarea,select,[contenteditable]')) unpick(); });
  // anything hung past the column's left edge, where the top bar and the footer don't reach, is cut off at their edges, so a
  // row slid under either can't leave it showing beside them (a row's sticker hung there before 1.73.0)
  let edgeRaf = 0;
  function clipEdge() {
    const a = Math.round(scrollY + bar.offsetHeight), b = Math.round(scrollY + innerHeight - (ui.notes ? ovBox.offsetHeight : 0));
    col.style.clipPath = `polygon(-60px ${a}px, 0 ${a}px, 0 0, 100% 0, 100% 100%, 0 100%, 0 ${b}px, -60px ${b}px)`;
  }
  addEventListener('scroll', () => { pinRows(); cancelAnimationFrame(edgeRaf); edgeRaf = requestAnimationFrame(clipEdge); }, { passive: true });
  // a scroll that has ended lays the column out again, so a selected row left under the Overall box with its words in the
  // window rises above it, and one risen goes back level with its words (layout's rise). No scrollend: a pause in scrolling
  const scrolled = () => {   // the app's own scroll steps the window: done when it's done
    if (ride.on) return; goingTo = null;
    if (ownScroll && sel) scrollHold = sel; ownScroll = false;   // the user's scroll: a picked thread too tall for the room stays where it took it
    if ((sel || toward) && ui.notes) reflow(true);
  };
  if ('onscrollend' in window) addEventListener('scrollend', scrolled);
  else { let t = 0; addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(scrolled, 150); }, { passive: true }); }
  // the app's own scroll, smooth: just far enough that the row clears the top bar and the footer, top first if it can't fit.
  // Returns where the window will be, held in goingTo while a smooth scroll runs, so a layout on the way places rows for it
  // foot: the row the user is typing in, too tall to show whole, shows its foot, where the user's box is, rather than its head; a foot
  // already in the window stays where it is
  // atTop: the row's head goes to just under the bar wherever it is, as the next open question does after an answer.
  // 'head' (a thread jump): the same, unless the whole thread already shows, so a page that fits the window doesn't scroll
  function reveal(top, h, foot = false, atTop = false) {
    scrollHold = null; ownScroll = false;   // the app places the row: a scroll of the user's before it no longer holds it
    const lo = scrollY + bar.offsetHeight + 12, hi = scrollY + innerHeight - ovBox.offsetHeight - 12;
    const shows = h <= hi - lo && top >= lo && top + h <= hi;
    const d = atTop && !(atTop === 'head' && shows) ? top - lo : h <= hi - lo ? (top < lo ? top - lo : top + h > hi ? top + h - hi : 0) : !foot ? top - lo : top + h > hi || top + h < lo ? top + h - hi : 0;
    if (Math.abs(d) <= 1) return scrollY;
    const to = Math.max(0, Math.min(scrollY + d, document.documentElement.scrollHeight - innerHeight));
    if (questionMove === 'next-tab') {
      if (ride.on) rideEnd(true);
      clearTimeout(goT); goingTo = null;
      scrollTo({ top: scrollY + d, behavior: 'instant' });
    }
    else if (reduced() || Math.abs(to - scrollY) <= 1) scrollTo({ top: scrollY + d, behavior: 'auto' });
    else { goingTo = to; clearTimeout(goT); rideTo(to); }
    return to;
  }
  // the outline's jump to a part: the column lays out for where the window is going, so the part's rows ride in with the
  // page and land clear of the top bar and the Overall box (layout, toward). Another scroll of the app's (Top, Bottom, the
  // title row) goes nowhere in particular, so it lets the last part go
  function goTo(top, label = null) {
    threadTop = null; footHold = null; scrollHold = null; ownScroll = false;   // an explicit part jump releases the thread jump, old typing position and the user's scroll hold while preserving the draft
    const to = Math.max(0, Math.min(top, document.documentElement.scrollHeight - innerHeight));
    toward = label;
    scrollTo({ top, behavior: reduced() ? 'auto' : 'smooth' });
    if (Math.abs(to - scrollY) > 1) { goingTo = to; clearTimeout(goT); goT = setTimeout(() => { goingTo = null; }, 1000); }
    if (label && ui.notes) reflow(true);
  }
  // the page can reflow on its own (images loading, a font arriving, a tab opening, a box scrolling): rows and stickers
  // follow. A row that changes height (a box growing as the user types, a font arriving) moves the rows around it.
  let flowRaf = 0, flowGlide = false;
  const reflow = (glide = false) => {
    flowGlide = flowGlide || glide; cancelAnimationFrame(flowRaf);
    flowRaf = requestAnimationFrame(() => { const g = flowGlide; flowGlide = false; layout(g); });
  };
  const watch = (fn) => new ResizeObserver(fn);   // no fallback: the Done sheet's observer, earlier, already needs one
  watch(() => reflow()).observe(document.body);
  watch(() => reflow()).observe(bar);   // rows follow the question row as it folds away
  // a sidebar opening or closing slides the page over without always resizing it (a centred page keeps its width), so
  // stickers and ties follow it frame by frame while the body's padding moves
  let sliding = 0, slideRaf = 0;
  const slide = () => { stick(); reflow(); slideRaf = sliding ? requestAnimationFrame(slide) : 0; };
  document.body.addEventListener('transitionrun', (e) => { if (e.target === document.body && e.propertyName.startsWith('padding')) { sliding++; if (!slideRaf) slide(); } });
  ['transitionend', 'transitioncancel'].forEach((t) => document.body.addEventListener(t, (e) => { if (e.target === document.body && e.propertyName.startsWith('padding')) { sliding = Math.max(0, sliding - 1); if (!sliding) reflow(); } }));
  const rowsSeen = watch(() => reflow(true));
  document.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') reflow(); }, true);
  document.addEventListener('scroll', (e) => { if (e.target !== document && !e.target.closest?.('.pn-ui')) reflow(); }, true);
  document.fonts?.addEventListener?.('loadingdone', () => reflow());

  // ---------- the tie: the writing app's connector ----------
  function lineEnd(m, mid) {   // the far right end of the text on the anchor's first line
    if (m.classList.contains(P + 'img')) return m.getBoundingClientRect().right;   // a picture's own right edge
    const par = m.closest('p,li,h1,h2,h3,h4,h5,h6,pre,td,th,dd,blockquote') || m.parentElement;
    const rg = document.createRange(); rg.selectNodeContents(par);
    const xs = [...rg.getClientRects()].filter((r) => r.width > 1 && r.top < mid && r.bottom > mid).map((r) => r.right);
    return xs.length ? Math.max(...xs) : m.getBoundingClientRect().right;
  }
  // an empty box with no words or picture in it (a scrim behind a menu, a divider) is background, not something in the way
  const backdrop = (e) => !e.textContent.trim() && !e.matches('img,canvas,video,iframe,input,textarea,select,button,hr');
  function clear(part, from, to, y, anchorEl) {   // nothing but the part's own background between the text and the part's edge
    for (let x = from + 6; x < to - 4; x += 10) {
      const hit = document.elementsFromPoint(x, y).find((e) => e !== HOST && !(e instanceof SVGElement));
      if (hit && !hit.contains(anchorEl) && part.contains(hit) && !backdrop(hit)) return false;
    }
    return true;
  }
  function tableTie(mark, table, left, sy, height, end, ex) {
    const gap = 2, reach = Math.max(24, height);
    const top = sy - reach, bottom = sy + reach;
    // A horizontally scrolled or cropped cell can still have a Range rect outside the visible table.
    for (let e = mark.parentElement; e && e !== document.body; e = e.parentElement) {
      const style = getComputedStyle(e);
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
      const r = e.getBoundingClientRect();
      if ((style.overflowX !== 'visible' && (left < r.left || left > r.right)) ||
          (style.overflowY !== 'visible' && (sy < r.top || sy > r.bottom))) return null;
    }
    const blocks = [], range = document.createRange();
    const near = (r) => r.width > 0 && r.height > 0 && r.right + gap > left && r.left - gap < ex &&
      r.bottom + gap >= top && r.top - gap <= bottom;
    const add = (r) => { if (near(r)) blocks.push(r); };
    // Cell boxes include their padding. Measure the words and media so a lane can use that empty space.
    for (const row of table.rows) {
      for (const cell of row.cells) {
        if (!near(cell.getBoundingClientRect())) continue;
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        for (let n; (n = walker.nextNode());) {
          if (!n.data.trim() || n.parentElement.closest('script,style,noscript,template')) continue;
          range.selectNodeContents(n);
          for (const box of range.getClientRects()) add(box);
        }
        for (const el of [cell, ...cell.querySelectorAll('*')]) {
          const box = el.getBoundingClientRect();
          if (!near(box)) continue;
          if (el.matches('img,svg,canvas,video,iframe,input,textarea,select,button,hr')) {
            add(box);
            continue;
          }
          // Responsive tables often put their column labels in ::before. Range doesn't see generated text.
          for (const side of ['::before', '::after']) {
            const style = getComputedStyle(el, side);
            if (['none', 'normal', '""', "''"].includes(style.content) || style.display === 'none') continue;
            if (style.display === 'block' && style.position === 'static' && getComputedStyle(el).display === 'block') {
              range.selectNodeContents(el);
              const content = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
              if (content.length) {
                const y = side === '::before' ? box.top : Math.max(...content.map((r) => r.bottom));
                const end = side === '::before' ? Math.min(...content.map((r) => r.top)) : box.bottom;
                if (end > y) add(new DOMRect(box.left, y, box.width, end - y));
                else add(box);
                continue;
              }
            }
            add(box);
          }
        }
      }
    }
    // Prefer the quote's right edge. If more words follow it, try the end of that line.
    for (const x of new Set([left, Math.max(left, end + 3)])) {
      if (x >= ex) continue;
      const across = blocks.filter((r) => r.right + gap > x);
      const lanes = [sy, ...across.flatMap((r) => [r.bottom + gap, r.top - gap])]
        .filter((y) => y >= top && y <= bottom)
        .sort((a, b) => Math.abs(a - sy) - Math.abs(b - sy) || b - a);
      const y = lanes.find((v) => across.every((r) =>
        (v <= r.top - gap || v >= r.bottom + gap) &&
        (x <= r.left - gap || Math.max(v, sy) <= r.top - gap || Math.min(v, sy) >= r.bottom + gap)));
      if (y != null) return { x, y, bracket: y === sy ? null : [Math.min(y, sy), Math.max(y, sy)] };
    }
    return null;
  }
  // where the tie runs now, in page coordinates (so scrolling never moves it): from the text (sx, sy), level to gx, then
  // curving to the row (ex, ey); brk is the bracket beside the part, dot whether the end gets a dot rather than a sticker
  function lineTarget() {
    if (!sel || !ui.notes) return null;
    const row = col.querySelector(`.pnN-row[data-id="${CSS.escape(sel)}"]`); if (!row) return;
    // The tie ends in a dot on the row's left edge, level with its anchor line.
    const rr = row.getBoundingClientRect();
    const ex = rr.left, ey = row.offsetTop - scrollY + TIE * UI;
    // the tie leaves from the end of the highlighted line, however far into the page it is. When something sits between
    // it and the margin (a shortcut key, a second column), it takes the nearest clear lane beside the line, joined to the
    // text by a short bracket. In a table the highlight and selected note are enough when no route clears the words.
    // With no words found, the bracket marks one line at the part's heading, never its height.
    let sx, sy, brk = null, part, pr, tableRight;
    if (isEdit(sel)) {
      const f = editEl(sel.slice(2)) || PN.frameEditNode(sel.slice(2)); if (!f) return;
      part = f.closest('[data-note]') || f; pr = part.getBoundingClientRect();
      const q = inFrame(sel) || partLine(f); if (!q) return;
      sy = q.mid; brk = [q.top, q.bottom]; sx = pr.right + 10;
    } else {
      const n = noteOf(sel) || askNote(sel); if (!n) return;
      part = blockEl(n.block); pr = part ? part.getBoundingClientRect() : null;
      let mark, q;
      for (const m of marksOf(sel)) {
        if (m.tagName !== 'MARK') continue;
        q = [...m.getClientRects()].find((r) => r.width > 0 && r.height > 0);
        if (q) { mark = m; break; }
      }
      if (mark) {
        sy = midOf(mark, q) + 1;
        // the note's own sticker on that line: the tie leaves from its far edge rather than running through it
        const ps = ROOT.querySelector(`.pn-stk.pg[data-id="${CSS.escape(sel)}"]`)?.getBoundingClientRect();
        const end = Math.max(lineEnd(mark, sy), ps && ps.width && Math.abs(ps.top + ps.height / 2 - sy) < ps.height / 2 ? ps.right - 6 : 0);
        const table = mark.closest('td,th')?.closest('table');
        if (table) {
          const anchor = ps && ps.width && ps.top < sy && ps.bottom > sy ? Math.max(q.right, ps.right - 6) : q.right;
          const tie = tableTie(mark, table, anchor + 3, sy, q.height, end, ex);
          if (!tie) return null;
          sx = tie.x; sy = tie.y; brk = tie.bracket;
          tableRight = table.getBoundingClientRect().right;
        } else if (pr && !clear(part, end, pr.right, sy, mark)) {
          const reach = q.height / 2 + 10, lanes = [];   // nearest first, below before above
          for (let d = 2; d <= reach; d += 2) lanes.push(sy + d, sy - d);
          const y = lanes.find((v) => clear(part, end, pr.right, v, mark));
          if (y != null) { brk = y > sy ? [q.top + 2, y] : [y, q.bottom - 2]; sy = y; }
        }
        if (!table) sx = end + 3;
      } else if (inFrame(sel)) {   // words in a framed page: the tie leaves from the end of their line there
        const fq = inFrame(sel); sy = fq.mid + 1; sx = Math.max(fq.end, fq.right) + 3;
      } else if (pr) {
        const q = partLine(part); if (!q) return;
        sy = q.mid; brk = [q.top, q.bottom]; sx = pr.right + 10;
      } else return;
    }
    const edge = Math.max(pr?.right ?? sx, tableRight ?? sx);
    const gx = tableRight == null ? Math.max(sx, edge + 10) : Math.min(ex, Math.max(sx, edge + 10));
    const X = scrollX, Y = scrollY;
    if (brk) sy = Math.min(Math.max(sy, brk[0]), brk[1]);
    return { sx: sx + X, sy: sy + Y, gx: gx + X, ex: ex + X, ey: ey + Y, brk: brk && [brk[0] + Y, brk[1] + Y], dot: true };
  }
  // the tie moves when another note is picked, like a tape measure (the user: "a fun one showing it switching comments";
  // rope, cable and tape-then-rope models were tried 2026-10-19 and set aside as distracting): it zips back into the old
  // text, quicker as it goes, then shoots out from the new text and slows as it reaches the note. A first tie shoots out
  // from the text. It's drawn as N points along its curve while it moves, and as the exact curve at rest. Anything else
  // that moves it (a resize, a row growing) moves it at once, or retargets a motion already under way.
  const N = 28;
  const ln = { t: null, pts: null, old: null, raf: 0, t0: 0 };
  const easeOut = (x) => 1 - (1 - x) ** 3, easeIn = (x) => x * x;
  const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  function curveD(t) { const dx = (t.ex - t.gx) * 0.55; return `M${t.sx} ${t.sy} L${t.gx} ${t.sy} C${t.gx + dx} ${t.sy} ${t.ex - dx} ${t.ey} ${t.ex} ${t.ey}`; }
  function shape(t) {   // N points along the tie's curve: the level run, then the bend, spaced by length
    const dx = (t.ex - t.gx) * 0.55, run = t.gx - t.sx, bend = Math.hypot(t.ex - t.gx, t.ey - t.sy) * 1.1, f = run / (run + bend || 1);
    return Array.from({ length: N }, (_, i) => {
      const u = i / (N - 1);
      if (u <= f && f > 0) return { x: t.sx + run * (u / f), y: t.sy };
      const v = f < 1 ? (u - f) / (1 - f) : 1, w = 1 - v;
      return { x: w ** 3 * t.gx + 3 * w * w * v * (t.gx + dx) + 3 * w * v * v * (t.ex - dx) + v ** 3 * t.ex, y: w ** 3 * t.sy + 3 * w * w * v * t.sy + 3 * w * v * v * t.ey + v ** 3 * t.ey };
    });
  }
  const lenOf = (pts) => pts.reduce((a, p, i) => (i ? a + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);
  function upTo(pts, f) {   // the first fraction f of a line of points, by length, ending exactly at f
    if (f >= 1) return pts; const want = lenOf(pts) * Math.max(0, f), out = [pts[0]]; let got = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (got + d >= want) { out.push(lerp(pts[i - 1], pts[i], d ? (want - got) / d : 0)); return out; }
      got += d; out.push(pts[i]);
    }
    return out;
  }
  function smoothD(p) {   // a smooth curve through the points (Catmull-Rom as cubic Béziers)
    if (p.length < 2) return '';
    let d = `M${p[0].x} ${p[0].y}`;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
      d += ` C${b.x + (c.x - a.x) / 6} ${b.y + (c.y - a.y) / 6} ${c.x - (e.x - b.x) / 6} ${c.y - (e.y - b.y) / 6} ${c.x} ${c.y}`;
    }
    return d;
  }
  function drawLine() {
    links.classList.toggle('ed', isEdit(sel));
    const t = lineTarget();
    if (!t) { cancelAnimationFrame(ln.raf); ln.raf = 0; ln.t = ln.pts = null; links.innerHTML = ''; animateLine = false; return; }
    const go = animateLine && !reduced(); animateLine = false;
    if (go) {
      ln.t0 = performance.now(); ln.old = ln.t && ln.pts ? ln.pts : null; ln.t = t;
      if (!isEdit(sel)) marksOf(sel).forEach((mk) => { mk.classList.remove(P + 'cue'); void mk.offsetWidth; mk.classList.add(P + 'cue'); });
      if (!ln.raf) ln.raf = requestAnimationFrame(moveLine);
      return;
    }
    ln.t = t; if (ln.raf) return;   // under way: the motion heads for the new place
    ln.pts = shape(t); paintLine(null);
  }
  function moveLine(now) {
    const t = ln.t; if (!t) { ln.raf = 0; return; }
    // a frame's time can fall just before ln.t0; below zero with no old line to pull back, upTo(null) threw and the tie froze
    const el = Math.max(0, now - ln.t0), to = shape(t); let pts, done = false;
    const R = ln.old ? 170 : 0, E = 340;
    if (el < R) pts = upTo(ln.old, 1 - easeIn(el / R));
    else { const k = Math.min(1, (el - R) / E); pts = upTo(to, easeOut(k)); done = k >= 1; }
    if (done) { ln.raf = 0; ln.pts = to; paintLine(null); return; }
    ln.pts = pts; paintLine(pts);
    ln.raf = requestAnimationFrame(moveLine);
  }
  function paintLine(pts) {   // pts: the line mid-motion; null: the tie at rest, drawn as its exact curve
    const t = ln.t; links.innerHTML = '';
    const NS = 'http://www.w3.org/2000/svg';
    if (t.brk) {
      const k = document.createElementNS(NS, 'path'); k.setAttribute('class', 'brk');
      k.setAttribute('d', `M${t.sx} ${t.brk[0]} L${t.sx} ${t.brk[1]}`); links.append(k);
    }
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', pts ? smoothD(pts) : curveD(t)); links.append(p);
    const tip = pts ? pts[pts.length - 1] : { x: t.ex, y: t.ey };
    if (t.dot && (!pts || Math.hypot(tip.x - t.ex, tip.y - t.ey) < 2)) { const d = document.createElementNS(NS, 'circle'); d.setAttribute('cx', tip.x); d.setAttribute('cy', tip.y); d.setAttribute('r', 3); links.append(d); }
  }

  // ---------- the columns take on the page's tint ----------
  // (the user: "not a jarring difference in white balance") the page's commonest background beside the columns sets a hue;
  // each light token takes a whisper of it and keeps at least its own luminance, so the columns stay light and their text
  // keeps its contrast. Dark mode's palette outranks this rule (:root:not(...) is more specific), so it's left as it was.
  const BASE = { side: ['#f1f1f3', 1], hov: ['#e8e8ec', 1], white: ['#ffffff', 0.6], bub: ['#ececef', 0.9], hair: ['#e6e6ea', 0.8], hair2: ['#d4d4d9', 0.7], btnb: ['#c7c7cc', 0.6] };
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const gam = (c) => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
  const lumOf = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;   // r, g, b linear
  function okLab(rgb) {
    const [r, g, b] = rgb.map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  }
  function linRgb(L, a, b) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  }
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  function rgbaOf(css) {   // any CSS colour (rgb, oklch, color(), a name) as [r, g, b, a] in sRGB
    cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = css; cv.fillRect(0, 0, 1, 1); return [...cv.getImageData(0, 0, 1, 1).data];
  }
  // the page's commonest background along its two edges, where it meets the columns (a white card in the middle of a grey
  // page doesn't count: the eye compares the columns with what they touch), skipping the layer's own parts
  function ground() {
    const x0 = out.getBoundingClientRect().right, x1 = col.getBoundingClientRect().left, seen = new Map();
    if (x1 - x0 < 80) return null;
    for (const x of [x0 + 6, x0 + 24, x1 - 24, x1 - 6]) for (let j = 0; j < 7; j++) {
      const y = 64 + (innerHeight - 72) * j / 6;
      let e = document.elementsFromPoint(x, y).find((n) => n !== HOST && !n.closest(`mark.${P}mark, .${P}img`)), c = null;
      for (; e && !c; e = e.parentElement) { const v = rgbaOf(getComputedStyle(e).backgroundColor); if (v[3] > 128) c = v.slice(0, 3).join(); }
      c = c || '255,255,255'; seen.set(c, (seen.get(c) || 0) + 1);
    }
    return [...seen].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
  }
  const tintSt = document.createElement('style'); ROOT.insertBefore(tintSt, WRAP);   // after the layer's own colours, so it wins in light mode
  let tintWas = '';
  function matchPage() {
    const g = ground(); if (!g) return;
    const [, ga, gb] = okLab(g), C = Math.hypot(ga, gb), t = Math.min(C * 0.8, 0.022);
    const key = g.join(); if (key === tintWas) return; tintWas = key;
    if (t < 0.002) { tintSt.textContent = ''; return; }   // a neutral page: the columns stay as they are
    const vars = Object.entries(BASE).map(([k, [hex, w]]) => {
      // white can't take a tint and stay white: it may come down, but stays clearly lighter than the columns' grey, so the
      // selected note still stands out (the user: "easier to see which box is selected")
      const base = hexRgb(hex), y0 = k === 'white' ? Math.min(1, lumOf(hexRgb(BASE.side[0]).map(lin)) * 1.06) : lumOf(base.map(lin));
      let L = k === 'white' ? 1 - t * 0.5 : okLab(base)[0], c = t * w, rgb;
      for (let n = 0; n < 60; n++) {   // in gamut, and never darker than the token it replaces
        rgb = linRgb(L, ga / C * c, gb / C * c);
        if (rgb.some((v) => v < 0 || v > 1)) c *= 0.85; else if (lumOf(rgb) < y0 * 1.003 && L < 1) L = Math.min(1, L + 0.002); else break;
      }
      return `--pn-${k}:#${rgb.map((v) => gam(Math.min(1, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
    });
    tintSt.textContent = `.pn-root{${vars.join(';')}}`;
  }
  let tintT = 0;
  const rematch = () => { clearTimeout(tintT); tintT = setTimeout(matchPage, 250); };
  addEventListener('resize', rematch);
  systemDark.addEventListener?.('change', () => { theme(); rematch(); });
  function theme() {
    const root = document.documentElement, own = root.getAttribute('data-theme'), paper = pageAppearance();
    const followsSystem = appearanceMode === 'auto';
    WRAP.classList.toggle('pn-dark', followsSystem ? systemDark.matches : appearanceMode === 'dark');
    // Auto preserves the page's existing light preference. Forced modes take precedence for the layer.
    if (followsSystem && own !== null) WRAP.setAttribute('data-theme', own); else WRAP.removeAttribute('data-theme');
    root.classList.toggle(P + 'paper-dark', paper ? paper === 'dark' : systemDark.matches && own !== 'light');
    const marker = root.getAttribute('data-notes-layer');
    if (marker !== null && marker !== paper) root.setAttribute('data-notes-layer', paper);
    for (const button of appearance?.querySelectorAll('button') || []) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === appearanceMode));
    }
    tabBar();
  }
  theme();
  try {   // a page's theme switch
    const mo = new MutationObserver(() => { theme(); rematch(); }), watchAttrs = { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] };
    mo.observe(document.documentElement, watchAttrs); mo.observe(document.body, watchAttrs);
  } catch (e) { /* no observer: matched once at load */ }

  // the pop-up's paperclip: a new note on the selection, with the file picker open for it; cancelled, it's a blank note,
  // dropped once the user moves on
  // Comment and the paperclip hand back a keeper for the new note, so the pill stays on its words, shrunk to its reactions,
  // while its box is open: they go on that note (picked again, one comes off), and the box keeps its focus
  const keeper = (id) => ({
    live: () => editing === id && !!noteOf(id) && !PN.sentOn(),
    // the note's words (or picture) in the window: the union of its highlights' boxes, or its line in a framed page
    rect: () => {
      const rs = PN.marksOf(id).flatMap((m) => [...m.getClientRects()]).filter((r) => r.width || r.height);
      if (!rs.length) return inFrame(id);
      // its sticker in the page, once on, stands up off the words' end: the pill keeps clear of it too
      // (measured from its middle and its own size, so the slap's swell as it lands doesn't count)
      const sk = ROOT.querySelector(`.pn-stk.pg[data-id="${CSS.escape(id)}"]`), st = sk?.getBoundingClientRect();
      const stTop = st ? st.top + st.height / 2 - sk.offsetHeight / 2 : Infinity;
      return { left: Math.min(...rs.map((r) => r.left)), right: Math.max(...rs.map((r) => r.right)), top: Math.min(...rs.map((r) => r.top), stTop), bottom: Math.max(...rs.map((r) => r.bottom)) };
    },
    react: () => noteOf(id)?.react || '',
    pick: (k, big) => { const n = noteOf(id); if (n) stickOn(n, k, big, 'page'); },
    owns: (t) => !!t?.closest && (!!t.closest(`.pnN-row[data-id="${CSS.escape(id)}"], .pnN-rx`) || PN.marksOf(id).some((m) => m.contains(t))),
    // its right end stays clear of the notes column, so it never covers the new row
    right: () => (ui.notes ? Math.min(innerWidth, col.getBoundingClientRect().left) : innerWidth) - 8,
  });
  keptPill = selectionPill((a, typed) => { create(a, typed); return keeper(editing); }, (a, k, big) => react(a, k, big), (r) => PN.openEdit(PN.editBlockAt(r.startContainer), r),
    (a) => { create(a); const id = editing; pickFor = id; picker.click(); return keeper(id); }, typeOn, (a, ids) => highlight(a, ids));
  // Highlight (1.100.0): marks the words and nothing else (no row, no thread); on words already highlighted it takes them off.
  // Either one offers Undo, so ⌘Z takes it back as it does a deleted comment
  function highlight(a, ids) {
    if (ids) {
      const gone = PN.removeHl(ids);
      if (gone.length) offer(gone.length > 1 ? 'Highlights removed' : 'Highlight removed', () => { PN.restoreHl(gone); render(); lightMarks(); });
    } else {
      const h = PN.addHl(a);
      if (h) offer('Highlighted', () => { PN.removeHl([h.id]); render(); lightMarks(); });
    }
    render(); lightMarks();
  }
  // a click on a highlight alone (one over a comment's words picks that comment) offers to take it off
  const hlPop = el(`<div class="pn-ui pn-pill hlpop"><button type="button" class="cm" aria-label="Remove highlight">${icon('Cancel01Icon')}<span>Remove highlight</span></button></div>`);
  WRAP.appendChild(hlPop);
  let hlPopFor = null;
  const hideHlPop = () => { hlPop.classList.remove('show'); hlPopFor = null; };
  hlPop.addEventListener('mousedown', (e) => e.preventDefault());
  hlPop.querySelector('button').addEventListener('click', () => { const id = hlPopFor; hideHlPop(); if (id) highlight(null, [id]); });
  document.addEventListener('click', (e) => {
    const m = tgt(e).closest?.(`mark.${P}hl`); if (!m || getSelection().toString() || m.closest(`mark.${P}mark`) || PN.PAST || PN.sentOn()) return hlPopFor && !hlPop.contains(tgt(e)) ? hideHlPop() : undefined;
    const rs = [...m.getClientRects()], r = rs.find((q) => e.clientY >= q.top && e.clientY <= q.bottom) || rs[0]; if (!r) return;
    showHlPop(m.dataset.hl, e.clientX, r.top, r.bottom);
  });
  function showHlPop(id, x, top, bottom) {
    hlPopFor = id; const w = hlPop.offsetWidth;
    hlPop.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2)) + 'px';
    hlPop.style.top = (top > 58 ? top - 50 : Math.min(innerHeight - 48, bottom + 10)) + 'px';
    hlPop.classList.add('show');
  }
  document.addEventListener('mousedown', (e) => { if (hlPopFor && !hlPop.contains(tgt(e))) hideHlPop(); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && hlPopFor) hideHlPop(); });
  document.addEventListener('scroll', (e) => { if (hlPopFor && !e.target.closest?.('.pn-ui')) hideHlPop(); }, true);
  // a click on a ringed picture picks its note; a picture in several notes picks the next one each click
  document.addEventListener('click', (e) => {
    const m = tgt(e).closest?.(`mark.${P}mark, .pn-stk.pg, .${P}img`); if (!m || getSelection().toString()) return;
    const ids = m.dataset.id ? [m.dataset.id] : m.dataset.pn.split(' ');
    if (!ui.notes) setNotes(true); select(ids[(ids.indexOf(sel) + 1) % ids.length]);
    // A click on an editable page sticker opens the same picker as hovering.
    if (!m.matches('.pn-stk.pg')) return;
    clearTimeout(rxHoverT);
    const n = pageStickerNote(m); if (!n) return closeRx();
    if (rxHover && rxFor === n) return;
    if (rxFor === n) closeRx(); else openRx(n, m, 'page');
  });
  // a click on an edit's words in the page picks its row, as a note's highlight does (1.95.0; the user: "when i edited this to
  // add a space, clicking the green didn't connect to and activate the col3 box"): its green or struck words, a block a span
  // removed (its row is the first block's), the page's own words outside every part ([Page]), and, for an edit that changed
  // only white space, whose green is a space, anywhere in the block. Not in the block the user has open
  const editRowAt = (t) => {
    const b = PN.editBlockAt(t); if (!b || b.isContentEditable) return null;
    const l = b.dataset.pnEdit, h = PN.spanHead(l) || l; if (!edited().includes(h)) return null;
    const flat = (x) => x.replace(/\s+/g, ' ').trim();
    if (!t.closest(`ins.${P}ins, del.${P}del`) && !PN.editParts(h).every((x) => flat(x.was) === flat(x.now))) return null;
    return col.querySelector(`.pnN-row[data-id="${CSS.escape('e:' + h)}"]`) ? 'e:' + h : null;
  };
  // a click in the page's words chooses the word under it and brings up the pill (1.116.0); its Edit opens their block for
  // typing, the caret where the user clicked, as in the user's writing app (1.96.0 opened it on the click itself; the user: "i want to be
  // able to click in with my cursor in col2 and start typing to edit"). The spot is read as the button goes down, before a
  // block the user leaves draws its markup again and moves the words under the pointer. Not on a link, a control, a note's highlight or a
  // picture, not a click that ends a selection or is the second of a double click, not with a modifier key, and not by
  // touch, where a tap is for reading. A click anywhere in an edited block picks its row too
  const LIVE_EL = 'a[href], button, input, textarea, select, label, summary, audio, video, iframe, [role=button]';
  let downAt = null;
  // a block open with nothing typed in it and no edit of its own lets go for a second or third click, so they choose a word
  // or the paragraph, and for a drag, so it runs on into the next blocks as on the page (an open block holds a selection in)
  let fresh = null;
  const letGo = () => { fresh = null; if (PN.editFresh()) PN.closeEdit(); };
  addEventListener('mousedown', (e) => {
    downAt = null; fresh = null; const t = tgt(e);
    if (e.detail > 1) keptPill?.clickOff?.();
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !t.closest || t.closest(LIVE_EL)) return;
    const b = PN.editBlockAt(t); if (!b) return;
    if (b.isContentEditable) { if (!PN.editFresh()) return; if (e.detail > 1) letGo(); else fresh = { x: e.clientX, y: e.clientY }; }
    if (e.detail > 1 || b.isContentEditable) return;
    const c = document.caretPositionFromPoint?.(e.clientX, e.clientY), x = c ? null : document.caretRangeFromPoint?.(e.clientX, e.clientY);
    const n = c ? c.offsetNode : x?.startContainer, k = c ? c.offset : x?.startOffset;
    const w = keptPill.clickWord();   // a second click on the word the pill is up on puts it away
    if (n && b.contains(n)) downAt = { b, n, k, x: e.clientX, y: e.clientY, again: !!w && w.isPointInRange(n, k) };
  }, true);
  addEventListener('mousemove', (e) => { if (fresh && (!(e.buttons & 1) || Math.hypot(e.clientX - fresh.x, e.clientY - fresh.y) > 4)) { if (e.buttons & 1) letGo(); else fresh = null; } }, true);
  document.addEventListener('click', (e) => {
    const t = tgt(e), d = e.pointerType === 'touch' ? null : downAt; downAt = null; fresh = null;
    if (!t.closest || t.closest(`mark.${P}mark, .pn-stk.pg, .${P}img`) || getSelection().toString()) return;
    const b = d && !d.b.isContentEditable && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 && d.b.contains(d.n) ? d.b : null;
    const l = b?.dataset.pnEdit, h = l && (PN.spanHead(l) || l);
    const id = editRowAt(t) || (h && edited().includes(h) && col.querySelector(`.pnN-row[data-id="${CSS.escape('e:' + h)}"]`) ? 'e:' + h : null);
    if (id) { if (!ui.notes) setNotes(true); select(id); }
    // (1.116.0) the click chooses the word under it and brings up the pill; only its Edit opens the block, the caret where
    // the user clicked (the user: "i want human-feedback to not automaticaly enter edit mode when i click. instead, the pill ...
    // should pop up. only if i click edit should it make the area editable")
    // not on an edit's own green or struck words: a click there is for picking its row, and a pill held there sent Chrome
    // into a stall of many seconds once the user clicked on into the block (seen in the tests, no script running)
    if (!b || d.again || PN.PAST || PN.sentOn() || t.closest(`mark.${P}hl, ins.${P}ins, del.${P}del`) || !d.n.isConnected) return;
    const word = wordAt(d.n, d.k); if (!word) return;
    const c = document.createRange(); c.setStart(d.n, d.k); keptPill.clickOn(word, c);
  });
  // the word around a caret: the one it is in, else the one it ends (a click on a word's last letter's right half)
  const segs = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;
  function wordAt(n, k) {
    if (n.nodeType !== 3 || !segs) return null;
    let hit = null;
    for (const g of segs.segment(n.nodeValue)) {
      const end = g.index + g.segment.length;
      if (g.isWordLike && g.index <= k && k < end) { hit = g; break; }
      if (g.isWordLike && end === k) hit = g;
      if (g.index > k) break;
    }
    if (!hit) return null;
    const r = document.createRange(); r.setStart(n, hit.index); r.setEnd(n, hit.index + hit.segment.length); return r;
  }
  // a click on nothing lets the picked row go: in the page, off the user's own words, or on the column's empty space. Not while a
  // note's box is open, or a Reply box still has focus after moving under the pointer (a redraw would take back the
  // focus), nor on a click that ends a selection
  document.addEventListener('click', (e) => {
    const t = tgt(e); if (!sel && !hold || editing || (col.contains(ROOT.activeElement) && ROOT.activeElement.matches('textarea')) || !t.closest || !getSelection().isCollapsed) return;
    if (!t.isConnected) return;   // the click redrew what it landed on, so it was on a row, not on nothing
    if (col.contains(t) ? t.closest('.pnN-row, .pnN-mk, button') : inLayer(t) || t.closest(`mark.${P}mark, .${P}img, input, textarea, select, [contenteditable]`) || editRowAt(t)) return;
    unpick();
  });
  // a picture can't be dragged out of the page, so a selection can start on it or sweep across it
  document.querySelectorAll('[data-note] img').forEach((m) => { m.draggable = false; });
  addEventListener('message', (e) => {   // a framed page: a highlight clicked there picks its note; a reload there gets its marks back
    const d = e.data; if (!d || !d.hf) return;
    const f = PN.frameSender(e); if (!f) return;
    if (d.kind === 'pick' && (state.notes.some((n) => n.id === d.id) || askOf(d.id))) { if (!ui.notes) setNotes(true); select(d.id); }
    if (d.kind === 'none') { hideHlPop(); if (!editing) unpick(); }
    if (d.kind === 'ready') { PN.finishFrameEdit(f); PN.connectFrame(f, e.ports[0]); render(); }
    if (d.kind === 'edit-state' || d.kind === 'edit-close') PN.keepFrameEdit(f, d);
    if (d.kind === 'undo' && !PN.editIsOpen() && typeof d.back === 'boolean' && !PN.PAST && !PN.sentOn()) { PN.finishFrameEdit(); undoFeedback(d.back); }
    if (d.kind === 'highlight-pick' && d.rect && !PN.PAST && !PN.sentOn() && state.hl.some((h) => h.id === d.id && PN.frameFor(h) === f)) {
      const { x, y, kx, ky } = frameAt(f);
      showHlPop(d.id, x + d.x * kx, y + d.rect.top * ky, y + (d.rect.top + d.rect.height) * ky);
    }
    const block = PN.blockLabel(PN.blockOf(f)), ref = PN.frameRef(f, block);
    if (d.kind === 'edit-pick' && typeof d.label === 'string') {
      const id = 'e:' + PN.frameEditLabel(block, ref, d.label);
      if (state.edits[id.slice(2)] != null) { if (!ui.notes) setNotes(true); select(id); }
    }
    if (d.kind === 'where') {
      [...framed].forEach(([id, v]) => { if (v.f === f) framed.delete(id); }); Object.entries(d.at || {}).forEach(([id, r]) => framed.set(id, { f, r }));
      Object.entries(d.edits || {}).forEach(([key, r]) => {
        const label = PN.frameEditLabel(block, ref, key);
        if (state.edits[label] != null) framed.set('e:' + label, { f, r });
      });
      // A frame reports after the note's box has taken focus. Update its label in place: rebuilding the rows here
      // replaces that box between keydown and keyup, which can leave Chrome repeating the held key into the new box.
      state.notes.filter((n) => n.quote && !marksOf(n.id).some((m) => m.tagName === 'MARK')).forEach((n) => {
        const lost = !framed.has(n.id); if (n.lost === lost) return;
        n.lost = lost;
        const label = col.querySelector(`.pnN-row[data-id="${CSS.escape(n.id)}"] > .h > .lbl`);
        if (label) label.textContent = (n.block || 'Page') + (lost ? ' · text changed' : '');
      });
      reflow();
    }
  });
  addEventListener('resize', () => layout());
  document.fonts?.ready.then(() => layout());

  // typing in an opened line keeps its row current; the row appears on the first change
  let editT = 0;
  // (1.95.0) whatever row was picked, unless a note's box is open; an edit undone to nothing leaves its row unpicked
  PN.frameEdited = (label) => {
    clearTimeout(editT);
    editT = setTimeout(() => { const h = PN.spanHead(label) || label; if (!editing) sel = edited().includes(h) ? 'e:' + h : isEdit(sel) ? null : sel; animateLine = true; renderRows(); }, 200);
  };
  PN.initEdits(PN.frameEdited,
    () => { applyMarks(); lightMarks(); layout(); });   // the markup drawn again took the block's highlights with it
  // ⌘Z (Ctrl+Z) on the page, not in a field: the toast's Undo while it shows and is newer than the last edit, else the last
  // edit step (1.95.0); ⇧⌘Z or Ctrl+Y puts an edit step back. In the user's own boxes the browser's undo keeps working
  addEventListener('keydown', (e) => {
    const k = PN.undoKey(e); if (!k || PN.editIsOpen() || e.isComposing) return;
    if (tgt(e).closest?.('input,textarea,select,[contenteditable]')) return;
    PN.finishFrameEdit();
    if (undoFeedback(k === 'undo')) e.preventDefault();
  });
  function undoFeedback(back) {
    if (back && undo && toast.classList.contains('show') && toastAt >= PN.editStepAt()) { toast.querySelector('button').click(); return true; }
    return PN.editHist(back);
  }
  PN.render = render;   // a page that changes PN.locked redraws with this
  { const f = fitCols(); setOutline(f.l, true); setNotes(f.r, true); }
  // a phone's toolbar showing or hiding changes only the height: that refits nothing unless it crosses into or out of tight
  let fitW = innerWidth, fitT = tight();
  addEventListener('resize', () => { if (innerWidth === fitW && tight() === fitT) return; fitW = innerWidth; fitT = tight(); const f = fitCols(); if (f.l !== ui.outline) setOutline(f.l, true); if (f.r !== ui.notes) setNotes(f.r, true); ntgDraw(); });
  // a tab opening shows parts and hides others, sometimes without changing the page's height
  new MutationObserver(() => { reflow(); spy(); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-selected'] });
  bootTabs();
  render();
  ewArm(450);   // a beat after it opens, the agent's cursor comes for what's in view
  // ---------- a new round: the first time the latest version of a page with versions is in view, the bar opens in the look
  // the user left the round before in, its number and all: dark and Updating, or green and Done when that round was called done
  // and not reopened. After a beat that ground fades away and the number
  // rolls up to this round's. Out of view, or
  // with Chrome not the user's window, it holds until the user is back; a scroll, click or key lands it at once. Once per version, kept in
  // human-feedback:new-round/<page> (the user: "i'd rather see a round indicator increment animation at the appropirate
  // time"; "i don't understand what happens between done and the next round though"; options B and R2 B). It's the round turning, so nothing else moves before it: the
  // opening plays it first and goes on when it ends (the user: "feedback received is a different stage than moving to the next
  // round ... that's what kicks off the subsequent round's animations") ----------
  if (V && V.cur === V.last) {
    const NK = 'human-feedback:new-round/' + V.list[V.last].page, at = String(V.list[V.last].at || '');
    let seen = null; try { seen = localStorage.getItem(NK); } catch (e) { /* storage blocked */ }
    const keep = () => { try { localStorage.setItem(NK, at); } catch (e) { /* storage blocked */ } };
    // the round before's done record, as that round's tab kept it (a round one with no versions kept it by its own page)
    const first = V.list[0].page, prev = V.last > 0 ? V.list[V.last - 1].page : first;
    const leftDone = () => [first + '@' + prev, ...(V.last === 1 ? [first] : [])].some((k) => {
      let d = null; try { d = JSON.parse(localStorage.getItem('human-feedback:done/' + k)); } catch (e) { /* none */ }
      return !!d && (d.seen || 0) > (d.reopened || 0);
    });
    const n = V.cur + 1, rn = bar.querySelector('.rn');
    let roll = null;
    let turnRaf = 0, turnStop = () => {}, ended = null;
    const end = () => {
      keep();
      cancelAnimationFrame(turnRaf); turnStop(); look = null; bar.classList.remove('pn-turn'); rn.textContent = String(n); paintState();
      if (ended) { ended(); ended = null; }
    };
    const play = () => new Promise((ok) => {
      ended = ok;
      // a beat in the look the user left, then its ground fades to this round's and, as it goes, the number rolls up
      // The clock and the CSS transitions both hold while the user is away, including a tab still visible behind another app.
      let elapsed = 0, last = performance.now(), seen = watching(), faded = false, rolled = false;
      const paused = new Set();
      const resume = () => { paused.forEach((a) => { if (a.playState === 'paused') a.play(); }); paused.clear(); };
      const sync = () => {
        const now = performance.now(), here = watching();
        if (seen && now - last <= 250) elapsed += now - last;
        last = now; seen = here;
        if (here) resume();
        else bar.getAnimations({ subtree: true }).forEach((a) => { if (a.playState === 'running') { a.pause(); paused.add(a); } });
      };
      turnStop = () => { document.removeEventListener('visibilitychange', sync); removeEventListener('focus', sync); removeEventListener('blur', sync); resume(); turnStop = () => {}; };
      back(sync); addEventListener('blur', sync);
      const step = () => {
        sync();
        if (seen) {
          if (!faded && elapsed >= 260) { faded = true; look = null; paintState(true); }
          if (!rolled && elapsed >= 260 + 170) { rolled = true; roll.classList.add('go'); }
          if (elapsed >= 260 + 170 + ROLL + 40) { end(); return; }
        }
        turnRaf = requestAnimationFrame(step);
      };
      turnRaf = requestAnimationFrame(step);
    });
    // as the received arrival waits
    const whenWatching = () => new Promise((ok) => {
      if (watching()) return ok();
      const on = () => { if (!watching()) return; document.removeEventListener('visibilitychange', on); removeEventListener('focus', on); setTimeout(ok, 150); };
      back(on);
    });
    const arm = () => {
      roundTurn = () => whenWatching().then(() => (bar.classList.contains('pn-turn') ? play() : null));
      turnNow = () => { keep(); end(); };
    };
    // Replay: the number rolls back down and the bar goes back to the look the user left; the opening turns it up again
    if (V.cur > 0) {
      turnBack = () => {
        cancelAnimationFrame(turnRaf); turnStop(); ended = null;
        look = leftDone() ? 'done' : 'updating'; bar.classList.add('pn-turn');
        rn.innerHTML = `<span class="pnN-roll go"><span>${n - 1}</span><span>${n}</span></span>`;
        roll = rn.firstElementChild; void roll.offsetWidth; roll.classList.remove('go');
        paintState(true); arm();
      };
    }
    if (seen !== at && (reduced() || bar.classList.contains('rcvd') || bar.classList.contains('pn-done'))) keep();
    else if (seen !== at) {
      look = leftDone() ? 'done' : 'updating'; bar.classList.add('pn-turn');
      rn.innerHTML = `<span class="pnN-roll"><span>${n - 1}</span><span>${n}</span></span>`;
      roll = rn.firstElementChild;
      paintState(false);
      arm();
      if (!OP_ON) {
        // a scroll, click or key lands it at once, as the opening's cut does
        ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((k) => addEventListener(k, (e) => { if (e.isTrusted && bar.classList.contains('pn-turn') && !OP.live) turnNow(); }, { capture: true, passive: true }));
        roundTurn();
      }
    }
  }
  // the one public sign that the layer is on this page: data-notes-layer on <html>, set once everything above has drawn and
  // never before, so a page can write `html[data-notes-layer] .its-own-outline { display: none }` and its own part stays
  // until the layer has taken its place. An opted-in reading page can also use its 'light' or 'dark' value for its palette.
  // Nothing turns the layer off or takes it down, so nothing removes this; a framed page returns early, above, and never gets it
  document.documentElement.setAttribute('data-notes-layer', pageAppearance());
  sendUsage('opened');
  requestAnimationFrame(() => requestAnimationFrame(() => { document.body.classList.add(P + 'ready'); matchPage(); }));
  document.fonts?.ready.then(rematch); addEventListener('load', rematch);
})();
