'use strict';

const { DAVClient } = require('tsdav');
const ICAL = require('ical.js');

/**
 * @typedef {Object} CalEvent
 * @property {string} summary
 * @property {Date} start
 * @property {Date} end
 * @property {boolean} allDay
 * @property {'event'|'task'} type
 * @property {boolean} [completed]
 */

/**
 * Parses iCal string and expands recurring VEVENTs within [rangeStart, rangeEnd).
 * @param {string} icalString
 * @param {Date} rangeStart
 * @param {Date} rangeEnd
 * @returns {CalEvent[]}
 */
function parseVEvents(icalString, rangeStart, rangeEnd) {
  const events = [];

  let jcal;
  try {
    jcal = ICAL.parse(icalString);
  } catch (e) {
    return events;
  }

  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents('vevent');

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);

    if (event.isRecurring()) {
      const iter = event.iterator();
      let next;
      // Iterate occurrences; stop once past rangeEnd
      while ((next = iter.next())) {
        const occStart = next.toJSDate();
        if (occStart >= rangeEnd) break;
        if (occStart < rangeStart) continue;

        const duration = event.duration;
        const occEnd = new Date(occStart.getTime() + duration.toSeconds() * 1000);
        const allDay = next.isDate;

        events.push({
          summary: event.summary || '(kein Titel)',
          start: occStart,
          end: occEnd,
          allDay,
          type: 'event',
        });
      }
    } else {
      const dtstart = event.startDate;
      if (!dtstart) continue;
      const start = dtstart.toJSDate();
      if (start >= rangeEnd || start < rangeStart) continue;

      const dtend = event.endDate;
      const end = dtend ? dtend.toJSDate() : new Date(start.getTime() + 3600000);
      const allDay = dtstart.isDate;

      events.push({
        summary: event.summary || '(kein Titel)',
        start,
        end,
        allDay,
        type: 'event',
      });
    }
  }

  return events;
}

function parseICalDate(str) {
  const clean = str.replace(/^[^:]+:/, '').trim();
  if (clean.length === 8) {
    const y = clean.slice(0, 4);
    const m = clean.slice(4, 6);
    const d = clean.slice(6, 8);
    return new Date(`${y}-${m}-${d}T00:00:00`);
  }
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
 * Recurring events are expanded correctly.
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

  const eventCalendars = targetCalendars.length > 0 ? targetCalendars : calendars;


  const now = new Date();
  const rangeStart = new Date(now);
  rangeStart.setHours(0, 0, 0, 0);

  const rangeEnd = new Date(rangeStart);
  rangeEnd.setDate(rangeEnd.getDate() + 3);

  const allEvents = [];

  // VEVENTs: only from the configured calendar (filtered by name)
  for (const cal of eventCalendars) {
    const eventObjects = await client.fetchCalendarObjects({
      calendar: cal,
      timeRange: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
    });

    for (const obj of eventObjects) {
      if (obj.data) {
        const events = parseVEvents(obj.data, rangeStart, rangeEnd);
        allEvents.push(...events);
      }
    }
  }

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
