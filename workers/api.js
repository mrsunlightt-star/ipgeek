const CACHE_TTL = 3600;

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path.startsWith('/ip/')) {
    return handleIPRequest(request);
  } else if (path.startsWith('/poi')) {
    return handlePOIRequest(request);
  }

  return new Response('Not Found', { status: 404 });
}

async function handleIPRequest(request) {
  const url = new URL(request.url);
  const ip = url.pathname.replace('/ip/', '');
  
  const cache = caches.default;
  const cacheKey = new Request(url.toString());
  
  try {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }
  } catch (e) {
    console.log('Cache error:', e);
  }

  const services = [
    fetchFromIPRegistry,
    fetchFromIPAPI,
    fetchFromIPAPICom,
    fetchFromDBIP,
    fetchFromIPInfo,
    fetchFromGeoJS
  ];

  for (const service of services) {
    try {
      const data = await service(ip);
      if (data) {
        const responseData = JSON.stringify(data);
        
        const cacheResponse = new Response(responseData, {
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${CACHE_TTL}`
          }
        });
        
        try {
          await cache.put(cacheKey, cacheResponse.clone());
        } catch (e) {
          console.log('Cache put error:', e);
        }

        return cacheResponse;
      }
    } catch (error) {
      console.log(`Service ${service.name} failed:`, error);
      continue;
    }
  }

  return new Response(JSON.stringify({ 
    error: 'All IP services failed. Please try again later.' 
  }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function fetchFromIPRegistry(ip) {
  const response = await fetch(`https://api.ipregistry.co/${ip}?key=tryout`, {
    headers: {
      'User-Agent': 'IP-Geo-Intelligence/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`IPRegistry failed with status ${response.status}`);
  }

  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message || 'IPRegistry error');
  }

  return normalizeIPData(data, 'ipregistry');
}

async function fetchFromIPRegistry(ip) {
  const response = await fetch(`https://api.ipregistry.co/${ip}?key=tryout`, {
    headers: {
      'User-Agent': 'IP-Geo-Intelligence/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`IPRegistry failed with status ${response.status}`);
  }

  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error.message || 'IPRegistry error');
  }

  return normalizeIPData(data, 'ipregistry');
}

async function fetchFromDBIP(ip) {
  const response = await fetch(`https://api.db-ip.com/v2/free/${ip}`, {
    headers: {
      'User-Agent': 'IP-Geo-Intelligence/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`DB-IP failed with status ${response.status}`);
  }

  const data = await response.json();
  return normalizeIPData(data, 'dbip');
}

async function fetchFromIPAPICom(ip) {
  const response = await fetch(`http://ip-api.com/json/${ip}`, {
    headers: {
      'User-Agent': 'IP-Geo-Intelligence/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`IP-API.com failed with status ${response.status}`);
  }

  const data = await response.json();
  
  if (data.status !== 'success') {
    throw new Error(data.message || 'IP-API.com error');
  }

  return normalizeIPData(data, 'ipapicom');
}

async function fetchFromIPAPI(ip) {
  const response = await fetch(`https://ipapi.co/${ip}/json/`, {
    headers: {
      'User-Agent': 'IP-Geo-Intelligence/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`IPAPI failed with status ${response.status}`);
  }

  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.reason || 'IPAPI error');
  }

  return normalizeIPData(data, 'ipapi');
}

async function fetchFromIPInfo(ip) {
  const response = await fetch(`https://ipinfo.io/${ip}/json`, {
    headers: {
      'User-Agent': 'IP-Geo-Intelligence/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`IPInfo failed with status ${response.status}`);
  }

  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error);
  }

  return normalizeIPData(data, 'ipinfo');
}

async function fetchFromGeoJS(ip) {
  const response = await fetch(`https://get.geojs.io/v1/ip/geo/${ip}.json`, {
    headers: {
      'User-Agent': 'IP-Geo-Intelligence/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`GeoJS failed with status ${response.status}`);
  }

  const data = await response.json();
  return normalizeIPData(data, 'geojs');
}

function normalizeIPData(data, source) {
  const normalized = {
    ip: data.ip,
    country_name: null,
    country_code: null,
    region: null,
    city: null,
    postal: null,
    latitude: null,
    longitude: null,
    org: null,
    asn: null,
    timezone: null
  };

  if (source === 'ipapi') {
    normalized.country_name = data.country_name;
    normalized.country_code = data.country_code;
    normalized.region = data.region;
    normalized.city = data.city;
    normalized.postal = data.postal;
    normalized.latitude = data.latitude;
    normalized.longitude = data.longitude;
    normalized.org = data.org;
    normalized.asn = data.asn;
    normalized.timezone = data.timezone;
  } else if (source === 'ipregistry') {
    normalized.country_name = data.location?.country?.name;
    normalized.country_code = data.location?.country?.code;
    normalized.region = data.location?.region?.name;
    normalized.city = data.location?.city;
    normalized.postal = data.location?.postal;
    normalized.latitude = data.location?.latitude;
    normalized.longitude = data.location?.longitude;
    normalized.org = data.company?.name;
    normalized.asn = data.connection?.asn;
    normalized.timezone = data.time_zone?.id;
  } else if (source === 'ipapicom') {
    normalized.country_name = data.country;
    normalized.country_code = data.countryCode;
    normalized.region = data.regionName;
    normalized.city = data.city;
    normalized.postal = data.zip;
    normalized.latitude = data.lat;
    normalized.longitude = data.lon;
    normalized.org = data.org;
    normalized.asn = data.as;
    normalized.timezone = data.timezone;
  } else if (source === 'dbip') {
    normalized.country_name = data.countryName;
    normalized.country_code = data.countryCode;
    normalized.region = data.stateProv;
    normalized.city = data.city;
    normalized.latitude = null;
    normalized.longitude = null;
  } else if (source === 'ipinfo') {
    normalized.country_name = data.country;
    normalized.country_code = data.country;
    normalized.region = data.region;
    normalized.city = data.city;
    normalized.postal = data.postal;
    normalized.latitude = parseFloat(data.loc?.split(',')[0]);
    normalized.longitude = parseFloat(data.loc?.split(',')[1]);
    normalized.org = data.org;
    normalized.asn = data.org;
    normalized.timezone = data.timezone;
  } else if (source === 'geojs') {
    normalized.country_name = data.country;
    normalized.country_code = data.country_code;
    normalized.region = data.region;
    normalized.city = data.city;
    normalized.latitude = parseFloat(data.latitude);
    normalized.longitude = parseFloat(data.longitude);
    normalized.org = data.organization;
  }

  return normalized;
}

async function handlePOIRequest(request) {
  const url = new URL(request.url);
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');
  const radius = url.searchParams.get('radius') || '3000';

  if (!lat || !lng) {
    return new Response(JSON.stringify({ error: 'Missing lat or lng parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const cache = caches.default;
  const cacheKey = new Request(url.toString());
  
  try {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }
  } catch (e) {
    console.log('Cache error:', e);
  }

  const query = `
    [out:json];
    (
      node["amenity"="hospital"](around:${radius},${lat},${lng});
      node["amenity"="school"](around:${radius},${lat},${lng});
      node["amenity"="police"](around:${radius},${lat},${lng});
    );
    out center;
  `;

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `data=${encodeURIComponent(query)}`
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch POI data' }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();
    const pois = parsePOIData(data);
    
    const responseData = JSON.stringify(pois);
    
    const cacheResponse = new Response(responseData, {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL}`
      }
    });
    
    try {
      await cache.put(cacheKey, cacheResponse.clone());
    } catch (e) {
      console.log('Cache put error:', e);
    }

    return cacheResponse;
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function parsePOIData(data) {
  if (!data.elements) return [];
  
  return data.elements.map(element => {
    const type = element.tags.amenity;
    const name = element.tags.name || type.charAt(0).toUpperCase() + type.slice(1);
    
    return {
      name: name,
      type: type,
      lat: element.lat || element.center.lat,
      lng: element.lon || element.center.lon
    };
  });
}
