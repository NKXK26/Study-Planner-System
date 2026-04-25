'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    XMarkIcon,
    UserIcon,
    ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

const UserEditModal = ({ user, isOpen, onClose, onSave }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        status: 'active'
    });
    const modalRef = useRef(null);
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

    useEffect(() => {
        if (isOpen && user) {
            setFormData({
                firstName: user.FirstName || '',
                lastName: user.LastName || '',
                status: user.Status || 'active'
            });
            setError('');
        }
    }, [isOpen, user]);

    const handleSave = async () => {
        setLoading(true);
        setError('');

        try {
            // Update user information (first name, last name)
            const response = await SecureFrontendAuthHelper.authenticatedFetch('/api/users', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.ID,
                    firstName: formData.firstName,
                    lastName: formData.lastName
                })
            });

            const data = await response.json();
            if (!data.success) {
                setError(data.error || 'Failed to update user information');
                setLoading(false);
                return;
            }

            // Update status if it has changed
            if (formData.status !== user.Status) {
                const statusAction = formData.status === 'active' ? 'activate' : 'deactivate';
                const statusResponse = await SecureFrontendAuthHelper.authenticatedFetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: statusAction,
                        userId: user.ID
                    })
                });

                const statusData = await statusResponse.json();
                if (!statusData.success) {
                    setError(statusData.error || 'Failed to update user status');
                    setLoading(false);
                    return;
                }
            }

            // Success
            onSave();
            onClose();

            if (window.Swal) {
                window.Swal.fire({
                    title: 'Success!',
                    text: 'User updated successfully',
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                });
            }
        } catch (error) {
            console.error('Error updating user:', error);
            setError('Failed to update user');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-backdrop">
            <div ref={modalRef} className="modal-bg rounded-xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-divider modal-bg rounded-t-xl">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                            <UserIcon className="w-6 h-6 text-[#dc2d27]" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-primary">Edit User</h3>
                            <p className="text-sm text-muted mt-0.5">{user?.Email}</p>
                        </div>
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

                    <div className="space-y-4">
                        {/* First Name */}
                        <div>
                            <label className="label-text block text-sm font-semibold mb-2">
                                First Name
                            </label>
                            <input
                                type="text"
                                value={formData.firstName}
                                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                                className="input-field w-full px-4 py-2.5 border-2 rounded-lg focus:ring-2 focus:ring-[#dc2d27] focus:border-[#dc2d27] transition-all"
                                placeholder="Enter first name"
                            />
                        </div>

                        {/* Last Name */}
                        <div>
                            <label className="label-text block text-sm font-semibold mb-2">
                                Last Name
                            </label>
                            <input
                                type="text"
                                value={formData.lastName}
                                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                                className="input-field w-full px-4 py-2.5 border-2 rounded-lg focus:ring-2 focus:ring-[#dc2d27] focus:border-[#dc2d27] transition-all"
                                placeholder="Enter last name"
                            />
                        </div>

                        {/* Status */}
                        <div>
                            <label className="label-text block text-sm font-semibold mb-2">
                                Status
                            </label>
                            <select
                                value={formData.status}
                                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                className="select-field w-full px-4 py-2.5 border-2 rounded-lg focus:ring-2 focus:ring-[#dc2d27] focus:border-[#dc2d27] transition-all cursor-pointer"
                            >
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                    </div>
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
                        disabled={loading}
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

export default UserEditModal;

