import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import AuditLogger from "@app/class/Audit/AuditLogger";
import SecureSessionManager from "@utils/auth/SimpleSessionManager";
import { TokenValidation } from "@app/api/api_helper";
import { checkUploadRateLimit } from "@utils/rateLimiting/uploadRateLimiter";

// API Endpoint for the Unit file uploads
// Try to optimise for batch processing 

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
    // Allow 0 CP for MPU units, but require positive for others
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

// Helper function to check if a unit code exists
async function unitExists(unitCode) {
    const unit = await prisma.Unit.findUnique({
        where: { UnitCode: unitCode }
    });
    return !!unit;
}

// Helper function to log operations
function logOperation(operation, details) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${operation}: `, details);
}

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

        // Check rate limit for uploads
        let rateLimitIdentifier = null;
        let userRole = null;
        try {
            const user = await SecureSessionManager.authenticateUser(req);
            if (user?.email) {
                rateLimitIdentifier = user.email;
                userRole = user.role;
            } else {
                // Fallback to IP address if user email not available
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
                        headers: {
                            'Retry-After': rateLimitCheck.retryAfter.toString()
                        }
                    }
                );
            }
        } catch (rateLimitError) {
            console.warn('Rate limit check failed:', rateLimitError?.message);
            // Continue if rate limit check fails - don't block the request
        }

        // Parse request body as JSON
        const requestText = await req.text();
        let requestData;

        try {
            requestData = JSON.parse(requestText);
        } catch (error) {
            console.error('JSON Parse Error:', error);
            console.log('Request text received:', requestText.substring(0, 200) + '...');

            return NextResponse.json(
                {
                    success: false,
                    message: `Failed to parse request data: ${error.message}`,
                    receivedData: requestText.substring(0, 100) + '...'
                },
                { status: 400 }
            );
        }

        if (!requestData || !Array.isArray(requestData.units) || requestData.units.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'No valid unit data provided',
                    receivedData: JSON.stringify(requestData)
                },
                { status: 400 }
            );
        }

        // Enforce maximum array size to prevent memory exhaustion
        const MAX_UNITS_PER_REQUEST = 10000;
        if (requestData.units.length > MAX_UNITS_PER_REQUEST) {
            return NextResponse.json(
                {
                    success: false,
                    message: `Cannot import more than ${MAX_UNITS_PER_REQUEST} units at once. Received ${requestData.units.length} units. Please split your import into multiple smaller batches.`
                },
                { status: 413 } // Payload Too Large
            );
        }

        const units = requestData.units;
        const importMode = requestData.mode || 'add'; // Default to 'add' if not specified
        const includeRequisites = requestData.includeRequisites !== false; // Default to true

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

        // Validate all units first
        const validUnits = [];
        for (let i = 0; i < units.length; i++) {
            const unit = units[i];

            // Validate unit data
            const validationErrors = validateUnitData(unit);
            if (validationErrors.length > 0) {
                results.failed++;
                results.errors.push({
                    index: i,
                    code: unit.code || 'Unknown',
                    errors: validationErrors
                });
            } else {
                // Add to valid units list
                validUnits.push({
                    ...unit,
                    UnitCode: unit.code.trim(),
                    Name: unit.name.trim(),
                    CreditPoints: parseFloat(unit.cp),
                    Availability: unit.availability.toLowerCase(),
                });
            }
        }

        // REPLACE MODE
        // Handle replace mode (delete all existing units)
        // if (importMode === 'replace') {
        //     try {
        //         // Count existing units to confirm replacement
        //         const existingCount = await prisma.Unit.count();

        //         // Log the delete operation
        //         logOperation('DELETE ALL UNITS', { count: existingCount });

        //         // Delete all existing units
        //         await prisma.Unit.deleteMany({});

        //         results.replaced = true;
        //         results.replacedCount = existingCount;

        //         console.log(`[${results.timestamp}] REPLACE MODE: Deleted ${existingCount} units`);
        //     } catch (error) {
        //         console.error(`[${results.timestamp}] REPLACE MODE ERROR:`, error);
        //         return NextResponse.json(
        //             { 
        //                 success: false, 
        //                 message: 'Failed to replace existing units. Import aborted.',
        //                 error: error.message
        //             },
        //             { status: 500 }
        //         );
        //     }
        // }

        // for (let unit of units) {
        //  await prisma.Unit.create({ data: unit });
        // }
        //
        //THIS ^^ part is bad for optimisation as it queries the db for each item in the csv
        //BAd

        //DO the following instead \/


        // Process units in batches for better performance
        try {
            if (validUnits.length > 0) {
                // OPTIMIZATION: Prepare data for batch operations
                const unitsToCreate = [];
                const unitsToUpdate = [];
                const existingUnitCodes = new Set();

                // Only check for existing units in 'add' mode
                if (importMode === 'add') {
                    // Get all existing unit codes in one query
                    const existingUnits = await prisma.Unit.findMany({
                        where: {
                            UnitCode: {
                                in: validUnits.map(u => u.UnitCode)
                            }
                        },
                        select: {
                            UnitCode: true
                        }
                    });

                    existingUnits.forEach(unit => existingUnitCodes.add(unit.UnitCode));
                }

                // Separate units into create and update arrays
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

                // OPTIMIZATION: Create all new units in a single batch
                // use createMany Instead
                if (unitsToCreate.length > 0) {
                    logOperation('BATCH CREATE UNITS', { count: unitsToCreate.length });

                    const createdUnits = await prisma.$transaction(async (tx) => {
                        const inserted = await Promise.all(
                            unitsToCreate.map(async (unitData) => {
                                const unit = await tx.unit.create({ data: unitData });

                                const match = validUnits.find(u => u.code === unitData.UnitCode);
                                if (match) {
                                    match.UnitID = unit.ID;
                                }
                                return unit;
                            })
                        );
                        return inserted;
                    });

                    results.successful += unitsToCreate.length;

                    // AUDIT CREATE
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
                    } catch (e) {
                        console.warn('Audit CREATE Unit Import failed:', e?.message);
                    }
                }

                // Handle updates (these need to be done individually due to Prisma limitations)
                if (unitsToUpdate.length > 0) {
                    // AUDIT UPDATE batch
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
                    } catch (e) {
                        console.warn('Audit UPDATE Unit Import failed:', e?.message);
                    }
                }

                for (const unit of unitsToUpdate) {
                    await prisma.Unit.update({
                        where: { UnitCode: unit.UnitCode },
                        data: {
                            Name: unit.Name,
                            CreditPoints: unit.CreditPoints,
                            Availability: unit.Availability
                        }
                    });

                    // Delete existing terms for this unit
                    await prisma.UnitTermOffered.deleteMany({
                        where: { UnitCode: unit.UnitCode }
                    });

                    if (includeRequisites) {
                        // Delete existing requisites for this unit
                        await prisma.UnitRequisiteRelationship.deleteMany({
                            where: { UnitCode: unit.UnitCode }
                        });
                    }

                    results.successful++;
                }

                // OPTIMIZATION: Batch insert all unit terms in one operation
                const allTermsToCreate = [];
                for (const unit of validUnits) {
                    console.log('unit', unit)
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
                    console.log('allTermsToCreate', allTermsToCreate)
                    logOperation('BATCH ADD UNIT TERMS', { count: allTermsToCreate.length });

                    await prisma.UnitTermOffered.createMany({
                        data: allTermsToCreate,
                        skipDuplicates: true
                    });
                }
            }
        } catch (error) {
            console.error(`[${results.timestamp}] BATCH OPERATION ERROR:`, error);
            return NextResponse.json(
                {
                    success: false,
                    message: `Failed during batch unit operations: ${error.message}`
                },
                { status: 500 }
            );
        }

        // Process requisite relationships if enabled
        if (includeRequisites && validUnits.length > 0) {
            try {
                const requisiteErrors = [];

                // OPTIMIZATION: Collect all requisite relationships in one array
                const allRequisiteRelationships = [];

                for (const unit of validUnits) {
                    console.log(validUnits);
                    const unitCode = unit.UnitCode;
                    const UnitID = unit.UnitID;

                    // Process prerequisites
                    if (unit.pre_requisites && unit.pre_requisites.length > 0) {
                        for (const preReqCode of unit.pre_requisites) {
                            allRequisiteRelationships.push({
                                UnitID: UnitID,
                                UnitCode: unitCode,
                                RequisiteUnitCode: preReqCode.trim(),
                                UnitRelationship: 'pre',
                                LogicalOperators: 'or',
                            });
                        }
                    }

                    // Process corequisites
                    if (unit.co_requisites && unit.co_requisites.length > 0) {
                        for (const coReqCode of unit.co_requisites) {
                            allRequisiteRelationships.push({
                                UnitID: UnitID,
                                UnitCode: unitCode,
                                RequisiteUnitCode: coReqCode.trim(),
                                UnitRelationship: 'co',
                                LogicalOperators: 'or',
                            });
                        }
                    }

                    // Process antirequisites
                    if (unit.anti_requisites && unit.anti_requisites.length > 0) {
                        for (const antiReqCode of unit.anti_requisites) {
                            allRequisiteRelationships.push({
                                UnitID: UnitID,
                                UnitCode: unitCode,
                                RequisiteUnitCode: antiReqCode.trim(),
                                UnitRelationship: 'anti',
                                LogicalOperators: 'or',
                            });
                        }
                    }

                    // Process minimum credit points
                    if (unit.min_cp) {
                        allRequisiteRelationships.push({
                            UnitID: UnitID,
                            UnitCode: unitCode,
                            RequisiteUnitCode: null,
                            UnitRelationship: 'min',
                            LogicalOperators: 'or',
                            MinCP: parseFloat(unit.min_cp),
                        });
                    }
                }

                // OPTIMIZATION: Validate all requisite unit codes in a single query
                if (allRequisiteRelationships.length > 0) {
                    // Collect all unique requisite unit codes (excluding min CP requisites)
                    const requisiteUnitCodes = new Set();
                    allRequisiteRelationships.forEach(req => {
                        if (req.UnitRelationship !== 'min' && req.RequisiteUnitCode) {
                            requisiteUnitCodes.add(req.RequisiteUnitCode);
                        }
                    });

                    // Get all existing unit codes in one query
                    const existingUnitCodes = new Set(validUnits.map(u => u.UnitCode));
                    const existingUnitIDs = new Set(validUnits.map(u => u.UnitID));

                    if (requisiteUnitCodes.size > 0) {
                        const dbExistingUnits = await prisma.Unit.findMany({
                            where: {
                                UnitCode: {
                                    in: Array.from(requisiteUnitCodes)
                                }
                            },
                            select: {
                                UnitCode: true,
                                ID: true
                            }
                        });

                        dbExistingUnits.forEach((unit) => {
                            existingUnitCodes.add(unit.UnitCode);
                            existingUnitIDs.add(unit.ID);
                        });

                        dbExistingUnits.forEach((unit_db) => {
                            allRequisiteRelationships.forEach((unit) => {
                                if (unit.RequisiteUnitCode === unit_db.UnitCode) {
                                    unit.RequisiteUnitID = unit_db.ID;
                                }
                            });
                        });
                    }

                    // Filter out invalid requisites
                    const validRequisites = allRequisiteRelationships.filter(req => {
                        // Min CP requisites don't reference other units, so they're always valid
                        if (req.UnitRelationship === 'min') {
                            return true;
                        }

                        // Check if requisite unit exists either in database or in current import batch
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
                    }).map(({ UnitCode, RequisiteUnitCode, ...rest }) => rest);;


                    // Insert all valid requisite relationships in a single batch
                    if (validRequisites.length > 0) {
                        console.log('validRequisites', validRequisites)
                        logOperation('BATCH ADD REQUISITES', { count: validRequisites.length });


                        const inserted = await prisma.UnitRequisiteRelationship.createMany({
                            data: validRequisites,
                            skipDuplicates: true
                        });

                        results.requisitesAdded = inserted.count;
                    }

                    // Add any requisite errors to the overall results
                    if (requisiteErrors.length > 0) {
                        results.requisiteErrors = requisiteErrors;
                        results.requisitesFailed = requisiteErrors.length;
                    }
                }
            } catch (error) {
                console.error(`[${results.timestamp}] BATCH REQUISITES ERROR:`, error);
                results.requisitesFailed = 1;
                results.requisiteErrors = [{
                    error: `Failed to add requisites: ${error.message}`
                }];
            }
        }

        // Generate appropriate message based on results
        if (results.failed > 0) {
            results.success = results.successful > 0;

            if (importMode === 'replace') {
                results.message = results.successful > 0
                    ? `Replaced ${results.replacedCount} units with ${results.successful} new units. ${results.failed} units had errors.`
                    : `Failed to replace units. All ${results.failed} import operations failed.`;
            } else {
                results.message = results.successful > 0
                    ? `Successfully processed ${results.successful} of ${results.total} units with ${results.failed} errors.`
                    : `Failed to process any units. Found ${results.failed} errors.`;
            }
        } else {
            if (importMode === 'replace') {
                results.message = `Successfully replaced ${results.replacedCount} units with ${results.successful} new units.`;
            } else {
                results.message = `Successfully processed all ${results.total} units.`;
            }
        }

        // Add requisite processing results to the message
        if (includeRequisites) {
            results.message += ` Added ${results.requisitesAdded} requisite relationships.`;
            if (results.requisitesFailed > 0 || (results.requisiteErrors && results.requisiteErrors.length > 0)) {
                results.message += ` Failed to add some requisite relationships.`;
            }
        }

        // Log the final result
        logOperation('IMPORT COMPLETED', {
            mode: importMode,
            total: results.total,
            successful: results.successful,
            failed: results.failed,
            requisitesAdded: results.requisitesAdded,
            requisitesFailed: results.requisitesFailed,
            success: results.success
        });

        return NextResponse.json(results, { status: 200 });
    } catch (error) {
        console.error('Error processing unit upload:', error);
        return NextResponse.json(
            {
                success: false,
                message: 'Server error while processing unit upload',
                error: error.message
            },
            { status: 500 }
        );
    }
}