// Create: /utils/auth/DevOverride.js
// DEVELOPMENT OVERRIDE SYSTEM WITH SAFETY CHECKS

export class DevOverride {

    /**
     * Check if dev override is enabled
     * CRITICAL: Only works in development environment
     */
    static isEnabled() {
        // SAFETY CHECK 1: Only work in development
        if (process.env.NODE_ENV === 'production') {
            console.warn('🚨 Dev override attempted in production - BLOCKED');
            return false;
        }

        // SAFETY CHECK 2: Require explicit environment variable
        const devMode = process.env.NEXT_PUBLIC_MODE;
        const isDevOverride = devMode === 'DEV' && process.env.NODE_ENV === 'development';

        if (isDevOverride) {
            console.warn('⚠️  DEV OVERRIDE ACTIVE - All permissions granted');
        }

        return isDevOverride;
    }

    /**
     * Get development user object with all permissions
     */
    static getDevUser() {
        if (!this.isEnabled()) {
            return null;
        }

        return {
            id: 'dev_override',
            profileId: 'dev_override',
            email: 'developer@dev.local',
            roles: ['Superadmin'],
            isActive: true,
            isDeveloper: true,
            devOverride: true
        };
    }

    /**
     * Check if user has permission (dev override version)
     */
    static hasPermission(permission) {
        if (!this.isEnabled()) {
            return false;
        }

        // Dev override grants ALL permissions
        console.log(`🔧 Dev Override: Granting permission "${permission}"`);
        return true;
    }

    /**
     * Frontend session data for dev override
     */
    static getDevSessionData() {
        if (!this.isEnabled()) {
            return null;
        }

        return {
            email: 'developer@dev.local',
            roles: ['Superadmin'],
            isAuthenticated: true,
            devOverride: true,
            timestamp: Date.now()
        };
    }
}