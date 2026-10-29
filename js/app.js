// Pages and routing (#/path). The exam itself lives in js/exam/.
import { CONFIG, DEMO_MODE } from './config.js';
import * as auth from './auth.js';
import * as store from './store.js';
import { loadCatalog, loadTest, registerTempTest, validateTest, modeSeconds, questionCount, DOMAINS, MODULE_KEYS } from './content.js';
import { buildResult, answerLabel } from './scoring.js';
import { Exam } from './exam/exam.js';
import { questionHtml, leftPaneHtml, isSplit } from './exam/render.js';
import { esc, icon, uid, fmtDate, fmtMinutes, renderMath, toast, confirmDialog } from './util.js';

const app = document.getElementById('app');
let exam = null;          // running Exam instance

/* ---------------- routing ---------------- */
const routes = [
  ['/login', pageLogin, { public: true }],
  ['/signup', pageSignup, { public: true }],
  ['/forgot', pageForgot, { public: true }],
  ['/reset', pageReset],
  ['/', pageDashboard],
  ['/test/:id', pageTest],
  ['/exam/:id', pageExam],
  ['/results/:id', pageResults],
  ['/review/:id/:qid', pageReview],
  ['/account', pageAccount],
  ['/upgrade', pageUpgrade],
  ['/admin', pageAdmin, { admin: true }],
  ['/preview/:test/:sec/:mod', pagePreview, { admin: true }],
];

function match(path) {
  for (const [pattern, fn, opts = {}] of routes) {
    const p = pattern.split('/'), a = path.split('/');
    if (p.length !== a.length) continue;
    const params = {};
    if (p.every((seg, i) => (seg.startsWith(':') ? (params[seg.slice(1)] = decodeURIComponent(a[i]), true) : seg === a[i])))
      return { fn, params, opts };
  }
  return null;
}

export const go = (path) => { location.hash = '#' + path; };

async function router() {
  if (exam) { exam.destroy(); exam = null; }
  const path = location.hash.slice(1) || '/';
  const m = match(path.split('?')[0]);
  const user = auth.currentUser();
  if (!m) return go('/');
  if (!m.opts.public && !user) { sessionStorage.setItem('sat:after-login', path); return go('/login'); }
  if (m.opts.public && user) return go('/');
  if (m.opts.admin && !auth.isAdmin()) return go('/');
  window.scrollTo(0, 0);
  try { await m.fn(m.params); }
  catch (e) {
    console.error(e);
    app.innerHTML = layout(`<div class="empty"><h2>Something went wrong</h2><p>${esc(e.message)}</p><a class="btn primary" href="#/">Back to dashboard</a></div>`);
  }
}

/* ---------------- layout ---------------- */
function layout(body, active = '') {
  const u = auth.currentUser();
  const nav = (href, label, key) => `<a href="#${href}" class="${active === key ? 'active' : ''}">${label}</a>`;
  return `
  ${DEMO_MODE ? '<div class="demo-bar">Demo mode — accounts and scores are saved only in this browser. Connect Supabase in <code>js/config.js</code> to go live.</div>' : ''}
  <header class="topbar"><div class="topbar-in">
    <a class="brand" href="#/"><span class="brand-mark"><img src="img/logo.svg" alt=""></span><span>${esc(CONFIG.brand.name)}</span></a>
    <nav class="topnav">${nav('/', 'Practice', 'home')}${nav('/account', 'Account', 'account')}${auth.isAdmin() ? nav('/admin', 'Admin', 'admin') : ''}</nav>
    <div class="topbar-user">
      ${CONFIG.paywallEnabled && u?.plan !== 'premium' ? '<a class="btn small gold" href="#/upgrade">Upgrade</a>' : ''}
      <span class="avatar" title="${esc(u?.email)}">${esc((u?.name || '?').trim()[0]?.toUpperCase() || '?')}</span>
      <button class="link" data-signout>Sign out</button>
    </div>
  </div></header>
  <main class="page">${body}</main>`;
}

document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-signout]')) { await auth.signOut(); go('/login'); }
});

const canAccess = (meta, u = auth.currentUser()) =>
  !CONFIG.paywallEnabled || meta.access !== 'premium' || u?.plan === 'premium' || auth.isAdmin(u);

