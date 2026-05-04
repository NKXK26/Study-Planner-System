import { PrismaClient } from '@prisma/client';
import AuditLogger from '@app/class/Audit/AuditLogger';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';
import { TokenValidation } from "@app/api/api_helper";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET(request) {
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
		const { searchParams } = new URL(request.url);
		const studentId = searchParams.get('studentId');

		if (!studentId || isNaN(Number(studentId))) {
			console.error('Invalid or missing studentId:', studentId);
			return new Response(JSON.stringify({ units: [] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const unitHistory = await prisma.UnitHistory.findMany({
			where: { StudentID: parseFloat(studentId) },
			include: {
				Unit: {
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
						},
						// UnitRequisiteRelationship_UnitRequisiteRelationship_UnitIDToUnit: {
						//     select: {
						//         ID: true,
						//         RequisiteUnitCode: true,
						//         UnitRelationship: true,
						//         LogicalOperators: true,
						//         MinCP: true
						//     }
						// }
					}
				},
				Term: true
			},
			orderBy: { Year: 'asc' }
		});

		return new Response(JSON.stringify({ units: unitHistory }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		console.error('Error fetching unit history:', error);
		return new Response(JSON.stringify({ error: error.message, units: [] }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	} finally {
		await prisma.$disconnect();
	}
}

export async function POST(request) {
	let enrichedUnits = []; // Define at function scope for error handling
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
		const { studentId, units } = await request.json();

		console.log('Received units to save:', JSON.stringify(units, null, 2));

		if (!studentId || !units || !Array.isArray(units)) {
			return new Response(JSON.stringify({ error: 'Invalid input data' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (!units || units.length === 0) {
			// Get existing units before delete for audit
			const existingUnitsBeforeDelete = await prisma.UnitHistory.findMany({
				where: { StudentID: parseFloat(studentId) }
			});

			// If no units, delete all for this student
			await prisma.UnitHistory.deleteMany({
				where: { StudentID: parseFloat(studentId) }
			});

			// Update the Student table to set CreditCompleted and MPUCreditCompleted to 0
			await prisma.Student.update({
				where: { StudentID: parseFloat(studentId) },
				data: {
					CreditCompleted: 0,
					MPUCreditCompleted: 0
				}
			});

			// AUDIT DELETE ALL
			try {
				const user = await SecureSessionManager.authenticateUser(request);
				const actorEmail = user?.email || request.headers.get('x-session-email') || undefined;
				await AuditLogger.logDelete({
					userId: user?.id || null,
					email: actorEmail,
					module: 'student_management',
					entity: 'UnitHistory',
					entityId: `Student ${studentId} - All Units Deleted`,
					before: existingUnitsBeforeDelete,
					metadata: {
						studentId,
						unitsDeleted: existingUnitsBeforeDelete.length,
						creditsCompleted: 0
					}
				}, request);
			} catch (e) {
				console.warn('Audit DELETE UnitHistory failed:', e?.message);
			}

			return new Response(JSON.stringify({ success: true, data: [] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// STEP 1: Validate that all unit codes exist and map them to UnitIDs
		const unitCodes = units.map(u => u.unitCode).filter(Boolean);
		const existingUnits = await prisma.Unit.findMany({
			where: {
				UnitCode: {
					in: unitCodes
				}
			},
			select: {
				ID: true,
				UnitCode: true
			}
		});

		// Create a map of UnitCode -> UnitID for easy lookup
		const unitCodeToIdMap = new Map(existingUnits.map(u => [u.UnitCode, u.ID]));

		const invalidUnits = units.filter(u => u.unitCode && !unitCodeToIdMap.has(u.unitCode));

		if (invalidUnits.length > 0) {
			const invalidCodes = invalidUnits.map(u => u.unitCode).join(', ');
			console.error('Invalid unit codes found:', invalidCodes);
			return new Response(JSON.stringify({
				error: `The following unit codes do not exist in the database: ${invalidCodes}. Please ensure all units exist before importing.`,
				invalidUnits: invalidCodes
			}), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// STEP 2: Enrich ALL units with proper UnitIDs from the database
		// This ensures we always use the correct UnitID from the Unit table,
		// not whatever was imported (which could be invalid like -1)
		enrichedUnits = units.map(unit => {
			if (unit.unitCode && unitCodeToIdMap.has(unit.unitCode)) {
				const correctUnitID = unitCodeToIdMap.get(unit.unitCode);

				// Always use the unitID from database, even if one was provided
				if (unit.unitID !== correctUnitID) {
					console.log(`Correcting unit ${unit.unitCode}: changing unitID from ${unit.unitID} to ${correctUnitID}`);
				}

				return {
					...unit,
					unitID: correctUnitID
				};
			}
			return unit;
		});

		console.log('Enriched units:', JSON.stringify(enrichedUnits, null, 2));

		// Fetch all existing unit history for the student
		const existingUnitHistory = await prisma.UnitHistory.findMany({
			where: { StudentID: parseFloat(studentId) }
		});

		// Delete units that are no longer present in the incoming data
		const incomingIds = enrichedUnits.filter(u => u.id).map(u => u.id.toString());
		const unitsToDelete = existingUnitHistory.filter(
			dbUnit => !incomingIds.includes(dbUnit.ID.toString())
		);
		await Promise.all(unitsToDelete.map(dbUnit =>
			prisma.UnitHistory.delete({ where: { ID: dbUnit.ID } })
		));

		// Upsert (update or create) units
		const savedUnits = await Promise.all(enrichedUnits.map(async (unit) => {
			console.log('Processing unit:', JSON.stringify(unit, null, 2));

			// Prepare the data object, conditionally including UnitID only if it's valid
			const prepareData = (unitData) => {
				const data = {
					Status: unitData.status || 'current',
					TermID: unitData.termId ? parseInt(unitData.termId) : null,
					Year: unitData.year || unitData.term?.Year || new Date().getFullYear()
				};

				// Only include UnitID if it exists and is a valid number
				if (unitData.unitID && !isNaN(parseInt(unitData.unitID))) {
					data.UnitID = parseInt(unitData.unitID);
					console.log(`Including UnitID ${data.UnitID} for unit ${unitData.unitCode}`);
				} else {
					console.log(`Skipping UnitID for unit ${unitData.unitCode} - unitID: ${unitData.unitID}`);
				}

				console.log('Prepared data:', JSON.stringify(data, null, 2));
				return data;
			};

			if (unit.id) {
				// This is an existing unit that needs to be updated
				const existing = existingUnitHistory.find(
					dbUnit => dbUnit.ID.toString() === unit.id.toString()
				);
				if (existing) {
					return prisma.UnitHistory.update({
						where: { ID: existing.ID },
						data: prepareData(unit),
						include: { Unit: true, Term: true }
					});
				}
			}

			// If no ID or unit not found, create a new entry
			const createData = {
				StudentID: parseFloat(studentId),
				...prepareData(unit)
			};

			return prisma.UnitHistory.create({
				data: createData,
				include: { Unit: true, Term: true }
			});
		}));

		// Calculate total credits completed for passed units
		// Separate MPU credits from regular credits
		const passedUnits = await prisma.UnitHistory.findMany({
			where: {
				StudentID: parseFloat(studentId),
				Status: 'pass' // FIXED: USE 'pass' INSTEAD OF 'Passed'
			},
			include: { Unit: true }
		});

		// Separate MPU credits (units with code starting with 'MPU') from regular credits
		const regularCredits = passedUnits
			.filter(u => u.Unit && !u.Unit.UnitCode.startsWith('MPU'))
			.reduce((sum, u) => sum + (u.Unit?.CreditPoints || 0), 0);

		// Count MPU units instead of summing credit points (since MPU units now have 0 CP)
		const mpuCredits = passedUnits
			.filter(u => u.Unit && u.Unit.UnitCode.startsWith('MPU'))
			.length;

		const creditsCompleted = regularCredits + mpuCredits;

		// Update the Student table with both regular and MPU credits
		await prisma.Student.update({
			where: { StudentID: parseFloat(studentId) },
			data: {
				CreditCompleted: regularCredits,  // Only regular credits
				MPUCreditCompleted: mpuCredits     // MPU credits separately
			}
		});

		// AUDIT LOG
		try {
			const user = await SecureSessionManager.authenticateUser(request);
			const actorEmail = user?.email || request.headers.get('x-session-email') || undefined;
			await AuditLogger.logUpdate({
				userId: user?.id || null,
				email: actorEmail,
				module: 'student_management',
				entity: 'UnitHistory',
				entityId: `Student ${studentId}`,
				before: existingUnitHistory,
				after: savedUnits,
				metadata: {
					studentId,
					unitsAdded: savedUnits.length,
					unitsDeleted: unitsToDelete.length,
					creditsCompleted
				}
			}, request);
		} catch (e) {
			console.warn('Audit UPDATE UnitHistory failed:', e?.message);
		}

		return new Response(JSON.stringify({ success: true, data: savedUnits }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		console.error('Error in batch update unit history:', error);

		// BETTER ERROR HANDLING FOR FOREIGN KEY CONSTRAINTS
		if (error.code === 'P2003') {
			const detail = error.meta?.field_name || 'foreign key constraint';
			console.error('Foreign key constraint error details:', {
				code: error.code,
				meta: error.meta,
				message: error.message,
				enrichedUnits: enrichedUnits
			});

			// Try to find which UnitID is causing the issue
			const problematicUnits = enrichedUnits
				.filter(u => u.unitID)
				.map(u => `${u.unitCode} (UnitID: ${u.unitID})`)
				.join(', ');

			return new Response(JSON.stringify({
				success: false,
				error: `Database constraint violation: ${detail}. One or more UnitIDs don't exist in the database. Units attempted: ${problematicUnits}`,
				details: error.message
			}), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		return new Response(JSON.stringify({
			success: false,
			error: error.message
		}), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	} finally {
		await prisma.$disconnect();
	}
}