import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';

const RoleContext = createContext({
    roles: [],
    selectedRoleName: '',
    permissions: [],
    loading: false,
    userActualRoles: [], // User's actual roles from database
    canSwitchRoles: false, // Whether user can switch roles
    setSelectedRoleByName: () => { },
    resetOverride: () => { },
    can: () => false,
    isSuperadmin: () => false, // Check if current role is Superadmin
});

export const RoleProvider = ({ children }) => {
    const [roles, setRoles] = useState([]);
    const [selectedRoleName, setSelectedRoleName] = useState('');
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [userActualRoles, setUserActualRoles] = useState([]);
    const [canSwitchRoles, setCanSwitchRoles] = useState(false);

    // load roles and initial selected role from session
    useEffect(() => {
        async function init() {
            try {
                setLoading(true);

                // Check if user is authenticated before trying to fetch roles
                if (!SecureFrontendAuthHelper.isAuthenticated()) {
                    console.log('User not authenticated, skipping role initialization');
                    setLoading(false);
                    return;
                }

                // In DEV mode, always enable role switching
                const isDevMode = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_MODE === 'DEV';

                // Restore canSwitchRoles flag from localStorage immediately to prevent it from disappearing
                const persistedCanSwitch = localStorage.getItem('canSwitchRoles');
                if (persistedCanSwitch === 'true' || isDevMode) {
                    setCanSwitchRoles(true);
                }

                // Restore userActualRoles from localStorage if available
                try {
                    const originalProfile = localStorage.getItem('userProfile_original');
                    const rawProfile = originalProfile || localStorage.getItem('userProfile');
                    const profile = rawProfile ? JSON.parse(rawProfile) : null;
                    if (profile && Array.isArray(profile.roles) && profile.roles.length > 0) {
                        setUserActualRoles(profile.roles);
                    }
                } catch { /* ignore */ }

                // In DEV mode, create mock user profile if it doesn't exist
                if (isDevMode && !localStorage.getItem('userProfile')) {
                    console.log('🔧 DEV MODE: Creating mock user profile with Superadmin role');
                    const devProfile = {
                        email: 'developer@dev.local',
                        roles: ['Superadmin'],
                        isAuthenticated: true,
                        devMode: true,
                        timestamp: Date.now()
                    };
                }

                const resp = await SecureFrontendAuthHelper.authenticatedFetch('/api/roles');
                if (resp.ok) {
					const data = await resp.json();
					console.log('data', data)
                    const roleNames = Array.isArray(data) ? data.map(r => r.Name || r.name).filter(Boolean) : [];
                    setRoles(roleNames);
                    // Determine initial role from authenticated user profile in localStorage
                    // Do not default to Superadmin; use first assigned role or fallback to first available role
                    let initialRoleName = '';
                    let actualUserRoles = [];
                    try {
                        // First check if we have stored original roles (for when user switches roles)
                        const originalProfile = localStorage.getItem('userProfile_original');
                        const rawProfile = originalProfile || localStorage.getItem('userProfile');
                        const profile = rawProfile ? JSON.parse(rawProfile) : null;
                        if (profile && Array.isArray(profile.roles) && profile.roles.length > 0) {
                            // Store user's actual roles from database (from original profile if available)
                            actualUserRoles = profile.roles.filter(r => roleNames.includes(r));
                            setUserActualRoles(actualUserRoles);

                            // Check if user can switch roles (has superadmin role in their actual roles or in DEV mode)
                            const hasSuperadminRole = actualUserRoles.some(role => /^superadmin$/i.test(role));
                            setCanSwitchRoles(hasSuperadminRole || isDevMode);

                            // Persist canSwitchRoles flag in localStorage
                            localStorage.setItem('canSwitchRoles', (hasSuperadminRole || isDevMode) ? 'true' : 'false');

                            // For the selected role, use the current profile (which may be overridden)
                            const currentProfile = localStorage.getItem('userProfile');
                            const currentParsed = currentProfile ? JSON.parse(currentProfile) : profile;
                            const userAssigned = currentParsed.roles.find(r => roleNames.includes(r)) || currentParsed.roles[0];
                            initialRoleName = userAssigned;
                        }
                    } catch { /* ignore */ }

                    // In case no user profile or roles, pick the first available role to avoid blank state
                    if (!initialRoleName && roleNames.length > 0) {
                        initialRoleName = roleNames[0];
                    }

                    setSelectedRoleName(initialRoleName);
                    await fetchPermissionsForRoleName(initialRoleName);
                } else {
                    console.error('Failed to fetch roles:', resp.statusText);
                }
            } catch (error) {
                console.error('Error initializing roles:', error);
                // Set loading to false even on error to prevent infinite loading state
                setLoading(false);
            } finally {
                setLoading(false);
            }
        }
        init();
    }, []);

    // Listen for RBAC update events to refresh permissions live
    useEffect(() => {
        const handleRbacUpdated = () => {
            if (selectedRoleName) {
                fetchPermissionsForRoleName(selectedRoleName);
            }
        };
        window.addEventListener('rbac:permissions-updated', handleRbacUpdated);
        return () => window.removeEventListener('rbac:permissions-updated', handleRbacUpdated);
    }, [selectedRoleName]);

    // helper to fetch permissions by role name
    const fetchPermissionsForRoleName = async (roleName) => {
        try {
            if (!roleName) { setPermissions([]); localStorage.removeItem('devPermissions'); localStorage.removeItem('devSelectedRole'); return; }

            // Check if user is authenticated before fetching permissions
            if (!SecureFrontendAuthHelper.isAuthenticated()) {
                setPermissions([]);
                return;
            }

            // We need role id; fetch roles with names+IDs
            const resp = await SecureFrontendAuthHelper.authenticatedFetch('/api/roles?return=ID,Name');
            if (!resp.ok) {
                setPermissions([]);
                return;
            }
            const all = await resp.json();

            const found = Array.isArray(all) ? all.find(r => (r.Name || r.name) === roleName) : null;
            if (!found) {
                setPermissions([]);
                return;
            }

            const id = found.ID || found.id;
            const permResp = await SecureFrontendAuthHelper.authenticatedFetch(`/api/roles/${id}/permissions`);
            if (!permResp.ok) {
                setPermissions([]);
                return;
            }

            const payload = await permResp.json();

            let perms = Array.isArray(payload.permissions) ? payload.permissions
                .filter(p => p.Granted)
                .map(p => `${p.Resource}:${p.Action}`) : [];

            // Normalize known plural resources to singular used in can() checks
            const resourceAliasMap = {
                courses: 'course',
                students: 'student',
                units: 'unit',
                unit_types: 'unit_type',
                roles: 'role',
                users: 'user',
                terms: 'term',
                study_plans: 'study_plans',
                intakes: 'intakes',
                search_students: 'search_students',
                student_info: 'student_info',
                dashboard: 'dashboard'
            };
            perms = perms.map(pair => {
                const [resource, action] = pair.split(':');
                const normalized = resourceAliasMap[resource] || resource;
                return `${normalized}:${action}`;
            });

            // Fallback: if Superadmin (or similar) and no explicit permissions, grant wildcard
            if ((!perms || perms.length === 0) && /super\s*admin/i.test(roleName)) {
                perms = ['*:*'];
            }

            setPermissions(perms);
            // persist for headers usage
            localStorage.setItem('devPermissions', JSON.stringify(perms));
            localStorage.setItem('devSelectedRole', roleName);

            console.log('Final permissions set:', perms);
        } catch (e) {
            console.error('Error fetching permissions:', e);
            setPermissions([]);
            localStorage.removeItem('devPermissions');
        }
    };

    const setSelectedRoleByName = async (roleName) => {
        // In production, do not allow arbitrary role override via session flags
        const isDevMode = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_MODE === 'DEV';
        const actualRoleName = roleName || selectedRoleName || '';
        setSelectedRoleName(actualRoleName);

        // Always fetch permissions, even if no userProfile
        await fetchPermissionsForRoleName(actualRoleName);

        try {
            const raw = localStorage.getItem('userProfile');
            if (!raw) {
                return;
            }
            if (!localStorage.getItem('userProfile_original')) {
                localStorage.setItem('userProfile_original', raw);
            }
            const obj = JSON.parse(raw);
            const updated = { ...obj, roles: [actualRoleName] };
            localStorage.setItem('userProfile', JSON.stringify(updated));
            if (isDevMode) {
                localStorage.setItem('devRoleOverride', '1');
                localStorage.setItem('devSelectedRole', actualRoleName);
            } else {
                localStorage.removeItem('devRoleOverride');
                localStorage.removeItem('devSelectedRole');
            }
        } catch (e) {
            console.error('Error in setSelectedRoleByName:', e);
        }
    };

    const resetOverride = () => {
        try {
            const backup = localStorage.getItem('userProfile_original');
            if (backup) {
                localStorage.setItem('userProfile', backup);
            }
            localStorage.removeItem('devRoleOverride');
            localStorage.removeItem('userProfile_original');
            localStorage.removeItem('devSelectedRole');
            localStorage.removeItem('devPermissions');
            // NOTE: Do NOT remove 'canSwitchRoles' - it should persist

            // Reset to the original assigned role from restored profile
            try {
                const restored = localStorage.getItem('userProfile');
                const obj = restored ? JSON.parse(restored) : null;
                const roleName = obj && Array.isArray(obj.roles) && obj.roles.length > 0 ? obj.roles[0] : '';

                // Restore userActualRoles
                if (obj && Array.isArray(obj.roles) && obj.roles.length > 0) {
                    setUserActualRoles(obj.roles);
                }

                setSelectedRoleName(roleName);
                fetchPermissionsForRoleName(roleName);
            } catch { /* ignore */ }
        } catch { }
    };

    const can = useMemo(() => {
        const permsSet = new Set(permissions || []);
        return (resource, action) => {
            // In production do not grant blanket access by selected role name alone
            // Only rely on explicit permissions
            if (!permsSet.size) {
                return false;
            }
            // direct match
            if (permsSet.has(`${resource}:${action}`)) {
                return true;
            }
            // wildcards
            if (permsSet.has(`${resource}:*`)) {
                return true;
            }
            if (permsSet.has(`*:${action}`)) {
                return true;
            }
            if (permsSet.has(`*:*`)) {
                return true;
            }
            // manage implies all actions for that resource
            if (permsSet.has(`${resource}:manage`)) {
                return true;
            }
            return false;
        };
    }, [permissions, selectedRoleName]);

    // Check if current selected role is Superadmin
    const isSuperadmin = useMemo(() => {
        return () => {
            return selectedRoleName && /^superadmin$/i.test(selectedRoleName);
        };
    }, [selectedRoleName]);

    const value = {
        roles,
        selectedRoleName,
        permissions,
        loading,
        userActualRoles,
        canSwitchRoles,
        setSelectedRoleByName,
        resetOverride,
        can,
        isSuperadmin
    };
    return (
        <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
    );
};

export const useRole = () => useContext(RoleContext);