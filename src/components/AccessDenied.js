"use client";
import React from 'react';
import { useLightDarkMode } from '@app/context/LightDarkMode';

const AccessDenied = ({ requiredPermission, resourceName }) => {
    const { theme } = useLightDarkMode();
    return (
        // THEME SWITCH: AccessDenied page reacts to current theme like Dashboard
        <div className={`min-h-screen flex items-center justify-center ${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`}>
            <div className="text-center">
                <svg className="mx-auto h-16 w-16 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <h1 className={`text-2xl font-bold mb-2 ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>Access Denied</h1>
                <p className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'} mb-4`}>You don't have permission to view {resourceName}.</p>
                <p className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>Required permission: {requiredPermission}</p>
            </div>
        </div>
    );
};

export default AccessDenied;
