//ROUTE(BACKEND) FOR TERM

import prisma from "@utils/db/db";
import AuditLogger from "@app/class/Audit/AuditLogger";
import SecureSessionManager from "@utils/auth/SimpleSessionManager";
import { TokenValidation } from "@app/api/api_helper";
import { NextResponse } from "next/server";

//GET TERM

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
		const params = req.nextUrl.searchParams;
		const params_id = params.get('id');
		const params_name = params.get('name');
		const params_year = params.get('year');
		const params_month = params.get('month');
		const params_status = params.get('status');
		const order_by = params.get('order_by');
		const return_attributes = params.get('return');
		const exclude_raw = params.get('exclude');

		// Pagination parameters
		// REMOVE PAGINATION

		// Parse exclude
		let exclude = {};
		if (exclude_raw) {
			try {
				exclude = JSON.parse(exclude_raw);
			} catch (err) {
				console.warn("Invalid exclude format:", err.message);
			}
		}

		// Handle order_by
		let orderBy = undefined;
		if (order_by) {
			try {
				const parsed = JSON.parse(order_by);
				const allowed_columns = ['ID', 'Name', 'Year', 'Month', 'SemType', 'Status'];

				orderBy = parsed
					.filter(entry =>
						entry.column &&
						allowed_columns.includes(entry.column) &&
						typeof entry.ascending === 'boolean'
					)
					.map(entry => ({
						[entry.column]: entry.ascending ? 'asc' : 'desc'
					}));
			} catch (err) {
				console.warn("Invalid order_by format:", err.message);
			}
		}

		// Handle return attributes
		let select = undefined;
		if (return_attributes) {
			const allowed_attributes = ['ID', 'Name', 'Year', 'Month', 'SemType', 'Status'];
			const fields = return_attributes
				.split(',')
				.map(f => f.trim())
				.filter(f => allowed_attributes.includes(f));

			if (fields.length > 0) {
				select = {};
				fields.forEach(field => {
					select[field] = true;
				});
			}
		}

		// Parse params_id to array
		let idArray = [];
		if (params_id) {
			idArray = params_id.split(',').map(id => Number(id.trim()));
		}

		// Build where query with exclude logic
		const where = {
			...(idArray.length > 0 || exclude.ID?.length ? {
				ID: {
					...(idArray.length > 0 ? { in: idArray } : {}),
					...(exclude.ID?.length ? { notIn: exclude.ID } : {})
				}
			} : {}),

			...(params_name ? {
				Name: {
					contains: params_name,
					...(exclude.Name?.length ? { notIn: exclude.Name } : {})
				}
			} : (exclude.Name?.length ? { Name: { notIn: exclude.Name } } : {})),

			...(params_year ? {
				Year: {
					equals: Number(params_year),
					...(exclude.Year?.length ? { notIn: exclude.Year } : {})
				}
			} : (exclude.Year?.length ? { Year: { notIn: exclude.Year } } : {})),

			...(params_month && params_month !== "0" ? {
				Month: {
					equals: Number(params_month),
					...(exclude.Month?.length ? { notIn: exclude.Month } : {})
				}
			} : (exclude.Month?.length ? { Month: { notIn: exclude.Month } } : {})),

			// Adjusted Status filter
			...(params_status && params_status !== 'all' ? {
				Status: {
					equals: params_status,
					...(exclude.Status?.length ? { notIn: exclude.Status } : {})
				}
			} : (exclude.Status?.length ? { Status: { notIn: exclude.Status } } : {})),
		};

		const query = {
			where,
			...(select && { select }),
			...(orderBy && { orderBy })
			// No skip/take
		};

		const term_listing = await prisma.Term.findMany(query);
		const totalCount = await prisma.Term.count({ where });

		if (term_listing.length === 0) {
			return NextResponse.json({
				data: [],
				pagination: {
					total: totalCount,
					page: 1,
					limit: totalCount,
					totalPages: 1
				}
			}, { status: 200 });
		}

		return new NextResponse(JSON.stringify({
			data: term_listing,
			pagination: {
				total: totalCount,
				page: 1,
				limit: totalCount,
				totalPages: 1
			}
		}), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-store',
			},
		});
	} catch (error) {
		console.error('Error: ', error);
		return NextResponse.json(
			{ error: 'Failed to process the request', details: error.message },
			{ status: 500 }
		);
	}
}


