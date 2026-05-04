// import prisma from "@utils/db/db";
// import { NextResponse } from "next/server";
// import AuditLogger from "@app/class/Audit/AuditLogger";
// import SecureSessionManager from "@utils/auth/SimpleSessionManager";

// // Helper function to validate unit history data
// function validateUnitHistoryData(record) {
//     const errors = [];

//     if (!record.student_id || record.student_id.toString().trim() === '') {
//         errors.push('Student ID is required');
//     }

//     if (!record.unit_code || typeof record.unit_code !== 'string' || record.unit_code.trim() === '') {
//         errors.push('Unit code is required');
//     }

//     if (!record.status || !['pass', 'fail', 'in progress'].includes(record.status.toLowerCase())) {
//         errors.push('Status must be one of: pass, fail, in progress');
//     }

//     if (!record.term || typeof record.term !== 'string' || record.term.trim() === '') {
//         errors.push('Term is required');
//     }

//     if (!record.year || isNaN(parseInt(record.year))) {
//         errors.push('Year must be a valid number');
//     }

//     return errors;
// }

// // HELPER FUNCTION TO VERIFY STUDENT EXISTS
// async function verifyStudentExists(studentId) {
//     try {
//         const student = await prisma.Student.findUnique({
//             where: {
//                 StudentID: studentId // Make sure its the same as the schema
//                 // Previous problem was that this was passed as a string
//             },
//             select: { StudentID: true }
//         });

//         if (!student) {
//             throw new Error(`Student with ID ${studentId} does not exist`);
//         }

//         return true;
//     } catch (error) {
//         console.error('Error verifying student:', error);
//         throw error;
//     }
// }

// // Helper function to parse term name and create term if it doesn't exist
// async function ensureTermExists(termName, year) {
//     try {
//         // Parse term name to extract month and semester type
//         const termParts = termName.trim().split(' ');
//         let month = 1;
//         let semType = 'Semester 1';

//         // Map common term formats
//         if (termName.toLowerCase().includes('feb') || termName.toLowerCase().includes('mar')) {
//             month = 2;
//             semType = 'Semester 1';
//         } else if (termName.toLowerCase().includes('jun') || termName.toLowerCase().includes('winter')) {
//             month = 6;
//             semType = 'Winter';
//         } else if (termName.toLowerCase().includes('aug') || termName.toLowerCase().includes('sep')) {
//             month = 8;
//             semType = 'Semester 2';
//         } else if (termName.toLowerCase().includes('nov') || termName.toLowerCase().includes('dec') || termName.toLowerCase().includes('summer')) {
//             month = 11;
//             semType = 'Summer';
//         }

//         // Try to find existing term first
//         const existingTerm = await prisma.Term.findFirst({
//             where: {
//                 Name: termName,
//                 Year: parseInt(year) // Use the extracted year
//             }
//         });

//         if (existingTerm) {
//             return existingTerm;
//         }

//         // Create new term if it doesn't exist
//         const newTerm = await prisma.Term.create({
//             data: {
//                 Name: termName,
//                 Year: parseInt(year),
//                 Month: month,
//                 Status: 'published',
//                 SemType: semType
//             }
//         });

//         console.log(`Created new term: ${termName} ${year}`);
//         return newTerm;

//     } catch (error) {
//         console.error('Error ensuring term exists:', error);
//         throw error;
//     }
// }

// // Helper function to create unit if it doesn't exist
// async function ensureUnitExists(unitCode) {
//     try {
//         // Try to find existing unit first
//         const existingUnit = await prisma.Unit.findUnique({
//             where: { UnitCode: unitCode }
//         });

//         if (existingUnit) {
//             return existingUnit;
//         }

//         // Create new unit with default values if it doesn't exist
//         const newUnit = await prisma.Unit.create({
//             data: {
//                 UnitCode: unitCode,
//                 Name: `${unitCode} - Imported Unit`, // Default name
//                 CreditPoints: 12.5, // Default credit points
//                 Availability: 'published' // Default availability
//             }
//         });

//         console.log(`Created new unit: ${unitCode}`);
//         return newUnit;

//     } catch (error) {
//         console.error('Error ensuring unit exists:', error);
//         throw error;
//     }
// }

// // Helper function to log operations
// function logOperation(operation, details) {
//     const timestamp = new Date().toISOString();
//     console.log(`[${timestamp}] ${operation}: `, details);
// }

// export async function POST(req) {
//     try {
//         // Check for DEV override
//         const isDevOverride = req.headers.get('x-dev-override') === 'true' &&
//             process.env.NEXT_PUBLIC_MODE === 'DEV';

//         if (!isDevOverride) {
//             const authHeader = req.headers.get('Authorization');
//             const token_res = TokenValidation(authHeader);

