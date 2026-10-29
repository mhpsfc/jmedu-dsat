// Small shared helpers.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
}

export function fmtMinutes(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' hr' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Math uses \( ... \) inline and \[ ... \] display. Dollar signs are left alone so
// prices like $15 in a passage never turn into math.
export function renderMath(el) {
  if (!el || !window.renderMathInElement) return;
  try {
    window.renderMathInElement(el, {
      delimiters: [
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
    });
  } catch (e) { console.warn('KaTeX', e); }
}

export function toast(msg, kind = '') {
  const root = document.getElementById('toast-root');
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

// Promise-based modal used outside the exam.
export function confirmDialog({ title, body, ok = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'dlg-backdrop';
    wrap.innerHTML = `<div class="dlg" role="dialog" aria-modal="true">
      <h3>${esc(title)}</h3><div class="dlg-body">${body || ''}</div>
      <div class="dlg-actions">
        ${cancel ? `<button class="btn ghost" data-r="0">${esc(cancel)}</button>` : ''}
        <button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(ok)}</button>
      </div></div>`;
    wrap.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]');
      if (r || e.target === wrap) { wrap.remove(); resolve(r ? r.dataset.r === '1' : false); }
    });
    document.body.appendChild(wrap);
    wrap.querySelector('[data-r="1"]').focus();
  });
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function debounce(fn, ms) {
  let t, last;
  const run = () => { t = null; fn(...last); };
  const d = (...a) => { last = a; clearTimeout(t); t = setTimeout(run, ms); };
  d.flush = () => { if (t) { clearTimeout(t); run(); } };
  return d;
}

// Inline SVG icons (stroke = currentColor).
const P = {
  bookmark: '<path d="M6 3h12v18l-6-4.5L6 21z"/>',
  pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
  more: '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M16 12h0M8 16h2M12 16h2M16 16h0"/>',
  ref: '<path d="M4 20V4l8 8 8-8v16"/><path d="M4 20h16"/>',
  caretDown: '<path d="M6 9l6 6 6-6"/>',
  caretUp: '<path d="M6 15l6-6 6 6"/>',
  pin: '<path d="M12 21s-6-6.2-6-11a6 6 0 1112 0c0 4.8-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  expand: '<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  x: '<path d="M7 7l10 10M17 7L7 17"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  arrows: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .7-1.5 1.2-1.5 2.5M12 17h0"/>',
  keyboard: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h0M11 10h0M15 10h0M7 14h10"/>',
  reader: '<path d="M3 9h18M3 15h18"/><rect x="3" y="4" width="18" height="16" rx="2"/>',
  exit: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  note: '<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  underline: '<path d="M7 4v7a5 5 0 0010 0V4M5 20h14"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
  book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 19V5"/>',
  sigma: '<path d="M18 5H6l6 7-6 7h12"/>',
};
export const icon = (name, size = 20, cls = '') =>
  `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
