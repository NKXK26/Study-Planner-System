import { NextResponse } from 'next/server';
import prisma from "@utils/db/db";
import { TokenValidation } from "@app/api/api_helper";
import SecureSessionManager from "@utils/auth/SimpleSessionManager";
import AuditLogger from "@app/class/Audit/AuditLogger";
import { checkUploadRateLimit } from "@utils/rateLimiting/uploadRateLimiter";

// THIS IS FOR COURSE UPLOAD!!

// Helper function to validate CSV data
// Ensures that all data needed is there
/*
Commented out by Beckham on 18/10/25 : Seems like its unused? But i dont dare delete
// I think making templates is justified
function validateCourseData(course) {
    const errors = [];
    
    if (!course.code || typeof course.code !== 'string' || course.code.trim() === '') {
        errors.push('Course code is required');
    }
    
    if (!course.name || typeof course.name !== 'string' || course.name.trim() === '') {
        errors.push('Course name is required');
    }
    
    // Check credits_required is a valid number
    const credits = parseFloat(course.credits_required);
    if (isNaN(credits) || credits <= 0) {
        errors.push('Credits required must be a positive number');
    }
    
    // Validate status
    const validStatuses = ['published', 'unpublished', 'draft', 'unavailable'];
    const status = course.status ? course.status.toLowerCase() : '';
    if (!validStatuses.includes(status)) {
        errors.push('Status must be one of: Published, Unpublished, Draft, Unavailable');
    }
    
    return errors;
}

export async function POST(req) {
    try {
        // Check for DEV override
        const isDevOverride = req.headers.get('x-dev-override') === 'true' &&
            process.env.NEXT_PUBLIC_MODE === 'DEV';

        if (!isDevOverride) {
            // Validate authentication token
            const authHeader = req.headers.get('Authorization');
            const token_res = TokenValidation(authHeader);

            if (!token_res.success) {
                return NextResponse.json(
                    { success: false, message: token_res.message },
                    { status: token_res.status }
                );
            }

            // Require actor email for auditability
            const sessionEmail = req.headers.get('x-session-email');
            if (!sessionEmail) {
                return NextResponse.json(
                    { success: false, message: 'Missing authentication header x-session-email' },
                    { status: 401 }
                );
            }

            // Validate user has appropriate role for bulk import
            try {
                const user = await SecureSessionManager.authenticateUser(req);
                if (!user) {
                    return NextResponse.json(
                        { success: false, message: 'Could not authenticate user' },
                        { status: 401 }
                    );
                }

                // Check if user has admin or data-manager role
                const validRoles = ['admin', 'data-manager', 'course-manager'];
                const userHasValidRole = user.role && validRoles.includes(user.role.toLowerCase());

                if (!userHasValidRole) {
                    return NextResponse.json(
                        {
                            success: false,
                            message: `Insufficient permissions for bulk course import. Required roles: ${validRoles.join(', ')}. Your role: ${user.role || 'unknown'}`
                        },
                        { status: 403 }
                    );
                }
            } catch (authError) {
                console.warn('Role validation warning:', authError?.message);
                // Continue if role check fails but warn in logs
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
        
        if (!requestData || !Array.isArray(requestData.courses) || requestData.courses.length === 0) {
            return NextResponse.json(
                {
                    success: false,
                    message: 'No valid course data provided',
                    receivedData: JSON.stringify(requestData)
                },
                { status: 400 }
            );
        }

        // Enforce maximum array size to prevent memory exhaustion
        const MAX_COURSES_PER_REQUEST = 10000;
        if (requestData.courses.length > MAX_COURSES_PER_REQUEST) {
            return NextResponse.json(
                {
                    success: false,
                    message: `Cannot import more than ${MAX_COURSES_PER_REQUEST} courses at once. Received ${requestData.courses.length} courses. Please split your import into multiple smaller batches.`
                },
                { status: 413 } // Payload Too Large
            );
        }

        const courses = requestData.courses;
        const importMode = requestData.mode || 'add'; // Default to 'add' if not specified
        
        const results = {
            success: true,
            total: courses.length,
            successful: 0,
            failed: 0,
            errors: [],
            replaced: false,
            timestamp: new Date().toISOString()
        };
        
        // Validate all courses first
        const validCourses = [];
        for (let i = 0; i < courses.length; i++) {
            const course = courses[i];
            
            // Validate course data
            const validationErrors = validateCourseData(course);
            if (validationErrors.length > 0) {
                results.failed++;
                results.errors.push({
                    index: i,
                    code: course.code || 'Unknown',
                    errors: validationErrors
                });
            } else {
                // Add to valid courses list
                validCourses.push({
                    ...course,
                    Code: course.code.trim(),
                    Name: course.name.trim(),
                    CreditsRequired: parseFloat(course.credits_required),
                    Status: course.status ? 
                        course.status.charAt(0).toUpperCase() + course.status.slice(1).toLowerCase() : 
                        'Draft'
                });
            }
        }
        // REPLACE MODE
        // Handle replace mode (delete all existing courses)
        // if (importMode === 'replace') {
        //     try {
        //         // Count existing courses to confirm replacement
        //         const existingCount = await prisma.Course.count();
                
        //         // Log the delete operation
        //         logOperation('DELETE ALL COURSES', { count: existingCount });
                
        //         // Delete all existing courses and their related data
        //         await prisma.$transaction([
        //             // First delete all majors (which cascade to course intakes)
        //             prisma.Major.deleteMany({}),
        //             // Then delete all courses
        //             prisma.Course.deleteMany({})
        //         ]);
                
        //         results.replaced = true;
        //         results.replacedCount = existingCount;
                
        //         console.log(`[${results.timestamp}] REPLACE MODE: Deleted ${existingCount} courses`);
        //     } catch (error) {
        //         console.error(`[${results.timestamp}] REPLACE MODE ERROR:`, error);
        //         return NextResponse.json(
        //             { 
        //                 success: false, 
        //                 message: 'Failed to replace existing courses. Import aborted.',
        //                 error: error.message
        //             },
        //             { status: 500 }
        //         );
        //     }
        // }
        
        // Process courses in batches for better performance
        try {
            if (validCourses.length > 0) {
                // OPTIMIZATION: Prepare data for batch operations
                const coursesToCreate = [];
                const coursesToUpdate = [];
                const existingCourseCodes = new Set();
                
                // Only check for existing courses in 'add' mode
                if (importMode === 'add') {
                    // Get all existing course codes in one query
                    const existingCourses = await prisma.Course.findMany({
                        where: {
                            Code: {
                                in: validCourses.map(c => c.Code)
                            }
                        },
                        select: {
                            Code: true
                        }
                    });
                    
                    existingCourses.forEach(course => existingCourseCodes.add(course.Code));
                }
                
                // Separate courses into create and update arrays
                validCourses.forEach(course => {
                    if (importMode === 'replace' || !existingCourseCodes.has(course.Code)) {
                        coursesToCreate.push({
                            Code: course.Code,
                            Name: course.Name,
                            CreditsRequired: course.CreditsRequired,
                            Status: course.Status
                        });
                    } else {
                        coursesToUpdate.push(course);
                    }
                });
                
                // OPTIMIZATION: Create all new courses first
                if (coursesToCreate.length > 0) {
                    logOperation('BATCH CREATE COURSES', { count: coursesToCreate.length });
                    
                    // Process in smaller batches if needed to avoid potential max query size issues
                    const batchSize = 100;
                    for (let i = 0; i < coursesToCreate.length; i += batchSize) {
                        const batch = coursesToCreate.slice(i, i + batchSize);
                        
                        // Create courses in a batch
                        await prisma.$transaction(
                            batch.map(courseData => 
                                prisma.Course.create({
                                    data: courseData
                                })
                            )
                        );
                    }
                    
                    // Now create default majors for each new course
                    const majorsToCreate = coursesToCreate.map(course => ({
                        Name: 'Default',
                        Status: 'Active',
                        CourseCode: course.Code,
                        CourseID: 0 // This will be filled in later by Prisma
                    }));
                    
                    // Get course IDs for the newly created courses
                    const createdCourses = await prisma.Course.findMany({
                        where: {
                            Code: {
                                in: coursesToCreate.map(c => c.Code)
                            }
                        },
                        select: {
                            ID: true,
                            Code: true
                        }
                    });
                    
                    // Map course codes to IDs
                    const courseCodeToId = {};
                    createdCourses.forEach(course => {
                        courseCodeToId[course.Code] = course.ID;
                    });
                    
                    // Update the major data with the correct course IDs
                    majorsToCreate.forEach(major => {
                        major.CourseID = courseCodeToId[major.CourseCode];
                    });
                    
                    // Create all majors in batches
                    for (let i = 0; i < majorsToCreate.length; i += batchSize) {
                        const batch = majorsToCreate.slice(i, i + batchSize);
                        
                        await prisma.Major.createMany({
                            data: batch,
                            skipDuplicates: true
                        });
                    }
                    
                    results.successful += coursesToCreate.length;

                    // AUDIT LOG CREATE
                    try {
                        const user = await SecureSessionManager.authenticateUser(req);
                        const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
                        await AuditLogger.logCreate({
                            userId: user?.id || null,
                            email: actorEmail,
                            module: 'course_management',
                            entity: 'Course',
                            entityId: `Batch Import - ${coursesToCreate.length} courses`,
                            after: coursesToCreate.map(c => c.Code),
                            metadata: { importMode, count: coursesToCreate.length }
                        }, req);
                    } catch (e) {
                        console.warn('Audit CREATE Course Import failed:', e?.message);
                    }
                }

                // Handle updates for existing courses
                if (coursesToUpdate.length > 0) {
                    logOperation('BATCH UPDATE COURSES', { count: coursesToUpdate.length });

                    // AUDIT LOG UPDATE (before update)
                    try {
                        const user = await SecureSessionManager.authenticateUser(req);
                        const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
                        await AuditLogger.logUpdate({
                            userId: user?.id || null,
                            email: actorEmail,
                            module: 'course_management',
                            entity: 'Course',
                            entityId: `Batch Import Update - ${coursesToUpdate.length} courses`,
                            before: coursesToUpdate.map(c => c.Code),
                            after: coursesToUpdate,
                            metadata: { importMode, count: coursesToUpdate.length }
                        }, req);
                    } catch (e) {
                        console.warn('Audit UPDATE Course Import failed:', e?.message);
                    }

                    await prisma.$transaction(
                        coursesToUpdate.map(course =>
                            prisma.Course.update({
                                where: { Code: course.Code },
                                data: {
                                    Name: course.Name,
                                    CreditsRequired: course.CreditsRequired,
                                    Status: course.Status
                                }
                            })
                        )
                    );

                    results.successful += coursesToUpdate.length;
                }
            }
        } catch (error) {
            console.error(`[${results.timestamp}] BATCH OPERATION ERROR:`, error);
            return NextResponse.json(
                { 
                    success: false, 
                    message: `Failed during batch course operations: ${error.message}`
                },
                { status: 500 }
            );
        }
        
        // Generate appropriate message based on results
        if (results.failed > 0) {
            results.success = results.successful > 0;
            
            if (importMode === 'replace') {
                results.message = results.successful > 0
                    ? `Replaced ${results.replacedCount} courses with ${results.successful} new courses. ${results.failed} courses had errors.`
                    : `Failed to replace courses. All ${results.failed} import operations failed.`;
            } else {
                results.message = results.successful > 0
                    ? `Successfully processed ${results.successful} of ${results.total} courses with ${results.failed} errors.`
                    : `Failed to process any courses. Found ${results.failed} errors.`;
            }
        } else {
            if (importMode === 'replace') {
                results.message = `Successfully replaced ${results.replacedCount} courses with ${results.successful} new courses.`;
            } else {
                results.message = `Successfully processed all ${results.total} courses.`;
            }
        }
        
        // Log the final result
        logOperation('IMPORT COMPLETED', {
            mode: importMode,
            total: results.total,
            successful: results.successful,
            failed: results.failed,
            success: results.success
        });
        
        return NextResponse.json(results, { status: 200 });
    } catch (error) {
        console.error('Error processing course upload:', error);
        return NextResponse.json(
            { 
                success: false, 
                message: 'Server error while processing course upload',
                error: error.message
            },
            { status: 500 }
        );
    }
}
*/