import { GrowEvent, GrowSchedule, GrowStage, LocalClimate, StrainProfile, Task, UserSetup } from '../types';
import { addDays, daysBetween, fromISODate, toISODate } from './solar';

const DEFAULT_FLOWERING_DAYS = 63;
const SEEDLING_DAYS = 14;
const DRY_DAYS = 12;
const CURE_DAYS = 21;

const event = (
  id: string,
  date: string,
  title: string,
  description: string,
  kind: GrowEvent['kind'],
  stage?: GrowStage
): GrowEvent => ({ id, date, title, description, kind, stage });

/** Midpoint of the strain's flowering range, or the generic default. */
export const floweringDaysFor = (strain: StrainProfile | null): number => {
  if (!strain?.floweringDays) return DEFAULT_FLOWERING_DAYS;
  const { min, max } = strain.floweringDays;
  if (!min || !max) return DEFAULT_FLOWERING_DAYS;
  return Math.round((min + max) / 2);
};

/**
 * Build the full grow timeline.
 *
 * Photoperiod grows flip on a date the grower controls indoors, but outdoors
 * the flip is dictated by latitude — so when we know where they are, the
 * natural photoperiod crossing becomes a real calendar entry.
 */
export const buildSchedule = (
  setup: UserSetup,
  strain: StrainProfile | null,
  climate: LocalClimate | null,
  tasks: Task[]
): GrowSchedule => {
  const startDate = setup.startDate || toISODate(new Date());
  const start = fromISODate(startDate);
  const isAuto = setup.strainType === 'Autoflower';
  const isOutdoor = setup.environment === 'Outdoor' || setup.environment === 'Greenhouse';

  const floweringDays = floweringDaysFor(strain);
  const vegDays = Math.max(0, setup.vegDays || 28);

  // Autoflowers ignore the light schedule and start flowering on their own clock.
  const autoFlipDay = SEEDLING_DAYS + 14;
  const naturalFlip = isOutdoor && !isAuto ? climate?.derived.crosses14h ?? null : null;

  const flipDate = isAuto
    ? toISODate(addDays(start, autoFlipDay))
    : naturalFlip || toISODate(addDays(start, SEEDLING_DAYS + vegDays));

  const harvestDate = toISODate(addDays(fromISODate(flipDate), floweringDays));
  const dryDoneDate = toISODate(addDays(fromISODate(harvestDate), DRY_DAYS));
  const jarDate = toISODate(addDays(fromISODate(dryDoneDate), CURE_DAYS));

  const events: GrowEvent[] = [
    event('start', startDate, 'Day 1 — Germination', 'Grow clock starts. Log the date on the pot label.', 'stage', GrowStage.SEEDLING),
    event(
      'veg',
      toISODate(addDays(start, SEEDLING_DAYS)),
      'Seedling → Vegetative',
      'Roots should reach the pot edge. Step feeding up and begin training.',
      'stage',
      GrowStage.VEGETATIVE
    )
  ];

  if (isAuto) {
    events.push(
      event('preflower', toISODate(addDays(start, autoFlipDay)), 'Autoflower pre-flower', 'Pistils appear on their own schedule — stop high-stress training now.', 'stage', GrowStage.FLOWERING)
    );
  } else if (naturalFlip) {
    events.push(
      event(
        'flip',
        naturalFlip,
        'Natural photoperiod flip (~14h daylight)',
        `Daylight drops under 14 hours at ${setup.location?.label ?? "your latitude"} — outdoor photoperiods begin flowering without any intervention.`,
        'milestone',
        GrowStage.FLOWERING
      )
    );
    if (climate?.derived.crosses12h) {
      events.push(
        event('flip12', climate.derived.crosses12h, 'Daylight under 12 hours', 'Flowering is fully committed from here — light stress and re-veg risk drop away.', 'milestone', GrowStage.FLOWERING)
      );
    }
  } else {
    events.push(
      event('flip', flipDate, 'Flip to 12/12', `After ${vegDays} days of veg. Last chance for heavy defoliation or topping.`, 'milestone', GrowStage.FLOWERING)
    );
  }

  const flip = fromISODate(flipDate);
  events.push(
    event('stretch', toISODate(addDays(flip, 21)), 'Stretch ends — lock in structure', 'Stretch is done by roughly day 21 of flower. Set trellis height and do the final selective defoliation.', 'milestone', GrowStage.FLOWERING),
    event('bulk', toISODate(addDays(flip, Math.round(floweringDays * 0.55))), 'Peak bulking', 'Highest phosphorus and potassium demand. Watch for calcium and magnesium fade.', 'milestone', GrowStage.FLOWERING),
    event('trichome', toISODate(addDays(flip, floweringDays - 14)), 'Start trichome checks', 'Loupe the buds every two days. Harvest on trichomes, not on the calendar.', 'milestone', GrowStage.FLOWERING),
    event('flush', toISODate(addDays(flip, floweringDays - 10)), 'Begin flush / taper feed', 'Taper nutrients so the plant finishes on stored reserves.', 'milestone', GrowStage.FLOWERING),
    event('harvest', harvestDate, 'Projected harvest', `Day ${daysBetween(startDate, harvestDate) + 1} of the grow, based on a ${floweringDays}-day flower.`, 'milestone', GrowStage.FLOWERING),
    event('dry', dryDoneDate, 'Dry complete → jar up', `${DRY_DAYS} days at 18°C / 60% RH. Stems should snap, not bend.`, 'stage', GrowStage.CURING),
    event('cure', jarDate, 'Cure ready', `${CURE_DAYS} days of burping. Flavour peaks well past this point.`, 'milestone', GrowStage.CURING)
  );

  // Local weather risks land on the calendar as dated warnings.
  if (climate) {
    const isFlowering = (date: string) => date >= flipDate && date <= harvestDate;

    climate.derived.frostRiskDays.forEach((date) =>
      events.push(event(`frost-${date}`, date, 'Frost risk', `Overnight low near ${climate.forecast.find((f) => f.date === date)?.tempMin ?? '≤2'}°C. Cover, move pots in, or run heat.`, 'risk'))
    );
    climate.derived.heatStressDays.forEach((date) =>
      events.push(event(`heat-${date}`, date, 'Heat stress risk', `Daytime high near ${climate.forecast.find((f) => f.date === date)?.tempMax ?? '≥30'}°C. Water early, add shade cloth, raise the lights.`, 'risk'))
    );
    climate.derived.moldRiskDays
      .filter(isFlowering)
      .forEach((date) =>
        events.push(event(`mold-${date}`, date, 'Bud rot risk', 'Overnight humidity above 70% while buds are on. Add airflow overnight and inspect dense colas.', 'risk'))
      );
  }

  tasks
    .filter((task) => task.dueDate && !task.completed)
    .forEach((task) =>
      events.push({
        id: `task-${task.id}`,
        date: task.dueDate!,
        title: task.title,
        description: task.description,
        kind: 'task',
        stage: task.stage,
        taskId: task.id
      })
    );

  events.sort((a, b) => a.date.localeCompare(b.date));

  return {
    startDate,
    vegDays,
    floweringDays,
    dryDays: DRY_DAYS,
    cureDays: CURE_DAYS,
    flipDate,
    harvestDate,
    jarDate,
    dayOfGrow: daysBetween(startDate, toISODate(new Date())) + 1,
    events
  };
};

