import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import AuditLogger from "@app/class/Audit/AuditLogger";
import SecureSessionManager from "@utils/auth/SimpleSessionManager";
import { TokenValidation } from "@app/api/api_helper";

// GET Unit Types
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
		const params_name = searchParams.get('name');
		const params_ids = searchParams.get('ids');
		const return_attributes = searchParams.get('return');
		const order_by = searchParams.get('order_by');

		// Pagination parameters
		// REMOVE PAGINATION

		let orderBy = undefined;
		if (order_by) {
			try {
				const parsed = JSON.parse(order_by);
				const allowed_columns = ['Name', 'Colour'];
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

		let select = undefined;
		if (return_attributes) {
			const allowed_attributes = ['ID', 'Name', 'Colour'];
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

		// Parse IDs
		let ids = [];
		if (params_ids) {
			try {
				const parsed = JSON.parse(params_ids);

				if (Array.isArray(parsed)) {
					ids = parsed.map(id => Number(id));
				} else {
					ids = [Number(parsed)];
				}
			} catch (err) {
				return NextResponse.json(
					{ error: 'Invalid IDs format. Must be a number or a JSON array of numbers' },
					{ status: 400 }
				);
			}
		}

		const query = {
			where: {
				...(params_name && {
					Name: {
						contains: params_name
					}
				}),
				...(ids.length > 0 && {
					ID: {
						in: ids
					}
				})
			},
			...(select && { select }),
			...(orderBy && { orderBy }),
		};

		const totalCount = await prisma.UnitType.count({ where: query.where });
		const unitTypes = await prisma.UnitType.findMany(query);

		if (unitTypes.length === 0) {
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
			data: unitTypes,
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
		console.error('Error:', error);
		return NextResponse.json(
			{ error: 'Failed to process the request', details: error.message },
			{ status: 500 }
		);
	}
}
// ADD Unit Type
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
		const { Name, Colour } = await req.json();

		if (!Name) {
			return NextResponse.json(
				{ message: 'Name is required' },
				{ status: 400 }
			);
		}

		const existingUnitType = await prisma.UnitType.findFirst({
			where: {
				Name: {
					equals: Name
				}
			}
		});

		if (existingUnitType) {
			return NextResponse.json(
				{ message: 'Unit type with this name already exists' },
				{ status: 409 }
			);
		}

		//Check for existing colour
		if (Colour) {
			const colourExist = await prisma.UnitType.findFirst({
				where: { Colour }
			});

			if (colourExist) {
				return NextResponse.json(
					{ message: 'A unit with the same colour already exists' },
					{ status: 409 }
				);
			}
		}

		const newUnitType = await prisma.UnitType.create({
			data: {
				Name,
				Colour: Colour || '#000000'
			}
		});

		// AUDIT CREATE
		try {
			const user = await SecureSessionManager.authenticateUser(req);
			const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logCreate({
				userId: user?.id || null,
				email: actorEmail,
				module: 'unit_management',
				entity: 'UnitType',
				entityId: newUnitType.ID,
				after: newUnitType
			}, req);
		} catch (e) {
			console.warn('Audit CREATE UnitType failed:', e?.message);
		}

		return NextResponse.json(
			{
				message: 'Unit type created successfully',
				unitType: {
					id: newUnitType.ID,
					name: newUnitType.Name,
					colour: newUnitType.Colour
				}
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error('Error:', error);
		return NextResponse.json(
			{ error: 'Failed to create unit type', details: error.message },
			{ status: 500 }
		);
	}
}

// UPDATE Unit Type
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
		const { ID, Name, Colour } = await req.json();

		if (!ID) {
			return NextResponse.json(
				{ message: 'Unit type ID is required' },
				{ status: 400 }
			);
		}

		// Check if unit type exists
		const existingUnitType = await prisma.UnitType.findUnique({
			where: { ID }
		});

		if (!existingUnitType) {
			return NextResponse.json(
				{ message: 'Unit type not found' },
				{ status: 404 }
			);
		}

		// Check if name is being changed to something that already exists
		if (Name && Name !== existingUnitType.Name) {
			const nameExists = await prisma.UnitType.findFirst({
				where: { Name }
			});

			if (nameExists) {
				return NextResponse.json(
					{ message: 'Another unit type with this name already exists' },
					{ status: 409 }
				);
			}
		}

		if (Colour && Colour !== existingUnitType.Colour) {
			const colourExist = await prisma.UnitType.findFirst({
				where: {
					Colour,
					ID: { not: ID }
				}
			});

			if (colourExist) {
				return NextResponse.json(
					{ message: 'Another unit type with the same colour already exists' },
					{ status: 409 }
				);
			}
		}

		// Update unit type
		const updatedUnitType = await prisma.UnitType.update({
			where: { ID },
			data: {
				Name,
				Colour
			},
			select: {
				ID: true,
				Name: true,
				Colour: true
			}
		});

		// AUDIT UPDATE
		try {
			const user = await SecureSessionManager.authenticateUser(req);
			const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logUpdate({
				userId: user?.id || null,
				email: actorEmail,
				module: 'unit_management',
				entity: 'UnitType',
				entityId: ID,
				before: existingUnitType,
				after: updatedUnitType
			}, req);
		} catch (e) {
			console.warn('Audit UPDATE UnitType failed:', e?.message);
		}

		return NextResponse.json(
			{
				message: 'Unit type updated successfully',
				unitType: {
					id: updatedUnitType.ID,
					name: updatedUnitType.Name,
					colour: updatedUnitType.Colour
				}
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error('Error:', error);
		return NextResponse.json(
			{ error: 'Failed to update unit type', details: error.message },
			{ status: 500 }
		);
	}
}

// DELETE Unit Type
export async function DELETE(request) {
	try {
		// Check for DEV override
		const isDevOverride = request.headers.get('x-dev-override') === 'true' &&
			process.env.NEXT_PUBLIC_MODE === 'DEV';

		if (!isDevOverride) {
			const authHeader = request.headers.get('Authorization');
			const token_res = TokenValidation(authHeader);

			if (!token_res.success) {
				return NextResponse.json({ success: false, message: token_res.message }, { status: token_res.status });
			}
			// Require actor email for auditability
			const sessionEmail = request.headers.get('x-session-email');
			if (!sessionEmail) {
				return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
			}
		}
		const { ID } = await request.json();
		console.log('DELETE request received for unit type ID:', ID);

		if (!ID) {
			console.log('No ID provided in request');
			return NextResponse.json(
				{ success: false, message: 'Unit type ID is required' },
				{ status: 400 }
			);
		}

		// Prevent deletion of protected system unit types
		const unitType = await prisma.UnitType.findUnique({ where: { ID } });
		if (!unitType) {
			return NextResponse.json(
				{ success: false, message: 'Unit type not found' },
				{ status: 404 }
			);
		}
		const protectedNames = ['core', 'major', 'elective', 'mpu'];
		if (protectedNames.includes((unitType.Name || '').toLowerCase())) {
			return NextResponse.json(
				{ success: false, message: `"${unitType.Name}" is a system unit type and cannot be deleted` },
				{ status: 400 }
			);
		}

		// First check if this unit type is being used anywhere
		console.log('Checking if unit type is in use...');
		const isUsedInPlanner = await prisma.UnitInSemesterStudyPlanner.findFirst({
			where: { UnitTypeID: ID }
		});
		console.log('Is used in planner:', isUsedInPlanner);

		const isUsedInAmendment = await prisma.StudentStudyPlannerAmmendments.findFirst({
			where: { NewUnitTypeID: ID }
		});
		console.log('Is used in amendment:', isUsedInAmendment);

		const isUsed = isUsedInPlanner || isUsedInAmendment;
		console.log('Is unit type in use:', isUsed);

		if (isUsed) {
			return NextResponse.json(
				{ success: false, message: 'This unit type is being used and cannot be deleted' },
				{ status: 400 }
			);
		}

		// Then delete the unit type
		console.log('Attempting to delete unit type...');
		const deletedUnitType = await prisma.UnitType.delete({
			where: { ID },
		});
		console.log('Unit type deleted successfully:', deletedUnitType);

		// AUDIT DELETE
		try {
			const user = await SecureSessionManager.authenticateUser(request);
			const actorEmail = user?.email || request.headers.get('x-session-email') || undefined;
			await AuditLogger.logDelete({
				userId: user?.id || null,
				email: actorEmail,
				module: 'unit_management',
				entity: 'UnitType',
				entityId: ID,
				before: unitType
			}, request);
		} catch (e) {
			console.warn('Audit DELETE UnitType failed:', e?.message);
		}

		return NextResponse.json(
			{ success: true, message: 'Unit type deleted successfully', unitType: deletedUnitType },
			{ status: 200 }
		);
	} catch (error) {
		console.error('Delete error:', error);
		return NextResponse.json(
			{ success: false, message: 'Failed to delete unit type', error: error.message },
			{ status: 500 }
		);
	}
}