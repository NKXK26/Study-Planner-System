'use client';

import React, { useState, useEffect } from 'react';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  EyeSlashIcon,
  UserIcon,
  ShieldCheckIcon,
  CogIcon
} from '@heroicons/react/24/outline';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

const RoleManagement = () => {
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#dc2d27',
    priority: 0,
    // parentRoleID: null, // Temporarily disabled
    // inheritPermissions: true, // Temporarily disabled
    permissions: [],
    isActive: true
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState('all');

  const availableModules = [
    { id: 'course', name: 'Course Management', icon: '📚' },
    { id: 'student', name: 'Student Management', icon: '👥' },
    { id: 'unit', name: 'Unit Management', icon: '📖' },
    { id: 'term', name: 'Term Management', icon: '📅' },
    { id: 'major', name: 'Major Management', icon: '🎯' },
    { id: 'study_planner', name: 'Study Planner', icon: '📋' },
    { id: 'user_management', name: 'User Management', icon: '⚙️' }
  ];

  const availablePermissions = [
    { id: 'read', name: 'Read', description: 'View data', color: 'bg-blue-100 text-blue-800' },
    { id: 'write', name: 'Write', description: 'Create/Update data', color: 'bg-green-100 text-green-800' },
    { id: 'delete', name: 'Delete', description: 'Remove data', color: 'bg-red-100 text-red-800' },
    { id: 'admin', name: 'Admin', description: 'Full control', color: 'bg-purple-100 text-purple-800' }
  ];

  const colorOptions = [
    '#dc2d27', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
    '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#ec4899'
  ];

  useEffect(() => {
    fetchRoles();
    fetchUsers();
  }, []);

  const fetchRoles = async () => {
    try {
      const response =  await SecureFrontendAuthHelper.authenticatedFetch('/api/roles?action=list');
      const data = await response.json();
      if (data.roles) {
        setRoles(data.roles);
      }
    } catch (error) {
      console.error('Error fetching roles:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response =  await SecureFrontendAuthHelper.authenticatedFetch('/api/users?action=list');
      const data = await response.json();
      if (data.users) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    try {
      const response =  await SecureFrontendAuthHelper.authenticatedFetch('/api/roles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create',
          ...formData
        }),
      });

      const data = await response.json();
      if (data.success) {
        setShowCreateForm(false);
        setFormData({ name: '', description: '', color: '#dc2d27', permissions: [], isActive: true });
        fetchRoles();

        // Show success message
        if (window.Swal) {
          window.Swal.fire({
            title: 'Success!',
            text: 'Role created successfully',
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
          });
        }
      } else {
        if (window.Swal) {
          window.Swal.fire({
            title: 'Error',
            text: 'Error creating role: ' + data.error,
            icon: 'error'
          });
        }
      }
    } catch (error) {
      console.error('Error creating role:', error);
      if (window.Swal) {
        window.Swal.fire({
          title: 'Error',
          text: 'Error creating role',
          icon: 'error'
        });
      }
    }
  };

  const handleEditRole = async (e) => {
    e.preventDefault();
    try {
      const response =  await SecureFrontendAuthHelper.authenticatedFetch('/api/roles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update',
          id: selectedRole.ID,
          ...formData
        }),
      });

      const data = await response.json();
      if (data.success) {
        setShowEditForm(false);
        setSelectedRole(null);
        setFormData({ name: '', description: '', color: '#dc2d27', permissions: [], isActive: true });
        fetchRoles();

        if (window.Swal) {
          window.Swal.fire({
            title: 'Success!',
            text: 'Role updated successfully',
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
          });
        }
      } else {
        if (window.Swal) {
          window.Swal.fire({
            title: 'Error',
            text: 'Error updating role: ' + data.error,
            icon: 'error'
          });
        }
      }
    } catch (error) {
      console.error('Error updating role:', error);
      if (window.Swal) {
        window.Swal.fire({
          title: 'Error',
          text: 'Error updating role',
          icon: 'error'
        });
      }
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (window.Swal) {
      const result = await window.Swal.fire({
        title: 'Are you sure?',
        text: "You won't be able to revert this!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2d27',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Yes, delete it!'
      });

      if (result.isConfirmed) {
        try {
          const response =  await SecureFrontendAuthHelper.authenticatedFetch('/api/roles', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'delete',
              roleId
            }),
          });

          const data = await response.json();
          if (data.success) {
            fetchRoles();
            window.Swal.fire({
              title: 'Deleted!',
              text: 'Role has been deleted.',
              icon: 'success',
              timer: 2000,
              showConfirmButton: false
            });
          } else {
            window.Swal.fire({
              title: 'Error',
              text: 'Error deleting role: ' + data.error,
              icon: 'error'
            });
          }
        } catch (error) {
          console.error('Error deleting role:', error);
          window.Swal.fire({
            title: 'Error',
            text: 'Error deleting role',
            icon: 'error'
          });
        }
      }
    }
  };

  const togglePermission = (module, permission) => {
    const newPermissions = [...formData.permissions];
    const existingIndex = newPermissions.findIndex(
      p => p.module === module && p.permission === permission
    );

    if (existingIndex >= 0) {
      newPermissions.splice(existingIndex, 1);
    } else {
      newPermissions.push({ module, permission });
    }

    setFormData({ ...formData, permissions: newPermissions });
  };

  const openEditForm = (role) => {
    setSelectedRole(role);
    setFormData({
      name: role.Name,
      description: role.Description || '',
      color: role.Color || '#dc2d27',
      priority: role.Priority || 0,
      // parentRoleID: role.ParentRoleID || null, // Temporarily disabled
      // inheritPermissions: role.InheritPermissions !== false, // Temporarily disabled
      permissions: role.RolePermissions?.map(p => ({
        module: p.Module,
        permission: p.Permission
      })) || [],
      isActive: role.IsActive !== false
    });
    setShowEditForm(true);
  };

  const filteredRoles = roles.filter(role => {
    const matchesSearch = role.Name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      role.Description?.toLowerCase().includes(searchTerm.toLowerCase());

    if (filterActive === 'all') return matchesSearch;
    if (filterActive === 'active') return matchesSearch && role.IsActive !== false;
    if (filterActive === 'inactive') return matchesSearch && role.IsActive === false;

    return matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#dc2d27]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Search and Filters */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-[#dc2d27] text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            <PlusIcon className="w-5 h-5" />
            Create New Role
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search roles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dc2d27] focus:border-transparent"
          />

          <select
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dc2d27] focus:border-transparent"
          >
            <option value="all">All Roles</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Create Role Form */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <PlusIcon className="w-6 h-6 text-[#dc2d27]" />
              Create New Role
            </h2>
            <form onSubmit={handleCreateRole}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Role Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dc2d27] focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Role Color</label>
                  <div className="flex gap-2">
                    {colorOptions.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, color })}
                        className={`w-8 h-8 rounded-full border-2 ${formData.color === color ? 'border-gray-800' : 'border-gray-300'}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dc2d27] focus:border-transparent"
                  rows="3"
                  placeholder="Describe what this role can do..."
                />
              </div>

              {/* Role Hierarchy Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dc2d27] focus:border-transparent"
                  >
                    {[0, 1, 2, 3, 4, 5].map(priority => (
                      <option key={priority} value={priority}>
                        {priority} - {priority === 0 ? 'Lowest' : priority === 5 ? 'Highest' : `Level ${priority}`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Temporarily disabled - Parent Role functionality
                <div>
                  <label className="block text-sm font-medium mb-2">Parent Role (Optional)</label>
                  <select
                    value={formData.parentRoleID || ''}
                    onChange={(e) => setFormData({ ...formData, parentRoleID: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dc2d27] focus:border-transparent"
                  >
                    <option value="">No parent role</option>
                    {roles.filter(role => role.ID !== selectedRole?.ID).map(role => (
                      <option key={role.ID} value={role.ID}>
                        {role.Name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Inherit Permissions</label>
                  <div className="flex items-center space-x2 mt-2">
                    <input
                      type="checkbox"
                      id="inheritPermissions"
                      checked={formData.inheritPermissions}
                      onChange={(e) => setFormData({ ...formData, inheritPermissions: e.target.checked })}
                      className="rounded border-gray-300 text-[#dc2d27] focus:ring-[#dc2d27]"
                    />
                    <label htmlFor="inheritPermissions" className="text-sm text-gray-700">
                      Inherit permissions from parent role
                    </label>
                  </div>
                </div>
                */}
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Permissions</label>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {availableModules.map(module => (
                    <div key={module.id} className="border border-gray-200 rounded-lg p-4">
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <span>{module.icon}</span>
                        {module.name}
                      </h4>
                      <div className="space-y-2">
                        {availablePermissions.map(permission => (
                          <label key={permission.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formData.permissions.some(
                                p => p.module === module.id && p.permission === permission.id
                              )}
                              onChange={() => togglePermission(module.id, permission.id)}
                              className="rounded border-gray-300 text-[#dc2d27] focus:ring-[#dc2d27]"
                            />
                            <span className={`px-2 py-1 rounded text-xs font-medium ${permission.color}`}>
                              {permission.name}
                            </span>
                            <span className="text-xs text-gray-500">{permission.description}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#dc2d27] text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Create Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Role Form */}
      {showEditForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <PencilIcon className="w-6 h-6 text-[#dc2d27]" />
              Edit Role: {selectedRole?.Name}
            </h2>
            <form onSubmit={handleEditRole}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Role Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dc2d27] focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Role Color</label>
                  <div className="flex gap-2">
                    {colorOptions.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, color })}
                        className={`w-8 h-8 rounded-full border-2 ${formData.color === color ? 'border-gray-800' : 'border-gray-300'}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dc2d27] focus:border-transparent"
                  rows="3"
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Permissions</label>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {availableModules.map(module => (
                    <div key={module.id} className="border border-gray-200 rounded-lg p-4">
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <span>{module.icon}</span>
                        {module.name}
                      </h4>
                      <div className="space-y-2">
                        {availablePermissions.map(permission => (
                          <label key={permission.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formData.permissions.some(
                                p => p.module === module.id && p.permission === permission.id
                              )}
                              onChange={() => togglePermission(module.id, permission.id)}
                              className="rounded border-gray-300 text-[#dc2d27] focus:ring-[#dc2d27]"
                            />
                            <span className={`px-2 py-1 rounded text-xs font-medium ${permission.color}`}>
                              {permission.name}
                            </span>
                            <span className="text-xs text-gray-500">{permission.description}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowEditForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#dc2d27] text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Update Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Roles Grid */}
      <div className="grid gap-6">
        {filteredRoles.length === 0 ? (
          <div className="text-center py-12">
            <ShieldCheckIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No roles found</h3>
            <p className="text-gray-500">Get started by creating your first role.</p>
          </div>
        ) : (
          filteredRoles.map(role => (
            <div key={role.ID} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: role.Color || '#dc2d27' }}
                  ></div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">{role.Name}</h3>
                    <p className="text-gray-600">{role.Description || 'No description'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${role.IsActive !== false
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                    }`}>
                    {role.IsActive !== false ? 'Active' : 'Inactive'}
                  </span>

                  <div className="flex gap-1">
                    <button
                      onClick={() => openEditForm(role)}
                      className="p-2 text-gray-600 hover:text-[#dc2d27] hover:bg-gray-100 rounded-lg transition-colors"
                      title="Edit role"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>

                    {role.User?.length === 0 && (
                      <button
                        onClick={() => handleDeleteRole(role.ID)}
                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete role"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Permissions */}
              <div className="mb-4">
                <h4 className="font-medium mb-2 text-gray-700">Permissions:</h4>
                <div className="flex flex-wrap gap-2">
                  {role.RolePermissions?.map(permission => {
                    const permInfo = availablePermissions.find(p => p.id === permission.Permission);
                    const moduleInfo = availableModules.find(m => m.id === permission.Module);
                    return (
                      <span
                        key={`${permission.Module}-${permission.Permission}`}
                        className={`px-2 py-1 rounded text-xs font-medium ${permInfo?.color || 'bg-gray-100 text-gray-800'}`}
                        title={`${moduleInfo?.name || permission.Module}: ${permInfo?.name || permission.Permission}`}
                      >
                        {moduleInfo?.icon} {moduleInfo?.name || permission.Module}: {permInfo?.name || permission.Permission}
                      </span>
                    );
                  }) || (
                      <span className="text-gray-500 text-sm">No permissions assigned</span>
                    )}
                </div>
              </div>

              {/* Users with this role */}
              {role.User && role.User.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 text-gray-700 flex items-center gap-2">
                    <UserIcon className="w-4 h-4" />
                    Users with this role ({role.User.length}):
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {role.User.map(user => (
                      <div key={user.ID} className="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                        <span className="text-sm text-gray-700">
                          {user.FirstName || ''} {user.LastName || ''}
                        </span>
                        <span className="text-xs text-gray-500">{user.Email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RoleManagement; 