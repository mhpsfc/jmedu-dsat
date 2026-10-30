// Platform settings. Everything a non-developer may need to change lives here.
export const CONFIG = {
  brand: {
    name: 'JM EDU DSAT',               // shown in the top bar, login page and browser tab
    tagline: 'Digital SAT practice that feels like test day.',
  },

  // Supabase (login + saved results). Leave both empty to run in DEMO mode:
  // accounts and results are then stored only in this browser.
  supabaseUrl: 'https://ehoovqebxisgoycimpwx.supabase.co',
  supabaseAnonKey: 'sb_publishable_vi4gmFZhb-7AcrwlJ26J-g_3QBS-g5n',   // publishable key: safe to be public
  enableGoogleLogin: false,           // turn on after enabling Google in Supabase → Authentication → Providers

  // Paid plans. While false, every test is open to every signed-in student.
  // When true, tests with "access": "premium" need a premium plan.
  paywallEnabled: false,

  // These e-mail addresses get the Admin page.
  adminEmails: ['mhpsfc@gmail.com'],

  // Desmos graphing calculator. This is the public demo key from the Desmos API docs;
  // request your own key at https://www.desmos.com/api before going live.
  desmosApiKey: 'dcb31709b452b1cf9dc26972add0fda6',

  // Break between Reading and Writing and Math in a full test (seconds).
  defaultBreakSeconds: 600,
};

export const DEMO_MODE = !(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
