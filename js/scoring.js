// Answer checking, adaptive routing and scaled scores.

// "3/4" → 0.75, "-2.5" → -2.5, "" or junk → NaN
export function parseNumber(s) {
  s = String(s ?? '').trim();
  if (!s) return NaN;
  if (/^-?\d*\.?\d+\/-?\d*\.?\d+$/.test(s)) {
    const [a, b] = s.split('/').map(Number);
    return b === 0 ? NaN : a / b;
  }
  return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
}

export function isAnswered(q, r) {
  return !!(r && r.a != null && String(r.a).trim() !== '');
}

export function isCorrect(q, r) {
  if (!isAnswered(q, r)) return false;
  if (q.type === 'mcq') return r.a === q.answer;
  const given = String(r.a).trim();
  const g = parseNumber(given);
  return q.answer.some((acc) => {
    if (acc.trim() === given) return true;
    const v = parseNumber(acc);
    // Decimals may be truncated or rounded to the space available, like on the SAT.
    return !Number.isNaN(g) && !Number.isNaN(v) && Math.abs(g - v) < 1e-9;
  });
}

// Correct letters/values as shown to students after the test.
export const answerLabel = (q) => (q.type === 'mcq' ? q.answer : q.answer.join(' or '));

// Module 1 → harder or easier Module 2.
export function routeAfterModule1(section, m1, responses) {
  if (section.modules.m2) return 'm2';
  const scored = m1.questions.filter((q) => !q.pretest);
  const correct = scored.filter((q) => isCorrect(q, responses[q.id])).length;
  const t = section.routingThreshold ?? 0.6;      // fraction of scored M1 questions, or a count if ≥ 1
  const need = t >= 1 ? t : Math.ceil(t * scored.length);
  return correct >= need ? 'm2_hard' : 'm2_easy';
}

// Scaled 200–800. Uses the test's own table when given ("scoring" in the test file),
// otherwise an estimate: the easier Module 2 caps the score around 650.
export function scaleSection(test, section, route, raw, maxRaw) {
  const table = test.scoring?.[section.id]?.[route] || test.scoring?.[section.id]?.all;
  if (Array.isArray(table) && table.length) {
    return { scaled: table[Math.min(raw, table.length - 1)], estimated: false };
  }
  const frac = maxRaw ? raw / maxRaw : 0;
  const span = route === 'm2_easy' ? 450 : 600;
  return { scaled: Math.round((200 + frac * span) / 10) * 10, estimated: true };
}

// attemptState.modules = { rw: ['m1','m2_hard'], math: [...] }
export function buildResult(test, state) {
  const sections = {};
  const items = [];
  let total = 0, estimated = false;
  for (const secId of Object.keys(state.modules)) {
    const sec = test.sections.find((s) => s.id === secId);
    const keys = state.modules[secId];
    let raw = 0, maxRaw = 0, answered = 0;
    const domains = {};
    keys.forEach((k, mi) => {
      sec.modules[k].questions.forEach((q, qi) => {
        const r = state.responses[q.id];
        const ok = isCorrect(q, r);
        items.push({
          qid: q.id, section: secId, module: k, moduleNo: mi + 1, no: qi + 1,
          answer: r?.a ?? null, correct: ok, answered: isAnswered(q, r), marked: !!r?.mark,
          pretest: !!q.pretest, domain: q.domain || 'Other', skill: q.skill || '', difficulty: q.difficulty || '',
        });
        if (q.pretest) return;
        maxRaw++;
        if (ok) raw++;
        if (isAnswered(q, r)) answered++;
        const d = (domains[q.domain || 'Other'] ||= { correct: 0, total: 0 });
        d.total++; if (ok) d.correct++;
      });
    });
    const route = keys[1] || 'm2';
    const s = scaleSection(test, sec, route, raw, maxRaw);
    estimated ||= s.estimated;
    total += s.scaled;
    sections[secId] = { title: sec.title, raw, maxRaw, answered, scaled: s.scaled, route, domains };
  }
  return { total, sections, items, estimated, fullTest: Object.keys(sections).length === 2 };
}
