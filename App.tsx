import React, { useState, useEffect, useRef } from 'react';
import { GrowStage, UserSetup, Task, ChatMessage } from './types';
import SetupForm from './components/SetupForm';
import { generateTasksForStage, chatWithGrower } from './services/gemini';
import { LeafIcon, CheckCircleIcon, SendIcon, LoaderIcon, ActivityIcon } from './components/Icons';
import Troubleshooter from './components/Troubleshooter';

function App() {
  const [setup, setSetup] = useState<UserSetup | null>(null);
  const [stage, setStage] = useState<GrowStage>(GrowStage.SEEDLING);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  
  // Troubleshooter State
  const [troubleshootOpen, setTroubleshootOpen] = useState(false);
  
  // Chat State
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load from local storage on mount
  useEffect(() => {
    const savedSetup = localStorage.getItem('apex_setup');
    if (savedSetup) setSetup(JSON.parse(savedSetup));
    
    const savedTasks = localStorage.getItem('apex_tasks');
    if (savedTasks) setTasks(JSON.parse(savedTasks));

    const savedStage = localStorage.getItem('apex_stage');
    if (savedStage) setStage(savedStage as GrowStage);
  }, []);

  // Save changes
  useEffect(() => {
    if (setup) localStorage.setItem('apex_setup', JSON.stringify(setup));
    localStorage.setItem('apex_tasks', JSON.stringify(tasks));
    localStorage.setItem('apex_stage', stage);
  }, [setup, tasks, stage]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, chatOpen]);

  const handleSetupComplete = (data: UserSetup) => {
    setSetup(data);
    generateInitialTasks(data, GrowStage.SEEDLING);
  };

  const generateInitialTasks = async (userSetup: UserSetup, currentStage: GrowStage) => {
    setLoadingTasks(true);
    const newTasks = await generateTasksForStage(currentStage, userSetup, []);
    setTasks(newTasks);
    setLoadingTasks(false);
  };

  const handleGenerateMoreTasks = async () => {
    if (!setup) return;
    setLoadingTasks(true);
    const newTasks = await generateTasksForStage(stage, setup, tasks);
    setTasks(prev => [...prev, ...newTasks]);
    setLoadingTasks(false);
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const handleStageChange = (newStage: GrowStage) => {
    if (newStage === stage) return;
    setStage(newStage);
    if (setup) {
      setTasks([]); // Clear tasks for new stage
      generateInitialTasks(setup, newStage);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !setup) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setChatLoading(true);

    // Prepare history for API
    const history = messages.map(m => ({
      role: m.role,
      parts: [{ text: m.content }]
    }));

    const responseText = await chatWithGrower(history, userMsg.content, setup, stage);

    const botMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      content: responseText,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, botMsg]);
    setChatLoading(false);
  };

  const getProgress = () => {
    if (tasks.length === 0) return 0;
    const completed = tasks.filter(t => t.completed).length;
    return Math.round((completed / tasks.length) * 100);
  };

  if (!setup) {
    return <SetupForm onComplete={handleSetupComplete} />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="fixed top-0 w-full z-40 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LeafIcon className="w-6 h-6 text-emerald-400" />
            <span className="font-bold tracking-tight">ApexGrow</span>
          </div>
          <div className="text-xs font-mono text-zinc-500 hidden sm:block">
            {setup.method} • {setup.environment} • {setup.strainType}
          </div>
        </div>
      </header>

      <main className="pt-24 pb-24 max-w-5xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Col: Dashboard Controls */}
        <div className="lg:col-span-1 space-y-6">
          {/* Stage Selector */}
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
          </div>

          {/* Progress Card */}
          <div className="glass-panel rounded-xl p-5 border border-zinc-800">
             <div className="flex justify-between items-end mb-2">
                <span className="text-zinc-400 text-sm">Stage Progress</span>
                <span className="text-2xl font-mono font-bold text-white">{getProgress()}%</span>
             </div>
             <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-500 ease-out"
                  style={{ width: `${getProgress()}%` }}
                />
             </div>
          </div>

          {/* Troubleshooter Trigger */}
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

        {/* Middle/Right Col: Tasks & Content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-white">Active Goals</h1>
            <button 
              onClick={handleGenerateMoreTasks}
              disabled={loadingTasks}
              className="text-xs font-mono text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              {loadingTasks ? <LoaderIcon className="w-3 h-3 animate-spin" /> : '+'} GENERATE TASKS
            </button>
          </div>

          <div className="space-y-3">
            {loadingTasks && tasks.length === 0 ? (
              <div className="text-center py-20">
                <LoaderIcon className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-4" />
                <p className="text-zinc-500 animate-pulse">Analyzing grow parameters...</p>
              </div>
            ) : tasks.length === 0 ? (
               <div className="text-center py-10 border border-dashed border-zinc-800 rounded-xl">
                 <p className="text-zinc-500">No tasks active. Generate some to get started.</p>
               </div>
            ) : (
              tasks.map((task) => (
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
                    <div className={`mt-1 flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                      task.completed 
                        ? 'bg-emerald-500 border-emerald-500 text-zinc-950' 
                        : 'border-zinc-500 group-hover:border-emerald-400'
                    }`}>
                      {task.completed && <CheckCircleIcon className="w-3 h-3" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
                            task.category === 'Feeding' ? 'border-blue-900 bg-blue-900/20 text-blue-400' :
                            task.category === 'Environment' ? 'border-yellow-900 bg-yellow-900/20 text-yellow-400' :
                            'border-zinc-700 bg-zinc-800 text-zinc-400'
                        }`}>
                            {task.category}
                        </span>
                        <h3 className={`font-medium ${task.completed ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>
                          {task.title}
                        </h3>
                      </div>
                      <p className={`text-sm ${task.completed ? 'text-zinc-600' : 'text-zinc-400'}`}>
                        {task.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Troubleshooter Modal */}
      {troubleshootOpen && setup && (
        <Troubleshooter 
          setup={setup} 
          stage={stage} 
          onClose={() => setTroubleshootOpen(false)} 
        />
      )}

      {/* Chat Interface (Floating) */}
      <div className={`fixed bottom-0 right-0 w-full sm:w-[400px] sm:right-6 sm:bottom-6 z-50 transition-transform duration-300 ${chatOpen ? 'translate-y-0' : 'translate-y-[calc(100%-60px)] sm:translate-y-[calc(100%-70px)]'}`}>
        <div className="bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden h-[500px] sm:h-[600px]">
            {/* Chat Header */}
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

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-950/50">
                {messages.length === 0 && (
                    <div className="text-center mt-10 opacity-50">
                        <LeafIcon className="w-10 h-10 mx-auto text-zinc-600 mb-2" />
                        <p className="text-zinc-500 text-sm">Ask me anything about your {stage.toLowerCase()} stage.</p>
                    </div>
                )}
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${
                            msg.role === 'user' 
                            ? 'bg-emerald-600 text-white rounded-br-none' 
                            : 'bg-zinc-800 text-zinc-200 rounded-bl-none border border-zinc-700'
                        }`}>
                            {msg.content}
                        </div>
                    </div>
                ))}
                {chatLoading && (
                    <div className="flex justify-start">
                        <div className="bg-zinc-800 rounded-2xl rounded-bl-none p-3 border border-zinc-700">
                             <div className="flex gap-1">
                                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></span>
                                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></span>
                                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></span>
                             </div>
                        </div>
                    </div>
                )}
                <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
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
