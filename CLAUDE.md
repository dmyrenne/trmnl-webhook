# TRMNL Dashboard — Projektkontext

## Was ist das hier?

Ein Node.js-Server, der ein Dashboard für ein **TRMNL E-Ink-Display (800×480px)** rendert.
Der Server erstellt via Puppeteer einen Screenshot der Webseite und pusht diesen alle 15 Minuten
an den **LaraPaper Image Webhook**.

## Deployment

- Läuft als **Docker Container** auf dem Server
- Dashboard erreichbar unter `http://10.10.1.3:3210`
- LaraPaper Webhook: `http://10.10.1.3:4567/api/plugin_settings/9ecff77a-3055-4246-a220-51b90d4827eb/image`

## Dateistruktur

```
├── Dockerfile
├── docker-compose.yml
├── package.json
├── .env                    # API-Keys + Credentials (nicht committen)
├── .env.example            # Vorlage
└── src/
    ├── server.js           # Express + Daten-Aggregation + 5-Min-Cache + layoutCalendar()
    ├── scheduler.js        # node-cron (alle 15 Min + sofort beim Start)
    ├── weather.js          # Visual Crossing API (Wetter + Warnungen)
    ├── calendar.js         # Nextcloud CalDAV (tsdav) — VEVENTs + VTODOs
    ├── push.js             # Puppeteer Screenshot → LaraPaper POST
    └── views/
        ├── dashboard.ejs   # EJS-Template (800×480)
        ├── styles.css      # B&W / Graustufen-CSS
        └── fonts/
            ├── BetaniaPatmos-Regular.otf     # Gekaufte Font (nicht committen)
            ├── BetaniaPatmos-Superligada.otf
            └── ...weitere Schnitte
```

## Display & Design

- **Auflösung**: 800×480px
- **Farben**: Schwarz-Weiß / 4-bit Graustufen
- **Puppeteer**: wartet auf `document.fonts.ready` vor Screenshot
- **Graustufen**: `filter: grayscale(1) contrast(1.15)` via `evaluateOnNewDocument`

### Font-Einsatz

| Element | Font | Größe |
|---|---|---|
| Datum (Header oben links) | BetaniaPatmos | 40px |
| Tag-Labels (Heute / Morgen / Übermorgen) | BetaniaPatmos | 32px |
| Uhrzeit (Header rechts) | BetaniaPatmos | 24px |
| Temperaturen, Zeiten, Event-Titel | Lato (Google Fonts CDN) | 24px |
| Wetter-Icons | Material Symbols Outlined (Google Fonts CDN) | variabel |

`BetaniaPatmos-Regular.otf` ist eine gekaufte Font. Sie wird über `@font-face` in `styles.css`
eingebunden (`/static/fonts/BetaniaPatmos-Regular.otf`). **Nicht committen.**

Lato und Material Symbols Outlined werden zur Laufzeit von Google Fonts geladen —
Puppeteer wartet via `document.fonts.ready` bis alle Fonts bereit sind.

### Layout

- Padding: `25px` oben/unten, `20px` links/rechts
- Header + `25px` Gap + Content
- Content: zwei gleich breite Spalten (`flex: 1`) mit `10px` Gap
- Kalender-Spalte ist vertikal zentriert (`justify-content: center`)
- Äußerer Rahmen: `1px solid #bbb`
- Kein Header-Trennbalken, keine Trennlinien zwischen Sections

## Datenquellen

| Quelle | Library | Config |
|---|---|---|
| Wetter + Warnungen | Visual Crossing API (`next3days`, `include=current,days,alerts`) | `VISUAL_CROSSING_KEY`, `VISUAL_CROSSING_LOCATION` |
| Kalender + Aufgaben | Nextcloud CalDAV (tsdav) — VEVENTs + VTODOs | `CALDAV_URL`, `CALDAV_USER`, `CALDAV_PASSWORD`, `CALDAV_CALENDAR_NAME` |

## Wetter-Panel

- **Aktuell**: großes Icon (60px) + aktuelle Temperatur (48px)
- **3-Tages-Forecast**: je Icon (40px) + Höchst / Tief / Regenwahrscheinlichkeit (%)
- **Wetterwarnung**: erscheint unterhalb des Forecasts wenn `weather.alert` gesetzt ist (`report`-Icon + Text)
- Icons: Google Material Symbols Outlined — Mapping in `ICON_MAP` in `weather.js`

## Kalender-Panel

### Anzeige-Logik (`layoutCalendar` in `server.js`)

Pixelbudget (Kalender-Section ~356px hoch):
- Pro Section: Label 35px + Gap 12px = ~47px Overhead
- Zwischen Sections: 30px Gap
- Pro Event-/Task-Zeile: ~29px
- **3-Section-Modus** (Heute + Morgen + Übermorgen): max **5 Zeilen** total
- **2-Section-Modus** (Heute + Morgen, Übermorgen ausgeblendet): max **7 Zeilen** total

Regeln:
1. Vergangene Heute-Termine (nicht ganztägig, `start < now`) werden ausgeblendet
2. Passt alles in 5 Zeilen → 3-Section-Modus
3. Sonst → 2-Section-Modus (Übermorgen komplett weg, max 3 Heute + 4 Morgen)
4. Leere Tage zeigen **nur den Label** — kein Platzhalter-Text

### Events vs. Tasks

- **VEVENTs** → `type: 'event'` — Darstellung: `HH:MM Titel`
- **VTODOs** → `type: 'task'`, `completed: boolean` — Darstellung:
  - Erledigt: `check_circle`-Icon + ~~durchgestrichener Text~~
  - Offen: `radio_button_unchecked`-Icon + normaler Text
- DUE-Datum des VTODOs bestimmt den Kalender-Abschnitt (Heute / Morgen / Übermorgen)

## Umgebungsvariablen (.env)

```
VISUAL_CROSSING_KEY=...
VISUAL_CROSSING_LOCATION=Berlin,DE

CALDAV_URL=https://nextcloud.example.com/remote.php/dav
CALDAV_USER=...
CALDAV_PASSWORD=...
CALDAV_CALENDAR_NAME=personal

LARAPAPER_WEBHOOK_URL=http://10.10.1.3:4567/api/plugin_settings/9ecff77a-3055-4246-a220-51b90d4827eb/image

# Formate: 15M (alle 15 Min), 2H (alle 2 Std), 15:00 (täglich um 15 Uhr)
UPDATE_SCHEDULE=15M
TIMEZONE=Europe/Berlin
PORT=3000
```

## Nützliche Befehle

```bash
# Container neu bauen und starten
docker compose up --build -d

# Logs live verfolgen
docker compose logs -f

# Manuellen Update-Push auslösen
curl -X POST http://localhost:3000/trigger

# Dashboard im Browser ansehen
# http://10.10.1.3:3210
```
