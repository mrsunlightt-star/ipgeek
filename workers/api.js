const CACHE_TTL = 3600;

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, event.env));
});

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const IPINFO_TOKEN = env?.IPINFO_TOKEN || '';
  const IPREGISTRY_TOKEN = env?.IPREGISTRY_TOKEN || '';

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (path.startsWith('/ip/')) {
    return handleIPRequest(request, IPINFO_TOKEN, IPREGISTRY_TOKEN);
  } else if (path.startsWith('/poi')) {
    return handlePOIRequest(request);
  } else if (path.startsWith('/reputation')) {
    return handleReputationRequest(request);
  } else if (path.startsWith('/verify-leak')) {
    return handleVerifyLeakRequest(request, IPINFO_TOKEN, IPREGISTRY_TOKEN);
  }

  return new Response('Not Found', { status: 404 });
}

async function handleIPRequest(request, IPINFO_TOKEN, IPREGISTRY_TOKEN) {
  const url = new URL(request.url);
  const path = url.pathname;
  let ip = url.pathname.replace('/ip/', '');
  
  if (!ip) {
    ip = request.headers.get('CF-Connecting-IP') || 
         request.headers.get('X-Forwarded-For')?.split(',')[0] || 
         '8.8.8.8';
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

  const services = [
    fetchFromIPRegistry,
    fetchFromIPInfo,
    fetchFromIPAPI,
    fetchFromIPAPICom,
    fetchFromDBIP,
    fetchFromGeoJS
  ];

  for (const service of services) {
    try {
      const data = await service(ip, IPINFO_TOKEN, IPREGISTRY_TOKEN);
      if (data) {
        const responseData = JSON.stringify(data);
        
        const cacheResponse = new Response(responseData, {
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${CACHE_TTL}`,
            'Access-Control-Allow-Origin': '*'
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
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

async function fetchFromIPRegistry(ip, IPINFO_TOKEN, IPREGISTRY_TOKEN) {
  const token = IPREGISTRY_TOKEN || 'tryout';
  const response = await fetch(`https://api.ipregistry.co/${ip}?key=${token}`, {
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

async function fetchFromDBIP(ip, IPINFO_TOKEN, IPREGISTRY_TOKEN) {
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

async function fetchFromIPAPICom(ip, IPINFO_TOKEN, IPREGISTRY_TOKEN) {
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

async function fetchFromIPAPI(ip, IPINFO_TOKEN, IPREGISTRY_TOKEN) {
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

async function fetchFromIPInfo(ip, IPINFO_TOKEN, IPREGISTRY_TOKEN) {
  let url = `https://ipinfo.io/${ip}/json`;
  
  if (IPINFO_TOKEN) {
    url += `?token=${IPINFO_TOKEN}`;
  }
  
  const response = await fetch(url, {
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

async function fetchFromGeoJS(ip, IPINFO_TOKEN, IPREGISTRY_TOKEN) {
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

function calculateTimezoneOffset(timezone) {
  if (!timezone) return null;
  
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset'
    });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find(p => p.type === 'timeZoneName');
    
    if (offsetPart) {
      const offsetStr = offsetPart.value.replace('GMT', '');
      const match = offsetStr.match(/([+-])(\d{1,2}):?(\d{2})?/);
      if (match) {
        const sign = match[1] === '+' ? 1 : -1;
        const hours = parseInt(match[2], 10);
        const minutes = match[3] ? parseInt(match[3], 10) : 0;
        const totalMinutes = sign * (hours * 60 + minutes);
        const offsetHours = Math.floor(totalMinutes / 60);
        const offsetMins = Math.abs(totalMinutes % 60);
        const finalSign = offsetHours >= 0 ? '+' : '-';
        return `${finalSign}${String(Math.abs(offsetHours)).padStart(2, '0')}${String(offsetMins).padStart(2, '0')}`;
      }
    }
  } catch (e) {
    console.log('Error calculating timezone offset:', e.message);
  }
  
  return null;
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
    timezone: null,
    proxy: false,
    hosting: false,
    mobile: false,
    currency: null,
    languages: null,
    timezone_offset: null,
    asn_name: null,
    asn_country: null,
    asn_routes: null,
    cidr: null,
    ip_version: null
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
    normalized.proxy = data.proxy || false;
    normalized.hosting = data.hosting || false;
    normalized.mobile = data.mobile || false;
    normalized.currency = data.currency;
    normalized.languages = data.languages;
    normalized.timezone_offset = data.utc_offset;
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
    normalized.proxy = data.connection?.proxy || false;
    normalized.hosting = data.connection?.hosting || false;
    normalized.mobile = data.connection?.mobile || false;
    normalized.currency = data.currency?.code;
    normalized.languages = data.location?.languages?.map(l => l.name).join(', ');
    normalized.timezone_offset = data.time_zone?.offset;
    normalized.asn_name = data.connection?.organization;
    normalized.asn_country = data.connection?.country;
    normalized.asn_routes = data.connection?.route;
    normalized.cidr = data.network?.cidr;
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
    normalized.proxy = data.proxy || false;
    normalized.hosting = data.hosting || false;
    normalized.mobile = data.mobile || false;
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
    normalized.currency = data.currency;
    normalized.languages = data.languages;
    normalized.timezone_offset = calculateTimezoneOffset(data.timezone);
    normalized.asn_name = data.org;
    normalized.asn_country = data.country;
    normalized.cidr = data.cidr;
  } else if (source === 'geojs') {
    normalized.country_name = data.country;
    normalized.country_code = data.country_code;
    normalized.region = data.region;
    normalized.city = data.city;
    normalized.latitude = parseFloat(data.latitude);
    normalized.longitude = parseFloat(data.longitude);
    normalized.org = data.organization;
  }

  if (normalized.ip) {
    normalized.ip_version = normalized.ip.includes(':') ? 'IPv6' : 'IPv4';
  }

  if (!normalized.asn_name || !normalized.asn_country) {
    const asnMatch = String(normalized.asn || '').match(/AS(\d+)\s*(.*)/);
    if (asnMatch) {
      normalized.asn_name = asnMatch[2] || normalized.org;
      normalized.asn_country = normalized.country_code;
    } else if (normalized.org) {
      normalized.asn_name = normalized.org;
      normalized.asn_country = normalized.country_code;
    }
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
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
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
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const data = await response.json();
    const pois = parsePOIData(data);
    
    const responseData = JSON.stringify(pois);
    
    const cacheResponse = new Response(responseData, {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
        'Access-Control-Allow-Origin': '*'
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
    const address = element.tags['addr:street'] || 
                   element.tags['addr:full'] || 
                   `${element.tags['addr:housenumber'] || ''} ${element.tags['addr:street'] || ''}`.trim() ||
                   'Address not available';
    const phone = element.tags.phone || element.tags['contact:phone'] || null;
    const website = element.tags.website || element.tags['contact:website'] || null;
    
    return {
      name: name,
      type: type,
      lat: element.lat || element.center.lat,
      lng: element.lon || element.center.lon,
      address: address,
      phone: phone,
      website: website
    };
  });
}

async function handleReputationRequest(request) {
  const url = new URL(request.url);
  const ip = url.searchParams.get('ip');

  if (!ip) {
    return new Response(JSON.stringify({ error: 'Missing ip parameter' }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
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

  try {
    const score = await checkDNSBL(ip);
    
    const responseData = JSON.stringify({ 
      score: Math.round(score),
      status: 'success',
      raw: 100 - score,
      source: 'dnsbl'
    });
    
    const cacheResponse = new Response(responseData, {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
        'Access-Control-Allow-Origin': '*'
      }
    });
    
    try {
      await cache.put(cacheKey, cacheResponse.clone());
    } catch (e) {
      console.log('Cache put error:', e);
    }

    return cacheResponse;
  } catch (error) {
    console.error('Error fetching IP reputation:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch IP reputation',
      score: 85,
      status: 'fallback',
      source: 'fallback'
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

async function checkDNSBL(ip) {
  const dnsblLists = [
    'zen.spamhaus.org',
    'bl.spamcop.net',
    'dnsbl-1.uceprotect.net',
    'b.barracudacentral.org'
  ];
  
  let blacklistedCount = 0;
  let checkedCount = 0;
  
  for (const dnsbl of dnsblLists) {
    try {
      const reversedIP = ip.split('.').reverse().join('.');
      const lookupDomain = `${reversedIP}.${dnsbl}`;
      
      const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${lookupDomain}&type=A`, {
        headers: {
          'Accept': 'application/dns-json'
        }
      });
      
      const data = await response.json();
      
      if (data.Answer && data.Answer.length > 0) {
        blacklistedCount++;
      }
      
      checkedCount++;
    } catch (error) {
      console.log(`DNSBL check failed for ${dnsbl}:`, error);
    }
  }
  
  if (checkedCount === 0) {
    return 85;
  }
  
  const blacklistRatio = blacklistedCount / checkedCount;
  return Math.max(0, Math.min(100, 100 - (blacklistRatio * 100)));
}

async function handleVerifyLeakRequest(request, IPINFO_TOKEN, IPREGISTRY_TOKEN) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  try {
    const body = await request.json();
    const leakedIPs = body.leaked_ips;
    const currentIP = body.current_ip;

    if (!leakedIPs || !Array.isArray(leakedIPs) || leakedIPs.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid leaked_ips parameter' }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const cache = caches.default;
    const cacheKey = new Request(request.url);
    
    try {
      const cached = await cache.match(cacheKey);
      if (cached) {
        return cached;
      }
    } catch (e) {
      console.log('Cache error:', e);
    }

    let realIP = null;
    let realLocation = null;

    for (const ip of leakedIPs) {
      try {
        const services = [
          fetchFromIPRegistry,
          fetchFromIPInfo,
          fetchFromIPAPI,
          fetchFromIPAPICom,
          fetchFromDBIP,
          fetchFromGeoJS
        ];

        for (const service of services) {
          try {
            const data = await service(ip, IPINFO_TOKEN, IPREGISTRY_TOKEN);
            if (data && data.latitude && data.longitude) {
              realIP = ip;
              realLocation = data;
              break;
            }
          } catch (error) {
            continue;
          }
        }

        if (realIP) {
          break;
        }
      } catch (error) {
        console.log('Error verifying IP:', ip, error);
        continue;
      }
    }

    const responseData = JSON.stringify({
      leaked: !!realIP,
      real_ip: realIP,
      location: realLocation,
      current_ip: currentIP
    });
    
    const cacheResponse = new Response(responseData, {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
        'Access-Control-Allow-Origin': '*'
      }
    });
    
    try {
      await cache.put(cacheKey, cacheResponse.clone());
    } catch (e) {
      console.log('Cache put error:', e);
    }

    return cacheResponse;
  } catch (error) {
    console.error('Error handling verify-leak request:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      leaked: false
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
