// Exam tools: Desmos calculator, reference sheet, line reader, highlights & notes.
import { CONFIG } from '../config.js';
import { esc, icon, renderMath } from '../util.js';

/* ---------- floating, draggable, resizable panel ---------- */
function makeFloat(layer, { title, cls = '', left, top, width, height, onClose, extraBtns = '' }) {
  const el = document.createElement('div');
  el.className = 'bb-float ' + cls;
  Object.assign(el.style, { left: left + 'px', top: top + 'px', width: width + 'px', height: height + 'px' });
  el.innerHTML = `<div class="bb-float-head"><span class="bb-float-title">${esc(title)}</span>
    <span class="bb-float-btns">${extraBtns}<button data-float="close" aria-label="Close">${icon('close', 18)}</button></span></div>
    <div class="bb-float-body"></div>`;
  layer.appendChild(el);
  const head = el.querySelector('.bb-float-head');
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const sx = e.clientX - el.offsetLeft, sy = e.clientY - el.offsetTop;
    head.setPointerCapture(e.pointerId);
    const move = (ev) => {
      el.style.left = Math.max(0, Math.min(innerWidth - 80, ev.clientX - sx)) + 'px';
      el.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - sy)) + 'px';
    };
    const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
  });
  el.querySelector('[data-float="close"]').addEventListener('click', onClose);
  return el;
}

/* ---------- Desmos ---------- */
let desmosPromise = null;
function loadDesmos() {
  if (window.Desmos) return Promise.resolve();
  desmosPromise ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = `https://www.desmos.com/api/v1.10/calculator.js?apiKey=${CONFIG.desmosApiKey}`;
    s.onload = res;
    s.onerror = () => { desmosPromise = null; rej(new Error('Desmos failed to load')); };
    document.head.appendChild(s);
  });
  return desmosPromise;
}

/* ---------- reference sheet ---------- */
const REF = [
  ['<circle cx="40" cy="34" r="24"/><path d="M40 34h24"/><text x="50" y="30">r</text>', 'A = \\pi r^2', 'C = 2\\pi r'],
  ['<rect x="12" y="14" width="56" height="36"/><text x="36" y="62">ℓ</text><text x="72" y="36">w</text>', 'A = \\ell w', ''],
  ['<path d="M8 52h64L30 12z"/><path d="M30 12v40" stroke-dasharray="3 3"/><text x="34" y="36">h</text><text x="38" y="64">b</text>', 'A = \\tfrac{1}{2}bh', ''],
  ['<path d="M12 52h52V14z"/><path d="M56 52v-8h8"/><text x="34" y="64">a</text><text x="68" y="36">b</text><text x="28" y="30">c</text>', 'c^2 = a^2 + b^2', ''],
  ['<path d="M10 52h56V16z"/><path d="M58 52v-8h8"/><text x="30" y="64">x√3</text><text x="70" y="36">x</text><text x="24" y="30">2x</text><text x="16" y="48">30°</text><text x="52" y="28">60°</text>', '', 'Special right triangles'],
  ['<path d="M14 52h46V14z"/><path d="M52 52v-8h8"/><text x="32" y="64">s</text><text x="64" y="36">s</text><text x="20" y="30">s√2</text><text x="20" y="48">45°</text><text x="46" y="26">45°</text>', '', ''],
  ['<path d="M10 24h44v32H10z M10 24l14-12h44l-14 12 M68 12v32l-14 12"/><text x="28" y="66">ℓ</text><text x="64" y="64">w</text><text x="0" y="44">h</text>', 'V = \\ell wh', ''],
  ['<ellipse cx="40" cy="16" rx="22" ry="7"/><path d="M18 16v36M62 16v36"/><path d="M18 52a22 7 0 0044 0"/><path d="M40 16h22"/><text x="48" y="12">r</text><text x="66" y="38">h</text>', 'V = \\pi r^2 h', ''],
  ['<circle cx="40" cy="34" r="24"/><ellipse cx="40" cy="34" rx="24" ry="7" stroke-dasharray="3 3"/><path d="M40 34h24"/><text x="50" y="30">r</text>', 'V = \\tfrac{4}{3}\\pi r^3', ''],
  ['<path d="M18 52L40 10l22 42"/><ellipse cx="40" cy="52" rx="22" ry="7"/><path d="M40 10v42" stroke-dasharray="3 3"/><path d="M40 52h22"/><text x="44" y="34">h</text><text x="48" y="64">r</text>', 'V = \\tfrac{1}{3}\\pi r^2 h', ''],
  ['<path d="M10 50l16 10h44L54 50z M40 10L10 50 M40 10l30 10 M40 10L26 60 M40 10L54 50"/><path d="M40 10v42" stroke-dasharray="3 3"/><text x="44" y="36">h</text>', 'V = \\tfrac{1}{3}\\ell wh', ''],
];
function referenceHtml() {
  const cells = REF.map(([svg, f1, f2]) => `<div class="ref-cell">
    <svg viewBox="0 0 80 70" width="96" height="84" fill="none" stroke="currentColor" stroke-width="1.6">${svg.replace(/<text /g, '<text fill="currentColor" stroke="none" font-size="10" ')}</svg>
    ${f1 ? `<div>\\(${f1}\\)</div>` : ''}${f2 ? `<div class="${f1 ? '' : 'ref-cap'}">${f1 ? `\\(${f2}\\)` : esc(f2)}</div>` : ''}</div>`).join('');
  return `<div class="ref-sheet"><div class="ref-grid">${cells}</div>
    <ul class="ref-facts">
      <li>A circle has 360 degrees of arc, or \\(2\\pi\\) radians.</li>
      <li>The angles of a triangle add up to 180°.</li>
    </ul></div>`;
}

