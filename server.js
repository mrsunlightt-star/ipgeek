#!/usr/bin/env node

require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;
const IPINFO_TOKEN = process.env.IPINFO_TOKEN || '';
const IPREGISTRY_TOKEN = process.env.IPREGISTRY_TOKEN || '';

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

function calculateCIDR(ip) {
  if (!ip) return null;
  
  try {
    const parts = ip.split('.');
    if (parts.length === 4) {
      const firstOctet = parseInt(parts[0], 10);
      
      if (firstOctet >= 1 && firstOctet <= 126) {
        return `${parts[0]}.0.0.0/8`;
      } else if (firstOctet >= 128 && firstOctet <= 191) {
        return `${parts[0]}.${parts[1]}.0.0/16`;
      } else if (firstOctet >= 192 && firstOctet <= 223) {
        return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
      }
    }
  } catch (e) {
    console.log('Error calculating CIDR:', e.message);
  }
  
  return null;
}

const COUNTRY_CURRENCY_MAP = {
  'US': 'USD',
  'CN': 'CNY',
  'JP': 'JPY',
  'DE': 'EUR',
  'FR': 'EUR',
  'GB': 'GBP',
  'CA': 'CAD',
  'AU': 'AUD',
  'IN': 'INR',
  'BR': 'BRL',
  'RU': 'RUB',
  'KR': 'KRW',
  'IT': 'EUR',
  'ES': 'EUR',
  'MX': 'MXN',
  'ID': 'IDR',
  'TR': 'TRY',
  'SA': 'SAR',
  'ZA': 'ZAR',
  'AE': 'AED',
  'TH': 'THB',
  'VN': 'VND',
  'SG': 'SGD',
  'HK': 'HKD',
  'MY': 'MYR',
  'PH': 'PHP',
  'NL': 'EUR',
  'SE': 'SEK',
  'NO': 'NOK',
  'DK': 'DKK',
  'PL': 'PLN',
  'CH': 'CHF',
  'AT': 'EUR',
  'BE': 'EUR',
  'IE': 'EUR',
  'PT': 'EUR',
  'GR': 'EUR',
  'FI': 'EUR',
  'CZ': 'CZK',
  'HU': 'HUF',
  'RO': 'RON',
  'BG': 'BGN',
  'HR': 'EUR',
  'SI': 'EUR',
  'SK': 'EUR',
  'LT': 'EUR',
  'LV': 'EUR',
  'EE': 'EUR',
  'IS': 'ISK',
  'UA': 'UAH',
  'BY': 'BYN',
  'KZ': 'KZT',
  'UZ': 'UZS',
  'NZ': 'NZD',
  'CL': 'CLP',
  'CO': 'COP',
  'PE': 'PEN',
  'AR': 'ARS',
  'VE': 'VES',
  'EG': 'EGP',
  'NG': 'NGN',
  'KE': 'KES',
  'ZA': 'ZAR',
  'MA': 'MAD',
  'DZ': 'DZD',
  'TN': 'TND',
  'IL': 'ILS',
  'PK': 'PKR',
  'BD': 'BDT',
  'LK': 'LKR',
  'NP': 'NPR',
  'MM': 'MMK',
  'KH': 'KHR',
  'LA': 'LAK'
};

