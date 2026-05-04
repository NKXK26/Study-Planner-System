'use client'
//BUTTON FOR SWITCH BETWEEN LIGHT AND DARK.

import { useLightDarkMode } from "@app/context/LightDarkMode"
import { SunIcon, MoonIcon } from "@heroicons/react/24/outline"

export default function LightDarkMode() {
    const { theme, toggleThemeLightDark, mounted } = useLightDarkMode();

    //Prevent mismatch
    if (!mounted) {
        return null;
    }

    return (
        <button
            onClick={toggleThemeLightDark}
            className="fixed bottom-6 right-6 z-50 p-3 rounded-full shadow-lg transition-all duration-300 ease-in-out hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
            {theme === 'light' ? (
                <MoonIcon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
            ) : (
                <SunIcon className="h-6 w-6 text-yellow-500" />
            )}
        </button>
    )
}