/* ---------- Tools controller ---------- */
export class Tools {
  constructor(exam) {
    this.exam = exam;
    this.calc = null; this.calcEl = null;
    this.refEl = null; this.reader = null;
    this.toolbar = null;
  }

  get layer() { return this.exam.root.querySelector('.bb-float-layer'); }

  // Panels live outside the re-rendered shell so they survive module changes.
  reattach() {
    for (const el of [this.calcEl, this.refEl, this.reader]) if (el && !el.isConnected) this.layer.appendChild(el);
    this.syncButtons();
  }

  syncButtons() {
    const set = (act, on) => this.exam.root.querySelector(`[data-act="${act}"]`)?.classList.toggle('on', !!on);
    set('calc', this.calcEl && !this.calcEl.hidden);
    set('ref', this.refEl && !this.refEl.hidden);
  }

  async toggleCalc() {
    if (this.calcEl) { this.calcEl.hidden = !this.calcEl.hidden; this.syncButtons(); return; }
    this.calcEl = makeFloat(this.layer, {
      title: 'Calculator', cls: 'calc', left: 16, top: 96,
      width: Math.min(480, innerWidth - 32), height: Math.min(600, innerHeight - 180),
      extraBtns: `<button data-float="wide" aria-label="Expand">${icon('expand', 18)}</button>`,
      onClose: () => { this.calcEl.hidden = true; this.syncButtons(); },
    });
    this.calcEl.querySelector('[data-float="wide"]').addEventListener('click', () => {
      const wide = this.calcEl.classList.toggle('wide');
      this.calcEl.style.width = (wide ? Math.min(900, innerWidth - 32) : Math.min(480, innerWidth - 32)) + 'px';
    });
    this.syncButtons();
    const body = this.calcEl.querySelector('.bb-float-body');
    body.innerHTML = '<div class="calc-msg">Loading the Desmos calculator…</div>';
    try {
      await loadDesmos();
      body.innerHTML = '';
      const host = document.createElement('div');
      host.className = 'calc-host';
      body.appendChild(host);
      this.calc = window.Desmos.GraphingCalculator(host, { keypad: true, expressions: true, settingsMenu: true, zoomButtons: true, border: false });
      new ResizeObserver(() => this.calc?.resize()).observe(host);
    } catch {
      body.innerHTML = '<div class="calc-msg">The calculator could not load. Check the internet connection and try again.</div>';
      this.calcEl.remove(); this.calcEl = null; this.syncButtons();
      this.exam.flash('The calculator could not load. Check the internet connection.');
    }
  }

