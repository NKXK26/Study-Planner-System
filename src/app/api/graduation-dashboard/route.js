import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import { TokenValidation } from "@app/api/api_helper";

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

    // ── 1. Fetch all students with course, major, intake ──────────────────
    const students = await prisma.Student.findMany({
      include: {
        Course: true,
        Major: true,
        CourseIntake: {
          include: { Term: true },
        },
      },
    });

    // ── 2. Fetch unit history for failure analysis ─────────────────────────
    const unitHistories = await prisma.UnitHistory.findMany({
      include: { Unit: true, Term: true },
      orderBy: { ID: 'desc' },
      take: 8000,
    });

    // Group history by student
    const historyByStudent = {};
    for (const h of unitHistories) {
      if (!historyByStudent[h.StudentID]) historyByStudent[h.StudentID] = [];
      historyByStudent[h.StudentID].push(h);
    }

    const isFail = (status) => {
      if (!status) return false;
      return ['fail', 'f', '0', 'incomplete', 'nf', 'failed'].includes(
        status.toLowerCase().trim()
      );
    };

    const isPass = (status) => {
      if (!status) return false;
      const s = status.toLowerCase().trim();
      return ['pass', 'p', 'a', 'a-', 'b+', 'b', 'b-', 'c+', 'c', 'c-',
              'credit', 'distinction', 'hd', '1'].includes(s);
    };

    // ── 3. Analyse each student ────────────────────────────────────────────
    const summaries = [];
    const courseBreakdown = {};   // { courseCode: { eligible, atRisk, onTrack, total } }
    const intakeBreakdown = {};   // { intakeId: { name, eligible, atRisk, total } }
    const completionBuckets = { '0-25': 0, '26-50': 0, '51-75': 0, '76-99': 0, '100': 0 };

    for (const s of students) {
      const creditsRequired  = s.Course?.CreditsRequired ?? 0;
      const creditsCompleted = s.CreditCompleted         ?? 0;
      const mpuCompleted     = s.MPUCreditCompleted      ?? 0;
      const totalCompleted   = creditsCompleted + mpuCompleted;
      const creditsRemaining = Math.max(0, creditsRequired - totalCompleted);
      const completionPercent = creditsRequired > 0
        ? Math.round((totalCompleted / creditsRequired) * 100)
        : 0;

      const history      = historyByStudent[s.StudentID] || [];
      const failedUnits  = history.filter(h => isFail(h.Status));
      const passedUnits  = history.filter(h => isPass(h.Status));
      const failureCount = failedUnits.length;

      const isActive   = s.Status?.toLowerCase() === 'active';
      const isEligible = creditsRequired > 0 && totalCompleted >= creditsRequired && isActive;
      const isAtRisk   = !isEligible && (completionPercent < 60 || failureCount >= 2 || !isActive);
      const isOnTrack  = !isEligible && !isAtRisk && completionPercent >= 60;
      const isOverdue  = !isActive && !isEligible;

      // Completion bucket
      if (completionPercent >= 100)     completionBuckets['100']++;
      else if (completionPercent >= 76) completionBuckets['76-99']++;
      else if (completionPercent >= 51) completionBuckets['51-75']++;
      else if (completionPercent >= 26) completionBuckets['26-50']++;
      else                              completionBuckets['0-25']++;

      // Course breakdown
      const courseCode = s.Course?.Code || 'Unknown';
      if (!courseBreakdown[courseCode]) {
        courseBreakdown[courseCode] = {
          courseCode,
          courseName: s.Course?.Name || courseCode,
          total: 0, eligible: 0, atRisk: 0, onTrack: 0, overdue: 0,
        };
      }
      courseBreakdown[courseCode].total++;
      if (isEligible) courseBreakdown[courseCode].eligible++;
      if (isAtRisk)   courseBreakdown[courseCode].atRisk++;
      if (isOnTrack)  courseBreakdown[courseCode].onTrack++;
      if (isOverdue)  courseBreakdown[courseCode].overdue++;

      // Intake breakdown
      const intakeId = s.IntakeID;
      if (!intakeBreakdown[intakeId]) {
        intakeBreakdown[intakeId] = {
          intakeId,
          intakeName: s.CourseIntake?.Term?.Name || `Intake ${intakeId}`,
          total: 0, eligible: 0, atRisk: 0,
        };
      }
      intakeBreakdown[intakeId].total++;
      if (isEligible) intakeBreakdown[intakeId].eligible++;
      if (isAtRisk)   intakeBreakdown[intakeId].atRisk++;

      summaries.push({
        studentID:        s.StudentID,
        name:             s.FirstName || `Student ${s.StudentID}`,
        course:           s.Course?.Code  || 'N/A',
        courseName:       s.Course?.Name  || 'N/A',
        major:            s.Major?.Name   || 'N/A',
        status:           s.Status        || 'Unknown',
        creditsRequired,
        creditsCompleted: totalCompleted,
        creditsRemaining,
        completionPercent,
        failureCount,
        passedCount:      passedUnits.length,
        failedUnitCodes:  failedUnits.map(f => f.Unit?.UnitCode).filter(Boolean).slice(0, 8),
        isEligible,
        isAtRisk,
        isOnTrack,
        isOverdue,
      });
    }

    // ── 4. Summary stats ───────────────────────────────────────────────────
    const totalStudents  = summaries.length;
    const eligibleCount  = summaries.filter(s => s.isEligible).length;
    const atRiskCount    = summaries.filter(s => s.isAtRisk).length;
    const onTrackCount   = summaries.filter(s => s.isOnTrack).length;
    const overdueCount   = summaries.filter(s => s.isOverdue).length;
    const avgCompletion  = totalStudents > 0
      ? Math.round(summaries.reduce((sum, s) => sum + s.completionPercent, 0) / totalStudents)
      : 0;

    // ── 5. At-risk students sorted by completion % ascending ──────────────
    const atRiskStudents = summaries
      .filter(s => s.isAtRisk)
      .sort((a, b) => a.completionPercent - b.completionPercent)
      .slice(0, 50);

    // ── 6. Eligible students ───────────────────────────────────────────────
    const eligibleStudents = summaries
      .filter(s => s.isEligible)
      .sort((a, b) => b.creditsCompleted - a.creditsCompleted)
      .slice(0, 50);

    // ── 7. Course breakdown sorted by at-risk count ────────────────────────
    const courseStats = Object.values(courseBreakdown)
      .sort((a, b) => b.atRisk - a.atRisk);

    // ── 8. Intake breakdown ────────────────────────────────────────────────
    const intakeStats = Object.values(intakeBreakdown)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalStudents,
          eligibleCount,
          atRiskCount,
          onTrackCount,
          overdueCount,
          avgCompletion,
          graduationRate: totalStudents > 0
            ? Math.round((eligibleCount / totalStudents) * 100)
            : 0,
        },
        completionBuckets,
        courseStats,
        intakeStats,
        atRiskStudents,
        eligibleStudents,
      },
    });

  } catch (error) {
    console.error("Graduation dashboard error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load graduation data", error: error.message },
      { status: 500 }
    );
  }
}