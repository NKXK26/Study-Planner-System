import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import AuditLogger from "@app/class/Audit/AuditLogger";
import SecureSessionManager from "@utils/auth/SimpleSessionManager";
import { TokenValidation } from "@app/api/api_helper";

// TODO: Authentication middleware to be implemented
// This is a placeholder for future authentication implementation
async function authenticateUser(req) {
	// Temporarily disabled - will be implemented
	return { id: 'temp_user', role: 'admin' };
}

// TODO: Authorization check to be implemented
async function checkAuthorization(user, requiredRole = 'admin') {
	// Temporarily disabled - will be implemented
	return true;
}


// GET ROLE PERMISSIONS
export async function GET(req, { params }) {
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
			const sessionEmail = req.headers.get('x-session-email');
			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
			// Authentication check
			const user = await authenticateUser(req);
			if (!user) {
				return NextResponse.json(
					{ message: 'Authentication required' },
					{ status: 401 }
				);
			}

			// Authorization check
			if (!await checkAuthorization(user, 'admin')) {
				return NextResponse.json(
					{ message: 'Insufficient permissions' },
					{ status: 403 }
				);
			}
		}

		const { id } = await params;
		const roleId = parseInt(id);

		if (isNaN(roleId)) {
			return NextResponse.json(
				{ message: 'Invalid role ID' },
				{ status: 400 }
			);
		}

		// Get role with permissions
		const role = await prisma.Role.findUnique({
			where: { ID: roleId },
			include: {
				RolePermissions: {
					include: {
						Permission: true
					}
				}
			}
		});

		if (!role) {
			return NextResponse.json(
				{ message: 'Role not found' },
				{ status: 404 }
			);
		}

		// Get all available permissions
		const allPermissions = await prisma.Permission.findMany({
			where: { IsActive: true },
			orderBy: [
				{ Module: 'asc' },
				{ Resource: 'asc' },
				{ Action: 'asc' }
			]
		});

		// Create a map of role permissions
		const rolePermissionMap = new Map();
		role.RolePermissions.forEach(rp => {
			rolePermissionMap.set(rp.PermissionID, rp.Granted);
		});

		// Merge all permissions with role permissions
		const permissionsWithRole = allPermissions.map(permission => ({
			...permission,
			Granted: rolePermissionMap.has(permission.ID) ? rolePermissionMap.get(permission.ID) : false
		}));

		return NextResponse.json({
			role: {
				ID: role.ID,
				Name: role.Name,
				Description: role.Description,
				Color: role.Color,
				Priority: role.Priority,
				IsSystem: role.IsSystem,
				IsActive: role.IsActive
			},
			permissions: permissionsWithRole
		});
	} catch (error) {
		console.error('Error fetching role permissions:', error);
		return NextResponse.json(
			{ message: 'Internal server error' },
			{ status: 500 }
		);
	}
}

// UPDATE ROLE PERMISSIONS
export async function PUT(req, { params }) {
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

			const sessionEmail = req.headers.get('x-session-email');
			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
			// Authentication check
			const user = await authenticateUser(req);
			if (!user) {
				return NextResponse.json(
					{ message: 'Authentication required' },
					{ status: 401 }
				);
			}

			// Authorization check
			if (!await checkAuthorization(user, 'admin')) {
				return NextResponse.json(
					{ message: 'Insufficient permissions' },
					{ status: 403 }
				);
			}
		}

		const { id } = await params;
		const roleId = parseInt(id);

		if (isNaN(roleId)) {
			return NextResponse.json(
				{ message: 'Invalid role ID' },
				{ status: 400 }
			);
		}

		const { permissions } = await req.json();

		if (!Array.isArray(permissions)) {
			return NextResponse.json(
				{ message: 'Permissions must be an array' },
				{ status: 400 }
			);
		}

		// Check if role exists and fetch before state
		const role = await prisma.Role.findUnique({
			where: { ID: roleId },
			include: {
				RolePermissions: {
					include: { Permission: true }
				}
			}
		});

		if (!role) {
			return NextResponse.json(
				{ message: 'Role not found' },
				{ status: 404 }
			);
		}

		// Check if role is system role and if developer override is enabled
		const isDeveloperMode = process.env.NODE_ENV === 'development' &&
			process.env.ALLOW_DEV_OVERRIDE === 'true';

		if (role.IsSystem && !isDeveloperMode) {
			return NextResponse.json(
				{ message: 'Cannot modify permissions of system roles in production mode. Set ALLOW_DEV_OVERRIDE=true in development environment' },
				{ status: 403 }
			);
		}

		// Log developer override usage for audit purposes
		if (role.IsSystem && isDeveloperMode) {
			console.log(`⚠️ DEVELOPER OVERRIDE: Modifying system role "${role.Name}" (ID: ${roleId}) permissions`);
			console.log(`   Override method: NODE_ENV=development + ALLOW_DEV_OVERRIDE=true`);
		}

		const beforePermissions = role.RolePermissions.map(rp => ({
			permissionId: rp.PermissionID,
			resource: rp.Permission.Resource,
			action: rp.Permission.Action,
			granted: rp.Granted
		}));

		// Start a transaction to update permissions
		await prisma.$transaction(async (tx) => {
			// Delete existing permissions for this role
			await tx.RolePermission.deleteMany({
				where: { RoleID: roleId }
			});

			// Create new permissions
			if (permissions.length > 0) {
				const permissionData = permissions.map(perm => ({
					RoleID: roleId,
					PermissionID: perm.ID,
					Granted: perm.Granted,
					GrantedAt: new Date()
				}));

				await tx.RolePermission.createMany({
					data: permissionData
				});
			}
		});

		const afterPermissions = permissions.filter(p => p.Granted).map(p => ({
			permissionId: p.ID,
			resource: p.Resource || 'unknown',
			action: p.Action || 'unknown',
			granted: p.Granted
		}));

		// AUDIT LOG
		try {
			const authUser = await SecureSessionManager.authenticateUser(req);
			const actorEmail = authUser?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logUpdate({
				userId: authUser?.id || null,
				email: actorEmail,
				module: 'role_management',
				entity: 'RolePermissions',
				entityId: roleId,
				before: beforePermissions,
				after: afterPermissions,
				metadata: { roleName: role.Name, isDeveloperOverride: isDeveloperMode && role.IsSystem }
			});
		} catch (e) {
			console.warn('Audit UPDATE RolePermissions failed:', e?.message);
		}

		return NextResponse.json({
			message: `Role permissions updated successfully${role.IsSystem && isDeveloperMode ? ' (Developer Override Used)' : ''}`
		});
	} catch (error) {
		console.error('Error updating role permissions:', error);
		return NextResponse.json(
			{ message: 'Internal server error' },
			{ status: 500 }
		);
	}
}

