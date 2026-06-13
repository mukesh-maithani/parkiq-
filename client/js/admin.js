/**
 * ParkIQ — admin.js
 * All data loaded from live API. No hardcoded entities.
 */

/* ─────────────────────────────────────────
   ADMIN AUTH GUARD
───────────────────────────────────────── */
(function () {
  try {
    const user = JSON.parse(localStorage.getItem('user'));
    const isAdmin = user && user.role === 'admin';
    const isAdminAuth = localStorage.getItem('adminAuth') === 'true';
    if (!isAdmin || !isAdminAuth) window.location.href = 'admin-login.html';
  } catch (e) { window.location.href = 'admin-login.html'; }
})();

/* ─────────────────────────────────────────
   API HELPER
───────────────────────────────────────── */
const BASE = '/api';

async function apiCall(method, url, body) {
  const token = localStorage.getItem('token');
  const res = await fetch(BASE + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': 'Bearer ' + token } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await res.json();
  if (!res.ok) {
    // If token is invalid or expired, clear auth and redirect to login
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('adminAuth');
      window.location.href = 'admin-login.html';
      throw new Error('Session expired. Please log in again.');
    }
    throw new Error(data.message || 'API error ' + res.status);
  }
  return data;
}

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function escHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return diff + 'd ago';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtCurrency(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
function initials(first, last) {
  return ((first || '')[0] + (last || '')[0]).toUpperCase() || '?';
}
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container')?.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* ─────────────────────────────────────────
   TAB SWITCHING
───────────────────────────────────────── */
let activeTab = 'overview';

function switchTab(tab, sidebarEl) {
  activeTab = tab;
  document.querySelectorAll('.tab-panels > div').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + tab)?.classList.add('active');
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  if (sidebarEl) sidebarEl.classList.add('active');

  const titles = {
    overview: 'Admin Dashboard', users: 'User Management',
    parking: 'Parking Locations', bookings: 'All Bookings',
    promos: 'Promo Codes', analytics: 'Analytics', settings: 'System Settings'
  };
  const subs = {
    overview: 'Platform overview & management', users: 'Manage all registered users & owners',
    parking: 'Approve, reject & manage parking locations', bookings: 'View and manage all bookings',
    promos: 'Manage discount codes', analytics: 'Platform performance metrics',
    settings: 'Configure system settings'
  };
  const titleEl = document.getElementById('topbar-title');
  const subEl = document.getElementById('topbar-sub');
  if (titleEl) titleEl.textContent = titles[tab] || 'Admin';
  if (subEl) subEl.textContent = subs[tab] || '';

  // Load data when tab is opened
  if (tab === 'overview') loadOverview();
  if (tab === 'users') loadUsers();
  if (tab === 'parking') loadParking();
  if (tab === 'bookings') loadBookings();
  if (tab === 'promos') loadPromos();
  if (tab === 'analytics') loadAnalytics();
}

