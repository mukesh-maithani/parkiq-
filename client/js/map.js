/**
 * ParkIQ — map.js
 */
 
let allParking   = [];
let filteredList = [];
let selectedId   = null;
let userLat      = 20.5937;
let userLng      = 78.9629;
let radiusKm     = 50;
let leafletMap   = null;
let userMarker   = null;
let parkingMarkers = {};
 
const filters = { ev: false, covered: false, handicap: false, security: false, open24: false };
let sortBy = 'distance';
let searchQuery = '';
 
/* ─────────────────────────────────────────
   MAP INIT
───────────────────────────────────────── */
function initMap(lat, lng) {
  if (leafletMap) {
    leafletMap.setView([lat, lng], 14);
    return;
  }
  if (!window.L) {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => _createMap(lat, lng);
    document.head.appendChild(script);
  } else {
    _createMap(lat, lng);
  }
}
 
function _createMap(lat, lng) {
  // ✅ FIX: Force the container to have a real pixel height before Leaflet touches it
  const mapEl = document.getElementById('leaflet-map');
  if (!mapEl) { console.error('❌ #leaflet-map element not found!'); return; }
 
  // Explicitly set height in JS so Leaflet cannot miss it
  mapEl.style.width  = '100%';
  mapEl.style.height = '100%';
  mapEl.style.minHeight = '400px';
  mapEl.style.position = 'absolute';
  mapEl.style.inset = '0';
 
  console.log('🗺️ Creating map at', lat, lng, '| container size:', mapEl.offsetWidth, 'x', mapEl.offsetHeight);
 
  leafletMap = L.map('leaflet-map', {
    center: [lat, lng],
    zoom: 14,
    zoomControl: false,
    attributionControl: true
  });
 
  // ✅ Try OpenStreetMap first (most reliable, no API key)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    maxZoom: 19,
    crossOrigin: true
  }).addTo(leafletMap);
 
  // User location marker
  userMarker = L.circleMarker([lat, lng], {
    radius: 9,
    fillColor: '#3B82F6',
    color: '#fff',
    weight: 3,
    opacity: 1,
    fillOpacity: 1
  }).addTo(leafletMap).bindPopup('<b>Your location</b>');
 
  // ✅ KEY FIX: invalidateSize after a short delay — forces Leaflet to
  // recalculate tile grid after the DOM has fully rendered
  setTimeout(() => {
    leafletMap.invalidateSize(true);
    console.log('✅ invalidateSize called — map should be visible now');
  }, 300);
 
  loadParking();
}
 
/* ─────────────────────────────────────────
   DATA
───────────────────────────────────────── */
async function loadParking() {
  showSkeletons();
  try {
    const params = new URLSearchParams({
      latitude:  userLat,
      longitude: userLng,
      radius:    radiusKm,
      sortBy:    sortBy,
      limit:     50
    });
    if (filters.ev)      params.set('hasEVCharging', 'true');
    if (filters.covered) params.set('isCovered',     'true');

    let res;
    try {
      res = await api.get(`/parking/nearby?${params}`);
      console.log('nearbyOK', res);
    } catch (nearbyErr) {
      console.warn('nearby failed:', JSON.stringify(nearbyErr));
      res = await api.get(`/parking?page=1&limit=50`);
      console.log('fallbackOK', res);
    }

    // Handle both response shapes
    const raw = res.data;
    if (Array.isArray(raw)) {
      allParking = raw;
    } else if (raw && Array.isArray(raw.parking)) {
      allParking = raw.parking;
    } else {
      allParking = [];
    }
    console.log('Loaded', allParking.length, 'lots:', allParking);
    applyFiltersAndRender();
  } catch (err) {
    console.error('loadParking FULL error:', JSON.stringify(err));
    allParking = [];
    applyFiltersAndRender();
    toast('Could not load parking data. Check server connection.', 'error');
  }
}
 
