import { dbManager } from '../db/client';

export interface WeatherData {
  current: {
    temperature: number;
    feels_like: number;
    humidity: number;
    wind_speed: number;
    weather_code: number;
    description: string;
    condition: string;
  };
  forecast: Array<{
    date: string;
    code: number;
    description: string;
    temp_max: number;
    temp_min: number;
    precipitation: number;
    rain_chance: number;
  }>;
}

const WMO_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

const WMO_CONDITION: Record<number, string> = {
  0: 'clear',
  1: 'clear',
  2: 'cloudy',
  3: 'cloudy',
  45: 'foggy',
  48: 'foggy',
  51: 'drizzle',
  53: 'drizzle',
  55: 'drizzle',
  61: 'rainy',
  63: 'rainy',
  65: 'rainy',
  71: 'snowy',
  73: 'snowy',
  75: 'snowy',
  80: 'rainy',
  81: 'rainy',
  82: 'rainy',
  95: 'stormy',
  96: 'stormy',
  99: 'stormy',
};

class WeatherService {
  private cache: WeatherData | null = null;
  private cacheTime = 0;
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes in ms

  async fetchWeather(overrideLat?: number, overrideLon?: number): Promise<WeatherData | null> {
    if (!dbManager.isFeatureEnabled('weather_enabled', false)) {
      return null;
    }

    const now = Date.now();
    if (this.cache && (now - this.cacheTime) < this.CACHE_TTL) {
      return this.cache;
    }

    const lat = overrideLat ?? Number(dbManager.getRuntimeSetting('weather_lat', process.env.WEATHER_LAT || '-6.2088')); // default Jakarta
    const lon = overrideLon ?? Number(dbManager.getRuntimeSetting('weather_lon', process.env.WEATHER_LON || '106.8456'));
    const tz = dbManager.getRuntimeSetting('timezone', process.env.TIMEZONE || 'auto');

    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', lat.toString());
      url.searchParams.set('longitude', lon.toString());
      url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature');
      url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max');
      url.searchParams.set('timezone', tz);
      url.searchParams.set('forecast_days', '3');

      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        console.warn(`[weather] Open-Meteo returned status ${res.status}`);
        return null;
      }

      const data = await res.json() as any;
      const current = data.current;
      const daily = data.daily;
      const code = current.weather_code;

      const result: WeatherData = {
        current: {
          temperature: current.temperature_2m,
          feels_like: current.apparent_temperature,
          humidity: current.relative_humidity_2m,
          wind_speed: current.wind_speed_10m,
          weather_code: code,
          description: WMO_CODES[code] || 'Unknown',
          condition: WMO_CONDITION[code] || 'clear',
        },
        forecast: [],
      };

      if (daily && Array.isArray(daily.time)) {
        for (let i = 0; i < daily.time.length; i++) {
          const dCode = daily.weather_code[i];
          result.forecast.push({
            date: daily.time[i],
            code: dCode,
            description: WMO_CODES[dCode] || 'Unknown',
            temp_max: daily.temperature_2m_max[i],
            temp_min: daily.temperature_2m_min[i],
            precipitation: daily.precipitation_sum[i],
            rain_chance: daily.precipitation_probability_max[i],
          });
        }
      }

      this.cache = result;
      this.cacheTime = now;
      console.log(`[weather] Fetched current weather: ${result.current.description}, ${result.current.temperature}°C`);
      return result;
    } catch (e: any) {
      console.warn('[weather] Failed to fetch weather:', e.message);
      return null;
    }
  }

  async formatWeatherSummary(): Promise<string | null> {
    const data = await this.fetchWeather();
    if (!data) return null;
    const locName = dbManager.getRuntimeSetting('weather_location_name', process.env.WEATHER_LOCATION_NAME || 'Local City');
    return `${locName}: ${data.current.description}, ${data.current.temperature}°C (Feels like ${data.current.feels_like}°C, Humidity ${data.current.humidity}%)`;
  }
}

export const weatherService = new WeatherService();
