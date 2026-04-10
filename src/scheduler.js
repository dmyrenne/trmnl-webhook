'use strict';

const cron = require('node-cron');
const { screenshotAndPush } = require('./push');

let isRunning = false;

async function runUpdate(dashboardUrl) {
  if (isRunning) {
    console.log('[scheduler] Update läuft bereits, überspringe.');
    return;
  }
  isRunning = true;
  try {
    await screenshotAndPush(dashboardUrl);
  } catch (err) {
    console.error('[scheduler] Fehler beim Update:', err.message);
  } finally {
    isRunning = false;
  }
}

/**
 * Parst UPDATE_SCHEDULE in einen Cron-Ausdruck.
 *
 * Unterstützte Formate:
 *   15M   → alle 15 Minuten       → "*/15 * * * *"
 *   2H    → alle 2 Stunden        → "0 */2 * * *"
 *   15:00 → täglich um 15:00 Uhr  → "0 15 * * *"
 *
 * @param {string} schedule
 * @returns {{ cron: string, description: string }}
 */
function parseSchedule(schedule) {
  if (!schedule) {
    return { cron: '*/15 * * * *', description: 'alle 15 Minuten (Standard)' };
  }

  // Format: 15M
  const minuteMatch = schedule.match(/^(\d+)[Mm]$/);
  if (minuteMatch) {
    const m = parseInt(minuteMatch[1], 10);
    if (m < 1 || m > 59) throw new Error(`UPDATE_SCHEDULE: Minuten müssen zwischen 1 und 59 liegen (got ${m})`);
    return { cron: `*/${m} * * * *`, description: `alle ${m} Minuten` };
  }

  // Format: 1H
  const hourMatch = schedule.match(/^(\d+)[Hh]$/);
  if (hourMatch) {
    const h = parseInt(hourMatch[1], 10);
    if (h < 1 || h > 23) throw new Error(`UPDATE_SCHEDULE: Stunden müssen zwischen 1 und 23 liegen (got ${h})`);
    return { cron: `0 */${h} * * *`, description: `alle ${h} Stunde(n)` };
  }

  // Format: 15:00
  const timeMatch = schedule.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const h = parseInt(timeMatch[1], 10);
    const m = parseInt(timeMatch[2], 10);
    if (h < 0 || h > 23) throw new Error(`UPDATE_SCHEDULE: Stunde ungültig (got ${h})`);
    if (m < 0 || m > 59) throw new Error(`UPDATE_SCHEDULE: Minute ungültig (got ${m})`);
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    return { cron: `${m} ${h} * * *`, description: `täglich um ${hh}:${mm} Uhr` };
  }

  throw new Error(`UPDATE_SCHEDULE: Unbekanntes Format "${schedule}". Gültige Formate: 15M, 2H, 15:00`);
}

/**
 * Startet den Scheduler. Läuft sofort beim Start, danach nach UPDATE_SCHEDULE.
 * @param {string} dashboardUrl
 */
function startScheduler(dashboardUrl) {
  const { cron: cronExpression, description } = parseSchedule(process.env.UPDATE_SCHEDULE);

  console.log(`[scheduler] Starte mit Zeitplan: ${description} (${cronExpression})`);

  // Sofort beim Start ausführen
  runUpdate(dashboardUrl);

  cron.schedule(cronExpression, () => {
    console.log('[scheduler] Geplantes Update...');
    runUpdate(dashboardUrl);
  });
}

module.exports = { startScheduler };