/* ---------------- auth pages ---------------- */
function authShell(title, sub, form) {
  return `
  ${DEMO_MODE ? '<div class="demo-bar">Demo mode — accounts are saved only in this browser.</div>' : ''}
  <div class="auth">
    <aside class="auth-side">
      <a class="brand light" href="#/login"><span class="brand-mark"><img src="img/logo.svg" alt=""></span><span>${esc(CONFIG.brand.name)}</span></a>
      <h2>${esc(CONFIG.brand.tagline)}</h2>
      <ul class="auth-points">
        <li>${icon('clock', 20)} Real Digital SAT timing — 2 modules per section</li>
        <li>${icon('chart', 20)} Adaptive Module 2, scored 400–1600</li>
        <li>${icon('calc', 20)} Built-in Desmos calculator & reference sheet</li>
        <li>${icon('pen', 20)} Highlights, notes, answer eliminator, mark for review</li>
      </ul>
    </aside>
    <section class="auth-main"><div class="auth-card">
      <h1>${title}</h1><p class="muted">${sub}</p>${form}
    </div></section>
  </div>`;
}

const googleBtn = () => (!DEMO_MODE && CONFIG.enableGoogleLogin
  ? `<button type="button" class="btn google" data-google><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg> Continue with Google</button>
     <div class="or"><span>or</span></div>` : '');

function bindForm(onSubmit) {
  const f = app.querySelector('form');
  const errEl = f.querySelector('.form-err');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.textContent = '';
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try { await onSubmit(Object.fromEntries(new FormData(f))); }
    catch (err) { errEl.textContent = err.message || String(err); }
    finally { btn.disabled = false; }
  });
  app.querySelector('[data-google]')?.addEventListener('click', () => auth.signInWithGoogle().catch((e) => (errEl.textContent = e.message)));
  app.querySelectorAll('[data-reveal]').forEach((b) => b.addEventListener('click', () => {
    const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password';
    b.textContent = i.type === 'password' ? 'Show' : 'Hide';
  }));
}

const afterLogin = () => { const p = sessionStorage.getItem('sat:after-login') || '/'; sessionStorage.removeItem('sat:after-login'); go(p); };

function pageLogin() {
  app.innerHTML = authShell('Sign in', 'Welcome back! Pick up where you left off.', `
    ${googleBtn()}
    <form novalidate>
      <label>E-mail<input name="email" type="email" autocomplete="email" required></label>
      <label>Password<span class="pw"><input name="password" type="password" autocomplete="current-password" required><button type="button" class="link" data-reveal>Show</button></span></label>
      <div class="form-row"><a href="#/forgot">Forgot password?</a></div>
      <div class="form-err" role="alert"></div>
      <button class="btn primary block" type="submit">Sign in</button>
    </form>
    <p class="auth-alt">New here? <a href="#/signup">Create a free account</a></p>`);
  bindForm(async ({ email, password }) => {
    if (!email || !password) throw new Error('Enter your e-mail and password.');
    await auth.signIn({ email, password });
    afterLogin();
  });
}

function pageSignup() {
  app.innerHTML = authShell('Create your account', 'Free — takes 30 seconds.', `
    ${googleBtn()}
    <form novalidate>
      <label>Name<input name="name" autocomplete="name" required placeholder="Name shown on your test screen"></label>
      <label>E-mail<input name="email" type="email" autocomplete="email" required></label>
      <label>Password<span class="pw"><input name="password" type="password" autocomplete="new-password" minlength="8" required placeholder="At least 8 characters"><button type="button" class="link" data-reveal>Show</button></span></label>
      <div class="form-err" role="alert"></div>
      <button class="btn primary block" type="submit">Create account</button>
    </form>
    <p class="auth-alt">Already have an account? <a href="#/login">Sign in</a></p>`);
  bindForm(async ({ name, email, password }) => {
    if (!name.trim()) throw new Error('Enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid e-mail address.');
    if (password.length < 8) throw new Error('Use at least 8 characters for the password.');
    const { needsConfirm } = await auth.signUp({ name, email, password });
    if (needsConfirm) {
      app.querySelector('.auth-card').innerHTML = `<h1>Check your e-mail</h1>
        <p>We sent a confirmation link to <b>${esc(email)}</b>. Click it, then come back and sign in.</p>
        <a class="btn primary block" href="#/login">Back to sign in</a>`;
    } else { toast('Welcome! Your account is ready.', 'ok'); afterLogin(); }
  });
}

