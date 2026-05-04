'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useRole } from '@app/context/RoleContext';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import LoadingSpinner from '@components/LoadingSpinner';
import AccessDenied from '@components/AccessDenied';
import { ConditionalRequireAuth } from '@components/helper';

export default function AuditLogsPage() {
    const { userActualRoles, selectedRoleName } = useRole();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    // Applied filters (what actually gets sent to the API)
    const [filters, setFilters] = useState({
        modules: [],
        actions: [],
        roles: [],
        userSearch: '',
        startDate: '',
        endDate: ''
    });

    // Input states (what the user is currently typing/selecting before applying)
    const [userSearchInput, setUserSearchInput] = useState('');
    const [startDateInput, setStartDateInput] = useState('');
    const [endDateInput, setEndDateInput] = useState('');
    const [modulesInput, setModulesInput] = useState([]);
    const [actionsInput, setActionsInput] = useState([]);
    const [rolesInput, setRolesInput] = useState([]);

    // Available modules, actions, and roles for filter dropdowns (from ALL logs)
    const [availableModules, setAvailableModules] = useState([]);
    const [availableActions, setAvailableActions] = useState([]);
    const [availableRoles, setAvailableRoles] = useState([]);

    // Pagination state
    const [pagination, setPagination] = useState({
        total: 0,
        page: 1,
        limit: 10, // Default to 10 per page
        totalPages: 0
    });

    const [expandedLog, setExpandedLog] = useState(null);
    const [error, setError] = useState(null);
    const [showModuleDropdown, setShowModuleDropdown] = useState(false);
    const [showActionDropdown, setShowActionDropdown] = useState(false);
    const [showRoleDropdown, setShowRoleDropdown] = useState(false);
    const [moduleSearchTerm, setModuleSearchTerm] = useState('');
    const [actionSearchTerm, setActionSearchTerm] = useState('');
    const [roleSearchTerm, setRoleSearchTerm] = useState('');

    // Refs for click outside detection
    const moduleDropdownRef = useRef(null);
    const actionDropdownRef = useRef(null);
    const roleDropdownRef = useRef(null);

    const isDevMode = process.env.NEXT_PUBLIC_MODE === 'DEV';

    // Check if the currently selected role is Superadmin
    // Use selectedRoleName (which changes when toggling roles) for access control
    // In DEV mode, we still check the selected role to allow testing different permissions
    const isSuperadmin = selectedRoleName?.toLowerCase() === 'superadmin';

    // Filter modules, actions, and roles based on search term
    const filteredModules = availableModules.filter(module =>
        module.toLowerCase().includes(moduleSearchTerm.toLowerCase())
    );
    const filteredActions = availableActions.filter(action =>
        action.toLowerCase().includes(actionSearchTerm.toLowerCase())
    );
    const filteredRoles = availableRoles.filter(role =>
        role.toLowerCase().includes(roleSearchTerm.toLowerCase())
    );

    // Fetch available modules and actions on initial load
    useEffect(() => {
        if (isSuperadmin) {
            fetchAvailableFilters();
        }
    }, [isSuperadmin]);

    // Fetch audit logs when pagination, filters, or access changes
    useEffect(() => {
        if (isSuperadmin) {
            fetchAuditLogs();
        } else {
            // If user doesn't have access, stop loading immediately
            setLoading(false);
            setLogs([]); // Clear logs when access is lost
        }
    }, [isSuperadmin, selectedRoleName, pagination.page, pagination.limit, filters]); // Watch for role, pagination, and filter changes

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            // Check if click is outside module dropdown
            if (moduleDropdownRef.current && !moduleDropdownRef.current.contains(event.target)) {
                setShowModuleDropdown(false);
                setModuleSearchTerm('');
            }

            // Check if click is outside action dropdown
            if (actionDropdownRef.current && !actionDropdownRef.current.contains(event.target)) {
                setShowActionDropdown(false);
                setActionSearchTerm('');
            }

            // Check if click is outside role dropdown
            if (roleDropdownRef.current && !roleDropdownRef.current.contains(event.target)) {
                setShowRoleDropdown(false);
                setRoleSearchTerm('');
            }
        };

        // Add event listener when any dropdown is open
        if (showModuleDropdown || showActionDropdown || showRoleDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        // Cleanup
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showModuleDropdown, showActionDropdown, showRoleDropdown]);

    // Fetch all available modules, actions, and roles for filter dropdowns
    const fetchAvailableFilters = async () => {
        try {
            // Fetch all logs without pagination to get unique modules and actions
            const response = await SecureFrontendAuthHelper.authenticatedFetch(
                `/api/audit_logs?limit=10000` // Get a large number to capture all unique values
            );

            if (!response.ok) {
                throw new Error('Failed to fetch filter options');
            }

            const data = await response.json();
            const allLogs = data.logs || [];

            // Extract unique modules and actions
            const modules = [...new Set(allLogs.map(log => log.module))].filter(Boolean).sort();
            const actions = [...new Set(allLogs.map(log => log.action))].filter(Boolean).sort();

            // Extract unique roles from all users
            const allRoles = new Set();
            allLogs.forEach(log => {
                if (log.user && log.user.roles && Array.isArray(log.user.roles)) {
                    log.user.roles.forEach(role => {
                        if (role.name) allRoles.add(role.name);
                    });
                }
            });
            const roles = [...allRoles].sort();

            setAvailableModules(modules);
            setAvailableActions(actions);
            setAvailableRoles(roles);
        } catch (err) {
            console.error('Error fetching filter options:', err);
        }
    };

    const fetchAuditLogs = async () => {
        try {
            setLoading(true);
            setError(null);

            // Build query string
            const queryParams = new URLSearchParams();

            // Add module filters (comma-separated)
            if (filters.modules.length > 0) {
                queryParams.append('modules', filters.modules.join(','));
            }

            // Add action filters (comma-separated)
            if (filters.actions.length > 0) {
                queryParams.append('actions', filters.actions.join(','));
            }

            // Add role filters (comma-separated)
            if (filters.roles.length > 0) {
                queryParams.append('roles', filters.roles.join(','));
            }

            // Add user search filter
            if (filters.userSearch) {
                queryParams.append('userSearch', filters.userSearch);
            }

            // Handle date filters
            if (filters.startDate) queryParams.append('startDate', filters.startDate);
            if (filters.endDate) queryParams.append('endDate', filters.endDate);

            // Add pagination
            queryParams.append('limit', pagination.limit);
            queryParams.append('offset', (pagination.page - 1) * pagination.limit);

            const response = await SecureFrontendAuthHelper.authenticatedFetch(
                `/api/audit_logs?${queryParams.toString()}`
            );

            if (!response.ok) {
                throw new Error('Failed to fetch audit logs');
            }

            const data = await response.json();
            setLogs(data.logs || []);

            // Update pagination state
            setPagination(prev => ({
                ...prev,
                total: data.total || 0,
                totalPages: Math.ceil((data.total || 0) / prev.limit)
            }));
        } catch (err) {
            console.error('Error fetching audit logs:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Apply all filters - only updates filters when button is clicked
    const handleApplyManualFilters = () => {
        setFilters({
            modules: modulesInput,
            actions: actionsInput,
            roles: rolesInput,
            userSearch: userSearchInput,
            startDate: startDateInput,
            endDate: endDateInput
        });
        setPagination(prev => ({ ...prev, page: 1 })); // Reset to page 1
    };

    // Toggle checkbox filters in input state (doesn't apply until "Apply Filters" is clicked)
    const toggleModuleFilter = (module) => {
        setModulesInput(prev =>
            prev.includes(module)
                ? prev.filter(m => m !== module)
                : [...prev, module]
        );
    };

    const toggleActionFilter = (action) => {
        setActionsInput(prev =>
            prev.includes(action)
                ? prev.filter(a => a !== action)
                : [...prev, action]
        );
    };

    const toggleRoleFilter = (role) => {
        setRolesInput(prev =>
            prev.includes(role)
                ? prev.filter(r => r !== role)
                : [...prev, role]
        );
    };

    const handleResetFilters = () => {
        // Reset applied filters
        setFilters({
            modules: [],
            actions: [],
            roles: [],
            userSearch: '',
            startDate: '',
            endDate: ''
        });
        // Reset input states
        setModulesInput([]);
        setActionsInput([]);
        setRolesInput([]);
        setUserSearchInput('');
        setStartDateInput('');
        setEndDateInput('');
        setPagination(prev => ({ ...prev, page: 1 })); // Reset to page 1
        setShowModuleDropdown(false);
        setShowActionDropdown(false);
        setShowRoleDropdown(false);
        setModuleSearchTerm('');
        setActionSearchTerm('');
        setRoleSearchTerm('');
    };

    // Pagination handlers
    const handlePageChange = (newPage) => {
        if (!newPage || newPage === pagination.page) return;
        setPagination(prev => ({ ...prev, page: newPage }));
    };

    const handleLimitChange = (newLimit) => {
        if (!newLimit || newLimit === pagination.limit) return;
        setPagination(prev => ({
            ...prev,
            limit: newLimit,
            page: 1,
            totalPages: prev.total > 0 ? Math.ceil(prev.total / newLimit) : 0
        }));
    };

    const toggleExpandLog = (logId) => {
        setExpandedLog(expandedLog === logId ? null : logId);
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleString('en-AU', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const formatDetails = (details) => {
        try {
            const parsed = typeof details === 'string' ? JSON.parse(details) : details;
            return JSON.stringify(parsed, null, 2);
        } catch (e) {
            return details;
        }
    };

    const getActionColor = (action) => {
        if (action.includes('CREATE')) return 'text-green-600 bg-green-50';
        if (action.includes('UPDATE') || action.includes('MODIFY')) return 'text-blue-600 bg-blue-50';
        if (action.includes('DELETE')) return 'text-red-600 bg-red-50';
        if (action.includes('READ')) return 'text-gray-600 bg-gray-50';
        return 'text-purple-600 bg-purple-50';
    };

    return (
        <ConditionalRequireAuth>
            {!isSuperadmin ? (
                <AccessDenied requiredPermission="Superadmin role" resourceName="audit logs" />
            ) : (
                <div className="min-h-screen page-bg">
                    {/* Header */}
                    <div className="card-bg shadow-sm border-b border-divider">
                        <div className="max-w-7xl mx-auto px-4 py-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h1 className="text-3xl font-bold text-primary">Audit Logs</h1>
                                    <p className="text-muted">Track all system changes and user activities</p>
                                    {isDevMode && (
                                        <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                            🔧 DEV MODE ACTIVE
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="max-w-7xl mx-auto px-4 py-8">

                        {/* Filters */}
                        <div className="card-bg rounded-lg shadow-sm border border-divider p-6 mb-6">
                            <h2 className="text-lg font-semibold text-primary mb-4">Filters</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                                {/* Module Filter */}
                                <div className="relative" ref={moduleDropdownRef}>
                                    <label className="block text-sm font-medium text-primary mb-2">Module</label>
                                    <button
                                        onClick={() => setShowModuleDropdown(!showModuleDropdown)}
                                        className="input-field w-full text-left flex items-center justify-between h-10 px-4 rounded-lg border"
                                    >
                                        <span className="text-sm text-primary">
                                            {modulesInput.length === 0
                                                ? 'Select modules...'
                                                : `${modulesInput.length} selected`}
                                        </span>
                                        <svg className={`w-4 h-4 text-muted transition-transform flex-shrink-0 ${showModuleDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                    {showModuleDropdown && (
                                        <div className="absolute z-10 mt-1 w-full modal-bg border border-divider rounded-md shadow-lg overflow-hidden">
                                            {/* Search Input */}
                                            <div className="p-2 border-b border-divider card-bg">
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={moduleSearchTerm}
                                                        onChange={(e) => setModuleSearchTerm(e.target.value)}
                                                        placeholder="Search modules..."
                                                        className="input-field w-full pl-9 text-sm "
                                                        onClick={(e) => e.stopPropagation()}
                                                        autoFocus
                                                    />
                                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                    </svg>
                                                </div>
                                            </div>
                                            {/* Options List */}
                                            <div className="max-h-48 overflow-auto">
                                                {filteredModules.length === 0 ? (
                                                    <div className="px-3 py-2 text-sm text-muted">
                                                        {moduleSearchTerm ? 'No matching modules' : 'No modules available'}
                                                    </div>
                                                ) : (
                                                    filteredModules.map(module => (
                                                        <label key={module} className="flex items-center px-3 py-2 table-row-hover cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={modulesInput.includes(module)}
                                                                onChange={() => toggleModuleFilter(module)}
                                                                className="w-4 h-4 flex-shrink-0 text-[#dc2d27] rounded focus:ring-2 focus:ring-[#dc2d27] border-divider"
                                                            />
                                                            <span className="ml-3 text-sm text-primary">{module}</span>
                                                        </label>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Action Filter */}
                                <div className="relative" ref={actionDropdownRef}>
                                    <label className="block text-sm font-medium text-primary mb-2">Action</label>
                                    <button
                                        onClick={() => setShowActionDropdown(!showActionDropdown)}
                                        className="input-field w-full text-left flex items-center justify-between h-10 px-4 rounded-lg border"
                                    >
                                        <span className="text-sm text-primary">
                                            {actionsInput.length === 0
                                                ? 'Select actions...'
                                                : `${actionsInput.length} selected`}
                                        </span>
                                        <svg className={`w-4 h-4 text-muted transition-transform flex-shrink-0 ${showActionDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                    {showActionDropdown && (
                                        <div className="absolute z-10 mt-1 modal-bg border border-divider rounded-md shadow-lg overflow-hidden ">
                                            {/* Search Input */}
                                            <div className="p-2 border-b border-divider card-bg">
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={actionSearchTerm}
                                                        onChange={(e) => setActionSearchTerm(e.target.value)}
                                                        placeholder="Search actions..."
                                                        className="input-field w-full pl-9 text-sm"
                                                        onClick={(e) => e.stopPropagation()}
                                                        autoFocus
                                                    />
                                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                    </svg>
                                                </div>
                                            </div>
                                            {/* Options List */}
                                            <div className="max-h-48 overflow-auto">
                                                {filteredActions.length === 0 ? (
                                                    <div className="px-3 py-2 text-sm text-muted">
                                                        {actionSearchTerm ? 'No matching actions' : 'No actions available'}
                                                    </div>
                                                ) : (
                                                    filteredActions.map(action => (
                                                        <label key={action} className="flex items-center px-3 py-2 table-row-hover cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={actionsInput.includes(action)}
                                                                onChange={() => toggleActionFilter(action)}
                                                                className="w-4 h-4 flex-shrink-0 text-[#dc2d27] rounded focus:ring-2 focus:ring-[#dc2d27] border-divider"
                                                            />
                                                            <span className="ml-3 text-sm text-primary">{action}</span>
                                                        </label>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Role Filter */}
                                <div className="relative" ref={roleDropdownRef}>
                                    <label className="block text-sm font-medium text-primary mb-2">Role</label>
                                    <button
                                        onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                                        className="input-field w-full text-left flex items-center justify-between h-10 px-4 rounded-lg border"
                                    >
                                        <span className="text-sm text-primary">
                                            {rolesInput.length === 0
                                                ? 'Select roles...'
                                                : `${rolesInput.length} selected`}
                                        </span>
                                        <svg className={`w-4 h-4 text-muted transition-transform flex-shrink-0 ${showRoleDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                    {showRoleDropdown && (
                                        <div className="absolute z-10 mt-1 w-full modal-bg border border-divider rounded-md shadow-lg overflow-hidden">
                                            {/* Search Input */}
                                            <div className="p-2 border-b border-divider card-bg">
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        value={roleSearchTerm}
                                                        onChange={(e) => setRoleSearchTerm(e.target.value)}
                                                        placeholder="Search roles..."
                                                        className="input-field w-full pl-9 text-sm"
                                                        onClick={(e) => e.stopPropagation()}
                                                        autoFocus
                                                    />
                                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                    </svg>
                                                </div>
                                            </div>
                                            {/* Options List */}
                                            <div className="max-h-48 overflow-auto">
                                                {filteredRoles.length === 0 ? (
                                                    <div className="px-3 py-2 text-sm text-muted">
                                                        {roleSearchTerm ? 'No matching roles' : 'No roles available'}
                                                    </div>
                                                ) : (
                                                    filteredRoles.map(role => (
                                                        <label key={role} className="flex items-center px-3 py-2 table-row-hover cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={rolesInput.includes(role)}
                                                                onChange={() => toggleRoleFilter(role)}
                                                                className="w-4 h-4 flex-shrink-0 text-[#dc2d27] rounded focus:ring-2 focus:ring-[#dc2d27] border-divider"
                                                            />
                                                            <span className="ml-3 text-sm text-primary">{role}</span>
                                                        </label>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* User Search Filter */}
                                <div>
                                    <label className="block text-sm font-medium text-primary mb-2">User</label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={userSearchInput}
                                            onChange={(e) => setUserSearchInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    handleApplyManualFilters();
                                                }
                                            }}
                                            placeholder="Search by name or email..."
                                            className="input-field w-full pl-10 pr-4 h-10 rounded-lg border"
                                        />
                                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </div>
                                </div>

                                {/* Start Date */}
                                <div>
                                    <label className="block text-sm font-medium text-primary mb-2">Start Date</label>
                                    <input
                                        type="date"
                                        value={startDateInput}
                                        onChange={(e) => setStartDateInput(e.target.value)}
                                        className="input-field w-full h-10 px-4 rounded-lg border"
                                    />
                                </div>

                                {/* End Date */}
                                <div>
                                    <label className="block text-sm font-medium text-primary mb-2">End Date</label>
                                    <input
                                        type="date"
                                        value={endDateInput}
                                        onChange={(e) => setEndDateInput(e.target.value)}
                                        className="input-field w-full h-10 px-4 rounded-lg border"
                                    />
                                </div>
                            </div>
                            <div className="mt-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleApplyManualFilters}
                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        Apply Filters
                                    </button>
                                    <button
                                        onClick={handleResetFilters}
                                        className="px-4 py-2 bg-[#dc2d27] hover:bg-[#b91c1c] text-white rounded-lg transition-colors font-medium"
                                    >
                                        Reset Filters
                                    </button>
                                </div>
                                <div className="text-xs text-muted">
                                    Click "Apply Filters" to search (or press Enter in User field)
                                </div>
                                <div className="flex-1"></div>
                                <div className="text-sm text-muted">
                                    Showing <span className="font-semibold text-primary">{logs.length}</span> of <span className="font-semibold text-primary">{pagination.total}</span> logs
                                </div>
                            </div>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-6">
                                {error}
                                <button
                                    onClick={() => setError(null)}
                                    className="float-right font-bold text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100"
                                >
                                    ×
                                </button>
                            </div>
                        )}

                        {/* Loading State */}
                        {loading ? (
                            <div className="card-bg rounded-lg shadow-sm border border-divider p-12 text-center">
                                <LoadingSpinner />
                                <p className="text-muted mt-4">Loading audit logs...</p>
                            </div>
                        ) : (
                            <>
                                {/* Logs Table */}
                                <div className="card-bg rounded-lg shadow-sm border border-divider overflow-hidden">
                                    {logs.length === 0 ? (
                                        <div className="p-12 text-center text-muted">
                                            <svg className="mx-auto h-12 w-12 text-muted mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <p className="text-primary">No audit logs found</p>
                                            <p className="text-sm mt-2 text-muted">Try adjusting your filters</p>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-divider">
                                                <thead className="table-header">
                                                    <tr>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                                                            Date & Time
                                                        </th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                                                            User
                                                        </th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                                                            Action
                                                        </th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                                                            Module
                                                        </th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                                                            Details
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="table-body-divided">
                                                    {logs.map((log) => (
                                                        <React.Fragment key={log.id}>
                                                            <tr className="table-row-hover transition-colors">
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-primary">
                                                                    {formatDate(log.timestamp)}
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <div className="text-sm font-medium text-primary">{log.user.name || 'Unknown'}</div>
                                                                    <div className="text-sm text-muted">{log.user.email}</div>
                                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                                        {log.user.name === 'Developer' && (
                                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                                                                DEV
                                                                            </span>
                                                                        )}
                                                                        {log.user.roles && log.user.roles.length > 0 && (
                                                                            <>
                                                                                {log.user.roles.map((role, index) => (
                                                                                    <span
                                                                                        key={index}
                                                                                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                                                                                        style={{
                                                                                            backgroundColor: role.color ? `${role.color}20` : '#e5e7eb',
                                                                                            color: role.color || '#374151'
                                                                                        }}
                                                                                    >
                                                                                        {role.name}
                                                                                    </span>
                                                                                ))}
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap">
                                                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getActionColor(log.action)}`}>
                                                                        {log.action}
                                                                    </span>
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-primary">
                                                                    {log.module}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                                    <button
                                                                        onClick={() => toggleExpandLog(log.id)}
                                                                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                                                                    >
                                                                        {expandedLog === log.id ? 'Hide' : 'View'} Details
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                            {expandedLog === log.id && (
                                                                <tr>
                                                                    <td colSpan="5" className="px-6 py-4 page-bg">
                                                                        <div className="space-y-2">
                                                                            <div>
                                                                                <span className="font-medium text-primary">Details:</span>
                                                                                <pre className="mt-2 p-4 card-bg rounded border border-divider text-xs text-primary overflow-auto max-h-96">
                                                                                    {formatDetails(log.details)}
                                                                                </pre>
                                                                            </div>
                                                                            {log.ipAddress && (
                                                                                <div>
                                                                                    <span className="font-medium text-primary">IP Address:</span>
                                                                                    <span className="ml-2 text-muted">{log.ipAddress}</span>
                                                                                </div>
                                                                            )}
                                                                            {log.userAgent && (
                                                                                <div>
                                                                                    <span className="font-medium text-primary">User Agent:</span>
                                                                                    <span className="ml-2 text-muted">{log.userAgent}</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </React.Fragment>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>

                                {/* Pagination Controls */}
                                {pagination.total > 0 && (
                                    <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4 card-bg p-4 rounded-lg shadow-sm border border-divider">
                                        {/* Items per page selector */}
                                        <div className="flex items-center gap-2">
                                            <label className="text-sm text-primary font-medium">Items per page:</label>
                                            <select
                                                value={pagination.limit}
                                                onChange={(e) => handleLimitChange(parseInt(e.target.value))}
                                                className="select-field text-sm"
                                            >
                                                <option value={10}>10</option>
                                                <option value={20}>20</option>
                                                <option value={50}>50</option>
                                                <option value={100}>100</option>
                                            </select>
                                        </div>

                                        {/* Page info */}
                                        <div className="text-sm text-primary">
                                            Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} logs
                                        </div>

                                        {/* Page navigation */}
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handlePageChange(pagination.page - 1)}
                                                disabled={pagination.page <= 1}
                                                className="px-3 py-1.5 border border-divider rounded-lg text-sm font-medium text-primary disabled:opacity-50 disabled:cursor-not-allowed table-row-hover transition-colors"
                                            >
                                                Previous
                                            </button>

                                            {/* Page numbers */}
                                            <div className="flex items-center gap-1">
                                                {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                                                    let pageNum;
                                                    if (pagination.totalPages <= 5) {
                                                        pageNum = i + 1;
                                                    } else if (pagination.page <= 3) {
                                                        pageNum = i + 1;
                                                    } else if (pagination.page >= pagination.totalPages - 2) {
                                                        pageNum = pagination.totalPages - 4 + i;
                                                    } else {
                                                        pageNum = pagination.page - 2 + i;
                                                    }

                                                    return (
                                                        <button
                                                            key={pageNum}
                                                            onClick={() => handlePageChange(pageNum)}
                                                            className={`px-3 py-1.5 border rounded-lg text-sm font-medium transition-colors ${pagination.page === pageNum
                                                                ? 'bg-[#dc2d27] text-white border-[#dc2d27]'
                                                                : 'border-divider text-primary table-row-hover'
                                                                }`}
                                                        >
                                                            {pageNum}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            <button
                                                onClick={() => handlePageChange(pagination.page + 1)}
                                                disabled={pagination.page >= pagination.totalPages}
                                                className="px-3 py-1.5 border border-divider rounded-lg text-sm font-medium text-primary disabled:opacity-50 disabled:cursor-not-allowed table-row-hover transition-colors"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </ConditionalRequireAuth>
    );
}
