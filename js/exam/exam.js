// The Bluebook-style test runner.
//
// attempt.state:
//   plan: ['rw','math']          sections in order
//   secIdx, modIdx, qIdx         where the student is
//   stage: intro | module | review | between | break | finished
//   remaining, breakRemaining    seconds left (saved so a test can resume)
//   modules: { rw: ['m1','m2_hard'] }   modules actually given
//   forced: 'm2_easy'            admin preview of a single module
//   responses: { qid: { a, mark, elim: [], elimOn } }
//   notes: { qid: { passage, stem } }   highlighted HTML
import { esc, icon, fmtClock, fmtMinutes, renderMath } from '../util.js';
import { isAnswered, routeAfterModule1 } from '../scoring.js';
import { questionHtml, leftPaneHtml, isSplit, sprPreviewHtml, LETTERS } from './render.js';
import { Tools } from './tools.js';

const DIRECTIONS = {
  rw: `<p>The questions in this section address a number of important reading and writing skills. Each question includes one or more passages, which may include a table or graph. Read each passage and question carefully, and then choose the best answer to the question based on the passage(s).</p>
       <p>All questions in this section are multiple-choice with four answer choices. Each question has a single best answer.</p>`,
  math: `<p>The questions in this section address a number of important math skills.</p>
       <p>Use of a calculator is permitted for all questions. A reference sheet, calculator, and these directions can be accessed throughout the test.</p>
       <p><b>Unless otherwise indicated:</b></p>
       <ul><li>All variables and expressions represent real numbers.</li>
       <li>Figures provided are drawn to scale.</li>
       <li>All figures lie in a plane.</li>
       <li>The domain of a given function \\(f\\) is the set of all real numbers \\(x\\) for which \\(f(x)\\) is a real number.</li></ul>
       <p>For <b>multiple-choice questions</b>, solve each problem and choose the correct answer from the choices provided. Each multiple-choice question has a single correct answer.</p>
       <p>For <b>student-produced response questions</b>, solve each problem and enter your answer as described in the directions shown next to the question.</p>`,
};

export class Exam {
  constructor(root, { test, attempt, user, preview = false, save, onExit, onFinish }) {
    Object.assign(this, { root, test, attempt, user, preview, saveFn: save, onExit, onFinish });
    this.state = attempt.state;
    this.tools = new Tools(this);
    this.timerHidden = false;
    this.splitPct = 50;
    this.timer = null;
    this.onKey = this.onKey.bind(this);
    this.onClick = this.onClick.bind(this);
    this.onInput = this.onInput.bind(this);
  }

  /* ---------- lifecycle ---------- */
  start() {
    document.body.classList.add('in-exam');
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('input', this.onInput);
    document.addEventListener('keydown', this.onKey);
    this.render();
  }

  destroy() {
    this.stopTimer();
    this.tools.destroy();
    document.body.classList.remove('in-exam');
    this.root.removeEventListener('click', this.onClick);
    this.root.removeEventListener('input', this.onInput);
    document.removeEventListener('keydown', this.onKey);
  }

  save(immediate = false) {
    this.attempt.state = this.state;
    if (!this.preview) this.saveFn(this.attempt, { immediate });
  }

  /* ---------- where are we ---------- */
  get sec() { return this.test.sections.find((s) => s.id === this.state.plan[this.state.secIdx]); }
  get modKey() { return this.state.modules[this.sec.id]?.[this.state.modIdx]; }
  get mod() { return this.sec.modules[this.modKey]; }
  get q() { return this.mod.questions[this.state.qIdx]; }
  resp(q = this.q) { return (this.state.responses[q.id] ||= {}); }
  get moduleLabel() { return `Section ${this.sec.number}, Module ${this.modKey === 'm1' ? 1 : 2}: ${this.sec.title}`; }

  /* ---------- rendering ---------- */
  render() {
    this.closePopup();
    const st = this.state.stage;
    if (st === 'intro') return this.renderIntro();
    if (st === 'module' || st === 'review') { this.renderShell(); this.startTimer(); return; }
    this.stopTimer();
    if (st === 'between') return this.renderBetween();
    if (st === 'break') return this.renderBreak();
    if (st === 'finished') return this.onFinish(this.attempt);
  }

