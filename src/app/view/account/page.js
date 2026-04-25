'use client';
import { useState, useEffect } from 'react';
import { useRole } from '@app/context/RoleContext';
import { useLightDarkMode } from '@app/context/LightDarkMode';
import { ConditionalRequireAuth } from '@components/helper';
import {
    HomeIcon,
    BookOpenIcon,
    AcademicCapIcon,
    UserIcon,
    CalendarIcon,
    UserGroupIcon,
    ShieldCheckIcon,
    MagnifyingGlassIcon,
    ClipboardDocumentListIcon
} from '@heroicons/react/24/outline';

export default function AccountPage() {
    const [userProfile, setUserProfile] = useState(null);
    const [accessiblePages, setAccessiblePages] = useState([]);
    const { can, selectedRoleName, userActualRoles, canSwitchRoles, isSuperadmin } = useRole();
    const { theme, mounted } = useLightDarkMode();

    useEffect(() => {
        // Get user profile from localStorage
        const profile = localStorage.getItem('userProfile');
        if (profile) {
            try {
                const userData = JSON.parse(profile);
                setUserProfile(userData);
            } catch (error) {
                console.error('Error parsing user profile:', error);
            }
        }
    }, []);

    useEffect(() => {
        // Define all possible pages with their permissions and UI details
        const allPages = [
            {
                name: 'Dashboard',
                description: 'System overview and statistics',
                path: '/view/dashboard',
                permission: ['dashboard', 'access'],
                icon: HomeIcon,
                color: 'text-blue-600',
                bgColor: 'bg-blue-50'
            },
            {
                name: 'Unit Management',
                description: 'Manage units and unit information',
                path: '/view/unit',
                permission: ['unit', 'read'],
                icon: BookOpenIcon,
                color: 'text-red-600',
                bgColor: 'bg-red-50'
            },
            {
                name: 'Unit Types Management',
                description: 'Manage unit types and categories',
                path: '/view/unit_type',
                permission: ['unit_type', 'read'],
                icon: BookOpenIcon,
                color: 'text-purple-600',
                bgColor: 'bg-purple-50'
            },
            {
                name: 'Courses',
                description: 'Manage courses and programs',
                path: '/view/course',
                permission: ['course', 'read'],
                icon: AcademicCapIcon,
                color: 'text-green-600',
                bgColor: 'bg-green-50'
            },
            {
                name: 'Study Planner Search',
                description: 'Search and view student study planners',
                path: '/view/search_student_study_planner',
                permission: ['search_students', 'read'],
                icon: MagnifyingGlassIcon,
                color: 'text-orange-600',
                bgColor: 'bg-orange-50'
            },
            {
                name: 'Student Information',
                description: 'Manage student information and records',
                path: '/view/student_information',
                permission: ['student_info', 'read'],
                icon: UserIcon,
                color: 'text-indigo-600',
                bgColor: 'bg-indigo-50'
            },
            {
                name: 'Terms',
                description: 'Manage academic terms and semesters',
                path: '/view/terms',
                permission: ['term', 'read'],
                icon: CalendarIcon,
                color: 'text-pink-600',
                bgColor: 'bg-pink-50'
            },
            {
                name: 'Role Management',
                description: 'Manage user roles and permissions',
                path: '/view/roles',
                permission: ['role', 'read'],
                icon: ShieldCheckIcon,
                color: 'text-red-600',
                bgColor: 'bg-red-50'
            },
            {
                name: 'User Management',
                description: 'Manage users and access control',
                path: '/view/user_management',
                permission: ['user', 'read'],
                icon: UserGroupIcon,
                color: 'text-teal-600',
                bgColor: 'bg-teal-50'
            },
            {
                name: 'Audit Logs',
                description: 'View system audit logs and activity',
                path: '/view/audit_logs',
                permission: ['audit_logs', 'read'],
                icon: ClipboardDocumentListIcon,
                color: 'text-gray-600',
                bgColor: 'bg-gray-50',
                superadminOnly: true // Special flag for Superadmin-only pages
            },
        ];

        // Filter pages based on user permissions
        const accessible = allPages.filter(page => {
            // Special case: Superadmin-only pages
            if (page.superadminOnly) {
                return isSuperadmin();
            }
            // Regular permission check
            const [resource, action] = page.permission;
            return can(resource, action);
        });

        setAccessiblePages(accessible);
    }, [can, isSuperadmin]);

    // Show loading state while theme or profile loads
    if (!mounted || !userProfile) {
        return (
            <ConditionalRequireAuth>
                <div className="page-bg min-h-screen flex items-center justify-center">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#dc2d27] mx-auto mb-4"></div>
                        <p className="text-muted">Loading account information...</p>
                    </div>
                </div>
            </ConditionalRequireAuth>
        );
    }

    return (
        <ConditionalRequireAuth>
            <div className="page-bg min-h-screen py-8">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Header */}
                    <div className="card-bg shadow rounded-lg mb-6">
                        <div className="px-6 py-4 border-b border-divider">
                            <h1 className="heading-text text-2xl font-bold">Account Information</h1>
                            <p className="text-secondary">View your account details and accessible pages</p>
                        </div>
                    </div>

                    {/* Account Details */}
                    <div className="card-bg shadow rounded-lg mb-6">
                        <div className="px-6 py-4 border-b border-divider">
                            <h2 className="heading-text text-lg font-semibold">Personal Information</h2>
                        </div>
                        <div className="px-6 py-4">
                            <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                                <div>
                                    <dt className="label-text text-sm font-medium">Name</dt>
                                    <dd className="text-primary mt-1 text-sm">
                                        {userProfile.msalAccount?.name || 'Not available'}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="label-text text-sm font-medium">Email</dt>
                                    <dd className="text-primary mt-1 text-sm">
                                        {userProfile.email || 'Not available'}
                                    </dd>
                                </div>
                                {/* Only show current role for users who can switch roles (superadmins), in DEV mode, or are in override mode */}
                                {(canSwitchRoles || (typeof window !== 'undefined' && localStorage.getItem('devRoleOverride') === '1') || process.env.NEXT_PUBLIC_MODE === 'DEV') && (
                                    <div>
                                        <dt className="label-text text-sm font-medium">Current Role</dt>
                                        <dd className="text-primary mt-1 text-sm">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                {selectedRoleName || 'No role selected'}
                                            </span>
                                            {process.env.NEXT_PUBLIC_MODE === 'DEV' && (
                                                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-200 text-blue-900">
                                                    DEV Mode
                                                </span>
                                            )}
                                        </dd>
                                    </div>
                                )}
                                <div>
                                    <dt className="label-text text-sm font-medium">Assigned Roles</dt>
                                    <dd className="text-primary mt-1 text-sm">
                                        <div className="flex flex-wrap gap-1">
                                            {userActualRoles.map((role, index) => (
                                                <span
                                                    key={index}
                                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                                                >
                                                    {role}
                                                </span>
                                            ))}
                                        </div>
                                    </dd>
                                </div>
                            </dl>
                        </div>
                    </div>

                    {/* Accessible Pages */}
                    <div className="card-bg shadow rounded-lg">
                        <div className="px-6 py-4 border-b border-divider">
                            <h2 className="heading-text text-lg font-semibold">Accessible Pages</h2>
                            <p className="text-secondary text-sm">Pages you can access based on your current role permissions</p>
                        </div>
                        <div className="px-6 py-4">
                            {accessiblePages.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {accessiblePages.map((page, index) => {
                                        const IconComponent = page.icon;
                                        return (
                                            <div
                                                key={index}
                                                className="modal-bg rounded-lg shadow transition-shadow duration-200 hover:shadow-md border border-theme"
                                            >
                                                <div className="p-6">
                                                    <div className="flex items-start mb-4">
                                                        <div className={`p-3 ${page.bgColor} rounded-lg flex-shrink-0`}>
                                                            <IconComponent className={`h-8 w-8 ${page.color}`} />
                                                        </div>
                                                        <div className="ml-4 flex-1 min-w-0">
                                                            <h3 className="heading-text text-lg font-semibold">
                                                                {page.name}
                                                            </h3>
                                                            <p className="text-secondary text-sm">
                                                                {page.description}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="mt-4 space-y-3">
                                                        <div className={`text-xs font-mono px-2 py-1 rounded break-all overflow-wrap-anywhere border ${theme === 'dark' ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-300 text-gray-900'}`}>
                                                            {page.path}
                                                        </div>
                                                        <a
                                                            href={page.path}
                                                            className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 transition-colors duration-200"
                                                        >
                                                            Access Page
                                                            <svg
                                                                className="ml-1 h-4 w-4"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                viewBox="0 0 24 24"
                                                            >
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    strokeWidth={2}
                                                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                                                />
                                                            </svg>
                                                        </a>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <div className="text-muted mb-4">
                                        <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <h3 className="heading-text text-lg font-medium mb-2">No accessible pages</h3>
                                    <p className="text-muted">
                                        You don't have permission to access any pages with your current role.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Role Override Warning */}
                    {typeof window !== 'undefined' && localStorage.getItem('devRoleOverride') === '1' && (
                        <div className="mt-6 border-l-4 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-4">
                            <div className="flex">
                                <div className="flex-shrink-0">
                                    <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                        <path
                                            fillRule="evenodd"
                                            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                </div>
                                <div className="ml-3">
                                    <p className="text-sm text-yellow-700 dark:text-yellow-200">
                                        <strong>Role Override Active:</strong> You are viewing the system as{' '}
                                        <strong>{selectedRoleName}</strong>. Your actual roles are{' '}
                                        <strong>{userActualRoles.join(', ')}</strong>. This is a temporary view for testing purposes.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </ConditionalRequireAuth>
    );
}
