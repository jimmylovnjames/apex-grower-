import React, { useState } from 'react';
import { GrowLocation, UserSetup } from '../types';
import { toISODate } from '../services/solar';
import { LeafIcon, MapPinIcon } from './Icons';
import LocationPicker from './LocationPicker';

interface SetupFormProps {
  onComplete: (setup: UserSetup) => void;
}

const Select: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}> = ({ label, value, onChange, children }) => (
  <div>
    <label className="block text-sm font-medium text-zinc-300 mb-2">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
    >
      {children}
    </select>
  </div>
);

const SetupForm: React.FC<SetupFormProps> = ({ onComplete }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState<UserSetup>({
    method: 'Soil',
    environment: 'Indoor Tent',
    strainType: 'Photoperiod',
    experienceLevel: 'Novice',
    strainName: '',
    location: null,
    startDate: toISODate(new Date()),
    vegDays: 28
  });

  const handleChange = <K extends keyof UserSetup>(field: K, value: UserSetup[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      setStep(2);
      return;
    }
    onComplete(formData);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-zinc-950">
      <div className="max-w-md w-full glass-panel p-8 rounded-2xl shadow-2xl border border-emerald-500/20">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
            {step === 1 ? <LeafIcon className="w-8 h-8 text-emerald-400" /> : <MapPinIcon className="w-8 h-8 text-emerald-400" />}
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">ApexGrow</h1>
          <p className="text-zinc-400 mt-2 text-center">
            {step === 1
              ? 'Configure your grow parameters to initialize the AI aide.'
              : 'Where is this grow? Location drives the forecast, daylight and season behind every recommendation.'}
          </p>
        </div>

        <div className="flex gap-2 mb-6">
          {[1, 2].map((n) => (
            <div key={n} className={`h-1 flex-1 rounded-full transition-colors ${step >= n ? 'bg-emerald-500' : 'bg-zinc-800'}`} />
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {step === 1 ? (
            <>
              <Select label="Medium" value={formData.method} onChange={(v) => handleChange('method', v)}>
                <option value="Soil">Living Soil / Potting Mix</option>
                <option value="Coco">Coco Coir</option>
                <option value="DWC">Deep Water Culture (Hydro)</option>
                <option value="Aeroponics">Aeroponics</option>
              </Select>

              <Select label="Environment" value={formData.environment} onChange={(v) => handleChange('environment', v)}>
                <option value="Indoor Tent">Indoor Grow Tent</option>
                <option value="Indoor Room">Dedicated Room</option>
                <option value="Outdoor">Outdoor</option>
                <option value="Greenhouse">Greenhouse</option>
              </Select>

              <Select label="Strain Type" value={formData.strainType} onChange={(v) => handleChange('strainType', v)}>
                <option value="Photoperiod">Photoperiod</option>
                <option value="Autoflower">Autoflower</option>
              </Select>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Strain name <span className="text-zinc-500 font-normal">— optional, unlocks the strain expert</span>
                </label>
                <input
                  type="text"
                  value={formData.strainName}
                  onChange={(e) => handleChange('strainName', e.target.value)}
                  placeholder="e.g. Blue Dream, Gorilla Glue #4"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-600 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Germination date <span className="text-zinc-500 font-normal">— or when you plan to plant</span>
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => e.target.value && handleChange('startDate', e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all [color-scheme:dark]"
                />
              </div>

              <Select label="Experience" value={formData.experienceLevel} onChange={(v) => handleChange('experienceLevel', v)}>
                <option value="Novice">Novice (First Grow)</option>
                <option value="Intermediate">Intermediate (Some Harvests)</option>
                <option value="Expert">Expert (Optimization)</option>
              </Select>
            </>
          ) : (
            <LocationPicker
              value={formData.location}
              onChange={(location: GrowLocation) => handleChange('location', location)}
            />
          )}

          <div className="flex gap-3 pt-2">
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-5 py-4 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors font-medium"
              >
                Back
              </button>
            )}
            <button
              type="submit"
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-lg transition-all duration-200 shadow-lg shadow-emerald-900/50"
            >
              {step === 1 ? 'Next — set location' : formData.location ? 'Initialize Grow Aide' : 'Skip for now'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SetupForm;