function pageForgot() {
  app.innerHTML = authShell('Reset password', "Enter your e-mail and we'll send you a reset link.", `
    <form novalidate>
      <label>E-mail<input name="email" type="email" autocomplete="email" required></label>
      <div class="form-err" role="alert"></div>
      <button class="btn primary block" type="submit">Send reset link</button>
    </form>
    <p class="auth-alt"><a href="#/login">Back to sign in</a></p>`);
  bindForm(async ({ email }) => {
    await auth.sendPasswordReset(email);
    app.querySelector('.auth-card').innerHTML = `<h1>Check your e-mail</h1><p>If an account exists for <b>${esc(email)}</b>, a reset link is on its way.</p><a class="btn primary block" href="#/login">Back to sign in</a>`;
  });
}

function pageReset() {
  app.innerHTML = layout(`<div class="narrow card"><h1>Choose a new password</h1>
    <form novalidate><label>New password<input name="password" type="password" minlength="8" required></label>
    <div class="form-err" role="alert"></div><button class="btn primary" type="submit">Save password</button></form></div>`);
  bindForm(async ({ password }) => {
    if (password.length < 8) throw new Error('Use at least 8 characters.');
    await auth.updatePassword(password);
    toast('Password updated.', 'ok'); go('/');
  });
}

/* ---------------- dashboard ---------------- */
const modeLabel = { full: 'Full test', rw: 'Reading and Writing', math: 'Math' };

async function pageDashboard() {
  const u = auth.currentUser();
  const [catalog, attempts] = await Promise.all([loadCatalog(), store.listAttempts(u.id)]);
  const done = attempts.filter((a) => a.status === 'completed');
  const inProg = attempts.filter((a) => a.status === 'in_progress');
  const full = done.filter((a) => a.result?.fullTest);
  const best = full.length ? Math.max(...full.map((a) => a.result.total)) : null;
  const last = full[0]?.result.total ?? null;

  const resume = inProg.map((a) => `
    <div class="resume-card">
      <div><div class="eyebrow">Continue where you left off</div>
      <h3>${esc(a.testTitle)} <span class="chip">${modeLabel[a.mode]}</span></h3>
      <p class="muted">${progressText(a)} · last saved ${fmtDate(a.updatedAt)}</p></div>
      <div class="resume-act"><button class="btn ghost small" data-discard="${a.id}">Discard</button>
      <a class="btn primary" href="#/exam/${a.id}">${icon('play', 16)} Resume</a></div>
    </div>`).join('');

  const cards = catalog.map((t) => {
    const locked = !canAccess(t);
    return `<a class="test-card ${locked ? 'locked' : ''}" href="#${locked ? '/upgrade' : '/test/' + t.id}">
      <div class="test-card-top">
        <span class="chip ${t.kind === 'tour' ? 'teal' : ''}">${t.kind === 'tour' ? 'Quick tour' : 'Full-length'}</span>
        ${CONFIG.paywallEnabled ? (t.access === 'premium' ? `<span class="chip gold">${icon('lock', 12)} Premium</span>` : '<span class="chip green">Free</span>') : ''}
      </div>
      <h3>${esc(t.title)}</h3><p>${esc(t.description || '')}</p>
      <div class="test-card-foot"><span>${esc(t.duration || '')}</span>
      <span class="go">${locked ? 'Unlock' : 'Open'} →</span></div></a>`;
  }).join('');

  app.innerHTML = layout(`
    <section class="hello">
      <div><h1>Hi, ${esc(u.name.split(' ')[0])} 👋</h1><p class="muted">Practice in the same format as the Bluebook™ Digital SAT.</p></div>
      <div class="stats">
        <div class="stat"><b>${done.length}</b><span>Completed</span></div>
        <div class="stat"><b>${best ?? '—'}</b><span>Best total</span></div>
        <div class="stat"><b>${last ?? '—'}</b><span>Latest total</span></div>
      </div>
    </section>
    ${resume}
    <h2 class="h-sec">Practice tests</h2>
    <div class="test-grid">${cards || '<p class="muted">No tests yet.</p>'}</div>
    <h2 class="h-sec">My results</h2>
    ${done.length ? resultsTable(done) : `<div class="empty small"><p>Your score reports will appear here after you finish a test.</p></div>`}
  `, 'home');

  app.querySelectorAll('[data-discard]').forEach((b) => b.addEventListener('click', async () => {
    if (await confirmDialog({ title: 'Discard this attempt?', body: '<p>Your answers for this unfinished test will be deleted.</p>', ok: 'Discard', danger: true })) {
      await store.deleteAttempt(u.id, b.dataset.discard); pageDashboard();
    }
  }));
}

