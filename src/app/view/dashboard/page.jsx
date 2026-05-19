'use client';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
	BookOpenIcon,
	AcademicCapIcon,
	UserIcon,
	CalendarIcon,
	ChartBarIcon,
	UserGroupIcon,
	CogIcon,
	ArrowTrendingUpIcon,
	CheckBadgeIcon,
	HomeIcon,
	SparklesIcon,
	ArrowRightIcon,
	ClockIcon,
	ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { ArrowRightIcon as ArrowRightSolid } from '@heroicons/react/24/solid';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import { ConditionalRequireAuth } from '@components/helper';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import { useRole } from '@app/context/RoleContext';
import { useLightDarkMode } from '@app/context/LightDarkMode';

// Helper to format numbers with separators
const formatNumber = (num) => num?.toLocaleString() || 0;

// Animated counter component
const AnimatedCounter = ({ value, duration = 800, theme }) => {
	const [displayValue, setDisplayValue] = useState(0);
	const previousValue = useRef(0);
	const animationRef = useRef(null);

	useEffect(() => {
		previousValue.current = displayValue;
		const startValue = previousValue.current;
		const endValue = value || 0;
		const startTime = performance.now();

		const animate = (currentTime) => {
			const elapsed = currentTime - startTime;
			const progress = Math.min(1, elapsed / duration);
			const easeOutQuad = 1 - (1 - progress) * (1 - progress);
			const current = startValue + (endValue - startValue) * easeOutQuad;
			setDisplayValue(Math.floor(current));

			if (progress < 1) {
				animationRef.current = requestAnimationFrame(animate);
			} else {
				setDisplayValue(endValue);
			}
		};

		if (animationRef.current) {
			cancelAnimationFrame(animationRef.current);
		}
		animationRef.current = requestAnimationFrame(animate);

		return () => {
			if (animationRef.current) {
				cancelAnimationFrame(animationRef.current);
			}
		};
	}, [value, duration]);

	return (
		<p className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
			{formatNumber(displayValue)}
		</p>
	);
};

