// HTML for one question, shared by the live exam and the answer review.
import { esc, icon } from '../util.js?v=6a94ba54';

export const LETTERS = ['A', 'B', 'C', 'D'];

export const SPR_DIRECTIONS = `
<div class="spr-dirs">
  <h3>Student-produced response directions</h3>
  <ul>
    <li>If you find <b>more than one correct answer</b>, enter only one answer.</li>
    <li>You can enter up to 5 characters for a <b>positive</b> answer and up to 6 characters (including the negative sign) for a <b>negative</b> answer.</li>
    <li>If your answer is a <b>fraction</b> that doesn't fit in the provided space, enter the decimal equivalent.</li>
    <li>If your answer is a <b>decimal</b> that doesn't fit in the provided space, enter it by truncating or rounding at the fourth digit.</li>
    <li>If your answer is a <b>mixed number</b> (such as 3½), enter it as an improper fraction (7/2) or its decimal equivalent (3.5).</li>
    <li>Don't enter <b>symbols</b> such as a percent sign, comma, or dollar sign.</li>
  </ul>
  <table class="spr-examples">
    <thead><tr><th>Answer</th><th>Acceptable ways to enter answer</th><th>Unacceptable: will NOT receive credit</th></tr></thead>
    <tbody>
      <tr><td>3.5</td><td>3.5<br>3.50<br>7/2</td><td>31/2<br>3 1/2</td></tr>
      <tr><td>2/3</td><td>2/3<br>.6666<br>.6667<br>0.666<br>0.667</td><td>0.66<br>.66<br>0.67<br>.67</td></tr>
      <tr><td>−1/3</td><td>−1/3<br>−.3333<br>−0.333</td><td>−.33<br>−0.33</td></tr>
    </tbody>
  </table>
</div>`;

export const isSplit = (q) => !!q.passage || q.type === 'spr';

export function leftPaneHtml(q, notes) {
  if (q.passage) return `<div class="passage annotatable" data-part="passage">${notes?.passage ?? q.passage}</div>`;
  if (q.type === 'spr') return SPR_DIRECTIONS;
  return '';
}

// opts: { review: bool, number: int }
export function questionHtml(q, r = {}, opts = {}) {
  const review = !!opts.review;
  const elimOn = !review && !!r.elimOn && q.type === 'mcq';
  const head = review
    ? `<div class="q-result ${r.correct ? 'ok' : r.answered ? 'bad' : 'skip'}">${r.correct ? icon('check', 16) + ' Correct' : r.answered ? icon('x', 16) + ' Incorrect' : 'Not answered'}</div>`
    : `<button class="q-mark ${r.mark ? 'on' : ''}" data-act="mark" aria-pressed="${!!r.mark}">${icon('bookmark', 18)}<span>Mark for Review</span></button>`;
  const elimBtn = !review && q.type === 'mcq'
    ? `<button class="q-elim ${elimOn ? 'on' : ''}" data-act="toggle-elim" aria-pressed="${elimOn}" title="Cross out answer choices"><span>ABC</span></button>` : '';

  let body;
  if (q.type === 'mcq') {
    body = '<div class="q-choices" role="radiogroup">' + q.choices.map((c, i) => {
      const L = LETTERS[i];
      const sel = r.a === L;
      const struck = !review && (r.elim || []).includes(L);
      let cls = sel ? ' selected' : '';
      if (struck) cls += ' struck';
      if (review) cls += (L === q.answer ? ' is-answer' : '') + (sel && L !== q.answer ? ' is-wrong' : '');
      const side = !elimOn ? '' : struck
        ? `<button class="ch-undo" data-act="unstrike" data-l="${L}">Undo</button>`
        : `<button class="ch-strike" data-act="strike" data-l="${L}" aria-label="Cross out choice ${L}"><span>${L}</span></button>`;
      const tag = review && L === q.answer ? '<span class="ch-tag ok">Correct answer</span>'
        : review && sel ? '<span class="ch-tag bad">Your answer</span>' : '';
      return `<div class="ch-row${cls}">
        <button class="ch" ${review ? 'disabled' : ''} data-act="choose" data-l="${L}" role="radio" aria-checked="${sel}">
          <span class="ch-letter">${L}</span><span class="ch-text">${c}</span>${tag}
        </button>${side}</div>`;
    }).join('') + '</div>';
  } else if (review) {
    body = `<div class="spr-review">
      <div><span class="lbl">Your answer</span><b class="${r.correct ? 'ok' : 'bad'}">${r.answered ? esc(r.a) : '—'}</b></div>
      <div><span class="lbl">Correct answer</span><b class="ok">${q.answer.map(esc).join(' &nbsp;or&nbsp; ')}</b></div></div>`;
  } else {
    body = `<div class="spr">
      <input class="spr-input" value="${esc(r.a ?? '')}" maxlength="6" inputmode="decimal" autocomplete="off" spellcheck="false" aria-label="Enter your answer">
      <div class="spr-preview">Answer Preview: <span class="spr-prev-val"></span></div></div>`;
  }

  return `<div class="q-block">
    <div class="q-head"><div class="q-num">${opts.number}</div>${head}<div class="q-head-sp"></div>${elimBtn}</div>
    <div class="q-stem annotatable" data-part="stem">${(!review && opts.notes?.stem) || q.stem}</div>
    ${body}
  </div>`;
}

// Renders the SPR entry as it will be read: "7/2" shows as a stacked fraction.
export function sprPreviewHtml(v) {
  v = String(v || '').trim();
  if (!v) return '';
  const m = v.match(/^(-?)([\d.]+)\/([\d.]+)$/);
  if (m && window.katex) {
    return window.katex.renderToString(`${m[1] ? '-' : ''}\\dfrac{${m[2]}}{${m[3]}}`, { throwOnError: false });
  }
  return esc(v.replace('-', '−'));
}