//THIS IS WHERE U ADD THE NEW TERMS
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
		const { name, year, month, status, semtype } = await req.json();

		// Validation: Name
		if (!name || name.trim() === '') {
			return NextResponse.json(
				{ success: false, message: 'Name is required and cannot be empty' },
				{ status: 400 }
			);
		}

		// Validation: Year
		if (year === undefined || year === null || isNaN(Number(year))) {
			return NextResponse.json(
				{ success: false, message: 'Year is required and must be a valid number' },
				{ status: 400 }
			);
		}

		// Validation: Month
		if (month === undefined || month === null || isNaN(Number(month)) || Number(month) < 1 || Number(month) > 12) {
			return NextResponse.json(
				{ success: false, message: 'Month is required and must be a valid number between 1 and 12' },
				{ status: 400 }
			);
		}

		// Validation: Semester Type
		if (!semtype || (semtype !== "Long Semester" && semtype !== "Short Semester")) {
			return NextResponse.json(
				{ success: false, message: 'Semester Type is required and must be valid' },
				{ status: 400 }
			);
		}

		const duplicate_term_name = await prisma.Term.findFirst({
			where: {
				Name: name,
			},
		});

		if (duplicate_term_name) {
			return NextResponse.json({
				success: false,
				message: 'A term with this name already exists',
			}, { status: 400 });
		}

		const duplicate_term = await prisma.Term.findFirst({
			where: {
				Year: Number(year),
				Month: Number(month),
				SemType: semtype,
			},
		});

		if (duplicate_term) {
			return NextResponse.json({
				success: false,
				message: 'A term with this name, year, month, or semester type combination already exists',
			}, { status: 400 });
		}

		// Create new term - will now allow same name/month with different year
		const newTerm = await prisma.Term.create({
			data: {
				Name: name,
				Year: Number(year),
				Month: Number(month),
				Status: status.toLowerCase() || 'unavailable',
				SemType: semtype,
			},
		});

		try {
			const user = await SecureSessionManager.authenticateUser(req);
			const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logCreate({
				userId: user?.id || null,
				email: actorEmail,
				module: 'term_management',
				entity: 'Term',
				entityId: newTerm.ID,
				after: newTerm
			}, req);
		} catch (e) {
			console.warn('Audit CREATE Term failed:', e?.message);
		}

		return NextResponse.json(
			{
				success: true,
				message: 'Term created successfully',
				term: newTerm,
			},
			{ status: 201 }
		);

	} catch (error) {
		console.error('Error creating term:', error);

		return NextResponse.json(
			{
				success: false,
				message: 'Failed to create term',
				error: error.message,
			},
			{ status: 500 }
		);
	}
}

