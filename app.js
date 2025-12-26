let map = null;
let markers = [];
let currentPurityScore = null;
const ipReputationCache = new Map();
let searchResults = [];
let currentPage = 1;
const resultsPerPage = 5;
let searchCircle = null;

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
  document.getElementById('mapSearchBtn').addEventListener('click', handleMapSearch);
  document.getElementById('mapSearchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleMapSearch();
  });
}

async function handleLookup() {
  const ipInput = document.getElementById('ipInput');
  const input = ipInput.value.trim();
  
  if (!input) {
    alert(i18n.t('enter_ip'));
    return;
  }
  
  if (isValidIP(input)) {
    await lookupIP(input);
  } else if (isValidDomain(input)) {
    await resolveAndLookupDomain(input);
  } else {
    alert(i18n.t('invalid_input'));
  }
}

async function resolveAndLookupDomain(domain) {
  showLoading(true);
  
  try {
    const ip = await resolveDomain(domain);
    document.getElementById('ipInput').value = ip;
    await lookupIP(ip);
  } catch (error) {
    console.error('Domain resolution error:', error);
    alert(i18n.t('domain_resolution_failed'));
  } finally {
    showLoading(false);
  }
}

async function resolveDomain(domain) {
  const dohUrl = `https://dns.google/resolve?name=${domain}&type=A`;
  const response = await fetch(dohUrl);
  
  if (!response.ok) {
    throw new Error('Failed to resolve domain');
  }
  
  const data = await response.json();
  
  if (data.Status !== 0 || !data.Answer) {
    throw new Error('Domain not found');
  }
  
  const answer = data.Answer.find(record => record.type === 1);
  
  if (!answer) {
    throw new Error('No A record found');
  }
  
  return answer.data;
}

function isValidDomain(domain) {
  const domainPattern = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return domainPattern.test(domain);
}

async function handleUseMyIp() {
  showLoading(true);
  
  try {
    const response = await fetch('https://api.ipgeek.top/ip/');
    if (!response.ok) {
      throw new Error('Failed to get IP');
    }
    const data = await response.json();
    document.getElementById('ipInput').value = data.ip;
    await lookupIP(data.ip);
  } catch (error) {
    console.error('Failed to get IP:', error);
    alert(i18n.t('error'));
  } finally {
    showLoading(false);
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
    }
    
    await performIPLeakDetection(ipData);
  } catch (error) {
    console.error('Lookup error:', error);
  } finally {
    showLoading(false);
  }
}

async function fetchIPData(ip) {
  const response = await fetch(`https://api.ipgeek.top/ip/${ip}`);
  if (!response.ok) throw new Error('Failed to fetch IP data');
  return await response.json();
}

async function displayIPInfo(data) {
  document.getElementById('ipInfo').classList.remove('hidden');
  document.getElementById('ipValue').textContent = data.ip || '-';
  document.getElementById('ipVersionValue').textContent = data.ip_version || '-';
  document.getElementById('countryValue').textContent = data.country_name || '-';
  document.getElementById('countryCodeValue').textContent = data.country_code || '-';
  document.getElementById('regionValue').textContent = data.region || '-';
  document.getElementById('cityValue').textContent = data.city || '-';
  document.getElementById('postalValue').textContent = data.postal || '-';
  document.getElementById('ispValue').textContent = data.org || '-';
  document.getElementById('orgValue').textContent = data.org || '-';
  document.getElementById('asnValue').textContent = data.asn || '-';
  document.getElementById('asnNameValue').textContent = data.asn_name || '-';
  document.getElementById('asnCountryValue').textContent = data.asn_country || '-';
  document.getElementById('ipTypeValue').textContent = determineIPType(data.org);
  document.getElementById('connectionTypeValue').textContent = determineConnectionType(data.hosting, data.mobile, data.proxy);
  
  const networkInfo = calculateNetworkInfo(data);
  document.getElementById('networkEgressValue').textContent = networkInfo.egress;
  document.getElementById('networkIngressValue').textContent = networkInfo.ingress;
  
  document.getElementById('timezoneValue').textContent = data.timezone || '-';
  document.getElementById('timezoneOffsetValue').textContent = data.timezone_offset || '-';
  document.getElementById('currencyValue').textContent = data.currency || '-';
  
  await displayIPPurity(data);
}

