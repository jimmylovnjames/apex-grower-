import React, { useState } from 'react';
import { GrowStage, LocalClimate, UserSetup } from '../types';
import { formatHours } from '../services/solar';
import { VPD_TARGETS } from '../services/weather';
import { AlertTriangleIcon, DropletIcon, LoaderIcon, MapPinIcon, RefreshIcon, SunIcon, ThermometerIcon, WindIcon } from './Icons';
import LocationPicker from './LocationPicker';

interface LocationCardProps {
  setup: UserSetup;
  stage: GrowStage;
  climate: LocalClimate | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onLocationChange: (location: UserSetup['location']) => void;
}

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-2">
    <span className="text-zinc-500">{icon}</span>
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="text-sm text-zinc-200 truncate">{value}</div>
    </div>
  </div>
);

const RiskRow: React.FC<{ tone: 'red' | 'amber' | 'blue'; label: string; days: string[] }> = ({ tone, label, days }) => {
  if (days.length === 0) return null;
  const tones = {
    red: 'border-red-900/60 bg-red-950/40 text-red-300',
    amber: 'border-amber-900/60 bg-amber-950/40 text-amber-300',
    blue: 'border-sky-900/60 bg-sky-950/40 text-sky-300'
  };
  return (
    <div className={`flex items-start gap-2 text-xs border rounded-lg px-2.5 py-2 ${tones[tone]}`}>
      <AlertTriangleIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <span>
        <strong className="font-semibold">{label}</strong>{' '}
        {days.slice(0, 3).map((d) => d.slice(5)).join(', ')}
        {days.length > 3 && ` +${days.length - 3} more`}
      </span>
    </div>
  );
};

const LocationCard: React.FC<LocationCardProps> = ({ setup, stage, climate, loading, error, onRefresh, onLocationChange }) => {
  const [editing, setEditing] = useState(false);
  const derived = climate?.derived;

  const vpdTone = () => {
    if (!derived || stage === GrowStage.CURING) return 'text-zinc-200';
    const target = VPD_TARGETS[stage];
    if (derived.vpd < target.min || derived.vpd > target.max) return 'text-amber-400';
    return 'text-emerald-400';
  };

  return (
    <div className="glass-panel rounded-xl p-5 border border-zinc-800 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Local Conditions</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            disabled={loading || !setup.location}
            title="Refresh forecast"
            className="p-1.5 rounded-lg text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800 transition-colors disabled:opacity-40"
          >
            {loading ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <RefreshIcon className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setEditing((open) => !open)}
            title="Change location"
            className={`p-1.5 rounded-lg transition-colors hover:bg-zinc-800 ${editing ? 'text-emerald-400' : 'text-zinc-500 hover:text-emerald-400'}`}
          >
            <MapPinIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {editing && (
        <div className="pb-2 border-b border-zinc-800">
          <LocationPicker
            value={setup.location}
            compact
            onChange={(location) => {
              onLocationChange(location);
              setEditing(false);
            }}
          />
        </div>
      )}

      {!setup.location ? (
        <div className="text-center py-4">
          <MapPinIcon className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-500 mb-3">No location set — advice will stay generic.</p>
          <button onClick={() => setEditing(true)} className="text-xs font-mono text-emerald-400 hover:text-emerald-300">
            SET LOCATION →
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-zinc-300 truncate">{setup.location.label}</span>
            {derived && <span className="text-xs text-zinc-500 flex-shrink-0">· {derived.season}</span>}
          </div>

          {error && <p className="text-xs text-amber-400">{error}</p>}

          {loading && !climate && (
            <div className="flex items-center gap-2 text-sm text-zinc-500 py-3">
              <LoaderIcon className="w-4 h-4 animate-spin text-emerald-500" />
              Reading local conditions…
            </div>
          )}

          {climate && derived && (
            <>
              <div className="flex items-end gap-3">
                <span className="text-4xl font-mono font-bold text-white leading-none">
                  {Math.round(climate.current.temperature)}°
                </span>
                <div className="pb-1 min-w-0">
                  <div className="text-sm text-zinc-300 truncate">{climate.current.weatherLabel}</div>
                  <div className="text-xs text-zinc-500">
                    {Math.round(climate.today.tempMin)}° / {Math.round(climate.today.tempMax)}° today
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <Stat icon={<DropletIcon className="w-4 h-4" />} label="Humidity" value={`${climate.current.humidity}%`} />
                <Stat icon={<WindIcon className="w-4 h-4" />} label="Wind" value={`${Math.round(climate.current.windSpeed)} km/h`} />
                <Stat icon={<SunIcon className="w-4 h-4" />} label="Daylight" value={`${formatHours(derived.dayLengthHours)}`} />
                <Stat icon={<ThermometerIcon className="w-4 h-4" />} label="UV max" value={climate.today.uvIndexMax.toFixed(1)} />
              </div>

              <div className="border-t border-zinc-800 pt-3 space-y-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-zinc-500">Outdoor leaf VPD</span>
                  <span className={`text-sm font-mono font-bold ${vpdTone()}`}>{derived.vpd} kPa</span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-snug">{derived.vpdVerdict}</p>
              </div>

              <div className="border-t border-zinc-800 pt-3 space-y-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-zinc-500">Photoperiod</span>
                  <span className="text-xs text-zinc-300">{derived.dayLengthTrend}</span>
                </div>
                {derived.crosses14h && (
                  <p className="text-[11px] text-zinc-500 leading-snug">
                    Drops under 14h on <span className="text-zinc-300 font-mono">{derived.crosses14h}</span> — outdoor
                    photoperiods start flowering.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <RiskRow tone="blue" label="Frost risk:" days={derived.frostRiskDays} />
                <RiskRow tone="red" label="Heat stress:" days={derived.heatStressDays} />
                <RiskRow tone="amber" label="High overnight RH:" days={derived.moldRiskDays} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default LocationCard;
