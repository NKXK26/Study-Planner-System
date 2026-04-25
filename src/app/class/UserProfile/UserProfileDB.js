import prisma from '@utils/db/db';
import UserProfile from './UserProfile';

export default class UserProfileDB {
    /**
     * Create a new user profile
     */
    static async CreateUserProfile(userProfileData) {
        try {
            const userProfile = new UserProfile(userProfileData);
            const errors = userProfile.validate();
            
            if (errors.length > 0) {
                throw new Error(`Validation errors: ${errors.join(', ')}`);
            }

            const result = await prisma.UserProfile.create({
                data: {
                    UserID: userProfile.UserID,
                    UserEmail: userProfile.UserEmail,
                    UserGroupAccessID: userProfile.UserGroupAccessID,
                    IsActive: userProfile.IsActive,
                    CreatedAt: userProfile.CreatedAt,
                    UpdatedAt: userProfile.UpdatedAt
                }
            });

            return new UserProfile(result);
        } catch (error) {
            console.error('Error creating user profile:', error);
            throw error;
        }
    }

    /**
     * Fetch user profiles with optional filters
     */
    static async FetchUserProfiles(filters = {}) {
        try {
            const where = {};
            
            if (filters.UserID) where.UserID = filters.UserID;
            if (filters.UserEmail) where.UserEmail = filters.UserEmail;
            if (filters.UserGroupAccessID) where.UserGroupAccessID = filters.UserGroupAccessID;
            if (filters.IsActive !== undefined) where.IsActive = filters.IsActive;

            const results = await prisma.UserProfile.findMany({
                where,
                include: {
                    UserRoles: {
                        include: {
                            Role: true
                        }
                    },
                    RoleAssignments: true,
                    PermissionGrants: true
                },
                orderBy: {
                    CreatedAt: 'desc'
                }
            });

            return results.map(result => new UserProfile(result));
        } catch (error) {
            console.error('Error fetching user profiles:', error);
            throw error;
        }
    }

    /**
     * Get a single user profile by ID
     */
    static async GetUserProfileByID(id) {
        try {
            const result = await prisma.UserProfile.findUnique({
                where: { ID: id },
                include: {
                    UserRoles: {
                        include: {
                            Role: true
                        }
                    },
                    RoleAssignments: true,
                    PermissionGrants: true
                }
            });

            return result ? new UserProfile(result) : null;
        } catch (error) {
            console.error('Error fetching user profile by ID:', error);
            throw error;
        }
    }

    /**
     * Get user profile by User ID, Email, and UserGroupAccessID
     */
    static async GetUserProfileByUser(userID, userEmail, userGroupAccessID) {
        try {
            const result = await prisma.UserProfile.findFirst({
                where: {
                    UserID: userID,
                    UserEmail: userEmail,
                    UserGroupAccessID: userGroupAccessID
                },
                include: {
                    UserRoles: {
                        include: {
                            Role: true
                        }
                    },
                    RoleAssignments: true,
                    PermissionGrants: true
                }
            });

            return result ? new UserProfile(result) : null;
        } catch (error) {
            console.error('Error fetching user profile by user:', error);
            throw error;
        }
    }

    /**
     * Update a user profile
     */
    static async UpdateUserProfile(id, updateData) {
        try {
            const result = await prisma.UserProfile.update({
                where: { ID: id },
                data: {
                    ...updateData,
                    UpdatedAt: new Date()
                }
            });

            return new UserProfile(result);
        } catch (error) {
            console.error('Error updating user profile:', error);
            throw error;
        }
    }

    /**
     * Delete a user profile
     */
    static async DeleteUserProfile(id) {
        try {
            const result = await prisma.UserProfile.delete({
                where: { ID: id }
            });

            return new UserProfile(result);
        } catch (error) {
            console.error('Error deleting user profile:', error);
            throw error;
        }
    }

    /**
     * Sync user profiles with existing User data
     * This creates UserProfile records for existing users
     */
    static async SyncWithExistingUsers() {
        try {
            // Get all existing users
            const existingUsers = await prisma.users.findMany({
                select: {
                    ID: true,
                    Email: true,
                    UserGroupAccessID: true
                }
            });

            let createdCount = 0;
            let updatedCount = 0;

            for (const user of existingUsers) {
                // Check if UserProfile already exists
                const existingProfile = await prisma.UserProfile.findFirst({
                    where: {
                        UserID: user.ID,
                        UserEmail: user.Email,
                        UserGroupAccessID: user.UserGroupAccessID
                    }
                });

                if (!existingProfile) {
                    // Create new UserProfile
                    await prisma.UserProfile.create({
                        data: {
                            UserID: user.ID,
                            UserEmail: user.Email,
                            UserGroupAccessID: user.UserGroupAccessID,
                            IsActive: true,
                            CreatedAt: new Date(),
                            UpdatedAt: new Date()
                        }
                    });
                    createdCount++;
                } else {
                    // Update existing profile if needed
                    if (existingProfile.UserEmail !== user.Email || 
                        existingProfile.UserGroupAccessID !== user.UserGroupAccessID) {
                        await prisma.UserProfile.update({
                            where: { ID: existingProfile.ID },
                            data: {
                                UserEmail: user.Email,
                                UserGroupAccessID: user.UserGroupAccessID,
                                UpdatedAt: new Date()
                            }
                        });
                        updatedCount++;
                    }
                }
            }

            return { createdCount, updatedCount };
        } catch (error) {
            console.error('Error syncing user profiles:', error);
            throw error;
        }
    }
}
