import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import { TokenValidation } from "@app/api/api_helper";

// Helper: Get required credits for a course/major
async function getRequiredCredits(courseId, majorId) {
  const course = await prisma.Course.findUnique({
    where: { ID: courseId },
    select: { CreditsRequired: true }
  });
  
  // If major has specific requirements, you could add logic here
  return course?.CreditsRequired || 120; // Default to 120 credits
}

// Helper: Check if prerequisites are met
async function checkPrerequisites(unitId, studentId) {
  const prerequisites = await prisma.UnitRequisiteRelationship.findMany({
    where: { UnitID: unitId },
    include: { Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit: true }
  });
  
  if (prerequisites.length === 0) return { met: true, missing: [] };
  
  const completedUnits = await prisma.UnitHistory.findMany({
    where: {
      StudentID: studentId,
      Status: { in: ["pass", "Pass", "PASS", "P"] }
    },
    select: { UnitID: true }
  });
  
  const completedUnitIds = new Set(completedUnits.map(u => u.UnitID));
  const missingPrereqs = [];
  
  for (const prereq of prerequisites) {
    const requiredUnitId = prereq.RequisiteUnitID;
    if (requiredUnitId && !completedUnitIds.has(requiredUnitId)) {
      const unit = await prisma.Unit.findUnique({
        where: { ID: requiredUnitId },
        select: { UnitCode: true, Name: true }
      });
      if (unit) missingPrereqs.push(`${unit.UnitCode} - ${unit.Name}`);
    }
  }
  
  return { met: missingPrereqs.length === 0, missing: missingPrereqs };
}

// Helper: Get all required units for a course/major
async function getRequiredUnits(studentId, courseId, majorId) {
  // Get all units from study planners for this course/major
  const planners = await prisma.StudyPlanner.findMany({
    where: {
      units: {
        some: {}
      }
    },
    include: {
      units: {
        select: {
          ID: true,
          UnitCode: true,
          Name: true,
          CreditPoints: true
        }
      }
    }
  });
  
  // Extract all unique units
  const uniqueUnits = new Map();
  for (const planner of planners) {
    for (const unit of planner.units) {
      if (!uniqueUnits.has(unit.ID)) {
        uniqueUnits.set(unit.ID, {
          id: unit.ID,
          code: unit.UnitCode,
          name: unit.Name,
          credits: unit.CreditPoints || 0
        });
      }
    }
  }
  
  return Array.from(uniqueUnits.values());
}