//THIS IS WHERE YOU EDIT TERM
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
		let term_data = await req.json();

		// Validate required fields
		if (!term_data.id || !term_data.name || !term_data.year || !term_data.month || !term_data.status || !term_data.semtype) {
			console.warn("Missing fields:", {
				name: term_data.name,
				year: term_data.year,
				month: term_data.month,
				semtype: term_data.semtype,
				status: term_data.status.toLowerCase(),
			});
			return NextResponse.json({
				success: false,
				message: "Missing required fields",
			}, { status: 400 });
		}

		// Check if the term exists
		const existing_term = await prisma.Term.findUnique({
			where: {
				ID: term_data.id,
			},
		});

		if (!existing_term) {
			return NextResponse.json({
				success: false,
				message: 'Term does not exist',
			}, { status: 404 });
		}

		const duplicate_term_name = await prisma.Term.findFirst({
			where: {
				Name: term_data.name,
				NOT: {
					ID: term_data.id, // Exclude current term from duplicate check
				},
			},
		});

		if (duplicate_term_name) {
			return NextResponse.json({
				success: false,
				message: 'A term with this name already exists',
			}, { status: 400 });
		}

		// Check for duplicate term (same name, year, and month combination)
		const duplicate_term = await prisma.Term.findFirst({
			where: {
				Year: Number(term_data.year),
				Month: Number(term_data.month),
				SemType: term_data.semtype,
				NOT: {
					ID: term_data.id, // Exclude current term from duplicate check
				},
			},
		});

		if (duplicate_term) {
			return NextResponse.json({
				success: false,
				message: 'A term with this year, month, and semester type combination already exists',
			}, { status: 400 });
		}

		// Update the term
		const updated_term = await prisma.Term.update({
			where: {
				ID: term_data.id,
			},
			data: {
				Name: term_data.name,
				Year: parseInt(term_data.year, 10),
				Month: parseInt(term_data.month, 10),
				SemType: term_data.semtype,
				Status: term_data.status,
			},
		});

		try {
			const user = await SecureSessionManager.authenticateUser(req);
			const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logUpdate({
				userId: user?.id || null,
				email: actorEmail,
				module: 'term_management',
				entity: 'Term',
				entityId: term_data.id,
				before: existing_term,
				after: updated_term
			}, req);
		} catch (e) {
			console.warn('Audit UPDATE Term failed:', e?.message);
		}

		return NextResponse.json({
			success: true,
			message: 'Term updated successfully',
			data: updated_term,
		}, { status: 200 });

	} catch (error) {
		console.error('Error:', error);
		return NextResponse.json({
			success: false,
			message: 'Error updating term',
			error: error.message,
		}, { status: 500 });
	}
}

//THIS IS WHERE YOU DELETE THE TERMS

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
		const { id } = await req.json();

		// Validation
		if (!id) {
			return NextResponse.json({
				success: false,
				message: 'Term ID is required for deletion.',
			}, { status: 400 });
		}

		console.log("Deleting term with ID:", id);

		// Check if the term exists
		const termToDelete = await prisma.Term.findUnique({
			where: {
				ID: parseInt(id)
			},
		});

		const valid_to_be_deleted = await prisma.$transaction(async (tx) => {
			// Query CourseIntake for matching TermID
			const courseIntakes = await tx.courseIntake.findMany({
				where: { TermID: id },
			});

			// Query UnitHistory for matching TermID
			const unitHistories = await tx.unitHistory.findMany({
				where: { TermID: id },
			});

			// If both exist, prevent deletion
			const canDelete = courseIntakes.length === 0 && unitHistories.length === 0;

			return canDelete;
		});

		if (!valid_to_be_deleted) {
			return NextResponse.json({
				success: false,
				message: 'Unable to be deleted because it is being referenced.',
			}, { status: 404 });
		}

		if (!termToDelete) {
			return NextResponse.json({
				success: false,
				message: 'Term not found.',
			}, { status: 404 });
		}

		// Delete the term
		await prisma.Term.delete({
			where: {
				ID: parseInt(id)
			},
		});

		try {
			const user = await SecureSessionManager.authenticateUser(req);
			const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logDelete({
				userId: user?.id || null,
				email: actorEmail,
				module: 'term_management',
				entity: 'Term',
				entityId: id,
				before: termToDelete
			}, req);
		} catch (e) {
			console.warn('Audit DELETE Term failed:', e?.message);
		}

		return NextResponse.json({
			success: true,
			message: 'Term deleted successfully.',
		}, { status: 200 });

	} catch (error) {
		console.error('Error deleting term:', error);
		return NextResponse.json({
			success: false,
			message: 'Failed to delete term.',
			error: error.message,
		}, { status: 500 });
	}
}