/* ─────────────────────────────────────────
   OVERVIEW — load stats + pending + recent bookings
───────────────────────────────────────── */
async function loadOverview() {
  try {
    const [statsRes, chartRes] = await Promise.all([
      apiCall('GET', '/users/admin/stats'),
      apiCall('GET', '/users/admin/revenue-chart')
    ]);
    const s = statsRes.data;

    // Stat cards
    document.getElementById('stat-revenue').textContent = fmtCurrency(s.totalRevenue);
    document.getElementById('stat-bookings').textContent = s.totalBookings;
    document.getElementById('stat-users').textContent = s.totalUsers;
    document.getElementById('stat-pending').textContent = s.pendingApprovals;
    if (s.pendingApprovals > 0) {
      document.getElementById('stat-pending-sub').textContent = 'Requires action';
    } else {
      document.getElementById('stat-pending-sub').textContent = 'All caught up';
      document.getElementById('stat-pending-sub').style.color = 'var(--success)';
    }

    // Update sidebar badge
    const pendingBadge = document.getElementById('pending-count-badge');
    if (pendingBadge) pendingBadge.textContent = s.pendingApprovals;
    const usersBadge = document.getElementById('users-count-badge');
    if (usersBadge) usersBadge.textContent = s.totalUsers;

    // Analytics cards mirror
    const anMap = { 'an-revenue': fmtCurrency(s.totalRevenue), 'an-bookings': s.totalBookings, 'an-users': s.totalUsers, 'an-pending': s.pendingApprovals };
    Object.entries(anMap).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    });

    // Chart month label
    const ml = document.getElementById('chart-month-label');
    if (ml) ml.textContent = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

    buildCharts(chartRes.data);
  } catch (e) {
    console.error('loadOverview stats error:', e);
  }

  // Pending approvals
  try {
    const pending = await apiCall('GET', '/parking/admin/all?isApproved=false&limit=20');
    const lots = pending.data || [];
    const container = document.getElementById('pending-approvals-container');
    const badge = document.getElementById('pending-approvals-badge');
    if (badge) badge.textContent = lots.length + ' new';
    if (container) {
      if (lots.length === 0) {
        container.innerHTML = '<div style="color:var(--muted);font-size:.85rem;text-align:center;padding:1.5rem">No pending approvals</div>';
      } else {
        container.innerHTML = lots.map(lot => `
          <div class="approval-card" id="approval-${lot.id}">
            <div class="approval-info">
              <h3>${escHtml(lot.name)}</h3>
              <p>Owner: ${escHtml((lot.owner?.firstName || '') + ' ' + (lot.owner?.lastName || ''))} · ${escHtml(lot.city || '')} · ${lot.totalSlots || '—'} slots</p>
              <div class="approval-meta">
                <span class="badge badge-muted">${fmtDate(lot.createdAt)}</span>
                <span class="badge badge-amber">Pending Review</span>
              </div>
            </div>
            <div class="approval-actions">
              <button class="btn btn-primary btn-sm" onclick="approveLot(this,${lot.id},'${escHtml(lot.name)}')">Approve</button>
              <button class="btn btn-outline btn-sm" onclick="rejectLot(this,${lot.id},'${escHtml(lot.name)}')">Reject</button>
            </div>
          </div>`).join('');
      }
    }
  } catch (e) {
    const c = document.getElementById('pending-approvals-container');
    if (c) c.innerHTML = '<div style="color:var(--muted);font-size:.85rem;text-align:center;padding:1rem">Could not load pending approvals</div>';
  }

  // Recent bookings (last 5)
  try {
    const bkRes = await apiCall('GET', '/users/admin/bookings?limit=5');
    const tbody = document.getElementById('recent-bookings-tbody');
    const bks = bkRes.data || [];
    if (!tbody) return;
    if (bks.length === 0) {
      tbody.innerHTML = '<tr class="loading-row"><td colspan="6">No bookings yet</td></tr>';
      return;
    }
    const statusBadge = s => {
      const map = { active: 'badge-amber', confirmed: 'badge-green', completed: 'badge-muted', cancelled: 'badge-red' };
      return `<span class="badge ${map[s] || 'badge-muted'}">${s.charAt(0).toUpperCase() + s.slice(1)}</span>`;
    };
    tbody.innerHTML = bks.map(b => `
      <tr>
        <td class="code-cell">${escHtml(b.bookingCode)}</td>
        <td>${escHtml(b.user.firstName + ' ' + b.user.lastName)}</td>
        <td>${escHtml(b.parking.name)}</td>
        <td>${fmtCurrency(b.totalAmount)}</td>
        <td>${statusBadge(b.status)}</td>
        <td class="date-cell">${fmtDate(b.createdAt)}</td>
      </tr>`).join('');
  } catch (e) {
    const tbody = document.getElementById('recent-bookings-tbody');
    if (tbody) tbody.innerHTML = '<tr class="loading-row"><td colspan="6">Could not load bookings</td></tr>';
  }
}

/* ─────────────────────────────────────────
   USERS TAB
───────────────────────────────────────── */
let _allUsers = [];

async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="loading-row"><td colspan="6">Loading users…</td></tr>';
  try {
    const res = await apiCall('GET', '/users/admin/all');
    _allUsers = res.data || [];
    renderUsersTable(_allUsers);
    const title = document.getElementById('users-table-title');
    if (title) title.textContent = `All Users (${_allUsers.length})`;
    const badge = document.getElementById('users-count-badge');
    if (badge) badge.textContent = _allUsers.length;
  } catch (e) {
    tbody.innerHTML = `<tr class="loading-row"><td colspan="6">Error: ${escHtml(e.message)}</td></tr>`;
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  if (users.length === 0) {
    tbody.innerHTML = '<tr class="loading-row"><td colspan="6">No users found</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(u => {
    const roleClass = u.role === 'owner' ? 'role-owner' : u.role === 'admin' ? 'role-admin' : 'role-user';
    const statusBadge = u.isActive
      ? '<span class="badge badge-green">Active</span>'
      : '<span class="badge badge-red">Suspended</span>';
    const suspendLabel = u.isActive ? 'Suspend' : 'Unsuspend';
    const ini = initials(u.firstName, u.lastName);
    return `
      <tr data-role="${escHtml(u.role)}" data-user-id="${u.id}">
        <td><div class="user-cell">
          <div class="avatar avatar-sm">${ini}</div>
          <div class="user-cell-info">
            <div class="name">${escHtml(u.firstName)} ${escHtml(u.lastName)}</div>
            <div class="email">${escHtml(u.email)}</div>
          </div>
        </div></td>
        <td><span class="role-badge ${roleClass}">${u.role.charAt(0).toUpperCase() + u.role.slice(1)}</span></td>
        <td>${u.bookingCount || 0}</td>
        <td class="date-cell">${fmtDate(u.createdAt)}</td>
        <td class="user-status-cell">${statusBadge}</td>
        <td><div style="display:flex;gap:.4rem">
          <button class="btn btn-ghost btn-sm" onclick="viewUserDetails(${u.id})">View</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--amber)"
            onclick="toggleUserActive(this,${u.id},'${escHtml(u.firstName + ' ' + u.lastName)}',${u.isActive})">${suspendLabel}</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger)"
            onclick="deleteUser(this,'${escHtml(u.firstName + ' ' + u.lastName)}',${u.id})">Delete</button>
        </div></td>
      </tr>`;
  }).join('');
}