function progressText(a) {
  const s = a.state;
  if (s.stage === 'intro') return 'Not started';
  if (s.stage === 'break') return 'On break';
  const sec = s.plan[s.secIdx] === 'rw' ? 'Reading and Writing' : 'Math';
  return `${sec}, Module ${s.modIdx + 1}`;
}

function resultsTable(list) {
  return `<div class="table-wrap"><table class="tbl">
    <thead><tr><th>Date</th><th>Test</th><th>Type</th><th class="num">R&amp;W</th><th class="num">Math</th><th class="num">Total</th><th></th></tr></thead>
    <tbody>${list.map((a) => {
      const r = a.result;
      return `<tr data-href="#/results/${a.id}">
        <td>${fmtDate(a.completedAt)}</td><td>${esc(a.testTitle)}</td><td>${modeLabel[a.mode]}</td>
        <td class="num">${r.sections.rw?.scaled ?? '—'}</td><td class="num">${r.sections.math?.scaled ?? '—'}</td>
        <td class="num"><b>${r.fullTest ? r.total : '—'}</b></td><td class="num"><a href="#/results/${a.id}">Report →</a></td></tr>`;
    }).join('')}</tbody></table></div>`;
}
document.addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-href]');
  if (tr && !e.target.closest('a,button')) location.hash = tr.dataset.href;
});

/* ---------------- test detail ---------------- */
async function pageTest({ id }) {
  const u = auth.currentUser();
  const meta = (await loadCatalog()).find((t) => t.id === id);
  if (!meta) return go('/');
  if (!canAccess(meta)) return go('/upgrade');
  const [test, attempts] = await Promise.all([loadTest(id), store.listAttempts(u.id)]);
  const mine = attempts.filter((a) => a.testId === id);
  const has = (s) => test.sections.some((x) => x.id === s);
  const opts = [
    has('rw') && has('math') && { mode: 'full', title: 'Full test', desc: `Reading and Writing, ${fmtMinutes(test.breakSeconds)} break, then Math`, secs: ['rw', 'math'] },
    has('rw') && { mode: 'rw', title: 'Reading and Writing only', desc: `${questionCount(test, 'rw')} questions in 2 modules`, secs: ['rw'] },
    has('math') && { mode: 'math', title: 'Math only', desc: `${questionCount(test, 'math')} questions in 2 modules`, secs: ['math'] },
  ].filter(Boolean);

  app.innerHTML = layout(`
    <a class="crumb" href="#/">← Practice tests</a>
    <div class="test-hero"><h1>${esc(test.title)}</h1><p class="muted">${esc(meta.description || '')}</p></div>
    <div class="detail">
      <div class="card">
        <h3>Choose what to practice</h3>
        <div class="modes">${opts.map((o, i) => `
          <label class="mode"><input type="radio" name="mode" value="${o.mode}" ${i === 0 ? 'checked' : ''}>
            <span class="mode-in"><b>${o.title}</b><span>${o.desc}</span><em>${fmtMinutes(modeSeconds(test, o.secs) + (o.mode === 'full' ? test.breakSeconds : 0))}</em></span></label>`).join('')}
        </div>
        <button class="btn primary big block" data-start>${icon('play', 18)} Start practice</button>
        <p class="muted small center">Tip: use a computer or tablet and find a quiet place, like on test day.</p>
      </div>
      <div class="card">
        <h3>What to expect</h3>
        <ul class="checks">
          <li>${icon('check', 18)} The same screen layout and tools as the Bluebook app</li>
          <li>${icon('check', 18)} Module 2 adapts to how you did in Module 1</li>
          <li>${icon('check', 18)} Each module is timed separately; time's up = next module</li>
          <li>${icon('check', 18)} Save and exit any time — the clock pauses</li>
          <li>${icon('check', 18)} A full score report with every answer explained</li>
        </ul>
        ${mine.length ? `<h3 class="mt">Your attempts</h3><ul class="attempt-list">${mine.map((a) => `<li>
          <span>${modeLabel[a.mode]} · ${fmtDate(a.updatedAt)}</span>
          ${a.status === 'completed' ? `<a href="#/results/${a.id}">${a.result.fullTest ? a.result.total : Object.values(a.result.sections)[0].scaled} · Report →</a>` : `<a href="#/exam/${a.id}">Resume →</a>`}</li>`).join('')}</ul>` : ''}
      </div>
    </div>`, 'home');

  app.querySelector('[data-start]').addEventListener('click', async () => {
    const mode = app.querySelector('input[name=mode]:checked').value;
    const open = mine.find((a) => a.status === 'in_progress' && a.mode === mode);
    if (open && await confirmDialog({ title: 'You have an unfinished attempt', body: '<p>Resume it, or start over from the beginning?</p>', ok: 'Resume', cancel: 'Start over' })) return go('/exam/' + open.id);
    if (open) await store.deleteAttempt(u.id, open.id);
    const a = newAttempt(test, mode, u);
    store.saveAttempt(a, { immediate: true });
    go('/exam/' + a.id);
  });
}

