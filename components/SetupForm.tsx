import React, { useState } from 'react';
import { UserSetup } from '../types';
import { LeafIcon } from './Icons';

interface SetupFormProps {
  onComplete: (setup: UserSetup) => void;
}

const SetupForm: React.FC<SetupFormProps> = ({ onComplete }) => {
  const [formData, setFormData] = useState<UserSetup>({
    method: 'Soil',
    environment: 'Indoor Tent',
    strainType: 'Photoperiod',
    experienceLevel: 'Novice'
  });

  const handleChange = (field: keyof UserSetup, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete(formData);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-zinc-950">
      <div className="max-w-md w-full glass-panel p-8 rounded-2xl shadow-2xl border border-emerald-500/20">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
            <LeafIcon className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">ApexGrow</h1>
          <p className="text-zinc-400 mt-2 text-center">Configure your grow parameters to initialize the AI aide.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Medium</label>
            <select 
              value={formData.method} 
              onChange={(e) => handleChange('method', e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
            >
              <option value="Soil">Living Soil / Potting Mix</option>
              <option value="Coco">Coco Coir</option>
              <option value="DWC">Deep Water Culture (Hydro)</option>
              <option value="Aeroponics">Aeroponics</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Environment</label>
            <select 
              value={formData.environment} 
              onChange={(e) => handleChange('environment', e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
            >
              <option value="Indoor Tent">Indoor Grow Tent</option>
              <option value="Indoor Room">Dedicated Room</option>
              <option value="Outdoor">Outdoor</option>
              <option value="Greenhouse">Greenhouse</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Strain Type</label>
            <select 
              value={formData.strainType} 
              onChange={(e) => handleChange('strainType', e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
            >
              <option value="Photoperiod">Photoperiod</option>
              <option value="Autoflower">Autoflower</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Experience</label>
            <select 
              value={formData.experienceLevel} 
              onChange={(e) => handleChange('experienceLevel', e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
            >
              <option value="Novice">Novice (First Grow)</option>
              <option value="Intermediate">Intermediate (Some Harvests)</option>
              <option value="Expert">Expert (Optimization)</option>
            </select>
          </div>

          <button 
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-lg transition-all duration-200 shadow-lg shadow-emerald-900/50 mt-4"
          >
            Initialize Grow Aide
          </button>
        </form>
      </div>
    </div>
  );
};

export default SetupForm;
