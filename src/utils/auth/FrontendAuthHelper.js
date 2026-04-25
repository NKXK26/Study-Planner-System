import Swal from 'sweetalert2';
import msalInstance from "@app/msalInstance";
import DataCacher from '@utils/db/DataCacher';

/**
 * SECURE Frontend Authentication Helper with Dev Override
 * Works with SecureSessionManager - sends only email, not sensitive data
 */

export default class SecureFrontendAuthHelper {

    static DataCacherObject = new DataCacher();
    /**
     * Check if dev override is enabled
     * @returns {boolean} Whether dev mode is active
     */
    static isDevMode() {
        // Desktop app — electronAPI is exposed by preload.js
        if (typeof window !== 'undefined' && window.electronAPI) {
            return true;
        }
        return process.env.NEXT_PUBLIC_MODE === 'DEV';
    }

    /**
     * Make an authenticated API request (SECURE VERSION)
     * @param {string} url - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise} Fetch response
     */
    static async authenticatedFetch(url, options = {}) {
        const isGET = (options.method == "GET" || !options.method)
        if (!isGET) {
            const staleKeys = await this.DataCacherObject.RemoveInvalidationKey(url);
        } else {
            const cachedValue = await this.DataCacherObject.GetCache(url);
            if (cachedValue != null) {
                return CreateMockResponse(cachedValue, 200);
            }
        }
        let response;
        if (this.isDevMode()) {
            const headers = {
                'Content-Type': 'application/json',
                'x-dev-override': 'true',
                ...options.headers
            };

            response = await fetch(url, {
                ...options,
                headers
            });
        } else {
            try {
                // DEV OVERRIDE: Skip authentication in dev mode
                const sessionToken = localStorage.getItem("sessionToken");

                // Get current user session
                let userProfile = null;

                if (typeof window !== "undefined") {
                    userProfile = localStorage.getItem("userProfile");
                }

                if (!userProfile) {
                    throw new Error("No user session found (client only). On SSR, use cookies or server session.");
                }

                // Parse user data
                const userData = JSON.parse(userProfile);

                if (!userData.email) {
                    throw new Error('Invalid session data');
                }

                // SECURITY: Only send email - server validates everything else
                const headers = {
                    'Content-Type': 'application/json',
                    'x-session-email': userData.email, // ONLY SEND EMAIL
                    ...options.headers
                };

                if (sessionToken) {
                    headers['Authorization'] = `Bearer ${sessionToken}`;
                }

                // Make the request
                response = await fetch(url, {
                    ...options,
                    headers
                });

                // Handle authentication errors
                if (response.status === 401 || response.status === 403) {
                    await Swal.fire({
                        icon: 'warning',
                        title: 'Session Expired',
                        text: 'Your session has expired. Please log in again.',
                        confirmButtonText: 'OK',
                        confirmButtonColor: '#3085d6',
                    });

                    this.DataCacherObject.ClearAllCache();
                    await handleLogout();
                    return response;
                }

            } catch (error) {
                console.error('Authenticated fetch error:', error);
                throw error;
            }
        }

        if (isGET) {
            const clonedResponse = response.clone();
            const data = await clonedResponse.json();
            this.DataCacherObject.SetCache(url, data);
        }
        return response;
    }

    /**
     * Get current user from session (CLIENT-SIDE ONLY)
     * @returns {Object|null} Current user or null
     */
    static getCurrentUser() {
        try {
            if (typeof window !== "undefined") {
                const userProfile = localStorage.getItem('userProfile');
                return userProfile ? JSON.parse(userProfile) : null;
            }
        } catch (error) {
            console.error('Error getting current user:', error);
            return null;
        }
    }

    /**
     * Check if user has specific role (CLIENT-SIDE DISPLAY ONLY)
     * NOTE: This is for UI display only - server always validates
     * @param {string} roleName - Role name to check
     * @returns {boolean} Whether user appears to have the role
     */
    static hasRole(roleName) {
        // DEV OVERRIDE: Grant all roles in dev mode
        if (this.isDevMode()) {
            return true;
        }

        const user = this.getCurrentUser();
        return user && user.roles && user.roles.includes(roleName);
    }

    /**
     * Check if user has any of the specified roles (CLIENT-SIDE DISPLAY ONLY)
     * @param {Array} roleNames - Array of role names
     * @returns {boolean} Whether user appears to have any of the roles
     */
    static hasAnyRole(roleNames) {
        // DEV OVERRIDE: Grant all roles in dev mode
        if (this.isDevMode()) {
            return true;
        }

        const user = this.getCurrentUser();
        if (!user || !user.roles) return false;

        return roleNames.some(role => user.roles.includes(role));
    }

    /**
     * Check if user has admin privileges (CLIENT-SIDE DISPLAY ONLY)
     * @returns {boolean} Whether user appears to have admin roles
     */
    static isAdmin() {
        // DEV OVERRIDE: Grant admin access in dev mode
        if (this.isDevMode()) {
            return true;
        }

        const user = this.getCurrentUser();
        if (!user || !user.roles) return false;
        return user.roles.some(role =>
            ['Superadmin', 'Administrator', 'Course Coordinator'].includes(role)
        );
    }

