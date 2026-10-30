// Login. Two interchangeable back ends:
//  - DEMO mode: accounts live in this browser's localStorage (for trying the platform).
//  - Supabase: real accounts, e-mail/password and optional Google login.
import { CONFIG, DEMO_MODE } from './config.js?v=f87e49c0';
import { uid, sha256 } from './util.js?v=f87e49c0';

let sb = null;          // Supabase client
let current = null;     // { id, email, name, role, plan }
const listeners = new Set();

// A password-reset link lands as "#access_token=…&type=recovery". Note it before Supabase
// consumes the hash, so the app can open the new-password page once signed in.
let recovery = !DEMO_MODE && /(^#|&)type=recovery(&|$)/.test(location.hash);
export const takeRecovery = () => { const r = recovery; recovery = false; return r; };

export async function getSupabase() {
  if (DEMO_MODE) return null;
  if (!sb) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, { auth: { lock: authLock } });
  }
  return sb;
}

// supabase-js waits forever for its cross-tab auth lock, so one stuck tab (or a page
// frozen mid token refresh) would leave every other tab on "Loading…". Wait up to 5 s.
async function authLock(name, _acquireTimeout, fn) {
  if (!navigator.locks) return fn();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  try {
    return await navigator.locks.request(name, { signal: ctl.signal }, () => { clearTimeout(timer); return fn(); });
  } catch (e) {
    if (e.name === 'AbortError' && ctl.signal.aborted) return fn();
    throw e;
  }
}

const isAdminEmail = (email) =>
  CONFIG.adminEmails.map((e) => e.toLowerCase()).includes(String(email || '').toLowerCase());

function emit() { listeners.forEach((fn) => fn(current)); }
export const onAuthChange = (fn) => listeners.add(fn);
export const currentUser = () => current;
export const isAdmin = (u = current) => !!u && (u.role === 'admin' || isAdminEmail(u.email));

/* ---------------- demo back end ---------------- */
const DEMO_USERS = 'sat:demo-users';
const DEMO_SESSION = 'sat:demo-session';
const readUsers = () => JSON.parse(localStorage.getItem(DEMO_USERS) || '{}');
const writeUsers = (u) => localStorage.setItem(DEMO_USERS, JSON.stringify(u));
const publicUser = (u) => u && ({ id: u.id, email: u.email, name: u.name, role: u.role, plan: u.plan });

export function demoUsers() { return Object.values(readUsers()).map(publicUser); }

/* ---------------- shared API ---------------- */
export async function initAuth() {
  if (DEMO_MODE) {
    const id = localStorage.getItem(DEMO_SESSION);
    const u = Object.values(readUsers()).find((x) => x.id === id);
    current = publicUser(u) || null;
    return current;
  }
  const client = await getSupabase();
  const { data } = await client.auth.getSession();
  current = data.session ? await loadProfile(data.session.user) : null;
  // Supabase holds its auth lock while this callback runs, so calling Supabase from inside
  // it (loadProfile) deadlocks every later auth call. Defer the work until the lock is free.
  client.auth.onAuthStateChange((_evt, session) => {
    setTimeout(async () => {
      const next = session ? await loadProfile(session.user) : null;
      if ((next && next.id) !== (current && current.id)) { current = next; emit(); }
    }, 0);
  });
  return current;
}

async function loadProfile(user) {
  const client = await getSupabase();
  const { data } = await client.from('profiles').select('name, role, plan').eq('id', user.id).maybeSingle();
  return {
    id: user.id,
    email: user.email,
    name: data?.name || user.user_metadata?.name || user.email.split('@')[0],
    role: data?.role || 'student',
    plan: data?.plan || 'free',
  };
}

export async function signUp({ name, email, password }) {
  email = email.trim().toLowerCase();
  if (DEMO_MODE) {
    const users = readUsers();
    if (users[email]) throw new Error('An account with this e-mail already exists. Try signing in.');
    users[email] = {
      id: uid(), email, name: name.trim(), plan: 'free',
      role: isAdminEmail(email) ? 'admin' : 'student',
      pass: await sha256(email + ':' + password),
    };
    writeUsers(users);
    localStorage.setItem(DEMO_SESSION, users[email].id);
    current = publicUser(users[email]); emit();
    return { needsConfirm: false };
  }
  const client = await getSupabase();
  const { data, error } = await client.auth.signUp({
    email, password,
    options: { data: { name: name.trim() }, emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
  if (!data.session) return { needsConfirm: true };
  current = await loadProfile(data.user); emit();
  return { needsConfirm: false };
}

export async function signIn({ email, password }) {
  email = email.trim().toLowerCase();
  if (DEMO_MODE) {
    const u = readUsers()[email];
    if (!u || u.pass !== await sha256(email + ':' + password)) throw new Error('E-mail or password is incorrect.');
    localStorage.setItem(DEMO_SESSION, u.id);
    current = publicUser(u); emit();
    return;
  }
  const client = await getSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-mail or password is incorrect.' : error.message);
  current = await loadProfile(data.user); emit();
}

export async function signInWithGoogle() {
  const client = await getSupabase();
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
}

export async function sendPasswordReset(email) {
  if (DEMO_MODE) throw new Error('Password reset e-mails work once Supabase is connected. In demo mode, just create a new account.');
  const client = await getSupabase();
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
    // No "#/reset" here: Supabase appends its own "#access_token=…", and a second "#"
    // keeps supabase-js from reading the token. takeRecovery() routes to /reset instead.
    redirectTo: location.origin + location.pathname,
  });
  if (error) throw error;
}

export async function updatePassword(password) {
  const client = await getSupabase();
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
}

export async function updateName(name) {
  name = name.trim();
  if (DEMO_MODE) {
    const users = readUsers();
    users[current.email].name = name; writeUsers(users);
  } else {
    const client = await getSupabase();
    const { error } = await client.from('profiles').update({ name }).eq('id', current.id);
    if (error) throw error;
  }
  current = { ...current, name }; emit();
}

export async function signOut() {
  if (DEMO_MODE) localStorage.removeItem(DEMO_SESSION);
  else await (await getSupabase()).auth.signOut();
  current = null; emit();
}

// Demo only: lets the admin flip a student's plan to test the paywall.
export function demoSetPlan(email, plan) {
  const users = readUsers();
  if (!users[email]) return;
  users[email].plan = plan; writeUsers(users);
  if (current && current.email === email) { current = { ...current, plan }; emit(); }
}
