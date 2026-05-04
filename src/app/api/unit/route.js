import UnitRequisite from "@app/class/UnitRequisite/UnitRequiste";
import prisma from "@utils/db/db";
import AuditLogger from "@app/class/Audit/AuditLogger";
import SecureSessionManager from "@utils/auth/SimpleSessionManager";
import { NextResponse } from "next/server";
import { TokenValidation } from "@app/api/api_helper";

//GET UNIT
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
		const params_code = params.get('code');
		const params_exact = params.has('exact') ? params.get('exact') === 'true' : false;

		const codesArray = params_code ? params_code.split(',').map(c => c.trim().toUpperCase()).filter(Boolean) : [];
		const codesIDs = params_id ? params_id.split(',') : [];
		const params_name = params.get('name');
		const params_availability = params.get('availability');
		const return_attributes = params.get('return');
		const order_by = params.get('order_by');
		const exclude_raw = params.get('exclude');

		// REMOVE PAGINATION

		// Parse exclude if exists
		let exclude = {};
		if (exclude_raw) {
			try {
				exclude = JSON.parse(exclude_raw);
			} catch (err) {
				console.warn("Invalid exclude format:", err.message);
			}
		}

		// Convert stringified order_by into Prisma format
		let orderBy = undefined;
		const allowed_columns = ['ID', 'UnitCode', 'Name', 'Availability', 'CreditPoints'];
		if (order_by) {
			try {
				const parsed = JSON.parse(order_by);

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

		// Select fields - Include CreditPoints in the allowed attributes
		let select = undefined;
		if (return_attributes) {
			const fields = return_attributes
				.split(',')
				.map(f => f.trim())
				.filter(f => allowed_columns.includes(f));

			if (fields.length > 0) {
				select = {};
				fields.forEach(field => {
					select[field] = true;
				});
			}
		}

		// Build Prisma filter query
		const where = {
			// UnitCode filter
			...(codesArray.length > 0
				? {
					UnitCode:
						params_exact
							? codesArray.length === 1
								? { equals: codesArray[0] }
								: { in: codesArray }
							: codesArray.length === 1
								? { contains: codesArray[0] }
								: { in: codesArray }
				}
				: exclude.UnitCode?.length
					? { UnitCode: { notIn: exclude.UnitCode } }
					: {}),

			// ID filter
			...(codesIDs.length > 0
				? {
					ID:
						codesIDs.length === 1
							? { equals: parseInt(codesIDs[0], 10) }
							: { in: codesIDs.map(id => parseInt(id, 10)) }
				}
				: exclude.ID?.length
					? { ID: { notIn: exclude.ID } }
					: {}),

			// Name filter
			...(params_name
				? {
					Name: {
						contains: params_name,
						...(exclude.Name?.length ? { notIn: exclude.Name } : {})
					}
				}
				: (exclude.Name?.length ? { Name: { notIn: exclude.Name } } : {})),

			// Availability filter
			...(params_availability && params_availability !== 'all'
				? {
					Availability: {
						equals: params_availability
					}
				}
				: (exclude.Availability?.length
					? { Availability: { notIn: exclude.Availability } }
					: {}))
		};

		const totalCount = await prisma.Unit.count({ where });

		// Final query
		const query = {
			where,
			...(orderBy && { orderBy }),
			include: {
				UnitRequisiteRelationship_UnitRequisiteRelationship_UnitIDToUnit: {
					include: {
						Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit: {
							select: {
								ID: true,
								UnitCode: true,
								Name: true,
							},
						},
					},
					orderBy: {
						ID: 'asc',
					},
				},
				UnitTermOffered: {
					select: {
						ID: true,
						UnitID: true,
						TermType: true,
					},
				},
			},
		};
		// Fetch unit data from Prisma
		const unit_listing = await prisma.Unit.findMany(query);
		console.log('unit_listing', unit_listing)

		if (unit_listing.length === 0) {
			return new NextResponse(JSON.stringify({
				data: [],
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
		}

		return new NextResponse(JSON.stringify({
			data: unit_listing,
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

//ADD UNIT
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
		const unit_req = await req.json();
		const unit_data = unit_req.unit;
		const unit_requisites = unit_req.requisites;

		console.log('unit_data', unit_data)

		const unit_add_res = await prisma.$transaction(async (tx) => {

			if (unit_data.availability.trim().toLowerCase() == "published") {
				const existing_units = await tx.Unit.findMany({
					where: {
						UnitCode: unit_data.code,
						Availability: "published"
					},
				});

				if (existing_units.length > 0) {
					console.log('Found existing units:', existing_units.map(u => u.ID));

					await tx.Unit.updateMany({
						where: {
							ID: { in: existing_units.map(u => u.ID) },
						},
						data: {
							Availability: "unpublished",
						},
					});
				}
			}
			// If unit already exists, mark all previous ones with the same code as unpublished
			// Create unit
			const new_unit = await tx.Unit.create({
				data: {
					UnitCode: unit_data.code.trim(),
					Name: unit_data.name.trim(),
					CreditPoints: parseFloat(unit_data.cp),
					Availability: unit_data.availability.trim(),
				},
			});

			// Add offered terms
			if (unit_data.offered_terms && Array.isArray(unit_data.offered_terms)) {
				await tx.UnitTermOffered.createMany({
					data: unit_data.offered_terms.map(term => ({
						UnitID: new_unit.ID,
						TermType: term
					}))
				});
			}

			// Add requisites if provided
			if (unit_requisites && Array.isArray(unit_requisites)) {
				const requisites_result = await AddUnitRequisites(new_unit.ID, unit_requisites, tx);

				if (!requisites_result.success) {
					// Abort transaction early by returning structured failure
					return requisites_result;
				}
			}

			return { success: true, message: "Unit created successfully", unit: new_unit };
		});
		if (!unit_add_res.success) {
			return NextResponse.json(
				{
					message: 'Unit failed to be added!',
				},
				{ status: 400 }
			);
		}

		const new_unit = unit_add_res.unit;
		console.log('new_unit', new_unit)

		// Fetch complete unit with offered terms for audit
		const new_unit_complete = await prisma.Unit.findUnique({
			where: {
				ID: new_unit.ID
			},
			include: {
				UnitTermOffered: {
					select: {
						TermType: true
					}
				}
			}
		});

		try {
			const user = await SecureSessionManager.authenticateUser(req);
			const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logCreate({
				userId: user?.id || null,
				email: actorEmail,
				module: 'unit_management',
				entity: 'Unit',
				entityId: new_unit.UnitCode,
				after: new_unit_complete
			}, req);
		} catch (e) {
			console.warn('Audit CREATE Unit failed:', e?.message);
		}

		// Return success message along with created unit data
		return NextResponse.json({
			message: 'Unit added successfully',
			unit: new_unit,
		});
	} catch (error) {
		console.error('Error:', error);
		return NextResponse.json(
			{ error: 'Failed to process the request', message: error.message },
			{ status: 500 }
		);
	}

}

//EDIT UNIT
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
		const unit_req = await req.json();
		const unit_data = unit_req.unit.unit;
		const unit_requisites_add = unit_req.unit.requisites_add
		const unit_requisites_modified = unit_req.unit.requisites_modified
		const unit_requisites_deleted = unit_req.unit.requisites_deleted
		if (!unit_data.id || !unit_data.code || !unit_data.name || (unit_data.cp === null || unit_data.cp === undefined || unit_data.cp === '') || !unit_data.availability) {
			return NextResponse.json({
				success: false,
				message: "Missing required fields",
			}, { status: 400 });
		}

		const unit_id = parseInt(unit_data.id, 10);

		// Check if the unit with the original code exists and fetch related data for audit
		const is_existing_unit = await prisma.Unit.findUnique({
			where: {
				ID: unit_id,
			},
			include: {
				UnitTermOffered: {
					select: {
						TermType: true
					}
				},
				UnitRequisiteRelationship_UnitRequisiteRelationship_UnitIDToUnit: {
					select: {
						ID: true,
						RequisiteUnitID: true,
						UnitRelationship: true,
						LogicalOperators: true,
						MinCP: true
					}
				}
			}
		});

		if (!is_existing_unit) {
			return NextResponse.json({
				success: false,
				message: 'Unit does not exist!',
			}, { status: 400 });
		}

		// Update the unit in the database
		const result = await prisma.$transaction(async (tx) => {

			//Update the existing unit code to unpublished
			const duplicate_code_ids = await tx.Unit.findMany({
				where: {
					UnitCode: unit_data.code,
					Availability: "published",
					NOT: {
						ID: unit_id
					},
				},
			});

			if (duplicate_code_ids && duplicate_code_ids.length > 0) {
				await tx.Unit.updateMany({
					where: {
						ID: { in: duplicate_code_ids.map(u => u.ID) },
					},
					data: {
						Availability: "unpublished",
					},
				});
			}

			// Update the unit
			const unit_updated = await tx.Unit.update({
				where: {
					ID: unit_id
				},
				data: {
					UnitCode: unit_data.code.trim(),
					Name: unit_data.name.trim(),
					CreditPoints: parseFloat(unit_data.cp),
					Availability: unit_data.availability,
				},
			});

			
			// Insert new offered terms (if any)
			if (unit_data.offered_terms && Array.isArray(unit_data.offered_terms)) {
				// Delete old offered terms
				await tx.UnitTermOffered.deleteMany({
					where: { UnitID: unit_id }
				});

				const unitTermOfferedDataToAdd = unit_data.offered_terms.map(term => ({
					UnitID: unit_id,
					TermType: term
				}));

				console.log('unitTermOfferedDataToAdd', unitTermOfferedDataToAdd);
				await tx.UnitTermOffered.createMany({
					data: unitTermOfferedDataToAdd
				});
			}

			if (unit_requisites_add && Array.isArray(unit_requisites_add) && unit_requisites_add.length > 0) {
				//TODO: Update these functions to use the prisma
				const unit_requisite_add_res = await AddUnitRequisites(unit_id, unit_requisites_add, tx);
				console.log('unit_requisite_add_res', unit_requisite_add_res)
				if (!unit_requisite_add_res.success) {
					return unit_requisite_add_res;
				}
			}

			if (unit_requisites_modified && Array.isArray(unit_requisites_modified) && unit_requisites_modified.length > 0) {
				//TODO: Update these functions to use the prisma
				const unit_requisite_edit_res = await EditUnitRequisites(unit_id, unit_requisites_modified, tx);
				if (!unit_requisite_edit_res.success) {
					return unit_requisite_edit_res;
				}
			}

			if (unit_requisites_deleted && Array.isArray(unit_requisites_deleted) && unit_requisites_deleted.length > 0) {
				const unit_requisite_delete_res = await tx.UnitRequisiteRelationship.deleteMany({
					where: {
						ID: {
							in: unit_requisites_deleted,
						},
					},
				});
			}

			return {
				success: true,
				message: "Unit updated successfully",
				unit: unit_updated,
			};
		});

		if (!result.success) {
			return NextResponse.json({
				success: false,
				message: 'Unit updated unsuccesfully!',
			}, { status: 400 });
		}

		const unit_updated = result.unit;

		// Fetch complete updated unit with all related data for audit
		const unit_updated_complete = await prisma.Unit.findUnique({
			where: {
				ID: unit_id
			},
			include: {
				UnitTermOffered: {
					select: {
						TermType: true
					}
				},
				UnitRequisiteRelationship_UnitRequisiteRelationship_UnitIDToUnit: {
					select: {
						ID: true,
						RequisiteUnitID: true,
						UnitRelationship: true,
						LogicalOperators: true,
						MinCP: true
					}
				}
			}
		});

		try {
			const user = await SecureSessionManager.authenticateUser(req);
			const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logUpdate({
				userId: user?.id || null,
				email: actorEmail,
				module: 'unit_management',
				entity: 'Unit',
				entityId: unit_data.code,
				before: is_existing_unit,
				after: unit_updated_complete
			}, req);
		} catch (e) {
			console.warn('Audit UPDATE Unit failed:', e?.message);
		}

		return NextResponse.json({
			success: true,
			message: "Unit updated successfully",
			data: unit_updated,
		}, { status: 200 });

	} catch (error) {
		console.error('Error:', error);
		return NextResponse.json({
			success: false,
			message: "Failed to process the request",
			error: error.message,
		}, { status: 500 });
	}
}

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

		// Parse request
		const body = await req.json();
		const unit_ids = body.ids;
		console.log('unit_ids', unit_ids);

		if (!unit_ids || !Array.isArray(unit_ids) || unit_ids.length === 0) {
			return NextResponse.json({ message: 'Unit IDs are required' }, { status: 400 });
		}


		// Check for dependencies
		const [requisites, studyPlannerUnits] = await Promise.all([
			prisma.UnitRequisiteRelationship.findMany({
				where: { RequisiteUnitID: { in: unit_ids } },
			}),
			prisma.UnitInSemesterStudyPlanner.findMany({
				where: { UnitID: { in: unit_ids } },
			}),
		]);

		if (requisites.length > 0 || studyPlannerUnits.length > 0) {
			return NextResponse.json(
				{
					message: 'Cannot delete unit(s) because they are referenced in other records',
					details: {
						requisites: requisites.length,
						studyPlannerUnits: studyPlannerUnits.length,
					},
				},
				{ status: 400 }
			);
		}

		// Cascade delete relations first
		await prisma.UnitTermOffered.deleteMany({
			where: { UnitID: { in: unit_ids } },
		});

		// Delete units
		const deleted = await prisma.Unit.deleteMany({
			where: { ID: { in: unit_ids } },
		});

		try {
			const user = await SecureSessionManager.authenticateUser(req);
			const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
			await AuditLogger.logDelete({
				userId: user?.id || null,
				email: actorEmail,
				module: 'unit_management',
				entity: 'Unit',
				entityId: unit_ids.join(','),
				before: deleted,
			}, req);
		} catch (e) {
			console.warn('Audit DELETE Unit failed:', e?.message);
		}

		return NextResponse.json(
			{ message: `Deleted ${deleted.count} unit(s) successfully` },
			{ status: 200 }
		);
	} catch (error) {
		console.error('Error deleting unit(s):', error);
		return NextResponse.json(
			{ message: 'Failed to delete units', error: error.message },
			{ status: 500 }
		);
	}
}

// Validation
async function ValidateUnitRequisites(unit_id, unit_requisites, tx, edit_mode = false) {
	if (!Array.isArray(unit_requisites) || unit_requisites.length === 0) {
		return { success: false, message: "Requisites must be a non-empty array." };
	}

	// Early validation: negative CP
	const cp_with_negative = unit_requisites.filter(
		r => r.unit_relationship === "min" && r.minCP < 0
	);
	if (cp_with_negative.length > 0) {
		return { success: false, message: "Credit point requisites cannot have negative values." };
	}

	// Check if unit exists
	const is_existing_unit = await tx.Unit.findUnique({
		where: { ID: unit_id }
	});
	if (!is_existing_unit) {
		return { success: false, message: `Unit with ID ${unit_id} does not exist!` };
	}

	// Validate requisite units (skip "min" rules)
	const unit_requisites_only = unit_requisites.filter(r => r.unit_relationship !== "min");
	const unit_requisites_ids = unit_requisites_only.map(r => r.requisite_unit_id);

	if (unit_requisites_ids.length > 0) {
		const existing_requisites_data = await tx.Unit.findMany({
			where: { ID: { in: unit_requisites_ids } },
			select: { ID: true }
		});

		const existing_ids = existing_requisites_data.map(unit => unit.ID);
		const missing_units = unit_requisites_ids.filter(id => !existing_ids.includes(id));

		if (missing_units.length > 0) {
			return { success: false, message: `Requisite unit(s) with ID(s): ${missing_units.join(', ')} do not exist!` };
		}
	}

	// Prevent self-reference
	const self_refs = unit_requisites_only.filter(req => req.requisite_unit_id === unit_id);
	if (self_refs.length > 0) {
		return { success: false, message: `Unit ${unit_id} cannot be a requisite of itself.` };
	}

	// Prevent duplicates
	const seen = new Set();
	for (let i = 0; i < unit_requisites.length; i++) {
		const key = JSON.stringify({
			unit_id,
			requisite_unit_id: unit_requisites[i].requisite_unit_id,
			unit_relationship: unit_requisites[i].unit_relationship,
			operator: unit_requisites[i].operator,
			minCP: unit_requisites[i].minCP ?? null,
		});
		if (seen.has(key)) {
			return { success: false, message: `Duplicate requisite found at position ${i + 1}.` };
		}
		seen.add(key);
	}

	// Check for already existing requisites
	if (!edit_mode) {
		const is_existing_requisites = await tx.UnitRequisiteRelationship.findMany({
			where: { UnitID: unit_id },
			select: {
				RequisiteUnitID: true,
				Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit: {
					select: { UnitCode: true }
				}
			}
		});

		if (is_existing_requisites.length > 0) {
			const existing_req_map = new Map(
				is_existing_requisites
					.filter(req => req.RequisiteUnitID && req.Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit)
					.map(req => [req.RequisiteUnitID, req.Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit.UnitCode])
			);

			const existing_requisites = unit_requisites_only
				.map(r => r.requisite_unit_id)
				.filter(id => existing_req_map.has(id))
				.map(id => existing_req_map.get(id));

			if (existing_requisites.length > 0) {
				return {
					success: false,
					message: `Unit ${unit_id} already has the requisite(s): ${existing_requisites.join(', ')}`
				};
			}
		}
	}

	return { success: true };
}



async function AddUnitRequisites(unit_id, unit_requisites, tx) {
	console.log('unit_requisites', unit_requisites)
	// Validate first
	const validation = await ValidateUnitRequisites(unit_id, unit_requisites, tx);
	if (!validation.success) {
		return validation; // return error message instead of inserting
	}

	// Insert into DB
	await tx.UnitRequisiteRelationship.createMany({
		data: unit_requisites.map(req => ({
			UnitID: unit_id,
			RequisiteUnitID: req.requisite_unit_id,
			UnitRelationship: req.unit_relationship,
			LogicalOperators: req.operator?.toLowerCase() ?? "or",
			MinCP: req.minCP ?? null,
		})),
		skipDuplicates: true,
	});

	return { success: true, message: "Requisites added successfully" };
}

async function EditUnitRequisites(unit_id, unit_requisites, tx) {
	// Validate first
	const validation = await ValidateUnitRequisites(unit_id, unit_requisites, tx, true);
	if (!validation.success) {
		return validation; // return error message instead of inserting
	}

	console.log('unit_requisites', unit_requisites)

	// Update requisites
	const update_promises = unit_requisites.map((req) =>
		tx.UnitRequisiteRelationship.update({
			where: { ID: req._id },
			data: {
				UnitID: unit_id,
				RequisiteUnitID: req.requisite_unit_id,
				UnitRelationship: req.unit_relationship,
				LogicalOperators: req.operator?.toLowerCase() ?? "or",
				MinCP: req.unit_relationship === "min" ? req.minCP ?? null : null,
			},
		})
	);

	await Promise.all(update_promises);

	return { success: true, message: "Requisites updated successfully" };
}
