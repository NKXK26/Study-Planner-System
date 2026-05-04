'use client';
import { createContext, useContext, useEffect, useState } from "react";

const LightDarkModeContext = createContext();

// Components for the LIGHT/DARK MODE
export function LightDarkModeProvider({ children }) {
    const [theme, setTheme] = useState('light'); // by default it is light mode
    const [mounted, setMounted] = useState(false);

    // When first load the page, light mode will be the default (or system preference / saved preference)
    useEffect(() => {
        const savedTheme = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
        const systemPrefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');

        setTheme(initialTheme);
        setMounted(true);

        // Ensure only one of 'light' or 'dark' is present; keep other classes intact
        const html = document.documentElement;
        html.classList.remove(initialTheme === 'dark' ? 'light' : 'dark');
        html.classList.add(initialTheme);
    }, []);

    // The toggle function to SWITCH BETWEEN MODES, DARK OR LIGHT, CHOOSE UR SIDE
    const toggleThemeLightDark = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        if (typeof window !== 'undefined') {
            localStorage.setItem('theme', newTheme);
        }


        // Ensure only one of 'light' or 'dark' is present; keep other classes intact
        const html = document.documentElement;
        html.classList.remove(newTheme === 'dark' ? 'light' : 'dark');
        html.classList.add(newTheme); // New theme will be chosen
    };

    const value = {
        theme,
        toggleThemeLightDark,
        mounted
    };

    return (
        <LightDarkModeContext.Provider value={value}>
            {children}
        </LightDarkModeContext.Provider>
    );
}

export function useLightDarkMode() {
    const context = useContext(LightDarkModeContext);
    if (context === undefined) {
        throw new Error('OI SOMETHING IS WRONG WITH useLightDarkMode. ITS NOT IN THE PROVIDER!!!!');
    }
    return context;
}