  renderIntro() {
    const secs = this.state.plan.map((id) => this.test.sections.find((s) => s.id === id));
    const rows = secs.map((s) => {
      const m2 = s.modules.m2 || s.modules.m2_hard || s.modules.m2_easy;
      const n = s.modules.m1.questions.length + (this.state.forced ? 0 : m2.questions.length);
      const t = this.state.forced ? s.modules[this.state.forced].time : s.modules.m1.time + m2.time;
      return `<li><b>${esc(s.title)}</b><span>${this.state.forced ? '1 module' : '2 modules'} · ${n} questions · ${fmtMinutes(t)}</span></li>`;
    }).join('');
    const brk = secs.length > 1 && this.test.breakSeconds ? `<li><b>Break</b><span>${fmtMinutes(this.test.breakSeconds)} between sections</span></li>` : '';
    this.root.innerHTML = `<div class="bb-screen intro">
      <div class="bb-card">
        <div class="intro-kicker">${this.preview ? 'Admin preview' : 'Practice test'}</div>
        <h1>${esc(this.test.title)}</h1>
        <ul class="intro-plan">${rows}${brk}</ul>
        <div class="intro-grid">
          <div>${icon('clock', 22)}<h4>Timing</h4><p>Each module has its own clock at the top of the screen. When time runs out, the test moves on by itself.</p></div>
          <div>${icon('chart', 22)}<h4>Adaptive</h4><p>How you do in Module 1 decides whether Module 2 is easier or harder — just like the real Digital SAT.</p></div>
          <div>${icon('pen', 22)}<h4>Tools</h4><p>Highlights & notes, answer eliminator, mark for review${secs.some((s) => s.id === 'math') ? ', Desmos calculator and reference sheet' : ''}.</p></div>
          <div>${icon('exit', 22)}<h4>Save & exit</h4><p>Need to stop? Use <b>More → Save and Exit</b>. The clock pauses and you can resume later.</p></div>
        </div>
        <div class="intro-act">
          <button class="bb-btn-outline" data-act="exit-now">Back to dashboard</button>
          <button class="bb-btn big" data-act="begin">Begin</button>
        </div>
      </div></div>`;
  }

  renderShell() {
    const isMath = this.sec.id === 'math';
    this.root.innerHTML = `<div class="bb ${this.sec.id}">
      <header class="bb-head">
        <div class="bb-head-l">
          <div class="bb-title">${esc(this.moduleLabel)}</div>
          <button class="bb-dir" data-act="directions">Directions ${icon('caretDown', 16)}</button>
        </div>
        <div class="bb-head-c">
          <div class="bb-timer" aria-live="off"></div>
          <button class="bb-pill-sm" data-act="toggle-timer"></button>
        </div>
        <div class="bb-head-r">
          ${isMath ? `<button class="bb-tool" data-act="calc">${icon('calc', 22)}<span>Calculator</span></button>
          <button class="bb-tool" data-act="ref">${icon('sigma', 22)}<span>Reference</span></button>` : ''}
          <button class="bb-tool" data-act="annotate">${icon('pen', 22)}<span>Highlights &amp; Notes</span></button>
          <button class="bb-tool" data-act="more">${icon('more', 22)}<span>More</span></button>
        </div>
      </header>
      ${this.preview ? '<div class="bb-preview-flag">Admin preview — answers are not saved</div>' : ''}
      <main class="bb-main"></main>
      <footer class="bb-foot">
        <div class="bb-name">${esc(this.user?.name || '')}</div>
        <button class="bb-qnav" data-act="nav"></button>
        <div class="bb-foot-r">
          <button class="bb-btn" data-act="back">Back</button>
          <button class="bb-btn" data-act="next">Next</button>
        </div>
      </footer>
      <div class="bb-float-layer"></div>
      <div class="bb-pop-layer"></div>
    </div>`;
    this.tools.bindHighlighter(this.root.querySelector('.bb-main'));
    this.tools.reattach();
    this.updateTimer();
    this.renderBody();
  }

