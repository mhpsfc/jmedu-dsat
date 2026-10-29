// Test attempts (progress + results). A local copy is always kept so a refresh or a
// dropped connection never loses work; with Supabase it is also synced to the server.
import { DEMO_MODE } from './config.js';
import { getSupabase } from './auth.js';
import { debounce } from './util.js';

const key = (userId) => 'sat:attempts:' + userId;
const readLocal = (userId) => JSON.parse(localStorage.getItem(key(userId)) || '{}');
const writeLocal = (userId, map) => localStorage.setItem(key(userId), JSON.stringify(map));

const toRow = (a) => ({
  id: a.id, user_id: a.userId, test_id: a.testId, test_title: a.testTitle, mode: a.mode,
  status: a.status, state: a.state, result: a.result,
  created_at: a.createdAt, updated_at: a.updatedAt, completed_at: a.completedAt || null,
});
const fromRow = (r) => ({
  id: r.id, userId: r.user_id, testId: r.test_id, testTitle: r.test_title, mode: r.mode,
  status: r.status, state: r.state, result: r.result,
  createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at,
});

export async function listAttempts(userId) {
  const local = readLocal(userId);
  if (!DEMO_MODE) {
    try {
      const client = await getSupabase();
      const { data, error } = await client.from('attempts').select('*').eq('user_id', userId);
      if (error) throw error;
      for (const r of data) {
        const a = fromRow(r), l = local[a.id];
        // Keep whichever copy is newer (local can be ahead if a sync failed).
        if (!l || new Date(a.updatedAt) >= new Date(l.updatedAt)) local[a.id] = a;
      }
      writeLocal(userId, local);
    } catch (e) { console.warn('attempt sync failed, using local copy', e); }
  }
  return Object.values(local).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function getAttempt(userId, id) {
  const local = readLocal(userId)[id];
  if (local || DEMO_MODE) return local || null;
  const client = await getSupabase();
  const { data } = await client.from('attempts').select('*').eq('id', id).maybeSingle();
  return data ? fromRow(data) : null;
}

const pushRemote = debounce(async (a) => {
  try {
    const client = await getSupabase();
    const { error } = await client.from('attempts').upsert(toRow(a));
    if (error) throw error;
  } catch (e) { console.warn('attempt upload failed (kept locally)', e); }
}, 1500);

export function saveAttempt(a, { immediate = false } = {}) {
  a.updatedAt = new Date().toISOString();
  const map = readLocal(a.userId);
  map[a.id] = a;
  writeLocal(a.userId, map);
  if (!DEMO_MODE) {
    pushRemote(a);
    if (immediate) pushRemote.flush?.();
  }
}

export async function deleteAttempt(userId, id) {
  const map = readLocal(userId);
  delete map[id];
  writeLocal(userId, map);
  if (!DEMO_MODE) {
    const client = await getSupabase();
    await client.from('attempts').delete().eq('id', id);
  }
}

// Admin: every student's attempts.
export async function listAllAttempts() {
  if (DEMO_MODE) {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('sat:attempts:')) out.push(...Object.values(JSON.parse(localStorage.getItem(k))));
    }
    return out;
  }
  const client = await getSupabase();
  const { data, error } = await client.from('attempts').select('id,user_id,test_id,test_title,mode,status,result,created_at,updated_at,completed_at');
  if (error) throw error;
  return data.map(fromRow);
}

export async function listProfiles() {
  const client = await getSupabase();
  const { data, error } = await client.from('profiles').select('id,email,name,role,plan,created_at').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function setPlan(userId, plan) {
  const client = await getSupabase();
  const { error } = await client.rpc('admin_set_plan', { target: userId, new_plan: plan });
  if (error) throw error;
}