/* ─────────────────────────────────────────
   FILTER & SORT
───────────────────────────────────────── */
function applyFiltersAndRender() {
  filteredList = allParking.filter(p => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!p.name?.toLowerCase().includes(q) &&
          !p.address?.toLowerCase().includes(q) &&
          !p.city?.toLowerCase().includes(q)) return false;
    }
    if (filters.ev       && !p.hasEVCharging)     return false;
    if (filters.covered  && !p.isCovered)          return false;
    if (filters.handicap && !p.hasHandicapSpots)   return false;
    if (filters.security && !p.hasSecurity)        return false;
    if (filters.open24   && !p.is24Hours)          return false;
    return true;
  });
 
  filteredList.sort((a, b) => {
    if (sortBy === 'price')        return a.pricePerHour - b.pricePerHour;
    if (sortBy === 'rating')       return b.rating - a.rating;
    if (sortBy === 'availability') return (b.availableSlots / b.totalSlots) - (a.availableSlots / a.totalSlots);
    return (a.distance || 0) - (b.distance || 0);
  });
 
  renderList();
  renderMapMarkers();
  updateResultCount();
}
 
/* ─────────────────────────────────────────
   RENDER LIST
───────────────────────────────────────── */
function renderList() {
  const container = document.getElementById('parking-list');
  if (!container) return;
 
  if (filteredList.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:3rem 1rem;color:var(--muted)">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"
             style="display:block;margin:0 auto 1rem;opacity:.35">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
        </svg>
        <div style="font-size:.95rem;font-weight:600;margin-bottom:.4rem;color:rgba(255,255,255,.7)">No parking spots found</div>
        <p style="font-size:.8rem">No locations in your area yet.<br>Try expanding the radius or check back soon.</p>
      </div>`;
    return;
  }
 
  container.innerHTML = filteredList.map(p => parkingCardHTML(p)).join('');
  container.querySelectorAll('.parking-card').forEach(card => {
    card.addEventListener('click', () => selectParking(parseInt(card.dataset.id)));
  });
}
 
function parkingCardHTML(p) {
  const availClass = availabilityClass(p.availableSlots, p.totalSlots);
  const availText  = availabilityText(p.availableSlots, p.totalSlots);
  const rawAmenities = Array.isArray(p.amenities)
    ? p.amenities
    : (() => { try { return JSON.parse(p.amenities || '[]'); } catch { return []; } })();
  const amenities = rawAmenities.slice(0, 3);

  // Build price display for all vehicle types
  const { bike, car, heavy } = extractVehiclePrices(p);

  const priceHTML = (bike || car || heavy) ? `
    <div class="pc-price-grid">
      ${bike  ? `<div class="pc-price-item"><span class="pc-vehicle-icon">🏍️</span><span class="pc-vehicle-label">Bike</span><span class="pc-vehicle-price">₹${bike}</span></div>` : ''}
      ${car   ? `<div class="pc-price-item"><span class="pc-vehicle-icon">🚗</span><span class="pc-vehicle-label">Car</span><span class="pc-vehicle-price">₹${car}</span></div>` : ''}
      ${heavy ? `<div class="pc-price-item"><span class="pc-vehicle-icon">🚌</span><span class="pc-vehicle-label">Heavy</span><span class="pc-vehicle-price">₹${heavy}</span></div>` : ''}
    </div>` : `<div class="pc-price">₹${p.pricePerHour}<span class="pc-price-sub">/hr</span></div>`;

  return `
    <div class="parking-card${p.id === selectedId ? ' selected' : ''}" data-id="${p.id}">
      <div class="pc-header">
        <div class="pc-name">${p.name}</div>
      </div>
      <div class="pc-address">
        <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        ${p.address}
      </div>
      ${priceHTML}
      <div class="pc-meta">
        <div class="pc-avail">
          <div class="pc-avail-dot ${availClass}"></div>
          <span>${availText}</span>
        </div>
        <div class="pc-rating">
          <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          ${p.rating} <span style="color:var(--muted)">(${p.totalReviews})</span>
        </div>
        ${p.distance ? `<div class="pc-dist">${p.distance} km</div>` : ''}
      </div>
      ${amenities.length ? `<div class="pc-amenities">${amenities.map(a => `<span class="amenity-tag">${a}</span>`).join('')}</div>` : ''}
    </div>`;
}
 
function showSkeletons() {
  const container = document.getElementById('parking-list');
  if (!container) return;
  container.innerHTML = Array(4).fill(0).map(() => `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius-md);padding:1rem;margin-bottom:.75rem">
      <div class="skeleton" style="height:18px;width:70%;margin-bottom:8px"></div>
      <div class="skeleton" style="height:14px;width:50%;margin-bottom:12px"></div>
      <div class="skeleton" style="height:12px;width:85%"></div>
    </div>`).join('');
}
 
/* ─────────────────────────────────────────
   LEAFLET MARKERS
───────────────────────────────────────── */
function renderMapMarkers() {
  if (!leafletMap) return;
  Object.values(parkingMarkers).forEach(m => leafletMap.removeLayer(m));
  parkingMarkers = {};
 
  filteredList.forEach(p => {
    if (!p.latitude || !p.longitude) return;
    const unavail    = p.availableSlots === 0;
    const isSelected = p.id === selectedId;
 
    const icon = L.divIcon({
      className: '',
      html: `<div class="map-pin-leaflet${unavail ? ' unavail' : ''}${isSelected ? ' selected' : ''}">
               <div class="pin-pointer"></div>
             </div>`,
      iconSize:   [20, 28],
      iconAnchor: [10, 28]
    });
 
    const marker = L.marker([p.latitude, p.longitude], { icon })
      .addTo(leafletMap)
      .on('click', () => selectParking(p.id));
 
    parkingMarkers[p.id] = marker;
  });
}
 
/* ─────────────────────────────────────────
   SELECT PARKING
───────────────────────────────────────── */
function selectParking(id) {
  selectedId = id;
  const parking = filteredList.find(p => p.id === id);
  if (!parking) return;
 
  document.querySelectorAll('.parking-card').forEach(c =>
    c.classList.toggle('selected', parseInt(c.dataset.id) === id));
 
  const card = document.querySelector(`.parking-card[data-id="${id}"]`);
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
 
  if (leafletMap && parking.latitude && parking.longitude) {
    leafletMap.flyTo([parking.latitude, parking.longitude], 17, { animate: true, duration: 0.8 });
  }
 
  renderMapMarkers();
  openDetailDrawer(parking);
}
 
/* ─────────────────────────────────────────
   DETAIL DRAWER
───────────────────────────────────────── */
function openDetailDrawer(p) {
  const drawer = document.getElementById('detail-drawer');
  if (!drawer) return;
 
  const availClass = availabilityClass(p.availableSlots, p.totalSlots);
  const rawAmenities = Array.isArray(p.amenities)
    ? p.amenities
    : (() => { try { return JSON.parse(p.amenities || '[]'); } catch { return []; } })();
 
  const features = [
    { icon:'⚡', label:'EV Charging', active: p.hasEVCharging },
    { icon:'🏠', label:'Covered',     active: p.isCovered },
    { icon:'♿', label:'Handicap',    active: p.hasHandicapSpots },
    { icon:'🔒', label:'Security',    active: p.hasSecurity },
    { icon:'📹', label:'CCTV',        active: p.hasCCTV },
    { icon:'🕐', label:'24 Hours',    active: p.is24Hours },
  ].filter(f => f.active);
 
  const bike  = extractVehiclePrices(p).bike;
  const car   = extractVehiclePrices(p).car;
  const heavy = extractVehiclePrices(p).heavy;

  const drawerPriceHTML = (bike || car || heavy) ? `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-bottom:.75rem">
      ${bike ? `<div style="background:var(--bg3);border-radius:8px;padding:.5rem;text-align:center">
        <div style="font-size:1.1rem;margin-bottom:1px">🏍️</div>
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:1rem;color:var(--amber)">₹${bike}</div>
        <div style="font-size:.68rem;color:var(--muted)">Bike/hr</div>
      </div>` : ''}
      ${car ? `<div style="background:var(--bg3);border-radius:8px;padding:.5rem;text-align:center">
        <div style="font-size:1.1rem;margin-bottom:1px">🚗</div>
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:1rem;color:var(--amber)">₹${car}</div>
        <div style="font-size:.68rem;color:var(--muted)">Car/hr</div>
      </div>` : ''}
      ${heavy ? `<div style="background:var(--bg3);border-radius:8px;padding:.5rem;text-align:center">
        <div style="font-size:1.1rem;margin-bottom:1px">🚌</div>
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:1rem;color:var(--amber)">₹${heavy}</div>
        <div style="font-size:.68rem;color:var(--muted)">Heavy/hr</div>
      </div>` : ''}
    </div>` : `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-bottom:.75rem">
      <div style="background:var(--bg3);border-radius:8px;padding:.5rem;text-align:center">
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:1.2rem;color:var(--amber)">₹${p.pricePerHour}</div>
        <div style="font-size:.68rem;color:var(--muted)">per hour</div>
      </div>
      <div style="background:var(--bg3);border-radius:8px;padding:.5rem;text-align:center">
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:1.2rem">
          <span class="pc-avail-dot ${availClass}" style="display:inline-block;vertical-align:middle;margin-right:3px"></span>
          ${p.availableSlots}
        </div>
        <div style="font-size:.68rem;color:var(--muted)">of ${p.totalSlots} free</div>
      </div>
      <div style="background:var(--bg3);border-radius:8px;padding:.5rem;text-align:center">
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:1.2rem;color:var(--amber)">★ ${p.rating}</div>
        <div style="font-size:.68rem;color:var(--muted)">${p.totalReviews} reviews</div>
      </div>
    </div>`;

  // Availability + rating row (always show)
  const statsHTML = (bike || car || heavy) ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-bottom:.75rem">
      <div style="background:var(--bg3);border-radius:8px;padding:.5rem;text-align:center">
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:1rem">
          <span class="pc-avail-dot ${availClass}" style="display:inline-block;vertical-align:middle;margin-right:3px"></span>
          ${p.availableSlots}
        </div>
        <div style="font-size:.68rem;color:var(--muted)">of ${p.totalSlots} free</div>
      </div>
      <div style="background:var(--bg3);border-radius:8px;padding:.5rem;text-align:center">
        <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:1rem;color:var(--amber)">★ ${p.rating}</div>
        <div style="font-size:.68rem;color:var(--muted)">${p.totalReviews} reviews</div>
      </div>
    </div>` : '';
 
  drawer.innerHTML = `
    <div class="drawer-handle"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.6rem">
      <div>
        <h3 style="font-family:'Syne',sans-serif;font-weight:800;font-size:1rem;margin-bottom:.2rem">${p.name}</h3>
        <p style="font-size:.75rem;color:var(--muted);display:flex;align-items:center;gap:5px">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>${p.address}
        </p>
      </div>
      <button id="close-drawer-btn" style="background:none;border:none;cursor:pointer;color:var(--muted);padding:4px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    ${drawerPriceHTML}
    ${statsHTML}

    ${features.length ? `
    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:.65rem">
      ${features.map(f => `<span class="badge badge-amber">${f.icon} ${f.label}</span>`).join('')}
    </div>` : ''}

    <a href="booking.html?id=${p.id}&name=${encodeURIComponent(p.name)}&address=${encodeURIComponent(p.address)}&price=${car || p.pricePerHour}&lat=${p.latitude}&lng=${p.longitude}"
       class="btn btn-primary" style="width:100%;justify-content:center;font-size:.9rem;padding:.65rem;margin-bottom:.45rem">
      🅿️ Book Slot Now →
    </a>
    <a href="parking-details.html?id=${p.id}&name=${encodeURIComponent(p.name)}&address=${encodeURIComponent(p.address)}&price=${car || p.pricePerHour}"
       class="btn btn-outline" style="width:100%;justify-content:center;font-size:.82rem;padding:.55rem">View details</a>`;
  drawer.querySelector('#close-drawer-btn')?.addEventListener('click', closeDetailDrawer);
  drawer.classList.add('open');
}
 
