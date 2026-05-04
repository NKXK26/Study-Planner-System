'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

const SUGGESTED_QUESTIONS = [
  "Which students are eligible to graduate this semester?",
  "Who is at risk of not graduating on time?",
  "Is student X ready to graduate?",
  "How many students are graduating on time this year?",
  "List students who meet all graduation requirements",
  "Which students have exceeded maximum study duration?",
  "Show students missing compulsory units",
  "What is blocking student X from graduating?",
];

const WELCOME_MESSAGE = {
  role: 'assistant',
  content: `Hello 👋 I am your **Graduation Eligibility Assistant**.\n\nI can help academic advisors with:\n- **Eligibility** — who is ready to graduate this semester\n- **At-Risk** — students behind schedule or at risk of delay\n- **Overdue** — students who have exceeded maximum study duration\n- **Blockers** — what specific units or requirements are missing\n- **Progress** — credit hour completion rates by student\n\nAsk me anything about student graduation progress.`,
  timestamp: new Date(),
};

// ── Markdown formatter ────────────────────────────────────────────────────────
function formatMessage(content) {
  return content
    .replace(/^### (.*?)$/gm, '<h4 class="text-indigo-700 font-semibold mt-4 mb-1.5 text-sm tracking-wide uppercase">$1</h4>')
    .replace(/^## (.*?)$/gm, '<h3 class="text-gray-800 font-bold mt-4 mb-2 text-base">$1</h3>')
    .replace(/^# (.*?)$/gm,  '<h2 class="text-gray-900 font-bold mt-4 mb-2 text-lg">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-900 font-semibold">$1</strong>')
    .replace(/\*(.*?)\*/g,    '<em class="text-gray-500">$1</em>')
    .replace(/`(.*?)`/g,      '<code class="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-xs font-mono border border-indigo-100">$1</code>')
    .replace(/\|(.+)\|/g, (match) => {
      const cells = match.split('|').filter(c => c.trim() !== '')
      if (cells.every(c => c.trim().match(/^[-:]+$/))) return ''
      const tds = cells.map(c =>
        `<td class="px-3 py-2 border border-gray-200 text-xs text-gray-600">${c.trim()}</td>`
      ).join('')
      return `<tr class="even:bg-gray-50 hover:bg-indigo-50/40 transition-colors">${tds}</tr>`
    })
    .replace(/(<tr.*?<\/tr>\n?)+/gs, match =>
      `<div class="overflow-x-auto my-3 rounded-xl border border-gray-200 shadow-sm"><table class="border-collapse w-full text-xs">${match}</table></div>`
    )
    .replace(/^[-•] (.*?)$/gm,     '<li class="ml-5 text-gray-600 list-disc text-sm leading-relaxed py-0.5">$1</li>')
    .replace(/^(\d+)\. (.*?)$/gm,  '<li class="ml-5 text-gray-600 list-decimal text-sm leading-relaxed py-0.5">$2</li>')
    .replace(/(<li.*?<\/li>\n?)+/gs, match => `<ul class="my-2 space-y-0.5">${match}</ul>`)
    .replace(/\n\n/g, '</p><p class="mt-2 text-sm text-gray-600 leading-relaxed">')
    .replace(/\n/g, '<br/>')
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status, pullStage }) {
  const configs = {
    pulling:  { bg: 'bg-blue-50',    border: 'border-blue-200',   text: 'text-blue-600',   dot: 'bg-blue-500 animate-pulse',   label: pullStage || 'Preparing…' },
    ready:    { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500',              label: 'AI Ready' },
    'no-model':{ bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-600',  dot: 'bg-amber-400 animate-pulse',  label: 'Setting up…' },
    offline:  { bg: 'bg-red-50',     border: 'border-red-200',    text: 'text-red-500',    dot: 'bg-red-400',                  label: 'AI Offline' },
    checking: { bg: 'bg-gray-100',   border: 'border-gray-200',   text: 'text-gray-400',   dot: 'bg-gray-300 animate-pulse',   label: 'Checking…' },
  }
  const c = configs[status] || configs.checking
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${c.bg} ${c.border} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

// ── Model pull banner ─────────────────────────────────────────────────────────
function ModelPullBanner({ progress, stage }) {
  return (
    <div className="mx-4 mb-3 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">🧠</span>
          <span className="text-xs font-semibold text-blue-700">{stage || 'Preparing AI model…'}</span>
        </div>
        {progress > 0 && (
          <span className="text-xs font-mono text-blue-500 tabular-nums">{progress}%</span>
        )}
      </div>
      <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-indigo-500 to-blue-400"
          style={{ width: progress > 0 ? `${progress}%` : '30%',
                   animation: progress === 0 ? 'pulse 1.5s ease-in-out infinite' : 'none' }}
        />
      </div>
      <p className="text-xs text-blue-400 mt-1.5">This only happens once — AI will be ready shortly.</p>
    </div>
  )
}

// ── Quick stat cards ──────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color }) {
  const colors = {
    green:  'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber:  'bg-amber-50  border-amber-200  text-amber-700',
    red:    'bg-red-50    border-red-200    text-red-600',
    blue:   'bg-blue-50   border-blue-200   text-blue-700',
  }
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-medium ${colors[color]}`}>
      <span className="text-base">{icon}</span>
      <div>
        <div className="text-lg font-bold leading-none">{value}</div>
        <div className="text-xs opacity-70 mt-0.5">{label}</div>
      </div>
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm text-white text-xs font-bold">
          AI
        </div>
      )}

      <div className="flex flex-col gap-1 max-w-[80%]">
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm
            ${isUser
              ? 'bg-indigo-600 text-white rounded-tr-sm'
              : 'bg-white border border-gray-200 text-gray-700 rounded-tl-sm'
            }`}
          dangerouslySetInnerHTML={{
            __html: isUser
              ? msg.content
              : `<p class="text-sm text-gray-600 leading-relaxed">${formatMessage(msg.content)}</p>`
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
        <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5 text-indigo-600 text-sm">
          👤
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AIAssistantPage() {
  const [messages, setMessages]             = useState([WELCOME_MESSAGE]);
  const [input, setInput]                   = useState('');
  const [isLoading, setIsLoading]           = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [ollamaStatus, setOllamaStatus]     = useState('checking');
  const [pullProgress, setPullProgress]     = useState(0);
  const [pullStage, setPullStage]           = useState('');
  const [isPulling, setIsPulling]           = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef    = useRef(null);
  const pullStartedRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Check Ollama ──────────────────────────────────────────────────────────
  const checkOllamaStatus = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:11434/api/tags', {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        const hasModel = data.models?.some(m => m.name.includes('llama3.2'));
        const status = hasModel ? 'ready' : 'no-model';
        setOllamaStatus(status);
        return status;
      }
      setOllamaStatus('offline');
      return 'offline';
    } catch {
      setOllamaStatus('offline');
      return 'offline';
    }
  }, []);

  // ── Auto pull model ───────────────────────────────────────────────────────
  const startModelPull = useCallback(async () => {
    if (pullStartedRef.current) return;
    pullStartedRef.current = true;
    setIsPulling(true);
    setOllamaStatus('pulling');
    setPullProgress(0);
    setPullStage('Connecting to Ollama…');

    try {
      if (window.electronAPI?.onOllamaInstallProgress) {
        window.electronAPI.onOllamaInstallProgress(({ message, percent }) => {
          if (message) setPullStage(message);
          if (percent !== undefined && percent !== null) setPullProgress(percent);
        });
      }

      if (window.electronAPI?.setupOllama) {
        await window.electronAPI.setupOllama();
      }

      const status = await checkOllamaStatus();
      if (status === 'ready') {
        setPullStage('Model ready!');
        setTimeout(() => {
          setIsPulling(false);
          setPullProgress(0);
          setPullStage('');
        }, 1500);
      } else {
        setIsPulling(false);
        pullStartedRef.current = false;
      }
    } catch (err) {
      console.error('Pull failed:', err);
      setIsPulling(false);
      setOllamaStatus('offline');
      pullStartedRef.current = false;
    }
  }, [checkOllamaStatus]);

  useEffect(() => {
    (async () => {
      const status = await checkOllamaStatus();
      if (status === 'no-model') setTimeout(() => startModelPull(), 1000);
    })();

    const interval = setInterval(async () => {
      if (!isPulling) await checkOllamaStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!input.trim() || isLoading || ollamaStatus !== 'ready') return;

    const question = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: question, timestamp: new Date() }]);
    setIsLoading(true);

    const updatedHistory = [...conversationHistory, { role: 'user', content: question }];

    try {
      const response = await SecureFrontendAuthHelper.authenticatedFetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, conversationHistory: updatedHistory }),
      });

      const data = await response.json();
      const aiMessage = {
        role: 'assistant',
        content: data.success ? data.answer : `❌ Error: ${data.message}`,
        timestamp: new Date(),
        source: data.source || null,
      };

      setMessages(prev => [...prev, aiMessage]);
      setConversationHistory([...updatedHistory, { role: 'assistant', content: aiMessage.content }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Failed to connect to AI service.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const clearChat = () => {
    setMessages([WELCOME_MESSAGE]);
    setConversationHistory([]);
  };

  const isInputDisabled = ollamaStatus !== 'ready' || isPulling || isLoading;

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-br from-slate-50 via-indigo-50/20 to-blue-50/30 overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex-shrink-0 px-5 py-3 bg-white/90 backdrop-blur border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/view/dashboard"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-600 font-medium transition-colors"
            >
              ← Back
            </Link>
            <div className="w-px h-5 bg-gray-200" />
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center shadow-sm">
                <span className="text-white text-xs font-bold">AI</span>
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-800">Graduation Assistant</div>
                <div className="text-xs text-gray-400">Eligibility & Progress Tracking</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <StatusBadge status={ollamaStatus} pullStage={pullStage} />
            <button
              onClick={clearChat}
              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg font-medium transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* ── Pull banner ── */}
      {isPulling && (
        <div className="flex-shrink-0 px-4 pt-3">
          <ModelPullBanner progress={pullProgress} stage={pullStage} />
        </div>
      )}

      {/* ── Offline warning ── */}
      {ollamaStatus === 'offline' && !isPulling && (
        <div className="flex-shrink-0 mx-4 mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5">
          <p className="text-xs text-red-600">
            ❌ Ollama is not running. Download from{' '}
            <button
              onClick={() => window.electronAPI?.openOllamaDownload?.()}
              className="underline font-semibold hover:text-red-800"
            >
              ollama.com
            </button>
            {' '}then restart the app.
          </p>
        </div>
      )}

      {/* ── Chat area ── */}
      <div className="flex-1 overflow-y-auto px-4 py-5 min-h-0">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} />
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center flex-shrink-0 shadow-sm text-white text-xs font-bold">
                AI
              </div>
              <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5 shadow-sm">
                {[0, 150, 300].map(d => (
                  <div key={d} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
                <span className="text-xs text-gray-400 ml-2">Analysing graduation data…</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Bottom section ── */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white/95 backdrop-blur">

        {/* Suggestion chips */}
        <div className="px-4 py-2.5 overflow-x-auto border-b border-gray-100">
          <div className="flex gap-2 min-w-max">
            {SUGGESTED_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => { setInput(q); textareaRef.current?.focus(); }}
                disabled={isInputDisabled}
                className="px-3 py-1.5 text-xs rounded-full bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-600 whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="p-4">
          <div className="max-w-3xl mx-auto flex gap-3">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              placeholder={
                isPulling         ? 'Setting up AI model, please wait…' :
                ollamaStatus !== 'ready' ? 'AI is offline — check Ollama status' :
                'Ask about graduation eligibility, at-risk students, credit completion… (Enter to send)'
              }
              className="flex-1 bg-gray-50 border border-gray-200 focus:border-indigo-400 focus:bg-white rounded-xl px-4 py-3 text-sm resize-none outline-none transition-all text-gray-700 placeholder-gray-400 disabled:opacity-50"
              disabled={isInputDisabled}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isInputDisabled}
              className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
            >
              {isLoading
                ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin block" />
                : 'Send'
              }
            </button>
          </div>
          <p className="text-center text-xs text-gray-400 mt-2">
            🔒 Runs locally — no student data leaves your system
          </p>
        </div>
      </div>
    </div>
  );
}