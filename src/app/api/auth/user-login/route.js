import { NextResponse } from 'next/server';
import prisma from '@utils/db/db';
import { validateEmail } from '@utils/auth/emailUtils';
import AuditLogger from '@app/class/Audit/AuditLogger';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';

// Default role to assign to new users (hardcoded since no env var exists)
const DEFAULT_ROLE = process.env.DEFAULT_USER_ROLE;
const WHITELIST_MODE = process.env.WHITELIST_MODE == "true" ? true : false;

async function ensureUserAndProfile(email, name) {
    const lowerEmail = email.trim().toLowerCase();
    const defaultGroupId = parseInt(process.env.DEFAULT_USER_GROUP_ID || '1', 10);

    console.log(`🔍 DEBUG: Attempting to create user with email: ${lowerEmail}, UserGroupAccessID: ${defaultGroupId}`);

    // USE TRANSACTION TO PREVENT RACE CONDITIONS
    const result = await prisma.$transaction(async (tx) => {
        // Check if user already exists (within transaction)
        let user = await tx.users.findFirst({ where: { Email: lowerEmail } });
        console.log(`🔍 DEBUG: Existing user found:`, !!user);

        if (!user) {
            // VALIDATE USER GROUP EXISTS BEFORE CREATING USER
            const groupExists = await tx.user_group_access.findFirst({
                where: { id: defaultGroupId }
            });

            if (!groupExists) {
                console.error(`❌ DEBUG: UserGroupAccess with ID ${defaultGroupId} does not exist`);
                throw new Error(`Default user group with ID ${defaultGroupId} not found`);
            }

            console.log(`🔍 DEBUG: Creating new user with data:`, {
                Email: lowerEmail,
                UserGroupAccessID: defaultGroupId,
                Status: 'active'
            });

            try {
                user = await tx.users.create({
                    data: {
                        FirstName: name,
                        Email: lowerEmail,
                        UserGroupAccessID: defaultGroupId,
                        Status: 'active'
                    }
                });
                console.log(`✅ DEBUG: User created successfully:`, user);
            } catch (createError) {
                console.error(`❌ DEBUG: User creation failed:`, {
                    error: createError,
                    code: createError.code,
                    meta: createError.meta,
                    message: createError.message
                });
                throw createError;
            }
        }

        // CREATE OR GET USERPROFILE (FOR RBAC SYSTEM)
        let userProfile = await tx.UserProfile.findFirst({
            where: {
                UserID: user.ID,
                UserEmail: user.Email,
                UserGroupAccessID: user.UserGroupAccessID
            }
        });

        if (!userProfile) {
            userProfile = await tx.UserProfile.create({
                data: {
                    UserID: user.ID,
                    UserEmail: user.Email,
                    UserGroupAccessID: user.UserGroupAccessID,
                    IsActive: true
                }
            });
            console.log(`✅ DEBUG: UserProfile created:`, userProfile);
        }

        return { user, userProfile };
    });

    return result;
}