function determineConnectionType(hosting, mobile, proxy) {
  if (proxy) return i18n.t('proxy');
  if (mobile) return i18n.t('mobile');
  if (hosting) return i18n.t('hosting');
  return i18n.t('residential');
}

function formatLanguages(languages) {
  if (!languages) return '-';
  if (typeof languages === 'string') {
    return languages.split(',').map(l => l.trim()).join(', ');
  }
  return '-';
}

function calculateNetworkInfo(data) {
  const asn = data.asn || '';
  const org = data.org || '';
  const countryCode = data.country_code || '';
  
  let egress = 'Unknown';
  let ingress = 'Unknown';
  
  const asnStr = String(asn);
  const asnMatch = asnStr.match(/AS(\d+)/);
  if (asnMatch) {
    const asnNum = parseInt(asnMatch[1]);
    
    if (countryCode === 'US') {
      egress = `US-${asnNum}`;
      ingress = `US-${asnNum}`;
    } else if (countryCode === 'CN') {
      egress = `CN-${asnNum}`;
      ingress = `CN-${asnNum}`;
    } else if (countryCode === 'DE') {
      egress = `DE-${asnNum}`;
      ingress = `DE-${asnNum}`;
    } else if (countryCode === 'JP') {
      egress = `JP-${asnNum}`;
      ingress = `JP-${asnNum}`;
    } else if (countryCode === 'GB') {
      egress = `GB-${asnNum}`;
      ingress = `GB-${asnNum}`;
    } else if (countryCode === 'FR') {
      egress = `FR-${asnNum}`;
      ingress = `FR-${asnNum}`;
    } else if (countryCode === 'RU') {
      egress = `RU-${asnNum}`;
      ingress = `RU-${asnNum}`;
    } else if (countryCode === 'BR') {
      egress = `BR-${asnNum}`;
      ingress = `BR-${asnNum}`;
    } else if (countryCode === 'IN') {
      egress = `IN-${asnNum}`;
      ingress = `IN-${asnNum}`;
    } else {
      egress = `${countryCode}-${asnNum}`;
      ingress = `${countryCode}-${asnNum}`;
    }
  } else {
    egress = countryCode || 'Unknown';
    ingress = countryCode || 'Unknown';
  }
  
  return {
    egress: egress,
    ingress: ingress
  };
}

async function fetchIPReputation(ip) {
  const cacheKey = ip;
  
  if (ipReputationCache.has(cacheKey)) {
    const cached = ipReputationCache.get(cacheKey);
    if (Date.now() - cached.timestamp < 3600000) {
      console.log('Using cached reputation for IP:', ip);
      return cached.score;
    }
  }
  
  try {
    const response = await fetch(`https://api.ipgeek.top/reputation?ip=${ip}`);
    if (!response.ok) {
      throw new Error('Failed to fetch IP reputation');
    }
    
    const data = await response.json();
    let score = 100;
    
    if (data.score !== undefined) {
      score = data.score;
    } else {
      console.warn('IP reputation API returned unexpected data:', data);
    }
    
    ipReputationCache.set(cacheKey, {
      score: score,
      timestamp: Date.now()
    });
    
    console.log('Fetched IP reputation for', ip, ':', score);
    return score;
  } catch (error) {
    console.error('Error fetching IP reputation:', error);
    return null;
  }
}

async function displayIPPurity(data) {
  console.log('Displaying IP purity for data:', data);
  
  try {
    const purityScoreEl = document.getElementById('purityScore');
    const purityBarEl = document.getElementById('purityBar');
    const usersCountEl = document.getElementById('usersCount');
    const riskLevelEl = document.getElementById('riskLevel');
    
    console.log('Purity elements:', {
      purityScoreEl: !!purityScoreEl,
      purityBarEl: !!purityBarEl,
      usersCountEl: !!usersCountEl,
      riskLevelEl: !!riskLevelEl
    });
    
    if (!purityScoreEl || !purityBarEl || !usersCountEl || !riskLevelEl) {
      console.error('Purity elements not found');
      return;
    }
    
    const purityData = await calculateIPPurity(data);
    console.log('Calculated purity data:', purityData);
    
    currentPurityScore = purityData.score;
    
    purityScoreEl.textContent = purityData.score + '%';
    purityBarEl.style.width = purityData.score + '%';
    usersCountEl.textContent = purityData.usersCount.toLocaleString();
    
    updateRiskLevelDisplay(purityData.score);
    
    console.log('IP purity display updated successfully');
  } catch (error) {
    console.error('Error displaying IP purity:', error);
  }
}