// DELETE ROLE PERMISSIONS (remove all permissions from a role)
export async function DELETE(req, { params }) {
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

			const sessionEmail = req.headers.get('x-session-email');
			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
			// Authentication check
			const user = await authenticateUser(req);
			if (!user) {
				return NextResponse.json(
					{ message: 'Authentication required' },
					{ status: 400 }
				);
			}

			// Authorization check
			if (!await checkAuthorization(user, 'admin')) {
				return NextResponse.json(
					{ message: 'Insufficient permissions' },
					{ status: 403 }
				);
			}
		}

		const { id } = await params;
		const roleId = parseInt(id);

		if (isNaN(roleId)) {
			return NextResponse.json(
				{ message: 'Invalid role ID' },
				{ status: 400 }
			);
		}

		// Check if role exists and fetch before state
		const role = await prisma.Role.findUnique({
			where: { ID: roleId },
			include: {
				RolePermissions: {
					include: { Permission: true }
				}
			}
		});

		if (!role) {
			return NextResponse.json(
				{ message: 'Role not found' },
				{ status: 404 }
			);
		}

		// Check if role is system role and if developer override is enabled
		const isDeveloperMode = process.env.NODE_ENV === 'development' &&
			process.env.ALLOW_DEV_OVERRIDE === 'true';

		if (role.IsSystem && !isDeveloperMode) {
			return NextResponse.json(
				{ message: 'Cannot modify permissions of system roles in production mode. Set ALLOW_DEV_OVERRIDE=true in development environment' },
				{ status: 403 }
			);
		}

		// Log developer override usage for audit purposes
		if (role.IsSystem && isDeveloperMode) {
			console.log(`DEVELOPER OVERRIDE: Removing all permissions from system role "${role.Name}" (ID: ${roleId})`);
			console.log(`   Override method: NODE_ENV=development + ALLOW_DEV_OVERRIDE=true`);
		}

		const beforePermissions = role.RolePermissions.map(rp => ({
			permissionId: rp.PermissionID,
			resource: rp.Permission.Resource,
			action: rp.Permission.Action,
			granted: rp.Granted
		}));

		// Delete all permissions for this role
		await prisma.RolePermission.deleteMany({
			where: { RoleID: roleId }
		});

		// AUDIT LOG
		try {
			const authUser = await SecureSessionManager.authenticateUser(req);
			const actorEmail = authUser?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logDelete({
				userId: authUser?.id || null,
				email: actorEmail,
				module: 'role_management',
				entity: 'RolePermissions',
				entityId: roleId,
				before: beforePermissions,
				metadata: { roleName: role.Name, isDeveloperOverride: isDeveloperMode && role.IsSystem }
			});
		} catch (e) {
			console.warn('Audit DELETE RolePermissions failed:', e?.message);
		}

		return NextResponse.json({
			message: `All role permissions removed successfully${role.IsSystem && isDeveloperMode ? ' (Developer Override Used)' : ''}`
		});
	} catch (error) {
		console.error('Error removing role permissions:', error);
		return NextResponse.json(
			{ message: 'Internal server error' },
			{ status: 500 }
		);
	}
}
