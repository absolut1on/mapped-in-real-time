let supabase;

try {
  const lib = window.supabase;
  supabase = lib.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
} catch (e) {
  console.error('Supabase init failed:', e);
  document.body.innerHTML = '<div style="color:#ff6b6b;padding:40px;text-align:center;">Failed to connect to Supabase. Check config.js values.</div>';
}

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

async function getUserRole(userId) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (error || !data) return 'viewer';
  return data.role;
}

async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}
