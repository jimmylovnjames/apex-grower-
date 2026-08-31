import { DailyForecast, GrowLocation, GrowStage, LocalClimate, ClimateInsights } from '../types';
import {
  addDays,
  dayLengthHours,
  formatHours,
  hemisphereOf,
  isLengthening,
  nextDownwardCrossing,
  seasonOf,
  toISODate
} from './solar';

/** WMO weather interpretation codes. */
const WEATHER_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Heavy freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Heavy freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Showers',
  82: 'Violent showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Severe thunderstorm with hail'
};

const describeWeather = (code: number): string => WEATHER_CODES[code] ?? 'Unknown conditions';

/** Saturation vapour pressure in kPa (Tetens). */
const saturationVapourPressure = (celsius: number): number =>
  0.61078 * Math.exp((17.27 * celsius) / (celsius + 237.3));

/**
 * Leaf-surface VPD in kPa. Transpiring leaves sit roughly 2 degrees below air
 * temperature under LED, which is the number growers actually target.
 */
export const leafVpd = (airTempC: number, relativeHumidity: number, leafOffsetC = 2): number => {
  const leaf = saturationVapourPressure(airTempC - leafOffsetC);
  const air = saturationVapourPressure(airTempC) * (relativeHumidity / 100);
  return Math.max(0, Number((leaf - air).toFixed(2)));
};

export const VPD_TARGETS: Record<GrowStage, { min: number; max: number; label: string }> = {
  [GrowStage.SEEDLING]: { min: 0.4, max: 0.8, label: '0.4 – 0.8 kPa' },
  [GrowStage.VEGETATIVE]: { min: 0.8, max: 1.2, label: '0.8 – 1.2 kPa' },
  [GrowStage.FLOWERING]: { min: 1.0, max: 1.5, label: '1.0 – 1.5 kPa' },
  [GrowStage.CURING]: { min: 0.8, max: 1.2, label: 'n/a — hold 60% RH / 18°C' }
};

export const vpdVerdict = (vpd: number, stage: GrowStage): string => {
  const target = VPD_TARGETS[stage];
  if (stage === GrowStage.CURING) return 'Not applicable during dry/cure';
  if (vpd < target.min) return `Too low — transpiration stalls, invites mould (target ${target.label})`;
  if (vpd > target.max) return `Too high — stomata close, plants drink hard (target ${target.label})`;
  return `In range for ${stage.toLowerCase()} (target ${target.label})`;
};

const mean = (values: number[]): number =>
  values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;

interface OpenMeteoResponse {
  timezone: string;
  elevation: number;
  current: Record<string, number | string>;
  daily: Record<string, (number | string)[]>;
  hourly: { time: string[]; relative_humidity_2m: number[] };
}

/**
 * Group hourly humidity by calendar date, splitting out the 22:00–08:00 window.
 * Overnight humidity is what actually drives botrytis, not the daily average.
 */
const humidityByDate = (hourly: OpenMeteoResponse['hourly']) => {
  const all: Record<string, number[]> = {};
  const night: Record<string, number[]> = {};

  (hourly?.time || []).forEach((timestamp, index) => {
    const [date, time] = timestamp.split('T');
    const hour = Number((time || '00:00').slice(0, 2));
    const humidity = hourly.relative_humidity_2m[index];
    if (typeof humidity !== 'number') return;

    (all[date] ||= []).push(humidity);
    if (hour >= 22 || hour <= 8) (night[date] ||= []).push(humidity);
  });

  return { all, night };
};

export const fetchLocalClimate = async (
  location: GrowLocation,
  stage: GrowStage
): Promise<LocalClimate> => {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,` +
    `wind_speed_10m_max,uv_index_max,sunrise,sunset,daylight_duration` +
    `&hourly=relative_humidity_2m&timezone=auto&forecast_days=16`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Weather lookup failed (${response.status})`);

  const data: OpenMeteoResponse = await response.json();
  const humidity = humidityByDate(data.hourly);
  const daily = data.daily;

  const forecast: DailyForecast[] = (daily.time as string[]).map((date, i) => ({
    date,
    tempMax: Number(daily.temperature_2m_max[i]),
    tempMin: Number(daily.temperature_2m_min[i]),
    precipitation: Number(daily.precipitation_sum[i] ?? 0),
    precipitationProbability: Number(daily.precipitation_probability_max[i] ?? 0),
    humidityMean: Math.round(mean(humidity.all[date] || [])),
    humidityNightMean: Math.round(mean(humidity.night[date] || humidity.all[date] || [])),
    windMax: Number(daily.wind_speed_10m_max[i] ?? 0),
    uvIndexMax: Number(daily.uv_index_max[i] ?? 0),
    daylightHours: Number(daily.daylight_duration[i] ?? 0) / 3600,
    sunrise: String(daily.sunrise[i] ?? '').split('T')[1] || '',
    sunset: String(daily.sunset[i] ?? '').split('T')[1] || '',
    weatherLabel: describeWeather(Number(daily.weather_code[i]))
  }));

  const today = forecast[0];
  const now = new Date();
  const currentTemp = Number(data.current.temperature_2m);
  const currentRh = Number(data.current.relative_humidity_2m);

  const derived: ClimateInsights = {
    vpd: leafVpd(currentTemp, currentRh),
    vpdVerdict: vpdVerdict(leafVpd(currentTemp, currentRh), stage),
    vpdTargetForStage: VPD_TARGETS[stage].label,
    dayLengthHours: today?.daylightHours ?? dayLengthHours(location.latitude, now),
    dayLengthTrend: isLengthening(location.latitude, now) ? 'lengthening' : 'shortening',
    crosses14h: nextDownwardCrossing(location.latitude, now, 14),
    crosses12h: nextDownwardCrossing(location.latitude, now, 12),
    // Cannabis takes damage below roughly 2°C; forecast minima are shelter-height,
    // so ground frost can occur a degree or two above the reported low.
    frostRiskDays: forecast.filter((d) => d.tempMin <= 2).map((d) => d.date),
    heatStressDays: forecast.filter((d) => d.tempMax >= 30).map((d) => d.date),
    moldRiskDays: forecast
      .filter((d) => d.humidityNightMean >= 70 && d.tempMin >= 5 && d.tempMax <= 28)
      .map((d) => d.date),
    hemisphere: hemisphereOf(location.latitude),
    season: seasonOf(location.latitude, now)
  };

  return {
    fetchedAt: Date.now(),
    timezone: data.timezone || location.timezone,
    current: {
      temperature: currentTemp,
      humidity: currentRh,
      apparentTemperature: Number(data.current.apparent_temperature),
      precipitation: Number(data.current.precipitation),
      windSpeed: Number(data.current.wind_speed_10m),
      isDay: Number(data.current.is_day) === 1,
      weatherLabel: describeWeather(Number(data.current.weather_code))
    },
    today,
    forecast,
    derived
  };
};

/** Compact daylight outlook used in prompts and the location card. */
export const daylightOutlook = (location: GrowLocation): string => {
  const now = new Date();
  const today = dayLengthHours(location.latitude, now);
  const inThirty = dayLengthHours(location.latitude, addDays(now, 30));
  const direction = inThirty > today ? 'gaining' : 'losing';
  const delta = Math.abs(inThirty - today) * 60;
  return `${formatHours(today)} today, ${direction} ~${Math.round(delta)} min over the next 30 days (${toISODate(addDays(now, 30))}: ${formatHours(inThirty)})`;
};
