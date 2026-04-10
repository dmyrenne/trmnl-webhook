'use strict';

const { DAVClient } = require('tsdav');

/**
 * @typedef {Object} CalEvent
 * @property {string} summary
 * @property {Date} start
 * @property {Date} end
 * @property {boolean} allDay
 */

/**
 * Parses a VEVENT block from raw iCal string.
 * @param {string} icalString
 * @returns {CalEvent[]}
 */
function parseEvents(icalString) {
  const events = [];

  const get = (block, key) => {
    const match = block.match(new RegExp(`${key}[^:]*:([^\r\n]+)`));
    return match ? match[1].trim() : null;
  };

  // VEVENTs
  const eventBlocks = icalString.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  for (const block of eventBlocks) {
    const summary = get(block, 'SUMMARY') || '(kein Titel)';
    const dtstart = get(block, 'DTSTART');
    const dtend = get(block, 'DTEND');
    if (!dtstart) continue;
    const allDay = !dtstart.includes('T');
    const start = parseICalDate(dtstart);
    const end = dtend ? parseICalDate(dtend) : new Date(start.getTime() + 3600000);
    if (start) events.push({ summary, start, end, allDay, type: 'event' });
  }

  // VTODOs (Erinnerungen / Aufgaben)
  const todoBlocks = icalString.match(/BEGIN:VTODO[\s\S]*?END:VTODO/g) || [];
  for (const block of todoBlocks) {
    const summary = get(block, 'SUMMARY') || '(kein Titel)';
    const dtdue = get(block, 'DUE') || get(block, 'DTSTART');
    if (!dtdue) continue;
    const status = get(block, 'STATUS') || 'NEEDS-ACTION';
    const allDay = !dtdue.includes('T');
    const start = parseICalDate(dtdue);
    if (!start) continue;
    events.push({
      summary,
      start,
      end: start,
      allDay,
      type: 'task',
      completed: status === 'COMPLETED',
    });
  }

  return events;
}

function parseICalDate(str) {
  // Remove VALUE=DATE: or TZID=...: prefixes
  const clean = str.replace(/^[^:]+:/, '').trim();

  if (clean.length === 8) {
    // All-day: YYYYMMDD
    const y = clean.slice(0, 4);
    const m = clean.slice(4, 6);
    const d = clean.slice(6, 8);
    return new Date(`${y}-${m}-${d}T00:00:00`);
  }

  // With time: YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
  const y = clean.slice(0, 4);
  const mo = clean.slice(4, 6);
  const d = clean.slice(6, 8);
  const h = clean.slice(9, 11);
  const mi = clean.slice(11, 13);
  const s = clean.slice(13, 15);
  const utc = clean.endsWith('Z') ? 'Z' : '';
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${utc}`);
}

/**
 * Fetches calendar events for today and the next 2 days from Nextcloud CalDAV.
 * @returns {Promise<CalEvent[]>}
 */
async function fetchCalendarEvents() {
  const client = new DAVClient({
    serverUrl: process.env.CALDAV_URL,
    credentials: {
      username: process.env.CALDAV_USER,
      password: process.env.CALDAV_PASSWORD,
    },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });

  await client.login();

  const calendars = await client.fetchCalendars();
  const calendarName = process.env.CALDAV_CALENDAR_NAME || '';

  const targetCalendars = calendarName
    ? calendars.filter((c) =>
        c.displayName?.toLowerCase().includes(calendarName.toLowerCase())
      )
    : calendars;

  if (targetCalendars.length === 0) {
    console.warn('[calendar] Kein passender Kalender gefunden, verwende alle.');
  }

  const usedCalendars = targetCalendars.length > 0 ? targetCalendars : calendars;

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 3);

  const allEvents = [];

  for (const cal of usedCalendars) {
    const objects = await client.fetchCalendarObjects({
      calendar: cal,
      timeRange: { start: start.toISOString(), end: end.toISOString() },
    });

    for (const obj of objects) {
      if (obj.data) {
        const events = parseEvents(obj.data);
        allEvents.push(...events);
      }
    }
  }

  // Sort by start time
  allEvents.sort((a, b) => a.start - b.start);

  return allEvents;
}

/**
 * Groups events by day label: 'today', 'tomorrow', 'dayAfterTomorrow'
 * @param {CalEvent[]} events
 * @returns {{ today: CalEvent[], tomorrow: CalEvent[], dayAfterTomorrow: CalEvent[] }}
 */
function groupByDay(events) {
  const now = new Date();
  const todayStr = now.toDateString();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toDateString();

  const dayAfter = new Date(now);
  dayAfter.setDate(dayAfter.getDate() + 2);
  const dayAfterStr = dayAfter.toDateString();

  return {
    today: events.filter((e) => e.start.toDateString() === todayStr),
    tomorrow: events.filter((e) => e.start.toDateString() === tomorrowStr),
    dayAfterTomorrow: events.filter((e) => e.start.toDateString() === dayAfterStr),
  };
}

module.exports = { fetchCalendarEvents, groupByDay };
