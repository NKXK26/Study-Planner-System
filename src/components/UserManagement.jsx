'use client';

import React, { useState, useEffect } from 'react';
import {
  UserIcon,
  EyeIcon,
  EyeSlashIcon,
  ShieldCheckIcon,
  PencilIcon
} from '@heroicons/react/24/outline';
import RoleAssignmentModal from '../../components/RoleAssignmentModal';
import UserEditModal from '../../components/UserEditModal';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [editingUser, setEditingUser] = useState(null);
  const [showNewRoleModal, setShowNewRoleModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

  const fetchUsers = async () => {
    try {
      const response =  await SecureFrontendAuthHelper.authenticatedFetch('/api/users?action=list');
      const data = await response.json();
      if (data.users) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await SecureFrontendAuthHelper.authenticatedFetch('/api/roles');
      const data = await response.json();
      if (Array.isArray(data)) {
        setRoles(data);
      } else if (data.roles) {
        setRoles(data.roles);
      }
    } catch (error) {
      console.error('Error fetching roles:', error);
    }
  };

  // New RBAC role assignment handler
  const handleRBACRoleAssignment = () => {
    fetchUsers();
    setShowNewRoleModal(false);
    setEditingUser(null);

    if (window.Swal) {
      window.Swal.fire({
        title: 'Success!',
        text: 'User roles assigned successfully',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      });
    }
  };

  // User edit handler
  const handleUserEdit = () => {
    fetchUsers();
    setShowEditModal(false);
    setEditingUser(null);
  };

  const handleToggleStatus = async (userId, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const action = newStatus === 'active' ? 'activate' : 'deactivate';

    try {
      const response = await SecureFrontendAuthHelper.authenticatedFetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          userId
        }),
      });

      const data = await response.json();
      if (data.success) {
        fetchUsers();

        if (window.Swal) {
          window.Swal.fire({
            title: 'Success!',
            text: `User ${newStatus} successfully`,
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
          });
        }
      } else {
        if (window.Swal) {
          window.Swal.fire({
            title: 'Error',
            text: 'Error updating user status: ' + data.error,
            icon: 'error'
          });
        }
      }
    } catch (error) {
      console.error('Error updating user status:', error);
      if (window.Swal) {
        window.Swal.fire({
          title: 'Error',
          text: 'Error updating user status',
          icon: 'error'
        });
      }
    }
  };

  const openNewRoleModal = (user) => {
    setEditingUser(user);
    setShowNewRoleModal(true);
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.FirstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.LastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.Email?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = filterRole === 'all' ||
      user.RBACRoles?.some(role => role.Role.Name === filterRole) || // RBAC ROLES
      user.Roles?.some(role => role.Name === filterRole) ||     // LEGACY ROLES
      user.UserGroupAccess?.Name === filterRole;               // LEGACY GROUP ACCESS
    const matchesStatus = filterStatus === 'all' || user.Status === filterStatus;

    return matchesSearch && matchesRole && matchesStatus;
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
        <div>
          <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
          <p className="text-gray-600">Manage user roles and permissions</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dc2d27] focus:border-transparent"
          />

          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dc2d27] focus:border-transparent"
          >
            <option value="all">All Roles</option>
            {roles.map(role => (
              <option key={role.ID} value={role.Name}>{role.Name}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#dc2d27] focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center">
                    <UserIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No users found</h3>
                    <p className="text-gray-500">Try adjusting your search or filters.</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.ID} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <UserIcon className="h-6 w-6 text-gray-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.FirstName || ''} {user.LastName || ''}
                          </div>
                          <div className="text-sm text-gray-500">{user.Email}</div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div
                          className="w-3 h-3 rounded-full mr-2"
                          style={{ backgroundColor: user.UserGroupAccess?.Color || '#dc2d27' }}
                        ></div>
                        <span className="text-sm text-gray-900 capitalize">
                          {user.UserGroupAccess?.Name || 'No role'}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${user.Status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                        }`}>
                        {user.Status || 'active'}
                      </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.LastLogin
                        ? new Date(user.LastLogin).toLocaleDateString()
                        : 'Never'
                      }
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        {/* Edit User Button */}
                        <button
                          onClick={() => {
                            setEditingUser(user);
                            setShowEditModal(true);
                          }}
                          className="text-gray-600 hover:text-gray-800 transition-colors"
                          title="Edit user"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>

                        {/* New RBAC Role Button */}
                        <button
                          onClick={() => openNewRoleModal(user)}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title="Manage RBAC roles"
                        >
                          <ShieldCheckIcon className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleToggleStatus(user.ID, user.Status)}
                          className={`transition-colors ${user.Status === 'active'
                            ? 'text-red-600 hover:text-red-800'
                            : 'text-green-600 hover:text-green-800'
                            }`}
                          title={user.Status === 'active' ? 'Deactivate user' : 'Activate user'}
                        >
                          {user.Status === 'active' ? (
                            <EyeSlashIcon className="w-4 h-4" />
                          ) : (
                            <EyeIcon className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New RBAC Role Assignment Modal */}
      <RoleAssignmentModal
        user={editingUser}
        isOpen={showNewRoleModal}
        onClose={() => setShowNewRoleModal(false)}
        onSave={handleRBACRoleAssignment}
        roles={roles}
      />

      {/* User Edit Modal */}
      <UserEditModal
        user={editingUser}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSave={handleUserEdit}
      />
    </div>
  );
};

export default UserManagement;
