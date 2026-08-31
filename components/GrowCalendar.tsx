import React from 'react';
import { GrowEvent, GrowSchedule, UserSetup } from '../types';
import { daysBetween, fromISODate, toISODate } from '../services/solar';
import { downloadICS, googleCalendarUrl } from '../services/calendar';
import { AlertTriangleIcon, CalendarIcon, CheckCircleIcon, DownloadIcon, LeafIcon } from './Icons';

interface GrowCalendarProps {
  schedule: GrowSchedule;
  setup: UserSetup;
  onStartDateChange: (isoDate: string) => void;
  onVegDaysChange: (days: number) => void;
}

const KIND_STYLES: Record<GrowEvent['kind'], { dot: string; badge: string; label: string }> = {
  stage: { dot: 'bg-emerald-500', badge: 'border-emerald-900 bg-emerald-900/20 text-emerald-400', label: 'Stage' },
  milestone: { dot: 'bg-sky-500', badge: 'border-sky-900 bg-sky-900/20 text-sky-400', label: 'Milestone' },
  task: { dot: 'bg-zinc-500', badge: 'border-zinc-700 bg-zinc-800 text-zinc-400', label: 'Task' },
  risk: { dot: 'bg-red-500', badge: 'border-red-900 bg-red-900/20 text-red-400', label: 'Risk' }
};

const formatDay = (iso: string): string =>
  fromISODate(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

const relativeLabel = (iso: string, today: string): string => {
  const delta = daysBetween(today, iso);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  return delta > 0 ? `in ${delta} days` : `${Math.abs(delta)} days ago`;
};

const Metric: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="glass-panel rounded-xl border border-zinc-800 p-4">
    <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{label}</div>
    <div className="text-lg font-mono font-bold text-white">{value}</div>
    {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
  </div>
);

const GrowCalendar: React.FC<GrowCalendarProps> = ({ schedule, setup, onStartDateChange, onVegDaysChange }) => {
  const today = toISODate(new Date());
  const isAuto = setup.strainType === 'Autoflower';
  const isOutdoor = setup.environment === 'Outdoor' || setup.environment === 'Greenhouse';
  const daysToHarvest = daysBetween(today, schedule.harvestDate);
  // Outdoors the sun sets the flip, so the veg counter changes nothing.
  const vegDaysIgnored = isAuto || (isOutdoor && !isAuto);

  const past = schedule.events.filter((e) => e.date < today);
  const upcoming = schedule.events.filter((e) => e.date >= today);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Grow Calendar</h1>
        <button
          onClick={() => downloadICS(schedule, setup)}
          className="flex items-center gap-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <DownloadIcon className="w-4 h-4" />
          Add to my calendar (.ics)
        </button>
      </div>

      <p className="text-sm text-zinc-500 leading-relaxed">
        Downloads every milestone, task and weather risk below as a calendar file — import it into Google
        Calendar, Apple Calendar or Outlook. Re-download after your dates change to refresh it.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Day of grow" value={`${schedule.dayOfGrow}`} sub={`since ${schedule.startDate}`} />
        <Metric label={isAuto ? 'Pre-flower' : 'Flip to flower'} value={schedule.flipDate.slice(5)} sub={isOutdoor && !isAuto ? 'set by daylight' : `${schedule.vegDays} days veg`} />
        <Metric label="Harvest" value={schedule.harvestDate.slice(5)} sub={daysToHarvest >= 0 ? `in ${daysToHarvest} days` : `${Math.abs(daysToHarvest)} days ago`} />
        <Metric label="Jars ready" value={schedule.jarDate.slice(5)} sub={`${schedule.floweringDays}-day flower`} />
      </div>

      <div className="glass-panel rounded-xl border border-zinc-800 p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-2">Germination date</label>
          <input
            type="date"
            value={schedule.startDate}
            max={today}
            onChange={(e) => e.target.value && onStartDateChange(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-2">
            Days in veg before flip
            {isAuto && <span className="text-zinc-600"> — autoflowers set their own clock</span>}
            {isOutdoor && !isAuto && <span className="text-zinc-600"> — set by daylight outdoors</span>}
          </label>
          <input
            type="number"
            min={0}
            max={180}
            value={schedule.vegDays}
            disabled={vegDaysIgnored}
            onChange={(e) => onVegDaysChange(Number(e.target.value))}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-40"
          />
        </div>
        {isOutdoor && !isAuto && (
          <p className="sm:col-span-2 text-xs text-sky-300/90 bg-sky-950/30 border border-sky-900/50 rounded-lg px-3 py-2">
            Growing outdoors, your flip date comes from the sun, not the veg counter — it is set to the day
            daylight drops below 14 hours at your latitude.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Timeline</h2>

        {past.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300 py-2 select-none">
              {past.length} past {past.length === 1 ? 'entry' : 'entries'} — show
            </summary>
            <div className="space-y-2 pt-2 opacity-50">
              {past.map((item) => (
                <div key={item.id} className="flex gap-3 items-start pl-1">
                  <CheckCircleIcon className="w-4 h-4 text-zinc-600 mt-1 flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="text-sm text-zinc-400">{item.title}</span>
                    <span className="text-xs text-zinc-600 ml-2 font-mono">{formatDay(item.date)}</span>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        <div className="relative space-y-3 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-zinc-800">
          {upcoming.map((item) => {
            const style = KIND_STYLES[item.kind];
            return (
              <div key={item.id} className="relative pl-8">
                <span className={`absolute left-0 top-4 w-[15px] h-[15px] rounded-full border-4 border-zinc-950 ${style.dot}`} />
                <div
                  className={`glass-panel rounded-xl border p-4 ${
                    item.kind === 'risk' ? 'border-red-900/50' : 'border-zinc-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-1.5 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${style.badge}`}>
                        {style.label.toUpperCase()}
                      </span>
                      <h3 className="font-medium text-zinc-100">{item.title}</h3>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-mono text-zinc-400">{formatDay(item.date)}</div>
                      <div className="text-[10px] text-zinc-600">{relativeLabel(item.date, today)}</div>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed">{item.description}</p>
                  <a
                    href={googleCalendarUrl(item, setup)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] font-mono text-zinc-500 hover:text-emerald-400 transition-colors mt-3"
                  >
                    <CalendarIcon className="w-3 h-3" />
                    ADD TO GOOGLE CALENDAR
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {upcoming.length === 0 && (
          <div className="text-center py-10 border border-dashed border-zinc-800 rounded-xl">
            <LeafIcon className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
            <p className="text-zinc-500">Nothing ahead — this grow is done. Set a new germination date to start the next one.</p>
          </div>
        )}
      </div>

      <p className="flex gap-2 text-xs text-zinc-600 leading-relaxed border-t border-zinc-800 pt-4">
        <AlertTriangleIcon className="w-4 h-4 flex-shrink-0 mt-px" />
        <span>Projected dates, not promises. Harvest on trichomes, not on the calendar — and weather risks only
        cover the 16-day forecast window.</span>
      </p>
    </div>
  );
};

export default GrowCalendar;
