import React from 'react';
import { useRole } from '@app/context/RoleContext';
import LoadingSpinner from './LoadingSpinner';
import AccessDenied from './AccessDenied';
import DataLoadingWrapper from './DataLoadingWrapper';

const PageLoadingWrapper = ({
    children,
    requiredPermission,
    resourceName,
    isLoading = false,
    loadingText = 'Loading page...',
    error = null,
    errorMessage = 'An error occurred while loading the page',
    showPermissionLoading = true,
    showDataLoading = true
}) => {
    const { loading: permissionLoading, can } = useRole();

    // Show permission loading first
    if (permissionLoading && showPermissionLoading) {
        return (
            <LoadingSpinner
                size="large"
                text="Checking permissions..."
                fullScreen={true}
            />
        );
    }

    // Check permissions
    if (!can(requiredPermission.resource, requiredPermission.action)) {
        return (
            <AccessDenied
                requiredPermission={`${requiredPermission.resource}:${requiredPermission.action}`}
                resourceName={resourceName}
            />
        );
    }

    // Show data loading
    return (
        <DataLoadingWrapper
            isLoading={isLoading}
            loadingText={loadingText}
            error={error}
            errorMessage={errorMessage}
            showLoading={showDataLoading}
            size="large"
            fullScreen={true}
        >
            {children}
        </DataLoadingWrapper>
    );
};

export default PageLoadingWrapper;
