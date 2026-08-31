import React, { useState } from 'react';
import { UserSetup, GrowStage, DiagnosisResult } from '../types';
import { diagnosePlantIssue } from '../services/gemini';
import { BugIcon, LeafIcon, ActivityIcon, AlertTriangleIcon, LoaderIcon, CheckCircleIcon, XIcon } from './Icons';

interface TroubleshooterProps {
  setup: UserSetup;
  stage: GrowStage;
  onClose: () => void;
}

const CATEGORIES = [
  { id: 'leaves', label: 'Leaves / Foliage', icon: LeafIcon, symptoms: ['Yellowing Leaves', 'Brown Spots/Patches', 'Curling Up (Taco)', 'Curling Down (Claw)', 'White Powdery Spots', 'Holes/Bite Marks'] },
  { id: 'pests', label: 'Pests / Bugs', icon: BugIcon, symptoms: ['Webbing on plants', 'Flying insects', 'Tiny bugs under leaves', 'White things in soil', 'Slime trails'] },
  { id: 'growth', label: 'Growth / Structure', icon: ActivityIcon, symptoms: ['Stunted / Not Growing', 'Stretching / Too Tall', 'Weak Stems', 'Drooping / Wilting', 'Purple Stems'] },
  { id: 'environment', label: 'Roots / Environment', icon: AlertTriangleIcon, symptoms: ['Bad Smell (Rot)', 'Roots are Brown/Slimy', 'Soil not drying', 'Mold on topsoil', 'Temperature Issues'] }
];

const Troubleshooter: React.FC<TroubleshooterProps> = ({ setup, stage, onClose }) => {
  const [step, setStep] = useState<'category' | 'symptom' | 'analyzing' | 'result'>('category');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSymptom, setSelectedSymptom] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);

  const handleCategorySelect = (id: string) => {
    setSelectedCategory(id);
    setStep('symptom');
  };

  const handleSymptomSelect = async (symptom: string) => {
    setSelectedSymptom(symptom);
    setStep('analyzing');
    
    const result = await diagnosePlantIssue(setup, stage, selectedCategory!, symptom);
    setDiagnosis(result);
    setStep('result');
  };

  const reset = () => {
    setStep('category');
    setSelectedCategory(null);
    setSelectedSymptom(null);
    setDiagnosis(null);
  };

  const renderContent = () => {
    switch (step) {
      case 'category':
        return (
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-white mb-6">What kind of issue are you seeing?</h3>
            <div className="grid grid-cols-2 gap-4">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCategorySelect(cat.id)}
                  className="bg-zinc-800/50 hover:bg-emerald-500/10 hover:border-emerald-500/50 border border-zinc-700 p-6 rounded-xl flex flex-col items-center gap-3 transition-all group text-center"
                >
                  <cat.icon className="w-10 h-10 text-zinc-400 group-hover:text-emerald-400" />
                  <span className="font-medium text-zinc-300 group-hover:text-white">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>
        );

      case 'symptom':
        const category = CATEGORIES.find(c => c.id === selectedCategory);
        return (
          <div className="space-y-4">
            <button onClick={() => setStep('category')} className="text-sm text-zinc-500 hover:text-zinc-300 mb-2">← Back to categories</button>
            <h3 className="text-xl font-bold text-white mb-2">Describe the symptoms</h3>
            <p className="text-zinc-400 mb-6">Select the option that best matches your {category?.label.toLowerCase()} issue.</p>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {category?.symptoms.map((sym) => (
                <button
                  key={sym}
                  onClick={() => handleSymptomSelect(sym)}
                  className="w-full text-left bg-zinc-800 border border-zinc-700 p-4 rounded-lg text-zinc-200 hover:bg-zinc-700 hover:border-zinc-500 transition-all flex justify-between items-center"
                >
                  {sym}
                  <span className="text-zinc-500 text-lg">›</span>
                </button>
              ))}
            </div>
          </div>
        );

      case 'analyzing':
        return (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <LoaderIcon className="w-16 h-16 text-emerald-500 animate-spin mb-6" />
            <h3 className="text-xl font-bold text-white mb-2">Running Diagnostics</h3>
            <p className="text-zinc-400 max-w-xs">Analyzing your {setup.method} setup and symptoms against common pathologies...</p>
          </div>
        );

      case 'result':
        if (!diagnosis) return (
            <div className="text-center py-10">
                <p className="text-red-400">Analysis failed. Please try again.</p>
                <button onClick={reset} className="mt-4 text-sm text-zinc-400 underline">Restart</button>
            </div>
        );

        return (
          <div className="space-y-6">
            <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl flex items-start gap-4">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <AlertTriangleIcon className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm text-red-400 font-bold uppercase tracking-wider mb-1">Diagnosis</h3>
                <p className="text-xl font-bold text-white">{diagnosis.issue}</p>
              </div>
            </div>

            <div className="bg-zinc-800/50 rounded-xl p-5 border border-zinc-700">
              <h4 className="text-zinc-300 font-medium mb-2">Analysis</h4>
              <p className="text-zinc-400 text-sm leading-relaxed">{diagnosis.analysis}</p>
            </div>

            <div>
              <h4 className="text-white font-medium mb-3 flex items-center gap-2">
                <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
                Recommended Actions
              </h4>
              <div className="space-y-3">
                {diagnosis.actions.map((action, idx) => (
                  <div key={idx} className="flex gap-3 bg-zinc-900 border border-zinc-800 p-4 rounded-lg">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-900/50 text-emerald-400 flex items-center justify-center text-xs font-bold border border-emerald-900">
                      {idx + 1}
                    </span>
                    <p className="text-zinc-300 text-sm">{action}</p>
                  </div>
                ))}
              </div>
            </div>

            <button 
              onClick={reset}
              className="w-full py-4 mt-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors font-medium border border-zinc-700"
            >
              Run Another Check
            </button>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <ActivityIcon className="w-5 h-5 text-red-400" />
            <span className="font-bold text-white">System Diagnostics</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-white transition-colors"
          >
            <XIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default Troubleshooter;