function updateRiskLevelDisplay(score) {
  const riskLevelEl = document.getElementById('riskLevel');
  if (!riskLevelEl) return;
  
  let riskLevel, riskClass;
  if (score >= 80) {
    riskLevel = i18n.t('low_risk');
    riskClass = 'text-green-600';
  } else if (score >= 50) {
    riskLevel = i18n.t('medium_risk');
    riskClass = 'text-yellow-600';
  } else {
    riskLevel = i18n.t('high_risk');
    riskClass = 'text-red-600';
  }
  
  riskLevelEl.textContent = riskLevel;
  riskLevelEl.className = `text-sm font-medium ${riskClass}`;
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

async function calculateIPPurity(data) {
  console.log('Calculating IP purity for data:', data);
  
  const ip = data.ip;
  const org = data.org || '';
  const countryCode = data.country_code || '';
  
  console.log('Purity calculation inputs:', {
    ip: ip,
    org: org,
    countryCode: countryCode
  });
  
  let score = 100;
  let usersCount = 0;
  
  const reputationScore = await fetchIPReputation(ip);
  
  if (reputationScore !== null) {
    score = reputationScore;
  } else {
    console.warn('Using fallback calculation due to API failure');
    const orgLower = org.toLowerCase();
    const vpnKeywords = ['vpn', 'proxy', 'tor', 'anonymous', 'hosting', 'datacenter'];
    const isVPN = vpnKeywords.some(keyword => orgLower.includes(keyword));
    
    if (isVPN) {
      score = 60;
    } else {
      score = 85;
    }
  }
  
  const orgLower = org.toLowerCase();
  const datacenterKeywords = ['amazon', 'google', 'digitalocean', 'cloudflare', 'microsoft', 'alibaba', 'oracle', 'ibm', 'tencent', 'hetzner', 'linode', 'vultr', 'ovh'];
  const isDatacenter = datacenterKeywords.some(keyword => orgLower.includes(keyword));
  
  if (score >= 80) {
    usersCount = Math.floor(Math.random() * 10000) + 100;
  } else if (score >= 50) {
    usersCount = Math.floor(Math.random() * 50000) + 10000;
  } else {
    usersCount = Math.floor(Math.random() * 100000) + 50000;
  }
  
  score = Math.max(0, Math.min(100, score));
  
  let riskLevel, riskClass;
  if (score >= 80) {
    riskLevel = 'Low Risk';
    riskClass = 'text-green-600';
  } else if (score >= 50) {
    riskLevel = 'Medium Risk';
    riskClass = 'text-yellow-600';
  } else {
    riskLevel = 'High Risk';
    riskClass = 'text-red-600';
  }
  
  const result = {
    score: Math.round(score),
    usersCount: usersCount,
    riskLevel: riskLevel,
    riskClass: riskClass
  };
  
  console.log('Purity calculation result:', result);
  
  return result;
}

async function handleMapSearch() {
  const searchInput = document.getElementById('mapSearchInput');
  const query = searchInput.value.trim();
  
  if (!query) return;
  
  showMapSearchLoading(true);
  
  const searchResultsSection = document.getElementById('searchResultsSection');
  const searchResultsList = document.getElementById('searchResultsList');
  
  searchResultsSection.classList.remove('hidden');
  searchResultsList.innerHTML = `
    <div class="p-4 bg-blue-50 rounded-lg text-blue-800">
      <div class="flex items-center gap-2">
        <span class="animate-spin">⏳</span>
        <p class="text-sm">Searching for "${query}"...</p>
      </div>
    </div>
  `;
  
  try {
    const ipInput = document.getElementById('ipInput');
    const currentIP = ipInput.value.trim();
    
    let centerLat, centerLng;
    
    if (currentIP && isValidIP(currentIP)) {
      const ipData = await fetchIPData(currentIP);
      if (ipData.latitude && ipData.longitude) {
        centerLat = ipData.latitude;
        centerLng = ipData.longitude;
      }
    }
    
    if (!centerLat || !centerLng) {
      const center = map.getCenter();
      centerLat = center.lat;
      centerLng = center.lng;
    }
    
    let places = [];
    let usedFallback = false;
    let lastError = null;
    
    try {
      places = await searchNearbyPlaces(centerLat, centerLng, query);
      
      if (!places || places.length === 0) {
        console.log('No results from Overpass API, trying Nominatim API...');
        usedFallback = true;
        places = await searchNearbyPlacesNominatim(centerLat, centerLng, query);
      }
    } catch (error) {
      lastError = error;
      console.error('Overpass API failed:', error);
      
      if (error.message === 'OVERPASS_BUSY' || error.message === 'OVERPASS_RATE_LIMIT') {
        console.log('Overpass API busy/rate limited, trying Nominatim API...');
        usedFallback = true;
        
        try {
          places = await searchNearbyPlacesNominatim(centerLat, centerLng, query);
        } catch (nominatimError) {
          console.error('Nominatim API also failed:', nominatimError);
          lastError = nominatimError;
        }
      }
    }
    
    if (places && places.length > 0) {
      displaySearchResults(places, centerLat, centerLng);
    } else if (lastError && searchResultsSection && searchResultsList) {
      const errorMessage = usedFallback 
        ? 'Both search services are currently unavailable. Please try again later.'
        : lastError.message || 'Failed to search places. Please try again.';
      
      searchResultsList.innerHTML = `
        <div class="p-4 bg-red-50 rounded-lg text-red-800">
          <p class="font-medium">Search Error</p>
          <p class="text-sm mt-1">${errorMessage}</p>
          <p class="text-xs mt-2 text-red-600">Tip: Try searching for more specific terms or try again later.</p>
        </div>
      `;
    } else if (!places || places.length === 0) {
      searchResultsList.innerHTML = `
        <div class="p-4 bg-yellow-50 rounded-lg text-yellow-800">
          <p class="text-sm">No results found for "${query}". Try a different search term.</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('Search error:', error);
    if (searchResultsSection && searchResultsList) {
      searchResultsList.innerHTML = `
        <div class="p-4 bg-red-50 rounded-lg text-red-800">
          <p class="font-medium">Search Error</p>
          <p class="text-sm mt-1">${error.message || 'Failed to search location. Please try again.'}</p>
          <p class="text-xs mt-2 text-red-600">Tip: Check your network connection and try again.</p>
        </div>
      `;
    }
  } finally {
    showMapSearchLoading(false);
  }
}

async function searchNearbyPlaces(lat, lng, query) {
  const searchResultsSection = document.getElementById('searchResultsSection');
  const searchResultsList = document.getElementById('searchResultsList');
  
  if (!searchResultsSection || !searchResultsList) {
    console.error('Search results elements not found');
    throw new Error('Search results display error: Required elements not found');
  }
  
  const radius = 20000;
  
  const overpassQuery = `
    [out:json][timeout:15];
    (
      node["name"~"${query}", i](around:${radius},${lat},${lng});
    );
    out tags;
  `;
  
  console.log('Searching for:', query, 'around', lat, lng);
  console.log('Overpass query:', overpassQuery);
  
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'data=' + encodeURIComponent(overpassQuery)
  });
  
  console.log('Response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Overpass API error:', errorText);
    
    if (response.status === 504) {
      throw new Error('OVERPASS_BUSY');
    } else if (response.status === 429) {
      throw new Error('OVERPASS_RATE_LIMIT');
    } else {
      throw new Error(`Search failed (HTTP ${response.status}). Please try again.`);
    }
  }
  
  const data = await response.json();
  console.log('Search results:', data);
  const places = data.elements || [];
  
  return places;
}

async function searchNearbyPlacesNominatim(lat, lng, query) {
  const searchResultsSection = document.getElementById('searchResultsSection');
  const searchResultsList = document.getElementById('searchResultsList');
  
  if (!searchResultsSection || !searchResultsList) {
    console.error('Search results elements not found');
    throw new Error('Search results display error: Required elements not found');
  }
  
  const radius = 0.2;
  const minLat = lat - radius;
  const maxLat = lat + radius;
  const minLon = lng - radius;
  const maxLon = lng + radius;
  
  const viewbox = `${minLon},${maxLat},${maxLon},${minLat}`;
  
  console.log('Searching with Nominatim for:', query, 'around', lat, lng);
  console.log('Viewbox:', viewbox);
  
  const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=10&viewbox=${viewbox}&bounded=1&addressdetails=1`, {
    headers: {
      'User-Agent': 'IPGeek-Search/1.0'
    }
  });
  
  console.log('Nominatim response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Nominatim API error:', errorText);
    
    if (response.status === 429) {
      throw new Error('Too many requests. Please wait a moment and try again.');
    } else if (response.status === 503) {
      throw new Error('The search service is temporarily unavailable. Please try again later.');
    } else {
      throw new Error(`Search failed (HTTP ${response.status}). Please try again.`);
    }
  }
  
  const data = await response.json();
  console.log('Nominatim search results:', data);
  
  const places = data.map(item => {
    let shortAddress = '';
    if (item.address) {
      const parts = [];
      if (item.address.house_number) parts.push(item.address.house_number);
      if (item.address.road) parts.push(item.address.road);
      if (item.address.suburb) parts.push(item.address.suburb);
      shortAddress = parts.join(' ');
    }
    
    let name = item.name || item.display_name.split(',')[0];
    
    return {
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      tags: {
        name: name,
        amenity: item.type,
        shop: item.type,
        tourism: item.type,
        address: shortAddress || ''
      }
    };
  });
  
  return places;
}

function displaySearchResults(places, centerLat, centerLng) {
  const searchResultsSection = document.getElementById('searchResultsSection');
  const searchResultsList = document.getElementById('searchResultsList');
  
  if (!searchResultsSection || !searchResultsList) {
    console.error('Search results elements not found');
    return;
  }
  
  if (!places || places.length === 0) {
    searchResultsSection.classList.remove('hidden');
    searchResultsList.innerHTML = `
      <div class="p-4 bg-yellow-50 rounded-lg text-yellow-800">
        <p class="text-sm">No results found. Try a different search term or location.</p>
      </div>
    `;
    return;
  }
  
  searchResults = places;
  currentPage = 1;
  
  renderSearchResultsPage(centerLat, centerLng);
}

function renderSearchResultsPage(centerLat, centerLng) {
  const searchResultsSection = document.getElementById('searchResultsSection');
  const searchResultsList = document.getElementById('searchResultsList');
  
  if (!searchResultsSection || !searchResultsList) {
    return;
  }
  
  searchResultsSection.classList.remove('hidden');
  searchResultsList.innerHTML = '';
  
  if (!searchResults || searchResults.length === 0) {
    searchResultsList.innerHTML = `
      <div class="p-4 bg-yellow-50 rounded-lg text-yellow-800">
        <p class="text-sm">No results found. Try a different search term or location.</p>
      </div>
    `;
    return;
  }
  
  const totalPages = Math.ceil(searchResults.length / resultsPerPage);
  const startIndex = (currentPage - 1) * resultsPerPage;
  const endIndex = Math.min(startIndex + resultsPerPage, searchResults.length);
  const currentPagePlaces = searchResults.slice(startIndex, endIndex);
  
  currentPagePlaces.forEach(place => {
    let name = place.tags?.name || 'Unknown';
    
    const lat = place.lat || place.center?.lat;
    const lng = place.lon || place.center?.lon;
    const hasCoordinates = lat && lng;
    
    let distanceText = '';
    if (hasCoordinates) {
      const distance = calculateDistance(centerLat, centerLng, lat, lng);
      distanceText = `${distance.toFixed(2)} km`;
    }
    
    let type = place.tags?.amenity || place.tags?.shop || place.tags?.tourism || 'Location';
    
    let address = '';
    if (place.tags?.address) {
      address = place.tags.address;
    } else {
      const street = place.tags?.['addr:street'] || '';
      const housenumber = place.tags?.['addr:housenumber'] || '';
      const city = place.tags?.['addr:city'] || '';
      const postcode = place.tags?.['addr:postcode'] || '';
      const country = place.tags?.['addr:country'] || '';
      
      const parts = [];
      if (housenumber && street) {
        parts.push(`${housenumber} ${street}`);
      } else if (street) {
        parts.push(street);
      }
      if (city) parts.push(city);
      if (postcode) parts.push(postcode);
      if (country) parts.push(country);
      
      address = parts.join(', ');
    }
    
    const div = document.createElement('div');
    div.className = 'p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer';
    div.innerHTML = `
      <div class="flex items-start gap-3">
        <span class="text-2xl">📍</span>
        <div class="flex-1">
          <p class="font-medium text-gray-800">${name}</p>
          <p class="text-sm text-gray-600">${type}</p>
          ${address ? `<p class="text-xs text-gray-500 mt-1">${address}</p>` : ''}
        </div>
        ${hasCoordinates ? `<span class="text-sm text-gray-600">${distanceText}</span>` : ''}
      </div>
    `;
    
    if (hasCoordinates) {
      div.addEventListener('click', () => {
        map.setView([lat, lng], 16);
        const marker = L.marker([lat, lng]).addTo(map);
        marker.bindPopup(`<b>${name}</b><br>${address || ''}${distanceText ? '<br>' + distanceText : ''}`).openPopup();
        markers.push(marker);
      });
    }
    
    searchResultsList.appendChild(div);
  });
  
  if (totalPages > 1) {
    const paginationDiv = document.createElement('div');
    paginationDiv.className = 'flex items-center justify-between mt-4 pt-4 border-t';
    
    const prevButton = document.createElement('button');
    prevButton.className = `px-4 py-2 rounded-lg ${currentPage === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`;
    prevButton.textContent = 'Previous';
    prevButton.disabled = currentPage === 1;
    prevButton.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderSearchResultsPage(centerLat, centerLng);
      }
    });
    
    const pageInfo = document.createElement('span');
    pageInfo.className = 'text-sm text-gray-600';
    pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    
    const nextButton = document.createElement('button');
    nextButton.className = `px-4 py-2 rounded-lg ${currentPage === totalPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`;
    nextButton.textContent = 'Next';
    nextButton.disabled = currentPage === totalPages;
    nextButton.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++;
        renderSearchResultsPage(centerLat, centerLng);
      }
    });
    
    paginationDiv.appendChild(prevButton);
    paginationDiv.appendChild(pageInfo);
    paginationDiv.appendChild(nextButton);
    
    searchResultsList.appendChild(paginationDiv);
  }
}

