'use strict';

require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const { fetchWeather } = require('./weather');
const { fetchCalendarEvents, groupByDay } = require('./calendar');
const { startScheduler } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Berechnet das Kalender-Layout unter Berücksichtigung von Platzbeschränkungen.
 *
 * Pixelbudget (Kalender-Section ~356px hoch):
 *   - Pro Section: Label 35px + Gap 15px = 50px Overhead
 *   - Zwischen Sections: 30px Gap
 *   - Pro Event-Zeile: ~29px
 *   - 3-Section-Overhead: 3×50 + 2×30 = 210px → max 5 Event-Zeilen
 *   - 2-Section-Overhead: 2×50 + 1×30 = 130px → max 7 Event-Zeilen
 *
 * Regeln:
 *   - Vergangene Heute-Termine (nicht ganztägig) werden ausgeblendet
 *   - Passt alles in 3 Sections (Budget 5)? → 3-Section-Modus
 *   - Sonst: Übermorgen ausblenden, 2-Section-Modus (Budget 7)
 *
 * @param {{ today: CalEvent[], tomorrow: CalEvent[], dayAfterTomorrow: CalEvent[] }} grouped
 * @param {Date} now
 */
function layoutCalendar(grouped, now) {
  const todayFuture = grouped.today
    .filter((ev) => ev.allDay || ev.start >= now);

  const tomorrow = grouped.tomorrow;
  const dayAfter = grouped.dayAfterTomorrow;

  // Leere Sections zeigen nur das Label (kein Platzhalter), zählen daher 0 Event-Zeilen
  const todayLines = todayFuture.length;
  const tomorrowLines = tomorrow.length;
  const dayAfterLines = dayAfter.length;

  if (todayLines + tomorrowLines + dayAfterLines <= 5) {
    // Alles passt in 3 Sections
    return {
      showDayAfter: true,
      today: todayFuture,
      tomorrow,
      dayAfter,
    };
  }

  // 2-Section-Modus: Übermorgen ausblenden, Budget 7
  const todaySlots = Math.min(todayFuture.length, 3);
  const tomorrowSlots = Math.min(tomorrow.length, 7 - Math.max(todaySlots, 1));
  return {
    showDayAfter: false,
    today: todayFuture.slice(0, todaySlots),
    tomorrow: tomorrow.slice(0, tomorrowSlots),
    dayAfter: [],
  };
}

// Set timezone for date formatting
process.env.TZ = process.env.TIMEZONE || 'Europe/Berlin';

/**
 * Scannt das Fonts-Verzeichnis und generiert @font-face-Deklarationen
 * für alle gefundenen Font-Dateien unter dem in CUSTOM_FONT_FAMILY angegebenen Namen.
 * Gibt außerdem den zu verwendenden heading-Font-Namen zurück.
 */
function buildFontConfig() {
  const fontFamily = process.env.CUSTOM_FONT_FAMILY || '';
  const fontsDir = path.join(__dirname, 'views', 'fonts');
  const formatMap = { '.otf': 'opentype', '.ttf': 'truetype', '.woff2': 'woff2', '.woff': 'woff' };

  if (!fontFamily) {
    return { fontFaceCSS: '', headingFont: 'Caveat' };
  }

  let files = [];
  try {
    files = fs.readdirSync(fontsDir)
      .filter((f) => Object.keys(formatMap).includes(path.extname(f).toLowerCase()));
  } catch {
    return { fontFaceCSS: '', headingFont: 'Caveat' };
  }

  if (files.length === 0) {
    console.warn(`[server] CUSTOM_FONT_FAMILY="${fontFamily}" gesetzt, aber keine Font-Dateien in ${fontsDir} gefunden.`);
    return { fontFaceCSS: '', headingFont: 'Caveat' };
  }

  const fontFaceCSS = files.map((file) => {
    const format = formatMap[path.extname(file).toLowerCase()];
    return `@font-face{font-family:'${fontFamily}';src:url('/static/fonts/${file}') format('${format}');font-weight:normal;font-style:normal;}`;
  }).join('\n');

  console.log(`[server] Custom font "${fontFamily}" geladen (${files.length} Datei(en)).`);
  return { fontFaceCSS, headingFont: fontFamily };
}

const { fontFaceCSS, headingFont } = buildFontConfig();

// ─── i18n ─────────────────────────────────────────────────────────────────────

const TRANSLATIONS = {
  de: { today: 'Heute',     tomorrow: 'Morgen',   allDay: 'ganzt.',        weatherError: 'Wetter nicht verfügbar' },
  en: { today: 'Today',     tomorrow: 'Tomorrow', allDay: 'all-day',       weatherError: 'Weather unavailable' },
  fr: { today: "Auj.",      tomorrow: 'Demain',   allDay: 'journée',       weatherError: 'Météo indisponible' },
  es: { today: 'Hoy',       tomorrow: 'Mañana',   allDay: 'todo el día',   weatherError: 'Clima no disponible' },
  it: { today: 'Oggi',      tomorrow: 'Domani',   allDay: 'giornata',      weatherError: 'Meteo non disponibile' },
  nl: { today: 'Vandaag',   tomorrow: 'Morgen',   allDay: 'hele dag',      weatherError: 'Weer niet beschikbaar' },
  pt: { today: 'Hoje',      tomorrow: 'Amanhã',   allDay: 'dia inteiro',   weatherError: 'Tempo indisponível' },
};

