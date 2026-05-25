import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import AuditLogger from "@app/class/Audit/AuditLogger";
import SecureSessionManager from "@utils/auth/SimpleSessionManager";
import { TokenValidation } from "@app/api/api_helper";
import { checkUploadRateLimit } from "@utils/rateLimiting/uploadRateLimiter";

// API Endpoint for the Unit file uploads
// Optimised for batch processing

// Helper function to validate unit data
function validateUnitData(unit) {
    const errors = [];

    if (!unit.code || typeof unit.code !== 'string' || unit.code.trim() === '') {
        errors.push('Unit code is required');
    }

    if (!unit.name || typeof unit.name !== 'string' || unit.name.trim() === '') {
        errors.push('Unit name is required');
    }

    // Check credit points is a valid number
    const cp = parseFloat(unit.cp);
    const isMPU = unit.code && unit.code.toUpperCase().startsWith('MPU');

    if (isNaN(cp)) {
        errors.push('Credit points must be a number');
    } else if (cp < 0) {
        errors.push('Credit points cannot be negative');
    } else if (!isMPU && cp === 0) {
        errors.push('Credit points must be greater than 0 for non-MPU units');
    }

    // Validate availability
    const validAvailabilities = ['published', 'unpublished', 'unavailable'];
    const availability = unit.availability ? unit.availability.toLowerCase() : '';
    if (!validAvailabilities.includes(availability)) {
        errors.push('Availability must be one of: Published, Unpublished, Unavailable');
    }

    // Validate offered terms
    if (unit.offered_terms && Array.isArray(unit.offered_terms)) {
        const validTerms = ['Semester 1', 'Semester 2', 'Summer', 'Winter'];
        for (const term of unit.offered_terms) {
            if (!validTerms.includes(term)) {
                errors.push(`Term "${term}" is not valid. Must be one of: ${validTerms.join(', ')}`);
            }
        }
    }

    // Validate min_cp if present
    if (unit.min_cp !== null && unit.min_cp !== undefined) {
        const minCp = parseFloat(unit.min_cp);
        if (isNaN(minCp) || minCp < 0) {
            errors.push('Minimum credit points must be a non-negative number');
        }
    }

    return errors;
}