  toggleRef() {
    if (this.refEl) { this.refEl.hidden = !this.refEl.hidden; this.syncButtons(); return; }
    const w = Math.min(560, innerWidth - 32);
    this.refEl = makeFloat(this.layer, {
      title: 'Reference', cls: 'ref', left: innerWidth - w - 16, top: 96, width: w, height: Math.min(560, innerHeight - 180),
      onClose: () => { this.refEl.hidden = true; this.syncButtons(); },
    });
    const body = this.refEl.querySelector('.bb-float-body');
    body.innerHTML = referenceHtml();
    renderMath(body);
    this.syncButtons();
  }

  toggleLineReader() {
    if (this.reader) { this.reader.remove(); this.reader = null; return; }
    const r = document.createElement('div');
    r.className = 'line-reader';
    r.innerHTML = `<div class="lr-shade lr-top"></div>
      <div class="lr-band"><button class="lr-grip" aria-label="Drag line reader">${icon('arrows', 16)}</button>
      <button class="lr-close" aria-label="Close line reader">${icon('close', 16)}</button></div>
      <div class="lr-shade lr-bot"></div>`;
    this.layer.appendChild(r);
    this.reader = r;
    let y = innerHeight * 0.38;
    const band = 72;
    const place = () => {
      y = Math.max(80, Math.min(innerHeight - band - 60, y));
      r.querySelector('.lr-top').style.height = y + 'px';
      r.querySelector('.lr-band').style.cssText = `top:${y}px;height:${band}px`;
      r.querySelector('.lr-bot').style.top = (y + band) + 'px';
    };
    place();
    const grip = r.querySelector('.lr-grip');
    grip.addEventListener('pointerdown', (e) => {
      grip.setPointerCapture(e.pointerId);
      const off = e.clientY - y;
      const move = (ev) => { y = ev.clientY - off; place(); };
      const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
    grip.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') { y -= 24; place(); e.preventDefault(); }
      if (e.key === 'ArrowDown') { y += 24; place(); e.preventDefault(); }
    });
    r.querySelector('.lr-close').addEventListener('click', () => this.toggleLineReader());
  }

  /* ---------- highlights & notes ---------- */
  bindHighlighter(main) {
    main.addEventListener('mouseup', () => setTimeout(() => this.onSelect(), 0));
    main.addEventListener('keyup', (e) => { if (e.shiftKey) this.onSelect(); });
    main.addEventListener('click', (e) => {
      const m = e.target.closest('mark.hl');
      if (m && getSelection().isCollapsed) this.showToolbar(m.getBoundingClientRect(), { mark: m });
    });
  }

  selectionRange() {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const host = (node.nodeType === 1 ? node : node.parentElement).closest('.annotatable');
    return host && this.exam.root.contains(host) && range.toString().trim() ? { range, host } : null;
  }

  onSelect() {
    const s = this.selectionRange();
    if (s) this.showToolbar(s.range.getBoundingClientRect(), { range: s.range, host: s.host });
  }

  // Header button: highlight the current selection, or explain how.
  annotateButton() {
    const s = this.selectionRange();
    if (s) { this.apply(s, 'yellow'); return; }
    this.exam.flash('Select words in the passage or question, then pick a highlight color.');
  }

  hideToolbar() { this.toolbar?.remove(); this.toolbar = null; }