// Skeleton loader for stats cards
const StatsSkeleton = ({ theme }) => (
	<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
		{[...Array(4)].map((_, i) => (
			<div
				key={i}
				className={`${theme === 'dark' ? 'bg-gray-800/50' : 'bg-white/80'} backdrop-blur-sm rounded-2xl shadow-sm p-6 animate-pulse border ${theme === 'dark' ? 'border-gray-700' : 'border-gray-100'}`}
			>
				<div className="flex items-center justify-between">
					<div className="space-y-3 flex-1">
						<div className={`h-4 w-24 rounded-full ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`} />
						<div className={`h-8 w-20 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`} />
					</div>
					<div className={`p-3 rounded-xl ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
						<div className="h-6 w-6 rounded-full bg-gray-400/30" />
					</div>
				</div>
			</div>
		))}
	</div>
);

// Stat card component for cleaner code
const StatCard = ({ label, value, icon: Icon, gradient, colorClasses, theme, isLoading }) => (
	<div
		className={`group relative overflow-hidden rounded-2xl ${theme === 'dark' ? 'bg-gray-800/70' : 'bg-white/80'} backdrop-blur-sm shadow-lg hover:shadow-2xl transition-all duration-200 hover:-translate-y-2 border ${theme === 'dark' ? 'border-gray-700/50' : 'border-white/50'} hover:border-${colorClasses.border}/30`}
	>
		{/* Animated gradient background on hover */}
		<div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-500`} />
		<div className={`absolute top-0 right-0 w-40 h-40 bg-gradient-to-br ${gradient} rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700 opacity-10`} />

		<div className="relative p-6">
			<div className="flex items-center justify-between">
				<div className="space-y-2">
					<p className={`text-sm font-semibold tracking-wide uppercase ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
						{label}
					</p>
					{isLoading ? (
						<div className={`h-8 w-24 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} animate-pulse`} />
					) : (
						<AnimatedCounter value={value} theme={theme} />
					)}
				</div>
				<div className={`p-3 rounded-xl ${colorClasses.iconBg} group-hover:scale-110 transition-transform duration-300 shadow-sm`}>
					<Icon className={`h-6 w-6 ${colorClasses.iconColor}`} />
				</div>
			</div>
			{/* Optional micro trend indicator */}
			{!isLoading && value > 0 && (
				<div className="absolute bottom-4 left-6 flex items-center gap-1 text-xs text-green-500 opacity-70">
					<ArrowTrendingUpIcon className="h-3 w-3" />
					<span>Active</span>
				</div>
			)}
		</div>
	</div>
);

const Dashboard = () => {
	const { can, isSuperadmin, role } = useRole();
	const { theme } = useLightDarkMode();
	const [stats, setStats] = useState({
		totalStudents: 0,
		totalUnits: 0,
		totalCourses: 0,
		activeTerms: 0,
	});
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		const fetchStats = async () => {
			try {
				setIsLoading(true);
				setError(null);
				const data = await fetchDashboardData();
				const statsData = data.data;
				setStats({
					totalStudents: statsData.student_count || 0,
					totalUnits: statsData.unit_count || 0,
					totalCourses: statsData.course_count || 0,
					activeTerms: statsData.term_count || 0,
				});
			} catch (error) {
				console.error('Error fetching dashboard statistics:', error);
				setError('Failed to load dashboard data');
			} finally {
				setIsLoading(false);
			}
		};

		if (can('dashboard', 'access')) {
			fetchStats();
		} else {
			setIsLoading(false);
		}
	}, [can]);

	const modules = useMemo(
		() => [
			{
				title: 'Units',
				description: 'Manage units, prerequisites, and unit types',
				icon: BookOpenIcon,
				permission: 'unit',
				isNew: true,
				links: [
					{ name: 'Unit Management', href: '/view/unit', permission: 'unit:read' },
					{ name: 'Unit Types', href: '/view/unit_type', permission: 'unit_type:read' },
				],
				gradient: 'from-blue-500 to-indigo-600',
				bgGradient: 'from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/10',
				iconBg: 'bg-transparent', // clear background
				iconColor: 'text-blue-600 dark:text-blue-400',
				borderColor: 'hover:border-blue-500/30',
			},
			{
				title: 'Courses',
				description: 'Manage courses, programs, and structures',
				icon: AcademicCapIcon,
				permission: 'course',
				links: [{ name: 'Course Management', href: '/view/course', permission: 'course:read' }],
				gradient: 'from-emerald-500 to-teal-600',
				bgGradient: 'from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/10',
				iconBg: 'bg-transparent',
				iconColor: 'text-emerald-600 dark:text-emerald-400',
				borderColor: 'hover:border-emerald-500/30',
			},
			{
				title: 'Students',
				description: 'View student information and study planners',
				icon: UserIcon,
				permission: 'student_info',
				links: [
					{ name: 'Student Management', href: '/view/student_information', permission: 'student_info:read' },
					{ name: 'Search by Student ID', href: '/view/search_student_study_planner', permission: 'search_students:read' },
				],
				gradient: 'from-purple-500 to-pink-600',
				bgGradient: 'from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/10',
				iconBg: 'bg-transparent',
				iconColor: 'text-purple-600 dark:text-purple-400',
				borderColor: 'hover:border-purple-500/30',
			},
			{
				title: 'Terms',
				description: 'Manage academic terms and semesters',
				icon: CalendarIcon,
				permission: 'term',
				links: [{ name: 'Term Management', href: '/view/terms', permission: 'term:read' }],
				gradient: 'from-orange-500 to-amber-600',
				bgGradient: 'from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/10',
				iconBg: 'bg-transparent',
				iconColor: 'text-orange-600 dark:text-orange-400',
				borderColor: 'hover:border-orange-500/30',
			},
			{
				title: 'Study Planner',
				description: 'Upload, compare, and manage study planners',
				icon: ChartBarIcon,
				permission: 'system',
				isNew: true,
				links: [
					{ name: 'Upload Study Planner', href: '/view/upload_planner', permission: 'planner:read' },
					{ name: 'Compare Completed Units', href: '/view/compare_study_planner', permission: 'planner:read' },
					{ name: 'Study Planner Management', href: '/view/study-planner', permission: 'planner:read' },
					{ name: 'Differentiate Study Planners', href: '/view/compare-planners', permission: 'planner:read' },
				],
				gradient: 'from-rose-500 to-red-600',
				bgGradient: 'from-rose-50 to-red-50 dark:from-rose-900/20 dark:to-red-900/10',
				iconBg: 'bg-transparent',
				iconColor: 'text-rose-600 dark:text-rose-400',
				borderColor: 'hover:border-rose-500/30',
			},
			{
				title: 'Graduation',
				description: 'Track student eligibility and progress',
				icon: CheckBadgeIcon,
				permission: 'system',
				links: [{ name: 'Graduation Dashboard', href: '/view/graduation_dashboard', permission: 'planner:read' }],
				gradient: 'from-teal-500 to-cyan-600',
				bgGradient: 'from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/10',
				iconBg: 'bg-transparent',
				iconColor: 'text-teal-600 dark:text-teal-400',
				borderColor: 'hover:border-teal-500/30',
			},
			{
				title: 'Unit Analytics',
				description: 'Failure rates, repeat attempts & prerequisite chains',
				icon: ArrowTrendingUpIcon,
				permission: 'system',
				isNew: true,
				links: [
					{ name: 'Unit Performance Analytics', href: '/view/unit_analytics', permission: 'planner:read' },
					{ name: 'Unit Prerequisite Chain', href: '/view/prerequisite-chain', permission: 'planner:read' },
				],
				gradient: 'from-violet-500 to-purple-600',
				bgGradient: 'from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/10',
				iconBg: 'bg-transparent',
				iconColor: 'text-violet-600 dark:text-violet-400',
				borderColor: 'hover:border-violet-500/30',
			},
			{
				title: 'User Management',
				description: 'Manage users, roles, and permissions',
				icon: UserGroupIcon,
				permission: 'user',
				links: [
					{ name: 'User Management', href: '/view/user_management', permission: 'users:read' },
					{ name: 'Role Management', href: '/view/roles', permission: 'role:read' },
				],
				gradient: 'from-indigo-500 to-blue-600',
				bgGradient: 'from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/10',
				iconBg: 'bg-transparent',
				iconColor: 'text-indigo-600 dark:text-indigo-400',
				borderColor: 'hover:border-indigo-500/30',
			},
			{
				title: 'System',
				description: 'System configuration and audit logs',
				icon: CogIcon,
				permission: 'system',
				links: [
					{ name: 'Audit Logs', href: '/view/audit_logs', permission: 'audit_logs:read' },
					{ name: 'User Management (Whitelist)', href: '/view/user_management', permission: 'users:read' },
				],
				gradient: 'from-gray-500 to-gray-600',
				bgGradient: 'from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-700/30',
				iconBg: 'bg-transparent',
				iconColor: 'text-gray-600 dark:text-gray-400',
				borderColor: 'hover:border-gray-500/30',
			},
		],
		[]
	);

	const filteredModules = useMemo(() => {
		const filtered = modules.filter((module) => {
			if (module.permission === 'system' && isSuperadmin()) return true;
			return module.links.some((link) => can(link.permission.split(':')[0], link.permission.split(':')[1]));
		});
		// Move new modules to the front, keep relative order
		const newModules = filtered.filter(m => m.isNew);
		const oldModules = filtered.filter(m => !m.isNew);
		return [...newModules, ...oldModules];
	}, [modules, can, isSuperadmin]);

const statCards = [
	{
		label: 'Total Students',
		value: stats.totalStudents,
		icon: UserIcon,
		gradient: 'from-blue-500 to-indigo-600',
		colorClasses: {
			iconBg: 'bg-transparent',                    // changed
			iconColor: 'text-blue-600 dark:text-blue-400',
			border: 'blue-500',
		},
	},
	{
		label: 'Total Units',
		value: stats.totalUnits,
		icon: BookOpenIcon,
		gradient: 'from-emerald-500 to-teal-600',
		colorClasses: {
			iconBg: 'bg-transparent',                    // changed
			iconColor: 'text-emerald-600 dark:text-emerald-400',
			border: 'emerald-500',
		},
	},
	{
		label: 'Total Courses',
		value: stats.totalCourses,
		icon: AcademicCapIcon,
		gradient: 'from-purple-500 to-pink-600',
		colorClasses: {
			iconBg: 'bg-transparent',                    // changed
			iconColor: 'text-purple-600 dark:text-purple-400',
			border: 'purple-500',
		},
	},
	{
		label: 'Active Terms',
		value: stats.activeTerms,
		icon: CalendarIcon,
		gradient: 'from-orange-500 to-amber-600',
		colorClasses: {
			iconBg: 'bg-transparent',                    // changed
			iconColor: 'text-orange-600 dark:text-orange-400',
			border: 'orange-500',
		},
	},
];

	return (
		<ConditionalRequireAuth>
			<PageLoadingWrapper
				requiredPermission={{ resource: 'dashboard', action: 'access' }}
				resourceName="dashboard"
				isLoading={isLoading && !error}
				loadingText="Loading dashboard..."
				error={error}
				errorMessage="Failed to load dashboard data"
			>
				<div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900' : 'bg-gradient-to-br from-gray-50 to-gray-100'}`}>
					{/* Background decorative elements */}
					<div className="fixed inset-0 overflow-hidden pointer-events-none">
						<div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-10 dark:opacity-5 animate-blob" />
						<div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-10 dark:opacity-5 animate-blob animation-delay-2000" />
						<div className="absolute top-1/2 left-1/2 w-80 h-80 bg-emerald-300 rounded-full mix-blend-multiply filter blur-3xl opacity-10 dark:opacity-5 animate-blob animation-delay-4000" />
					</div>

					<div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
						{/* Enhanced Hero Header */}
						<div className="mb-10">
							<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
								<div className="flex items-center gap-4">
									<div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-xl ring-4 ring-blue-500/20 dark:ring-blue-400/10">
										<HomeIcon className="h-7 w-7 text-white" />
									</div>
								</div>
								<div className="flex items-center gap-3">
									<span className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm shadow-sm border border-gray-200 dark:border-gray-700">
										<ShieldCheckIcon className="h-4 w-4 inline mr-1" />
										{isSuperadmin() ? 'Super Administrator' : 'Administrator'}
									</span>
								</div>
							</div>
						</div>

						{/* Stats Grid with Animated Counters */}
						{isLoading ? (
							<StatsSkeleton theme={theme} />
						) : (
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
								{statCards.map((card, idx) => (
									<StatCard
										key={idx}
										label={card.label}
										value={card.value}
										icon={card.icon}
										gradient={card.gradient}
										colorClasses={card.colorClasses}
										theme={theme}
										isLoading={isLoading}
									/>
								))}
							</div>
						)}

						{/* Modules Section with clear icon backgrounds and new modules on top */}
						<div>
							<div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-8 gap-4">
								<div>
									<h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
										System Modules
									</h2>
									<p className={`text-sm mt-1 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
										Access and manage core system features
									</p>
								</div>
								<div className="flex items-center gap-2">
									<SparklesIcon className={`h-4 w-4 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`} />
									<span className={`text-xs px-3 py-1 rounded-full ${theme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
										{filteredModules.length} available modules
									</span>
								</div>
							</div>

							{filteredModules.length > 0 ? (
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
									{filteredModules.map((module, index) => (
										<div
											key={index}
											className={`group relative overflow-hidden rounded-2xl ${theme === 'dark' ? 'bg-gray-800/70' : 'bg-white/80'} backdrop-blur-sm shadow-xl hover:shadow-2xl transition-all duration-200 hover:-translate-y-2 border ${theme === 'dark' ? 'border-gray-700/50' : 'border-white/50'} ${module.borderColor}`}
										>
											{/* Animated gradient overlay */}
											<div className={`absolute inset-0 bg-gradient-to-br ${module.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-500`} />
											<div className={`absolute top-0 left-0 w-32 h-32 bg-gradient-to-br ${module.gradient} rounded-full -translate-x-1/2 -translate-y-1/2 group-hover:scale-150 transition-transform duration-700 opacity-20`} />

											<div className="relative p-6">
												<div className="flex items-start gap-4 mb-5">
													<div className={`p-3 rounded-2xl ${module.iconBg} backdrop-blur-xl border border-white/10 shadow-lg shadow-black/5 group-hover:scale-110 group-hover:rotate-3 transition-all duration-100`}>
														<module.icon className={`h-7 w-7 ${module.iconColor}`} />
													</div>
													<div className="flex-1">
														<div className="flex items-center gap-2 flex-wrap">
															<h3 className={`text-xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
																{module.title}
															</h3>
															{module.isNew && (
																<span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-sm animate-pulse">
																	NEW
																</span>
															)}
														</div>
														<p className={`text-sm mt-1.5 leading-relaxed ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
															{module.description}
														</p>
													</div>
												</div>

												<div className="space-y-2.5 pt-3 border-t border-gray-200 dark:border-gray-700">
													{module.links
														.filter((link) => {
															if (module.permission === 'system' && isSuperadmin()) return true;
															return can(link.permission.split(':')[0], link.permission.split(':')[1]);
														})
														.map((link, linkIndex) => (
															<Link
																key={linkIndex}
																href={link.href}
																className={`group/link flex items-center justify-between text-sm ${theme === 'dark' ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'} hover:translate-x-1 transition-all duration-100 py-1.5 px-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50`}
															>
																<div className="flex items-center gap-2.5">
																	<span className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${module.gradient} opacity-60 group-hover/link:opacity-100 transition-all`} />
																	<span>{link.name}</span>
																</div>
																<ArrowRightIcon className="h-3.5 w-3.5 opacity-0 group-hover/link:opacity-100 transition-all transform group-hover/link:translate-x-0.5" />
															</Link>
														))}
												</div>
											</div>

											{/* Decorative corner accent */}
											<div className={`absolute bottom-0 right-0 w-16 h-16 bg-gradient-to-tl ${module.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-500 rounded-tl-3xl`} />
										</div>
									))}
								</div>
							) : (
								<div className="text-center py-20 rounded-2xl bg-white/50 dark:bg-gray-800/30 backdrop-blur-sm border border-gray-200 dark:border-gray-700">
									<div className={`inline-flex p-5 rounded-full ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'} mb-5`}>
										<CogIcon className={`h-10 w-10 ${theme === 'dark' ? 'text-gray-600' : 'text-gray-400'}`} />
									</div>
									<h3 className={`text-xl font-medium mb-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
										No modules available
									</h3>
									<p className={`text-sm max-w-sm mx-auto ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
										You don't have permission to access any system modules. Please contact your administrator if you believe this is an error.
									</p>
								</div>
							)}
						</div>
					</div>
				</div>

				<style jsx>{`
          @keyframes blob {
            0% { transform: translate(0px, 0px) scale(1); }
            33% { transform: translate(30px, -50px) scale(1.1); }
            66% { transform: translate(-20px, 20px) scale(0.9); }
            100% { transform: translate(0px, 0px) scale(1); }
          }
          .animate-blob {
            animation: blob 7s infinite;
          }
          .animation-delay-2000 {
            animation-delay: 2s;
          }
          .animation-delay-4000 {
            animation-delay: 4s;
          }
        `}</style>
			</PageLoadingWrapper>
		</ConditionalRequireAuth>
	);
};

export default Dashboard;

// Fixed fetch function with proper error handling and timeout
async function fetchDashboardData() {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 15000);

	try {
		const response = await SecureFrontendAuthHelper.authenticatedFetch(
			`${process.env.NEXT_PUBLIC_SERVER_URL}/api/dashboard`,
			{
				signal: controller.signal,
			}
		);

		clearTimeout(timeoutId);

		if (!response.ok) {
			const error = await response.json().catch(() => ({ message: 'Failed to fetch dashboard data' }));
			throw new Error(error.message || 'Failed to fetch dashboard data');
		}

		const data = await response.json();
		return data;
	} catch (error) {
		clearTimeout(timeoutId);
		if (error.name === 'AbortError') {
			throw new Error('Request timeout: Dashboard data fetch took too long');
		}
		throw error;
	}
}