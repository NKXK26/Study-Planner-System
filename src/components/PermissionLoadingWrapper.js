import React from 'react';
import { useRole } from '@app/context/RoleContext';
import LoadingSpinner from './LoadingSpinner';
import AccessDenied from './AccessDenied';

const PermissionLoadingWrapper = ({
    children,
    requiredPermission,
    resourceName,
    loadingText = 'Checking permissions...',
    showLoading = true
}) => {
    const { loading, can } = useRole();

    // Show loading spinner while permissions are being checked
    if (loading && showLoading) {
        return (
            <LoadingSpinner
                size="large"
                text={loadingText}
                fullScreen={true}
            />
        );
    }

    // Check if user has the required permission
    if (!can(requiredPermission.resource, requiredPermission.action)) {
        return (
            <AccessDenied
                requiredPermission={`${requiredPermission.resource}:${requiredPermission.action}`}
                resourceName={resourceName}
            />
        );
    }

    // User has permission, render children
    return children;
};

export default PermissionLoadingWrapper;