  showToolbar(rect, ctx) {
    this.hideToolbar();
    const tb = document.createElement('div');
    tb.className = 'hl-toolbar';
    const editing = !!ctx.mark;
    tb.innerHTML = `
      ${['yellow', 'blue', 'pink'].map((c) => `<button class="hl-sw hl-${c}" data-c="${c}" aria-label="Highlight ${c}"></button>`).join('')}
      <button data-c="underline" aria-label="Underline">${icon('underline', 18)}</button>
      <span class="hl-sep"></span>
      <button data-c="note" class="hl-txt">${icon('note', 16)} ${editing && ctx.mark.dataset.note ? 'Edit note' : 'Add note'}</button>
      ${editing ? `<button data-c="delete" class="hl-txt" aria-label="Remove highlight">${icon('trash', 16)}</button>` : ''}`;
    this.layer.appendChild(tb);
    const w = tb.offsetWidth;
    tb.style.left = Math.max(8, Math.min(innerWidth - w - 8, rect.left + rect.width / 2 - w / 2)) + 'px';
    tb.style.top = (rect.top > 130 ? rect.top - 52 : rect.bottom + 10) + 'px';
    tb.addEventListener('mousedown', (e) => e.preventDefault());   // keep the text selection
    tb.addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      const c = b.dataset.c;
      if (editing) this.editMark(ctx.mark, c);
      else if (c === 'note') { const marks = this.apply(ctx, 'yellow'); if (marks) this.noteEditor(marks[0]); }
      else this.apply(ctx, c);
    });
    this.toolbar = tb;
  }

  // Wrap every text node of the selection in <mark>, skipping rendered math.
  apply({ range, host }, style) {
    const hid = 'h' + Date.now().toString(36);
    const nodes = [];
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (range.intersectsNode(n) && !n.parentElement.closest('.katex') && n.data.trim()
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const marks = [];
    for (let n of nodes) {
      const start = n === range.startContainer ? range.startOffset : 0;
      const end = n === range.endContainer ? range.endOffset : n.length;
      if (start >= end) continue;
      if (end < n.length) n.splitText(end);
      if (start > 0) n = n.splitText(start);
      const m = document.createElement('mark');
      m.className = 'hl ' + (style === 'underline' ? 'hl-ul' : 'hl-' + style);
      m.dataset.hid = hid;
      n.parentNode.insertBefore(m, n);
      m.appendChild(n);
      marks.push(m);
    }
    getSelection().removeAllRanges();
    this.hideToolbar();
    this.exam.saveAnnotations();
    return marks.length ? marks : null;
  }

  group(mark) { return [...this.exam.root.querySelectorAll(`mark.hl[data-hid="${mark.dataset.hid}"]`)]; }

  editMark(mark, c) {
    const marks = this.group(mark);
    if (c === 'delete') {
      for (const m of marks) { const p = m.parentNode; m.replaceWith(...m.childNodes); p.normalize(); }
    } else if (c === 'note') {
      this.hideToolbar(); this.noteEditor(mark); return;
    } else {
      const note = mark.classList.contains('has-note');
      for (const m of marks) m.className = 'hl ' + (c === 'underline' ? 'hl-ul' : 'hl-' + c) + (note ? ' has-note' : '');
    }
    this.hideToolbar();
    this.exam.saveAnnotations();
  }

  noteEditor(mark) {
    const marks = this.group(mark);
    const box = document.createElement('div');
    box.className = 'hl-note';
    box.innerHTML = `<div class="hl-note-q">“${esc(marks.map((m) => m.textContent).join('').slice(0, 80))}”</div>
      <textarea rows="4" placeholder="Type a note…">${esc(mark.dataset.note || '')}</textarea>
      <div class="hl-note-act"><button class="bb-btn-outline" data-n="del">Delete note</button><button class="bb-btn" data-n="save">Save</button></div>`;
    this.layer.appendChild(box);
    const r = mark.getBoundingClientRect();
    box.style.left = Math.max(8, Math.min(innerWidth - 340, r.left)) + 'px';
    box.style.top = Math.min(innerHeight - 220, r.bottom + 8) + 'px';
    const ta = box.querySelector('textarea');
    ta.focus();
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-n]');
      if (!b) return;
      const text = b.dataset.n === 'save' ? ta.value.trim() : '';
      for (const m of marks) {
        if (text) { m.dataset.note = text; m.title = text; m.classList.add('has-note'); }
        else { delete m.dataset.note; m.removeAttribute('title'); m.classList.remove('has-note'); }
      }
      box.remove();
      this.exam.saveAnnotations();
    });
  }

  destroy() {
    this.hideToolbar();
    this.calc?.destroy?.();
  }
}
