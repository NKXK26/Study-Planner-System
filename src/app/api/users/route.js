// REPLACE YOUR /api/users/route.js WITH THIS VERSION
// This version matches your actual Prisma schema
// REPLACE YOUR /api/users/route.js WITH THIS VERSION
// This version matches your actual Prisma schema

import { NextResponse } from 'next/server';
import prisma from '@utils/db/db';
import { normalizeEmail } from '@utils/auth/emailUtils';
import AuditLogger from '@app/class/Audit/AuditLogger';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';
import SuperadminGuard from '@app/class/Role/SuperadminGuard';

export async function GET(req) {
    try {
        // Check for DEV override
        const isDevOverride = req.headers.get('x-dev-override') === 'true' &&
            process.env.NEXT_PUBLIC_MODE === 'DEV';

        if (!isDevOverride) {
            const sessionEmail = req.headers.get('x-session-email');
            if (!sessionEmail) {
                return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
            }
        }
        const { searchParams } = new URL(req.url);
        const action = searchParams.get('action');
        const includeRBACRoles = searchParams.get('includeRBACRoles') === 'true';

        if (action === 'list') {
            // Get all users with their legacy roles
            const users = await prisma.users.findMany({
                include: {
                    user_group_access: true, // Legacy role system
                    user_group_access: true, // Legacy role system
                },
                orderBy: {
                    Email: 'asc'
                }
            });

            // Get RBAC roles if requested
            let userProfiles = [];
            if (includeRBACRoles) {
                userProfiles = await prisma.UserProfile.findMany({
                    include: {
                        UserRoles: {
                            include: {
                                Role: {
                                    select: {
                                        ID: true,
                                        Name: true,
                                        Description: true,
                                        Color: true,
                                        Priority: true,
                                        IsActive: true
                                    }
                                }
                            },
                            where: {
                                Role: {
                                    IsActive: true
                                },
                                OR: [
                                    { ExpiresAt: null },
                                    { ExpiresAt: { gt: new Date() } }
                                ]
                            }
                        }
                    }
                });
            }

            // Transform data to include both legacy and RBAC roles
            const transformedUsers = users.map(user => {
                const userProfile = userProfiles.find(profile => profile.UserID === user.ID);

                return {
                    ID: user.ID,
                    Email: user.Email,
                    FirstName: user.FirstName,
                    LastName: user.LastName,
                    Status: user.Status || 'active',
                    LastLogin: user.UpdatedAt, // Using UpdatedAt as LastLogin proxy
                    UserGroupAccess: user.user_group_access, // Legacy role
                    LastLogin: user.UpdatedAt, // Using UpdatedAt as LastLogin proxy
                    UserGroupAccess: user.user_group_access, // Legacy role
                    UserProfile: userProfile,
                    // RBAC Roles for display
                    // RBAC Roles for display
                    RBACRoles: userProfile?.UserRoles || [],
                    // Legacy Roles for backward compatibility
                    // Legacy Roles for backward compatibility
                    Roles: user.user_group_access ? [{
                        ID: user.user_group_access.id,
                        Name: user.user_group_access.name
                    }] : []
                };
            });

            return NextResponse.json({
                success: true,
                users: transformedUsers
            });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        console.error('Error fetching users:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        // Check for DEV override
        const isDevOverride = req.headers.get('x-dev-override') === 'true' &&
            process.env.NEXT_PUBLIC_MODE === 'DEV';

        if (!isDevOverride) {
            const sessionEmail = req.headers.get('x-session-email');
            if (!sessionEmail) {
                return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
            }
        }
        const { action, ...data } = await req.json();

        switch (action) {
            case 'create':
                return await handleCreateUser(data, req);
            case 'update-role':
                return await handleUpdateUserRole(data, req);
            case 'activate':
            case 'deactivate':
                return await handleToggleUserStatus(data, action, req);
            case 'delete':
                return await handleDeleteUser(data, req);
            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

    } catch (error) {
        console.error('Error in users POST:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// CREATE USER WITH RBAC ROLE ASSIGNMENT
async function handleCreateUser({ email, firstName, lastName, roleIds = [] }, req) {
    const defaultGroupId = parseInt(process.env.DEFAULT_USER_GROUP_ID || '1', 10);
    const normalizedEmail = normalizeEmail(email);

    // Check if user already exists
    const existingUser = await prisma.users.findFirst({
        where: { Email: normalizedEmail }
    });

    if (existingUser) {
        return NextResponse.json({
            error: 'User with this email already exists',
            userId: existingUser.ID
        }, { status: 400 });
    }

    return await prisma.$transaction(async (tx) => {
        // 1. Ensure default user group exists
        let userGroup = await tx.user_group_access.findUnique({
            where: { id: defaultGroupId }
        });

        if (!userGroup) {
            userGroup = await tx.user_group_access.create({
                data: {
                    id: defaultGroupId,
                    name: 'Default User',
                    access: 'read',
                    module: 'general'
                }
            });
        }

        // 2. Create user
        const user = await tx.users.create({
            data: {
                Email: normalizedEmail,
                FirstName: firstName || null,
                LastName: lastName || null,
                UserGroupAccessID: defaultGroupId,
                Status: 'active'
            }
        });

        // 3. Create user profile for RBAC
        const userProfile = await tx.UserProfile.create({
            data: {
                UserID: user.ID,
                UserEmail: user.Email,
                UserGroupAccessID: user.UserGroupAccessID,
                IsActive: true
            }
        });

        // 4. Assign RBAC roles if provided, otherwise assign default Viewer role
        let finalRoleIds = roleIds;
        if (roleIds.length === 0) {
            // Assign default Viewer role
            const viewerRole = await tx.Role.findFirst({
                where: { Name: 'Viewer' }
            });
            if (viewerRole) {
                finalRoleIds = [viewerRole.ID];
            }
        }

        if (finalRoleIds.length > 0) {
            const roleAssignments = finalRoleIds.map(roleId => ({
                UserProfileID: userProfile.ID,
                RoleID: parseInt(roleId),
                AssignedAt: new Date()
            }));

            await tx.UserRole.createMany({
                data: roleAssignments
            });
        }

        // 5. Fetch role details for audit log
        const assignedRoles = await tx.Role.findMany({
            where: { ID: { in: finalRoleIds } },
            select: { ID: true, Name: true }
        });

        // 6. Log the user creation
        try {
            const authUser = await SecureSessionManager.authenticateUser(req);
            const actorEmail = authUser?.email || req.headers.get('x-session-email') || undefined;
            await AuditLogger.logCreate({
                userId: authUser?.id || null,
                email: actorEmail,
                module: 'user_management',
                entity: 'User',
                entityId: user.ID,
                after: {
                    userId: user.ID,
                    email: user.Email,
                    firstName: user.FirstName,
                    lastName: user.LastName,
                    status: user.Status,
                    assignedRoles: assignedRoles.map(r => r.Name)
                },
                metadata: {
                    userEmail: user.Email,
                    roleCount: finalRoleIds.length,
                    roles: assignedRoles.map(r => r.Name).join(', ')
                }
            });
        } catch (auditError) {
            console.error('Audit logging failed:', auditError);
        }

        return NextResponse.json({
            success: true,
            message: 'User created successfully',
            userId: user.ID,
            userProfileId: userProfile.ID
        });
    });
}

// UPDATE USER ROLE (LEGACY SYSTEM)
async function handleUpdateUserRole({ userId, roleId }, req) {
    // Fetch before state
    const beforeUser = await prisma.users.findUnique({
        where: { ID: parseInt(userId) },
        include: { user_group_access: true }
    });
    const updatedUser = await prisma.users.update({
        where: { ID: parseInt(userId) },
        data: {
            UserGroupAccessID: parseInt(roleId)
        },
        include: { user_group_access: true }
    });

    // Audit log
    try {
        const authUser = await SecureSessionManager.authenticateUser(req);
        const actorEmail = authUser?.email || req.headers.get('x-session-email') || undefined;
        await AuditLogger.logUpdate({
            userId: authUser?.id || null,
            email: actorEmail,
            module: 'user_management',
            entity: 'UserRole',
            entityId: userId,
            before: { roleId: beforeUser.UserGroupAccessID, roleName: beforeUser.user_group_access?.name },
            after: { roleId: updatedUser.UserGroupAccessID, roleName: updatedUser.user_group_access?.name },
            metadata: { userEmail: updatedUser.Email }
        });
    } catch (auditError) {
        console.error('Audit logging failed:', auditError);
    }

    return NextResponse.json({
        success: true,
        message: 'User legacy role updated successfully',
        user: updatedUser
    });
}

// TOGGLE USER STATUS (ACTIVATE/DEACTIVATE)
async function handleToggleUserStatus({ userId }, action, req) {
    // Check if deactivating the last active Superadmin
    if (action === 'deactivate') {
        const deactivateCheck = await SuperadminGuard.canDeactivateUser(parseInt(userId));
        if (!deactivateCheck.allowed) {
            return NextResponse.json({
                success: false,
                error: deactivateCheck.message
            }, { status: 403 });
        }
    }

    // Fetch before state
    const beforeUser = await prisma.users.findUnique({
        where: { ID: parseInt(userId) }
    });
    const newStatus = action === 'activate' ? 'active' : 'inactive';

    const updatedUser = await prisma.users.update({
        where: { ID: parseInt(userId) },
        data: { Status: newStatus }
    });

    // Also update UserProfile if it exists
    await prisma.UserProfile.updateMany({
        where: { UserID: parseInt(userId) },
        data: { IsActive: newStatus === 'active' }
    });

    // Audit log
    try {
        const authUser = await SecureSessionManager.authenticateUser(req);
        const actorEmail = authUser?.email || req.headers.get('x-session-email') || undefined;
        await AuditLogger.logUpdate({
            userId: authUser?.id || null,
            email: actorEmail,
            module: 'user_management',
            entity: 'UserStatus',
            entityId: userId,
            before: { status: beforeUser.Status },
            after: { status: newStatus },
            metadata: { userEmail: updatedUser.Email, action }
        });
    } catch (auditError) {
        console.error('Audit logging failed:', auditError);
    }

    return NextResponse.json({
        success: true,
        message: `User ${newStatus} successfully`
    });
}

// DELETE USER
async function handleDeleteUser({ userId }, req) {
    const userId_int = parseInt(userId);

    const deleteCheck = await SuperadminGuard.canDeleteUser(userId_int);
    if (!deleteCheck.allowed) {
        return NextResponse.json({
            success: false,
            error: deleteCheck.message
        }, { status: 403 });
    }

    // Fetch data BEFORE transaction for audit logging
    // This reduces the time spent inside the transaction
    const beforeUser = await prisma.users.findUnique({
        where: { ID: userId_int },
        include: { user_group_access: true }
    });

    const userProfile = await prisma.UserProfile.findFirst({
        where: { UserID: userId_int },
        include: {
            UserRoles: { include: { Role: true } }
        }
    });

    // Now perform the deletion in a transaction with increased timeout
    // Only delete operations inside - no data fetching
    await prisma.$transaction(async (tx) => {
        if (userProfile) {

            // Change to inactive
            await tx.UserProfile.update({
                where: { ID: userProfile.ID },
                data: {
                    IsActive: false
                }
            })
        }

        // Delete legacy user (this will cascade if there are other dependencies)
        await tx.users.update({
            where: { ID: userId_int },
            data: {
                Status: 'inactive'
            }
        });
    }, {
        maxWait: 10000, // Maximum wait time to acquire a transaction (10 seconds)
        timeout: 15000, // Maximum time for the transaction to complete (15 seconds)
    });

    try {
        const authUser = await SecureSessionManager.authenticateUser(req);
        const actorEmail = authUser?.email || req.headers.get('x-session-email') || undefined;

        await AuditLogger.logDelete({
            userId: authUser?.id || null,
            email: actorEmail,
            module: 'user_management',
            entity: 'User',
            entityId: userId_int,
            before: {
                userId: beforeUser?.ID,
                email: beforeUser?.Email,
                firstName: beforeUser?.FirstName,
                lastName: beforeUser?.LastName,
                status: beforeUser?.Status,
                legacyRole: beforeUser?.user_group_access?.name,
                rbacRoles: userProfile?.UserRoles?.map(ur => ur.Role?.Name) || []
            },
            metadata: {
                userEmail: beforeUser?.Email,
                deletedRoles: userProfile?.UserRoles?.length || 0
            }
        });
    } catch (auditError) {
        console.error('Audit logging failed:', auditError);
    }

    return NextResponse.json({
        success: true,
        message: 'User deleted successfully'
    });
}

// PUT - Update user information
export async function PUT(req) {
    try {
        // Check for DEV override
        const isDevOverride = req.headers.get('x-dev-override') === 'true' &&
            process.env.NEXT_PUBLIC_MODE === 'DEV';

        if (!isDevOverride) {
            const sessionEmail = req.headers.get('x-session-email');
            if (!sessionEmail) {
                return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
            }
        }
        const { userId, firstName, lastName, email } = await req.json();

        if (!userId) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        // Fetch before state
        const beforeUser = await prisma.users.findUnique({
            where: { ID: parseInt(userId) }
        });

        const updateData = {};
        if (firstName !== undefined) updateData.FirstName = firstName;
        if (lastName !== undefined) updateData.LastName = lastName;
        if (email !== undefined) updateData.Email = normalizeEmail(email);

        const updatedUser = await prisma.users.update({
            where: { ID: parseInt(userId) },
            data: updateData
        });

        // Audit log
        try {
            const authUser = await SecureSessionManager.authenticateUser(req);
            const actorEmail = authUser?.email || req.headers.get('x-session-email') || undefined;
            await AuditLogger.logUpdate({
                userId: authUser?.id || null,
                email: actorEmail,
                module: 'user_management',
                entity: 'UserInfo',
                entityId: userId,
                before: {
                    email: beforeUser.Email,
                    firstName: beforeUser.FirstName,
                    lastName: beforeUser.LastName
                },
                after: {
                    email: updatedUser.Email,
                    firstName: updatedUser.FirstName,
                    lastName: updatedUser.LastName
                },
                metadata: { userEmail: updatedUser.Email }
            });
        } catch (auditError) {
            console.error('Audit logging failed:', auditError);
        }

        return NextResponse.json({
            success: true,
            message: 'User updated successfully',
            user: updatedUser
        });
    } catch (error) {
        console.error('Error updating user:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}