'use client';
import { useState, useEffect } from 'react';
import { XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import InfoTooltip from '@components/InfoTooltip';

const RoleForm = ({ mode, role, onClose, onSuccess }) => {
    const [formData, setFormData] = useState({
        Name: '',
        Description: '',
        Color: '#3B82F6',
        IsActive: true
    });
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (role && mode === 'EDIT') {
            setFormData({
                Name: role.Name || '',
                Description: role.Description || '',
                Color: role.Color || '#3B82F6',
                IsActive: role.IsActive !== undefined ? role.IsActive : true
            });
        }
    }, [role, mode]);

    const validateForm = () => {
        const newErrors = {};

        if (!formData.Name.trim()) {
            newErrors.Name = 'Role name is required';
        } else if (formData.Name.length > 50) {
            newErrors.Name = 'Role name must be less than 50 characters';
        }

        if (formData.Description && formData.Description.length > 255) {
            newErrors.Description = 'Description must be less than 255 characters';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        setLoading(true);
        try {
            const url = mode === 'EDIT' ? `/api/roles?id=${role.ID}` : '/api/roles';
            const method = mode === 'EDIT' ? 'PUT' : 'POST';

            const response = await SecureFrontendAuthHelper.authenticatedFetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            if (response.ok) {
                onSuccess();
            } else {
                const errorData = await response.json();
                if (errorData.errors) {
                    setErrors(errorData.errors);
                } else {
                    setErrors({ general: errorData.message || 'An error occurred' });
                }
            }
        } catch (error) {
            console.error('Error submitting form:', error);
            setErrors({ general: 'An error occurred while submitting the form' });
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: null }));
        }
    };

    const colorOptions = [
        '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
        '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
    ];

    return (
        <div className="w-full">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-divider">
                <h2 className="text-xl font-semibold heading-text">
                    {mode === 'EDIT' ? 'Edit Role' : 'Create New Role'}
                    <InfoTooltip
                        content={
                            mode === 'EDIT'
                                ? "Currently editing role, which is their name, description, color and their role in the system"
                                : "Create a new Role for the system, be sure to give a unique name and a description of the role, for example the purpose of this role"
                        }
                        position='right'
                        className='info-bttn'
                    />
                </h2>
                <button
                    onClick={onClose}
                    className="btn-close hover:text-gray-600 transition-colors"
                >
                    <XMarkIcon className="h-6 w-6" />
                </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {/* General Error */}
                {errors.general && (
                    <div className="badge-error px-4 py-3 rounded-lg">
                        {errors.general}
                    </div>
                )}

                {/* Role Name */}
                <div>
                    <label htmlFor="name" className="block text-sm font-medium label-text-alt mb-2">
                        Role Name *
                    </label>
                    <input
                        type="text"
                        id="name"
                        value={formData.Name}
                        onChange={(e) => handleInputChange('Name', e.target.value)}
                        className={`input-field w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-[#dc2d27] focus:border-[#dc2d27] ${errors.Name ? 'border-red-300' : 'border-gray-300'
                            }`}
                        placeholder="Enter role name"
                        disabled={role?.IsSystem}
                    />
                    {errors.Name && (
                        <p className="mt-1 text-sm text-red-600">{errors.Name}</p>
                    )}
                </div>

                {/* Description */}
                <div>
                    <label htmlFor="description" className="block text-sm font-medium label-text-alt mb-2">
                        Description
                    </label>
                    <textarea
                        id="description"
                        value={formData.Description}
                        onChange={(e) => handleInputChange('Description', e.target.value)}
                        rows={3}
                        className={`input-field w-full px-3 py-2 rounded-lg resize-none border focus:ring-2 focus:ring-[#dc2d27] focus:border-[#dc2d27] ${errors.Description ? 'border-red-300' : 'border-gray-300'
                            }`}
                        placeholder="Enter role description (optional)"
                    />
                    {errors.Description && (
                        <p className="mt-1 text-sm text-red-600">{errors.Description}</p>
                    )}
                </div>

                {/* Color Selection */}
                <div>
                    <label className="block text-sm font-medium label-text-alt mb-2">
                        Role Color
                    </label>
                    <div className="flex items-center space-x-4">
                        <div className="flex space-x-2">
                            {colorOptions.map((color) => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => handleInputChange('Color', color)}
                                    className={`w-8 h-8 rounded-full border-2 transition-all ${formData.Color === color
                                        ? 'border-gray-800 scale-110'
                                        : 'border-gray-300 hover:scale-105'
                                        }`}
                                    style={{ backgroundColor: color }}
                                    title={color}
                                />
                            ))}
                        </div>
                        <div className="flex items-center space-x-2">
                            <span className="text-sm text-muted">Custom:</span>
                            <input
                                type="color"
                                value={formData.Color}
                                onChange={(e) => handleInputChange('Color', e.target.value)}
                                className="w-8 h-8 border border-theme rounded cursor-pointer"
                            />
                        </div>
                    </div>
                </div>

                {/* Active Status */}
                <div className="flex items-center">
                    <input
                        type="checkbox"
                        id="isActive"
                        checked={formData.IsActive}
                        onChange={(e) => handleInputChange('IsActive', e.target.checked)}
                        className="h-4 w-4 text-[#dc2d27] focus:ring-[#dc2d27] border-gray-300 rounded"
                        disabled={role?.IsSystem}
                    />
                    <label htmlFor="isActive" className="ml-2 block text-sm label-text-alt">
                        Active Role
                    </label>
                    <InfoTooltip content={"To make if the role is an active role, meaning this role will be highly involved in the system"}
                        position='right'
                        className='info-bttn'></InfoTooltip>
                </div>

                {/* System Role Notice */}
                {role?.IsSystem && (
                    <div className="badge-info px-4 py-3 rounded-lg">
                        <p className="text-sm">
                            <strong>System Role:</strong> This role is protected and cannot be modified or deactivated.
                        </p>
                    </div>
                )}

                {/* Form Actions */}
                <div className="flex items-center justify-end space-x-3 pt-6">
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn-secondary px-4 py-2 rounded-lg transition-colors"
                        disabled={loading}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={loading || role?.IsSystem}
                        className="btn-primary px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                        {loading ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                <span>Saving...</span>
                            </>
                        ) : (
                            <>
                                <CheckIcon className="h-4 w-4" />
                                <span>{mode === 'EDIT' ? 'Update Role' : 'Create Role'}</span>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default RoleForm;
