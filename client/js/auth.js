/**
 * ParkIQ — auth.js
 * Login, registration, token management
 */

/* ─────────────────────────────────────────
   LOGIN
───────────────────────────────────────── */
async function handleLogin(e) {
  e.preventDefault();
  clearFormErrors();

  const form = e.target;
  const btn  = form.querySelector('[type="submit"]');
  const data = getFormData(form);

  if (!data.email)    return setFormError('email', 'Email is required');
  if (!data.password) return setFormError('password', 'Password is required');

  setLoading(btn, true);
  try {
    const res = await api.post('/auth/login', { email: data.email, password: data.password });
    auth.setToken(res.data.accessToken);
    auth.setUser(res.data.user);

    toast('Welcome back!', 'success');

    const role = res.data.user.role;
    setTimeout(() => {
      if (role === 'admin')  navigate('admin-dashboard.html');
      else if (role === 'owner') navigate('owner-dashboard.html');
      else                   navigate('dashboard.html');
    }, 600);
  } catch (err) {
    toast(err.message || 'Login failed', 'error');
    if (err.status === 401) setFormError('password', 'Invalid email or password');
  } finally {
    setLoading(btn, false);
  }
}

/* ─────────────────────────────────────────
   REGISTER
───────────────────────────────────────── */
async function handleRegister(e) {
  e.preventDefault();
  clearFormErrors();

  const form = e.target;
  const btn  = form.querySelector('[type="submit"]');
  const data = getFormData(form);

  // client-side validation
  let valid = true;
  if (!data.firstName) { setFormError('firstName', 'Required'); valid = false; }
  if (!data.lastName)  { setFormError('lastName',  'Required'); valid = false; }
  if (!data.email)     { setFormError('email',     'Required'); valid = false; }
  if (!data.password)  { setFormError('password',  'Required'); valid = false; }
  if (data.password && data.password.length < 8) {
    setFormError('password', 'Must be at least 8 characters'); valid = false;
  }
  if (data.password !== data.confirmPassword) {
    setFormError('confirmPassword', 'Passwords do not match'); valid = false;
  }
  if (!valid) return;

  setLoading(btn, true);
  try {
    const res = await api.post('/auth/register', {
      firstName:   data.firstName,
      lastName:    data.lastName,
      email:       data.email,
      password:    data.password,
      phone:       data.phone || undefined,
      role:        data.role  || 'user'
    });

    auth.setToken(res.data.accessToken);
    auth.setUser(res.data.user);

    toast('Account created! Welcome to ParkIQ.', 'success');
    const role = res.data.user.role;
    setTimeout(() => role === 'owner' ? navigate('owner-dashboard.html') : navigate('dashboard.html'), 800);
  } catch (err) {
    toast(err.message || 'Registration failed', 'error');
    if (err.status === 409) setFormError('email', 'Email already registered');
  } finally {
    setLoading(btn, false);
  }
}

/* ─────────────────────────────────────────
   LOGOUT
───────────────────────────────────────── */
function logout() {
  auth.clear();
  toast('Signed out successfully', 'info');
  setTimeout(() => navigate('login.html'), 600);
}

/* ─────────────────────────────────────────
   PASSWORD TOGGLE
───────────────────────────────────────── */
function initPasswordToggles() {
  document.querySelectorAll('.password-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling || document.getElementById(btn.dataset.target);
      if (!input) return;
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      btn.innerHTML = isText
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    });
  });
}

/* ─────────────────────────────────────────
   STRENGTH METER
───────────────────────────────────────── */
function initPasswordStrength() {
  const input = document.getElementById('password');
  const meter = document.getElementById('strength-meter');
  const label = document.getElementById('strength-label');
  if (!input || !meter) return;

  input.addEventListener('input', () => {
    const val = input.value;
    let score = 0;
    if (val.length >= 8)                      score++;
    if (/[A-Z]/.test(val))                    score++;
    if (/[0-9]/.test(val))                    score++;
    if (/[^A-Za-z0-9]/.test(val))            score++;

    const widths = ['0%', '25%', '50%', '75%', '100%'];
    const colors = ['#555', '#EF4444', '#F59E0B', '#3B82F6', '#4CAF50'];
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

    meter.style.width  = widths[score];
    meter.style.background = colors[score];
    if (label) { label.textContent = labels[score]; label.style.color = colors[score]; }
  });
}

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // redirect if already logged in
  const page = window.location.pathname.split('/').pop();
  if (['login.html','register.html'].includes(page) && auth.isLoggedIn()) {
    const role = auth.getUser()?.role;
    if (role === 'admin') navigate('admin-dashboard.html');
    else navigate(role === 'owner' ? 'owner-dashboard.html' : 'dashboard.html');
    return;
  }
  // redirect admin away from admin-login if already signed in
  if (page === 'admin-login.html' && auth.isLoggedIn() && auth.getUser()?.role === 'admin') {
    navigate('admin-dashboard.html');
    return;
  }

  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  document.getElementById('register-form')?.addEventListener('submit', handleRegister);
  document.querySelectorAll('[data-logout]').forEach(el =>
    el.addEventListener('click', logout)
  );

  // USER / OWNER ROLE SELECTION
  const roleInput = document.getElementById('role-input');

  if (roleInput) {
    document.querySelectorAll('input[name="role-select"]').forEach(radio => {
      radio.addEventListener('change', function () {
        roleInput.value = this.value;
        console.log('Selected role:', this.value);
      });
    });
  }

  initPasswordToggles();
  initPasswordStrength();
});