// REPLACE YOUR /api/user-roles/route.js WITH THIS CORRECTED VERSION
// Fixed to use the correct schema models: users (not user)

import { NextResponse } from 'next/server';
import prisma from '@utils/db/db';
import AuditLogger from '@app/class/Audit/AuditLogger';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';
import SuperadminGuard from '@app/class/Role/SuperadminGuard';
import { TokenValidation } from "@app/api/api_helper";

// GET user roles for a specific user
export async function GET(req) {
  try {
    // Check for DEV override
    const isDevOverride = req.headers.get('x-dev-override') === 'true' &&
      process.env.NEXT_PUBLIC_MODE === 'DEV';

    if (!isDevOverride) {
      const authHeader = req.headers.get('Authorization');
      const token_res = TokenValidation(authHeader);

      if (!token_res.success) {
        return NextResponse.json({ success: false, message: token_res.message }, { status: token_res.status });
      }
      // Require actor email for auditability
      const sessionEmail = req.headers.get('x-session-email');
      if (!sessionEmail) {
        return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
      }
    }
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Get user profile with roles (FIXED: using correct model name)
    const userProfile = await prisma.UserProfile.findFirst({
      where: { UserID: parseInt(userId) },
      include: {
        UserRoles: {
          include: {
            Role: {
              include: {
                RolePermissions: {
                  include: {
                    Permission: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      userProfile: {
        ID: userProfile.ID,
        UserID: userProfile.UserID,
        UserEmail: userProfile.UserEmail,
        IsActive: userProfile.IsActive,
        UserRoles: userProfile.UserRoles.map(ur => ({
          ID: ur.ID,
          Role: ur.Role,
          AssignedAt: ur.AssignedAt,
          ExpiresAt: ur.ExpiresAt
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching user roles:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST to assign roles to a user
export async function POST(req) {
  try {
    // Check for DEV override
    const isDevOverride = req.headers.get('x-dev-override') === 'true' &&
      process.env.NEXT_PUBLIC_MODE === 'DEV';

    if (!isDevOverride) {
      const authHeader = req.headers.get('Authorization');
      const token_res = TokenValidation(authHeader);

      if (!token_res.success) {
        return NextResponse.json({ success: false, message: token_res.message }, { status: token_res.status });
      }
      // Require actor email for auditability
      const sessionEmail = req.headers.get('x-session-email');
      if (!sessionEmail) {
        return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
      }
    }
    const { userId, roleIds, assignedBy, reason = '' } = await req.json();

    if (!userId || !roleIds || !Array.isArray(roleIds)) {
      return NextResponse.json({
        error: 'User ID and role IDs array are required'
      }, { status: 400 });
    }

    // FIXED: Validate user exists using correct model
    const user = await prisma.users.findUnique({
      where: { ID: parseInt(userId) }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Validate roles exist
    const roles = await prisma.Role.findMany({
      where: { ID: { in: roleIds.map(id => parseInt(id)) } }
    });

    if (roles.length !== roleIds.length) {
      return NextResponse.json({ error: 'One or more roles not found' }, { status: 404 });
    }

    // Get or create UserProfile
    let userProfile = await prisma.UserProfile.findFirst({
      where: { UserID: user.ID }
    });

    if (!userProfile) {
      userProfile = await prisma.UserProfile.create({
        data: {
          UserID: user.ID,
          UserEmail: user.Email,
          UserGroupAccessID: user.UserGroupAccessID,
          IsActive: true
        }
      });
    }

    // Get existing roles for audit log
    const existingRoles = await prisma.UserRole.findMany({
      where: { UserProfileID: userProfile.ID },
      include: { Role: true }
    });

    // Check if this operation removes Superadmin from the last active Superadmin
    const superadminRoleId = await SuperadminGuard.getSuperadminRoleId();
    if (superadminRoleId) {
      const hasSuperadminNow = existingRoles.some(r => r.RoleID === superadminRoleId);
      const willHaveSuperadmin = roleIds.includes(superadminRoleId);

      if (hasSuperadminNow && !willHaveSuperadmin) {
        // Trying to remove Superadmin role - check if this is the last one
        const removalCheck = await SuperadminGuard.canRemoveSuperadminRole(userProfile.ID, superadminRoleId);
        if (!removalCheck.allowed) {
          return NextResponse.json({
            success: false,
            error: removalCheck.message
          }, { status: 403 });
        }
      }
    }

    // Start transaction for role assignment
    await prisma.$transaction(async (tx) => {
      // Remove existing role assignments
      await tx.UserRole.deleteMany({
        where: { UserProfileID: userProfile.ID }
      });

      // Create new role assignments
      if (roleIds.length > 0) {
        const roleAssignments = roleIds.map(roleId => ({
          UserProfileID: userProfile.ID,
          RoleID: parseInt(roleId),
          AssignedBy: assignedBy ? parseInt(assignedBy) : null,
          AssignedAt: new Date()
        }));

        await tx.UserRole.createMany({
          data: roleAssignments
        });
      }

      // Log the role assignment using AuditLogger
      try {
        const authUser = await SecureSessionManager.authenticateUser(req);
        const actorEmail = authUser?.email || req.headers.get('x-session-email') || undefined;
        await AuditLogger.logUpdate({
          userId: authUser?.id || null,
          email: actorEmail,
          module: 'user_management',
          entity: 'UserRoles',
          entityId: userId,
          before: existingRoles.map(r => ({ roleId: r.RoleID, roleName: r.Role.Name })),
          after: roles.map(r => ({ roleId: r.ID, roleName: r.Name })),
          metadata: {
            userEmail: user.Email,
            reason,
            rolesAdded: roleIds.length,
            rolesRemoved: existingRoles.length
          },
          req
        });
      } catch (auditError) {
        console.error('Audit logging failed:', auditError);
      }
    });

    return NextResponse.json({
      success: true,
      message: 'User roles assigned successfully',
      userProfileId: userProfile.ID
    });
  } catch (error) {
    console.error('Error assigning roles:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT to update specific user role
export async function PUT(req) {
  try {
    // Check for DEV override
    const isDevOverride = req.headers.get('x-dev-override') === 'true' &&
      process.env.NEXT_PUBLIC_MODE === 'DEV';

    if (!isDevOverride) {
      const authHeader = req.headers.get('Authorization');
      const token_res = TokenValidation(authHeader);

      if (!token_res.success) {
        return NextResponse.json({ success: false, message: token_res.message }, { status: token_res.status });
      }
      // Require actor email for auditability
      const sessionEmail = req.headers.get('x-session-email');
      if (!sessionEmail) {
        return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
      }
    }
    const { userRoleId, updates } = await req.json();

    if (!userRoleId) {
      return NextResponse.json({ error: 'User role ID is required' }, { status: 400 });
    }

    // Fetch before state
    const beforeUserRole = await prisma.UserRole.findUnique({
      where: { ID: parseInt(userRoleId) },
      include: {
        Role: true,
        UserProfile: true
      }
    });

    const updatedUserRole = await prisma.UserRole.update({
      where: { ID: parseInt(userRoleId) },
      data: {
        ...updates,
        // Note: UpdatedAt will be handled automatically by @updatedAt in schema
      },
      include: {
        Role: true,
        UserProfile: true
      }
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
        entityId: userRoleId,
        before: beforeUserRole,
        after: updatedUserRole,
        metadata: { userEmail: updatedUserRole.UserProfile.UserEmail },
        req
      });
    } catch (auditError) {
      console.error('Audit logging failed:', auditError);
    }

    return NextResponse.json({
      success: true,
      message: 'User role updated successfully',
      userRole: updatedUserRole
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE to remove a specific role from a user
export async function DELETE(req) {
  try {
    // Check for DEV override
    const isDevOverride = req.headers.get('x-dev-override') === 'true' &&
      process.env.NEXT_PUBLIC_MODE === 'DEV';

    if (!isDevOverride) {
      const authHeader = req.headers.get('Authorization');
      const token_res = TokenValidation(authHeader);

      if (!token_res.success) {
        return NextResponse.json({ success: false, message: token_res.message }, { status: token_res.status });
      }
      // Require actor email for auditability
      const sessionEmail = req.headers.get('x-session-email');
      if (!sessionEmail) {
        return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
      }
    }
    const { searchParams } = new URL(req.url);
    const userRoleId = searchParams.get('userRoleId');

    if (!userRoleId) {
      return NextResponse.json({ error: 'User role ID is required' }, { status: 400 });
    }

    // Fetch before state
    const beforeUserRole = await prisma.UserRole.findUnique({
      where: { ID: parseInt(userRoleId) },
      include: {
        Role: true,
        UserProfile: true
      }
    });

    // Check if trying to remove Superadmin role from the last active Superadmin
    if (beforeUserRole) {
      const removalCheck = await SuperadminGuard.canRemoveSuperadminRole(
        beforeUserRole.UserProfileID,
        beforeUserRole.RoleID
      );
      if (!removalCheck.allowed) {
        return NextResponse.json({
          success: false,
          error: removalCheck.message
        }, { status: 403 });
      }
    }

    await prisma.UserRole.delete({
      where: { ID: parseInt(userRoleId) }
    });

    // Audit log
    try {
      const authUser = await SecureSessionManager.authenticateUser(req);
      const actorEmail = authUser?.email || req.headers.get('x-session-email') || undefined;
      await AuditLogger.logDelete({
        userId: authUser?.id || null,
        email: actorEmail,
        module: 'user_management',
        entity: 'UserRole',
        entityId: userRoleId,
        before: {
          roleId: beforeUserRole.RoleID,
          roleName: beforeUserRole.Role.Name,
          userEmail: beforeUserRole.UserProfile.UserEmail
        },
        metadata: { userEmail: beforeUserRole.UserProfile.UserEmail },
        req
      });
    } catch (auditError) {
      console.error('Audit logging failed:', auditError);
    }

    return NextResponse.json({
      success: true,
      message: 'User role removed successfully'
    });
  } catch (error) {
    console.error('Error removing user role:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}