async function viewUserDetails(userId) {
  const user = _allUsers.find(u => u.id === userId);
  if (!user) return;
  const modal = document.getElementById('user-detail-modal');
  if (!modal) return;
  document.getElementById('ud-avatar').textContent = initials(user.firstName, user.lastName);
  document.getElementById('ud-name').textContent = user.firstName + ' ' + user.lastName;
  document.getElementById('ud-email').textContent = user.email;
  document.getElementById('ud-role').textContent = user.role;
  document.getElementById('ud-joined').textContent = fmtDate(user.createdAt);
  document.getElementById('ud-bk').textContent = user.bookingCount || 0;
  document.getElementById('ud-phone').textContent = user.phone || '—';
  modal.classList.add('open');
}

async function toggleUserActive(btn, userId, name, currentlyActive) {
  const newActive = !currentlyActive;
  if (!confirm(`${newActive ? 'Unsuspend' : 'Suspend'} account for ${name}?`)) return;
  btn.disabled = true;
  try {
    await apiCall('PATCH', `/users/admin/${userId}/toggle-active`, { active: newActive });
    toast(`${name} ${newActive ? 'reinstated' : 'suspended'}`, newActive ? 'success' : 'info');
    loadUsers();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
    btn.disabled = false;
  }
}

async function deleteUser(btn, name, userId) {
  if (!confirm(`Permanently delete account for ${name}?\n\nThis CANNOT be undone.`)) return;
  btn.disabled = true;
  try {
    await apiCall('DELETE', `/users/admin/${userId}`);
    toast(`${name}'s account deleted`, 'error');
    loadUsers();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
    btn.disabled = false;
  }
}

function filterUsers(q) {
  const filtered = _allUsers.filter(u =>
    (u.firstName + ' ' + u.lastName + ' ' + u.email).toLowerCase().includes(q.toLowerCase())
  );
  renderUsersTable(filtered);
}
function filterUserRole(role) {
  const filtered = role ? _allUsers.filter(u => u.role === role) : _allUsers;
  renderUsersTable(filtered);
}

/* ─────────────────────────────────────────
   PARKING TAB
───────────────────────────────────────── */
let _allParking = [];

