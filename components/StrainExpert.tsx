import React, { useState } from 'react';
import { StrainProfile } from '../types';
import { DnaIcon, LoaderIcon, SearchIcon, SparkIcon } from './Icons';

interface StrainExpertProps {
  strainName: string;
  profile: StrainProfile | null;
  loading: boolean;
  error: string | null;
  hasLocation: boolean;
  onAnalyze: (strainName: string) => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-2">
    <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">{title}</h4>
    {children}
  </div>
);

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex gap-3 text-sm py-1.5 border-b border-zinc-800/70 last:border-0">
    <span className="text-zinc-500 w-32 flex-shrink-0">{label}</span>
    <span className="text-zinc-200">{value}</span>
  </div>
);

const Chips: React.FC<{ items: string[]; tone?: string }> = ({ items, tone = 'bg-zinc-800 text-zinc-300 border-zinc-700' }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map((item) => (
      <span key={item} className={`text-xs px-2 py-1 rounded-md border ${tone}`}>{item}</span>
    ))}
  </div>
);

const fitTone = (score: number) => {
  if (score >= 7) return { ring: 'border-emerald-500/30 bg-emerald-500/10', text: 'text-emerald-400' };
  if (score >= 4) return { ring: 'border-amber-500/30 bg-amber-500/10', text: 'text-amber-400' };
  return { ring: 'border-red-500/30 bg-red-500/10', text: 'text-red-400' };
};

