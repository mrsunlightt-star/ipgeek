# IP Geo-Intelligence

A lightweight, responsive, multilingual web application for IP geolocation and POI visualization.

## Features

- IP geolocation lookup (IPv4/IPv6)
- Interactive map with OpenStreetMap
- Nearby Points of Interest (hospitals, schools, police stations)
- Multilingual support (8 languages)
- Responsive design
- Privacy-focused (no data collection)

## Supported Languages

- English
- Deutsch (German)
- Français (French)
- 日本語 (Japanese)
- Español (Spanish)
- 中文
- Русский (Russian)
- हिन्दी (Hindi)

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://localhost:8080
```

## Project Structure

```
/
├── index.html              # Main HTML page
├── i18n.js                 # Internationalization module
├── app.js                  # Main application logic
├── server.js               # Local development server
├── package.json            # Project configuration
├── locales/                # Translation files
│   ├── en.json
│   ├── de.json
│   ├── fr.json
│   ├── ja.json
│   ├── es.json
│   ├── zh.json
│   ├── ru.json
│   └── hi.json
└── workers/                # Cloudflare Worker scripts
    └── api.js
```

## Deployment

### Cloudflare Pages (Frontend)

1. Push your code to GitHub
2. Connect your repository to Cloudflare Pages
3. Set build command to empty (static site)
4. Set output directory to `/`

### Cloudflare Workers (API)

1. Install Wrangler CLI:
```bash
npm install -g wrangler
```

2. Login to Cloudflare:
```bash
wrangler login
```

3. The `wrangler.toml` is configured for `ipgeek.top`
4. Deploy:
```bash
wrangler publish
```

## API Endpoints

- `GET https://api.ipgeek.top/ip/:ip` - Get IP geolocation data
- `GET https://api.ipgeek.top/poi?lat=...&lng=...&radius=...` - Get nearby POIs

## Data Sources

- IP Geolocation: [ipapi.co](https://ipapi.co/)
- Map Data: [OpenStreetMap](https://www.openstreetmap.org/)
- POI Data: [Overpass API](https://overpass-api.de/)

## Privacy

This tool does not collect or store any user data. All queries are processed in real-time using public APIs.

## License

MIT