    /**
     * Check if user has student privileges (CLIENT-SIDE DISPLAY ONLY)
     * @returns {boolean} Whether user appears to have student roles
     */
    static isStudent() {
        // DEV OVERRIDE: Grant student access in dev mode
        if (this.isDevMode()) {
            return true;
        }

        const user = this.getCurrentUser();
        if (!user || !user.roles) return false;
        return user.roles.some(role =>
            ['Viewer', 'Student'].includes(role)
        );
    }

    /**
     * Logout current user
     */
    static logout() {
        localStorage.removeItem('userProfile');
        window.location.href = '/';
    }

    /**
     * Check if user is authenticated
     * @returns {boolean} Whether user is authenticated
     */
    static isAuthenticated() {
        // DEV OVERRIDE: Always authenticated in dev mode
        if (this.isDevMode()) {
            return true;
        }

        return this.getCurrentUser() !== null;
    }

    /**
     * Refresh user session from server
     * Call this periodically to ensure roles are up-to-date
     */
    static async refreshSession() {
        try {
            // DEV OVERRIDE: Skip refresh in dev mode
            if (this.isDevMode()) {
                return {
                    email: 'developer@dev.local',
                    roles: ['Superadmin'],
                    isActive: true
                };
            }

            const response = await this.authenticatedFetch('/api/auth/session-refresh');

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    // Update session storage with fresh role data
                    localStorage.setItem('userProfile', JSON.stringify({
                        email: data.user.email,
                        roles: data.user.roles,
                        isAuthenticated: true,
                        timestamp: Date.now()
                    }));
                    return data.user;
                }
            }
        } catch (error) {
            console.error('Error refreshing session:', error);
        }
        return null;
    }
}

/**
 * React Hook for using secure authentication in components
 */
export function useSecureAuth() {
    const [user, setUser] = React.useState(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        // DEV OVERRIDE: Create mock user in dev mode
        if (SecureFrontendAuthHelper.isDevMode()) {
            setUser({
                email: 'developer@dev.local',
                roles: ['Superadmin'],
                isAuthenticated: true,
                devMode: true
            });
            setLoading(false);
            return;
        }

        const currentUser = SecureFrontendAuthHelper.getCurrentUser();
        setUser(currentUser);
        setLoading(false);

        // Note: localStorage doesn't fire storage events across tabs (only within same tab)
        // This listener is kept for potential future enhancements or cross-window communication
        const handleStorageChange = (e) => {
            if (e.key === 'userProfile') {
                const newUser = e.newValue ? JSON.parse(e.newValue) : null;
                setUser(newUser);

                if (!newUser) {
                    window.location.href = '/';
                }
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    const hasRole = (roleName) => SecureFrontendAuthHelper.hasRole(roleName);
    const hasAnyRole = (roleNames) => SecureFrontendAuthHelper.hasAnyRole(roleNames);
    const isAdmin = () => SecureFrontendAuthHelper.isAdmin();
    const isStudent = () => SecureFrontendAuthHelper.isStudent();
    const logout = () => SecureFrontendAuthHelper.logout();
    const authenticatedFetch = (url, options) => SecureFrontendAuthHelper.authenticatedFetch(url, options);
    const refreshSession = () => SecureFrontendAuthHelper.refreshSession();

    return {
        user,
        loading,
        isAuthenticated: !!user || SecureFrontendAuthHelper.isDevMode(),
        hasRole,
        hasAnyRole,
        isAdmin,
        isStudent,
        logout,
        authenticatedFetch,
        refreshSession,
        isDevMode: SecureFrontendAuthHelper.isDevMode()
    };
}

// Export convenience functions
export const getCurrentUser = SecureFrontendAuthHelper.getCurrentUser.bind(SecureFrontendAuthHelper);
export const hasRole = SecureFrontendAuthHelper.hasRole.bind(SecureFrontendAuthHelper);
export const isAdmin = SecureFrontendAuthHelper.isAdmin.bind(SecureFrontendAuthHelper);
export const isStudent = SecureFrontendAuthHelper.isStudent.bind(SecureFrontendAuthHelper);
export const authenticatedFetch = SecureFrontendAuthHelper.authenticatedFetch.bind(SecureFrontendAuthHelper);

const handleLogout = (async () => {
    try {
        // const msalInstance = new PublicClientApplication(msalConfig);
        // await msalInstance.initialize();

        const account = msalInstance.getAllAccounts()[0];
        if (!account) {
            window.location.href = "/";
            console.warn("No account found to log out");
            return;
        }

        localStorage.clear();
        await msalInstance.logoutRedirect({
            account,
            postLogoutRedirectUri: "/"
        });

    } catch (error) {
        console.error("Logout failed:", error);
        alert("Logout failed. See console for details");
    }
});

function CreateMockResponse(data, status) {
    return {
        ok: status >= 200 && status < 300,
        status: status,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        // Mock the .json() method to immediately return the cached data
        json: async () => data,
        text: async () => JSON.stringify(data),
        // Mocking clone is essential if the caller tries to clone the response
        clone: () => CreateMockResponse(data, status),
    }
}