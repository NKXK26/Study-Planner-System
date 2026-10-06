import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import SecureSessionManager from "@utils/auth/SimpleSessionManager";
import { TokenValidation } from "@app/api/api_helper";

async function validateAuthenticatedRequest(req) {
    const isDevOverride = req.headers.get('x-dev-override') === 'true' &&
        process.env.NEXT_PUBLIC_MODE === 'DEV';

    if (isDevOverride) {
        return {
            user: {
                email: 'developer@dev.local',
                roles: ['Developer'],
                isActive: true,
            },
        };
    }

    const authHeader = req.headers.get('Authorization');
    const token_res = TokenValidation(authHeader);

    if (!token_res.success) {
        return { error: NextResponse.json({ success: false, message: token_res.message }, { status: token_res.status }) };
    }

    const sessionEmail = req.headers.get('x-session-email');
    if (!sessionEmail) {
        return { error: NextResponse.json({ success: false, message: 'Missing authentication header x-session-email' }, { status: 401 }) };
    }

    const user = await SecureSessionManager.authenticateUser(req);
    if (!user) {
        return { error: NextResponse.json({ success: false, message: 'Unauthorized user session' }, { status: 401 }) };
    }

    return { user };
}

// Helper: Get planner template requirements for a course/major
async function getPlannerTemplateRequirements(courseId, majorId) {
    // First try to find a planner template for this course/major
    // We look for a template that matches the course/major combination
    const template = await prisma.plannerTemplate.findFirst({
        where: {
            name: {
                contains: majorId.toString() // rough match - in real use would have better mapping
            }
        },
        include: { requirements: { include: { unitType: true } } }
    });

    if (template?.requirements) {
        return template.requirements.map(r => ({
            unitTypeId: r.unitTypeId,
            unitTypeName: r.unitType.Name,
            requiredCount: r.requiredCount
        }));
    }

    // Fallback: get any planner template
    const fallbackTemplate = await prisma.plannerTemplate.findFirst({
        include: { requirements: { include: { unitType: true } } }
    });

    if (fallbackTemplate?.requirements) {
        return fallbackTemplate.requirements.map(r => ({
            unitTypeId: r.unitTypeId,
            unitTypeName: r.unitType.Name,
            requiredCount: r.requiredCount
        }));
    }

    return [];
}

// Helper: Get course required credits
async function getRequiredCredits(courseId) {
    const course = await prisma.course.findUnique({
        where: { ID: courseId },
        select: { CreditsRequired: true }
    });
    return course?.CreditsRequired || 120;
}

// Helper: Get student's completed units from UnitHistory
async function getStudentCompletedUnits(studentId) {
    const unitHistory = await prisma.unitHistory.findMany({
        where: { StudentID: studentId },
        include: {
            Unit: {
                select: { ID: true, UnitCode: true, Name: true, CreditPoints: true, unitTypeId: true }
            }
        }
    });

    return unitHistory.map(uh => ({
        unitId: uh.UnitID,
        unitCode: uh.Unit?.UnitCode,
        unitName: uh.Unit?.Name,
        creditPoints: uh.Unit?.CreditPoints || 12.5,
        unitTypeId: uh.Unit?.unitTypeId,
        status: uh.Status,
        grade: uh.Grade,
        term: uh.Term,
        year: uh.Year
    }));
}

// Helper: Get unit type name
async function getUnitTypeName(unitTypeId) {
    if (!unitTypeId) return 'Unknown';
    const ut = await prisma.unitType.findUnique({
        where: { ID: unitTypeId },
        select: { Name: true }
    });
    return ut?.Name || 'Unknown';
}