function newAttempt(test, mode, user, forced = null, sectionId = null) {
  const now = new Date().toISOString();
  const plan = forced ? [sectionId] : mode === 'full' ? test.sections.map((s) => s.id) : [mode];
  return {
    id: uid(), userId: user.id, testId: test.id, testTitle: test.title, mode,
    status: 'in_progress', createdAt: now, updatedAt: now, result: null,
    state: { plan, secIdx: 0, modIdx: 0, qIdx: 0, stage: 'intro', remaining: null, breakRemaining: null, modules: {}, responses: {}, notes: {}, forced },
  };
}

/* ---------------- exam ---------------- */
async function pageExam({ id }) {
  const u = auth.currentUser();
  const attempt = await store.getAttempt(u.id, id);
  if (!attempt) return go('/');
  if (attempt.status === 'completed') return go('/results/' + id);
  const test = await loadTest(attempt.testId);
  app.innerHTML = '<div class="exam-root"></div>';
  exam = new Exam(app.firstElementChild, {
    test, attempt, user: u,
    save: store.saveAttempt,
    onExit: () => { toast('Saved. Resume any time from your dashboard.', 'ok'); go('/'); },
    onFinish: (a) => {
      a.status = 'completed';
      a.completedAt = new Date().toISOString();
      a.result = buildResult(test, a.state);
      store.saveAttempt(a, { immediate: true });
      go('/results/' + a.id + '?done=1');
    },
  });
  exam.start();
}

async function pagePreview({ test: testId, sec, mod }) {
  const u = auth.currentUser();
  const test = await loadTest(testId);
  const a = newAttempt(test, sec, u, mod, sec);
  app.innerHTML = '<div class="exam-root"></div>';
  exam = new Exam(app.firstElementChild, {
    test, attempt: a, user: u, preview: true, save: () => {},
    onExit: () => go('/admin'),
    onFinish: (x) => {
      const r = buildResult(test, x.state).sections[sec];
      toast(`Preview finished: ${r.raw} of ${r.maxRaw} correct.`, 'ok');
      go('/admin');
    },
  });
  exam.start();
}