async function loadParking() {
  const tbody = document.getElementById('parking-table-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="loading-row"><td colspan="8">Loading parking lots…</td></tr>';
  try {
    const res = await apiCall('GET', '/parking/admin/all?limit=200');
    _allParking = res.data || [];
    renderParkingTable(_allParking);
    const title = document.getElementById('parking-table-title');
    if (title) title.textContent = `All Parking Locations (${_allParking.length})`;
    const badge = document.getElementById('pending-count-badge');

    if (badge) badge.textContent = _allParking.length;
    populateOwnerDropdown();
  } catch (e) {
    tbody.innerHTML = `<tr class="loading-row"><td colspan="8">Error: ${escHtml(e.message)}</td></tr>`;
  }
}

function renderParkingTable(lots) {
  const tbody = document.getElementById('parking-table-body');
  if (!tbody) return;
  if (lots.length === 0) {
    tbody.innerHTML = '<tr class="loading-row"><td colspan="8">No parking lots found</td></tr>';
    return;
  }
  tbody.innerHTML = lots.map(lot => {
    const status = !lot.isApproved ? 'pending' : lot.isActive ? 'approved' : 'inactive';
    const statusBadge = status === 'approved'
      ? '<span class="badge badge-green">Approved</span>'
      : status === 'pending'
        ? '<span class="badge badge-amber">Pending</span>'
        : '<span class="badge badge-muted">Inactive</span>';
    const actions = status === 'pending'
      ? `<button class="btn btn-primary btn-sm" onclick="approveLot(this,${lot.id},'${escHtml(lot.name)}')">Approve</button>
         <button class="btn btn-outline btn-sm" onclick="rejectLot(this,${lot.id},'${escHtml(lot.name)}')">Reject</button>`
      : `<button class="btn btn-ghost btn-sm" onclick="toggleLotActive(this,${lot.id},'${escHtml(lot.name)}',${lot.isActive})">${lot.isActive ? 'Deactivate' : 'Activate'}</button>
         <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteLot(this,${lot.id},'${escHtml(lot.name)}')">Delete</button>`;
    const ownerName = lot.owner ? escHtml((lot.owner.firstName || '') + ' ' + (lot.owner.lastName || '')) : '—';
    const avail = lot.availableSlots !== undefined ? lot.availableSlots : '—';
    const total = lot.totalSlots || '—';
    const rating = lot.rating ? `★ ${parseFloat(lot.rating).toFixed(1)}` : '—';
    return `
      <tr data-status="${status}" data-id="${lot.id}">
        <td style="font-weight:500">${escHtml(lot.name)}</td>
        <td>${ownerName}</td>
        <td>${escHtml(lot.city || '—')}</td>
        <td>${avail}/${total}</td>
        <td style="color:var(--amber)">${fmtCurrency(lot.pricePerHour)}</td>
        <td>${rating}</td>
        <td>${statusBadge}</td>
        <td><div style="display:flex;gap:.4rem">${actions}</div></td>
      </tr>`;
  }).join('');
}

async function populateOwnerDropdown() {
  const sel = document.getElementById('new-parking-owner');
  if (!sel) return;
  sel.innerHTML = '<option value="">Loading owners…</option>';
  try {
    const res = await apiCall('GET', '/users/admin/owners');
    const owners = res.data || [];
    if (owners.length === 0) {
      sel.innerHTML = '<option value="">No owners registered yet</option>';
    } else {
      sel.innerHTML = '<option value="">Select owner…</option>' +
        owners.map(o => `<option value="${o.id}">${escHtml(o.firstName + ' ' + o.lastName)} (${escHtml(o.email)})</option>`).join('');
    }
  } catch (e) {
    sel.innerHTML = '<option value="">Failed to load owners</option>';
    console.error('populateOwnerDropdown error:', e);
  }
}

async function approveLot(btn, id, name) {
  if (!confirm(`Approve "${name}"?`)) return;
  btn.disabled = true; btn.textContent = '…';
  try {
    await apiCall('PATCH', `/parking/admin/${id}/approve`);
    toast(`✅ ${name} approved!`, 'success');
    loadParking();
    loadOverview();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
    btn.disabled = false; btn.textContent = 'Approve';
  }
}

async function rejectLot(btn, id, name) {
  if (!confirm(`Reject "${name}"? This cannot be undone.`)) return;
  btn.disabled = true; btn.textContent = '…';
  try {
    await apiCall('PATCH', `/parking/admin/${id}/reject`);
    toast(`${name} rejected`, 'error');
    loadParking();
    loadOverview();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
    btn.disabled = false; btn.textContent = 'Reject';
  }
}

async function toggleLotActive(btn, id, name, currentlyActive) {
  const newActive = !currentlyActive;
  if (!confirm(`${newActive ? 'Activate' : 'Deactivate'} "${name}"?`)) return;
  btn.disabled = true;
  try {
    await apiCall('PATCH', `/parking/admin/${id}/toggle-active`, { active: newActive });
    toast(`${name} ${newActive ? 'activated' : 'deactivated'}`, 'info');
    loadParking();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
    btn.disabled = false;
  }
}

async function deleteLot(btn, id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  btn.disabled = true;
  try {
    await apiCall('DELETE', `/parking/admin/${id}`);
    toast(`${name} deleted`, 'error');
    loadParking();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
    btn.disabled = false;
  }
}

function filterParking(q) {
  const filtered = _allParking.filter(p =>
    (p.name + ' ' + (p.city || '')).toLowerCase().includes(q.toLowerCase())
  );
  renderParkingTable(filtered);
}
function filterParkingStatus(status) {
  if (!status) { renderParkingTable(_allParking); return; }
  const filtered = _allParking.filter(p => {
    const s = !p.isApproved ? 'pending' : p.isActive ? 'approved' : 'inactive';
    return s === status;
  });
  renderParkingTable(filtered);
}

/* ─────────────────────────────────────────
   BOOKINGS TAB
───────────────────────────────────────── */
let _allBookings = [];

async function loadBookings() {
  const tbody = document.getElementById('bookings-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="loading-row"><td colspan="8">Loading bookings…</td></tr>';
  try {
    const res = await apiCall('GET', '/users/admin/bookings?limit=200');
    _allBookings = res.data || [];
    renderBookingsTable(_allBookings);
    const title = document.getElementById('bookings-table-title');
    if (title) title.textContent = `All Bookings (${_allBookings.length})`;
    const totalRev = _allBookings.reduce((s, b) => s + (b.totalAmount || 0), 0);
    const revEl = document.getElementById('bookings-total-revenue');
    if (revEl) revEl.textContent = fmtCurrency(totalRev);
  } catch (e) {
    tbody.innerHTML = `<tr class="loading-row"><td colspan="8">Error: ${escHtml(e.message)}</td></tr>`;
  }
}

function renderBookingsTable(bookings) {
  const tbody = document.getElementById('bookings-tbody');
  if (!tbody) return;
  if (bookings.length === 0) {
    tbody.innerHTML = '<tr class="loading-row"><td colspan="8">No bookings found</td></tr>';
    return;
  }

  const statusBadge = s => {
    const map = {
      pending: { cls: 'badge-amber', label: 'Pending' },
      confirmed: { cls: 'badge-green', label: 'Confirmed' },
      active: { cls: 'badge-blue', label: 'Active' },
      completed: { cls: 'badge-muted', label: 'Completed' },
      cancelled: { cls: 'badge-red', label: 'Cancelled' },
    };
    const { cls, label } = map[s] || { cls: 'badge-muted', label: s };
    return `<span class="badge ${cls}">${label}</span>`;
  };

  const actionMenus = b => {
    const s = b.status;
    const btns = [];

    // View details — always shown
    btns.push(`<button class="bk-action-btn bk-view" onclick="viewBookingDetails(${b.id})">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Details</button>`);

    // Confirm — pending only
    if (s === 'pending')
      btns.push(`<button class="bk-action-btn bk-confirm" onclick="adminBookingAction(this,${b.id},'${escHtml(b.bookingCode)}','confirm')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>Confirm</button>`);

    // Check-In — confirmed only
    if (s === 'confirmed')
      btns.push(`<button class="bk-action-btn bk-checkin" onclick="adminBookingAction(this,${b.id},'${escHtml(b.bookingCode)}','checkin')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>Check-In</button>`);

    // Check-Out — active only
    if (s === 'active')
      btns.push(`<button class="bk-action-btn bk-checkout" onclick="adminBookingAction(this,${b.id},'${escHtml(b.bookingCode)}','checkout')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Check-Out</button>`);

    // Cancel — pending / confirmed / active
    if (['pending', 'confirmed', 'active'].includes(s))
      btns.push(`<button class="bk-action-btn bk-cancel" onclick="adminBookingAction(this,${b.id},'${escHtml(b.bookingCode)}','cancel')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Cancel</button>`);

    return `<div class="bk-actions-wrap">${btns.join('')}</div>`;
  };

  const hrs = b => b.durationHours ? parseFloat(b.durationHours).toFixed(1) + ' hrs' : '—';

  tbody.innerHTML = bookings.map(b => `
    <tr data-status="${escHtml(b.status)}" data-id="${b.id}">
      <td class="code-cell">${escHtml(b.bookingCode)}</td>
      <td>${escHtml((b.user.firstName + ' ' + b.user.lastName).trim())}</td>
      <td>${escHtml(b.parking.name)}</td>
      <td>${hrs(b)}</td>
      <td>${fmtCurrency(b.totalAmount)}</td>
      <td><span class="badge ${b.paymentStatus === 'paid' ? 'badge-green' : 'badge-amber'}">${escHtml(b.paymentStatus || '—')}</span></td>
      <td>${statusBadge(b.status)}</td>
      <td>${actionMenus(b)}</td>
    </tr>`).join('');
}

async function adminBookingAction(btn, id, code, action) {
  const msgs = {
    confirm: `Mark booking ${code} as confirmed (payment received)?`,
    checkin: `Force check-in for booking ${code}?`,
    checkout: `Force check-out for booking ${code}?`,
    cancel: `Cancel booking ${code}? This cannot be undone.`
  };
  if (!confirm(msgs[action])) return;
  btn.disabled = true;
  try {
    await apiCall('PATCH', `/users/admin/bookings/${id}/${action}`);
    const ok = { confirm: 'Booking confirmed', checkin: 'Checked in', checkout: 'Checked out', cancel: 'Booking cancelled' };
    toast(`${ok[action]} — ${code}`, action === 'cancel' ? 'info' : 'success');
    loadBookings();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
    btn.disabled = false;
  }
}

// Legacy alias
function cancelBooking(btn, id, code) { adminBookingAction(btn, id, code, 'cancel'); }

function viewBookingDetails(id) {
  const b = _allBookings.find(x => x.id === id);
  if (!b) { toast('Booking not found', 'error'); return; }

  const fmt = dt => dt ? new Date(dt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const sColor = { pending: '#f59e0b', confirmed: '#10b981', active: '#3b82f6', completed: '#6b7280', cancelled: '#ef4444' }[b.status] || '#6b7280';

  document.getElementById('booking-detail-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'booking-detail-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem';
  modal.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.5)">
      <div style="padding:1.25rem 1.5rem;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:.25rem">Booking Details</div>
          <div style="font-size:.95rem;font-weight:700;color:var(--amber);font-family:monospace">${escHtml(b.bookingCode)}</div>
        </div>
        <button onclick="document.getElementById('booking-detail-modal').remove()"
          style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1.5rem;line-height:1">&times;</button>
      </div>
      <div style="padding:1.4rem;display:grid;gap:.9rem">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">
          <div class="detail-tile"><span class="dtile-label">Status</span>
            <span style="display:inline-block;background:${sColor}22;color:${sColor};border:1px solid ${sColor}44;font-size:.72rem;font-weight:700;padding:.25rem .65rem;border-radius:999px;margin-top:.1rem">
              ${b.status.charAt(0).toUpperCase() + b.status.slice(1)}</span></div>
          <div class="detail-tile"><span class="dtile-label">Payment</span>
            <span class="badge ${b.paymentStatus === 'paid' ? 'badge-green' : 'badge-amber'}" style="margin-top:.1rem;font-size:.72rem">${escHtml(b.paymentStatus || '—')}</span></div>
        </div>
        <div class="detail-tile"><span class="dtile-label">User</span>
          <span class="dtile-val">${escHtml((b.user.firstName + ' ' + b.user.lastName).trim())}</span>
          <span style="font-size:.75rem;color:var(--muted)">${escHtml(b.user.email)}</span></div>
        <div class="detail-tile"><span class="dtile-label">Parking</span>
          <span class="dtile-val">${escHtml(b.parking.name)}</span>
          <span style="font-size:.75rem;color:var(--muted)">${escHtml(b.parking.city || '')}</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">
          <div class="detail-tile"><span class="dtile-label">Vehicle No.</span><span class="dtile-val">${escHtml(b.vehicleNumber || '—')}</span></div>
          <div class="detail-tile"><span class="dtile-label">Vehicle Type</span><span class="dtile-val" style="text-transform:capitalize">${escHtml(b.vehicleType || '—')}</span></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">
          <div class="detail-tile"><span class="dtile-label">Scheduled Start</span><span class="dtile-val" style="font-size:.8rem">${fmt(b.startTime)}</span></div>
          <div class="detail-tile"><span class="dtile-label">Scheduled End</span><span class="dtile-val" style="font-size:.8rem">${fmt(b.endTime)}</span></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">
          <div class="detail-tile"><span class="dtile-label">Actual Check-In</span><span class="dtile-val" style="font-size:.8rem">${fmt(b.actualCheckIn)}</span></div>
          <div class="detail-tile"><span class="dtile-label">Actual Check-Out</span><span class="dtile-val" style="font-size:.8rem">${fmt(b.actualCheckOut)}</span></div>
        </div>
        <div style="background:var(--bg);border-radius:8px;padding:1rem;display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;text-align:center">
          <div><div style="font-size:.68rem;color:var(--muted);margin-bottom:.25rem">Base Amount</div><div style="font-weight:600">${fmtCurrency(b.baseAmount)}</div></div>
          <div><div style="font-size:.68rem;color:var(--muted);margin-bottom:.25rem">Tax</div><div style="font-weight:600">${fmtCurrency(b.taxAmount)}</div></div>
          <div><div style="font-size:.68rem;color:var(--muted);margin-bottom:.25rem">Total</div><div style="font-weight:700;color:var(--amber)">${fmtCurrency(b.totalAmount)}</div></div>
        </div>
        ${b.cancellationReason ? `<div class="detail-tile"><span class="dtile-label">Cancellation Reason</span><span class="dtile-val" style="font-size:.82rem;color:var(--muted);font-weight:400">${escHtml(b.cancellationReason)}</span></div>` : ''}
        <div class="detail-tile"><span class="dtile-label">Booking Created</span><span class="dtile-val" style="font-size:.82rem">${fmt(b.createdAt)}</span></div>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

function filterBookings(q) {
  const filtered = _allBookings.filter(b =>
    (b.bookingCode + ' ' + b.user.firstName + ' ' + b.user.lastName + ' ' + b.parking.name)
      .toLowerCase().includes(q.toLowerCase())
  );
  renderBookingsTable(filtered);
}
function filterBookingStatus(status) {
  const filtered = status ? _allBookings.filter(b => b.status === status.toLowerCase()) : _allBookings;
  renderBookingsTable(filtered);
}

function exportCSV() {
  const rows = [['Code', 'User', 'Parking', 'Duration', 'Amount', 'Payment', 'Status']];
  const vis = document.querySelectorAll('#bookings-table tbody tr:not([style*="none"])');
  vis.forEach(row => {
    if (row.classList.contains('loading-row')) return;
    rows.push([...row.cells].slice(0, 7).map(c => c.textContent.trim()));
  });
  const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'bookings-export.csv';
  a.click();
  toast('Bookings exported!', 'success');
}

/* ─────────────────────────────────────────
   PROMOS TAB
───────────────────────────────────────── */
let _allPromos = [];

async function loadPromos() {
  const tbody = document.getElementById('promos-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr class="loading-row"><td colspan="7">Loading promo codes…</td></tr>';
  try {
    const res = await apiCall('GET', '/users/admin/promos');
    _allPromos = res.data || [];
    renderPromosTable(_allPromos);
    const title = document.getElementById('promos-table-title');
    if (title) title.textContent = `Promo Codes (${_allPromos.length})`;
  } catch (e) {
    tbody.innerHTML = `<tr class="loading-row"><td colspan="7">Error: ${escHtml(e.message)}</td></tr>`;
  }
}

function renderPromosTable(promos) {
  const tbody = document.getElementById('promos-tbody');
  if (!tbody) return;
  if (promos.length === 0) {
    tbody.innerHTML = '<tr class="loading-row"><td colspan="7">No promo codes yet</td></tr>';
    return;
  }
  tbody.innerHTML = promos.map(p => {
    const typeLabel = p.discount_type === 'percentage' ? 'Percentage' : 'Fixed';
    const valLabel = p.discount_type === 'percentage'
      ? `${p.discount_value}%${p.max_discount ? ' (max ₹' + p.max_discount + ')' : ''}`
      : `₹${p.discount_value} off`;
    const used = p.max_uses ? `${p.used_count || 0} / ${p.max_uses}` : `${p.used_count || 0} / ∞`;
    const statusBadge = p.is_active
      ? '<span class="badge badge-green">Active</span>'
      : '<span class="badge badge-muted">Disabled</span>';
    const toggleLabel = p.is_active ? 'Disable' : 'Enable';
    return `
      <tr>
        <td style="font-weight:600;letter-spacing:.04em">${escHtml(p.code)}</td>
        <td>${typeLabel}</td>
        <td>${escHtml(valLabel)}</td>
        <td>${used}</td>
        <td class="date-cell">${p.valid_until ? new Date(p.valid_until).toLocaleDateString('en-IN') : '—'}</td>
        <td>${statusBadge}</td>
        <td><div style="display:flex;gap:.4rem">
          <button class="btn btn-ghost btn-sm" style="color:var(--amber)" onclick="togglePromo(this,${p.id},${p.is_active})">${toggleLabel}</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deletePromo(this,${p.id},'${escHtml(p.code)}')">Delete</button>
        </div></td>
      </tr>`;
  }).join('');
}

async function togglePromo(btn, id, currentlyActive) {
  btn.disabled = true;
  try {
    await apiCall('PATCH', `/users/admin/promos/${id}/toggle`, { active: !currentlyActive });
    toast(`Promo ${currentlyActive ? 'disabled' : 'enabled'}`, 'info');
    loadPromos();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
    btn.disabled = false;
  }
}

async function deletePromo(btn, id, code) {
  if (!confirm(`Delete promo code "${code}"? This cannot be undone.`)) return;
  btn.disabled = true;
  try {
    await apiCall('DELETE', `/users/admin/promos/${id}`);
    toast(`Promo "${code}" deleted`, 'error');
    loadPromos();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
    btn.disabled = false;
  }
}

async function submitAddPromo() {
  const code = document.getElementById('promo-code-input')?.value.trim().toUpperCase();
  const desc = document.getElementById('promo-desc-input')?.value.trim();
  const type = document.getElementById('promo-type-input')?.value;
  const value = parseFloat(document.getElementById('promo-value-input')?.value);
  const maxDisc = parseFloat(document.getElementById('promo-maxdiscount-input')?.value) || null;
  const maxUses = parseInt(document.getElementById('promo-maxuses-input')?.value) || null;
  const from = document.getElementById('promo-from-input')?.value;
  const until = document.getElementById('promo-until-input')?.value;

  if (!code || !type || !value || !from || !until) {
    toast('Please fill all required fields', 'error'); return;
  }
  try {
    await apiCall('POST', '/users/admin/promos', {
      code, description: desc, discountType: type, discountValue: value,
      maxDiscount: maxDisc, maxUses, validFrom: from, validUntil: until
    });
    closeModal('add-promo-modal');
    toast('Promo code created!', 'success');
    loadPromos();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

/* ─────────────────────────────────────────
   ANALYTICS TAB
───────────────────────────────────────── */
async function loadAnalytics() {
  // Re-use stats already fetched for overview
  try {
    const [statsRes, chartRes] = await Promise.all([
      apiCall('GET', '/users/admin/stats'),
      apiCall('GET', '/users/admin/revenue-chart')
    ]);
    const s = statsRes.data;
    const anMap = { 'an-revenue': fmtCurrency(s.totalRevenue), 'an-bookings': s.totalBookings, 'an-users': s.totalUsers, 'an-pending': s.pendingApprovals };
    Object.entries(anMap).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    });
    buildCharts(chartRes.data);
  } catch (e) { console.error('loadAnalytics error:', e); }
}

/* ─────────────────────────────────────────
   CHARTS — built from real API data
───────────────────────────────────────── */
function buildCharts(chartData) {
  // Build 7-day arrays from API data
  const days = [];
  const revArr = [];
  const bkArr = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-IN', { weekday: 'short' });
    const match = (chartData || []).find(r => r.day && r.day.slice(0, 10) === key);
    days.push(label);
    revArr.push(match ? match.revenue : 0);
    bkArr.push(match ? match.bookings : 0);
  }

  const maxR = Math.max(...revArr, 1);
  const maxB = Math.max(...bkArr, 1);

  function barHTML(vals, max, prefix) {
    return days.map((d, i) => {
      const h = ((vals[i] / max) * 100).toFixed(1);
      const val = vals[i] > 0 ? (prefix === '₹' ? fmtCurrency(vals[i]) : vals[i]) : '';
      return `<div class="bar-group">
        <div class="bar-val">${val}</div>
        <div class="bar" style="height:${h}%"></div>
        <div class="bar-label">${d}</div>
      </div>`;
    }).join('');
  }

  const rc = document.getElementById('revenue-chart');
  const bc = document.getElementById('bookings-chart');
  const rv2 = document.getElementById('rev-chart');
  if (rc) rc.innerHTML = barHTML(revArr, maxR, '₹');
  if (bc) bc.innerHTML = barHTML(bkArr, maxB, '');
  if (rv2) rv2.innerHTML = barHTML(revArr, maxR, '₹');
}

/* ─────────────────────────────────────────
   MODALS
───────────────────────────────────────── */
function openModal(id) { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

async function submitAddParking() {
  const name = document.getElementById('new-parking-name')?.value.trim();
  const city = document.getElementById('new-parking-city')?.value.trim();
  const state = document.getElementById('new-parking-state')?.value.trim();
  const address = document.getElementById('new-parking-address')?.value.trim();
  const slots = parseInt(document.getElementById('new-parking-slots')?.value);
  const price = parseFloat(document.getElementById('new-parking-price')?.value);
  const ownerId = document.getElementById('new-parking-owner')?.value;

  if (!name || !city || !address || !slots || !price || !ownerId) {
    toast('Please fill all required fields', 'error'); return;
  }
  try {
    await apiCall('POST', '/parking', {
      name, city, state, address,
      totalSlots: slots, pricePerHour: price,
      ownerId: parseInt(ownerId),
      latitude: 0, longitude: 0  // Admin can update coordinates later
    });
    closeModal('add-parking-modal');
    toast('Parking lot added! Pending approval.', 'success');
    loadParking();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

function saveSettings() { toast('Settings saved!', 'success'); }

/* ─────────────────────────────────────────
   SIDEBAR USER
───────────────────────────────────────── */
function initAdminUser() {
  try {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const nameEl = document.getElementById('admin-name');
    const avatarEl = document.getElementById('admin-avatar');
    if (nameEl) nameEl.textContent = (user.firstName || '') + ' ' + (user.lastName || '');
    if (avatarEl) avatarEl.textContent = initials(user.firstName, user.lastName);
  } catch (e) { }
}

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initAdminUser();
  loadOverview();

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', e => {
    e.preventDefault();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('adminAuth');
    toast('Signed out', 'info');
    setTimeout(() => { window.location.href = 'admin-login.html'; }, 600);
  });

  // Sidebar tabs
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      switchTab(link.dataset.tab, link);
    });
  });

  // Tab-link buttons
  document.querySelectorAll('[data-tab-link]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tabLink;
      const link = document.querySelector(`.sidebar-link[data-tab="${tab}"]`);
      switchTab(tab, link);
    });
  });

  // Modals
  document.getElementById('open-add-parking-btn')?.addEventListener('click', () => { openModal('add-parking-modal'); populateOwnerDropdown(); });
  document.getElementById('open-add-parking-btn2')?.addEventListener('click', () => { openModal('add-parking-modal'); populateOwnerDropdown(); });
  document.getElementById('open-add-promo-btn')?.addEventListener('click', () => openModal('add-promo-modal'));
  document.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modalClose));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
  });
  document.getElementById('submit-add-parking-btn')?.addEventListener('click', submitAddParking);
  document.getElementById('submit-add-promo-btn')?.addEventListener('click', submitAddPromo);
  document.getElementById('save-settings-btn')?.addEventListener('click', saveSettings);

  // Filters
  document.getElementById('user-search')?.addEventListener('input', e => filterUsers(e.target.value));
  document.getElementById('user-role-filter')?.addEventListener('change', e => filterUserRole(e.target.value));
  document.getElementById('parking-search')?.addEventListener('input', e => filterParking(e.target.value));
  document.getElementById('parking-status-filter')?.addEventListener('change', e => filterParkingStatus(e.target.value));
  document.getElementById('booking-search')?.addEventListener('input', e => filterBookings(e.target.value));
  document.getElementById('booking-status-filter')?.addEventListener('change', e => filterBookingStatus(e.target.value));
  document.getElementById('export-csv-btn')?.addEventListener('click', exportCSV);
});