// Helper function to log operations
function logOperation(operation, details) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${operation}: `, details);
}

export async function POST(req) {
    try {
        // ─── Authentication & Dev Override ─────────────────────────
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
        }

        // ─── Rate limiting ────────────────────────────────────────
        let rateLimitIdentifier = null;
        let userRole = null;
        try {
            const user = await SecureSessionManager.authenticateUser(req);
            if (user?.email) {
                rateLimitIdentifier = user.email;
                userRole = user.role;
            } else {
                rateLimitIdentifier = req.headers.get('x-forwarded-for') || req.ip || 'unknown';
            }

            const rateLimitCheck = await checkUploadRateLimit(rateLimitIdentifier, userRole);
            if (!rateLimitCheck.allowed) {
                return NextResponse.json(
                    {
                        success: false,
                        message: rateLimitCheck.message,
                        code: 'RATE_LIMIT_EXCEEDED',
                        uploadsLimit: rateLimitCheck.limit,
                        uploadsRemaining: rateLimitCheck.remaining,
                        retryAfter: rateLimitCheck.retryAfter
                    },
                    {
                        status: 429,
                        headers: { 'Retry-After': rateLimitCheck.retryAfter.toString() }
                    }
                );
            }
        } catch (rateLimitError) {
            console.warn('Rate limit check failed:', rateLimitError?.message);
        }

        // ─── Parse request body ───────────────────────────────────
        const requestText = await req.text();
        let requestData;
        try {
            requestData = JSON.parse(requestText);
        } catch (error) {
            console.error('JSON Parse Error:', error);
            return NextResponse.json(
                { success: false, message: `Failed to parse request data: ${error.message}` },
                { status: 400 }
            );
        }

        if (!requestData || !Array.isArray(requestData.units) || requestData.units.length === 0) {
            return NextResponse.json(
                { success: false, message: 'No valid unit data provided' },
                { status: 400 }
            );
        }

        const MAX_UNITS_PER_REQUEST = 10000;
        if (requestData.units.length > MAX_UNITS_PER_REQUEST) {
            return NextResponse.json(
                { success: false, message: `Cannot import more than ${MAX_UNITS_PER_REQUEST} units at once.` },
                { status: 413 }
            );
        }

        const units = requestData.units;
        const importMode = requestData.mode || 'add';
        const includeRequisites = requestData.includeRequisites !== false;

        const results = {
            success: true,
            total: units.length,
            successful: 0,
            failed: 0,
            errors: [],
            replaced: false,
            requisitesAdded: 0,
            requisitesFailed: 0,
            timestamp: new Date().toISOString()
        };

        // ─── Validate all units first ─────────────────────────────
        const validUnits = [];
        for (let i = 0; i < units.length; i++) {
            const unit = units[i];
            const validationErrors = validateUnitData(unit);
            if (validationErrors.length > 0) {
                results.failed++;
                results.errors.push({
                    index: i,
                    code: unit.code || 'Unknown',
                    errors: validationErrors
                });
            } else {
                validUnits.push({
                    ...unit,
                    UnitCode: unit.code.trim(),
                    Name: unit.name.trim(),
                    CreditPoints: parseFloat(unit.cp),
                    Availability: unit.availability.toLowerCase(),
                });
            }
        }

        // ─── Batch create / update units ─────────────────────────
        try {
            if (validUnits.length > 0) {
                const unitsToCreate = [];
                const unitsToUpdate = [];
                const existingUnitCodes = new Set();

                if (importMode === 'add') {
                    // Get all existing unit codes in one query
                    const existingUnits = await prisma.Unit.findMany({
                        where: { UnitCode: { in: validUnits.map(u => u.UnitCode) } },
                        select: { UnitCode: true, ID: true }
                    });
                    existingUnits.forEach(u => existingUnitCodes.add(u.UnitCode));
                }

                // Separate into create / update
                validUnits.forEach(unit => {
                    if (importMode === 'replace' || !existingUnitCodes.has(unit.UnitCode)) {
                        unitsToCreate.push({
                            UnitCode: unit.UnitCode,
                            Name: unit.Name,
                            CreditPoints: unit.CreditPoints,
                            Availability: unit.Availability
                        });
                    } else {
                        unitsToUpdate.push(unit);
                    }
                });

                // ─── CREATE new units (batch with transaction) ────
                if (unitsToCreate.length > 0) {
                    logOperation('BATCH CREATE UNITS', { count: unitsToCreate.length });

                    await prisma.$transaction(async (tx) => {
                        for (const unitData of unitsToCreate) {
                            const created = await tx.unit.create({ data: unitData });
                            const match = validUnits.find(u => u.UnitCode === unitData.UnitCode);
                            if (match) match.UnitID = created.ID;
                        }
                    });

                    results.successful += unitsToCreate.length;

                    try {
                        const user = await SecureSessionManager.authenticateUser(req);
                        const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
                        await AuditLogger.logCreate({
                            userId: user?.id || null,
                            email: actorEmail,
                            module: 'unit_management',
                            entity: 'Unit',
                            entityId: `Batch Import - ${unitsToCreate.length} units`,
                            after: unitsToCreate.map(u => u.UnitCode),
                            metadata: { importMode, count: unitsToCreate.length, includeRequisites }
                        }, req);
                    } catch (e) { console.warn('Audit CREATE failed:', e?.message); }
                }

                // ─── UPDATE existing units (by ID) ────────────────
                if (unitsToUpdate.length > 0) {
                    // First, fetch IDs for all codes that need updating
                    const existingMap = new Map();
                    const existingUnitsData = await prisma.Unit.findMany({
                        where: { UnitCode: { in: unitsToUpdate.map(u => u.UnitCode) } },
                        select: { ID: true, UnitCode: true }
                    });
                    for (const eu of existingUnitsData) {
                        existingMap.set(eu.UnitCode, eu.ID);
                    }

                    for (const unit of unitsToUpdate) {
                        const unitId = existingMap.get(unit.UnitCode);
                        if (!unitId) continue;

                        await prisma.Unit.update({
                            where: { ID: unitId },
                            data: {
                                Name: unit.Name,
                                CreditPoints: unit.CreditPoints,
                                Availability: unit.Availability
                            }
                        });

                        // Delete existing terms for this unit using ID
                        await prisma.UnitTermOffered.deleteMany({
                            where: { UnitID: unitId }
                        });

                        if (includeRequisites) {
                            await prisma.UnitRequisiteRelationship.deleteMany({
                                where: { UnitID: unitId }
                            });
                        }

                        results.successful++;
                        unit.UnitID = unitId; // store ID for later term/requisite insertion
                    }

                    try {
                        const user = await SecureSessionManager.authenticateUser(req);
                        const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
                        await AuditLogger.logUpdate({
                            userId: user?.id || null,
                            email: actorEmail,
                            module: 'unit_management',
                            entity: 'Unit',
                            entityId: `Batch Import Update - ${unitsToUpdate.length} units`,
                            before: unitsToUpdate.map(u => u.UnitCode),
                            after: unitsToUpdate,
                            metadata: { importMode, count: unitsToUpdate.length, includeRequisites }
                        }, req);
                    } catch (e) { console.warn('Audit UPDATE failed:', e?.message); }
                }

                // ─── Batch insert all unit terms ──────────────────
                const allTermsToCreate = [];
                for (const unit of validUnits) {
                    if (unit.offered_terms && Array.isArray(unit.offered_terms) && unit.offered_terms.length > 0) {
                        for (const term of unit.offered_terms) {
                            allTermsToCreate.push({
                                UnitID: unit.UnitID,
                                TermType: term
                            });
                        }
                    }
                }
                if (allTermsToCreate.length > 0) {
                    logOperation('BATCH ADD UNIT TERMS', { count: allTermsToCreate.length });
                    await prisma.UnitTermOffered.createMany({
                        data: allTermsToCreate,
                
                    });
                }
            }
        } catch (error) {
            console.error(`[${results.timestamp}] BATCH OPERATION ERROR:`, error);
            return NextResponse.json(
                { success: false, message: `Failed during batch unit operations: ${error.message}` },
                { status: 500 }
            );
        }

        // ─── Process requisite relationships (if enabled) ─────────
        if (includeRequisites && validUnits.length > 0) {
            try {
                const requisiteErrors = [];
                const allRequisiteRelationships = [];

                for (const unit of validUnits) {
                    const unitCode = unit.UnitCode;
                    const UnitID = unit.UnitID;
                    if (!UnitID) continue;

                    if (unit.pre_requisites?.length) {
                        for (const preReqCode of unit.pre_requisites) {
                            allRequisiteRelationships.push({
                                UnitID,
                                UnitCode: unitCode,
                                RequisiteUnitCode: preReqCode.trim(),
                                UnitRelationship: 'pre',
                                LogicalOperators: 'or',
                            });
                        }
                    }
                    if (unit.co_requisites?.length) {
                        for (const coReqCode of unit.co_requisites) {
                            allRequisiteRelationships.push({
                                UnitID,
                                UnitCode: unitCode,
                                RequisiteUnitCode: coReqCode.trim(),
                                UnitRelationship: 'co',
                                LogicalOperators: 'or',
                            });
                        }
                    }
                    if (unit.anti_requisites?.length) {
                        for (const antiReqCode of unit.anti_requisites) {
                            allRequisiteRelationships.push({
                                UnitID,
                                UnitCode: unitCode,
                                RequisiteUnitCode: antiReqCode.trim(),
                                UnitRelationship: 'anti',
                                LogicalOperators: 'or',
                            });
                        }
                    }
                    if (unit.min_cp) {
                        allRequisiteRelationships.push({
                            UnitID,
                            UnitCode: unitCode,
                            RequisiteUnitCode: null,
                            UnitRelationship: 'min',
                            LogicalOperators: 'or',
                            MinCP: parseFloat(unit.min_cp),
                        });
                    }
                }

                if (allRequisiteRelationships.length > 0) {
                    // Collect all requisite unit codes (excluding min)
                    const requisiteUnitCodes = new Set();
                    allRequisiteRelationships.forEach(req => {
                        if (req.UnitRelationship !== 'min' && req.RequisiteUnitCode) {
                            requisiteUnitCodes.add(req.RequisiteUnitCode);
                        }
                    });

                    const existingUnitCodes = new Set(validUnits.map(u => u.UnitCode));
                    const existingUnitIDs = new Set(validUnits.map(u => u.UnitID));

                    if (requisiteUnitCodes.size > 0) {
                        const dbExistingUnits = await prisma.Unit.findMany({
                            where: { UnitCode: { in: Array.from(requisiteUnitCodes) } },
                            select: { UnitCode: true, ID: true }
                        });
                        dbExistingUnits.forEach(unit => {
                            existingUnitCodes.add(unit.UnitCode);
                            existingUnitIDs.add(unit.ID);
                        });
                        dbExistingUnits.forEach(unitDb => {
                            allRequisiteRelationships.forEach(req => {
                                if (req.RequisiteUnitCode === unitDb.UnitCode) {
                                    req.RequisiteUnitID = unitDb.ID;
                                }
                            });
                        });
                    }

                    // Filter invalid requisites
                    const validRequisites = allRequisiteRelationships.filter(req => {
                        if (req.UnitRelationship === 'min') return true;
                        const isValid = existingUnitCodes.has(req.RequisiteUnitCode);
                        if (!isValid) {
                            requisiteErrors.push({
                                unitCode: req.UnitCode,
                                requisiteCode: req.RequisiteUnitCode,
                                relationship: req.UnitRelationship,
                                error: `Referenced unit ${req.RequisiteUnitCode} does not exist`
                            });
                        }
                        return isValid;
                    }).map(({ UnitCode, RequisiteUnitCode, ...rest }) => rest);

                    if (validRequisites.length > 0) {
                        logOperation('BATCH ADD REQUISITES', { count: validRequisites.length });
                        const inserted = await prisma.UnitRequisiteRelationship.createMany({
                            data: validRequisites,
                            skipDuplicates: true
                        });
                        results.requisitesAdded = inserted.count;
                    }

                    if (requisiteErrors.length > 0) {
                        results.requisiteErrors = requisiteErrors;
                        results.requisitesFailed = requisiteErrors.length;
                    }
                }
            } catch (error) {
                console.error(`[${results.timestamp}] BATCH REQUISITES ERROR:`, error);
                results.requisitesFailed = 1;
                results.requisiteErrors = [{ error: `Failed to add requisites: ${error.message}` }];
            }
        }

        // ─── Build response message ───────────────────────────────
        if (results.failed > 0) {
            results.success = results.successful > 0;
            results.message = results.successful > 0
                ? `Successfully processed ${results.successful} of ${results.total} units with ${results.failed} errors.`
                : `Failed to process any units. Found ${results.failed} errors.`;
        } else {
            results.message = `Successfully processed all ${results.total} units.`;
        }

        if (includeRequisites) {
            results.message += ` Added ${results.requisitesAdded} requisite relationships.`;
            if (results.requisitesFailed > 0) results.message += ` Failed to add some requisite relationships.`;
        }

        logOperation('IMPORT COMPLETED', {
            mode: importMode,
            total: results.total,
            successful: results.successful,
            failed: results.failed,
            requisitesAdded: results.requisitesAdded,
            requisitesFailed: results.requisitesFailed
        });

        return NextResponse.json(results, { status: 200 });

    } catch (error) {
        console.error('Error processing unit upload:', error);
        return NextResponse.json(
            { success: false, message: 'Server error while processing unit upload', error: error.message },
            { status: 500 }
        );
    }
}