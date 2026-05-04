'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

// ── Line Chart Component ─────────────────────────────────────────────────────
function FailureTrendLineChart({ data, title }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-400">No trend data available</p>
      </div>
    );
  }

  const values = data.map(d => d.failRate);
  const maxValue = Math.max(...values, 30);
  const minValue = Math.min(...values, 0);
  const range = maxValue - minValue;
  const padding = { top: 20, right: 30, bottom: 40, left: 45 };
  const height = 250;
  const width = 100;
  const step = width / (data.length - 1 || 1);

  const getY = (value) => {
    return height - padding.bottom - ((value - minValue) / (range || 1)) * (height - padding.top - padding.bottom);
  };

  const points = data.map((d, i) => {
    const x = padding.left + i * step;
    const y = getY(d.failRate);
    return `${x},${y}`;
  }).join(' ');

  const warningLine = getY(30);
  const criticalLine = getY(50);

  return (
    <div className="w-full">
      {title && <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>}
      <div className="relative" style={{ height: `${height}px` }}>
        <svg width="100%" height={height} viewBox={`0 0 ${width + padding.left + padding.right} ${height}`} preserveAspectRatio="none">
          {/* Y-axis label */}
          <text x="12" y={height / 2} className="text-[10px] fill-gray-400" textAnchor="middle" transform={`rotate(-90, 12, ${height / 2})`}>
            Failure Rate (%)
          </text>

          {/* Y-axis */}
          <line x1={padding.left - 5} y1={padding.top} x2={padding.left - 5} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="1" />

          {/* Y-axis ticks */}
          {[0, 15, 30, 45, 60, 75, 100].filter(v => v <= maxValue + 10).map(val => {
            const y = getY(val);
            return (
              <g key={val}>
                <line x1={padding.left - 10} y1={y} x2={padding.left - 5} y2={y} stroke="#cbd5e1" strokeWidth="1" />
                <text x={padding.left - 15} y={y + 3} className="text-[9px] fill-gray-400" textAnchor="end">{val}%</text>
              </g>
            );
          })}

          {/* Grid lines */}
          {[0, 15, 30, 45, 60, 75].filter(v => v <= maxValue + 10).map(val => {
            const y = getY(val);
            return (
              <line key={`grid-${val}`} x1={padding.left} y1={y} x2={width + padding.left} y2={y} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="4" />
            );
          })}

          {/* Warning line (30%) */}
          <line x1={padding.left} y1={warningLine} x2={width + padding.left} y2={warningLine} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="6" />
          <text x={padding.left + 5} y={warningLine - 3} className="text-[8px] fill-amber-500">Warning: 30%</text>

          {/* Critical line (50%) */}
          <line x1={padding.left} y1={criticalLine} x2={width + padding.left} y2={criticalLine} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="6" />
          <text x={padding.left + 5} y={criticalLine - 3} className="text-[8px] fill-red-500">Critical: 50%</text>

          {/* Area under line */}
          <polygon
            points={`${padding.left},${height - padding.bottom} ${points} ${padding.left + (data.length - 1) * step},${height - padding.bottom}`}
            fill="url(#failGradient)"
            opacity="0.15"
          />

          <defs>
            <linearGradient id="failGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Line */}
          <polyline points={points} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Data points */}
          {data.map((d, i) => {
            const x = padding.left + i * step;
            const y = getY(d.failRate);
            const isHigh = d.failRate >= 30;
            return (
              <g key={i} className="group cursor-pointer">
                <circle cx={x} cy={y} r="5" fill={isHigh ? '#ef4444' : '#f59e0b'} stroke="white" strokeWidth="2" />
                <title>{`${d.term}: ${d.failRate}% failure (${d.fail}/${d.total})`}</title>
              </g>
            );
          })}

          {/* X-axis labels */}
          {data.map((d, i) => {
            const x = padding.left + i * step;
            return (
              <text key={`label-${i}`} x={x} y={height - padding.bottom + 18} className="text-[9px] fill-gray-400" textAnchor="middle">
                {d.term}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Legend / Stats */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-red-500" />
          <span className="text-gray-500">Failure Rate Trend</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-amber-500 border-dashed" />
          <span className="text-gray-500">Warning Threshold (30%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-red-500 border-dashed" />
          <span className="text-gray-500">Critical Threshold (50%)</span>
        </div>
      </div>
    </div>
  );
}

function RiskBadge({ rate }) {
  if (rate >= 50) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">⚠️ Critical</span>;
  if (rate >= 30) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-600">⚠️ High Risk</span>;
  if (rate >= 15) return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-600">⚠️ Medium</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">✅ Healthy</span>;
}

function StatCard({ label, value, sub, color, icon, trend }) {
  const colors = {
    red: 'border-l-red-400',
    amber: 'border-l-amber-400',
    blue: 'border-l-blue-500',
    green: 'border-l-emerald-500',
    purple: 'border-l-violet-500',
    slate: 'border-l-slate-400',
  };
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 border-l-4 ${colors[color] || colors.blue}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
          <p className="text-3xl font-bold text-gray-800 leading-none">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
          {trend !== undefined && (
            <div className="flex items-center gap-1 mt-2">
              <span className={`text-xs font-medium ${trend >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                {trend >= 0 ? `↑ +${trend}` : `↓ ${trend}%`}
              </span>
              <span className="text-xs text-gray-400">vs last term</span>
            </div>
          )}
        </div>
        <span className="text-2xl opacity-50">{icon}</span>
      </div>
    </div>
  );
}

function FailRateBar({ passCount, failCount }) {
  const total = passCount + failCount;
  return (
    <div className="w-full">
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
        <div className="bg-emerald-400 transition-all" style={{ width: `${total > 0 ? (passCount / total) * 100 : 0}%` }} />
        <div className="bg-red-400 transition-all" style={{ width: `${total > 0 ? (failCount / total) * 100 : 0}%` }} />
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-0.5">
        <span className="text-emerald-600 font-medium">{passCount} Pass</span>
        <span className="text-red-500 font-medium">{failCount} Fail</span>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function UnitAnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const res = await SecureFrontendAuthHelper.authenticatedFetch('/api/unit-analytics');
      const json = await res.json();
      if (json.success) setData(json.data);
      else setError(json.message);
    } catch {
      setError('Failed to load unit analytics. Please refresh.');
    } finally {
      setLoading(false);
    }
  }

  const filterUnits = (list) => {
    if (!list) return [];
    return list.filter(u => {
      const matchSearch = !search ||
        u.unitCode?.toLowerCase().includes(search.toLowerCase()) ||
        u.unitName?.toLowerCase().includes(search.toLowerCase());
      const matchRisk =
        riskFilter === 'all' ? true :
        riskFilter === 'critical' ? u.failRate >= 50 :
        riskFilter === 'high' ? u.failRate >= 30 && u.failRate < 50 :
        riskFilter === 'medium' ? u.failRate >= 15 && u.failRate < 30 :
        u.failRate < 15;
      return matchSearch && matchRisk;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-red-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading unit analytics…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center bg-white rounded-2xl p-8 shadow-sm border border-red-100">
          <p className="text-red-500 mb-3">{error}</p>
          <button onClick={fetchData} className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm">Retry</button>
        </div>
      </div>
    );
  }

  const { summary, topByFailRate, topByFailCount, topByRepeats, termTrend, worstPerformingUnits } = data;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'failrate', label: 'By Failure Rate', icon: '📉' },
    { id: 'repeats', label: 'Repeat Failures', icon: '🔄' },
    { id: 'worst', label: 'Critical Units', icon: '⚠️' },
  ];

  const activeList = activeTab === 'failrate' ? topByFailRate : activeTab === 'repeats' ? topByRepeats : activeTab === 'worst' ? worstPerformingUnits : [];

  // Calculate key insights
  const criticalUnits = topByFailRate?.filter(u => u.failRate >= 50).length || 0;
  const highRiskUnits = topByFailRate?.filter(u => u.failRate >= 30 && u.failRate < 50).length || 0;
  const avgFailRate = summary?.overallFailRate || 0;
  const totalFailures = summary?.totalFails || 0;
  const totalAttempts = summary?.totalAttempts || 0;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/view/dashboard" className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-600 font-medium transition-colors">
              ← Dashboard
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Unit Performance Analytics</h1>
              <p className="text-xs text-gray-500">Failure patterns, risk assessment & academic intervention insights</p>
            </div>
          </div>
          <button onClick={fetchData} className="px-4 py-2 bg-red-500 hover:bg-red-400 text-white rounded-xl text-sm font-medium transition-colors shadow-sm">
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        {/* Summary Cards with Trends */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <StatCard label="Total Units" value={summary?.totalUnits || 0} icon="📚" color="blue" />
          <StatCard label="Total Attempts" value={totalAttempts.toLocaleString()} icon="📝" color="slate" />
          <StatCard label="Total Failures" value={totalFailures.toLocaleString()} icon="❌" color="red" />
          <StatCard label="Overall Fail Rate" value={`${avgFailRate}%`} icon="📊" color="amber" trend={summary?.failRateChange} />
          <StatCard label="Critical Units" value={criticalUnits} sub="≥50% fail rate" icon="🔴" color="red" />
          <StatCard label="High Risk Units" value={highRiskUnits} sub="30-49% fail rate" icon="⚠️" color="amber" />
        </div>

        {/* Key Insight Banner */}
        <div className="bg-gradient-to-r from-red-50 to-amber-50 rounded-xl border border-red-100 p-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl">📊</div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Academic Insights</h3>
              <p className="text-xs text-gray-600 mt-1">
                {criticalUnits > 0 
                  ? `${criticalUnits} unit(s) have a failure rate above 50% — immediate curriculum review recommended. `
                  : `No units are above 50% failure rate. `}
                {avgFailRate > 25 
                  ? `Overall failure rate is ${avgFailRate}%, above the target threshold of 25%. Consider academic support programs.`
                  : `Overall failure rate is ${avgFailRate}%, within acceptable range.`}
                {totalFailures > 1000 && ` ${totalFailures.toLocaleString()} total failures recorded across all units.`}
              </p>
            </div>
          </div>
        </div>

        {/* Line Chart - Failure Rate Trend */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <FailureTrendLineChart 
            data={termTrend || []} 
            title="Overall Failure Rate Trend (Last 6 Terms)"
          />
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-400">
            <span>📈 Rising trend indicates increasing difficulty or declining student preparedness</span>
            <span>🎯 Target: Failure rate below 30%</span>
          </div>
        </div>

        {/* Tabs & Filters */}
        <div>
          <div className="flex flex-wrap gap-3 items-center mb-5">
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-white text-red-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {activeTab !== 'overview' && (
              <>
                <input
                  type="text"
                  placeholder="Search unit code or name..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-red-400 w-52"
                />
                <select
                  value={riskFilter}
                  onChange={e => setRiskFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:border-red-400"
                >
                  <option value="all">All Risk Levels</option>
                  <option value="critical">Critical (≥50%)</option>
                  <option value="high">High Risk (30-49%)</option>
                  <option value="medium">Medium (15-29%)</option>
                  <option value="low">Low (&lt;15%)</option>
                </select>
              </>
            )}
          </div>

          {/* Overview Tab - Summary Stats */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Risk Distribution</h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Critical (≥50%)</span>
                      <span>{criticalUnits} units</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full">
                      <div className="h-full bg-red-500 rounded-full" style={{ width: `${(criticalUnits / summary.totalUnits) * 100}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>High Risk (30-49%)</span>
                      <span>{highRiskUnits} units</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(highRiskUnits / summary.totalUnits) * 100}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Medium Risk (15-29%)</span>
                      <span>{topByFailRate?.filter(u => u.failRate >= 15 && u.failRate < 30).length || 0} units</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full">
                      <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${((topByFailRate?.filter(u => u.failRate >= 15 && u.failRate < 30).length || 0) / summary.totalUnits) * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Actionable Recommendations</h3>
                <div className="space-y-3">
                  {criticalUnits > 0 && (
                    <div className="flex items-start gap-2 p-2 bg-red-50 rounded-lg">
                      <span className="text-red-500">🔴</span>
                      <p className="text-xs text-gray-700"><strong>Immediate Review:</strong> {criticalUnits} unit(s) exceed 50% failure rate. Schedule curriculum review.</p>
                    </div>
                  )}
                  {highRiskUnits > 0 && (
                    <div className="flex items-start gap-2 p-2 bg-amber-50 rounded-lg">
                      <span className="text-amber-500">⚠️</span>
                      <p className="text-xs text-gray-700"><strong>Intervention Needed:</strong> {highRiskUnits} unit(s) at high risk. Consider additional tutoring sessions.</p>
                    </div>
                  )}
                  <div className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg">
                    <span className="text-blue-500">📋</span>
                    <p className="text-xs text-gray-700"><strong>Data-Driven Actions:</strong> Review failed unit patterns, identify struggling student cohorts.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Table Views */}
          {activeTab !== 'overview' && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Unit Code</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Unit Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Risk Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Pass / Fail</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Fail Rate</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Attempts</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Repeats</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Impact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filterUnits(activeList || []).map(u => (
                      <tr
                        key={u.unitID}
                        className={`hover:bg-red-50/30 transition-colors cursor-pointer ${expanded === u.unitID ? 'bg-red-50/20' : ''}`}
                        onClick={() => setExpanded(expanded === u.unitID ? null : u.unitID)}
                      >
                        <td className="px-4 py-3 font-mono text-xs font-bold text-gray-700">{u.unitCode}</td>
                        <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate text-xs">{u.unitName}</td>
                        <td className="px-4 py-3"><RiskBadge rate={u.failRate} /></td>
                        <td className="px-4 py-3 w-40"><FailRateBar passCount={u.passCount} failCount={u.failCount} /></td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm font-bold ${u.failRate >= 50 ? 'text-red-600' : u.failRate >= 30 ? 'text-amber-600' : u.failRate >= 15 ? 'text-yellow-600' : 'text-emerald-600'}`}>
                            {u.failRate}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-gray-500">{u.totalAttempts}</td>
                        <td className="px-4 py-3 text-center">
                          {u.repeatCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-600">{u.repeatCount}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-xs">
                          <span className="font-mono">{Math.round((u.failCount / summary.totalFails) * 100)}%</span>
                          <span className="text-gray-400 text-[10px] ml-1">of total</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filterUnits(activeList || []).length === 0 && (
                  <div className="text-center py-12 text-gray-400 text-sm">No units match the current filters</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="text-center text-xs text-gray-400 pt-4 border-t border-gray-200">
          <p>Data reflects all recorded unit attempts. Units with &lt;10 total attempts may have statistical variance.</p>
          <p className="mt-1">Last updated: {new Date().toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}