/* ---------------- results ---------------- */
async function pageResults({ id }) {
  const u = auth.currentUser();
  const a = await store.getAttempt(u.id, id);
  if (!a || a.status !== 'completed') return go('/');
  const r = a.result;
  const justDone = location.hash.includes('done=1');
  const secIds = Object.keys(r.sections);
  const secCard = (sid) => {
    const s = r.sections[sid];
    const doms = (DOMAINS[sid] || Object.keys(s.domains)).filter((d) => s.domains[d]).map((d) => {
      const x = s.domains[d], pct = Math.round((x.correct / x.total) * 100);
      return `<div class="dom"><div class="dom-top"><span>${esc(d)}</span><b>${x.correct}/${x.total}</b></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
    }).join('');
    return `<div class="card sec-card"><div class="sec-score"><span>${esc(s.title)}</span><b>${s.scaled}</b><small>200–800</small></div>
      <div class="sec-meta"><span>${s.raw} of ${s.maxRaw} correct</span>
      ${s.route !== 'm2' ? `<span class="chip ${s.route === 'm2_hard' ? '' : 'teal'}">Module 2: ${s.route === 'm2_hard' ? 'Harder' : 'Easier'}</span>` : ''}</div>
      <h4>Performance by content domain</h4>${doms}</div>`;
  };

  app.innerHTML = layout(`
    <a class="crumb" href="#/">← Dashboard</a>
    ${justDone ? `<div class="finished"><h1>You're All Finished!</h1><p>Great work. Here's how you did — review every question below.</p></div>` : ''}
    <div class="score-hero">
      <div><div class="eyebrow">${esc(a.testTitle)} · ${modeLabel[a.mode]} · ${fmtDate(a.completedAt)}</div>
        <h2>${r.fullTest ? 'Your Total Score' : `Your ${esc(r.sections[secIds[0]].title)} Score`}</h2>
        ${r.estimated ? '<p class="muted small">Estimated score: this test has no official conversion table yet.</p>' : ''}</div>
      <div class="total"><b>${r.fullTest ? r.total : r.sections[secIds[0]].scaled}</b><span>${r.fullTest ? '400–1600' : '200–800'}</span></div>
    </div>
    <div class="sec-cards">${secIds.map(secCard).join('')}</div>
    <div class="card">
      <div class="qhead"><h3>Questions</h3>
        <div class="seg" role="tablist">${['All', 'Incorrect', 'Unanswered', 'Marked'].map((f, i) => `<button class="${i ? '' : 'on'}" data-filter="${f}">${f}</button>`).join('')}</div></div>
      ${secIds.map((sid) => [1, 2].map((m) => {
        const items = r.items.filter((x) => x.section === sid && x.moduleNo === m);
        if (!items.length) return '';
        return `<h4 class="mod-h">${esc(r.sections[sid].title)} · Module ${m}</h4>
        <div class="q-cells">${items.map((x) => `<a class="q-cell ${x.correct ? 'ok' : x.answered ? 'bad' : 'skip'} ${x.marked ? 'mk' : ''}" data-ok="${x.correct}" data-ans="${x.answered}" data-mk="${x.marked}"
          href="#/review/${a.id}/${encodeURIComponent(x.qid)}" title="${esc(x.domain)}${x.pretest ? ' (unscored)' : ''}">${x.no}</a>`).join('')}</div>`;
      }).join('')).join('')}
      <p class="legend"><span class="q-cell ok sm"></span> Correct <span class="q-cell bad sm"></span> Incorrect <span class="q-cell skip sm"></span> Not answered <span class="q-cell mk sm"></span> Marked for review</p>
    </div>
    <div class="center mt"><a class="btn primary" href="#/test/${a.testId}">Practice again</a></div>
  `, 'home');

  app.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    app.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('on', x === b));
    const f = b.dataset.filter;
    app.querySelectorAll('.q-cells .q-cell').forEach((c) => {
      const show = f === 'All' || (f === 'Incorrect' && c.dataset.ok === 'false' && c.dataset.ans === 'true')
        || (f === 'Unanswered' && c.dataset.ans === 'false') || (f === 'Marked' && c.dataset.mk === 'true');
      c.classList.toggle('dim', !show);
    });
  }));
}

/* ---------------- answer review ---------------- */
async function pageReview({ id, qid }) {
  const u = auth.currentUser();
  const a = await store.getAttempt(u.id, id);
  if (!a?.result) return go('/');
  const test = await loadTest(a.testId);
  const items = a.result.items;
  const idx = items.findIndex((x) => x.qid === qid);
  if (idx < 0) return go('/results/' + id);
  const it = items[idx];
  const q = test.sections.find((s) => s.id === it.section).modules[it.module].questions.find((x) => x.id === qid);
  const r = { ...(a.state.responses[qid] || {}), correct: it.correct, answered: it.answered };
  const qHtml = questionHtml(q, r, { review: true, number: it.no });
  const prev = items[idx - 1], next = items[idx + 1];
  const link = (x) => `#/review/${id}/${encodeURIComponent(x.qid)}`;

  app.innerHTML = layout(`
    <div class="review-top">
      <a class="crumb" href="#/results/${id}">← Score report</a>
      <div class="review-pos">${esc(a.result.sections[it.section].title)} · Module ${it.moduleNo} · Question ${it.no}</div>
      <div class="review-nav">
        ${prev ? `<a class="btn ghost small" href="${link(prev)}">← Previous</a>` : ''}
        ${next ? `<a class="btn primary small" href="${link(next)}">Next →</a>` : ''}
      </div>
    </div>
    <div class="review-frame bb-static">
      ${q.passage ? `<div class="bb-split" style="--split:50%"><section class="bb-pane bb-left">${leftPaneHtml(q)}</section><div class="bb-divider"></div><section class="bb-pane bb-right">${qHtml}</section></div>`
        : `<div class="bb-single"><section class="bb-pane">${qHtml}</section></div>`}
    </div>
    <div class="card explain">
      <h3>Explanation</h3>
      <div class="explain-meta">${[it.domain, it.skill, it.difficulty && { E: 'Easy', M: 'Medium', H: 'Hard' }[it.difficulty]].filter(Boolean).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}
        ${it.pretest ? '<span class="chip teal">Unscored question</span>' : ''}</div>
      <p><b>Correct answer: ${esc(answerLabel(q))}</b></p>
      <div class="explain-body">${q.explanation || '<p class="muted">An explanation for this question hasn\'t been added yet.</p>'}</div>
    </div>`, 'home');
  renderMath(app);
}

/* ---------------- account & upgrade ---------------- */
function pageAccount() {
  const u = auth.currentUser();
  app.innerHTML = layout(`
    <h1>Account</h1>
    <div class="detail">
      <div class="card"><h3>Profile</h3>
        <form novalidate>
          <label>Name<input name="name" value="${esc(u.name)}" required></label>
          <label>E-mail<input value="${esc(u.email)}" disabled></label>
          <div class="form-err" role="alert"></div>
          <button class="btn primary" type="submit">Save</button>
        </form></div>
      <div class="card"><h3>Plan</h3>
        <p class="plan-line"><span class="chip ${u.plan === 'premium' ? 'gold' : 'green'}">${u.plan === 'premium' ? 'Premium' : 'Free'}</span>
        ${CONFIG.paywallEnabled ? '' : 'All practice tests are free right now.'}</p>
        ${CONFIG.paywallEnabled && u.plan !== 'premium' ? '<a class="btn gold" href="#/upgrade">See Premium</a>' : ''}
        ${!DEMO_MODE ? '<h3 class="mt">Password</h3><a href="#/reset">Change password</a>' : ''}
      </div>
    </div>`, 'account');
  bindForm(async ({ name }) => {
    if (!name.trim()) throw new Error('Enter your name.');
    await auth.updateName(name); toast('Saved.', 'ok'); pageAccount();
  });
}

function pageUpgrade() {
  const u = auth.currentUser();
  app.innerHTML = layout(`
    <div class="center"><h1>Plans</h1><p class="muted">Paid plans are coming soon. Everything below is a placeholder.</p></div>
    <div class="plans">
      <div class="card plan"><h3>Free</h3><div class="price">$0</div>
        <ul class="checks"><li>${icon('check', 18)} Free practice tests</li><li>${icon('check', 18)} Full score reports</li><li>${icon('check', 18)} All test-day tools</li></ul>
        ${u.plan !== 'premium' ? '<button class="btn ghost block" disabled>Current plan</button>' : ''}</div>
      <div class="card plan best"><div class="ribbon">Coming soon</div><h3>Premium</h3><div class="price">—</div>
        <ul class="checks"><li>${icon('check', 18)} Every practice test</li><li>${icon('check', 18)} Video explanations</li><li>${icon('check', 18)} Progress tracking across tests</li></ul>
        <button class="btn gold block" disabled>Payments not connected yet</button></div>
    </div>`, 'account');
}

/* ---------------- admin ---------------- */
async function pageAdmin() {
  const catalog = await loadCatalog();
  const tests = await Promise.all(catalog.map((m) => loadTest(m.id).then((t) => ({ m, t })).catch((e) => ({ m, err: e.message }))));
  let students = '';
  try { students = await studentsHtml(); } catch (e) { students = `<p class="form-err">${esc(e.message)}</p>`; }

  app.innerHTML = layout(`
    <h1>Admin</h1>
    <div class="card">
      <h3>Content</h3>
      <p class="muted small">Tests come from <code>content/catalog.json</code> and <code>content/tests/*.json</code> (format: <code>content/FORMAT.md</code>). Preview any module exactly as students see it.</p>
      <div class="admin-tests">${tests.map(({ m, t, err }) => err ? `<div class="admin-test"><b>${esc(m.title)}</b><p class="form-err">${esc(err)}</p></div>` : adminTestHtml(t)).join('')}</div>
      <h3 class="mt">Check a new test file</h3>
      <p class="muted small">Pick a test .json file to validate it and preview it. Nothing is uploaded or saved.</p>
      <input type="file" accept=".json,application/json" data-upload>
      <div data-upload-out></div>
    </div>
    <div class="card"><h3>Students</h3>${students}</div>`, 'admin');

  app.querySelector('[data-upload]').addEventListener('change', async (e) => {
    const out = app.querySelector('[data-upload-out]');
    try {
      const t = registerTempTest(JSON.parse(await e.target.files[0].text()));
      out.innerHTML = adminTestHtml(t);
    } catch (err) { out.innerHTML = `<p class="form-err">Could not read the file: ${esc(err.message)}</p>`; }
  });
  app.querySelectorAll('[data-plan]').forEach((s) => s.addEventListener('change', async () => {
    try {
      if (DEMO_MODE) auth.demoSetPlan(s.dataset.plan, s.value); else await store.setPlan(s.dataset.plan, s.value);
      toast('Plan updated.', 'ok');
    } catch (e) { toast(e.message, 'bad'); }
  }));
}

function adminTestHtml(t) {
  const issues = validateTest(t);
  const errs = issues.filter((i) => i.level === 'error'), warns = issues.filter((i) => i.level === 'warn');
  return `<div class="admin-test">
    <div class="admin-test-h"><b>${esc(t.title)}</b>
      <span class="chip ${errs.length ? 'red' : 'green'}">${errs.length ? errs.length + ' errors' : 'No errors'}</span>
      ${warns.length ? `<span class="chip gold">${warns.length} warnings</span>` : ''}</div>
    ${issues.length ? `<details><summary>Show ${issues.length} issue${issues.length > 1 ? 's' : ''}</summary><ul class="issues">${issues.map((i) => `<li class="${i.level}">${esc(i.msg)}</li>`).join('')}</ul></details>` : ''}
    <div class="admin-prev">${t.sections.map((s) => `<span>${esc(s.title)}:</span>${MODULE_KEYS.filter((k) => s.modules[k]).map((k) =>
      `<a class="btn ghost small" href="#/preview/${encodeURIComponent(t.id)}/${s.id}/${k}">${k.replace('m2_', 'M2 ').replace('m1', 'M1').replace('m2', 'M2')} (${s.modules[k].questions.length})</a>`).join('')}`).join('<br>')}</div>
  </div>`;
}

async function studentsHtml() {
  const attempts = await store.listAllAttempts();
  const users = DEMO_MODE ? auth.demoUsers() : await store.listProfiles();
  if (!users.length) return '<p class="muted">No students yet.</p>';
  const rows = users.map((s) => {
    const mine = attempts.filter((a) => a.userId === s.id);
    const done = mine.filter((a) => a.status === 'completed').sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    const last = done[0]?.result;
    return `<tr><td>${esc(s.name || '')}</td><td>${esc(s.email)}</td><td class="num">${done.length}</td>
      <td class="num">${last ? (last.fullTest ? last.total : Object.values(last.sections)[0].scaled) : '—'}</td>
      <td><select data-plan="${esc(DEMO_MODE ? s.email : s.id)}">${['free', 'premium'].map((p) => `<option ${s.plan === p ? 'selected' : ''}>${p}</option>`).join('')}</select></td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="tbl"><thead><tr><th>Name</th><th>E-mail</th><th class="num">Tests done</th><th class="num">Latest score</th><th>Plan</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${DEMO_MODE ? '<p class="muted small">Demo mode lists only accounts created in this browser.</p>' : ''}`;
}

/* ---------------- boot ---------------- */
(async () => {
  document.title = CONFIG.brand.name;
  await auth.initAuth();
  auth.onAuthChange((u) => { if (!u && !location.hash.match(/login|signup|forgot/)) go('/login'); });
  window.addEventListener('hashchange', router);
  router();
})();
