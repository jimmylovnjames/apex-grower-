import { GrowLocation } from '../types';

/**
 * Location lookup via Open-Meteo geocoding (forward search) and BigDataCloud
 * (reverse). Both are keyless and CORS-enabled, so they work straight from the
 * browser without proxying the grower's coordinates through our own server.
 */

export interface LocationSuggestion {
  id: string;
  label: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  elevation?: number;
}

const localTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export const searchLocations = async (query: string): Promise<LocationSuggestion[]> => {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}` +
    `&count=6&language=en&format=json`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Location search failed (${response.status})`);

  const data = await response.json();
  const results: any[] = data?.results || [];

  return results.map((r) => ({
    id: String(r.id ?? `${r.latitude},${r.longitude}`),
    label: [r.name, r.admin1].filter(Boolean).join(', '),
    country: r.country || '',
    countryCode: r.country_code || '',
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone || localTimezone(),
    elevation: typeof r.elevation === 'number' ? r.elevation : undefined
  }));
};

/** Turn raw coordinates into a place name. Falls back to the coordinates themselves. */
export const reverseGeocode = async (latitude: number, longitude: number): Promise<Partial<GrowLocation>> => {
  const fallback = {
    label: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
    country: '',
    countryCode: ''
  };

  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
    );
    if (!response.ok) return fallback;

    const data = await response.json();
    const label = [data.city || data.locality, data.principalSubdivision].filter(Boolean).join(', ');

    return {
      label: label || fallback.label,
      country: data.countryName || '',
      countryCode: data.countryCode || ''
    };
  } catch {
    return fallback;
  }
};

export const suggestionToLocation = (s: LocationSuggestion): GrowLocation => ({
  latitude: s.latitude,
  longitude: s.longitude,
  label: s.label,
  country: s.country,
  countryCode: s.countryCode,
  timezone: s.timezone,
  elevation: s.elevation,
  source: 'search'
});

/** Browser GPS. Rejects with a message safe to show the user. */
export const detectLocation = (): Promise<GrowLocation> =>
  new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This browser does not support location detection.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const place = await reverseGeocode(latitude, longitude);
        resolve({
          latitude,
          longitude,
          label: place.label || `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
          country: place.country || '',
          countryCode: place.countryCode || '',
          timezone: localTimezone(),
          source: 'gps'
        });
      },
      (error) => {
        const messages: Record<number, string> = {
          1: 'Location permission denied. Search for your city instead.',
          2: 'Location unavailable right now. Search for your city instead.',
          3: 'Location request timed out. Search for your city instead.'
        };
        reject(new Error(messages[error.code] || 'Could not detect your location.'));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  });
