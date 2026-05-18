'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

function formatMessage(content) {
  if (!content) return '';
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="text-gray-500">$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-blue-50 text-blue-700 px-1 rounded text-xs font-mono">$1</code>')
    .replace(/^[-•] (.*?)$/gm, '<li class="ml-3 list-disc text-sm leading-relaxed">$1</li>')
    .replace(/^(\d+)\. (.*?)$/gm, '<li class="ml-3 list-decimal text-sm leading-relaxed">$2</li>')
    .replace(/(<li.*?<\/li>\n?)+/gs, (m) => `<ul class="my-1.5 space-y-0.5">${m}</ul>`)
    .replace(/\n\n/g, '</p><p class="mt-1.5 text-sm">')
    .replace(/\n/g, '<br/>');
}

// ── Categorized Suggestion Prompts ──────────────────────────────────────────
const QUICK_ACTIONS = [
  {
    category: "Find",
    prompts: [
      { text: "Which planners contain a specific unit", type: "unit_selector", template: "Which planners contain unit [UNIT_CODE]?" },
      { text: "List all units in a planner", type: "planner_selector", template: "What units are in [PLANNER_NAME]?" },
      { text: "List all planners", type: "direct", template: "List all study planners" },
    ]
  },
  {
    category: "Compare",
    prompts: [
      { text: "Compare two planners", type: "planner_compare", template: "Compare [PLANNER_A] and [PLANNER_B]" },
    ]
  },
  {
    category: "Calculate",
    prompts: [
      { text: "Total credits in planner", type: "planner_selector", template: "How many total credits in [PLANNER_NAME]?" },
      { text: "Planner with most credits", type: "direct", template: "Which planner has the most credits?" },
      { text: "Planner with most units", type: "direct", template: "Which planner has the most units?" },
    ]
  },
];
// Unit Selector Modal Component
function UnitSelectorModal({ isOpen, onClose, onSelectUnit, units }) {
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filteredUnits = units.filter(unit =>
    unit.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    unit.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-red-500 to-red-700">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">Select a Unit</h2>
            <button onClick={onClose} className="text-white/80 hover:text-white">✕</button>
          </div>
          <input
            type="text"
            placeholder="Search by unit code or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="mt-3 w-full px-4 py-2 rounded-lg border border-white/30 bg-white/10 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50"
            autoFocus
          />
        </div>
        <div className="p-3 overflow-y-auto max-h-[500px]">
          {filteredUnits.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No units found</div>
          ) : (
            <div className="space-y-1">
              {filteredUnits.map((unit) => (
                <button
                  key={unit.id}
                  onClick={() => onSelectUnit(unit)}
                  className="w-full text-left px-4 py-3 rounded-lg hover:bg-red-50 transition-colors border border-transparent hover:border-red-200"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono font-semibold text-red-600">{unit.code}</p>
                      <p className="text-sm text-gray-600">{unit.name}</p>
                    </div>
                    <p className="text-xs text-gray-400">{unit.credits} credits</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Planner Selector Modal Component
function PlannerSelectorModal({ isOpen, onClose, onSelectPlanner, planners, isCompare = false, onSelectBoth }) {
  const [selectedPlanners, setSelectedPlanners] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filteredPlanners = planners.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (planner) => {
    if (isCompare) {
      if (selectedPlanners.includes(planner.name)) {
        setSelectedPlanners(selectedPlanners.filter(p => p !== planner.name));
      } else if (selectedPlanners.length < 2) {
        setSelectedPlanners([...selectedPlanners, planner.name]);
      }
    } else {
      onSelectPlanner(planner);
    }
  };

  const handleConfirm = () => {
    if (isCompare && selectedPlanners.length === 2) {
      onSelectBoth(selectedPlanners[0], selectedPlanners[1]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[70vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-red-500 to-red-700">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">
              {isCompare ? 'Select Two Planners to Compare' : 'Select a Planner'}
            </h2>
            <button onClick={onClose} className="text-white/80 hover:text-white">✕</button>
          </div>
          {isCompare && selectedPlanners.length > 0 && (
            <p className="text-xs text-white/80 mt-2">Selected: {selectedPlanners.join(' vs ')}</p>
          )}
          <input
            type="text"
            placeholder="Search planner..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="mt-3 w-full px-4 py-2 rounded-lg border border-white/30 bg-white/10 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50"
            autoFocus
          />
        </div>
        <div className="p-3 overflow-y-auto max-h-[400px]">
          {filteredPlanners.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No planners found</div>
          ) : (
            <div className="space-y-1">
              {filteredPlanners.map((planner) => (
                <button
                  key={planner.id}
                  onClick={() => handleSelect(planner)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${isCompare && selectedPlanners.includes(planner.name)
                    ? 'bg-red-100 border-red-300'
                    : 'hover:bg-red-50'
                    }`}
                >
                  <p className="font-semibold text-gray-800">{planner.name}</p>
                  <p className="text-xs text-gray-400">
                    {planner.units?.length ?? planner.unitCount ?? 0} units, {planner.totalCredits} credits
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
        {isCompare && (
          <div className="p-4 border-t border-gray-100">
            <button
              onClick={handleConfirm}
              disabled={selectedPlanners.length !== 2}
              className="w-full py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition"
            >
              Compare Selected Planners
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


export default function PlannerAIPage() {
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: `Hi! I'm your **Study Planner Assistant**.\n\nI can help you with:\n- Finding units in planners\n- Comparing planners\n- Calculating credit totals\n- Searching for specific units\n\nClick any suggestion button below or type your question!`,
    timestamp: new Date(),
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [ollamaOk, setOllamaOk] = useState(null);
  const [activeCategory, setActiveCategory] = useState('Find');
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [showPlannerModal, setShowPlannerModal] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState(null);
  const [units, setUnits] = useState([]);
  const [planners, setPlanners] = useState([]);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const [chatExpanded, setChatExpanded] = useState(false);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    checkOllama();
    fetchUnitsAndPlanners();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  async function fetchUnitsAndPlanners() {
    try {
      const [unitsRes, plannersRes] = await Promise.all([
        SecureFrontendAuthHelper.authenticatedFetch('/api/planner-ai?type=units'),
        SecureFrontendAuthHelper.authenticatedFetch('/api/planner-ai?type=planners'),
      ]);

      const unitsData = await unitsRes.json();
      const plannersData = await plannersRes.json();

      if (unitsData.success) {
        setUnits(unitsData.data);
      }

      if (plannersData.success) {
        setPlanners(plannersData.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  }

  async function checkOllama() {
    try {
      const res = await fetch('http://localhost:11434/api/tags', {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        setOllamaOk(data.models?.some(m => m.name.includes('llama3.2')));
      } else {
        setOllamaOk(false);
      }
    } catch {
      setOllamaOk(false);
    }
  }

  const sendMessage = useCallback(async (text) => {
    const question = (text || input).trim();
    if (!question || isLoading) return;

    setInput('');
    setMessages(prev => [...prev, {
      role: 'user', content: question, timestamp: new Date(),
    }]);
    setIsLoading(true);

    const updatedHistory = [...history, { role: 'user', content: question }];

    try {
      const res = await SecureFrontendAuthHelper.authenticatedFetch('/api/planner-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, conversationHistory: updatedHistory }),
      });
      const data = await res.json();
      const answer = data.success ? data.answer : `❌ ${data.message}`;

      setMessages(prev => [...prev, {
        role: 'assistant', content: answer, timestamp: new Date(), source: data.source,
      }]);
      setHistory([...updatedHistory, { role: 'assistant', content: answer }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Failed to connect. Please try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, history]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: `Hi! I'm your **Study Planner Assistant**.\n\nI can help you with:\n- 📋 Finding units in planners\n- 📊 Comparing planners\n- 🧮 Calculating credit totals\n- 🔍 Searching for specific units\n\nClick any suggestion button below or type your question!`,
      timestamp: new Date(),
    }]);
    setHistory([]);
  };


  const handlePromptClick = (prompt, type, template) => {
    if (type === 'unit_selector') {
      setPendingTemplate(template);
      setShowUnitModal(true);
    } else if (type === 'planner_selector') {
      setPendingTemplate(template);
      setShowPlannerModal(true);
    } else if (type === 'planner_compare') {
      setShowCompareModal(true);
    } else if (type === 'direct') {
      sendMessage(template);
    } else {
      if (template) {
        setInput(template);
        setTimeout(() => {
          inputRef.current?.focus();
          const start = template.indexOf('[');
          const end = template.indexOf(']') + 1;
          if (start !== -1 && end !== -1) {
            inputRef.current?.setSelectionRange(start, end);
          }
        }, 100);
      }
    }
  };

  const handleSelectUnit = (unit) => {
    setShowUnitModal(false);
    if (pendingTemplate) {
      const filledPrompt = pendingTemplate
        .replace('[UNIT_CODE]', unit.code)
        .replace('[UNIT_NAME]', unit.name);
      setInput(filledPrompt);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    setPendingTemplate(null);
  };

  const handleSelectPlanner = (planner) => {
    setShowPlannerModal(false);
    if (pendingTemplate) {
      const filledPrompt = pendingTemplate.replace('[PLANNER_NAME]', planner.name);
      setInput(filledPrompt);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    setPendingTemplate(null);
  };

  const handleCompareBoth = (plannerA, plannerB) => {
    setShowCompareModal(false);
    setInput(`Compare ${plannerA} and ${plannerB}`);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-red-50/20">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/view/dashboard" className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-600 font-medium transition-colors">
              ← Back
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-800">AI Study Planner Assistant</h1>
              <p className="text-xs text-gray-400">Chat with AI about study planners</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${ollamaOk === null ? 'bg-gray-300 animate-pulse' :
                ollamaOk ? 'bg-emerald-400' : 'bg-red-400'
                }`} />
              <span className="text-xs text-gray-500">
                {ollamaOk === null ? 'checking' : ollamaOk ? 'AI online' : 'AI offline'}
              </span>
            </div>
            <button
              onClick={clearChat}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm font-medium transition-colors"
            >
              Clear Chat
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Ollama offline banner */}
        {ollamaOk === false && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
            <p className="text-xs text-red-600">
              ⚠️ Ollama is offline. Please ensure Ollama is running and the llama3.2 model is installed.
            </p>
          </div>
        )}

        {/* Messages area */}
        {/* Messages area */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
          {/* Header with expand button */}
          <div className="flex justify-between items-center px-4 py-2 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Conversation</h3>
            <button
              onClick={() => setChatExpanded(!chatExpanded)}
              className="p-1 rounded-md hover:bg-gray-200 transition-colors"
              title={chatExpanded ? "Collapse chat" : "Expand chat"}
            >
              {chatExpanded ? (
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 11l4-4m0 0l4 4m-4-4v12" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9l4-4m0 0l4 4m-4-4v12" />
                </svg>
              )}
            </button>
          </div>

          {/* Scrollable messages container – height toggles */}
          <div
            className={`overflow-y-auto p-4 space-y-3 transition-all duration-300 ${chatExpanded ? 'h-[70vh]' : 'h-[750px]'
              }`}
          >
            {messages.map((msg, i) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={i}
                  className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">
                      <span className="text-white text-xs font-bold">AI</span>
                    </div>
                  )}

                  <div className={`flex flex-col gap-1 max-w-[85%]`}>
                    <div
                      className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${isUser
                        ? 'bg-red-600 text-white rounded-tr-sm'
                        : 'bg-gray-50 border border-gray-200 text-gray-700 rounded-tl-sm'
                        }`}
                      dangerouslySetInnerHTML={{
                        __html: isUser
                          ? msg.content
                          : `<p class="text-sm text-gray-600 leading-relaxed">${formatMessage(msg.content)}</p>`,
                      }}
                    />
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-xs text-gray-400">
                        {msg.timestamp?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {msg.source === 'ollama' && (
                        <span className="text-xs text-emerald-500 font-medium">• local AI</span>
                      )}
                    </div>
                  </div>

                  {isUser && (
                    <div className="w-7 h-7 rounded-xl bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs">
                      👤
                    </div>
                  )}
                </div>
              );
            })}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <span className="text-white text-xs font-bold">AI</span>
                </div>
                <div className="bg-gray-50 border border-gray-200 px-3.5 py-2.5 rounded-2xl rounded-tl-sm flex items-center gap-1 shadow-sm">
                  <div
                    className="w-1.5 h-1.5 bg-red-400 rounded-full animate-bounce"
                    style={{ animationDelay: '0ms' }}
                  />
                  <div
                    className="w-1.5 h-1.5 bg-red-400 rounded-full animate-bounce"
                    style={{ animationDelay: '150ms' }}
                  />
                  <div
                    className="w-1.5 h-1.5 bg-red-400 rounded-full animate-bounce"
                    style={{ animationDelay: '300ms' }}
                  />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
        {/* Category Tabs */}
        <div className="mb-3">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            {QUICK_ACTIONS.map((cat) => (
              <button
                key={cat.category}
                onClick={() => setActiveCategory(cat.category)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeCategory === cat.category
                  ? 'bg-white text-red-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                {cat.category}
              </button>
            ))}
          </div>
        </div>

        {/* Category Prompts Grid */}
        <div className="mb-3 p-3 bg-gray-50 rounded-xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {QUICK_ACTIONS.find(c => c.category === activeCategory)?.prompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handlePromptClick(prompt.text, prompt.type, prompt.template)}
                disabled={isLoading || !ollamaOk}
                className="text-left px-3 py-2 text-sm rounded-lg bg-white hover:bg-red-50 border border-gray-200 text-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="font-medium">{prompt.text}</span>
                {prompt.placeholder && (
                  <span className="text-xs text-gray-400 block mt-0.5">e.g., {prompt.placeholder}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Input area */}
        <div>
          <div className="flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              disabled={isLoading || !ollamaOk}
              placeholder={
                !ollamaOk ? 'AI offline…' :
                  isLoading ? 'Thinking…' :
                    'Type your question… (Enter to send)'
              }
              className="flex-1 bg-white border border-gray-200 focus:border-red-400 focus:bg-white rounded-xl px-4 py-3 text-sm resize-none outline-none transition-all text-gray-700 placeholder-gray-400 disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading || !ollamaOk}
              className="px-5 bg-red-600 hover:bg-red-500 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors shadow-sm self-stretch"
            >
              {isLoading ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin block" />
              ) : 'Send'}
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <UnitSelectorModal
        isOpen={showUnitModal}
        onClose={() => {
          setShowUnitModal(false);
          setPendingTemplate(null);
        }}
        onSelectUnit={handleSelectUnit}
        units={units}
      />

      <PlannerSelectorModal
        isOpen={showPlannerModal}
        onClose={() => {
          setShowPlannerModal(false);
          setPendingTemplate(null);
        }}
        onSelectPlanner={handleSelectPlanner}
        planners={planners}
      />

      <PlannerSelectorModal
        isOpen={showCompareModal}
        onClose={() => setShowCompareModal(false)}
        onSelectPlanner={() => { }}
        onSelectBoth={handleCompareBoth}
        planners={planners}
        isCompare={true}
      />
    </div>
  );
}