// Mappt kurze Ländercodes (z.B. "DE") auf BCP-47-Locales (z.B. "de-DE")
const LOCALE_MAP = {
  AT: 'de-AT', BR: 'pt-BR', CH: 'de-CH', CN: 'zh-CN', CZ: 'cs-CZ',
  DE: 'de-DE', DK: 'da-DK', ES: 'es-ES', FI: 'fi-FI', FR: 'fr-FR',
  GB: 'en-GB', GR: 'el-GR', HR: 'hr-HR', HU: 'hu-HU', IT: 'it-IT',
  JP: 'ja-JP', KR: 'ko-KR', NL: 'nl-NL', NO: 'nb-NO', PL: 'pl-PL',
  PT: 'pt-PT', RO: 'ro-RO', RU: 'ru-RU', SE: 'sv-SE', SK: 'sk-SK',
  TR: 'tr-TR', UA: 'uk-UA', US: 'en-US',
};

const rawLocale = (process.env.LOCALE || 'US').toUpperCase();
const locale = LOCALE_MAP[rawLocale] || rawLocale;
const langCode = locale.split('-')[0].toLowerCase();
const t = TRANSLATIONS[langCode] || TRANSLATIONS.en;

// Locales die standardmäßig 12h-Format und Fahrenheit nutzen
const IMPERIAL_LOCALES = ['US', 'BS', 'BZ', 'KY', 'PW'];
const isImperial = IMPERIAL_LOCALES.includes(rawLocale);

// Zeitformat: TIME_FORMAT=12h / 24h, sonst Locale-Default
const rawTimeFormat = (process.env.TIME_FORMAT || '').toLowerCase();
const hour12 = rawTimeFormat === '12h' ? true : rawTimeFormat === '24h' ? false : (isImperial ? true : undefined);
const timeOpts = { hour: '2-digit', minute: '2-digit', ...(hour12 !== undefined && { hour12 }) };

// Temperatureinheit: UNIT_TEMP=C / F, sonst Locale-Default
const rawUnitTemp = (process.env.UNIT_TEMP || '').toUpperCase();
const tempUnit = rawUnitTemp === 'F' || (!rawUnitTemp && isImperial) ? '°F' : '°C';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/static', express.static(path.join(__dirname, 'views')));

// Cache for data to avoid re-fetching on every screenshot load
let cachedData = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getData() {
  const now = Date.now();
  if (cachedData && now - cacheTime < CACHE_TTL_MS) {
    return cachedData;
  }

  const [weather, events] = await Promise.allSettled([
    fetchWeather(),
    fetchCalendarEvents(),
  ]);

  const weatherData = weather.status === 'fulfilled'
    ? weather.value
    : { error: weather.reason?.message || 'Wetter nicht verfügbar' };

  const calendarEvents = events.status === 'fulfilled'
    ? events.value
    : [];

  if (events.status === 'rejected') {
    console.error('[server] Kalender-Fehler:', events.reason?.message);
  }

  const grouped = groupByDay(calendarEvents);

  const now2 = new Date();
  const calLayout = layoutCalendar(grouped, now2);
  const dateStr = now2.toLocaleDateString(locale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const timeStr = now2.toLocaleTimeString(locale, timeOpts);

  const tomorrow = new Date(now2);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });

  const dayAfter = new Date(now2);
  dayAfter.setDate(dayAfter.getDate() + 2);
  // Wochentag via Intl — funktioniert automatisch in jeder Sprache
  const dayAfterLabel = dayAfter.toLocaleDateString(locale, { weekday: 'long' });
  const dayAfterStr = dayAfter.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });

  cachedData = { weather: weatherData, calLayout, dateStr, timeStr, tomorrowStr, dayAfterLabel, dayAfterStr, fontFaceCSS, headingFont, locale, timeOpts, tempUnit, t };
  cacheTime = Date.now();
  return cachedData;
}

app.get('/', async (req, res) => {
  try {
    const data = await getData();
    res.render('dashboard', data);
  } catch (err) {
    console.error('[server] Render-Fehler:', err.message);
    res.status(500).send(`<pre>Fehler: ${err.message}</pre>`);
  }
});

// Manual trigger endpoint
app.post('/trigger', (req, res) => {
  cachedData = null; // invalidate cache
  res.json({ ok: true, message: 'Update ausgelöst' });
  // Trigger async, don't wait
  const { screenshotAndPush } = require('./push');
  screenshotAndPush(`http://localhost:${PORT}/`).catch((err) =>
    console.error('[trigger] Fehler:', err.message)
  );
});

app.listen(PORT, () => {
  console.log(`[server] Dashboard läuft auf http://localhost:${PORT}`);
  const dashboardUrl = `http://localhost:${PORT}/`;
  startScheduler(dashboardUrl);
});