/** Which stage the calendar says they should be in today. */
export const expectedStage = (schedule: GrowSchedule): GrowStage => {
  const today = toISODate(new Date());
  if (today >= schedule.harvestDate) return GrowStage.CURING;
  if (today >= schedule.flipDate) return GrowStage.FLOWERING;
  if (daysBetween(schedule.startDate, today) >= SEEDLING_DAYS) return GrowStage.VEGETATIVE;
  return GrowStage.SEEDLING;
};

export const upcomingEvents = (schedule: GrowSchedule, days = 14): GrowEvent[] => {
  const today = toISODate(new Date());
  const horizon = toISODate(addDays(new Date(), days));
  return schedule.events.filter((e) => e.date >= today && e.date <= horizon);
};

// --- Calendar export -------------------------------------------------------

const escapeICS = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const compactDate = (iso: string): string => iso.replace(/-/g, '');

/** Fold lines at 75 octets as RFC 5545 requires, or Outlook silently truncates. */
const fold = (line: string): string => {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest) parts.push(' ' + rest);
  return parts.join('\r\n');
};

/** RFC 5545 VCALENDAR of all-day events — imports into Google, Apple and Outlook. */
export const buildICS = (schedule: GrowSchedule, setup: UserSetup): string => {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const strain = setup.strainName?.trim() || 'Grow';

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ApexGrow//Grow Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICS(`ApexGrow — ${strain}`)}`,
    'X-WR-TIMEZONE:UTC'
  ];

  schedule.events.forEach((item) => {
    const location = setup.location?.label ? `LOCATION:${escapeICS(setup.location.label)}` : null;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${item.id}-${compactDate(schedule.startDate)}@apexgrow`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(item.date)}`,
      `DTEND;VALUE=DATE:${compactDate(toISODate(addDays(fromISODate(item.date), 1)))}`,
      fold(`SUMMARY:${escapeICS(`${strain}: ${item.title}`)}`),
      fold(`DESCRIPTION:${escapeICS(item.description)}`),
      ...(location ? [fold(location)] : []),
      `CATEGORIES:${item.kind.toUpperCase()}`,
      item.kind === 'risk' ? 'PRIORITY:1' : 'PRIORITY:5',
      'END:VEVENT'
    );
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
};

export const downloadICS = (schedule: GrowSchedule, setup: UserSetup): void => {
  const blob = new Blob([buildICS(schedule, setup)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const slug = (setup.strainName || 'grow').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  link.href = url;
  link.download = `apexgrow-${slug || 'grow'}-${schedule.startDate}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** One-click "add to Google Calendar" for a single event. */
export const googleCalendarUrl = (item: GrowEvent, setup: UserSetup): string => {
  const strain = setup.strainName?.trim() || 'Grow';
  const end = toISODate(addDays(fromISODate(item.date), 1));
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${strain}: ${item.title}`,
    details: item.description,
    dates: `${compactDate(item.date)}/${compactDate(end)}`
  });
  if (setup.location?.label) params.set('location', setup.location.label);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};