function closeDetailDrawer() {
  document.getElementById('detail-drawer')?.classList.remove('open');
  selectedId = null;
  document.querySelectorAll('.parking-card').forEach(el => el.classList.remove('selected'));
  renderMapMarkers();
}
 
/* ─────────────────────────────────────────
   VEHICLE PRICE HELPER
   Prices are stored in amenities as "Bike: ₹20/hr", "Car: ₹50/hr", "Heavy: ₹100/hr"
   This extracts them from the amenities array so all vehicle types display correctly.
───────────────────────────────────────── */
function extractVehiclePrices(p) {
  const rawAmenities = Array.isArray(p.amenities)
    ? p.amenities
    : (() => { try { return JSON.parse(p.amenities || '[]'); } catch { return []; } })();

  let bike  = p.priceBike  || p.pricing?.bike  || null;
  let car   = p.priceCar   || p.pricing?.car   || null;
  let heavy = p.priceHeavy || p.pricing?.heavy || null;

  // Parse from amenities strings: "Bike: ₹20/hr", "Car: ₹50/hr", "Heavy: ₹100/hr"
  rawAmenities.forEach(a => {
    if (typeof a !== 'string') return;
    const m = a.match(/^(Bike|Car|Heavy):\s*₹(\d+(?:\.\d+)?)/i);
    if (!m) return;
    const type  = m[1].toLowerCase();
    const price = parseFloat(m[2]);
    if (type === 'bike'  && !bike)  bike  = price;
    if (type === 'car'   && !car)   car   = price;
    if (type === 'heavy' && !heavy) heavy = price;
  });

  // Fallback: if nothing found at all, use pricePerHour for car
  if (!bike && !car && !heavy) {
    car = p.pricePerHour || null;
  }

  return { bike, car, heavy };
}

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function availabilityClass(avail, total) {
  if (!total) return 'avail-none';
  const ratio = avail / total;
  if (ratio === 0) return 'avail-none';
  if (ratio < 0.2) return 'avail-low';
  return 'avail-good';
}
 
