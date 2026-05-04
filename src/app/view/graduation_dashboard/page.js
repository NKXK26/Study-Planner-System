'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

// ── Helpers ───────────────────────────────────────────────────────────────────
function pct(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function statusColor(status) {
  const s = status?.toLowerCase();
  if (s === 'active')   return 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (s === 'inactive') return 'text-red-500    bg-red-50    border-red-200';
  return 'text-gray-500 bg-gray-50 border-gray-200';
}

// ── Summary card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent, icon }) {
  const accents = {
    blue:    'from-blue-500   to-indigo-600',
    green:   'from-emerald-400 to-teal-500',
    amber:   'from-amber-400   to-orange-500',
    red:     'from-red-400     to-rose-500',
    purple:  'from-violet-500  to-purple-600',
    slate:   'from-slate-400   to-slate-600',
  };
  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden p-5">
      <div className={`absolute top-0 left-0 w-1 h-full bg-gradient-to-b ${accents[accent] || accents.blue}`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
          <p className="text-3xl font-bold text-gray-800 leading-none">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
        </div>
        <span className="text-2xl opacity-60">{icon}</span>
      </div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ percent }) {
  const getColor = () => {
    if (percent >= 100) return 'bg-emerald-500';
    if (percent >= 60) return 'bg-indigo-500';
    if (percent >= 30) return 'bg-amber-400';
    return 'bg-red-400';
  };
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${getColor()}`}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}

// ── Pipeline bar (graduation funnel) ─────────────────────────────────────────
function PipelineBar({ label, count, total, color }) {
  const width = pct(count, total);
  const colors = {
    red:    { bar: 'bg-red-400',     text: 'text-red-600',    bg: 'bg-red-50'    },
    amber:  { bar: 'bg-amber-400',   text: 'text-amber-600',  bg: 'bg-amber-50'  },
    blue:   { bar: 'bg-blue-400',    text: 'text-blue-600',   bg: 'bg-blue-50'   },
    indigo: { bar: 'bg-indigo-500',  text: 'text-indigo-600', bg: 'bg-indigo-50' },
    green:  { bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  };
  const c = colors[color] || colors.blue;
  return (
    <div className={`rounded-xl p-3 ${c.bg} border border-opacity-30`}>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-semibold text-gray-600">{label}</span>
        <span className={`text-sm font-bold ${c.text}`}>{count} <span className="text-xs font-normal text-gray-400">({width}%)</span></span>
      </div>
      <div className="w-full h-2 bg-white/60 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default function GraduationDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [filterCourse, setFilterCourse] = useState('all');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const res = await SecureFrontendAuthHelper.authenticatedFetch('/api/graduation-dashboard');
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.message || 'Failed to load data');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Failed to load graduation data. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const filterStudents = (list) => {
    if (!list) return [];
    return list.filter(s => {
      const matchSearch = !search ||
        String(s.studentID).toLowerCase().includes(search.toLowerCase()) ||
        s.name?.toLowerCase().includes(search.toLowerCase()) ||
        s.course?.toLowerCase().includes(search.toLowerCase());
      const matchCourse = filterCourse === 'all' || s.course === filterCourse;
      return matchSearch && matchCourse;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading graduation data…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30 flex items-center justify-center">
        <div className="text-center bg-white rounded-2xl p-8 shadow-sm border border-red-100">
          <p className="text-red-500 mb-3">⚠️ {error}</p>
          <button onClick={fetchData} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30 flex items-center justify-center">
        <div className="text-center bg-white rounded-2xl p-8 shadow-sm">
          <p className="text-gray-500">No data available</p>
        </div>
      </div>
    );
  }

  const { summary, completionBuckets, courseStats, atRiskStudents, eligibleStudents } = data;
  const courses = [...new Set([...(atRiskStudents || []), ...(eligibleStudents || [])].map(s => s?.course).filter(Boolean))];

  const tabs = [
    { id: 'overview',  label: 'Overview',        icon: '📊' },
    { id: 'atrisk',    label: `At Risk (${summary?.atRiskCount || 0})`,   icon: '⚠️' },
    { id: 'eligible',  label: `Eligible (${summary?.eligibleCount || 0})`, icon: '✅' },
    { id: 'courses',   label: 'By Course',       icon: '🎓' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/20">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/view/dashboard" className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-600 font-medium transition-colors">
              ← Back
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-800">Graduation Dashboard</h1>
              <p className="text-xs text-gray-400">Student eligibility & progress tracking</p>
            </div>
          </div>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          <StatCard label="Total Students"   value={summary?.totalStudents || 0}   icon="👥" accent="slate"  sub="enrolled" />
          <StatCard label="Eligible"         value={summary?.eligibleCount || 0}   icon="🎓" accent="green"  sub={`${summary?.graduationRate || 0}% of total`} />
          <StatCard label="At Risk"          value={summary?.atRiskCount || 0}     icon="⚠️" accent="amber"  sub="need attention" />
          <StatCard label="On Track"         value={summary?.onTrackCount || 0}    icon="📈" accent="blue"   sub="progressing well" />
          <StatCard label="Overdue"          value={summary?.overdueCount || 0}    icon="🔴" accent="red"    sub="inactive + incomplete" />
          <StatCard label="Avg Completion"   value={`${summary?.avgCompletion || 0}%`} icon="📊" accent="purple" sub="across all students" />
        </div>

        {/* Graduation pipeline */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Credit Completion Pipeline</h2>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <PipelineBar label="0 – 25%"   count={completionBuckets?.['0-25'] || 0}  total={summary?.totalStudents || 1} color="red" />
            <PipelineBar label="26 – 50%"  count={completionBuckets?.['26-50'] || 0} total={summary?.totalStudents || 1} color="amber" />
            <PipelineBar label="51 – 75%"  count={completionBuckets?.['51-75'] || 0} total={summary?.totalStudents || 1} color="blue" />
            <PipelineBar label="76 – 99%"  count={completionBuckets?.['76-99'] || 0} total={summary?.totalStudents || 1} color="indigo" />
            <PipelineBar label="Complete"  count={completionBuckets?.hundred || completionBuckets?.['100'] || 0} total={summary?.totalStudents || 1} color="green" />
          </div>
        </div>

        {/* Tabs */}
        <div>
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === t.id
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Overview tab */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Graduation Rate</h3>
                <div className="flex items-center gap-8">
                  <div className="relative w-28 h-28 flex-shrink-0">
                    <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                      <circle
                        cx="18" cy="18" r="15.9" fill="none"
                        stroke="#6366f1" strokeWidth="3"
                        strokeDasharray={`${summary?.graduationRate || 0} ${100 - (summary?.graduationRate || 0)}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-gray-800">{summary?.graduationRate || 0}%</span>
                      <span className="text-xs text-gray-400">eligible</span>
                    </div>
                  </div>
                  <div className="space-y-2 flex-1">
                    {[
                      { label: 'Eligible to Graduate', count: summary?.eligibleCount || 0, color: 'bg-indigo-500' },
                      { label: 'On Track', count: summary?.onTrackCount || 0, color: 'bg-blue-400' },
                      { label: 'At Risk', count: summary?.atRiskCount || 0, color: 'bg-amber-400' },
                      { label: 'Overdue', count: summary?.overdueCount || 0, color: 'bg-red-400' },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${item.color}`} />
                        <span className="text-xs text-gray-600 flex-1">{item.label}</span>
                        <span className="text-xs font-bold text-gray-800">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">By Course</h3>
                <div className="space-y-2">
                  {(courseStats || []).slice(0, 6).map(c => (
                    <div key={c.courseCode} className="flex items-center gap-3">
                      <div className="w-16 text-xs font-bold text-gray-700 truncate">{c.courseCode}</div>
                      <div className="flex-1">
                        <div className="flex gap-0.5 h-4">
                          <div className="bg-emerald-400 rounded-l" style={{ width: `${pct(c.eligible, c.total)}%`, minWidth: c.eligible > 0 ? '4px' : '0' }} />
                          <div className="bg-blue-400" style={{ width: `${pct(c.onTrack, c.total)}%`, minWidth: c.onTrack > 0 ? '4px' : '0' }} />
                          <div className="bg-amber-400" style={{ width: `${pct(c.atRisk, c.total)}%`, minWidth: c.atRisk > 0 ? '4px' : '0' }} />
                          <div className="bg-red-400 rounded-r" style={{ width: `${pct(c.overdue, c.total)}%`, minWidth: c.overdue > 0 ? '4px' : '0' }} />
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 w-8 text-right">{c.total}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* At Risk tab */}
          {activeTab === 'atrisk' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex flex-wrap gap-3 items-center">
                <h3 className="text-sm font-bold text-gray-700 flex-1">At-Risk Students</h3>
                <input
                  type="text" placeholder="Search by ID or name…" value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 w-48"
                />
                <select
                  value={filterCourse} onChange={e => setFilterCourse(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                >
                  <option value="all">All Courses</option>
                  {courses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Student ID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Course</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Major</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Completion</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Failures</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Credits Left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterStudents(atRiskStudents || []).map(s => (
                      <tr key={s.studentID} className="hover:bg-amber-50/40 border-b border-gray-50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.studentID}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{s.course}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{s.major}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(s.status)}`}>{s.status}</span>
                        </td>
                        <td className="px-4 py-3 min-w-[100px]">
                          <div className="flex items-center gap-2">
                            <ProgressBar percent={s.completionPercent} />
                            <span className="text-xs font-bold text-gray-600 w-8">{s.completionPercent}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {s.failureCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">{s.failureCount}</span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-gray-500">{s.creditsRemaining}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filterStudents(atRiskStudents || []).length === 0 && (
                  <div className="text-center py-12 text-gray-400 text-sm">No at-risk students found</div>
                )}
              </div>
            </div>
          )}

          {/* Eligible tab */}
          {activeTab === 'eligible' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 flex flex-wrap gap-3 items-center">
                <h3 className="text-sm font-bold text-gray-700 flex-1">Eligible to Graduate</h3>
                <input
                  type="text" placeholder="Search…" value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400 w-48"
                />
                <select
                  value={filterCourse} onChange={e => setFilterCourse(e.target.value)}
                  className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-400"
                >
                  <option value="all">All Courses</option>
                  {courses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Student ID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Course</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Major</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Credits Done</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Required</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Failures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterStudents(eligibleStudents || []).map(s => (
                      <tr key={s.studentID} className="hover:bg-emerald-50/40 border-b border-gray-50">
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.studentID}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{s.course}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{s.major}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(s.status)}`}>{s.status}</span>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono font-bold text-emerald-600">{s.creditsCompleted}</td>
                        <td className="px-4 py-3 text-xs font-mono text-gray-400">{s.creditsRequired}</td>
                        <td className="px-4 py-3 text-center">
                          {s.failureCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-600">{s.failureCount}</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-600">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filterStudents(eligibleStudents || []).length === 0 && (
                  <div className="text-center py-12 text-gray-400 text-sm">No eligible students found</div>
                )}
              </div>
            </div>
          )}

          {/* Courses tab */}
          {activeTab === 'courses' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {(courseStats || []).map(c => (
                <div key={c.courseCode} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold text-gray-800">{c.courseCode}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{c.courseName}</p>
                    </div>
                    <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">{c.total} students</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: 'Eligible', count: c.eligible, color: 'bg-emerald-500', text: 'text-emerald-700' },
                      { label: 'On Track', count: c.onTrack, color: 'bg-blue-400', text: 'text-blue-600' },
                      { label: 'At Risk', count: c.atRisk, color: 'bg-amber-400', text: 'text-amber-600' },
                      { label: 'Overdue', count: c.overdue, color: 'bg-red-400', text: 'text-red-500' },
                    ].map(row => (
                      <div key={row.label} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-16">{row.label}</span>
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${row.color}`} style={{ width: `${pct(row.count, c.total)}%` }} />
                        </div>
                        <span className={`text-xs font-bold w-6 text-right ${row.text}`}>{row.count}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-400">
                    <span>Graduation rate</span>
                    <span className="font-bold text-gray-700">{pct(c.eligible, c.total)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}