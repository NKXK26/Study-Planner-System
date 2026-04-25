import React from 'react';
import LoadingSpinner from './LoadingSpinner';

const DataLoadingWrapper = ({
    children,
    isLoading,
    loadingText = 'Loading data...',
    error = null,
    errorMessage = 'An error occurred while loading data',
    showLoading = true,
    size = 'medium',
    fullScreen = false
}) => {
    // Show error state if there's an error
    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-red-500 text-6xl mb-4">⚠️</div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Error</h2>
                    <p className="text-gray-600 mb-4">{errorMessage}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="bg-[#dc2d27] text-white px-4 py-2 rounded hover:bg-[#dc2d27]/90"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    // Show loading state
    if (isLoading && showLoading) {
        return (
            <LoadingSpinner
                size={size}
                text={loadingText}
                fullScreen={fullScreen}
            />
        );
    }

    // Render children when not loading and no error
    return children;
};

export default DataLoadingWrapper;
