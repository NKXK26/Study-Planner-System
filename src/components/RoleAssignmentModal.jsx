'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  XMarkIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

const RoleAssignmentModal = ({ user, isOpen, onClose, onSave, roles }) => {
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userRoles, setUserRoles] = useState([]);
  const modalRef = useRef(null);

  useEffect(() => {
    if (isOpen && user) {
      fetchUserRoles();
    }
  }, [isOpen, user]);

  // Add click outside handler
	useEffect(() => {
		const handleClickOutside = (event) => {
			const confirmDialog = document.querySelector('.swal2-container');
			if (confirmDialog && confirmDialog.contains(event.target)) {
				return;
			}

			if (modalRef.current && !modalRef.current.contains(event.target)) {
				onClose();
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [onClose]);

  const fetchUserRoles = async () => {
    try {
      const response = await SecureFrontendAuthHelper.authenticatedFetch(`/api/users/user-roles?userId=${user.ID}`);
      const data = await response.json();

      if (data.success) {
        const currentRoles = data.userProfile.UserRoles || [];
        setUserRoles(currentRoles);
        setSelectedRoleId(currentRoles.length > 0 ? currentRoles[0].Role.ID : null);
      }
    } catch (error) {
      console.error('Error fetching user roles:', error);
      setError('Failed to fetch current user roles');
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await SecureFrontendAuthHelper.authenticatedFetch('/api/users/user-roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.ID,
          roleIds: selectedRoleId != null ? [selectedRoleId] : [],
          assignedBy: null, // TODO: Get from auth context
          reason: 'Role assignment via UI'
        })
      });

      const data = await response.json();
      if (data.success) {
        // Check if user modified their own roles
        const currentUserProfile = localStorage.getItem('userProfile');
        if (currentUserProfile) {
          try {
            const profile = JSON.parse(currentUserProfile);
            const isModifyingSelf = profile.email === user.Email || profile.userId === user.ID;

            if (isModifyingSelf) {
              // User modified their own roles - refresh session
              const selectedRole = roles.find(r => r.ID === selectedRoleId);
              if (selectedRole) {
                // Update localStorage with new role
                const updatedProfile = {
                  ...profile,
                  roles: [selectedRole.Name]
                };
                localStorage.setItem('userProfile', JSON.stringify(updatedProfile));

                // Clear any override flags
                localStorage.removeItem('devRoleOverride');
                localStorage.removeItem('userProfile_original');

                // Update canSwitchRoles flag based on new role
                const hasSuperadminRole = /^superadmin$/i.test(selectedRole.Name);
                localStorage.setItem('canSwitchRoles', hasSuperadminRole ? 'true' : 'false');

                // Show message and reload to apply changes
                if (window.Swal) {
                  window.Swal.fire({
                    title: 'Success!',
                    text: 'Your role has been updated. The page will reload to apply changes.',
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                  }).then(() => {
                    window.location.reload();
                  });
                }

                // Fallback reload in case Swal doesn't work
                setTimeout(() => {
                  window.location.reload();
                }, 2000);
                return;
              }
            }
          } catch (profileError) {
            console.error('Error checking profile:', profileError);
          }
        }

        // If not modifying self, just close modal normally
        onSave();
        onClose();
      } else {
        setError(data.error || 'Failed to assign roles');
      }
    } catch (error) {
      console.error('Error assigning roles:', error);
      setError('Failed to assign roles');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (roleId) => {
    setSelectedRoleId(roleId);
  };

  const getRoleStatus = (roleId) => {
    const userRole = userRoles.find(ur => ur.Role.ID === roleId);
    if (userRole) {
      return {
        isAssigned: true,
        assignedAt: userRole.AssignedAt,
        expiresAt: userRole.ExpiresAt
      };
    }
    return { isAssigned: false };
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div ref={modalRef} className="modal-bg rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] my-8 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-divider modal-bg rounded-t-xl">
          <div>
            <h3 className="text-xl font-bold text-primary">
              Assign Roles to {user?.FirstName || ''} {user?.LastName || ''}
            </h3>
            <p className="text-sm text-muted mt-1 font-medium">
              {user?.Email}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-[#dc2d27] card-bg rounded-full p-2 transition-all"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 page-bg">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border-l-4 border-[#dc2d27] rounded-r-lg flex items-center space-x-3 shadow-sm">
              <ExclamationTriangleIcon className="w-5 h-5 text-[#dc2d27] flex-shrink-0" />
              <span className="text-red-800 text-sm">{error}</span>
            </div>
          )}

          <div className="mb-6 p-4 card-bg border-l-4 border-[#dc2d27] rounded-r-lg flex items-center space-x-3 shadow-sm">
            <InformationCircleIcon className="w-5 h-5 text-[#dc2d27] flex-shrink-0" />
            <span className="text-primary text-sm font-medium">
              Select a single role to assign to this user.
            </span>
          </div>

          {/* Role Selection (Single Select) */}
          <div className="space-y-3">
            {roles.map(role => {
              const roleStatus = getRoleStatus(role.ID);
              const isSelected = selectedRoleId === role.ID;

              return (
                <label
                  key={role.ID}
                  className={`flex items-start space-x-4 p-4 border-2 rounded-xl cursor-pointer transition-all ${isSelected
                    ? 'border-[#dc2d27] card-bg shadow-md ring-2 ring-[#dc2d27]/20'
                    : 'border-divider card-bg hover:border-red-300 hover:shadow-sm'
                    }`}
                >
                  <input
                    type="radio"
                    name="role"
                    checked={isSelected}
                    onChange={() => handleRoleChange(role.ID)}
                    className="mt-1.5 w-5 h-5 rounded-full border-gray-300 text-[#dc2d27] focus:ring-[#dc2d27] focus:ring-2 cursor-pointer"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-2">
                      <div
                        className="w-4 h-4 rounded-full shadow-sm flex-shrink-0"
                        style={{ backgroundColor: role.Color || '#6B7280' }}
                      />
                      <span className="font-bold text-primary text-lg">{role.Name}</span>
                      {roleStatus.isAssigned && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200 ">
                          <CheckIcon className="w-3.5 h-3.5 mr-1" />
                          Assigned
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-muted mb-3 leading-relaxed">{role.Description}</p>

                    {roleStatus.isAssigned && (
                      <div className="text-xs text-muted card-bg rounded-lg px-3 py-2 mb-2 inline-block border border-divider">
                        <span className="font-medium">Assigned: {new Date(roleStatus.assignedAt).toLocaleDateString()}</span>
                        {roleStatus.expiresAt && (
                          <span className="ml-3 font-medium">
                            Expires: {new Date(roleStatus.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Role Priority */}
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold text-muted">Priority:</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md card-bg text-primary text-xs font-bold border border-divider">
                        {role.Priority}
                      </span>
                      <span className="text-xs text-muted">
                        {role.Priority === 0 && '(Lowest)'}
                        {role.Priority === 1 && '(Highest)'}
                        {role.Priority > 1 && role.Priority < 5 && `(Level ${role.Priority})`}
                        {role.Priority === 5 && '(Level 5)'}
                      </span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {roles.length === 0 && (
            <div className="text-center py-12 text-muted card-bg rounded-lg border-2 border-dashed border-divider">
              <p className="text-lg font-medium">No roles available to assign</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-6 border-t border-divider modal-bg rounded-b-xl">
          <button
            onClick={onClose}
            className="btn-cancel px-6 py-2.5 border-2 rounded-lg font-semibold transition-all shadow-sm"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || selectedRoleId == null}
            className="btn-primary px-6 py-2.5 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
          >
            {loading ? (
              <span className="flex items-center space-x-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Saving...</span>
              </span>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoleAssignmentModal;