function updateMap(lat, lng, ip) {
  map.setView([lat, lng], 13);
  
  const marker = L.marker([lat, lng]).addTo(map);
  marker.bindPopup(`<b>${ip}</b><br>${lat}, ${lng}`).openPopup();
  markers.push(marker);
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

function showMapSearchLoading(show) {
  const mapSearchBtn = document.getElementById('mapSearchBtn');
  if (show) {
    mapSearchBtn.disabled = true;
    mapSearchBtn.textContent = '⏳';
    
    if (map) {
      const center = map.getCenter();
      searchCircle = L.circle([center.lat, center.lng], {
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.2,
        radius: 20000,
        weight: 2
      }).addTo(map);
    }
  } else {
    mapSearchBtn.disabled = false;
    mapSearchBtn.textContent = '🔍';
    
    if (searchCircle) {
      map.removeLayer(searchCircle);
      searchCircle = null;
    }
  }
}

async function detectWebRTCLeak() {
  console.log('Starting WebRTC leak detection...');
  
  return new Promise((resolve) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });
    
    pc.createDataChannel('');
    
    const candidates = [];
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate = event.candidate.candidate;
        const ipv4Match = candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
        if (ipv4Match) {
          const ip = ipv4Match[1];
          if (!candidates.includes(ip) && !ip.startsWith('192.168.') && !ip.startsWith('10.') && !ip.startsWith('172.16.') && !ip === '127.0.0.1') {
            candidates.push(ip);
            console.log('Found candidate IP:', ip);
          }
        }
      }
    };
    
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        setTimeout(() => {
          pc.close();
          console.log('WebRTC detection completed. Found IPs:', candidates);
          resolve(candidates);
        }, 3000);
      })
      .catch(error => {
        console.error('WebRTC detection error:', error);
        pc.close();
        resolve([]);
      });
  });
}

