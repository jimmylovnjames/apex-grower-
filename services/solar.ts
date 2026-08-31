/**
 * Local daylight maths.
 *
 * The weather API only reaches ~16 days out, but outdoor photoperiod decisions
 * (when a photoperiod plant will flip on its own, when to plant out, how much
 * light a greenhouse gets in November) need the whole season. These are
 * standard NOAA solar-position approximations, accurate to a minute or two —
 * far inside the tolerance that matters for grow planning.
 */

const DEG = Math.PI / 180;

/** Day of year, 1-366. */
export const dayOfYear = (date: Date): number => {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000);
};

/** Solar declination in radians (Spencer's Fourier series). */
const declination = (n: number): number => {
  const g = (2 * Math.PI * (n - 1)) / 365;
  return (
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g)
  );
};

/**
 * Hours between sunrise and sunset for a latitude on a date.
 * Returns 0 during polar night and 24 during midnight sun.
 */
export const dayLengthHours = (latitude: number, date: Date): number => {
  const decl = declination(dayOfYear(date));
  const lat = latitude * DEG;
  // -0.833 deg accounts for refraction plus the sun's apparent radius.
  const cosH = (Math.sin(-0.833 * DEG) - Math.sin(lat) * Math.sin(decl)) / (Math.cos(lat) * Math.cos(decl));
  if (cosH <= -1) return 24;
  if (cosH >= 1) return 0;
  return (2 * Math.acos(cosH) * 180) / Math.PI / 15;
};

export const addDays = (date: Date, days: number): Date => {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
};

/** ISO yyyy-mm-dd in local time (not UTC — avoids off-by-one across timezones). */
export const toISODate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const fromISODate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
};

export const daysBetween = (fromISO: string, toISOStr: string): number =>
  Math.round((fromISODate(toISOStr).getTime() - fromISODate(fromISO).getTime()) / 86400000);

export const isLengthening = (latitude: number, date: Date): boolean =>
  dayLengthHours(latitude, addDays(date, 7)) > dayLengthHours(latitude, date);

/**
 * Next date within a year where day length crosses `hours` going downward.
 * This is when an outdoor photoperiod plant starts (14h) and firmly commits
 * to (12h) flowering. Null when the latitude never crosses that threshold.
 */
export const nextDownwardCrossing = (latitude: number, from: Date, hours: number): string | null => {
  let previous = dayLengthHours(latitude, from);
  for (let i = 1; i <= 400; i++) {
    const date = addDays(from, i);
    const current = dayLengthHours(latitude, date);
    if (previous >= hours && current < hours) return toISODate(date);
    previous = current;
  }
  return null;
};

export const hemisphereOf = (latitude: number): 'Northern' | 'Southern' =>
  latitude >= 0 ? 'Northern' : 'Southern';

/**
 * Meteorological season at the grower's latitude. Tropical latitudes get
 * wet/dry framing instead, because "winter" is meaningless at 5 degrees.
 */
export const seasonOf = (latitude: number, date: Date): string => {
  if (Math.abs(latitude) < 15) return 'Tropical (no true seasons — track wet vs dry instead)';
  const month = date.getMonth();
  const northern = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter'];
  const index = hemisphereOf(latitude) === 'Northern' ? month : (month + 6) % 12;
  return northern[index];
};

export const formatHours = (hours: number): string => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
};