const COUNTRY_LANGUAGES_MAP = {
  'US': 'en',
  'CN': 'zh',
  'JP': 'ja',
  'DE': 'de',
  'FR': 'fr',
  'GB': 'en',
  'CA': 'en,fr',
  'AU': 'en',
  'IN': 'hi,en',
  'BR': 'pt',
  'RU': 'ru',
  'KR': 'ko',
  'IT': 'it',
  'ES': 'es',
  'MX': 'es',
  'ID': 'id',
  'TR': 'tr',
  'SA': 'ar',
  'ZA': 'af,en,zu,xh,ts,ss,st,nso,tn,ve,ts',
  'AE': 'ar',
  'TH': 'th',
  'VN': 'vi',
  'SG': 'en,ms,ta,zh',
  'HK': 'zh,en',
  'MY': 'ms,en',
  'PH': 'en,tl',
  'NL': 'nl',
  'SE': 'sv',
  'NO': 'no',
  'DK': 'da',
  'PL': 'pl',
  'CH': 'de,fr,it,rm',
  'AT': 'de',
  'BE': 'nl,fr,de',
  'IE': 'en,ga',
  'PT': 'pt',
  'GR': 'el',
  'FI': 'fi,sv',
  'CZ': 'cs',
  'HU': 'hu',
  'RO': 'ro',
  'BG': 'bg',
  'HR': 'hr',
  'SI': 'sl',
  'SK': 'sk',
  'LT': 'lt',
  'LV': 'lv',
  'EE': 'et',
  'IS': 'is',
  'UA': 'uk',
  'BY': 'be,ru',
  'KZ': 'kk,ru',
  'UZ': 'uz',
  'NZ': 'en,mi',
  'CL': 'es',
  'CO': 'es',
  'PE': 'es',
  'AR': 'es',
  'VE': 'es',
  'EG': 'ar',
  'NG': 'en',
  'KE': 'en,sw',
  'MA': 'ar',
  'DZ': 'ar',
  'TN': 'ar',
  'IL': 'he,ar',
  'PK': 'ur,en',
  'BD': 'bn',
  'LK': 'si,ta',
  'NP': 'ne',
  'MM': 'my',
  'KH': 'km',
  'LA': 'lo'
};

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url);
  let pathname = parsedUrl.pathname;

  if (pathname === '/') {
    pathname = '/index.html';
  }

  if (pathname.startsWith('/api/ip/')) {
    await handleIPRequest(req, res, pathname);
    return;
  }

  if (pathname.startsWith('/api/poi')) {
    await handlePOIRequest(req, res, parsedUrl);
    return;
  }

  if (pathname === '/api/verify-leak') {
    await handleVerifyLeakRequest(req, res);
    return;
  }

  const filePath = path.join(__dirname, pathname);
  const extname = path.extname(filePath);
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${error.code}`, 'utf-8');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

async function handleIPRequest(req, res, pathname) {
  const ip = pathname.replace('/api/ip/', '');
  
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
        if (data) {
          console.log(`Successfully fetched data from ${service.name}`);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify(data));
          return;
        }
      } catch (error) {
        console.log(`Service ${service.name} failed:`, error.message);
        continue;
      }
    }

    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'All IP services failed. Please try again later.' }));
  } catch (error) {
    console.error('Error fetching IP data:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch IP data' }));
  }
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

async function handlePOIRequest(req, res, parsedUrl) {
  const query = parsedUrl.query;
  const params = new URLSearchParams(query);
  const lat = params.get('lat');
  const lng = params.get('lng');
  const radius = params.get('radius') || '3000';

  if (!lat || !lng) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing lat or lng parameter' }));
    return;
  }

  const overpassQuery = `
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
      body: `data=${encodeURIComponent(overpassQuery)}`
    });
    
    const data = await response.json();
    const pois = parsePOIData(data);
    
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(pois));
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to fetch POI data' }));
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

async function handleVerifyLeakRequest(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const data = JSON.parse(body);
      const leakedIPs = data.leaked_ips;
      const currentIP = data.current_ip;

      if (!leakedIPs || !Array.isArray(leakedIPs) || leakedIPs.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Invalid leaked_ips parameter' }));
        return;
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
              const result = await service(ip);
              if (result && result.latitude && result.longitude) {
                realIP = ip;
                realLocation = result;
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

      const responseData = {
        leaked: !!realIP,
        real_ip: realIP,
        location: realLocation,
        current_ip: currentIP
      };

      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(responseData));
    } catch (error) {
      console.error('Error handling verify-leak request:', error);
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ 
        error: 'Internal server error',
        leaked: false
      }));
    }
  });
}

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log('Press Ctrl+C to stop the server');
});
