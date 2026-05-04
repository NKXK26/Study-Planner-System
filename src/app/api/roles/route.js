import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import RoleDB from "@app/class/Role/RoleDB";
import AuditLogger from "@app/class/Audit/AuditLogger";
import SecureSessionManager from "@utils/auth/SimpleSessionManager";
import SuperadminGuard from "@app/class/Role/SuperadminGuard";
import { TokenValidation } from "@app/api/api_helper";

// TODO: Authentication middleware to be implemented 

// TODO: Authorization check to be implemented 
async function checkAuthorization(user, requiredRole = 'admin') {
	// Temporarily disabled - will be implemented 
	return true;
}

// GET ROLES
export async function GET(req) {
	try {
		// Check for DEV override
		const isDevOverride = req.headers.get('x-dev-override') === 'true' &&
			process.env.NEXT_PUBLIC_MODE === 'DEV';


		if (!isDevOverride) {
			const sessionEmail = req.headers.get('x-session-email');
			const authHeader = req.headers.get('Authorization');
			const token_res = TokenValidation(authHeader);

			if (!token_res.success) {
				return NextResponse.json({ success: false, message: token_res.message }, { status: token_res.status });
			}

			const session_data = token_res.session;

			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}

			let email = session_data.email;
			// Authorization check
			if (!await checkAuthorization(email, 'admin')) {
				return NextResponse.json(
					{ message: 'Insufficient permissions' },
					{ status: 404 }
				);
			}
		}

		const { searchParams } = new URL(req.url);
		const id = searchParams.get('id');
		const name = searchParams.get('name');
		const isActive = searchParams.get('isActive');
		const isSystem = searchParams.get('isSystem');
		const return_attributes = searchParams.get('return');
		const order_by = searchParams.get('order_by');

		const filters = {
			id,
			name,
			isActive: isActive ? isActive === 'true' : undefined,
			isSystem: isSystem ? isSystem === 'true' : undefined,
			return: return_attributes,
			order_by
		};

		const result = await RoleDB.FetchRoles(filters);

		if (!result.success) {
			return NextResponse.json(
				{ message: result.message },
				{ status: 400 }
			);
		}

		return NextResponse.json(result.data);
	} catch (error) {
		console.error('Error fetching roles:', error);
		return NextResponse.json(
			{ message: 'Internal server error' },
			{ status: 500 }
		);
	}
}

// CREATE ROLE
export async function POST(req) {
	try {
		// Check for DEV override
		const isDevOverride = req.headers.get('x-dev-override') === 'true' &&
			process.env.NEXT_PUBLIC_MODE === 'DEV';

		if (!isDevOverride) {
			const sessionEmail = req.headers.get('x-session-email');
			const authHeader = req.headers.get('Authorization');
			const token_res = TokenValidation(authHeader);

			if (!token_res.success) {
				return NextResponse.json({ success: false, message: token_res.message }, { status: token_res.status });
			}

			const session_data = token_res.session;

			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
			let email = session_data.email

			// Authorization check
			if (!await checkAuthorization(email, 'admin')) {
				return NextResponse.json(
					{ message: 'Insufficient permissions' },
					{ status: 403 }
				);
			}
		}

		const roleData = await req.json();
		const result = await RoleDB.CreateRole(roleData);

		if (!result.success) {
			return NextResponse.json(
				{ message: result.message, errors: result.errors },
				{ status: 400 }
			);
		}

		// AUDIT LOG
		try {
			const authUser = await SecureSessionManager.authenticateUser(req);
			const actorEmail = authUser?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logCreate({
				userId: authUser?.id || null,
				email: actorEmail,
				module: 'role_management',
				entity: 'Role',
				entityId: result.data.ID,
				after: result.data,
				metadata: { roleName: result.data.Name, isSystem: result.data.IsSystem },
				req
			});
		} catch (e) {
			console.warn('Audit CREATE Role failed:', e?.message);
		}

		return NextResponse.json(
			{ message: result.message, role: result.data },
			{ status: 201 }
		);
	} catch (error) {
		console.error('Error creating role:', error);
		return NextResponse.json(
			{ message: 'Internal server error' },
			{ status: 500 }
		);
	}
}

