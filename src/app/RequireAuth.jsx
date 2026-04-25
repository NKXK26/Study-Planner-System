'use client';

import { useEffect, useState } from "react";
import msalInstance from "./msalInstance"; // Update path if needed
import { redirect } from "@components/helper";

export default function RequireAuth({ children }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const checkAuth = async () => {
            // First check localStorage for user profile (faster and more reliable)
            const storedProfile = localStorage.getItem('userProfile');

            if (storedProfile) {
                try {
                    const profile = JSON.parse(storedProfile);
                    if (profile && profile.email) {
                        console.log('User authenticated via localStorage:', profile.email);

                        // Validate with server to ensure user still exists and is authorized
                        const validationResult = await validateSessionWithServer(profile.email);

                        // If validation explicitly says user is invalid, deny access
                        if (validationResult.isValid === false) {
                            // User is not valid on server (deleted/deactivated/no roles)
                            console.warn('User profile invalid on server, clearing cache');
                            localStorage.removeItem('userProfile');
                            setIsAuthenticated(false);
                            setIsReady(true);
                            return;
                        }

                        // If validation succeeded or couldn't connect to server (but cached profile exists)
                        // Update cached profile with current roles from server if available
                        if (validationResult.user && validationResult.user.roles) {
                            const updatedProfile = {
                                ...profile,
                                roles: validationResult.user.roles
                            };
                            localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
                            console.log('Updated cached roles:', validationResult.user.roles);
                        }

                        setIsAuthenticated(true);
                        setIsReady(true);

                        // Initialize MSAL in background for consistency
                        msalInstance.initialize().then(() => {
                            const accounts = msalInstance.getAllAccounts();
                            if (accounts.length > 0) {
                                msalInstance.setActiveAccount(accounts[0]);
                            }
                        }).catch(err => {
                            console.warn('MSAL initialization warning:', err);
                        });

                        return;
                    }
                } catch (error) {
                    console.error('Error parsing stored profile:', error);
                    localStorage.removeItem('userProfile');
                }
            }

            // Fallback to MSAL check if no localStorage profile
            await msalInstance.initialize();
            const accounts = msalInstance.getAllAccounts();
            console.log('accounts', accounts)

            if (accounts.length > 0) {
                msalInstance.setActiveAccount(accounts[0]);
                setIsAuthenticated(true);
            }

            setIsReady(true);
        };

        // Validate session with server
        const validateSessionWithServer = async (email) => {
            try {
                const sessionToken = localStorage.getItem('sessionToken');
                const response = await fetch('/api/auth/user-login', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionToken}`,
                        'x-session-email': email
                    },
                    body: JSON.stringify({ email })
                });

                if (response.ok) {
                    const data = await response.json();
                    return {
                        isValid: data.success && data.isValid,
                        user: data.user
                    };
                }
                // Server returned an error - treat as explicitly invalid
                if (response.status === 401 || response.status === 403) {
                    return { isValid: false, user: null };
                }
                // Other errors (network issues, etc) - return null to allow cached access
                console.warn(`Session validation returned status ${response.status}, allowing cached access`);
                return { isValid: null, user: null };
            } catch (error) {
                console.error('Session validation error:', error);
                // Network error - allow cached access
                return { isValid: null, user: null };
            }
        };

        // Listen for cache invalidation messages from other tabs
        const handleStorageChange = (e) => {
            if (e.key === 'userProfile' && e.newValue === null) {
                // Cache was cleared - user was likely deleted/deactivated
                console.log('Detected cache invalidation from another tab');
                setIsAuthenticated(false);
            }
        };

        // Listen for broadcast messages about auth changes
        const handleAuthStatusChange = (e) => {
            if (e.detail && e.detail.action === 'INVALIDATE_CACHE') {
                console.log('Received auth invalidation event:', e.detail);
                localStorage.removeItem('userProfile');
                localStorage.removeItem('sessionToken');
                setIsAuthenticated(false);
            }
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('authStatusChange', handleAuthStatusChange);

        checkAuth();

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('authStatusChange', handleAuthStatusChange);
        };
    }, []);

    if (!isReady) {
        return (
            <div className="page-bg min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#dc2d27] mx-auto"></div>
                    <p className="text-muted mt-4">
                        Checking login...
                    </p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div className="page-bg min-h-screen text-center align-middle flex items-center flex-col justify-center">
                {/* this happens when user tries to access any pages without logging in */}
                <h1 className="text-4xl font-bold text-red-600 mb-3">Access Denied</h1>
                <p className="text-muted mb-4">You must log in to view this page.</p>
                <button onClick={() => redirect("/")} className="bg-[#dc2d27] text-white border-none py-3 px-8 rounded-md text-base cursor-pointer transition-colors hover:bg-red-800 disabled:opacity-50 mt-3">Go to Login Page</button>
            </div>
        );
    }

    return children;
}
