let map = null;
let markers = [];

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupEventListeners();
});

function initMap() {
  map = L.map('map').setView([20, 0], 2);
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);
}

function setupEventListeners() {
  document.getElementById('lookupBtn').addEventListener('click', handleLookup);
  document.getElementById('useMyIpBtn').addEventListener('click', handleUseMyIp);
  document.getElementById('ipInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLookup();
  });
}

async function handleLookup() {
  const ipInput = document.getElementById('ipInput');
  const ip = ipInput.value.trim();
  
  if (!isValidIP(ip)) {
    alert(i18n.t('invalid_ip'));
    return;
  }
  
  await lookupIP(ip);
}

async function handleUseMyIp() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    document.getElementById('ipInput').value = data.ip;
    await lookupIP(data.ip);
  } catch (error) {
    console.error('Failed to get IP:', error);
    alert(i18n.t('error'));
  }
}

async function lookupIP(ip) {
  showLoading(true);
  clearMap();
  
  try {
    const ipData = await fetchIPData(ip);
    displayIPInfo(ipData);
    
    if (ipData.latitude && ipData.longitude) {
      updateMap(ipData.latitude, ipData.longitude, ip);
      await fetchAndDisplayPOI(ipData.latitude, ipData.longitude);
    }
  } catch (error) {
    console.error('Lookup error:', error);
    alert(i18n.t('error'));
  } finally {
    showLoading(false);
  }
}

async function fetchIPData(ip) {
  const response = await fetch(`/api/ip/${ip}`);
  if (!response.ok) throw new Error('Failed to fetch IP data');
  return await response.json();
}

function displayIPInfo(data) {
  document.getElementById('ipInfo').classList.remove('hidden');
  document.getElementById('ipValue').textContent = data.ip || '-';
  document.getElementById('countryValue').textContent = data.country_name || '-';
  document.getElementById('regionValue').textContent = data.region || '-';
  document.getElementById('cityValue').textContent = data.city || '-';
  document.getElementById('ispValue').textContent = data.org || '-';
  document.getElementById('orgValue').textContent = data.org || '-';
  document.getElementById('asnValue').textContent = data.asn || '-';
  document.getElementById('ipTypeValue').textContent = determineIPType(data.org);
}

function determineIPType(org) {
  if (!org) return i18n.t('unknown');
  
  const datacenterKeywords = [
    'Amazon', 'Google Cloud', 'DigitalOcean', 'Cloudflare',
    'Microsoft Azure', 'Alibaba Cloud', 'Oracle Cloud',
    'IBM Cloud', 'Tencent Cloud', 'Hetzner', 'Linode',
    'Vultr', 'OVH', 'Rackspace', 'Datacenter', 'Hosting'
  ];
  
  const orgLower = org.toLowerCase();
  const isDatacenter = datacenterKeywords.some(keyword => 
    orgLower.includes(keyword.toLowerCase())
  );
  
  return isDatacenter ? i18n.t('datacenter') : i18n.t('residential');
}

function updateMap(lat, lng, ip) {
  map.setView([lat, lng], 13);
  
  const marker = L.marker([lat, lng]).addTo(map);
  marker.bindPopup(`<b>${ip}</b><br>${lat}, ${lng}`).openPopup();
  markers.push(marker);
}

async function fetchAndDisplayPOI(lat, lng) {
  try {
    const response = await fetch(`/api/poi?lat=${lat}&lng=${lng}`);
    if (!response.ok) throw new Error('Failed to fetch POI data');
    const pois = await response.json();
    
    displayPOIOnMap(pois, lat, lng);
    displayPOIList(pois, lat, lng);
  } catch (error) {
    console.error('POI fetch error:', error);
  }
}

function displayPOIOnMap(pois, centerLat, centerLng) {
  const poiSection = document.getElementById('poiSection');
  
  if (!pois || pois.length === 0) {
    poiSection.classList.add('hidden');
    return;
  }
  
  poiSection.classList.remove('hidden');
  
  pois.forEach(poi => {
    const icon = getPOIIcon(poi.type);
    const marker = L.marker([poi.lat, poi.lng], { icon }).addTo(map);
    
    const distance = calculateDistance(centerLat, centerLng, poi.lat, poi.lng);
    const distanceText = i18n.t('distance_km', { distance: distance.toFixed(2) });
    
    marker.bindPopup(`<b>${poi.name}</b><br>${distanceText}`).openPopup();
    markers.push(marker);
  });
}

function displayPOIList(pois, centerLat, centerLng) {
  const poiList = document.getElementById('poiList');
  poiList.innerHTML = '';
  
  if (!pois || pois.length === 0) {
    poiList.innerHTML = `<p class="text-gray-600">${i18n.t('no_poi_found')}</p>`;
    return;
  }
  
  pois.forEach(poi => {
    const distance = calculateDistance(centerLat, centerLng, poi.lat, poi.lng);
    const distanceText = i18n.t('distance_km', { distance: distance.toFixed(2) });
    const icon = getPOIEmoji(poi.type);
    
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer';
    div.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="text-2xl">${icon}</span>
        <div>
          <p class="font-medium text-gray-800">${poi.name}</p>
          <p class="text-sm text-gray-600">${i18n.t(poi.type)}</p>
        </div>
      </div>
      <span class="text-sm text-gray-600">${distanceText}</span>
    `;
    
    div.addEventListener('click', () => {
      map.setView([poi.lat, poi.lng], 16);
    });
    
    poiList.appendChild(div);
  });
}

function getPOIIcon(type) {
  const icons = {
    hospital: L.divIcon({
      html: '🏥',
      className: 'text-2xl',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    }),
    school: L.divIcon({
      html: '🎓',
      className: 'text-2xl',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    }),
    police: L.divIcon({
      html: '🚓',
      className: 'text-2xl',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    })
  };
  
  return icons[type] || L.divIcon({
    html: '📍',
    className: 'text-2xl',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

function getPOIEmoji(type) {
  const emojis = {
    hospital: '🏥',
    school: '🎓',
    police: '🚓'
  };
  
  return emojis[type] || '📍';
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

function isValidIP(ip) {
  const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Pattern = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){0,6}::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}$/;
  
  return ipv4Pattern.test(ip) || ipv6Pattern.test(ip);
}

function clearMap() {
  markers.forEach(marker => map.removeLayer(marker));
  markers = [];
  document.getElementById('poiSection').classList.add('hidden');
}

function showLoading(show) {
  const lookupBtn = document.getElementById('lookupBtn');
  if (show) {
    lookupBtn.disabled = true;
    lookupBtn.textContent = i18n.t('loading');
  } else {
    lookupBtn.disabled = false;
    lookupBtn.textContent = i18n.t('lookup');
  }
}