// UPDATE ROLE
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

			const session_data = token_res.session;

			const sessionEmail = req.headers.get('x-session-email');
			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
			// Authentication check
			let email = session_data.email

			// Authorization check
			if (!await checkAuthorization(email, 'admin')) {
				return NextResponse.json(
					{ message: 'Insufficient permissions' },
					{ status: 403 }
				);
			}
		}

		const { searchParams } = new URL(req.url);
		const id = searchParams.get('id');

		if (!id) {
			return NextResponse.json(
				{ message: 'Role ID is required' },
				{ status: 400 }
			);
		}

		// Fetch before state for audit
		const beforeResult = await RoleDB.FetchRoleById(id);
		const beforeData = beforeResult.success ? beforeResult.data : null;

		// Check if developer override is enabled
		const isDeveloperMode = process.env.NODE_ENV === 'development' &&
			process.env.ALLOW_DEV_OVERRIDE === 'true';

		const updateData = await req.json();

		// Check if trying to deactivate the Superadmin role
		if (beforeData && beforeData.Name === 'Superadmin' && updateData.IsActive === false) {
			const deactivateCheck = await SuperadminGuard.canDeactivateSuperadminRole();
			if (!deactivateCheck.allowed) {
				return NextResponse.json(
					{ message: deactivateCheck.message },
					{ status: 403 }
				);
			}
		}

		// Add developer override flag to update data
		if (isDeveloperMode) {
			updateData._developerOverride = true;
		}

		const result = await RoleDB.UpdateRole(id, updateData);

		if (!result.success) {
			return NextResponse.json(
				{ message: result.message, errors: result.errors },
				{ status: 400 }
			);
		}

		// AUDIT LOG
		try {
			const authUser = await SecureSessionManager.authenticateUser(req);
			const actorEmail = authUser?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logUpdate({
				userId: authUser?.id || null,
				email: actorEmail,
				module: 'role_management',
				entity: 'Role',
				entityId: id,
				before: beforeData,
				after: result.data,
				metadata: { roleName: result.data.Name, isDeveloperOverride: isDeveloperMode && beforeData?.IsSystem },
				req
			});
		} catch (e) {
			console.warn('Audit UPDATE Role failed:', e?.message);
		}

		return NextResponse.json(
			{ message: result.message, role: result.data }
		);
	} catch (error) {
		console.error('Error updating role:', error);
		return NextResponse.json(
			{ message: 'Internal server error' },
			{ status: 500 }
		);
	}
}

// DELETE ROLE
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

			const session_data = token_res.session;

			let email = session_data.email
			const sessionEmail = req.headers.get('x-session-email');
			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
		}

		const { searchParams } = new URL(req.url);
		const id = searchParams.get('id');

		if (!id) {
			return NextResponse.json(
				{ message: 'Role ID is required' },
				{ status: 400 }
			);
		}

		// Fetch before state for audit
		const beforeResult = await RoleDB.FetchRoleById(id);
		const beforeData = beforeResult.success ? beforeResult.data : null;

		// Check if developer override is enabled
		const isDeveloperMode = process.env.NODE_ENV === 'development' &&
			process.env.ALLOW_DEV_OVERRIDE === 'true';

		// Pass developer override information
		const result = await RoleDB.DeleteRole(id, { _developerOverride: isDeveloperMode });

		if (!result.success) {
			return NextResponse.json(
				{ message: result.message },
				{ status: 400 }
			);
		}

		// AUDIT LOG
		try {
			const authUser = await SecureSessionManager.authenticateUser(req);
			const actorEmail = authUser?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logDelete({
				userId: authUser?.id || null,
				email: actorEmail,
				module: 'role_management',
				entity: 'Role',
				entityId: id,
				before: beforeData,
				metadata: { roleName: beforeData?.Name, isDeveloperOverride: isDeveloperMode && beforeData?.IsSystem },
				req
			});
		} catch (e) {
			console.warn('Audit DELETE Role failed:', e?.message);
		}

		return NextResponse.json(
			{ message: result.message }
		);
	} catch (error) {
		console.error('Error deleting role:', error);
		return NextResponse.json(
			{ message: 'Internal server error' },
			{ status: 500 }
		);
	}
}

// REORDER ROLES (PATCH)
export async function PATCH(req) {
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

			const session_data = token_res.session;

			const sessionEmail = req.headers.get('x-session-email');
			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
		}

		const { roleOrders } = await req.json();

		if (!roleOrders || !Array.isArray(roleOrders)) {
			return NextResponse.json(
				{ message: 'Role orders array is required' },
				{ status: 400 }
			);
		}

		const result = await RoleDB.ReorderRoles(roleOrders);

		if (!result.success) {
			return NextResponse.json(
				{ message: result.message },
				{ status: 400 }
			);
		}

		// AUDIT LOG
		try {
			const authUser = await SecureSessionManager.authenticateUser(req);
			const actorEmail = authUser?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logUpdate({
				userId: authUser?.id || null,
				email: actorEmail,
				module: 'role_management',
				entity: 'RoleOrder',
				entityId: null,
				before: null,
				after: roleOrders,
				metadata: { reorderedCount: roleOrders.length },
				req
			});
		} catch (e) {
			console.warn('Audit REORDER Roles failed:', e?.message);
		}

		return NextResponse.json(
			{ message: result.message, success: true }
		);
	} catch (error) {
		console.error('Error reordering roles:', error);
		return NextResponse.json(
			{ message: 'Internal server error' },
			{ status: 500 }
		);
	}
}
