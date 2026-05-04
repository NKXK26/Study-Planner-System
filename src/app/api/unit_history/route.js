// import { NextResponse } from 'next/server';
// import { PrismaClient } from '@prisma/client';
// import { TokenValidation } from "@app/api/api_helper";

// const prisma = new PrismaClient();

// export async function GET(request) {
//   try {
//     // Check for DEV override
//     const isDevOverride = req.headers.get('x-dev-override') === 'true' &&
//       process.env.NEXT_PUBLIC_MODE === 'DEV';

//     if (!isDevOverride) {
//       const authHeader = req.headers.get('Authorization');
//       const token_res = TokenValidation(authHeader);

//       if (!token_res.success) {
//         return NextResponse.json({ success: false, message: token_res.message }, { status: token_res.status });
//       }
//       // Require actor email for auditability
//       const sessionEmail = req.headers.get('x-session-email');
//       if (!sessionEmail) {
//         return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
//       }
//     }
//     // Get the student ID from the URL search params
//     const { searchParams } = new URL(request.url);
//     const studentId = searchParams.get('studentId');

//     // Validate the student ID
//     if (!studentId) {
//       return NextResponse.json(
//         { error: 'Student ID is required' },
//         { status: 400 }
//       );
//     }

//     // Query unit history with the current database schema
//     const unitHistory = await prisma.UnitHistory.findMany({
//       where: {
//         StudentID: studentId,
//       },
//       include: {
//         Term: {
//           select: {
//             ID: true,
//             Name: true,
//             Year: true,
//             SemType: true,
//             Month: true,
//           },
//         },
//         Unit: {
//           select: {
//             UnitCode: true,
//             Name: true,
//             CreditPoints: true,
//             UnitRequisiteRelationship_UnitRequisiteRelationship_UnitCodeToUnit: {
//               select: {
//                 ID: true,
//                 RequisiteUnitCode: true,
//                 UnitRelationship: true,
//                 LogicalOperators: true,
//                 MinCP: true
//               }
//             }
//           },
//         },
//       },
//       orderBy: {
//         ID: 'asc',
//       },
//     });

//     console.log('Unit history fetched successfully:', unitHistory);

//     // Return the unit history data
//     return NextResponse.json({
//       success: true,
//       data: unitHistory,
//     });
//   } catch (error) {
//     console.error('Error fetching unit history:', error);

//     return NextResponse.json(
//       {
//         success: false,
//         error: 'Failed to fetch unit history',
//         message: error.message
//       },
//       { status: 500 }
//     );
//   } finally {
//     // Disconnect from Prisma client to prevent connection leaks
//     await prisma.$disconnect();
//   }
// }

// export async function POST(request) {
//   try {
//     // Check for DEV override
//     const isDevOverride = req.headers.get('x-dev-override') === 'true' &&
//       process.env.NEXT_PUBLIC_MODE === 'DEV';

//     if (!isDevOverride) {
//       const authHeader = req.headers.get('Authorization');
//       const token_res = TokenValidation(authHeader);

//       if (!token_res.success) {
//         return NextResponse.json({ success: false, message: token_res.message }, { status: token_res.status });
//       }
//       // Require actor email for auditability
//       const sessionEmail = req.headers.get('x-session-email');
//       if (!sessionEmail) {
//         return NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 });
//       }
//     }
//     const { studentId, units } = await request.json();

//     if (!studentId || !Array.isArray(units)) {
//       return NextResponse.json(
//         { error: 'Invalid input: studentId and units array are required' },
//         { status: 400 }
//       );
//     }

//     console.log('units', units)

//     // Start a transaction
//     const result = await prisma.$transaction(async (tx) => {
//       // Delete all existing unit history records for this student
//       await tx.unitHistory.deleteMany({
//         where: { StudentID: studentId }
//       });

//       // Create all new records in a single batch
//       await tx.unitHistory.createMany({
//         data: units.map(unit => ({
//           StudentID: studentId,
//           UnitCode: unit.unitCode,
//           TermID: unit.termId,
//           Status: unit.status,
//           Year: unit.year
//         }))
//       });

//       // Now, recalculate credits completed for passed units
//       // Separate MPU credits from regular credits
//       const passedUnits = await tx.unitHistory.findMany({
//         where: {
//           StudentID: studentId,
//           Status: 'pass'
//         },
//         include: { Unit: true }
//       });

//       // Separate MPU credits (units with code starting with 'MPU') from regular credits
//       const regularCredits = passedUnits
//         .filter(u => u.Unit && !u.Unit.UnitCode.startsWith('MPU'))
//         .reduce((sum, u) => sum + (u.Unit?.CreditPoints || 0), 0);

//       // Count MPU units instead of summing credit points (since MPU units now have 0 CP)
//       const mpuCredits = passedUnits
//         .filter(u => u.Unit && u.Unit.UnitCode.startsWith('MPU'))
//         .length;

//       const creditsCompleted = regularCredits + mpuCredits;

//       // Update the Student table with both regular and MPU credits
//       let student_update = await tx.student.update({
//         where: { StudentID: studentId },
//         data: {
//           CreditCompleted: regularCredits,  // Only regular credits
//           MPUCreditCompleted: mpuCredits     // MPU credits separately
//         }
//       });

//       console.log('student_update', student_update)

//       return { count: units.length, creditsCompleted, regularCredits, mpuCredits };
//     });

//     return NextResponse.json({
//       success: true,
//       message: 'Unit history and credits updated successfully',
//       count: result.count,
//       creditsCompleted: result.creditsCompleted,
//       regularCredits: result.regularCredits,
//       mpuCredits: result.mpuCredits
//     });

//   } catch (error) {
//     console.error('Error updating unit history:', error);
//     return NextResponse.json(
//       {
//         success: false,
//         error: 'Failed to update unit history',
//         message: error.message
//       },
//       { status: 500 }
//     );
//   } finally {
//     await prisma.$disconnect();
//   }
// }
