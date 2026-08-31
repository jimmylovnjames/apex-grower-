import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GrowLocation, GrowStage, LocalClimate, StrainProfile, Task, UserSetup, ChatMessage } from './types';
import SetupForm from './components/SetupForm';
import LocationCard from './components/LocationCard';
import StrainExpert from './components/StrainExpert';
import GrowCalendar from './components/GrowCalendar';
import Troubleshooter from './components/Troubleshooter';
import { generateTasksForStage, chatWithGrower, getStrainProfile, getLocalBriefing } from './services/gemini';
import { fetchLocalClimate } from './services/weather';
import { buildSchedule, expectedStage } from './services/calendar';
import { toISODate } from './services/solar';
import {
  ActivityIcon, CalendarIcon, CheckCircleIcon, DnaIcon, LeafIcon, LoaderIcon,
  MapPinIcon, SendIcon, SparkIcon
} from './components/Icons';

type Tab = 'goals' | 'calendar' | 'strain';

const STORAGE = {
  setup: 'apex_setup',
  tasks: 'apex_tasks',
  stage: 'apex_stage',
  strain: 'apex_strain',
  briefing: 'apex_briefing'
} as const;

/**
 * Roughly how far into a grow each stage is, used only to back-date saves made
 * before the calendar existed. A grower already in flower did not germinate
 * today, and defaulting them to day one makes every projected date wrong.
 */
const STAGE_BACKDATE_DAYS: Record<GrowStage, number> = {
  [GrowStage.SEEDLING]: 0,
  [GrowStage.VEGETATIVE]: 14,
  [GrowStage.FLOWERING]: 42,
  [GrowStage.CURING]: 105
};

const backdatedStart = (stage: GrowStage): string => {
  const start = new Date();
  start.setDate(start.getDate() - (STAGE_BACKDATE_DAYS[stage] ?? 0));
  return toISODate(start);
};

/** Older saves predate location, strain and calendar fields — fill the gaps rather than dropping the grow. */
const normalizeSetup = (raw: any, savedStage: GrowStage): UserSetup => ({
  method: raw?.method ?? 'Soil',
  environment: raw?.environment ?? 'Indoor Tent',
  strainType: raw?.strainType ?? 'Photoperiod',
  experienceLevel: raw?.experienceLevel ?? 'Novice',
  strainName: raw?.strainName ?? '',
  location: raw?.location ?? null,
  startDate: raw?.startDate ?? backdatedStart(savedStage),
  vegDays: typeof raw?.vegDays === 'number' ? raw.vegDays : 28
});

const normalizeTask = (raw: any, fallbackStage: GrowStage): Task => ({
  id: raw?.id ?? Math.random().toString(36).slice(2, 11),
  title: raw?.title ?? '',
  description: raw?.description ?? '',
  completed: Boolean(raw?.completed),
  category: raw?.category ?? 'Observation',
  stage: raw?.stage ?? fallbackStage,
  dueDate: raw?.dueDate,
  localRationale: raw?.localRationale,
  createdAt: raw?.createdAt ?? Date.now()
});

const readJSON = <T,>(key: string): T | null => {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
};

