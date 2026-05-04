import { NextResponse } from 'next/server';
import AuditLogger from '@app/class/Audit/AuditLogger';
import SecureAuthHelper from '@utils/auth/FrontendAuthHelper';
import prisma from '@utils/db/db';
import { TokenValidation } from "@app/api/api_helper";

/**
 * GET /api/audit_logs
 * Fetch audit logs with optional filters and pagination
 * Only accessible by Superadmin role
 */
export async function GET(request) {
	try {
		const isDevOverride = request.headers.get('x-dev-override') === 'true' &&
			process.env.NEXT_PUBLIC_MODE === 'DEV';

		if (!isDevOverride) {
			const authHeader = request.headers.get('Authorization');
			const token_res = TokenValidation(authHeader);
	
			if (!token_res.success) {
				return NextResponse.json({ success: false, message: token_res.message }, { status: token_res.status });
			}
		}
		// Parse query parameters
		const { searchParams } = new URL(request.url);

		// Parse multiple modules and actions (comma-separated)
		const modulesParam = searchParams.get('modules');
		const actionsParam = searchParams.get('actions');
		const rolesParam = searchParams.get('roles');
		const userSearch = searchParams.get('userSearch');

		const filters = {
			userId: searchParams.get('userId'),
			modules: modulesParam ? modulesParam.split(',').filter(Boolean) : [],
			actions: actionsParam ? actionsParam.split(',').filter(Boolean) : [],
			roles: rolesParam ? rolesParam.split(',').filter(Boolean) : [],
			userSearch: userSearch || '',
			startDate: searchParams.get('startDate'),
			endDate: searchParams.get('endDate'),
			limit: parseInt(searchParams.get('limit') || '10'),
			offset: parseInt(searchParams.get('offset') || '0')
		};

		// Build where clause for count and query
		const where = {};
		if (filters.userId) where.UserID = parseInt(filters.userId);

		// Handle multiple modules filter
		if (filters.modules.length > 0) {
			where.Module = { in: filters.modules };
		}

		// Handle multiple actions filter
		if (filters.actions.length > 0) {
			where.Action = { in: filters.actions };
		}

		// Handle user search (search in email, first name, or last name)
		// Split by space to handle names like "Jeff Goh"
		if (filters.userSearch) {
			const searchTerms = filters.userSearch.trim().split(/\s+/); // Split by one or more spaces

			if (searchTerms.length === 1) {
				// Single word search - search in email, first name, or last name
				where.User = {
					OR: [
						{ Email: { contains: searchTerms[0] } },
						{ FirstName: { contains: searchTerms[0] } },
						{ LastName: { contains: searchTerms[0] } }
					]
				};
			} else {
				// Multiple words - search for all terms across first name, last name, and email
				const searchConditions = [];

				// Add condition for email containing the full search
				searchConditions.push({
					Email: { contains: filters.userSearch }
				});

				// Add conditions for each individual term in first name or last name
				searchTerms.forEach(term => {
					searchConditions.push({
						FirstName: { contains: term }
					});
					searchConditions.push({
						LastName: { contains: term }
					});
				});

				where.User = {
					OR: searchConditions
				};
			}
		}

		// Date filters
		if (filters.startDate) {
			where.CreatedAt = { gte: new Date(filters.startDate) };
		}
		if (filters.endDate) {
			where.CreatedAt = { ...where.CreatedAt, lte: new Date(filters.endDate) };
		}

		// Handle role filter - find users with specified roles
		if (filters.roles.length > 0) {
			const userProfilesWithRoles = await prisma.UserProfile.findMany({
				where: {
					UserRoles: {
						some: {
							Role: {
								Name: { in: filters.roles }
							}
						}
					}
				},
				select: {
					UserEmail: true
				}
			});

			const emailsWithRoles = userProfilesWithRoles.map(profile => profile.UserEmail);

			// Find user IDs from those emails
			const usersWithRoles = await prisma.users.findMany({
				where: {
					Email: { in: emailsWithRoles }
				},
				select: {
					ID: true
				}
			});

			const userIdsWithRoles = usersWithRoles.map(user => user.ID);

			// If we already have a User filter, combine it with AND
			if (where.User) {
				where.User = {
					AND: [
						where.User,
						{ ID: { in: userIdsWithRoles } }
					]
				};
			} else {
				where.UserID = { in: userIdsWithRoles };
			}
		}

		// Get total count for pagination (based on filters)
		const total = await prisma.AuditLog.count({ where });

		// Fetch filtered and paginated audit logs directly with Prisma
		const logs = await prisma.AuditLog.findMany({
			where,
			include: {
				User: {
					select: {
						FirstName: true,
						LastName: true,
						Email: true
					}
				}
			},
			orderBy: {
				CreatedAt: 'desc'
			},
			take: filters.limit,
			skip: filters.offset
		});

		// Fetch roles for each user
		const userEmails = logs.map(log => log.User?.Email).filter(Boolean);
		const userProfiles = await prisma.UserProfile.findMany({
			where: {
				UserEmail: { in: userEmails }
			},
			include: {
				UserRoles: {
					include: {
						Role: {
							select: {
								Name: true,
								Color: true
							}
						}
					}
				}
			}
		});

		// Create a map of email to roles for quick lookup
		const emailToRoles = {};
		userProfiles.forEach(profile => {
			const roles = profile.UserRoles.map(ur => ({
				name: ur.Role.Name,
				color: ur.Role.Color
			}));
			emailToRoles[profile.UserEmail] = roles;
		});

		// Transform logs to include email from Details if available
		const transformedLogs = logs.map(log => {
			// Determine user name - show "Developer" instead of "Unknown" for null users (DEV mode)
			let userName = 'Unknown';
			let email = 'Unknown';

			if (log.UserID === null || log.UserID === undefined) {
				// No user ID means this was likely done in DEV mode
				userName = 'Developer';
				email = 'developer@dev.local';
			} else if (log.User) {
				userName = `${log.User.FirstName || ''} ${log.User.LastName || ''}`.trim();
				email = log.User.Email || 'Unknown';
			}

			// Try to extract email from Details JSON if not already set
			if (email !== 'developer@dev.local') {
				try {
					const details = typeof log.Details === 'string' ? JSON.parse(log.Details) : log.Details;
					if (details && details.email) {
						email = details.email;
					}
				} catch (e) {
					// Ignore JSON parse errors
				}
			}

			// Get roles for this user
			const userRoles = emailToRoles[email] || [];

			return {
				id: log.ID,
				timestamp: log.CreatedAt,
				user: {
					id: log.UserID,
					name: userName,
					email: email,
					roles: userRoles
				},
				action: log.Action,
				module: log.Module,
				details: log.Details,
				ipAddress: log.IPAddress,
				userAgent: log.UserAgent
			};
		});

		return NextResponse.json({
			success: true,
			logs: transformedLogs,
			count: transformedLogs.length,
			total: total, // Total count for pagination (filtered)
			filters
		});
	} catch (error) {
		console.error('Error fetching audit logs:', error);
		return NextResponse.json(
			{
				success: false,
				error: 'Failed to fetch audit logs',
				message: error.message
			},
			{ status: 500 }
		);
	}
}
