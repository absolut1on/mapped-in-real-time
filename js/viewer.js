const { createClient: createPublicClient } = window.supabase || window.Supabase || {};
const supabasePublic = createPublicClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

let map;
let markers = new Map();

function initViewer() {
  map = L.map('map', {
    center: CONFIG.DEFAULT_CENTER,
    zoom: CONFIG.DEFAULT_ZOOM,
    maxBounds: CONFIG.MAP_BOUNDS,
    maxBoundsViscosity: 1.0,
    minZoom: 12,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  loadPins();
  subscribeToChanges();
}

async function loadPins() {
  const { data: pins, error } = await supabasePublic
    .from('pins')
    .select('*');

  if (error) {
    console.error('Failed to load pins:', error);
    return;
  }

  pins.forEach((pin) => addMarker(pin));
}

function subscribeToChanges() {
  supabasePublic
    .channel('pins-realtime')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pins' },
      (payload) => addMarker(payload.new)
    )
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'pins' },
      (payload) => updateMarker(payload.new)
    )
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'pins' },
      (payload) => removeMarker(payload.old.id)
    )
    .subscribe();
}

function addMarker(pin) {
  if (markers.has(pin.id)) return;

  const icon = L.divIcon({
    className: 'custom-pin',
    html: `<span class="pin-icon">${pin.icon || '📍'}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });

  const marker = L.marker([pin.lat, pin.lng], { icon })
    .addTo(map)
    .bindPopup(buildPopupContent(pin));

  markers.set(pin.id, { marker, data: pin });
}

function updateMarker(pin) {
  const entry = markers.get(pin.id);
  if (!entry) {
    addMarker(pin);
    return;
  }

  entry.marker.setLatLng([pin.lat, pin.lng]);

  const icon = L.divIcon({
    className: 'custom-pin',
    html: `<span class="pin-icon">${pin.icon || '📍'}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
  entry.marker.setIcon(icon);
  entry.marker.setPopupContent(buildPopupContent(pin));
  entry.data = pin;
}

function removeMarker(pinId) {
  const entry = markers.get(pinId);
  if (!entry) return;
  map.removeLayer(entry.marker);
  markers.delete(pinId);
}

function buildPopupContent(pin) {
  return `
    <div class="info-window">
      <h3>${escapeHtml(pin.label)}</h3>
      ${pin.description ? `<p>${escapeHtml(pin.description)}</p>` : ''}
      <p class="info-meta">Added ${new Date(pin.created_at).toLocaleString()}</p>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initViewer);
