'use client';
import { useState, useEffect, useRef } from 'react';
import {
    PlusIcon,
    ShieldCheckIcon,
    UserGroupIcon
} from '@heroicons/react/24/outline';
import { ConditionalRequireAuth } from '@components/helper';
import RoleForm from './RoleForm';
import RolePermissions from './RolePermissions';
import { useRole } from '@app/context/RoleContext';
import ActionButton from '@components/ActionButton';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import InfoTooltip from '@components/InfoTooltip';

const RolesPage = () => {
    const { can } = useRole();
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showPermissions, setShowPermissions] = useState(false);
    const [selectedRole, setSelectedRole] = useState(null);
    const [formMode, setFormMode] = useState('ADD');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterActive, setFilterActive] = useState('all');
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [pageError, setPageError] = useState(null);
    const [draggedItem, setDraggedItem] = useState(null);
    const [draggedOverItem, setDraggedOverItem] = useState(null);

    const formRef = useRef(null);

    // Check if user has permission to access this page
    const hasPermission = can('role', 'read');

    useEffect(() => {
        if (hasPermission) {
            fetchRoles();
        } else {
            // If user doesn't have permission, stop loading immediately
            setLoading(false);
        }
    }, [hasPermission]);

    const fetchRoles = async () => {
        try {
            setLoading(true);
            setIsLoading(true);
            setPageError(null);
            const response = await SecureFrontendAuthHelper.authenticatedFetch('/api/roles');
            if (response.ok) {
                const data = await response.json();
                setRoles(data);
            } else {
                const errorData = await response.json();
                setError(errorData.message || 'Failed to fetch roles');
                setPageError(errorData.message || 'Failed to fetch roles');
            }
        } catch (error) {
            console.error('Error fetching roles:', error);
            setError('Failed to fetch roles');
            setPageError('Failed to fetch roles');
        } finally {
            setLoading(false);
            setIsLoading(false);
        }
    };

    const handleOpenForm = (mode, role = null) => {
        // Permission gating for simulated roles
        if (mode === 'ADD' && !can('role', 'create')) {
            window.Swal?.fire?.({ title: 'Permission denied', text: 'You need role:create', icon: 'warning' });
            return;
        }
        if (mode === 'EDIT' && !can('role', 'update')) {
            window.Swal?.fire?.({ title: 'Permission denied', text: 'You need role:update', icon: 'warning' });
            return;
        }
        setFormMode(mode);
        setSelectedRole(role);
        setShowForm(true);
    };

    const modalRef = useRef(null);
    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            setShowForm(false);
            setShowPermissions(false);
            setSelectedRole(null);
        }
    };

    const handleCloseForm = () => {
        setShowForm(false);
        setSelectedRole(null);
        setFormMode('ADD');
    };

    const handleFormSuccess = () => {
        setSuccess('Role operation completed successfully');
        fetchRoles();
        handleCloseForm();
        setTimeout(() => setSuccess(null), 3000);
    };

    const handleDragStart = (e, index) => {
        setDraggedItem(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedItem === null || draggedItem === index) return;

        // Find Superadmin role index
        const superadminIndex = filteredRoles.findIndex(role => role.Name === 'Superadmin');

        // Prevent dragging before Superadmin
        if (superadminIndex !== -1 && index <= superadminIndex && draggedItem > superadminIndex) {
            return;
        }

        setDraggedOverItem(index);
    };

    const handleDragLeave = () => {
        setDraggedOverItem(null);
    };

    const handleDrop = async (e, dropIndex) => {
        e.preventDefault();

        if (draggedItem === null || draggedItem === dropIndex) {
            setDraggedItem(null);
            setDraggedOverItem(null);
            return;
        }

        const newRoles = [...filteredRoles];

        // Find Superadmin role index
        const superadminIndex = newRoles.findIndex(role => role.Name === 'Superadmin');

        // Prevent dropping before Superadmin
        if (superadminIndex !== -1 && dropIndex <= superadminIndex && draggedItem > superadminIndex) {
            setDraggedItem(null);
            setDraggedOverItem(null);
            setError('Cannot move roles before Superadmin');
            setTimeout(() => setError(null), 3000);
            return;
        }

        const draggedRole = newRoles[draggedItem];

        // Remove from old position
        newRoles.splice(draggedItem, 1);

        // Insert at new position
        newRoles.splice(dropIndex, 0, draggedRole);

        // Update roles state
        setRoles(newRoles);

        // Prepare the role orders for the API
        const roleOrders = newRoles.map((role, index) => ({
            id: role.ID,
            priority: index + 1
        }));

        try {
            const response = await SecureFrontendAuthHelper.authenticatedFetch('/api/roles', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ roleOrders }),
            });

            if (response.ok) {
                setSuccess('Roles reordered successfully');
                setTimeout(() => setSuccess(null), 3000);
            } else {
                const errorData = await response.json();
                setError(errorData.message || 'Failed to reorder roles');
                // Revert to original order
                fetchRoles();
            }
        } catch (error) {
            console.error('Error reordering roles:', error);
            setError('Failed to reorder roles');
            // Revert to original order
            fetchRoles();
        }

        setDraggedItem(null);
        setDraggedOverItem(null);
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
        setDraggedOverItem(null);
    };

    const handleDeleteRole = async (role) => {
        if (!can('role', 'delete')) {
            await window.Swal?.fire?.({ title: 'Permission denied', text: 'You need role:delete', icon: 'warning' });
            return;
        }

        // Show SweetAlert confirmation
        const result = await window.Swal?.fire?.({
            title: 'Delete Role',
            text: `Are you sure you want to delete the role "${role.Name}"? This action cannot be undone.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2d27',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'Confirm',
            cancelButtonText: 'Cancel'
        });

        if (!result.isConfirmed) {
            return;
        }

        try {
            const response = await SecureFrontendAuthHelper.authenticatedFetch(`/api/roles?id=${role.ID}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                setSuccess('Role deleted successfully');
                fetchRoles();
                // Show success message with SweetAlert
                await window.Swal?.fire?.({
                    title: 'Deleted!',
                    text: 'Role has been deleted successfully.',
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                });
            } else {
                const errorData = await response.json();
                setError(errorData.message || 'Failed to delete role');
                // Show error message with SweetAlert
                await window.Swal?.fire?.({
                    title: 'Error!',
                    text: errorData.message || 'Failed to delete role',
                    icon: 'error'
                });
            }
        } catch (error) {
            console.error('Error deleting role:', error);
            setError('Failed to delete role');
            // Show error message with SweetAlert
            await window.Swal?.fire?.({
                title: 'Error!',
                text: 'Failed to delete role',
                icon: 'error'
            });
        }
    };

    const handleViewPermissions = (role) => {
        if (!can('role', 'read')) {
            window.Swal?.fire?.({ title: 'Permission denied', text: 'You need role:read', icon: 'warning' });
            return;
        }
        setSelectedRole(role);
        setShowPermissions(true);
    };

    const filteredRoles = roles.filter(role => {
        const matchesSearch = role.Name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            role.Description?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesFilter = filterActive === 'all' ||
            (filterActive === 'active' && role.IsActive) ||
            (filterActive === 'inactive' && !role.IsActive);

        return matchesSearch && matchesFilter;
    });

    const getRoleColor = (color) => {
        return color || '#3B82F6';
    };

    const canDropAtPosition = (targetIndex) => {
        if (draggedItem === null) return true;

        const superadminIndex = filteredRoles.findIndex(role => role.Name === 'Superadmin');

        // Can't drop before or at Superadmin position when dragging from after it
        if (superadminIndex !== -1 && targetIndex <= superadminIndex && draggedItem > superadminIndex) {
            return false;
        }

        return true;
    };


    return (
        <ConditionalRequireAuth>
            {/* If user doesn't have permission, show access denied */}
            <PageLoadingWrapper
                requiredPermission={{ resource: 'role', action: 'read' }}
                resourceName="role management"
                isLoading={isLoading}
                loadingText="Loading roles..."
                error={pageError}
                errorMessage="Failed to load roles"
            >
                <div className="min-h-screen page-bg">
                    {/* Header */}
                    <div className="card-bg shadow-theme border-divider border-b">
                        <div className="max-w-7xl mx-auto px-4 py-6">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
                                <div className="flex items-center space-x-3">
                                    <div className="p-2 bg-[#dc2d27]/10 rounded-lg">
                                        <ShieldCheckIcon className="h-8 w-8 text-[#dc2d27]" />
                                    </div>
                                    <div>
                                        <h1 className="text-3xl font-bold heading-text">
                                            Role Management
                                            <InfoTooltip
                                                content={"All the roles of the system exist here. Users are allowed to create new roles or alter existing ones"}
                                                position='right'
                                                className='info-bttn'
                                            />
                                        </h1>
                                        <p className="text-muted">Manage user roles and permissions</p>
                                    </div>
                                </div>
                                {can('role', 'create') && (
                                    <button
                                        onClick={() => handleOpenForm('ADD')}
                                        className="w-full sm:w-auto px-4 py-2 sm:px-6 sm:py-3 rounded-lg flex items-center justify-center sm:justify-start space-x-2 transition-colors btn-primary whitespace-nowrap"
                                    >
                                        <PlusIcon className="h-5 w-5" />
                                        <span>Create Role</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="max-w-7xl mx-auto px-4 py-8">
                        {/* Search and Filters */}
                        <div className="card-bg rounded-theme shadow-theme border-theme border p-6 mb-6">
                            <div className="flex flex-col sm:flex-row gap-4">
                                <div className="flex-1">
                                    <input
                                        type="text"
                                        placeholder="Search roles..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="input-field w-full px-4 py-2 rounded-lg border-2 border-gray-300 focus:ring-2 focus:ring-[#dc2d27] focus:border-[#dc2d27]"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <select
                                        value={filterActive}
                                        onChange={(e) => setFilterActive(e.target.value)}
                                        className="select-field px-4 py-2 rounded-lg border-2 border-gray-300 focus:ring-2 focus:ring-[#dc2d27] focus:border-[#dc2d27]"
                                    >
                                        <option value="all">All Roles</option>
                                        <option value="active">Active Only</option>
                                        <option value="inactive">Inactive Only</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Error/Success Messages */}
                        {error && (
                            <div className="badge-error px-4 py-3 rounded-lg mb-6 flex items-center justify-between">
                                <span>{error}</span>
                                <button
                                    onClick={() => setError(null)}
                                    className="ml-4 font-bold hover:opacity-80"
                                >
                                    ×
                                </button>
                            </div>
                        )}

                        {success && (
                            <div className="badge-success px-4 py-3 rounded-lg mb-6 flex items-center justify-between">
                                <span>{success}</span>
                                <button
                                    onClick={() => setSuccess(null)}
                                    className="ml-4 font-bold hover:opacity-80"
                                >
                                    ×
                                </button>
                            </div>
                        )}

                        {/* Roles Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredRoles.map((role, index) => {
                                const isDroppable = canDropAtPosition(index);
                                const showNotAllowed = draggedItem !== null && !isDroppable && draggedItem !== index;

                                return (
                                    <div
                                        key={role.ID}
                                        draggable={!role.IsSystem}
                                        onDragStart={(e) => handleDragStart(e, index)}
                                        onDragOver={(e) => handleDragOver(e, index)}
                                        onDragLeave={handleDragLeave}
                                        onDrop={(e) => handleDrop(e, index)}
                                        onDragEnd={handleDragEnd}
                                        className={`card-bg rounded-theme shadow-theme border-theme border hover:shadow-lg transition-all ${draggedItem === index ? 'opacity-50' : ''
                                            } ${draggedOverItem === index ? 'border-[#dc2d27] border-2' : ''
                                            } ${!role.IsSystem && !showNotAllowed ? 'cursor-move' : ''
                                            } ${showNotAllowed ? 'cursor-not-allowed opacity-60' : ''
                                            }`}
                                    >
                                        {/* Role Header */}
                                        <div className="p-6 border-b border-gray-100">
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center space-x-3">
                                                    <div
                                                        className="w-4 h-4 rounded-full"
                                                        style={{ backgroundColor: getRoleColor(role.Color) }}
                                                    ></div>
                                                    <div>
                                                        <h3 className="text-lg font-semibold heading-text">{role.Name}</h3>
                                                    </div>
                                                </div>
                                                <div className="flex items-center space-x-1">
                                                    {role.IsSystem && (
                                                        <span className="badge-info">
                                                            System
                                                        </span>
                                                    )}
                                                    <span className={role.IsActive ? 'badge-success' : 'badge-warning'}>
                                                        {role.IsActive ? 'Active' : 'Inactive'}
                                                    </span>
                                                </div>
                                            </div>

                                            {role.Description && (
                                                <p className="text-muted mt-2">{role.Description}</p>
                                            )}
                                        </div>

                                        {/* Role Actions */}
                                        <div className="p-6">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center space-x-2">
                                                    {can('role', 'read') && (
                                                        <button
                                                            onClick={() => handleViewPermissions(role)}
                                                            className="flex items-center space-x-2 text-blue-600 hover:text-blue-900"
                                                            title="View Permissions"
                                                        >
                                                            <svg
                                                                xmlns="http://www.w3.org/2000/svg"
                                                                className="w-6 h-6"
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                                stroke="currentColor"
                                                            >
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    strokeWidth={2}
                                                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                                                />
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    strokeWidth={2}
                                                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                                                />
                                                            </svg>
                                                            <span className="text-sm font-medium">Permissions</span>
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="flex items-center space-x-2">
                                                    {!role.IsSystem && (
                                                        <>
                                                            {can('role', 'update') && (
                                                                <ActionButton
                                                                    actionType="edit"
                                                                    onClick={() => handleOpenForm('EDIT', role)}
                                                                    title="Edit Role"
                                                                />
                                                            )}
                                                            {can('role', 'delete') && (
                                                                <ActionButton
                                                                    actionType="delete"
                                                                    onClick={() => handleDeleteRole(role)}
                                                                    title="Delete Role"
                                                                />
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {filteredRoles.length === 0 && !loading && (
                            <div className="text-center py-12">
                                <UserGroupIcon className="mx-auto h-12 w-12 text-gray-400" />
                                <h3 className="mt-2 text-sm font-medium text-gray-900">No roles found</h3>
                                <p className="mt-1 text-sm text-gray-500">
                                    {searchTerm || filterActive !== 'all'
                                        ? 'Try adjusting your search or filters.'
                                        : can('role', 'create')
                                            ? 'Get started by creating your first role.'
                                            : 'No roles are currently available.'
                                    }
                                </p>
                                {!searchTerm && filterActive === 'all' && can('role', 'create') && (
                                    <div className="mt-6">
                                        <button
                                            onClick={() => handleOpenForm('ADD')}
                                            className="px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors btn-primary"
                                        >
                                            <PlusIcon className="h-5 w-5" />
                                            <span>Create Role</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Role Form Modal */}
                    {showForm && (
                        <div className="modal-backdrop" onClick={handleBackdropClick}>
                            <div className="w-full flex justify-center max-h-[80vh] modal-bg rounded-theme shadow-xl max-w-4xl mx-4 my-8 overflow-y-auto">
                                <RoleForm
                                    mode={formMode}
                                    role={selectedRole}
                                    onClose={handleCloseForm}
                                    onSuccess={handleFormSuccess}
                                />
                            </div>
                        </div>
                    )}

                    {/* Role Permissions Modal */}
                    {showPermissions && selectedRole && (
                        <div className="modal-backdrop" onClick={handleBackdropClick}>
                            <div className="w-full flex justify-center max-h-[80vh] modal-bg rounded-theme shadow-xl max-w-4xl mx-4 my-8 overflow-y-auto">
                                <RolePermissions
                                    role={selectedRole}
                                    onClose={() => {
                                        setShowPermissions(false);
                                        setSelectedRole(null);
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </PageLoadingWrapper>
        </ConditionalRequireAuth>
    );
};

export default RolesPage;