//             if (!token_res.success) {
//                 return NextResponse.json({ success: false, message: token_res.message }, { status: token_res.status });
//             }
//             // Require actor email for auditability
//             const sessionEmail = req.headers.get('x-session-email');
//             if (!sessionEmail) {
//                 return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
//             }
//         }

//         // Parse request body
//         const requestText = await req.text();
//         let requestData;

//         try {
//             requestData = JSON.parse(requestText);
//         } catch (error) {
//             console.error('JSON Parse Error:', error);
//             return NextResponse.json(
//                 {
//                     success: false,
//                     message: `Failed to parse request data: ${error.message}`,
//                     receivedData: requestText.substring(0, 100) + '...'
//                 },
//                 { status: 400 }
//             );
//         }

//         if (!requestData || !Array.isArray(requestData.records) || requestData.records.length === 0) {
//             return NextResponse.json(
//                 {
//                     success: false,
//                     message: 'No valid unit history records provided',
//                     receivedData: JSON.stringify(requestData)
//                 },
//                 { status: 400 }
//             );
//         }

//         const records = requestData.records;
//         const importMode = requestData.mode || 'add';
//         const studentId = requestData.studentId;

//         if (!studentId) {
//             return NextResponse.json(
//                 {
//                     success: false,
//                     message: 'Student ID is required'
//                 },
//                 { status: 400 }
//             );
//         }

//         // CONVERT STUDENT ID TO DECIMAL FOR PRISMA
//         let studentIdDecimal;
//         try {
//             studentIdDecimal = studentId.toString(); // Keep as string for Prisma Decimal
//             console.log('Processing for Student ID:', studentIdDecimal);
//         } catch (error) {
//             return NextResponse.json(
//                 {
//                     success: false,
//                     message: `Invalid student ID format: ${studentId}`
//                 },
//                 { status: 400 }
//             );
//         }

//         // VERIFY STUDENT EXISTS FIRST
//         try {
//             await verifyStudentExists(studentIdDecimal);
//         } catch (error) {
//             return NextResponse.json(
//                 {
//                     success: false,
//                     message: error.message
//                 },
//                 { status: 400 }
//             );
//         }

//         const results = {
//             success: true,
//             total: records.length,
//             successful: 0,
//             failed: 0,
//             errors: [],
//             replaced: false,
//             timestamp: new Date().toISOString()
//         };

//         // Validate all records first
//         const validRecords = [];
//         for (let i = 0; i < records.length; i++) {
//             const record = records[i];

//             const validationErrors = validateUnitHistoryData(record);
//             if (validationErrors.length > 0) {
//                 results.failed++;
//                 results.errors.push({
//                     index: i,
//                     student_id: record.student_id || 'Unknown',
//                     unit_code: record.unit_code || 'Unknown',
//                     errors: validationErrors
//                 });
//             } else {
//                 validRecords.push({
//                     ...record,
//                     student_id: studentIdDecimal, // USE CONVERTED STUDENT ID
//                     unit_code: record.unit_code.trim().toUpperCase(),
//                     status: record.status.toLowerCase(),
//                     term: record.term.trim(),
//                     year: parseInt(record.year)
//                 });
//             }
//         }
//         // REPLACE MODE
//         // Handle replace mode for specific student
//         // if (importMode === 'replace' && studentId) {
//         //     try {
//         //         // Count existing unit history for the student
//         //         const existingCount = await prisma.UnitHistory.count({
//         //             where: { StudentID: parseFloat(studentId) }
//         //         });

//         //         // Log the delete operation
//         //         logOperation('DELETE STUDENT UNIT HISTORY', { 
//         //             studentId: studentId, 
//         //             count: existingCount 
//         //         });

//         //         // Delete all existing unit history for this student
//         //         await prisma.UnitHistory.deleteMany({
//         //             where: { StudentID: parseFloat(studentId) }
//         //         });

//         //         results.replaced = true;
//         //         results.replacedCount = existingCount;

//         //         console.log(`[${results.timestamp}] REPLACE MODE: Deleted ${existingCount} unit history records for student ${studentId}`);
//         //     } catch (error) {
//         //         console.error(`[${results.timestamp}] REPLACE MODE ERROR:`, error);
//         //         return NextResponse.json(
//         //             { 
//         //                 success: false, 
//         //                 message: 'Failed to replace existing unit history. Import aborted.',
//         //                 error: error.message
//         //             },
//         //             { status: 500 }
//         //         );
//         //     }
//         // }

//         // Process valid records
//         try {
//             if (validRecords.length > 0) {
//                 logOperation('BATCH PROCESS UNIT HISTORY', { count: validRecords.length, studentId: studentIdDecimal });

//                 for (const record of validRecords) {
//                     try {
//                         console.log('Processing record:', {
//                             student_id: record.student_id,
//                             unit_code: record.unit_code,
//                             status: record.status,
//                             term: record.term,
//                             year: record.year
//                         });