async function findRoleIdByName(roleName) {
    if (!roleName) return null;
    const role = await prisma.Role.findFirst({ where: { Name: roleName } });
    return role ? role.ID : null;
}

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const { email, name, token } = body;

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        if (!validateEmail(email)) {
            return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
        }

        let user = null;
        let userProfile = null;
        // Create or get user and profile (NOW USING TRANSACTION)
        if (WHITELIST_MODE) {
            user = await prisma.users.findFirst({ where: { Email: email.toLowerCase() } });
            if (!user) {
                return NextResponse.json({
                    success: false,
                    error: 'Access denied: your account is not in the whitelist.',
                    reason: 'not_whitelisted',
                    email
                }, { status: 403 });
            }

            userProfile = await prisma.UserProfile.findFirst({
                where: { UserID: user.ID }
            });
            // only allow existing users
        } else {
            ({ user, userProfile } = await ensureUserAndProfile(email, name));
        }

        // CHECK IF USER STATUS IS INACTIVE - PREVENT LOGIN
        if (user.Status === 'inactive') {
            // Log failed login attempt
            try {
                await AuditLogger.logAuthentication(user.ID, 'LOGIN_BLOCKED_INACTIVE', {
                    email: user.Email,
                    reason: 'User account is inactive',
                    source: 'MSAL_AUTH'
                }, req);
            } catch (auditError) {
                console.error('⚠️  Failed login audit logging failed:', auditError);
            }

            return NextResponse.json({
                error: 'Your account has been deactivated. Please contact an administrator.',
                status: 'inactive',
                userId: user.ID
            }, { status: 403 });
        }

        // Find default role
        const defaultRoleId = await findRoleIdByName(DEFAULT_ROLE);

        // TRANSACTION FOR ROLE ASSIGNMENT TO PREVENT DUPLICATES
        const roleAssignmentResult = await prisma.$transaction(async (tx) => {
            // Check existing roles within transaction
            const existingRoles = await tx.UserRole.findMany({
                where: { UserProfileID: userProfile.ID }
            });

            let rolesAssigned = [];

            // Only assign default role if user doesn't have any roles yet
            if (existingRoles.length === 0 && defaultRoleId) {
                const newUserRole = await tx.UserRole.create({
                    data: {
                        UserProfileID: userProfile.ID,
                        RoleID: defaultRoleId,
                        AssignedAt: new Date()
                    }
                });

                // LOG THE ROLE ASSIGNMENT (OUTSIDE TRANSACTION TO AVOID ISSUES)
                console.log(`✅ DEBUG: Default role assigned to user ${user.ID}`);
                rolesAssigned.push(defaultRoleId);
            }

            return { existingRoles, rolesAssigned };
        });

        // AUDIT LOGGING OUTSIDE TRANSACTION
        if (roleAssignmentResult.rolesAssigned.length > 0) {
            try {
                await AuditLogger.logRoleAssignment(
                    user.ID,
                    roleAssignmentResult.rolesAssigned,
                    null,
                    `Auto-assign default role: ${DEFAULT_ROLE} during user registration`,
                    req
                );
            } catch (auditError) {
                // LOG BUT DON'T FAIL THE REQUEST - AUDITLOG MODEL MIGHT BE MISSING
                console.error('⚠️  Audit logging failed - ensure AuditLog model exists in schema:', auditError);
            }
        }

        // LOG USER REGISTRATION EVENT
        try {
            await AuditLogger.logAuthentication(user.ID, 'USER_REGISTRATION', {
                email: user.Email,
                defaultRoleAssigned: defaultRoleId ? DEFAULT_ROLE : null,
                source: 'MSAL_AUTH'
            }, req);
        } catch (auditError) {
            console.error('⚠️  User registration audit logging failed:', auditError);
        }

        // Get current user roles for response
        const assignedRoles = await prisma.UserRole.findMany({
            where: { UserProfileID: userProfile.ID },
            include: { Role: true }
        });

        const { sessionToken, user_data } = await SecureSessionManager.CreateSession(token);

        return NextResponse.json({
            success: true,
            userId: user.ID,
            userProfileId: userProfile.ID,
            roles: assignedRoles.map(ur => ur.Role?.Name).filter(Boolean),
            sessionToken: sessionToken,
            sessionUser: user_data,
            // ADDITIONAL DEBUG INFO
            debug: {
                isNewUser: roleAssignmentResult.rolesAssigned.length > 0,
                totalRoles: assignedRoles.length,
                defaultRoleAssigned: defaultRoleId ? DEFAULT_ROLE : null
            }
        });
    } catch (error) {
        console.error('user-login error:', error);

        // PROVIDE MORE DETAILED ERROR INFO
        return NextResponse.json({
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? {
                stack: error.stack,
                code: error.code
            } : undefined
        }, { status: 500 });
    }
}
/**
 * Session validation endpoint
 * Called by RequireAuth to verify cached user sessions are still valid
 * Prevents deleted/deactivated users from accessing the system via browser cache
 */
export async function PUT(req) {
    try {
        const sessionEmail = req.headers.get('x-session-email');
        const { email } = await req.json().catch(() => ({}));

        // Validate email is provided
        if (!sessionEmail && !email) {
            return NextResponse.json({
                success: false,
                isValid: false,
                message: 'No email provided for validation'
            }, { status: 401 });
        }

        const emailToValidate = (sessionEmail || email).toLowerCase().trim();

        // Check if user exists and is active
        const user = await prisma.users.findFirst({
            where: {
                Email: emailToValidate
            },
            include: {
                UserProfile: {
                    include: {
                        UserRoles: {
                            include: {
                                Role: true
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
                }
            }
        });

        // User not found or inactive
        if (!user || user.Status !== 'active') {
            console.log(`❌ Session validation failed for ${emailToValidate}: User not found or inactive`);
            return NextResponse.json({
                success: true,
                isValid: false,
                message: 'User is not active or does not exist'
            });
        }

        // Check if user is in whitelist (has at least one active role)
        const userProfile = user.UserProfile;
        if (!userProfile) {
            console.log(`❌ Session validation failed for ${emailToValidate}: No user profile found`);
            return NextResponse.json({
                success: true,
                isValid: false,
                message: 'User has no profile'
            });
        }

        // Check if user has any active roles
        const hasActiveRoles = userProfile.UserRoles && userProfile.UserRoles.length > 0;

        if (!hasActiveRoles) {
            console.log(`❌ Session validation failed for ${emailToValidate}: No active roles`);
            return NextResponse.json({
                success: true,
                isValid: false,
                message: 'User has no active roles'
            });
        }

        // Session is valid
        console.log(`✅ Session validation successful for ${emailToValidate}`);
        return NextResponse.json({
            success: true,
            isValid: true,
            message: 'Session is valid',
            user: {
                email: user.Email,
                status: user.Status,
                roles: userProfile.UserRoles.map(ur => ur.Role.Name)
            }
        });

    } catch (error) {
        console.error('Session validation error:', error);
        return NextResponse.json({
            success: false,
            isValid: false,
            message: 'Session validation error',
            error: error.message
        }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        ok: true,
        message: 'user-login route is available',
        method: 'GET',
        timestamp: new Date().toISOString()
    });
}