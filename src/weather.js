'use strict';

const axios = require('axios');

const ICON_MAP = {
  'clear-day': 'wb_sunny',
  'clear-night': 'bedtime',
  'partly-cloudy-day': 'partly_cloudy_day',
  'partly-cloudy-night': 'partly_cloudy_night',
  'cloudy': 'cloud',
  'rain': 'rainy',
  'snow': 'weather_snowy',
  'sleet': 'cloudy_snowing',
  'wind': 'air',
  'fog': 'foggy',
  'thunder-rain': 'thunderstorm',
  'thunder-showers-day': 'thunderstorm',
  'thunder-showers-night': 'thunderstorm',
  'showers-day': 'rainy',
  'showers-night': 'rainy',
  'snow-showers-day': 'weather_snowy',
  'snow-showers-night': 'weather_snowy',
};

/**
 * @typedef {Object} WeatherData
 * @property {number} tempCurrent
 * @property {number} tempMax
 * @property {number} tempMin
 * @property {string} description
 * @property {string} icon
 * @property {number} windSpeed
 * @property {number} humidity
 * @property {Array<{time: string, temp: number, icon: string}>} hourly
 */

/**
 * Fetches current weather and forecast from Visual Crossing.
 * @returns {Promise<WeatherData>}
 */
async function fetchWeather() {
  const location = encodeURIComponent(process.env.VISUAL_CROSSING_LOCATION || 'Berlin,DE');
  const key = process.env.VISUAL_CROSSING_KEY;

  const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${location}/next3days` +
    `?unitGroup=metric&lang=de&include=current,days,alerts&key=${key}&contentType=json`;

  const { data } = await axios.get(url, { timeout: 10000 });

  const current = data.currentConditions;

  const forecast = data.days.slice(0, 3).map((day) => ({
    icon: ICON_MAP[day.icon] || 'question_mark',
    tempMax: Math.round(day.tempmax),
    tempMin: Math.round(day.tempmin),
    precipProb: Math.round(day.precipprob || 0),
  }));

  const firstAlert = data.alerts && data.alerts.length > 0 ? data.alerts[0] : null;
  const alert = firstAlert
    ? { event: firstAlert.event, headline: firstAlert.headline }
    : null;

  return {
    tempCurrent: Math.round(current.temp),
    icon: ICON_MAP[current.icon] || 'question_mark',
    forecast,
    alert,
  };
}

module.exports = { fetchWeather };
