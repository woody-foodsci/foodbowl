const SUPABASE_URL = 'https://djyebjgbrqtevebficqs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SFej8kSW8_C9k0ENai98AA_nRa8OHe9';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;

async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  handleUser(session?.user ?? null);
  sb.auth.onAuthStateChange((_event, session) => {
    handleUser(session?.user ?? null);
  });
}

function handleUser(user) {
  currentUser = user;
  renderAuthBar();
}

function renderAuthBar() {
  const bar = document.getElementById('auth-bar');
  if (!bar) return;
  if (currentUser) {
    const label = currentUser.email.split('@')[0];
    bar.innerHTML = `<span class="auth-user">${label}</span><button class="auth-signout-btn" id="signout-btn">Sign out</button>`;
    document.getElementById('signout-btn').onclick = () => sb.auth.signOut();
  } else {
    bar.innerHTML = `<button class="auth-signin-btn" id="signin-btn">Sign in</button>`;
    document.getElementById('signin-btn').onclick = () => openAuthModal('login');
  }
}

// ── Modal ──
let authMode = 'login';

function openAuthModal(mode) {
  authMode = mode;
  updateModalLabels();
  document.getElementById('auth-modal').style.display = 'flex';
  document.getElementById('auth-email').value = '';
  document.getElementById('auth-password').value = '';
  document.getElementById('auth-error').textContent = '';
  document.getElementById('auth-error').style.color = 'var(--danger)';
  setTimeout(() => document.getElementById('auth-email').focus(), 50);
}

function closeAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
}

function updateModalLabels() {
  const isLogin = authMode === 'login';
  document.getElementById('modal-title').textContent = isLogin ? 'Sign in' : 'Create account';
  document.getElementById('auth-submit-btn').textContent = isLogin ? 'Sign in →' : 'Create account →';
  document.getElementById('auth-toggle-btn').textContent = isLogin
    ? 'No account? Sign up'
    : 'Already have an account? Sign in';
}

async function handleAuthSubmit() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  const btn = document.getElementById('auth-submit-btn');

  if (!email || !password) { errEl.textContent = 'Fill in all fields.'; return; }

  btn.disabled = true;
  btn.textContent = 'Loading…';
  errEl.textContent = '';
  errEl.style.color = 'var(--danger)';

  if (authMode === 'login') {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      errEl.textContent = error.message;
    } else {
      closeAuthModal();
    }
  } else {
    const { error } = await sb.auth.signUp({ email, password });
    if (error) {
      errEl.textContent = error.message;
    } else {
      errEl.style.color = 'var(--accent)';
      errEl.textContent = 'Check your email to confirm your account.';
    }
  }

  btn.disabled = false;
  updateModalLabels();
}

// ── Event Listeners ──
document.getElementById('auth-modal').addEventListener('click', e => {
  if (e.target.id === 'auth-modal') closeAuthModal();
});
document.getElementById('modal-close-btn').addEventListener('click', closeAuthModal);
document.getElementById('auth-submit-btn').addEventListener('click', handleAuthSubmit);
document.getElementById('auth-toggle-btn').addEventListener('click', () => {
  authMode = authMode === 'login' ? 'signup' : 'login';
  updateModalLabels();
  document.getElementById('auth-error').textContent = '';
});
document.getElementById('auth-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleAuthSubmit();
});

initAuth();
