/**
 * ParkIQ — app.js
 * Core application: API client, state management, shared init
 */

const API_BASE = '/api';

/* ─────────────────────────────────────────
   API CLIENT
───────────────────────────────────────── */
const api = {
  _token() { return localStorage.getItem('token'); },

  async _req(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this._token()) headers['Authorization'] = `Bearer ${this._token()}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, message: data.message || 'Request failed', data };
    return data;
  },

  get:    (path)        => api._req('GET',    path),
  post:   (path, body)  => api._req('POST',   path, body),
  put:    (path, body)  => api._req('PUT',    path, body),
  patch:  (path, body)  => api._req('PATCH',  path, body),
  delete: (path)        => api._req('DELETE', path),
};

/* ─────────────────────────────────────────
   AUTH STATE
───────────────────────────────────────── */
const auth = {
  getUser()  { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } },
  setUser(u) { localStorage.setItem('user', JSON.stringify(u)); },
  setToken(t){ localStorage.setItem('token', t); },
  clear()    { localStorage.removeItem('token'); localStorage.removeItem('user'); },
  isLoggedIn(){ return !!this.getUser() && !!localStorage.getItem('token'); },
  isAdmin()   { return this.getUser()?.role === 'admin'; },
  isOwner()   { return this.getUser()?.role === 'owner'; },

  guard(redirect = 'login.html') {
    if (!this.isLoggedIn()) {
      window.location.href = redirect;
      return false;
    }
    return true;
  },

  async refresh() {
    try {
      const me = await api.get('/auth/me');
      if (me.success) this.setUser(me.data);
    } catch { this.clear(); }
  }
};

/* ─────────────────────────────────────────
   TOAST NOTIFICATIONS
───────────────────────────────────────── */
function ensureToastContainer() {
  let el = document.getElementById('toast-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-container';
    document.body.appendChild(el);
  }
  return el;
}

function toast(message, type = 'info', duration = 3500) {
  const container = ensureToastContainer();
  const el = document.createElement('div');
  el.className = `toast ${type}`;

  const icons = {
    success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };

  el.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    el.style.transition = 'all .3s ease';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/* ─────────────────────────────────────────
   PAGE LOADER
───────────────────────────────────────── */
function showLoader()  { document.getElementById('page-loader')?.classList.remove('hidden'); }
function hideLoader()  {
  const el = document.getElementById('page-loader');
  if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }
}

/* ─────────────────────────────────────────
   NAVIGATION HELPERS
───────────────────────────────────────── */
function navigate(path) { window.location.href = path; }
function goBack()       { window.history.back(); }

function initNav() {
  // highlight active link
  const path = window.location.pathname.split('/').pop();
  document.querySelectorAll('.nav-links a, .sidebar-link').forEach(a => {
    if (a.getAttribute('href') === path) a.classList.add('active');
  });

  // mobile hamburger
  const toggle = document.querySelector('.nav-toggle');
  const links  = document.querySelector('.nav-links');
  toggle?.addEventListener('click', () => links?.classList.toggle('open'));

  // auth-aware nav items
  const user = auth.getUser();
  document.querySelectorAll('[data-auth]').forEach(el => {
    const requires = el.dataset.auth;
    if (requires === 'guest'  && user)                el.classList.add('hidden');
    if (requires === 'user'   && !user)               el.classList.add('hidden');
    if (requires === 'owner'  && !auth.isOwner())     el.classList.add('hidden');
  });

  // user avatar in nav
  const navUser = document.getElementById('nav-user-name');
  if (navUser && user) navUser.textContent = user.firstName;
}

/* ─────────────────────────────────────────
   SCROLL REVEAL
───────────────────────────────────────── */
function initReveal() {
  const io = new IntersectionObserver(entries => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        e.target.style.transitionDelay = (i % 5 * 0.07) + 's';
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -50px 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
}

/* ─────────────────────────────────────────
   DROPDOWN
───────────────────────────────────────── */
function initDropdowns() {
  document.querySelectorAll('.dropdown').forEach(dd => {
    const btn  = dd.querySelector('[data-dropdown-toggle]');
    const menu = dd.querySelector('.dropdown-menu');
    if (!btn || !menu) return;

    btn.addEventListener('click', e => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
  });
}

/* ─────────────────────────────────────────
   MODAL HELPERS
───────────────────────────────────────── */
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function initModals() {
  document.querySelectorAll('[data-modal-open]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.modalOpen));
  });
  document.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modalClose));
  });
  // close on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
}

/* ─────────────────────────────────────────
   FORM HELPERS
───────────────────────────────────────── */
function getFormData(formEl) {
  const fd = new FormData(formEl);
  const obj = {};
  fd.forEach((v, k) => obj[k] = v.toString().trim());
  return obj;
}

function setFormError(fieldName, message) {
  const el = document.querySelector(`[data-error="${fieldName}"]`);
  if (el) { el.textContent = message; el.classList.remove('hidden'); }
}

function clearFormErrors() {
  document.querySelectorAll('.form-error').forEach(el => { el.textContent = ''; el.classList.add('hidden'); });
}

function setLoading(btn, loading) {
  if (loading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px"></span>';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
    btn.disabled = false;
  }
}

/* ─────────────────────────────────────────
   DATE/TIME HELPERS
───────────────────────────────────────── */
function formatDate(d, opts) {
  return new Date(d).toLocaleDateString('en-IN', opts || { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatTime(d) {
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function formatDateTime(d) { return `${formatDate(d)}, ${formatTime(d)}`; }
function formatCurrency(n) { return '₹' + Number(n).toFixed(2); }

function timeAgo(d) {
  const seconds = Math.floor((Date.now() - new Date(d)) / 1000);
  if (seconds < 60)   return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds/60)}m ago`;
  if (seconds < 86400)return `${Math.floor(seconds/3600)}h ago`;
  return `${Math.floor(seconds/86400)}d ago`;
}

/* ─────────────────────────────────────────
   AVAILABILITY HELPERS
───────────────────────────────────────── */
function availabilityClass(available, total) {
  const pct = available / total;
  if (pct === 0)   return 'avail-low';
  if (pct <= 0.25) return 'avail-low';
  if (pct <= 0.5)  return 'avail-mid';
  return 'avail-high';
}
function availabilityText(available, total) {
  if (available === 0) return 'Full';
  const pct = available / total;
  if (pct <= 0.25) return 'Almost full';
  if (pct <= 0.5)  return 'Filling up';
  return `${available} spots free`;
}

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  hideLoader();
  initNav();
  initReveal();
  initDropdowns();
  initModals();
});
