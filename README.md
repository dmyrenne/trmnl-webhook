# TRMNL Dashboard

A self-hosted Node.js dashboard for **TRMNL E-Ink displays (800×480px)** via the [LaraPaper](https://github.com/usetrmnl/byos_larapaper) Image Webhook.

Every 15 minutes (configurable), Puppeteer takes a screenshot of the dashboard and pushes it to your LaraPaper instance.

![Dashboard Preview](https://raw.githubusercontent.com/dmyrenne/trmnl-webhook/main/preview.png)

## Features

- **Weather** — current conditions + 3-day forecast (high / low / precipitation %) via [Visual Crossing](https://www.visualcrossing.com/)
- **Weather alerts** — official warnings from Visual Crossing, shown when active
- **Calendar** — upcoming events from Nextcloud CalDAV for today, tomorrow, and the day after
- **Tasks / Reminders** — Nextcloud tasks (VTODO) shown alongside events, with completed/pending state
- **Smart layout** — past events are filtered out; if tomorrow is full, the day-after section is dropped automatically to make room

## Quick Start

### Prerequisites

- Docker + Docker Compose
- A running [LaraPaper](https://github.com/usetrmnl/byos_larapaper) instance
- [Visual Crossing](https://www.visualcrossing.com/sign-up) API key (free tier available)
- Nextcloud with CalDAV access

### 1. Download the compose file

```bash
curl -O https://raw.githubusercontent.com/dmyrenne/trmnl-webhook/main/docker-compose.yml
```

### 2. Configure environment

```bash
curl -O https://raw.githubusercontent.com/dmyrenne/trmnl-webhook/main/.env.example
cp .env.example .env
```

Edit `.env` and fill in your values:

| Variable | Description |
|---|---|
| `VISUAL_CROSSING_KEY` | API key from visualcrossing.com |
| `VISUAL_CROSSING_LOCATION` | Location string, e.g. `Berlin,DE` |
| `CALDAV_URL` | Nextcloud DAV URL, e.g. `https://cloud.example.com/remote.php/dav` |
| `CALDAV_USER` | Nextcloud username |
| `CALDAV_PASSWORD` | Nextcloud password or app password |
| `CALDAV_CALENDAR_NAME` | Calendar display name, e.g. `personal` |
| `LARAPAPER_WEBHOOK_URL` | Full webhook URL from your LaraPaper plugin settings |
| `CUSTOM_FONT_FAMILY` | CSS font-family name for your custom font (optional, see below) |
| `UPDATE_SCHEDULE` | Update schedule — `15M` (every 15 min), `2H` (every 2 h), `15:00` (daily at 15:00). Default: `15M` |
| `TIMEZONE` | [TZ database name](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones), e.g. `Europe/Berlin` |
| `PORT` | Internal server port (default: `3000`, do not change when using Docker) |

### 3. Add a custom font (optional)

The date and day labels use a handwriting-style font. By default, [Caveat](https://fonts.google.com/specimen/Caveat) (Google Fonts) is used as a free fallback.

To use your own font:

1. Create a `fonts/` directory next to your `docker-compose.yml`
2. Place your font file(s) there (`.otf`, `.ttf`, `.woff`, `.woff2`)
3. Set `CUSTOM_FONT_FAMILY` in your `.env` to the name you want to use in CSS

```
fonts/
└── MyFont-Regular.otf
```

```env
CUSTOM_FONT_FAMILY=MyFont
```

The container picks up all font files in `./fonts/` automatically and registers them under the given name. No rebuild required.

### 4. Start

```bash
docker compose up -d
```

- **Preview** in browser: `http://localhost:3210`
- **Force update push**: `curl -X POST http://localhost:3210/trigger`
- **Logs**: `docker compose logs -f`

---

## Building from Source

```bash
git clone https://github.com/dmyrenne/trmnl-webhook.git
cd trmnl-webhook

# Add your purchased fonts (optional)
cp /path/to/BetaniaPatmos-Regular.otf src/views/fonts/

cp .env.example .env
# Edit .env ...

docker compose -f docker-compose.yml up --build -d
```

Or without Docker:

```bash
npm install
npm start
```

## Docker Image

Pre-built multi-arch images (amd64 + arm64) are published to GitHub Container Registry on every push to `main`:

```
ghcr.io/dmyrenne/trmnl-webhook:latest
```

## Architecture

```
src/
├── server.js      # Express server, data aggregation, 5-min cache, layout logic
├── scheduler.js   # node-cron — pushes every N minutes and once on startup
├── weather.js     # Visual Crossing API — current conditions, 3-day forecast, alerts
├── calendar.js    # Nextcloud CalDAV — VEVENTs + VTODOs (tsdav)
├── push.js        # Puppeteer screenshot → LaraPaper POST
└── views/
    ├── dashboard.ejs   # EJS template (800×480px)
    ├── styles.css      # Black & white / grayscale CSS
    └── fonts/          # Local fonts (not committed)
```

## License

MIT