function availabilityText(avail, total) {
  if (!total) return 'No info';
  if (avail === 0) return 'Full';
  if (avail < total * 0.2) return `${avail} left`;
  return `${avail} available`;
}
 
function updateResultCount() {
  const el = document.getElementById('result-count');
  if (el) el.textContent = `${filteredList.length} location${filteredList.length !== 1 ? 's' : ''} found`;
}
 
/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const page = window.location.pathname.split('/').pop();
  if (page !== 'map.html') return;
 
  // Search
  document.getElementById('map-search')?.addEventListener('input', e => {
    searchQuery = e.target.value;
    applyFiltersAndRender();
  });
 
  // Filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.filter;
      if (!key) return;
      filters[key] = !filters[key];
      chip.classList.toggle('active', filters[key]);
      applyFiltersAndRender();
    });
  });
 
  // Sort
  document.getElementById('sort-select')?.addEventListener('change', e => {
    sortBy = e.target.value;
    applyFiltersAndRender();
  });
 
  // Radius
  document.getElementById('radius-select')?.addEventListener('change', e => {
    radiusKm = parseInt(e.target.value);
    loadParking();
  });
 
  // Zoom controls
  document.getElementById('zoom-in')?.addEventListener('click',  () => leafletMap?.zoomIn());
  document.getElementById('zoom-out')?.addEventListener('click', () => leafletMap?.zoomOut());
 
  // Locate me
  document.getElementById('locate-btn')?.addEventListener('click', () => {
    if (!navigator.geolocation) { toast('Geolocation not supported', 'error'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
        if (userMarker) userMarker.setLatLng([userLat, userLng]);
        if (leafletMap) leafletMap.flyTo([userLat, userLng], 14);
        toast('Location updated', 'success');
        loadParking();
      },
      () => toast('Could not get location. Please allow location access.', 'error')
    );
  });
 
  // ✅ Get user location then init map
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
        initMap(userLat, userLng);
      },
      () => {
        toast('Using default location. Click 📍 to use your location.', 'info');
        initMap(userLat, userLng);
      },
      { timeout: 8000 }
    );
  } else {
    initMap(userLat, userLng);
  }
});