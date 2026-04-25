import { useLightDarkMode } from '@app/context/LightDarkMode';
import React from 'react';

const LoadingSpinner = ({
    size = 'medium',
    color = 'primary',
    text = 'Loading...',
    fullScreen = false,
    className = ''
}) => {
    const { theme } = useLightDarkMode();
    const isDarkMode = theme == "dark";
    const sizeClasses = {
        small: 'h-4 w-4',
        medium: 'h-8 w-8',
        large: 'h-12 w-12',
        xlarge: 'h-16 w-16'
    };

    const colorClasses = {
        primary: 'border-[#dc2d27]',
        blue: 'border-blue-500',
        gray: 'border-gray-500',
        white: 'border-white'
    };

    const spinnerSize = sizeClasses[size] || sizeClasses.medium;
    const spinnerColor = colorClasses[color] || colorClasses.primary;

    const spinner = (
        <div className={`animate-spin rounded-full border-2 border-t-2 border-b-2 ${spinnerSize} ${spinnerColor} ${className}`}></div>
    );

    if (fullScreen) {
        return (
            <div
                className={`min-h-screen flex items-center justify-center ${isDarkMode ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'
                    }`}
            >
                <div className="flex flex-col items-center justify-center p-6 rounded-xl">
                    <div className="flex items-center justify-center">
                        {spinner}
                    </div>
                    {text && (
                        <p className={`mt-4 text-center ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                            {text}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div
            className={`flex items-center justify-center ${isDarkMode ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'
                }`}
        >
            <div className="flex flex-col items-center justify-center p-6 rounded-xl">
                <div className="flex items-center justify-center">
                    {spinner}
                </div>
                {text && (
                    <p className={`mt-4 text-center ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        {text}
                    </p>
                )}
            </div>
        </div>
    );
};

export default LoadingSpinner;