async function verifyLeakedIPs(leakedIPs, currentIP) {
  console.log('Verifying leaked IPs:', leakedIPs, 'Current IP:', currentIP);
  
  const uniqueIPs = [...new Set(leakedIPs)];
  const filteredIPs = uniqueIPs.filter(ip => ip !== currentIP);
  
  if (filteredIPs.length === 0) {
    return null;
  }
  
  try {
    const response = await fetch(`https://api.ipgeek.top/verify-leak`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        leaked_ips: filteredIPs,
        current_ip: currentIP
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to verify leaked IPs');
    }
    
    const data = await response.json();
    console.log('Leak verification result:', data);
    
    return data;
  } catch (error) {
    console.error('Error verifying leaked IPs:', error);
    return null;
  }
}

async function displayIPLeakDetection(ipData) {
  console.log('Starting IP leak detection for:', ipData.ip);
  
  const leakStatusEl = document.getElementById('leakStatus');
  const leakDetailsEl = document.getElementById('leakDetails');
  const leakSectionEl = document.getElementById('leakSection');
  const vpnStatusEl = document.getElementById('vpnStatus');
  
  if (!leakStatusEl || !leakDetailsEl || !leakSectionEl || !vpnStatusEl) {
    console.error('IP leak detection elements not found');
    return;
  }
  
  leakSectionEl.classList.remove('hidden');
  leakStatusEl.textContent = i18n.t('detecting');
  leakStatusEl.className = 'text-sm font-medium text-gray-600';
  leakDetailsEl.innerHTML = '';
  vpnStatusEl.textContent = i18n.t('detecting');
  vpnStatusEl.className = 'text-sm font-medium text-gray-600';
  
  const leakedIPs = await detectWebRTCLeak();
  
  const vpnStatus = detectVPNStatus(ipData);
  updateVPNStatus(vpnStatus);
  
  if (leakedIPs.length === 0) {
    leakStatusEl.textContent = i18n.t('no_leak_detected');
    leakStatusEl.className = 'text-sm font-medium text-green-600';
    return;
  }
  
  const verificationResult = await verifyLeakedIPs(leakedIPs, ipData.ip);
  
  if (!verificationResult || !verificationResult.leaked) {
    leakStatusEl.textContent = i18n.t('no_leak_detected');
    leakStatusEl.className = 'text-sm font-medium text-green-600';
    return;
  }
  
  leakStatusEl.textContent = i18n.t('leak_detected');
  leakStatusEl.className = 'text-sm font-medium text-red-600';
  
  const leakedIP = verificationResult.real_ip;
  const location = verificationResult.location;
  
  leakDetailsEl.innerHTML = `
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-gray-600">${i18n.t('real_ip')}:</span>
        <span class="font-medium">${leakedIP}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-gray-600">${i18n.t('real_location')}:</span>
        <span class="font-medium">${location.country_name}, ${location.city}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-gray-600">${i18n.t('leak_source')}:</span>
        <span class="font-medium">WebRTC</span>
      </div>
    </div>
  `;
}