  renderBody() {
    this.tools.hideToolbar();
    const main = this.root.querySelector('.bb-main');
    const foot = this.root.querySelector('.bb-foot');
    const n = this.mod.questions.length;
    if (this.state.stage === 'review') {
      main.innerHTML = `<div class="bb-review">
        <h2>Check Your Work</h2>
        <p>On test day, you won't be able to move on to the next module until time expires.<br>
        For this practice test, you can click <b>Next</b> when you're ready to move on.</p>
        <div class="nav-card">${this.navGridHtml(false)}</div></div>`;
      foot.querySelector('.bb-qnav').hidden = true;
      foot.querySelector('[data-act="back"]').disabled = false;
      return;
    }
    const q = this.q, r = this.resp();
    const notes = this.state.notes[q.id];
    const qHtml = questionHtml(q, r, { number: this.state.qIdx + 1, notes });
    main.innerHTML = isSplit(q)
      ? `<div class="bb-split" style="--split:${this.splitPct}%">
          <section class="bb-pane bb-left">${leftPaneHtml(q, notes)}</section>
          <div class="bb-divider" role="separator" aria-label="Resize panes"><button class="bb-divider-btn" tabindex="-1">${icon('arrows', 16)}</button></div>
          <section class="bb-pane bb-right">${qHtml}</section></div>`
      : `<div class="bb-single"><section class="bb-pane">${qHtml}</section></div>`;
    renderMath(main);
    const inp = main.querySelector('.spr-input');
    if (inp) main.querySelector('.spr-prev-val').innerHTML = sprPreviewHtml(inp.value);
    this.bindDivider(main.querySelector('.bb-divider'));
    const qnav = foot.querySelector('.bb-qnav');
    qnav.hidden = false;
    qnav.innerHTML = `Question ${this.state.qIdx + 1} of ${n} ${icon('caretUp', 16)}`;
    foot.querySelector('[data-act="back"]').disabled = this.state.qIdx === 0;
    main.querySelectorAll('.bb-pane').forEach((p) => (p.scrollTop = 0));
  }

  bindDivider(div) {
    if (!div) return;
    const split = div.parentElement;
    div.addEventListener('pointerdown', (e) => {
      div.setPointerCapture(e.pointerId);
      const box = split.getBoundingClientRect();
      const move = (ev) => {
        this.splitPct = Math.max(25, Math.min(75, ((ev.clientX - box.left) / box.width) * 100));
        split.style.setProperty('--split', this.splitPct + '%');
      };
      const up = () => { div.removeEventListener('pointermove', move); div.removeEventListener('pointerup', up); };
      div.addEventListener('pointermove', move);
      div.addEventListener('pointerup', up);
    });
  }

  navGridHtml(withCurrent) {
    const qs = this.mod.questions;
    const cells = qs.map((q, i) => {
      const r = this.state.responses[q.id];
      const cls = [isAnswered(q, r) ? 'answered' : 'unanswered', r?.mark ? 'marked' : '', withCurrent && i === this.state.qIdx ? 'current' : ''].join(' ');
      return `<button class="nav-cell ${cls}" data-act="goto" data-i="${i}" aria-label="Question ${i + 1}">
        ${withCurrent && i === this.state.qIdx ? `<span class="nav-pin">${icon('pin', 16)}</span>` : ''}${i + 1}
        ${r?.mark ? `<span class="nav-flag">${icon('bookmark', 12)}</span>` : ''}</button>`;
    }).join('');
    return `<div class="nav-head"><b>${esc(this.moduleLabel)} Questions</b></div>
      <div class="nav-legend">
        ${withCurrent ? `<span>${icon('pin', 16)} Current</span>` : ''}
        <span><i class="lg-unans"></i> Unanswered</span>
        <span><i class="lg-mark">${icon('bookmark', 12)}</i> For Review</span>
      </div>
      <div class="nav-grid">${cells}</div>`;
  }