const StrainExpert: React.FC<StrainExpertProps> = ({ strainName, profile, loading, error, hasLocation, onAnalyze }) => {
  const [draft, setDraft] = useState(strainName);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (draft.trim()) onAnalyze(draft.trim());
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Strain name, e.g. Blue Dream, Gorilla Glue #4"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-3 py-3 text-sm text-white placeholder-zinc-600 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !draft.trim()}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-medium px-5 rounded-lg transition-colors flex items-center gap-2"
        >
          {loading ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <SparkIcon className="w-4 h-4" />}
          <span className="hidden sm:inline">Analyze</span>
        </button>
      </form>

      {!hasLocation && (
        <p className="text-xs text-amber-400/90 bg-amber-950/30 border border-amber-900/50 rounded-lg px-3 py-2">
          Set your location to get the climate-fit verdict — without it the profile is generic.
        </p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading && !profile && (
        <div className="text-center py-16">
          <LoaderIcon className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-4" />
          <p className="text-zinc-500 animate-pulse">Pulling genetics, flowering data and climate fit…</p>
        </div>
      )}

      {!loading && !profile && !error && (
        <div className="text-center py-16 border border-dashed border-zinc-800 rounded-xl">
          <DnaIcon className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500">Name your cultivar to get a full profile scored against your climate.</p>
        </div>
      )}

      {profile && (
        <div className="space-y-6">
          <div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <h2 className="text-2xl font-bold text-white">{profile.name}</h2>
              {profile.breeder && <span className="text-sm text-zinc-500">{profile.breeder}</span>}
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  profile.confidence === 'High'
                    ? 'border-emerald-900 bg-emerald-900/20 text-emerald-400'
                    : profile.confidence === 'Medium'
                    ? 'border-amber-900 bg-amber-900/20 text-amber-400'
                    : 'border-red-900 bg-red-900/20 text-red-400'
                }`}
              >
                {profile.confidence.toUpperCase()} CONFIDENCE
              </span>
            </div>
            <p className="text-zinc-400 text-sm mt-1">{profile.type} · {profile.lineage}</p>
          </div>

          {/* Location fit — the reason this panel exists. */}
          <div className={`rounded-xl border p-5 ${fitTone(profile.locationFit.score).ring}`}>
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Fit at your location</h3>
                <p className={`text-lg font-bold ${fitTone(profile.locationFit.score).text}`}>{profile.locationFit.verdict}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <span className={`text-3xl font-mono font-bold ${fitTone(profile.locationFit.score).text}`}>
                  {profile.locationFit.score}
                </span>
                <span className="text-zinc-600 text-sm">/10</span>
              </div>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed mb-4">{profile.locationFit.reasoning}</p>

            {profile.locationFit.adjustments.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Adjustments for your site</h4>
                {profile.locationFit.adjustments.map((item, i) => (
                  <div key={i} className="flex gap-2.5 text-sm text-zinc-300">
                    <span className="text-zinc-600 font-mono flex-shrink-0">{i + 1}.</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/5">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Plant out</div>
                <div className="text-sm text-zinc-300">{profile.locationFit.outdoorPlantOutWindow}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Outdoor harvest</div>
                <div className="text-sm text-zinc-300">{profile.locationFit.outdoorHarvestWindow}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Section title="Vitals">
              <div className="glass-panel rounded-xl border border-zinc-800 px-4 py-2">
                <Field label="Seed type" value={profile.photoperiodOrAuto} />
                <Field label="Flowering" value={`${profile.floweringDays.min}–${profile.floweringDays.max} days`} />
                {profile.seedToHarvestDays && (
                  <Field label="Seed to harvest" value={`${profile.seedToHarvestDays.min}–${profile.seedToHarvestDays.max} days`} />
                )}
                <Field label="THC / CBD" value={`${profile.thcRange} / ${profile.cbdRange || 'low'}`} />
                <Field label="Stretch" value={profile.stretchFactor} />
                <Field label="Height" value={profile.heightNote} />
                <Field label="Yield indoor" value={profile.yieldIndoor} />
                <Field label="Yield outdoor" value={profile.yieldOutdoor} />
                <Field label="Difficulty" value={profile.difficulty} />
              </div>
            </Section>

            <Section title="Feeding">
              <div className="glass-panel rounded-xl border border-zinc-800 px-4 py-2">
                <Field label="EC" value={profile.feeding.ecRange} />
                <Field label="pH" value={profile.feeding.phRange} />
                <Field label="Nitrogen" value={profile.feeding.nitrogenAppetite} />
                <Field label="CalMag" value={profile.feeding.calMag} />
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed">{profile.feeding.notes}</p>
            </Section>

            <Section title="Climate preferences">
              <div className="glass-panel rounded-xl border border-zinc-800 px-4 py-2">
                <Field label="Ideal temp" value={profile.climate.idealTempC} />
                <Field label="RH veg" value={profile.climate.idealRhVeg} />
                <Field label="RH flower" value={profile.climate.idealRhFlower} />
                <Field label="Mould resistance" value={profile.climate.moldResistance} />
                <Field label="Cold tolerance" value={profile.climate.coldTolerance} />
                <Field label="Heat tolerance" value={profile.climate.heatTolerance} />
              </div>
            </Section>

            <Section title="Profile">
              <Chips items={profile.terpenes} tone="bg-emerald-950/40 text-emerald-300 border-emerald-900/60" />
              <p className="text-sm text-zinc-400 leading-relaxed">{profile.aromaFlavor}</p>
              {profile.effects?.length > 0 && <Chips items={profile.effects} />}
            </Section>
          </div>

          <Section title="Training">
            <div className="space-y-2">
              {profile.trainingTips.map((tip, i) => (
                <div key={i} className="flex gap-3 bg-zinc-900 border border-zinc-800 p-3 rounded-lg text-sm text-zinc-300">
                  <span className="text-emerald-500 flex-shrink-0">→</span>
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Watch out for">
            <Chips items={profile.commonIssues} tone="bg-red-950/30 text-red-300 border-red-900/50" />
          </Section>

          <Section title="Harvest window">
            <p className="text-sm text-zinc-300 leading-relaxed">{profile.harvestWindow}</p>
          </Section>

          <p className="text-xs text-zinc-600 leading-relaxed border-t border-zinc-800 pt-4">
            {profile.sourceNote} Strain data varies by breeder, pheno and lab — treat these as starting ranges and
            trust what the plant in front of you is doing.
          </p>
        </div>
      )}
    </div>
  );
};

export default StrainExpert;