// Main eligibility check
async function checkEligibility(studentId) {
  // 1. Get student data
  const student = await prisma.Student.findUnique({
    where: { StudentID: parseInt(studentId) },
    include: {
      Course: true,
      Major: true,
      CourseIntake: {
        include: { Term: true }
      }
    }
  });
  
  if (!student) return { error: "Student not found" };
  
  // 2. Get completed units with status
  const unitHistory = await prisma.UnitHistory.findMany({
    where: { StudentID: student.StudentID },
    include: { Unit: true, Term: true },
    orderBy: { Year: 'desc' }
  });
  
  // 3. Calculate completed credits
  let completedCredits = 0;
  let passedUnits = [];
  let failedUnits = [];
  let inProgressUnits = [];
  
  for (const record of unitHistory) {
    const credits = record.Unit?.CreditPoints || 0;
    const status = record.Status?.toLowerCase() || '';
    
    if (['pass', 'p', 'passed'].includes(status)) {
      completedCredits += credits;
      passedUnits.push({
        code: record.Unit?.UnitCode,
        name: record.Unit?.Name,
        credits: credits,
        year: record.Year,
        term: record.Term?.Name
      });
    } else if (['fail', 'f', 'failed'].includes(status)) {
      failedUnits.push({
        code: record.Unit?.UnitCode,
        name: record.Unit?.Name,
        credits: credits,
        year: record.Year,
        term: record.Term?.Name,
        status: record.Status
      });
    } else if (['in progress', 'ip', 'enrolled'].includes(status)) {
      inProgressUnits.push({
        code: record.Unit?.UnitCode,
        name: record.Unit?.Name,
        credits: credits
      });
    }
  }
  
  // 4. Get required credits
  const requiredCredits = await getRequiredCredits(student.CourseID, student.MajorID);
  
  // 5. Get required units for the program
  const requiredUnits = await getRequiredUnits(student.StudentID, student.CourseID, student.MajorID);
  
  // 6. Identify missing required units
  const completedUnitIds = new Set(unitHistory
    .filter(u => ['pass', 'p', 'passed'].includes(u.Status?.toLowerCase() || ''))
    .map(u => u.UnitID)
  );
  
  const missingUnits = [];
  for (const reqUnit of requiredUnits) {
    if (!completedUnitIds.has(reqUnit.id)) {
      // Check prerequisites for missing unit
      const prereqCheck = await checkPrerequisites(reqUnit.id, student.StudentID);
      missingUnits.push({
        code: reqUnit.code,
        name: reqUnit.name,
        credits: reqUnit.credits,
        prerequisiteStatus: prereqCheck.met ? "met" : "not_met",
        missingPrerequisites: prereqCheck.missing
      });
    }
  }
  
  // 7. Calculate completion percentage
  const completionPercent = Math.min(100, Math.round((completedCredits / requiredCredits) * 100));
  
  // 8. Determine status
  let eligibilityStatus = "Not Eligible";
  let statusReason = "";
  
  if (completedCredits >= requiredCredits && missingUnits.length === 0) {
    eligibilityStatus = "Eligible to Graduate";
    statusReason = "All requirements met";
  } else if (completedCredits >= requiredCredits && missingUnits.length > 0) {
    eligibilityStatus = "Missing Required Units";
    statusReason = "Credit requirement met, but missing required units";
  } else if (completionPercent >= 70) {
    eligibilityStatus = "On Track";
    statusReason = `${completionPercent}% complete, ${missingUnits.length} units remaining`;
  } else if (failedUnits.length > 2) {
    eligibilityStatus = "At Risk";
    statusReason = `${failedUnits.length} failed units - academic intervention recommended`;
  } else {
    eligibilityStatus = "In Progress";
    statusReason = `${completionPercent}% complete`;
  }
  
  // 9. Build result
  return {
    student: {
      id: student.StudentID,
      name: student.FirstName || `Student ${student.StudentID}`,
      course: student.Course?.Code || "Unknown",
      major: student.Major?.Name || "Unknown",
      intake: student.CourseIntake?.Term?.Name || "Unknown"
    },
    credits: {
      completed: completedCredits,
      required: requiredCredits,
      remaining: Math.max(0, requiredCredits - completedCredits),
      percentage: completionPercent
    },
    units: {
      passed: passedUnits.length,
      failed: failedUnits.length,
      inProgress: inProgressUnits.length,
      missing: missingUnits.length
    },
    passedUnits: passedUnits,
    failedUnits: failedUnits,
    missingUnits: missingUnits,
    inProgressUnits: inProgressUnits,
    eligibilityStatus,
    statusReason,
    graduationEligible: eligibilityStatus === "Eligible to Graduate"
  };
}

// GET endpoint - check eligibility for a specific student
export async function GET(req) {
  try {
    const isDevOverride =
      req.headers.get("x-dev-override") === "true" &&
      process.env.NEXT_PUBLIC_MODE === "DEV";

    if (!isDevOverride) {
      const authHeader = req.headers.get("Authorization");
      const token_res = TokenValidation(authHeader);
      if (!token_res.success) {
        return NextResponse.json(
          { success: false, message: token_res.message },
          { status: token_res.status }
        );
      }
    }

    const url = new URL(req.url);
    const studentId = url.searchParams.get("studentId");
    
    if (!studentId) {
      return NextResponse.json(
        { success: false, message: "Student ID is required" },
        { status: 400 }
      );
    }
    
    const result = await checkEligibility(studentId);
    
    if (result.error) {
      return NextResponse.json(
        { success: false, message: result.error },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, data: result });
    
  } catch (error) {
    console.error("Graduation eligibility error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to check eligibility", error: error.message },
      { status: 500 }
    );
  }
}

// POST endpoint - batch check multiple students
export async function POST(req) {
  try {
    const isDevOverride =
      req.headers.get("x-dev-override") === "true" &&
      process.env.NEXT_PUBLIC_MODE === "DEV";

    if (!isDevOverride) {
      const authHeader = req.headers.get("Authorization");
      const token_res = TokenValidation(authHeader);
      if (!token_res.success) {
        return NextResponse.json(
          { success: false, message: token_res.message },
          { status: token_res.status }
        );
      }
    }

    const { studentIds } = await req.json();
    
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json(
        { success: false, message: "Array of student IDs is required" },
        { status: 400 }
      );
    }
    
    const results = [];
    for (const studentId of studentIds) {
      const result = await checkEligibility(studentId);
      if (!result.error) {
        results.push(result);
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      data: results,
      summary: {
        eligible: results.filter(r => r.graduationEligible).length,
        atRisk: results.filter(r => r.eligibilityStatus === "At Risk").length,
        onTrack: results.filter(r => r.eligibilityStatus === "On Track").length,
        total: results.length
      }
    });
    
  } catch (error) {
    console.error("Batch eligibility error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to check eligibility", error: error.message },
      { status: 500 }
    );
  }
}