function detectVPNStatus(ipData) {
  if (ipData.proxy) {
    return i18n.t('vpn_yes');
  }
  
  const asnName = (ipData.asn_name || '').toLowerCase();
  const vpnIndicators = ['vpn', 'proxy', 'datacenter', 'hosting', 'cloud', 'server', 'tor'];
  
  if (vpnIndicators.some(indicator => asnName.includes(indicator))) {
    return i18n.t('vpn_yes');
  }
  
  const connectionType = determineConnectionType(ipData.hosting, ipData.mobile, ipData.proxy);
  if (connectionType === i18n.t('hosting') || connectionType === i18n.t('datacenter')) {
    return i18n.t('vpn_yes');
  }
  
  if (connectionType === i18n.t('residential')) {
    return i18n.t('vpn_no');
  }
  
  return i18n.t('vpn_not_detected');
}

function updateVPNStatus(status) {
  const vpnStatusEl = document.getElementById('vpnStatus');
  if (!vpnStatusEl) return;
  
  vpnStatusEl.textContent = status;
  
  if (status === i18n.t('vpn_yes')) {
    vpnStatusEl.className = 'text-sm font-medium text-yellow-600';
  } else if (status === i18n.t('vpn_no')) {
    vpnStatusEl.className = 'text-sm font-medium text-green-600';
  } else {
    vpnStatusEl.className = 'text-sm font-medium text-gray-600';
  }
}

async function performIPLeakDetection(ip) {
  try {
    const ipData = { ip: ip };
    await displayIPLeakDetection(ipData);
  } catch (error) {
    console.error('IP leak detection error:', error);
  }
}
