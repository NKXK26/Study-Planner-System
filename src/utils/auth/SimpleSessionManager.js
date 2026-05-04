import jwt from 'jsonwebtoken';

export default class SecureSessionManager {
    static SESSION_SECRET = process.env.SESSION_SECRET;
    static APP_ID = process.env.NEXT_PUBLIC_CLIENT_ID;
    static async CreateSession(msalToken = null, dev_mode = false) {
        let sessionData = {
            name: "",
            email: "",
        };
        if (!dev_mode) {
            const payload = JSON.parse(
                Buffer.from(msalToken.split(".")[1], "base64url").toString()
            );

            console.log('payload', payload)

            if (payload.exp * 1000 < Date.now()) {
                throw new Error("Token expired");
            }

            sessionData = {
                email: payload.preferred_username,
                name: payload.name,
                tenantId: payload.tid
            };
        } else {
            sessionData = {
                name: 'Developer (Dev Mode)',
                email: 'developer@dev.local'
            };
        }

        // Create signed JWT with jsonwebtoken library
        const sessionToken = jwt.sign(sessionData, this.SESSION_SECRET, {
            expiresIn: '24h',
            issuer: this.APP_ID,
            audience: this.APP_ID
        });

        return { sessionToken, user_data: sessionData };
    }

    static ValidateSession(sessionToken) {
        try {
            // Automatically verifies signature and expiration
            const session = jwt.verify(sessionToken, this.SESSION_SECRET, {
                issuer: this.APP_ID,
                audience: this.APP_ID
            });

            return {session, success: true};
        } catch (error) {
            return {session: {}, success: false}
        }
    }
    /**
     * SECURE authentication function - validates server-side
     * @param {Request} req - Next.js request object
     * @returns {Object|null} User information or null
     */
    static async authenticateUser(req) {
        try {
            // Get email from session header (client sends just email)
            const sessionEmail = req.headers.get('x-session-email');

            if (!sessionEmail) {
                console.log('No session email found');
                return null;
            }

            // SECURITY: ALWAYS VALIDATE AGAINST DATABASE
            // Never trust client-sent data for authorization
            const userProfile = await this.validateUserInDatabase(sessionEmail);

            if (!userProfile) {
                console.log('User not found or inactive:', sessionEmail);
                return null;
            }

            // GET CURRENT ROLES FROM DATABASE (NOT CLIENT)
            const currentRoles = userProfile.UserRoles?.map(ur => ur.Role.Name) || [];

            return {
                id: userProfile.UserID,
                profileId: userProfile.ID,
                email: userProfile.UserEmail,
                roles: currentRoles, // ALWAYS FROM DATABASE
                isActive: userProfile.IsActive,
                // Additional user info from legacy table if needed
                firstName: null, // Will be fetched if needed
                lastName: null   // Will be fetched if needed
            };

        } catch (error) {
            console.error('Authentication error:', error);
            return null;
        }
    }

    /**
     * SECURE authorization check with role hierarchy
     * @param {Object} user - User object from authenticateUser
     * @param {string|Array} requiredRoles - Required role(s)
     * @returns {boolean} Whether user is authorized
     */
    static async checkAuthorization(user, requiredRoles = null) {
        if (!user || !user.isActive) {
            return false;
        }

        // If no specific role required, just check if user is authenticated
        if (!requiredRoles) {
            return true;
        }

        // Convert single role to array
        const rolesArray = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

        // Check if user has any of the required roles
        for (const requiredRole of rolesArray) {
            if (user.roles && user.roles.includes(requiredRole)) {
                return true;
            }
        }

        // Check for admin bypass (highest priority roles)
        const adminRoles = ['Superadmin', 'Administrator'];
        if (user.roles && user.roles.some(role => adminRoles.includes(role))) {
            console.log(`Admin user ${user.email} authorized via admin bypass`);
            return true;
        }

        console.log(`User ${user.email} lacks required roles: ${rolesArray.join(', ')}`);
        return false;
    }

    /**
     * Validate user exists in database and get current roles
     * @param {string} email - User email
     * @returns {Object|null} User profile with current roles or null
     */
    static async validateUserInDatabase(email) {
        try {
            // Import prisma here to avoid circular dependencies
            const { default: prisma } = await import('@utils/db/db');

            // FIRST CHECK IF USER EXISTS AND IS ACTIVE IN THE USERS TABLE
            const user = await prisma.users.findFirst({
                where: {
                    Email: email.toLowerCase().trim()
                }
            });

            // If user doesn't exist or is inactive, return null
            if (!user || user.Status === 'inactive') {
                console.log(`User validation failed - ${!user ? 'not found' : 'inactive'}:`, email);
                return null;
            }

            // ALWAYS GET FRESH DATA FROM DATABASE
            const userProfile = await prisma.UserProfile.findFirst({
                where: {
                    UserEmail: email.toLowerCase().trim(),
                    IsActive: true
                },
                include: {
                    UserRoles: {
                        include: {
                            Role: {
                                select: {
                                    ID: true,
                                    Name: true,
                                    Priority: true,
                                    IsActive: true
                                }
                            }
                        },
                        where: {
                            // Only include active, non-expired roles
                            Role: {
                                IsActive: true
                            },
                            OR: [
                                { ExpiresAt: null }, // No expiration
                                { ExpiresAt: { gt: new Date() } } // Not expired
                            ]
                        }
                    }
                }
            });

            // If UserProfile doesn't exist or is inactive, also check user status again
            if (!userProfile) {
                console.log('UserProfile not found or inactive:', email);
                return null;
            }

            return userProfile;

        } catch (error) {
            console.error('Database validation error:', error);
            return null;
        }
    }

    /**
     * Create MINIMAL session data for frontend (security-focused)
     * @param {Object} user - User object from authenticateUser
     * @returns {Object} Minimal session data (no sensitive info)
     */
    static createSessionData(user) {
        return {
            email: user.email,
            roles: user.roles,
            isAuthenticated: true,
            timestamp: Date.now()
            // SECURITY: Don't include UserID, ProfileID, or other sensitive data
            // Frontend should only know user is authenticated and their roles
        };
    }

    /**
     * Get user details for legacy system compatibility
     * @param {number} userId - User ID
     * @returns {Object|null} User details from legacy table
     */
    static async getUserDetails(userId) {
        try {
            const { default: prisma } = await import('@utils/db/db');

            const user = await prisma.users.findUnique({
                where: { ID: userId },
                select: {
                    ID: true,
                    FirstName: true,
                    LastName: true,
                    Email: true,
                    Status: true,
                    UserGroupAccessID: true
                }
            });

            return user;
        } catch (error) {
            console.error('Error fetching user details:', error);
            return null;
        }
    }

    static async ValidateUserViaAccessToken(accessToken) {
        const response = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Invalid access token');
        }

        return await response.json(); // Returns user info
    }
}

// Export functions for API routes
export const authenticateUser = SecureSessionManager.authenticateUser.bind(SecureSessionManager);
export const checkAuthorization = SecureSessionManager.checkAuthorization.bind(SecureSessionManager);
export const ValidateUserViaAccessToken = SecureSessionManager.ValidateUserViaAccessToken.bind(SecureSessionManager);