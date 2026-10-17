let map;
let markers = new Map();
let currentUser = null;

async function initEditor() {
  const session = await getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = session.user;
  const role = await getUserRole(currentUser.id);

  if (role !== 'editor') {
    document.getElementById('map').innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff6b6b;font-size:18px;">Access denied — editor role required</div>';
    return;
  }

  document.getElementById('user-email').textContent = currentUser.email;

  map = L.map('map', {
    center: CONFIG.DEFAULT_CENTER,
    zoom: CONFIG.DEFAULT_ZOOM,
    maxBounds: CONFIG.MAP_BOUNDS,
    maxBoundsViscosity: 1.0,
    minZoom: 12,
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
    detectRetina: true,
  }).addTo(map);

  await loadPins();
  subscribeToChanges();
}

async function loadPins() {
  const { data: pins, error } = await sb
    .from('pins')
    .select('*');

  if (error) {
    console.error('Failed to load pins:', error);
    return;
  }

  pins.forEach((pin) => addMarker(pin));
}

function subscribeToChanges() {
  sb
    .channel('pins-editor')
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

  const marker = L.marker([pin.lat, pin.lng], { icon, draggable: true })
    .addTo(map)
    .bindPopup(() => buildPopupContent(pin));

  marker.on('dragend', () => {
    const pos = marker.getLatLng();
    updatePinPosition(pin.id, pos.lat, pos.lng);
  });

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
  entry.data = pin;
}

function removeMarker(pinId) {
  const entry = markers.get(pinId);
  if (!entry) return;
  map.removeLayer(entry.marker);
  markers.delete(pinId);
}

function buildPopupContent(pin) {
  const div = document.createElement('div');
  div.className = 'info-window';
  div.innerHTML = `
    <h3>${escapeHtml(pin.label)}</h3>
    ${pin.description ? `<p>${escapeHtml(pin.description)}</p>` : ''}
    <p class="info-meta">Added ${new Date(pin.created_at).toLocaleString()}</p>
  `;

  const actions = document.createElement('div');
  actions.className = 'info-actions';

  const editBtn = document.createElement('button');
  editBtn.textContent = 'Edit';
  editBtn.onclick = () => openEditPinDialog(pin);

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Delete';
  deleteBtn.className = 'btn-danger';
  deleteBtn.onclick = () => deletePin(pin.id);

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  div.appendChild(actions);

  return div;
}

// --- Editor actions ---

let waitingForPin = false;

function toggleAddPinMode() {
  const btn = document.getElementById('btn-add-pin');
  waitingForPin = !waitingForPin;
  btn.classList.toggle('active', waitingForPin);
  btn.textContent = waitingForPin ? 'Click map to place pin...' : 'Add Pin';
  document.getElementById('map').style.cursor = waitingForPin ? 'crosshair' : '';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('map').addEventListener('click', (e) => {
    if (!waitingForPin || !map) return;
    const latlng = map.containerPointToLatLng(L.point(e.layerX, e.layerY));
    openAddPinDialog(latlng.lat, latlng.lng);
    waitingForPin = false;
  });
});

function openAddPinDialog(lat, lng) {
  const btn = document.getElementById('btn-add-pin');
  btn.classList.remove('active');
  btn.textContent = 'Add Pin';
  document.getElementById('map').style.cursor = '';

  document.getElementById('dialog-title').textContent = 'Add Pin';
  document.getElementById('pin-label').value = '';
  document.getElementById('pin-description').value = '';
  document.getElementById('pin-icon').value = '📍';
  document.getElementById('pin-lat').value = lat;
  document.getElementById('pin-lng').value = lng;
  document.getElementById('pin-id').value = '';
  document.getElementById('pin-dialog').style.display = 'flex';
}

function openEditPinDialog(pin) {
  map.closePopup();
  document.getElementById('dialog-title').textContent = 'Edit Pin';
  document.getElementById('pin-label').value = pin.label;
  document.getElementById('pin-description').value = pin.description || '';
  document.getElementById('pin-icon').value = pin.icon || '📍';
  document.getElementById('pin-lat').value = pin.lat;
  document.getElementById('pin-lng').value = pin.lng;
  document.getElementById('pin-id').value = pin.id;
  document.getElementById('pin-dialog').style.display = 'flex';
}

function closePinDialog() {
  document.getElementById('pin-dialog').style.display = 'none';
  waitingForPin = false;
  const btn = document.getElementById('btn-add-pin');
  btn.classList.remove('active');
  btn.textContent = 'Add Pin';
  btn.style.display = '';
  document.getElementById('map').style.cursor = '';
}

async function savePinFromDialog() {
  const id = document.getElementById('pin-id').value;
  const label = document.getElementById('pin-label').value.trim();
  const description = document.getElementById('pin-description').value.trim();
  const icon = document.getElementById('pin-icon').value.trim() || '📍';
  const lat = parseFloat(document.getElementById('pin-lat').value);
  const lng = parseFloat(document.getElementById('pin-lng').value);

  if (!label) {
    alert('Label is required');
    return;
  }

  const pinData = { label, description, icon, lat, lng, user_id: currentUser.id };

  let error;
  if (id) {
    ({ error } = await sb.from('pins').update(pinData).eq('id', id));
  } else {
    ({ error } = await sb.from('pins').insert(pinData));
  }

  if (error) {
    alert('Failed to save pin: ' + error.message);
    return;
  }

  closePinDialog();
}

async function updatePinPosition(id, lat, lng) {
  const { error } = await sb.from('pins').update({ lat, lng }).eq('id', id);
  if (error) console.error('Failed to move pin:', error);
}

async function deletePin(id) {
  if (!confirm('Delete this pin?')) return;
  map.closePopup();
  const { error } = await sb.from('pins').delete().eq('id', id);
  if (error) alert('Failed to delete pin: ' + error.message);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initEditor);