  renderBetween() {
    const sec = this.sec;
    const first = this.state.modIdx === 0;
    const done = first
      ? (this.state.secIdx > 0 ? `You've finished the ${esc(this.test.sections.find((s) => s.id === this.state.plan[this.state.secIdx - 1]).title)} section.` : '')
      : `You've finished Module 1 of ${esc(sec.title)}.`;
    const m = sec.modules[this.state.modules[sec.id]?.[this.state.modIdx] || 'm1'] || sec.modules.m1;
    this.root.innerHTML = `<div class="bb-screen between"><div class="bb-card center">
      ${done ? `<div class="between-done">${icon('check', 22)} ${done}</div>` : ''}
      <div class="intro-kicker">Up next</div>
      <h1>Section ${sec.number}, Module ${this.state.modIdx + 1}</h1>
      <p class="between-sub">${esc(sec.title)} · ${m.questions.length} questions · ${fmtMinutes(m.time)}</p>
      <p class="muted">The clock starts as soon as you continue.</p>
      <div class="intro-act"><button class="bb-btn-outline" data-act="save-exit-now">Save and exit</button>
      <button class="bb-btn big" data-act="begin">Continue</button></div></div></div>`;
  }

  renderBreak() {
    this.root.innerHTML = `<div class="bb-screen break">
      <div class="break-clock">
        <div class="break-lbl">Remaining Break Time:</div>
        <div class="break-time"></div>
        <button class="bb-btn big light" data-act="begin">Resume Testing</button>
        <button class="break-exit" data-act="save-exit-now">Save and exit</button>
      </div>
      <div class="break-info">
        <h2>Practice Test Break</h2>
        <p>You can resume this practice test as soon as you're ready to move on. On test day, you'll wait until the clock counts down.</p>
        <p>Read below to see how breaks work on test day.</p>
        <hr>
        <h3>Take a Break: Do Not Close Your Device</h3>
        <p>After the break, a <b>Resume Testing</b> button will appear and you'll start the next section.</p>
        <h4>Follow these rules during the break:</h4>
        <ol><li>Do not disturb students who are still testing.</li><li>Do not exit the app or close your laptop.</li>
        <li>Do not access phones, smartwatches, textbooks, notes, or the internet.</li>
        <li>Do not eat or drink near any testing device.</li>
        <li>Do not speak in the test room; outside the test room, do not discuss the exam with anyone.</li></ol>
      </div></div>`;
    const el = this.root.querySelector('.break-time');
    let end = Date.now() + (this.state.breakRemaining ?? this.test.breakSeconds) * 1000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      el.textContent = fmtClock(left);
      if (left !== this.state.breakRemaining) { this.state.breakRemaining = left; if (left % 5 === 0) this.save(); }
      if (left <= 0) { this.stopTimer(); this.beginModule(); }
    };
    tick();
    this.timer = setInterval(tick, 250);
  }

  /* ---------- timer ---------- */
  startTimer() {
    this.stopTimer();
    if (this.state.remaining == null) this.state.remaining = this.mod.time;
    const end = Date.now() + this.state.remaining * 1000;
    this.timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      if (left === this.state.remaining) return;
      this.state.remaining = left;
      this.updateTimer();
      if (left % 5 === 0) this.save();
      if (left === 300) {
        this.timerHidden = false; this.updateTimer();
        this.flash('5 minutes remaining in this module.');
      }
      if (left <= 0) this.timeUp();
    }, 250);
  }

  stopTimer() { clearInterval(this.timer); this.timer = null; }

  updateTimer() {
    const t = this.root.querySelector('.bb-timer');
    if (!t) return;
    const left = this.state.remaining ?? this.mod.time;
    const lastFive = left <= 300;
    if (lastFive) this.timerHidden = false;
    t.innerHTML = this.timerHidden ? icon('clock', 24) : fmtClock(left);
    t.classList.toggle('warn', lastFive);
    const b = this.root.querySelector('[data-act="toggle-timer"]');
    b.textContent = this.timerHidden ? 'Show' : 'Hide';
    b.hidden = lastFive;
  }

  timeUp() {
    this.stopTimer();
    this.modal({
      title: "Time's up",
      body: `<p>Time has run out for this module. Your answers have been saved.</p>`,
      actions: [{ label: 'Continue', primary: true, run: () => this.submitModule() }],
      dismissable: false,
    });
  }

  /* ---------- flow ---------- */
  beginModule() {
    const s = this.state, sec = this.sec;
    s.modules[sec.id] ||= [];
    if (s.modIdx === 0 && !s.modules[sec.id][0]) s.modules[sec.id][0] = s.forced || 'm1';
    s.stage = 'module';
    s.qIdx = 0;
    s.remaining = this.mod.time;
    s.breakRemaining = null;
    this.timerHidden = false;
    this.save(true);
    this.render();
  }

  submitModule() {
    const s = this.state, sec = this.sec;
    this.stopTimer();
    s.remaining = null;
    s.qIdx = 0;
    if (s.modIdx === 0 && !s.forced) {
      s.modules[sec.id][1] = routeAfterModule1(sec, this.mod, s.responses);
      s.modIdx = 1;
      s.stage = 'between';
    } else if (s.secIdx < s.plan.length - 1) {
      s.secIdx++; s.modIdx = 0;
      s.stage = this.test.breakSeconds ? 'break' : 'between';
      s.breakRemaining = this.test.breakSeconds;
    } else {
      s.stage = 'finished';
    }
    this.save(true);
    this.render();
  }

  goto(i) {
    this.state.stage = 'module';
    this.state.qIdx = Math.max(0, Math.min(this.mod.questions.length - 1, i));
    this.closePopup();
    this.save();
    this.renderBody();
  }

  next() {
    if (this.state.stage === 'review') return this.confirmSubmit();
    if (this.state.qIdx < this.mod.questions.length - 1) this.goto(this.state.qIdx + 1);
    else { this.state.stage = 'review'; this.closePopup(); this.save(); this.renderBody(); }
  }

  back() {
    if (this.state.stage === 'review') return this.goto(this.mod.questions.length - 1);
    if (this.state.qIdx > 0) this.goto(this.state.qIdx - 1);
  }

  confirmSubmit() {
    const left = this.mod.questions.filter((q) => !isAnswered(q, this.state.responses[q.id])).length;
    const last = this.state.modIdx === 1 || this.state.forced;
    const what = last && this.state.secIdx === this.state.plan.length - 1 ? 'finish the test' : 'move on to the next module';
    this.modal({
      title: 'Ready to move on?',
      body: `<p>${left ? `You have <b>${left} unanswered question${left > 1 ? 's' : ''}</b> in this module. ` : 'You answered every question in this module. '}
        Once you ${what}, you can't come back to this module.</p>`,
      actions: [
        { label: 'Keep working', run: () => {} },
        { label: last && this.state.secIdx === this.state.plan.length - 1 ? 'Finish test' : 'Move on', primary: true, run: () => this.submitModule() },
      ],
    });
  }

  /* ---------- answering ---------- */
  choose(L) {
    const r = this.resp();
    r.a = r.a === L ? r.a : L;
    if (r.elim?.includes(L)) r.elim = r.elim.filter((x) => x !== L);
    this.save();
    this.renderBody();
  }

  strike(L, on) {
    const r = this.resp();
    r.elim = (r.elim || []).filter((x) => x !== L);
    if (on) { r.elim.push(L); if (r.a === L) r.a = null; }
    this.save();
    this.renderBody();
  }

  saveAnnotations() {
    const main = this.root.querySelector('.bb-main');
    const n = (this.state.notes[this.q.id] ||= {});
    for (const el of main.querySelectorAll('.annotatable')) n[el.dataset.part] = el.innerHTML;
    this.save();
  }

  /* ---------- events ---------- */
  onInput(e) {
    if (!e.target.classList.contains('spr-input')) return;
    const inp = e.target;
    let v = inp.value.replace(/[^0-9./-]/g, '').replace(/(?!^)-/g, '');
    if (!v.startsWith('-')) v = v.slice(0, 5);
    if ((v.match(/\//g) || []).length > 1) v = v.replace(/\/(?=.*\/)/, '');
    if (v !== inp.value) inp.value = v;
    this.resp().a = v || null;
    this.root.querySelector('.spr-prev-val').innerHTML = sprPreviewHtml(v);
    this.save();
  }

  onClick(e) {
    const t = e.target;
    if (!t.closest('.hl-toolbar') && !t.closest('mark.hl')) this.tools.hideToolbar();
    if (this.popup && !t.closest('.bb-pop') && !t.closest('[data-act="nav"],[data-act="more"],[data-act="directions"]')) this.closePopup();
    const a = t.closest('[data-act]');
    if (!a || a.disabled) return;
    const act = a.dataset.act;
    switch (act) {
      case 'begin': return this.beginModule();
      case 'exit-now': return this.onExit();
      case 'save-exit-now': this.save(true); return this.onExit();
      case 'next': return this.next();
      case 'back': return this.back();
      case 'choose': return this.choose(a.dataset.l);
      case 'strike': return this.strike(a.dataset.l, true);
      case 'unstrike': return this.strike(a.dataset.l, false);
      case 'toggle-elim': this.resp().elimOn = !this.resp().elimOn; this.save(); return this.renderBody();
      case 'mark': this.resp().mark = !this.resp().mark; this.save(); return this.renderBody();
      case 'toggle-timer': this.timerHidden = !this.timerHidden; return this.updateTimer();
      case 'goto': return this.goto(+a.dataset.i);
      case 'review-page': this.state.stage = 'review'; this.closePopup(); this.save(); return this.renderBody();
      case 'nav': return this.togglePopup('nav', a);
      case 'more': return this.togglePopup('more', a);
      case 'directions': return this.togglePopup('directions', a);
      case 'calc': return this.tools.toggleCalc();
      case 'ref': return this.tools.toggleRef();
      case 'annotate': return this.tools.annotateButton();
      case 'line-reader': this.closePopup(); return this.tools.toggleLineReader();
      case 'help': this.closePopup(); return this.showHelp();
      case 'shortcuts': this.closePopup(); return this.showShortcuts();
      case 'save-exit': this.closePopup(); return this.confirmExit();
      case 'close-popup': return this.closePopup();
    }
  }

  onKey(e) {
    if (!['module', 'review'].includes(this.state.stage) || this.root.querySelector('.bb-modal')) return;
    const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName);
    if (e.key === 'Escape') { this.closePopup(); this.tools.hideToolbar(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (e.key === 'ArrowRight') { this.next(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { this.back(); e.preventDefault(); }
    else if (this.state.stage === 'module' && this.q.type === 'mcq' && 'abcd'.includes(k) && k) {
      const L = k.toUpperCase();
      if (e.shiftKey) this.strike(L, !(this.resp().elim || []).includes(L)); else this.choose(L);
    } else if (k === 'm' && this.state.stage === 'module') { this.resp().mark = !this.resp().mark; this.save(); this.renderBody(); }
  }

  /* ---------- popups & modals ---------- */
  togglePopup(name, anchor) {
    if (this.popup === name) return this.closePopup();
    this.closePopup();
    this.popup = name;
    anchor.classList.add('open');
    const layer = this.root.querySelector('.bb-pop-layer');
    const p = document.createElement('div');
    p.className = 'bb-pop pop-' + name;
    if (name === 'nav') {
      p.innerHTML = `<button class="pop-x" data-act="close-popup" aria-label="Close">${icon('close', 20)}</button>
        ${this.navGridHtml(true)}
        <div class="nav-foot"><button class="bb-btn-outline" data-act="review-page">Go to Review Page</button></div>`;
    } else if (name === 'more') {
      p.innerHTML = `
        <button class="pop-item" data-act="help">${icon('help', 18)} Help</button>
        <button class="pop-item" data-act="shortcuts">${icon('keyboard', 18)} Keyboard Shortcuts</button>
        <button class="pop-item" data-act="line-reader">${icon('reader', 18)} Line Reader</button>
        <hr><button class="pop-item" data-act="save-exit">${icon('exit', 18)} Save and Exit</button>`;
    } else {
      p.innerHTML = `<div class="dir-body">${DIRECTIONS[this.sec.id] || ''}</div>
        <div class="dir-foot"><button class="bb-btn" data-act="close-popup">Close</button></div>`;
    }
    layer.appendChild(p);
    renderMath(p);
    const r = anchor.getBoundingClientRect();
    if (name === 'nav') {
      p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, r.left + r.width / 2 - p.offsetWidth / 2)) + 'px';
      p.style.bottom = (innerHeight - r.top + 14) + 'px';
    } else if (name === 'more') {
      p.style.right = Math.max(8, innerWidth - r.right) + 'px';
      p.style.top = (r.bottom + 8) + 'px';
    } else {
      p.style.left = '16px'; p.style.top = (r.bottom + 10) + 'px';
    }
  }

  closePopup() {
    this.popup = null;
    this.root.querySelector('.bb-pop-layer')?.replaceChildren();
    this.root.querySelectorAll('[data-act].open').forEach((b) => b.classList.remove('open'));
  }

  modal({ title, body, actions, dismissable = true, wide = false }) {
    const wrap = document.createElement('div');
    wrap.className = 'bb-modal';
    wrap.innerHTML = `<div class="bb-modal-card ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <h2>${esc(title)}</h2><div class="bb-modal-body">${body}</div>
      <div class="bb-modal-act">${actions.map((a, i) => `<button class="${a.primary ? 'bb-btn' : 'bb-btn-outline'}" data-mi="${i}">${esc(a.label)}</button>`).join('')}</div></div>`;
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mi]');
      if (b) { wrap.remove(); actions[+b.dataset.mi].run(); }
      else if (dismissable && e.target === wrap) wrap.remove();
    });
    (this.root.querySelector('.bb') || this.root).appendChild(wrap);
    renderMath(wrap);
    wrap.querySelector('.bb-btn')?.focus();
  }

  confirmExit() {
    this.modal({
      title: 'Save and exit?',
      body: '<p>Your answers and remaining time are saved. The clock stops until you come back — resume any time from your dashboard.</p>',
      actions: [
        { label: 'Keep testing', run: () => {} },
        { label: 'Save and Exit', primary: true, run: () => { this.stopTimer(); this.save(true); this.onExit(); } },
      ],
    });
  }

  showHelp() {
    this.modal({
      title: 'Help', wide: true, actions: [{ label: 'Close', primary: true, run: () => {} }],
      body: `<dl class="help-list">
        <dt>${icon('clock', 18)} Timer</dt><dd>Shows the time left in this module. Hide it if it distracts you; it reappears for the last 5 minutes.</dd>
        <dt>${icon('pen', 18)} Highlights &amp; Notes</dt><dd>Select words in a passage or question. A small toolbar appears: pick a color, underline, or add a note. Click a highlight to change or remove it.</dd>
        <dt><span class="abc-mini">ABC</span> Answer eliminator</dt><dd>Turn it on to cross out choices you've ruled out. Click <b>Undo</b> to bring a choice back.</dd>
        <dt>${icon('bookmark', 18)} Mark for Review</dt><dd>Flags a question so you can find it quickly from the question list at the bottom.</dd>
        <dt>${icon('calc', 18)} Calculator &amp; ${icon('sigma', 18)} Reference</dt><dd>Math only. Drag the title bar to move the window, the corner to resize it.</dd>
        <dt>${icon('reader', 18)} Line Reader</dt><dd>More → Line Reader. Drag the handle to move the reading band.</dd>
        <dt>${icon('exit', 18)} Save and Exit</dt><dd>More → Save and Exit pauses the clock. Resume later from your dashboard.</dd></dl>`,
    });
  }

  showShortcuts() {
    this.modal({
      title: 'Keyboard Shortcuts', actions: [{ label: 'Close', primary: true, run: () => {} }],
      body: `<table class="keys">
        <tr><td><kbd>→</kbd></td><td>Next question</td></tr>
        <tr><td><kbd>←</kbd></td><td>Previous question</td></tr>
        <tr><td><kbd>A</kbd> <kbd>B</kbd> <kbd>C</kbd> <kbd>D</kbd></td><td>Choose an answer</td></tr>
        <tr><td><kbd>Shift</kbd> + <kbd>A</kbd>–<kbd>D</kbd></td><td>Cross out / restore a choice</td></tr>
        <tr><td><kbd>M</kbd></td><td>Mark for review</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>Close a menu</td></tr></table>`,
    });
  }

  flash(msg) {
    const host = this.root.querySelector('.bb') || this.root;
    const f = document.createElement('div');
    f.className = 'bb-flash';
    f.textContent = msg;
    host.appendChild(f);
    setTimeout(() => f.classList.add('out'), 3500);
    setTimeout(() => f.remove(), 4000);
  }
}

export { LETTERS };
