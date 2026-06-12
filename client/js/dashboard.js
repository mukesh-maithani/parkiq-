/**
 * ParkIQ — dashboard.js
 * User dashboard: stats, bookings, charts, user info
 * CSP-safe — koi inline scripts nahi
 */
 
/* ─────────────────────────────────────────
   DEV MODE AUTH BYPASS
───────────────────────────────────────── */
// Auth bypass removed — users must log in
   
  /* ─────────────────────────────────────────
     USER INFO
  ───────────────────────────────────────── */
  function initUserInfo() {
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      if (!user) return;
   
      const name     = user.firstName || 'there';
      const fullName = (user.firstName || '') + ' ' + (user.lastName || '');
      const initials = ((user.firstName || '')[0] || '') + ((user.lastName || '')[0] || '');
   
      const topbarName   = document.getElementById('topbar-name');
      const sidebarName  = document.getElementById('sidebar-name');
      const sidebarAvatar= document.getElementById('sidebar-avatar');
      const userAvatarBtn= document.getElementById('user-avatar-btn');
   
      if (topbarName)    topbarName.textContent    = name;
      if (sidebarName)   sidebarName.textContent   = fullName.trim();
      if (sidebarAvatar) sidebarAvatar.textContent = initials.toUpperCase();
      if (userAvatarBtn) userAvatarBtn.textContent = initials.toUpperCase();
   
      // Fix #8: Update role chip visibility
      const roleChip = document.getElementById('role-badge');
      if (roleChip) {
        if (user.role === 'owner') {
          roleChip.textContent = 'Owner';
          roleChip.className = 'role-chip role-chip-owner';
          // redirect owner away from user dashboard
          window.location.href = 'owner-dashboard.html';
          return;
        } else {
          roleChip.textContent = 'User';
          roleChip.className = 'role-chip role-chip-user';
        }
      }
      const sidebarRole = document.getElementById('sidebar-role');
      if (sidebarRole) sidebarRole.textContent = 'Driver';
   
      // Greeting based on time
      const hour = new Date().getHours();
      const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
      const titleEl = document.querySelector('.topbar-title');
      if (titleEl) titleEl.innerHTML = `${greeting}, <span id="topbar-name">${name}</span> 👋`;
   
    } catch (e) { console.warn('User info error:', e); }
  }
   
  /* ─────────────────────────────────────────
     DATE
  ───────────────────────────────────────── */
  function initDate() {
    const el = document.getElementById('topbar-date');
    if (el) {
      el.textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
    }
  }
   
  /* ─────────────────────────────────────────
     STATS — load from API, fallback to static
  ───────────────────────────────────────── */
  async function loadStats() {
    try {
      const res = await api.get('/bookings/my-stats');
      if (res.success && res.data) {
        setEl('stat-total', res.data.totalBookings ?? 0);
        setEl('stat-hours', res.data.totalHours    ?? 0);
        setEl('stat-spent', '₹' + (res.data.totalSpent ?? 0).toFixed(2));
        setEl('stat-saved', res.data.savedSpots    ?? 0);
        setEl('active-count', res.data.activeBookings ?? 0);
      }
    } catch {
      // static fallback — already in HTML
    }
  }
   
  /* ─────────────────────────────────────────
     RECENT BOOKINGS — load from API
  ───────────────────────────────────────── */
  async function loadRecentBookings() {
    try {
      const res = await api.get('/bookings?limit=3&sortBy=createdAt&order=desc');
      if (!res.success || !res.data?.length) return;
   
      const container = document.getElementById('recent-bookings');
      if (!container) return;
   
      const statusBadge = s => {
        const map = { active:'badge-amber', confirmed:'badge-green', completed:'badge-muted', cancelled:'badge-red' };
        return `<span class="badge ${map[s] || 'badge-muted'}">${s.charAt(0).toUpperCase()+s.slice(1)}</span>`;
      };
   
      container.innerHTML = res.data.map(b => `
        <div class="booking-item">
          <div class="booking-icon">
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div class="booking-info">
            <div class="booking-name">${b.parkingName || b.parking_name || 'Parking'}</div>
            <div class="booking-meta">${formatDate(b.startTime || b.start_time)} · ${b.bookingCode || b.booking_code || ''}</div>
          </div>
          <div>
            <div class="booking-amount">₹${Number(b.totalAmount || b.total_amount || 0).toFixed(2)}</div>
            <div style="text-align:right;margin-top:3px">${statusBadge(b.status)}</div>
          </div>
        </div>`).join('');
    } catch {
      // static HTML fallback already shown
    }
  }
   
  /* ─────────────────────────────────────────
     ACTIVE BOOKING BANNER
  ───────────────────────────────────────── */
  async function loadActiveBanner() {
    try {
      const res = await api.get('/bookings?status=active&limit=1');
      const banner = document.getElementById('active-booking-banner');
      if (!banner) return;
   
      if (!res.success || !res.data?.length) {
        banner.style.display = 'none';
        const si = document.getElementById('active-session-info');
        if (si) si.textContent = 'No active session';
        return;
      }
      const b = res.data[0];
      banner.querySelector('div[style*="font-weight"]').textContent =
        `Active booking at ${b.parkingName || b.parking_name || "Parking"}`;
      const sessionInfo = document.getElementById('active-session-info');
      if (sessionInfo) {
        const endTime = b.endTime || b.end_time;
        const code    = b.bookingCode || b.booking_code || '';
        const vehicle = b.vehicleNumber || b.vehicle_number || '';
        const endLabel = endTime ? 'Session ends at ' + new Date(endTime).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }) : '';
        sessionInfo.textContent = [endLabel, code, vehicle ? 'Vehicle: '+vehicle : ''].filter(Boolean).join(' · ');
      }
    } catch {
      // keep static banner
    }
  }
   
  /* ─────────────────────────────────────────
     SPEND CHART
  ───────────────────────────────────────── */
  function buildSpendChart() {
    const chart = document.getElementById('spend-chart');
    if (!chart) return;
   
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const vals = [0, 0, 0, 0, 0, 0, 0];
    const max  = Math.max(...vals) || 1;
   
    chart.innerHTML = days.map((d, i) => `
      <div class="bar-group">
        <div class="bar-val">${vals[i] > 0 ? '₹' + vals[i] : ''}</div>
        <div class="bar" style="height:${(vals[i] / max * 100).toFixed(1)}%" title="₹${vals[i]}"></div>
        <div class="bar-label">${d}</div>
      </div>`).join('');
  }
   
  /* ─────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────── */
  function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }
   
  function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch { return '—'; }
  }
   
  /* ─────────────────────────────────────────
     INIT
  ───────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    // Guard: redirect to login if not authenticated
    if (typeof auth !== 'undefined' && !auth.isLoggedIn()) {
      window.location.href = 'login.html';
      return;
    }
    initUserInfo();
    initDate();
    buildSpendChart();
    loadStats();
    loadRecentBookings();
    loadActiveBanner();
  });