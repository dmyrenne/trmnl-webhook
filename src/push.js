'use strict';

const puppeteer = require('puppeteer-core');
const axios = require('axios');
const FormData = require('form-data');

const VIEWPORT = { width: 800, height: 480, deviceScaleFactor: 1 };

/**
 * Takes a screenshot of the dashboard and pushes it to the LaraPaper webhook.
 * @param {string} dashboardUrl - URL of the dashboard to screenshot
 * @returns {Promise<void>}
 */
async function screenshotAndPush(dashboardUrl) {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
  const webhookUrl = process.env.LARAPAPER_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error('LARAPAPER_WEBHOOK_URL ist nicht gesetzt');
  }

  console.log('[push] Starte Puppeteer...');

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  let imageBuffer;

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);

    // Inject grayscale filter via script tag before navigation
    await page.evaluateOnNewDocument(() => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.style.filter = 'grayscale(1) contrast(1.15)';
      });
    });

    console.log(`[push] Lade ${dashboardUrl}`);
    await page.goto(dashboardUrl, { waitUntil: 'networkidle0', timeout: 15000 });

    imageBuffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, ...VIEWPORT } });
    console.log(`[push] Screenshot erstellt (${imageBuffer.length} bytes)`);
  } finally {
    await browser.close();
  }

  // Push to LaraPaper
  const form = new FormData();
  form.append('image', imageBuffer, { filename: 'dashboard.png', contentType: 'image/png' });

  console.log(`[push] Sende Bild an ${webhookUrl}`);
  const response = await axios.post(webhookUrl, form, {
    headers: form.getHeaders(),
    timeout: 15000,
  });

  console.log(`[push] Webhook-Antwort: ${response.status} ${response.statusText}`);
}

module.exports = { screenshotAndPush };
