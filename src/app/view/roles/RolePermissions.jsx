'use client';
import { useState, useEffect } from 'react';
import { XMarkIcon, CheckIcon, XCircleIcon } from '@heroicons/react/24/outline';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import InfoTooltip from '@components/InfoTooltip';

import { useRole } from '@app/context/RoleContext';
const RolePermissions = ({ role, onClose }) => {
    const { can } = useRole();
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const hasPermission = can('role', 'read');

    useEffect(() => {
        fetchRolePermissions();
    }, [role]);

    const fetchRolePermissions = async () => {
        try {
            setLoading(true);
            const response = await SecureFrontendAuthHelper.authenticatedFetch(`/api/roles/${role.ID}/permissions`);
            if (response.ok) {
                const data = await response.json();
                setPermissions(data.permissions || []);
            } else {
                setError('Failed to fetch role permissions');
            }
        } catch (error) {
            console.error('Error fetching permissions:', error);
            setError('Failed to fetch role permissions');
        } finally {
            setLoading(false);
        }
    };

    const handlePermissionToggle = (permissionId, granted) => {
        setPermissions(prev => {
            const updatedPermissions = [...prev];
            const targetPermission = updatedPermissions.find(p => p.ID === permissionId);

            if (!targetPermission) return prev;

            // Update the target permission
            targetPermission.Granted = granted;

            // If granting a permission that requires 'read' access, ensure 'read' is also granted
            if (granted && targetPermission.Action !== 'read') {
                const readPermission = updatedPermissions.find(p =>
                    p.Resource === targetPermission.Resource &&
                    p.Action === 'read' &&
                    p.Module === targetPermission.Module
                );
                if (readPermission && !readPermission.Granted) {
                    readPermission.Granted = true;
                }
            }

            // If revoking 'read' access, revoke all other permissions for the same resource
            if (!granted && targetPermission.Action === 'read') {
                updatedPermissions.forEach(p => {
                    if (p.Resource === targetPermission.Resource &&
                        p.Module === targetPermission.Module &&
                        p.Action !== 'read') {
                        p.Granted = false;
                    }
                });
            }

            return updatedPermissions;
        });
    };

    const handleSavePermissions = async () => {
        setSaving(true);
        try {
            const response = await SecureFrontendAuthHelper.authenticatedFetch(`/api/roles/${role.ID}/permissions`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ permissions }),
            });

            if (response.ok) {
                // Show SweetAlert success message
                await window.Swal?.fire?.({
                    title: 'Success!',
                    text: 'Permission changes have been saved successfully.',
                    icon: 'success',
                    confirmButtonText: 'OK'
                });

                // Notify app to refresh RBAC state
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new Event('rbac:permissions-updated'));
                }

                // Close the popup
                onClose();
            } else {
                const errorData = await response.json();
                setError(errorData.message || 'Failed to update permissions');
            }
        } catch (error) {
            console.error('Error updating permissions:', error);
            setError('Failed to update permissions');
        } finally {
            setSaving(false);
        }
    };

    const groupedPermissions = permissions.reduce((groups, permission) => {
        const module = permission.Module;
        if (!groups[module]) {
            groups[module] = [];
        }
        groups[module].push(permission);
        return groups;
    }, {});

    // Define the order for actions within each module
    const actionOrder = ['read', 'create', 'update', 'delete', 'manage', 'assign', 'assign_roles', 'admin', 'configure', 'audit'];

    // Sort permissions within each module by action order
    Object.keys(groupedPermissions).forEach(module => {
        groupedPermissions[module].sort((a, b) => {
            const aIndex = actionOrder.indexOf(a.Action);
            const bIndex = actionOrder.indexOf(b.Action);

            // If both actions are in the order list, sort by their position
            if (aIndex !== -1 && bIndex !== -1) {
                return aIndex - bIndex;
            }

            // If only one is in the order list, prioritize it
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;

            // If neither is in the order list, sort alphabetically
            return a.Action.localeCompare(b.Action);
        });
    });

    const getModuleDisplayName = (module) => {
        const moduleNames = {
            'general': 'General',
            'unit_management': 'Unit Management',
            'unit_type_management': 'Unit Type Management',
            'course_management': 'Courses',
            'study_planner': 'Study Planner',
            'student_management': 'Student Management',
            'term_management': 'Term',
            'role_management': 'Role Management',
            'user_management': 'User Management',
            'system_administration': 'System Admin'
        };
        return moduleNames[module] || module.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    // Define the order for modules
    const moduleOrder = [
        'general',                    // General
        'unit_management',
        'unit_type_management',
        'course_management',
        'study_planner',             // Study Planner
        'student_management',        // Student Management
        'term_management',
        'role_management',
        'user_management',
        'system_administration'      // System Admin
    ];

    // Sort modules according to the defined order
    const sortedModules = Object.keys(groupedPermissions).sort((a, b) => {
        const aIndex = moduleOrder.indexOf(a);
        const bIndex = moduleOrder.indexOf(b);

        // If both modules are in the order list, sort by their position
        if (aIndex !== -1 && bIndex !== -1) {
            return aIndex - bIndex;
        }

        // If only one is in the order list, prioritize it
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;

        // If neither is in the order list, sort alphabetically
        return a.localeCompare(b);
    });

    const getActionDisplayName = (action) => {
        const actionNames = {
            'create': 'Create',
            'read': 'View',
            'update': 'Edit',
            'delete': 'Delete',
            'manage': 'Manage'
        };
        return actionNames[action] || action;
    };

    const getResourceDisplayName = (resource) => {
        const resourceNames = {
            'course': 'Courses',
            'courses': 'Courses',
            'intake': 'Intakes',
            'intakes': 'Intakes',
            'student': 'Students',
            'student_info': 'Student Information',
            'search_students': 'Search Students Study Planner',
            'unit': 'Units',
            'unit_type': 'Unit Types',
            'role': 'Roles',
            'user': 'Users',
            'term': 'Terms'
        };
        return resourceNames[resource] || resource;
    };

    if (loading) {
        return (
            <div>
                <div className="p-6 border-b border-divider">
                    <h2 className="text-xl font-semibold heading-text">Loading Permissions...</h2>
                </div>
                <div className="p-6 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#dc2d27]"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-divider">
                <div className="flex items-center space-x-3">
                    <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: role.Color || '#3B82F6' }}
                    ></div>
                    <div>
                        <h2 className="text-xl font-semibold heading-text">
                            {role.Name} - Permissions
                        </h2>
                        <p className="text-sm text-muted">
                            Manage what this role can access and modify
                        </p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="btn-close hover:text-gray-600 transition-colors"
                >
                    <XMarkIcon className="h-6 w-6" />
                </button>
            </div>

            {/* Error/Success Messages */}
            {error && (
                <div className="mx-6 mt-4 badge-error px-4 py-3 rounded-lg">
                    {error}
                    <button
                        onClick={() => setError(null)}
                        className="float-right font-bold hover:opacity-80"
                    >
                        ×
                    </button>
                </div>
            )}


            {/* Permissions Content */}
            <div className="p-6">
                {sortedModules
                    .filter(module => groupedPermissions[module]) // Only show modules that have permissions
                    .map((module) => {
                        const modulePermissions = groupedPermissions[module];
                        return (
                            <div key={module} className="mb-8">
                                <h3 className="text-lg font-medium heading-text mb-4">
                                    {getModuleDisplayName(module)}
                                    <InfoTooltip
                                        content={`Here you can grant permission to use certain functions on the page - ${getModuleDisplayName(module)}`}
                                        position='right'
                                        className='info-bttn'
                                    />
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {modulePermissions.map((permission) => (
                                        <div
                                            key={permission.ID}
                                            className="border border-theme rounded-lg p-4 hover:border-gray-300 transition-colors card-bg"
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center space-x-2">
                                                    <span className="text-sm font-medium label-text-alt">
                                                        {getActionDisplayName(permission.Action)}
                                                    </span>
                                                    <span className="text-sm text-muted">
                                                        {getResourceDisplayName(permission.Resource)}
                                                    </span>
                                                </div>
                                                {can('role', 'update') && !role.IsSystem && (
                                                    <div className="flex items-center space-x-1">
                                                        <button
                                                            onClick={() => handlePermissionToggle(permission.ID, true)}
                                                            className={`p-1 rounded transition-colors ${permission.Granted
                                                                ? 'text-green-600 bg-green-50'
                                                                : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                                                                }`}
                                                            title="Grant Permission"
                                                        >
                                                            <CheckIcon className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handlePermissionToggle(permission.ID, false)}
                                                            className={`p-1 rounded transition-colors ${!permission.Granted
                                                                ? 'text-red-600 bg-red-50'
                                                                : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                                                                }`}
                                                            title="Deny Permission"
                                                        >
                                                            <XCircleIcon className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {permission.Description && (
                                                <p className="text-xs text-muted">
                                                    {permission.Description}
                                                </p>
                                            )}

                                            <div className={`mt-2 text-xs font-medium ${permission.Granted
                                                ? 'text-green-600'
                                                : 'text-red-600'
                                                }`}>
                                                {permission.Granted ? '✓ Granted' : '✗ Denied'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                {permissions.length === 0 && (
                    <div className="text-center py-12">
                        <div className="text-muted mb-4">
                            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h3 className="text-sm font-medium heading-text mb-1">No permissions configured</h3>
                        <p className="text-sm text-muted">
                            This role doesn't have any permissions assigned yet.
                        </p>
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end space-x-3 p-6 border-t border-divider">
                <button
                    onClick={onClose}
                    className="btn-secondary px-4 py-2 rounded-lg transition-colors"
                    disabled={saving}
                >
                    Close
                </button>
                {can('role', 'update') && !role.IsSystem && (
                    <button
                        onClick={handleSavePermissions}
                        disabled={saving}
                        className="btn-primary px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                        {saving ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                <span>Saving...</span>
                            </>
                        ) : (
                            <>
                                <CheckIcon className="h-4 w-4" />
                                <span>Save Permissions</span>
                            </>
                        )}
                    </button>
                )}
            </div>

            {/* System Role Notice */}
            {
                role.IsSystem && (
                    <div className="mx-6 mb-6 badge-info px-4 py-3 rounded-lg">
                        <p className="text-sm">
                            <strong>System Role:</strong> Permissions for system roles cannot be modified.
                        </p>
                    </div>
                )
            }
        </div >
    );
};

export default RolePermissions;
