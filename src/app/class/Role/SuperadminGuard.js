import prisma from '@utils/db/db';

/**
 * SuperadminGuard - Ensures the system always has at least one active Superadmin
 *
 * This utility prevents system lockout by enforcing that at least one user
 * with the Superadmin role remains active at all times.
 */
export default class SuperadminGuard {
    static SUPERADMIN_ROLE_NAME = 'Superadmin';

    /**
     * Count the number of active users with the Superadmin role
     * @returns {Promise<number>} Count of active Superadmins
     */
    static async countActiveSuperadmins() {
        try {
            // Get the Superadmin role
            const superadminRole = await prisma.Role.findFirst({
                where: { Name: this.SUPERADMIN_ROLE_NAME }
            });

            if (!superadminRole) {
                console.warn('Superadmin role not found in database');
                return 0;
            }

            // Find active users with Superadmin role
            const activeUserRoles = await prisma.UserRole.findMany({
                where: {
                    RoleID: superadminRole.ID,
                    OR: [
                        { ExpiresAt: null },
                        { ExpiresAt: { gt: new Date() } }
                    ]
                },
                include: {
                    UserProfile: true
                }
            });

            // Get UserIDs from profiles
            const userIds = activeUserRoles
                .filter(ur => ur.UserProfile && ur.UserProfile.IsActive)
                .map(ur => ur.UserProfile.UserID);

            if (userIds.length === 0) {
                return 0;
            }

            // Check which users are active in the users table
            const activeUsersCount = await prisma.users.count({
                where: {
                    ID: { in: userIds },
                    Status: 'active'
                }
            });

            return activeUsersCount;
        } catch (error) {
            console.error('Error counting active Superadmins:', error);
            throw error;
        }
    }

    /**
     * Check if a specific user is the last active Superadmin
     * @param {number} userId - The user ID to check
     * @returns {Promise<boolean>} True if user is the last active Superadmin
     */
    static async isLastActiveSuperadmin(userId) {
        try {
            const totalSuperadmins = await this.countActiveSuperadmins();

            if (totalSuperadmins === 0) {
                return false; // No Superadmins exist
            }

            if (totalSuperadmins > 1) {
                return false; // Multiple Superadmins exist
            }

            // Check if this user has the Superadmin role
            const superadminRole = await prisma.Role.findFirst({
                where: { Name: this.SUPERADMIN_ROLE_NAME }
            });

            if (!superadminRole) {
                return false;
            }

            const userProfile = await prisma.UserProfile.findFirst({
                where: { UserID: parseInt(userId) },
                include: {
                    UserRoles: {
                        where: {
                            RoleID: superadminRole.ID,
                            OR: [
                                { ExpiresAt: null },
                                { ExpiresAt: { gt: new Date() } }
                            ]
                        }
                    }
                }
            });

            return userProfile && userProfile.UserRoles.length > 0;
        } catch (error) {
            console.error('Error checking if user is last Superadmin:', error);
            throw error;
        }
    }

    /**
     * Check if a specific user profile is the last active Superadmin
     * @param {number} userProfileId - The user profile ID to check
     * @returns {Promise<boolean>} True if user profile is the last active Superadmin
     */
    static async isLastActiveSuperadminByProfile(userProfileId) {
        try {
            const totalSuperadmins = await this.countActiveSuperadmins();

            if (totalSuperadmins === 0) {
                return false;
            }

            if (totalSuperadmins > 1) {
                return false;
            }

            // Check if this user profile has the Superadmin role
            const superadminRole = await prisma.Role.findFirst({
                where: { Name: this.SUPERADMIN_ROLE_NAME }
            });

            if (!superadminRole) {
                return false;
            }

            const userRole = await prisma.UserRole.findFirst({
                where: {
                    UserProfileID: parseInt(userProfileId),
                    RoleID: superadminRole.ID,
                    OR: [
                        { ExpiresAt: null },
                        { ExpiresAt: { gt: new Date() } }
                    ]
                }
            });

            return !!userRole;
        } catch (error) {
            console.error('Error checking if user profile is last Superadmin:', error);
            throw error;
        }
    }

    /**
     * Check if Superadmin role can be removed from a user
     * @param {number} userProfileId - The user profile ID
     * @param {number} roleId - The role ID to be removed
     * @returns {Promise<{allowed: boolean, message: string}>}
     */
    static async canRemoveSuperadminRole(userProfileId, roleId) {
        try {
            // Get the Superadmin role
            const superadminRole = await prisma.Role.findFirst({
                where: { Name: this.SUPERADMIN_ROLE_NAME }
            });

            if (!superadminRole) {
                return { allowed: true, message: '' };
            }

            // Check if the role being removed is Superadmin
            if (parseInt(roleId) !== superadminRole.ID) {
                return { allowed: true, message: '' };
            }

            // Check if this is the last Superadmin
            const isLast = await this.isLastActiveSuperadminByProfile(userProfileId);

            if (isLast) {
                return {
                    allowed: false,
                    message: 'Cannot remove Superadmin role from the last active Superadmin. The system requires at least one active Superadmin.'
                };
            }

            return { allowed: true, message: '' };
        } catch (error) {
            console.error('Error checking if Superadmin role can be removed:', error);
            throw error;
        }
    }

    /**
     * Check if a user can be deleted
     * @param {number} userId - The user ID
     * @returns {Promise<{allowed: boolean, message: string}>}
     */
    static async canDeleteUser(userId) {
        try {
            const isLast = await this.isLastActiveSuperadmin(userId);

            if (isLast) {
                return {
                    allowed: false,
                    message: 'Cannot delete the last active Superadmin. The system requires at least one active Superadmin.'
                };
            }

            return { allowed: true, message: '' };
        } catch (error) {
            console.error('Error checking if user can be deleted:', error);
            throw error;
        }
    }

    /**
     * Check if a user can be deactivated
     * @param {number} userId - The user ID
     * @returns {Promise<{allowed: boolean, message: string}>}
     */
    static async canDeactivateUser(userId) {
        try {
            const isLast = await this.isLastActiveSuperadmin(userId);

            if (isLast) {
                return {
                    allowed: false,
                    message: 'Cannot deactivate the last active Superadmin. The system requires at least one active Superadmin.'
                };
            }

            return { allowed: true, message: '' };
        } catch (error) {
            console.error('Error checking if user can be deactivated:', error);
            throw error;
        }
    }

    /**
     * Check if Superadmin role can be deactivated
     * @returns {Promise<{allowed: boolean, message: string}>}
     */
    static async canDeactivateSuperadminRole() {
        try {
            const superadminCount = await this.countActiveSuperadmins();

            if (superadminCount > 0) {
                return {
                    allowed: false,
                    message: 'Cannot deactivate the Superadmin role while there are active Superadmins in the system. Please remove all Superadmin role assignments first.'
                };
            }

            return { allowed: true, message: '' };
        } catch (error) {
            console.error('Error checking if Superadmin role can be deactivated:', error);
            throw error;
        }
    }

    /**
     * Get Superadmin role ID
     * @returns {Promise<number|null>}
     */
    static async getSuperadminRoleId() {
        try {
            const role = await prisma.Role.findFirst({
                where: { Name: this.SUPERADMIN_ROLE_NAME }
            });
            return role?.ID || null;
        } catch (error) {
            console.error('Error getting Superadmin role ID:', error);
            return null;
        }
    }
}