function App() {
  const [setup, setSetup] = useState<UserSetup | null>(null);
  const [stage, setStage] = useState<GrowStage>(GrowStage.SEEDLING);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [tab, setTab] = useState<Tab>('goals');
  const [hydrated, setHydrated] = useState(false);

  // Location & climate
  const [climate, setClimate] = useState<LocalClimate | null>(null);
  const [climateLoading, setClimateLoading] = useState(false);
  const [climateError, setClimateError] = useState<string | null>(null);

  // Strain expert
  const [strain, setStrain] = useState<StrainProfile | null>(null);
  const [strainLoading, setStrainLoading] = useState(false);
  const [strainError, setStrainError] = useState<string | null>(null);

  // Daily briefing
  const [briefing, setBriefing] = useState<{ key: string; text: string } | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  const [troubleshootOpen, setTroubleshootOpen] = useState(false);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load from local storage on mount
  useEffect(() => {
    const savedStage = (localStorage.getItem(STORAGE.stage) as GrowStage) || GrowStage.SEEDLING;
    const savedSetup = readJSON<any>(STORAGE.setup);
    if (savedSetup) setSetup(normalizeSetup(savedSetup, savedStage));

    const savedTasks = readJSON<any[]>(STORAGE.tasks);
    if (Array.isArray(savedTasks)) setTasks(savedTasks.map((t) => normalizeTask(t, savedStage)));

    setStage(savedStage);
    setStrain(readJSON<StrainProfile>(STORAGE.strain));
    setBriefing(readJSON<{ key: string; text: string }>(STORAGE.briefing));
    setHydrated(true);
  }, []);

  // Save changes — skipped until hydration so we never overwrite a save with empty defaults.
  useEffect(() => {
    if (!hydrated) return;
    if (setup) localStorage.setItem(STORAGE.setup, JSON.stringify(setup));
    localStorage.setItem(STORAGE.tasks, JSON.stringify(tasks));
    localStorage.setItem(STORAGE.stage, stage);
    if (strain) localStorage.setItem(STORAGE.strain, JSON.stringify(strain));
    if (briefing) localStorage.setItem(STORAGE.briefing, JSON.stringify(briefing));
  }, [hydrated, setup, tasks, stage, strain, briefing]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatOpen]);

  const schedule = useMemo(
    () => (setup ? buildSchedule(setup, strain, climate, tasks) : null),
    [setup, strain, climate, tasks]
  );

  const stageTasks = useMemo(() => tasks.filter((t) => t.stage === stage), [tasks, stage]);

  // --- Climate ------------------------------------------------------------

  // Tracks the last site+stage we fetched, so mount and setup completion do not both fire.
  const lastClimateKey = useRef<string | null>(null);

  const loadClimate = useCallback(
    async (location: GrowLocation | null, forStage: GrowStage, force = false): Promise<LocalClimate | null> => {
      if (!location) {
        setClimate(null);
        lastClimateKey.current = null;
        return null;
      }

      const key = `${location.latitude},${location.longitude},${forStage}`;
      if (!force && lastClimateKey.current === key) return null;
      lastClimateKey.current = key;

      setClimateLoading(true);
      setClimateError(null);
      try {
        const next = await fetchLocalClimate(location, forStage);
        setClimate(next);
        return next;
      } catch (error) {
        setClimateError(error instanceof Error ? error.message : 'Could not load local conditions.');
        lastClimateKey.current = null;
        return null;
      } finally {
        setClimateLoading(false);
      }
    },
    []
  );

  // Refetch whenever the site moves or the stage changes (VPD targets are stage-specific).
  useEffect(() => {
    if (!hydrated || !setup?.location) return;
    loadClimate(setup.location, stage);
  }, [hydrated, setup?.location?.latitude, setup?.location?.longitude, stage, loadClimate]);

  const handleLocationChange = (location: UserSetup['location']) => {
    setSetup((prev) => (prev ? { ...prev, location } : prev));
  };

  // --- Briefing -----------------------------------------------------------

  const today = toISODate(new Date());

  // One briefing per site per day — moving location or a new day earns a fresh one.
  const briefingKey = setup?.location ? `${today}|${setup.location.label}|${stage}` : null;

  useEffect(() => {
    if (!setup || !climate || !schedule || !briefingKey) return;
    if (briefing?.key === briefingKey || briefingLoading) return;

    let cancelled = false;
    setBriefingLoading(true);
    getLocalBriefing(setup, stage, climate, strain, schedule)
      .then((text) => {
        if (!cancelled) setBriefing({ key: briefingKey, text });
      })
      .finally(() => {
        if (!cancelled) setBriefingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [briefingKey, climate?.fetchedAt, schedule?.startDate]);

  // --- Strain expert ------------------------------------------------------

  const handleAnalyzeStrain = async (strainName: string) => {
    if (!setup) return;
    setStrainLoading(true);
    setStrainError(null);
    setSetup({ ...setup, strainName });
    try {
      const profile = await getStrainProfile(strainName, { ...setup, strainName }, climate);
      if (profile) {
        setStrain(profile);
      } else {
        setStrainError('Could not build a profile for that name. Check the spelling or try the breeder version of the name.');
      }
    } catch {
      setStrainError('Strain lookup failed. Try again.');
    } finally {
      setStrainLoading(false);
    }
  };

  // --- Tasks --------------------------------------------------------------

  const generateTasks = async (
    userSetup: UserSetup,
    currentStage: GrowStage,
    replace: boolean,
    overrides?: { climate?: LocalClimate | null; strain?: StrainProfile | null }
  ) => {
    setLoadingTasks(true);
    const useClimate = overrides?.climate !== undefined ? overrides.climate : climate;
    const useStrain = overrides?.strain !== undefined ? overrides.strain : strain;
    const useSchedule = overrides ? buildSchedule(userSetup, useStrain, useClimate, tasks) : schedule;

    const existing = replace ? [] : tasks.filter((t) => t.stage === currentStage);
    const newTasks = await generateTasksForStage(currentStage, userSetup, existing, useClimate, useStrain, useSchedule);
    setTasks((prev) => (replace ? [...prev.filter((t) => t.stage !== currentStage), ...newTasks] : [...prev, ...newTasks]));
    setLoadingTasks(false);
  };

  /**
   * Load the forecast and strain profile BEFORE generating the first tasks —
   * otherwise the opening set of goals is the generic advice this whole
   * feature exists to replace.
   */
  const handleSetupComplete = async (data: UserSetup) => {
    setSetup(data);
    setHydrated(true);

    const initialClimate = data.location ? await loadClimate(data.location, GrowStage.SEEDLING, true) : null;

    let initialStrain: StrainProfile | null = null;
    if (data.strainName.trim()) {
      setStrainLoading(true);
      try {
        initialStrain = await getStrainProfile(data.strainName, data, initialClimate);
        setStrain(initialStrain);
      } finally {
        setStrainLoading(false);
      }
    }

    await generateTasks(data, GrowStage.SEEDLING, true, { climate: initialClimate, strain: initialStrain });
  };

  const toggleTask = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  const handleStageChange = (newStage: GrowStage) => {
    if (newStage === stage) return;
    setStage(newStage);
    // Tasks from other stages are kept — they are the grow's history and feed the calendar.
    if (setup && !tasks.some((t) => t.stage === newStage)) generateTasks(setup, newStage, true);
  };

  // --- Chat ---------------------------------------------------------------

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !setup) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: input, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setChatLoading(true);

    const history = messages.map((m) => ({ role: m.role, parts: [{ text: m.content }] }));
    const responseText = await chatWithGrower(history, userMsg.content, setup, stage, climate, strain, schedule);

    setMessages((prev) => [
      ...prev,
      { id: (Date.now() + 1).toString(), role: 'model', content: responseText, timestamp: Date.now() }
    ]);
    setChatLoading(false);
  };

  const getProgress = () => {
    if (stageTasks.length === 0) return 0;
    return Math.round((stageTasks.filter((t) => t.completed).length / stageTasks.length) * 100);
  };

  if (!setup) return <SetupForm onComplete={handleSetupComplete} />;

  const suggestedStage = schedule ? expectedStage(schedule) : stage;
  const stageMismatch = suggestedStage !== stage;

  const TABS: { id: Tab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'goals', label: 'Goals', icon: CheckCircleIcon },
    { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
    { id: 'strain', label: 'Strain', icon: DnaIcon }
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
      <header className="fixed top-0 w-full z-40 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-shrink-0">
            <LeafIcon className="w-6 h-6 text-emerald-400" />
            <span className="font-bold tracking-tight">ApexGrow</span>
          </div>
          <div className="text-xs font-mono text-zinc-500 hidden md:flex items-center gap-2 min-w-0">
            <span className="truncate">{setup.method} • {setup.environment} • {setup.strainType}</span>
            {setup.strainName && <span className="text-emerald-500/80 truncate">• {setup.strainName}</span>}
            {setup.location && (
              <span className="flex items-center gap-1 text-zinc-400 flex-shrink-0">
                <MapPinIcon className="w-3 h-3" />
                {setup.location.label}
              </span>
            )}
          </div>
          {schedule && <span className="text-xs font-mono text-zinc-500 flex-shrink-0">DAY {schedule.dayOfGrow}</span>}
        </div>
      </header>

      <main className="pt-24 pb-32 max-w-6xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: controls */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-panel rounded-xl p-5 border border-zinc-800">
            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">Current Stage</h2>
            <div className="space-y-2">
              {Object.values(GrowStage).map((s) => (
                <button
                  key={s}
                  onClick={() => handleStageChange(s)}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    stage === s
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                      : 'hover:bg-zinc-800/50 text-zinc-400'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    {s}
                    {stage === s && <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
                  </div>
                </button>
              ))}
            </div>

            {stageMismatch && (
              <button
                onClick={() => handleStageChange(suggestedStage)}
                className="w-full mt-3 text-xs text-sky-300 bg-sky-950/40 border border-sky-900/60 rounded-lg px-3 py-2 hover:bg-sky-950/70 transition-colors text-left"
              >
                Your calendar says you should be in <strong>{suggestedStage}</strong> — switch?
              </button>
            )}
          </div>

          <div className="glass-panel rounded-xl p-5 border border-zinc-800">
            <div className="flex justify-between items-end mb-2">
              <span className="text-zinc-400 text-sm">Stage Progress</span>
              <span className="text-2xl font-mono font-bold text-white">{getProgress()}%</span>
            </div>
            <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all duration-500 ease-out" style={{ width: `${getProgress()}%` }} />
            </div>
          </div>

          <LocationCard
            setup={setup}
            stage={stage}
            climate={climate}
            loading={climateLoading}
            error={climateError}
            onRefresh={() => loadClimate(setup.location, stage, true)}
            onLocationChange={handleLocationChange}
          />

          <button
            onClick={() => setTroubleshootOpen(true)}
            className="w-full glass-panel rounded-xl p-4 border border-zinc-800 hover:border-red-500/50 hover:bg-red-500/10 transition-all group flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="bg-red-500/20 p-2 rounded-lg text-red-400 group-hover:text-red-300">
                <ActivityIcon className="w-5 h-5" />
              </div>
              <div className="text-left">
                <span className="block text-sm font-bold text-zinc-200 group-hover:text-white">Troubleshoot</span>
                <span className="block text-xs text-zinc-500">Fix active issues</span>
              </div>
            </div>
            <span className="text-zinc-500 group-hover:text-red-400">→</span>
          </button>
        </div>

        {/* Right: tabbed content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex gap-1 border-b border-zinc-800">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === id
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {tab === 'goals' && (
            <>
              {(briefing || briefingLoading) && (
                <div className="glass-panel rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
                  <h3 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <SparkIcon className="w-3.5 h-3.5" />
                    Today at {setup.location?.label ?? 'your site'}
                  </h3>
                  {briefingLoading && !briefing ? (
                    <p className="text-sm text-zinc-500 animate-pulse">Reading today's conditions…</p>
                  ) : (
                    <p className="text-sm text-zinc-300 leading-relaxed">{briefing?.text}</p>
                  )}
                </div>
              )}

              <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-white">Active Goals</h1>
                <button
                  onClick={() => generateTasks(setup, stage, false)}
                  disabled={loadingTasks}
                  className="text-xs font-mono text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  {loadingTasks ? <LoaderIcon className="w-3 h-3 animate-spin" /> : '+'} GENERATE TASKS
                </button>
              </div>

              <div className="space-y-3">
                {loadingTasks && stageTasks.length === 0 ? (
                  <div className="text-center py-20">
                    <LoaderIcon className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-4" />
                    <p className="text-zinc-500 animate-pulse">
                      {setup.location ? `Analyzing your setup against conditions at ${setup.location.label}…` : 'Analyzing grow parameters…'}
                    </p>
                  </div>
                ) : stageTasks.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-zinc-800 rounded-xl">
                    <p className="text-zinc-500">No tasks active. Generate some to get started.</p>
                  </div>
                ) : (
                  stageTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => toggleTask(task.id)}
                      className={`group relative p-5 rounded-xl border transition-all cursor-pointer ${
                        task.completed
                          ? 'bg-zinc-900/30 border-zinc-800 opacity-60'
                          : 'glass-panel border-zinc-700 hover:border-emerald-500/50 hover:bg-zinc-800/50'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className={`mt-1 flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                            task.completed ? 'bg-emerald-500 border-emerald-500 text-zinc-950' : 'border-zinc-500 group-hover:border-emerald-400'
                          }`}
                        >
                          {task.completed && <CheckCircleIcon className="w-3 h-3" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span
                              className={`text-xs font-mono px-2 py-0.5 rounded border ${
                                task.category === 'Feeding'
                                  ? 'border-blue-900 bg-blue-900/20 text-blue-400'
                                  : task.category === 'Environment'
                                  ? 'border-yellow-900 bg-yellow-900/20 text-yellow-400'
                                  : 'border-zinc-700 bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              {task.category}
                            </span>
                            <h3 className={`font-medium ${task.completed ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>
                              {task.title}
                            </h3>
                            {task.dueDate && (
                              <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                                <CalendarIcon className="w-3 h-3" />
                                {task.dueDate === today ? 'TODAY' : task.dueDate.slice(5)}
                              </span>
                            )}
                          </div>
                          <p className={`text-sm ${task.completed ? 'text-zinc-600' : 'text-zinc-400'}`}>{task.description}</p>
                          {task.localRationale && !task.completed && (
                            <p className="text-xs text-sky-300/90 mt-2 flex gap-1.5">
                              <MapPinIcon className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                              {task.localRationale}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {tab === 'calendar' && schedule && (
            <GrowCalendar
              schedule={schedule}
              setup={setup}
              onStartDateChange={(startDate) => setSetup({ ...setup, startDate })}
              onVegDaysChange={(vegDays) => setSetup({ ...setup, vegDays })}
            />
          )}

          {tab === 'strain' && (
            <StrainExpert
              strainName={setup.strainName}
              profile={strain}
              loading={strainLoading}
              error={strainError}
              hasLocation={Boolean(setup.location)}
              onAnalyze={handleAnalyzeStrain}
            />
          )}
        </div>
      </main>

      {troubleshootOpen && (
        <Troubleshooter
          setup={setup}
          stage={stage}
          climate={climate}
          strain={strain}
          schedule={schedule}
          onClose={() => setTroubleshootOpen(false)}
        />
      )}

      {/* Chat (floating) */}
      <div
        className={`fixed bottom-0 right-0 w-full sm:w-[400px] sm:right-6 sm:bottom-6 z-50 transition-transform duration-300 ${
          chatOpen ? 'translate-y-0' : 'translate-y-[calc(100%-60px)] sm:translate-y-[calc(100%-70px)]'
        }`}
      >
        <div className="bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden h-[500px] sm:h-[600px]">
          <div
            onClick={() => setChatOpen(!chatOpen)}
            className="bg-zinc-800 p-4 flex items-center justify-between cursor-pointer border-b border-zinc-700 hover:bg-zinc-750 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="font-bold text-zinc-100">Apex Consultant</span>
            </div>
            <div className={`text-zinc-400 transition-transform ${chatOpen ? 'rotate-180' : ''}`}>▲</div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-950/50">
            {messages.length === 0 && (
              <div className="text-center mt-10 px-4">
                <LeafIcon className="w-10 h-10 mx-auto text-zinc-600 mb-2" />
                <p className="text-zinc-500 text-sm">
                  Ask me anything about your {stage.toLowerCase()} stage.
                </p>
                <p className="text-zinc-600 text-xs mt-2">
                  I know {setup.strainName || 'your setup'}
                  {setup.location ? `, the weather at ${setup.location.label}` : ''}
                  {schedule ? `, and that you're on day ${schedule.dayOfGrow}` : ''}.
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl p-3 text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-emerald-600 text-white rounded-br-none'
                      : 'bg-zinc-800 text-zinc-200 rounded-bl-none border border-zinc-700'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 rounded-2xl rounded-bl-none p-3 border border-zinc-700">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-3 bg-zinc-800 border-t border-zinc-700 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about nutrients, lights, or issues..."
              className="flex-1 bg-zinc-900 border-zinc-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={chatLoading || !input.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white p-2 rounded-lg transition-colors"
            >
              <SendIcon className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;