//                         // ENSURE UNIT EXISTS FIRST
//                         await ensureUnitExists(record.unit_code);

//                         // ENSURE TERM EXISTS FIRST
//                         const term = await ensureTermExists(record.term, record.year);

//                         // Check if this unit history record already exists (for add mode)
//                         if (importMode === 'add') {
//                             const existingRecord = await prisma.UnitHistory.findFirst({
//                                 where: {
//                                     StudentID: record.student_id,
//                                     UnitCode: record.unit_code,
//                                     TermID: term.ID
//                                 }
//                             });

//                             if (!existingRecord) {
//                                 // Create new record only if it does not exist
//                                 const newRecord = await prisma.UnitHistory.create({
//                                     data: {
//                                         StudentID: record.student_id,
//                                         UnitCode: record.unit_code,
//                                         Status: record.status, // STORE AS STRING, NOT UUID
//                                         Year: parseInt(record.year),
//                                         TermID: term.ID
//                                     }
//                                 });
//                                 console.log(`Created new unit history:`, newRecord);
//                             } else {
//                                 // Do nothing if it already exists
//                                 console.log(`Skipped existing unit history: ${record.unit_code} for student ${record.student_id} in term ${record.term}`);
//                             }
//                         } else {
//                             // Replace mode - just create new records
//                             const newRecord = await prisma.UnitHistory.create({
//                                 data: {
//                                     StudentID: record.student_id,
//                                     UnitCode: record.unit_code,
//                                     Status: record.status, // STORE AS STRING, NOT UUID
//                                     Year: parseInt(record.year),
//                                     TermID: term.ID
//                                 }
//                             });

//                             console.log(`Created unit history (replace mode):`, newRecord);
//                         }

//                         results.successful++;

//                     } catch (recordError) {
//                         console.error(`Error processing record for student ${record.student_id}, unit ${record.unit_code}:`, recordError);
//                         results.failed++;
//                         results.errors.push({
//                             student_id: record.student_id,
//                             unit_code: record.unit_code,
//                             errors: [`Failed to process: ${recordError.message}`]
//                         });
//                     }
//                 }
//             }
//         } catch (error) {
//             console.error(`[${results.timestamp}] BATCH UNIT HISTORY ERROR:`, error);
//             return NextResponse.json(
//                 {
//                     success: false,
//                     message: `Failed during unit history processing: ${error.message}`
//                 },
//                 { status: 500 }
//             );
//         }

//         // Generate appropriate message based on results
//         if (results.failed > 0) {
//             results.success = results.successful > 0;

//             if (importMode === 'replace') {
//                 results.message = results.successful > 0
//                     ? `Replaced ${results.replacedCount || 0} records with ${results.successful} new unit history records. ${results.failed} records had errors.`
//                     : `Failed to import unit history. All ${results.failed} import operations failed.`;
//             } else {
//                 results.message = results.successful > 0
//                     ? `Successfully processed ${results.successful} of ${results.total} unit history records with ${results.failed} errors.`
//                     : `Failed to process any unit history records. Found ${results.failed} errors.`;
//             }
//         } else {
//             if (importMode === 'replace') {
//                 results.message = `Successfully imported ${results.replacedCount || 0} records with ${results.successful} new unit history records.`;
//             } else {
//                 results.message = `Successfully processed all ${results.total} unit history records.`;
//             }
//         }

//         // Log the final result
//         logOperation('UNIT HISTORY IMPORT COMPLETED', {
//             mode: importMode,
//             studentId: studentIdDecimal,
//             total: results.total,
//             successful: results.successful,
//             failed: results.failed,
//             success: results.success
//         });

//         // AUDIT LOG
//         try {
//             const user = await SecureSessionManager.authenticateUser(req);
//             const actorEmail = user?.email || req.headers.get('x-session-email') || undefined;
//             await AuditLogger.logCreate({
//                 userId: user?.id || null,
//                 email: actorEmail,
//                 module: 'student_management',
//                 entity: 'UnitHistory',
//                 entityId: `Student ${studentIdDecimal} - Import`,
//                 after: validRecords.map(r => `${r.unit_code} (${r.status})`),
//                 metadata: {
//                     importMode,
//                     studentId: studentIdDecimal,
//                     total: results.total,
//                     successful: results.successful,
//                     failed: results.failed
//                 }
//             });
//         } catch (e) {
//             console.warn('Audit CREATE UnitHistory Import failed:', e?.message);
//         }

//         return NextResponse.json(results, { status: 200 });

//     } catch (error) {
//         console.error('Error processing unit history upload:', error);
//         return NextResponse.json(
//             {
//                 success: false,
//                 message: 'Server error while processing unit history upload',
//                 error: error.message
//             },
//             { status: 500 }
//         );
//     }
// }