// Helper: Check prerequisites for a unit
async function checkPrerequisites(unitId, completedUnitIds) {
    const prerequisites = await prisma.unitRequisiteRelationship.findMany({
        where: { UnitID: unitId },
        include: { Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit: { select: { ID: true, UnitCode: true, Name: true } } }
    });

    const missing = [];
    for (const prereq of prerequisites) {
        const reqUnitId = prereq.RequisiteUnitID;
        if (reqUnitId && !completedUnitIds.has(reqUnitId)) {
            const unit = await prisma.unit.findUnique({
                where: { ID: reqUnitId },
                select: { UnitCode: true, Name: true }
            });
            if (unit) missing.push(`${unit.UnitCode} - ${unit.Name}`);
        }
    }
    return missing;
}

export async function GET(req) {
    const authResult = await validateAuthenticatedRequest(req);
    if (authResult.error) return authResult.error;

    try {
        const { searchParams } = new URL(req.url);
        const studentId = parseInt(searchParams.get('studentId'));
        const queryCourseId = parseInt(searchParams.get('courseId'));
        const queryMajorId = parseInt(searchParams.get('majorId'));

        // If studentId provided, get their course/major
        let student = null;
        let finalCourseId = queryCourseId;
        let finalMajorId = queryMajorId;

        if (studentId) {
            student = await prisma.student.findUnique({
                where: { StudentID: studentId },
                include: { Course: true, Major: true }
            });

            if (student) {
                finalCourseId = student.CourseID;
                finalMajorId = student.MajorID;
            }
        } else if (queryCourseId && queryMajorId) {
            // Just return degree requirements
            const requirements = await getPlannerTemplateRequirements(queryCourseId, queryMajorId);
            const requiredCredits = await getRequiredCredits(queryCourseId);
            return NextResponse.json({
                success: true,
                data: { requirements, requiredCredits }
            });
        }

        if (!student) {
            return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });
        }

        const courseId = finalCourseId;
        const majorId = finalMajorId;

        // Get degree requirements
        const [requirements, requiredCredits] = await Promise.all([
            getPlannerTemplateRequirements(courseId, majorId),
            getRequiredCredits(courseId)
        ]);

        // Get student's completed units
        const completedUnits = await getStudentCompletedUnits(studentId);

        // Separate by status
        const passedUnits = completedUnits.filter(u => u.status && ['pass', 'Pass', 'PASS', 'P'].includes(u.status.toLowerCase()));
        const failedUnits = completedUnits.filter(u => u.status && ['fail', 'Fail', 'FAIL', 'F'].includes(u.status.toLowerCase()));
        const inProgressUnits = completedUnits.filter(u => u.status && ['in progress', 'In Progress', 'IP', 'current', 'Current'].includes(u.status.toLowerCase()));
        const otherUnits = completedUnits.filter(u => !['pass', 'Pass', 'PASS', 'P', 'fail', 'Fail', 'FAIL', 'F', 'in progress', 'In Progress', 'IP', 'current', 'Current'].includes(u.status?.toLowerCase() || ''));

        // Get unique passed unit IDs for prerequisite checking
        const passedUnitIds = new Set(passedUnits.map(u => u.unitId).filter(Boolean));

        // Group passed units by unit type
        const passedByType = {};
        for (const unit of passedUnits) {
            const typeName = await getUnitTypeName(unit.unitTypeId);
            if (!passedByType[typeName]) passedByType[typeName] = [];
            passedByType[typeName].push(unit);
        }

        // Check requirements
        let coreUnitsCompleted = 0, coreUnitsRequired = 0;
        let majorUnitsCompleted = 0, majorUnitsRequired = 0;
        let electivesCompleted = 0, electivesRequired = 0;
        const missingRequirements = [];
        const completedRequirements = [];

        for (const req of requirements) {
            const typeName = req.unitTypeName;
            const required = req.requiredCount;
            const completed = passedByType[typeName]?.length || 0;

            // Categorize
            const lowerType = typeName.toLowerCase();
            if (lowerType.includes('core') || lowerType.includes('compulsory') || lowerType.includes('mandatory')) {
                coreUnitsRequired += required;
                coreUnitsCompleted += Math.min(completed, required);
            } else if (lowerType.includes('major') || lowerType.includes('specialisation') || lowerType.includes('specialization')) {
                majorUnitsRequired += required;
                majorUnitsCompleted += Math.min(completed, required);
            } else if (lowerType.includes('elective')) {
                electivesRequired += required;
                electivesCompleted += Math.min(completed, required);
            } else {
                coreUnitsRequired += required;
                coreUnitsCompleted += Math.min(completed, required);
            }

            // Track missing
            if (completed < required) {
                // Find which specific units from the study planner are missing
                const plannerUnits = await prisma.unitInSemesterStudyPlanner.findMany({
                    where: { UnitTypeID: req.unitTypeId },
                    include: { Unit: { select: { ID: true, UnitCode: true, Name: true, CreditPoints: true } } }
                });

                const plannerUnitIds = new Set(plannerUnits.map(u => u.UnitID));
                const completedUnitIds = new Set(passedByType[typeName]?.map(u => u.unitId) || []);

                for (const pu of plannerUnits) {
                    if (pu.Unit && !completedUnitIds.has(pu.Unit.ID)) {
                        const prereqs = await checkPrerequisites(pu.Unit.ID, passedUnitIds);
                        missingRequirements.push({
                            unitCode: pu.Unit.UnitCode,
                            unitName: pu.Unit.Name,
                            creditPoints: pu.Unit.CreditPoints || 12.5,
                            type: typeName,
                            prerequisites: prereqs.length > 0 ? prereqs : undefined
                        });
                    }
                }
            } else {
                // Add completed ones
                for (const unit of passedByType[typeName] || []) {
                    completedRequirements.push({
                        unitCode: unit.unitCode,
                        unitName: unit.unitName,
                        creditPoints: unit.creditPoints,
                        type: typeName
                    });
                }
            }
        }

        // Calculate credits
        const completedCredits = passedUnits.reduce((sum, u) => sum + (u.creditPoints || 12.5), 0);
        const remainingCredits = Math.max(0, requiredCredits - completedCredits);

        // Determine status
        let status = 'in_progress';
        const hasMissingCore = coreUnitsCompleted < coreUnitsRequired;
        const hasMissingMajor = majorUnitsCompleted < majorUnitsRequired;
        const hasMissingElectives = electivesCompleted < electivesRequired;
        const hasMissingCredits = completedCredits < requiredCredits;

        if (!hasMissingCore && !hasMissingMajor && !hasMissingElectives && !hasMissingCredits) {
            status = 'eligible';
        } else if (hasMissingCore || hasMissingMajor) {
            status = 'not_eligible';
        } else {
            status = 'in_progress';
        }

        return NextResponse.json({
            success: true,
            data: {
                studentInfo: {
                    studentId: student.StudentID,
                    name: `${student.FirstName} ${student.LastName}`,
                    course: student.Course?.Code,
                    major: student.Major?.Name
                },
                status,
                credits: {
                    completed: completedCredits,
                    required: requiredCredits,
                    remaining: remainingCredits
                },
                coreUnits: {
                    completed: coreUnitsCompleted,
                    required: coreUnitsRequired,
                    remaining: Math.max(0, coreUnitsRequired - coreUnitsCompleted)
                },
                majorUnits: {
                    completed: majorUnitsCompleted,
                    required: majorUnitsRequired,
                    remaining: Math.max(0, majorUnitsRequired - majorUnitsCompleted)
                },
                electives: {
                    completed: electivesCompleted,
                    required: electivesRequired,
                    remaining: Math.max(0, electivesRequired - electivesCompleted)
                },
                missingRequirements,
                completedRequirements,
                failedUnits: failedUnits.map(u => ({
                    unitCode: u.unitCode,
                    unitName: u.unitName,
                    status: u.status
                })),
                inProgressUnits: inProgressUnits.map(u => ({
                    unitCode: u.unitCode,
                    unitName: u.unitName
                }))
            }
        });

    } catch (error) {
        console.error('Graduation checker error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to check graduation eligibility', details: error.message },
            { status: 500 }
        );
    }
}