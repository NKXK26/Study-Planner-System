'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
	BookOpenIcon,
	AcademicCapIcon,
	UserIcon,
	CalendarIcon,
	ChartBarIcon,
	ClipboardDocumentListIcon,
	UserGroupIcon,
	ClockIcon,
	ShieldCheckIcon,
	CogIcon,
	SparklesIcon
} from '@heroicons/react/24/outline';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import { ConditionalRequireAuth } from '@components/helper';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import { useRole } from '@app/context/RoleContext';
import { useLightDarkMode } from '@app/context/LightDarkMode';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';

const Dashboard = () => {
	const { can, isSuperadmin } = useRole();
	const { theme } = useLightDarkMode();
	const [stats, setStats] = useState({
		totalStudents: 0,
		totalUnits: 0,
		totalCourses: 0,
		activeTerms: 0
	});
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		const FetchStats = async () => {
			try {
				setIsLoading(true);
				setError(null);
				const data = await FetchDashboarData();

				const stats = data.data;
				const totalStudents = stats.student_count;

				const totalUnits = stats.unit_count;

				const totalCourses = stats.course_count;

				const activeTerms = stats.term_count;

				setStats({
					totalStudents,
					totalUnits,
					totalCourses,
					activeTerms
				});
			} catch (error) {
				console.error('Error fetching dashboard statistics:', error);
				setError('Failed to load dashboard data');
			} finally {
				setIsLoading(false);
			}
		};

		// Only fetch stats if user has dashboard access permission
		if (can('dashboard', 'access')) {
			FetchStats();
		} else {
			setIsLoading(false);
		}
	}, [can]);

	const modules = [
		{
			title: "Units",
			description: "Manage units and unit types",
			icon: BookOpenIcon,
			permission: "unit",
			links: [
				{ name: "Unit Management", href: "/view/unit", permission: "unit:read" },
				{ name: "Unit Types", href: "/view/unit_type", permission: "unit_type:read" }
			],
			color: "text-[#dc2d27]",
			bgColor: "bg-[#dc2d27]/5"
		},
		{
			title: "Courses",
			description: "Manage courses and programs",
			icon: AcademicCapIcon,
			permission: "course",
			links: [
				{ name: "Course Management", href: "/view/course", permission: "course:read" }
			],
			color: "text-blue-600",
			bgColor: "bg-blue-50"
		},
		{
			title: "Students",
			description: "Manage student information and study planners",
			icon: UserIcon,
			permission: "student_info",
			links: [
				{ name: "Student Management", href: "/view/student_information", permission: "student_info:read" },
				{ name: "Search By Student ID", href: "/view/search_student_study_planner", permission: "search_students:read" }
			],
			color: "text-green-600",
			bgColor: "bg-green-50"
		},
		{
			title: "Terms",
			description: "Manage academic terms and semesters",
			icon: CalendarIcon,
			permission: "term",
			links: [
				{ name: "Term Management", href: "/view/terms", permission: "term:read" }
			],
			color: "text-purple-600",
			bgColor: "bg-purple-50"
		},
		{
			title: "Reports",
			description: "Generate reports and analytics",
			icon: ChartBarIcon,
			permission: "reports",
			links: [
				{ name: "Student Reports", href: "/reports/students", permission: "reports:read" },
				{ name: "Course Reports", href: "/reports/courses", permission: "reports:read" }
			],
			color: "text-orange-600",
			bgColor: "bg-orange-50"
		},
		{
			title: "User Management",
			description: "Manage users and roles",
			icon: UserGroupIcon,
			permission: "user",
			links: [
				{ name: "User Management", href: "/view/user_management", permission: "users:read" },
				{ name: "Role Management", href: "/view/roles", permission: "role:read" }
			],
			color: "text-pink-600",
			bgColor: "bg-pink-50"
		},
		{
			title: "System",
			description: "System configuration and settings",
			icon: CogIcon,
			permission: "system",
			links: [
				{ name: "Audit Logs", href: "/view/audit_logs", permission: "audit_logs:read" },
				{ name: "User Management (Whitelist)", href: "/view/user_management", permission: "users:read" }
			],
			color: "text-gray-600",
			bgColor: "bg-gray-50"
		},
		{
			title: "Study Planner",
			description: "Upload new study planners",
			icon: ChartBarIcon,
			permission: "system",
			links: [
				{ name: "Upload Study Planner", href: "/view/upload_planner", permission: "planner:read" },
				{ name: "Compare Study Planner", href: "/view/compare_study_planner", permission: "planner:read" },
			],
			color: "text-blue-600",
			bgColor: "bg-blue-50"
		},
		{
			title: "Graduation Dashboard",
			description: "Student eligibility & progress tracking",
			icon: ChartBarIcon,
			permission: "system",
			links: [
				{ name: "Graduation Dashboard", href: "/view/graduation-dashboard", permission: "planner:read" },
			],
			color: "text-emerald-600",
			bgColor: "bg-emerald-50"
		},
		{
			title: "Unit Analytics",
			description: "Failure rates, repeat attempts & term trends",
			icon: ChartBarIcon,
			permission: "system",
			links: [
				{ name: "Unit Performance Analytics", href: "/view/unit_analytics", permission: "planner:read" },
			],
			color: "text-red-600",
			bgColor: "bg-red-50"
		},

	];

	// Filter modules based on user permissions
	const filteredModules = modules.filter(module => {
		// Special case: Show System module for Superadmins
		if (module.permission === "system" && isSuperadmin()) {
			return true;
		}
		// Check if user has any permission for this module
		return module.links.some(link => can(link.permission.split(':')[0], link.permission.split(':')[1]));
	});

	// Check if user is authenticated AND has permission to access dashboard

	return (
		<ConditionalRequireAuth>
			<PageLoadingWrapper
				requiredPermission={{ resource: 'dashboard', action: 'access' }}
				resourceName="dashboard"
				isLoading={isLoading}
				loadingText="Loading dashboard..."
				error={error}
				errorMessage="Failed to load dashboard data"
			>
				<div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`}>
					<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 bg-white dark:bg-transparent">
						{/* Header */}
						<div className="mb-8">
							<h1 className={`text-3xl font-bold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>Dashboard</h1>
							<p className={`mt-2 ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
								Welcome to the Student Study Planner System
							</p>
						</div>

						{/* Statistics Cards */}
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
							<div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-6`}>
								<div className="flex items-center">
									<div className={`p-2 ${theme === 'dark' ? 'bg-blue-900/30' : 'bg-blue-100'} rounded-lg`}>
										<UserIcon className="h-6 w-6 text-blue-600" />
									</div>
									<div className="ml-4">
										<p className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Total Students</p>
										<p className={`text-2xl font-semibold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{stats.totalStudents}</p>
									</div>
								</div>
							</div>

							<div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-6`}>
								<div className="flex items-center">
									<div className={`p-2 ${theme === 'dark' ? 'bg-green-900/30' : 'bg-green-100'} rounded-lg`}>
										<BookOpenIcon className="h-6 w-6 text-green-600" />
									</div>
									<div className="ml-4">
										<p className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Total Units</p>
										<p className={`text-2xl font-semibold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{stats.totalUnits}</p>
									</div>
								</div>
							</div>

							<div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-6`}>
								<div className="flex items-center">
									<div className={`p-2 ${theme === 'dark' ? 'bg-purple-900/30' : 'bg-purple-100'} rounded-lg`}>
										<AcademicCapIcon className="h-6 w-6 text-purple-600" />
									</div>
									<div className="ml-4">
										<p className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Total Courses</p>
										<p className={`text-2xl font-semibold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{stats.totalCourses}</p>
									</div>
								</div>
							</div>

							<div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow p-6`}>
								<div className="flex items-center">
									<div className={`p-2 ${theme === 'dark' ? 'bg-orange-900/30' : 'bg-orange-100'} rounded-lg`}>
										<CalendarIcon className="h-6 w-6 text-orange-600" />
									</div>
									<div className="ml-4">
										<p className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>Active Terms</p>
										<p className={`text-2xl font-semibold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{stats.activeTerms}</p>
									</div>
								</div>
							</div>
						</div>

						{/* Main Modules */}
						<div>
							<h2 className={`text-xl font-semibold mb-4 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>System Modules</h2>
							{filteredModules.length > 0 ? (
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
									{filteredModules.map((module, index) => {
										return (
											<div
												key={index}
												className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow transition-shadow duration-200 hover:shadow-md`}
											>
												<div className="p-6">
													<div className="flex items-center mb-4">
														<div className={`p-3 ${theme === 'dark' ? 'bg-white/10' : module.bgColor} rounded-lg`}>
															<module.icon className={`h-8 w-8 ${module.color}`} />
														</div>
														<div className="ml-4">
															<h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
																{module.title}
															</h3>
															<p className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
																{module.description}
															</p>
														</div>
													</div>
													<div className="space-y-2">
														{module.links
															.filter(link => {
																// Special case: System module links for Superadmin
																if (module.permission === "system" && isSuperadmin()) {
																	return true;
																}
																// For other links, check permission
																return can(link.permission.split(':')[0], link.permission.split(':')[1]);
															})
															.map((link, linkIndex) => (
																<Link
																	key={linkIndex}
																	href={link.href}
																	className={`block text-sm hover:underline ${theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'}`}
																>
																	{link.name}
																</Link>
															))}
													</div>
												</div>
											</div>
										);
									})}
								</div>
							) : (
								<div className="text-center py-12">
									<div className={`${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'} mb-4`}>
										<svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
										</svg>
									</div>
									<h3 className={`text-lg font-medium mb-2 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>No modules available</h3>
									<p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>You don't have permission to access any system modules.</p>
								</div>
							)}
						</div>
					</div>
				</div>

				{/* Floating AI Assistant Button */}
				<Link
					href="/view/ai-assistant"
					className={`fixed bottom-6 right-6 p-4 rounded-full shadow-lg transition-all duration-200 hover:scale-110 z-50 ${theme === 'dark'
						? 'bg-gradient-to-br from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500'
						: 'bg-gradient-to-br from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600'
						} text-white flex items-center justify-center w-14 h-14 group`}
					title="AI Study Planner Assistant"
				>
					<SparklesIcon className="h-6 w-6 transition-transform group-hover:rotate-12" />
				</Link>
			</PageLoadingWrapper>
		</ConditionalRequireAuth>
	);
};

export default Dashboard;

async function FetchDashboarData() {
	const response = await SecureFrontendAuthHelper.authenticatedFetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/dashboard`);

	if (!response.ok) {
		const error = await response.json();
		return {
			success: false,
			message: error.message || 'Failed to fetch data',
			filtered: error.filtered || false,
			data: data
		};
	}

	const data = await response.json();

	return data;

}