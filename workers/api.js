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
  
  const cacheKey = `ip:${ip}`;
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    return new Response(cached.body, {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const response = await fetch(`https://ipapi.co/${ip}/json/`, {
      headers: {
        'User-Agent': 'IP-Geo-Intelligence/1.0'
      }
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch IP data' }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();
    const responseData = JSON.stringify(data);
    
    await cache.put(cacheKey, new Response(responseData, {
      headers: { 'Content-Type': 'application/json' }
    }));

    return new Response(responseData, {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL}`
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
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

  const cacheKey = `poi:${lat}:${lng}:${radius}`;
  const cached = await cache.get(cacheKey);
  
  if (cached) {
    return new Response(cached.body, {
      headers: { 'Content-Type': 'application/json' }
    });
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
    
    await cache.put(cacheKey, new Response(responseData, {
      headers: { 'Content-Type': 'application/json' }
    }));

    return new Response(responseData, {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL}`
      }
    });
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
