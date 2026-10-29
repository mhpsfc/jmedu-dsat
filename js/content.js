// Loads tests from /content. The format is documented in content/FORMAT.md.
import { CONFIG } from './config.js';

const SECTION_DEFAULTS = {
  rw: { title: 'Reading and Writing', time: 32 * 60, count: 27 },
  math: { title: 'Math', time: 35 * 60, count: 22 },
};
export const MODULE_KEYS = ['m1', 'm2', 'm2_easy', 'm2_hard'];

let catalog = null;
const cache = new Map();
const temp = new Map();      // admin uploads (preview only, never saved)

export async function loadCatalog() {
  if (!catalog) {
    const res = await fetch('content/catalog.json', { cache: 'no-cache' });
    catalog = (await res.json()).tests;
  }
  return catalog;
}

export async function loadTest(id) {
  if (temp.has(id)) return temp.get(id);
  if (cache.has(id)) return cache.get(id);
  const meta = (await loadCatalog()).find((t) => t.id === id);
  if (!meta) throw new Error('Test not found: ' + id);
  const res = await fetch('content/tests/' + meta.file, { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not load ' + meta.file);
  const test = normalizeTest({ ...(await res.json()), id: meta.id, access: meta.access ?? 'free' });
  cache.set(id, test);
  return test;
}

export function registerTempTest(raw) {
  const test = normalizeTest({ ...raw, id: 'upload-' + Date.now() });
  temp.set(test.id, test);
  return test;
}

export function normalizeTest(t) {
  t.breakSeconds ??= CONFIG.defaultBreakSeconds;
  t.sections = (t.sections || []).map((s, si) => {
    const d = SECTION_DEFAULTS[s.id] || { title: s.id, time: 30 * 60 };
    const sec = { ...s, title: s.title || d.title, number: si + 1, modules: {} };
    for (const key of MODULE_KEYS) {
      const m = s.modules?.[key];
      if (!m) continue;
      sec.modules[key] = {
        key,
        time: m.time ?? d.time,
        questions: (m.questions || []).map((q, qi) => ({
          type: q.choices ? 'mcq' : 'spr',
          ...q,
          id: q.id || `${s.id}-${key}-${qi + 1}`,
          answer: q.type === 'spr' || !q.choices ? [].concat(q.answer ?? []).map(String) : String(q.answer || '').toUpperCase(),
        })),
      };
    }
    return sec;
  });
  return t;
}

export const sectionOf = (test, id) => test.sections.find((s) => s.id === id);

// Total time of a mode (for display).
export function modeSeconds(test, sectionIds) {
  let total = 0;
  for (const id of sectionIds) {
    const s = sectionOf(test, id);
    if (!s) continue;
    const m1 = s.modules.m1, m2 = s.modules.m2 || s.modules.m2_hard || s.modules.m2_easy;
    total += (m1?.time || 0) + (m2?.time || 0);
  }
  return total;
}

export function questionCount(test, sectionId) {
  const s = sectionOf(test, sectionId);
  if (!s) return 0;
  const m2 = s.modules.m2 || s.modules.m2_hard || s.modules.m2_easy;
  return (s.modules.m1?.questions.length || 0) + (m2?.questions.length || 0);
}

// Checks an uploaded or catalog test and returns human-readable problems.
export function validateTest(t) {
  const out = [];
  const err = (msg) => out.push({ level: 'error', msg });
  const warn = (msg) => out.push({ level: 'warn', msg });
  if (!t.title) warn('The test has no "title".');
  if (!t.sections?.length) err('The test has no sections.');
  const ids = new Set();
  for (const s of t.sections || []) {
    const d = SECTION_DEFAULTS[s.id];
    if (!d) warn(`Section "${s.id}" is not "rw" or "math".`);
    if (!s.modules.m1) err(`${s.title}: module "m1" is missing.`);
    if (!s.modules.m2 && !(s.modules.m2_easy && s.modules.m2_hard))
      err(`${s.title}: needs "m2", or both "m2_easy" and "m2_hard" for adaptive routing.`);
    for (const m of Object.values(s.modules)) {
      const where = `${s.title} / ${m.key}`;
      if (d && m.questions.length !== d.count)
        warn(`${where}: ${m.questions.length} questions (the real SAT has ${d.count}).`);
      m.questions.forEach((q, i) => {
        const at = `${where} Q${i + 1}`;
        if (ids.has(q.id)) err(`${at}: duplicate id "${q.id}".`);
        ids.add(q.id);
        if (!q.stem) err(`${at}: no "stem" (question text).`);
        if (q.type === 'mcq') {
          if (q.choices?.length !== 4) err(`${at}: needs exactly 4 choices.`);
          if (!'ABCD'.includes(q.answer) || !q.answer) err(`${at}: "answer" must be A, B, C or D.`);
        } else if (q.type === 'spr') {
          if (!q.answer.length) err(`${at}: student-produced response needs at least one accepted "answer".`);
          if (s.id === 'rw') warn(`${at}: Reading and Writing questions are normally multiple choice.`);
        } else err(`${at}: unknown type "${q.type}".`);
        if (!q.domain) warn(`${at}: no "domain" (used for the score report).`);
      });
    }
  }
  return out;
}

export const DOMAINS = {
  rw: ['Information and Ideas', 'Craft and Structure', 'Expression of Ideas', 'Standard English Conventions'],
  math: ['Algebra', 'Advanced Math', 'Problem-Solving and Data Analysis', 'Geometry and Trigonometry'],
};
