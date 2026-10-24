import { dbManager } from '../db/client';

export interface GeocodedLocation {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  label: string;
}

export interface WeatherData {
  location: string;
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
  private cacheKey = '';
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes in ms

  private geocodeCache = new Map<string, { data: GeocodedLocation; timestamp: number }>();
  private readonly GEOCODE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Geocodes a city name to latitude/longitude using Open-Meteo's free geocoding API.
   * Zero API key required.
   */
  async geocodeCity(cityName: string): Promise<GeocodedLocation | null> {
    const query = (cityName || '').trim();
    if (!query) return null;

    const key = query.toLowerCase();
    const cached = this.geocodeCache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.GEOCODE_TTL) {
      return cached.data;
    }

    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
      const res = await fetch(geoUrl, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) {
        console.warn(`[weather] Geocoding returned HTTP ${res.status} for "${query}"`);
        return null;
      }

      const json = await res.json() as {
        results?: Array<{
          name: string;
          latitude: number;
          longitude: number;
          country?: string;
          admin1?: string;
          timezone?: string;
        }>;
      };

      if (!json.results || json.results.length === 0) {
        console.warn(`[weather] No geocoding results found for "${query}"`);
        return null;
      }

      const top = json.results[0];
      const parts = [top.name];
      if (top.admin1 && top.admin1 !== top.name) parts.push(top.admin1);
      if (top.country) parts.push(top.country);
      const label = parts.join(', ');

      const location: GeocodedLocation = {
        name: top.name,
        country: top.country,
        admin1: top.admin1,
        latitude: top.latitude,
        longitude: top.longitude,
        timezone: top.timezone,
        label
      };

      this.geocodeCache.set(key, { data: location, timestamp: Date.now() });
      console.log(`[weather] Geocoded "${query}" -> ${label} (${top.latitude}, ${top.longitude})`);
      return location;
    } catch (e: any) {
      console.warn(`[weather] Geocoding failed for "${query}":`, e.message);
      return null;
    }
  }

  async fetchWeather(overrideCity?: string, overrideLat?: number, overrideLon?: number): Promise<WeatherData | null> {
    if (!dbManager.isFeatureEnabled('weather_enabled', false)) {
      return null;
    }

    const city = overrideCity || dbManager.getRuntimeSetting('weather_city', process.env.WEATHER_CITY || '');
    let lat = overrideLat;
    let lon = overrideLon;
    let locationLabel = city || 'Local City';
    let tz = dbManager.getRuntimeSetting('timezone', process.env.TIMEZONE || 'auto');

    // 1. Resolve coordinates from city name if available
    if (city && (lat === undefined || lon === undefined)) {
      const geocoded = await this.geocodeCity(city);
      if (geocoded) {
        lat = geocoded.latitude;
        lon = geocoded.longitude;
        locationLabel = geocoded.label;
        if (!tz || tz === 'auto') {
          tz = geocoded.timezone || 'auto';
        }
      }
    }

    // 2. Fall back to manual or default coordinates if geocoding failed or city was omitted
    if (lat === undefined || lon === undefined) {
      lat = Number(dbManager.getRuntimeSetting('weather_lat', process.env.WEATHER_LAT || '-6.2088')); // default Jakarta
      lon = Number(dbManager.getRuntimeSetting('weather_lon', process.env.WEATHER_LON || '106.8456'));
      locationLabel = dbManager.getRuntimeSetting('weather_location_name', process.env.WEATHER_LOCATION_NAME || 'Jakarta, Indonesia');
    }

    const now = Date.now();
    const currentKey = `${lat.toFixed(3)},${lon.toFixed(3)},${tz}`;
    if (this.cache && this.cacheKey === currentKey && (now - this.cacheTime) < this.CACHE_TTL) {
      return this.cache;
    }

    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', lat.toString());
      url.searchParams.set('longitude', lon.toString());
      url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature');
      url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max');
      url.searchParams.set('timezone', tz || 'auto');
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
        location: locationLabel,
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
            rain_chance: daily.precipitation_probability_max[i] ?? 0,
          });
        }
      }

      this.cache = result;
      this.cacheKey = currentKey;
      this.cacheTime = now;
      console.log(`[weather] Fetched current weather for ${locationLabel}: ${result.current.description}, ${result.current.temperature}°C`);
      return result;
    } catch (e: any) {
      console.warn('[weather] Failed to fetch weather:', e.message);
      return null;
    }
  }

  async formatWeatherSummary(): Promise<string | null> {
    const data = await this.fetchWeather();
    if (!data) return null;
    return `${data.location}: ${data.current.description}, ${data.current.temperature}°C (Feels like ${data.current.feels_like}°C, Humidity ${data.current.humidity}%)`;
  }

  /**
   * Generates a concise real-time weather context block to inject into LLM system prompt.
   */
  async getWeatherPromptContext(): Promise<string | null> {
    const data = await this.fetchWeather();
    if (!data) return null;

    const todayF = data.forecast[0]
      ? `Today max ${data.forecast[0].temp_max}°C / min ${data.forecast[0].temp_min}°C (${data.forecast[0].description}${data.forecast[0].rain_chance > 0 ? `, ${data.forecast[0].rain_chance}% rain` : ''})`
      : '';
    const tomorrowF = data.forecast[1]
      ? `Tomorrow max ${data.forecast[1].temp_max}°C / min ${data.forecast[1].temp_min}°C (${data.forecast[1].description}${data.forecast[1].rain_chance > 0 ? `, ${data.forecast[1].rain_chance}% rain` : ''})`
      : '';
    const forecastStr = [todayF, tomorrowF].filter(Boolean).join(' | ');

    return `\n\nREAL-TIME WEATHER CONTEXT:
- Location: ${data.location}
- Current Weather: ${data.current.description}, ${data.current.temperature}°C (Feels like ${data.current.feels_like}°C, Humidity: ${data.current.humidity}%, Wind: ${data.current.wind_speed} km/h)
- Forecast: ${forecastStr || 'Fair weather predicted'}
- Instructions: When the user asks about the weather, temperature, whether it is raining, or outdoor conditions, answer using this accurate real-time data while staying in character.`;
  }
}

export const weatherService = new WeatherService();
