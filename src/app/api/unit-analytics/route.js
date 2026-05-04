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

    // ── 1. Fetch all unit history with relations ───────────────────────────
    const unitHistories = await prisma.UnitHistory.findMany({
      include: {
        Unit: true,
        Term: true,
        Student: {
          include: { Course: true, Major: true },
        },
      },
      orderBy: { ID: 'desc' },
      take: 10000,
    });

    // ── 2. Fetch all units for reference ──────────────────────────────────
    const allUnits = await prisma.Unit.findMany({
      select: { ID: true, UnitCode: true, Name: true, CreditPoints: true },
    });

    const unitRef = {};
    for (const u of allUnits) unitRef[u.ID] = u;

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

    // ── 3. Group by unit ──────────────────────────────────────────────────
    const unitMap = {}; // unitID → stats

    for (const h of unitHistories) {
      const unitID   = h.UnitID;
      if (!unitID) continue;

      const unit = h.Unit || unitRef[unitID];
      if (!unit) continue;

      const code = unit.UnitCode || `Unit#${unitID}`;

      if (!unitMap[unitID]) {
        unitMap[unitID] = {
          unitID,
          unitCode:     code,
          unitName:     unit.Name || code,
          creditPoints: unit.CreditPoints || 0,
          totalAttempts: 0,
          passCount:    0,
          failCount:    0,
          students:     new Set(),
          repeatStudents: {}, // studentID → attempt count
          termBreakdown: {},  // termName → { pass, fail }
          courseBreakdown: {}, // courseCode → { pass, fail }
        };
      }

      const entry = unitMap[unitID];
      entry.totalAttempts++;
      entry.students.add(h.StudentID);

      // Track repeats
      entry.repeatStudents[h.StudentID] = (entry.repeatStudents[h.StudentID] || 0) + 1;

      if (isFail(h.Status)) {
        entry.failCount++;
        const termName = h.Term?.Name || `${h.Year}`;
        if (!entry.termBreakdown[termName]) entry.termBreakdown[termName] = { pass: 0, fail: 0 };
        entry.termBreakdown[termName].fail++;

        const courseCode = h.Student?.Course?.Code || 'Unknown';
        if (!entry.courseBreakdown[courseCode]) entry.courseBreakdown[courseCode] = { pass: 0, fail: 0 };
        entry.courseBreakdown[courseCode].fail++;
      }

      if (isPass(h.Status)) {
        entry.passCount++;
        const termName = h.Term?.Name || `${h.Year}`;
        if (!entry.termBreakdown[termName]) entry.termBreakdown[termName] = { pass: 0, fail: 0 };
        entry.termBreakdown[termName].pass++;

        const courseCode = h.Student?.Course?.Code || 'Unknown';
        if (!entry.courseBreakdown[courseCode]) entry.courseBreakdown[courseCode] = { pass: 0, fail: 0 };
        entry.courseBreakdown[courseCode].pass++;
      }
    }

    // ── 4. Compute derived metrics per unit ───────────────────────────────
    const unitStats = Object.values(unitMap).map(u => {
      const totalGraded = u.passCount + u.failCount;
      const failRate    = totalGraded > 0
        ? Math.round((u.failCount / totalGraded) * 100)
        : 0;
      const passRate    = totalGraded > 0
        ? Math.round((u.passCount / totalGraded) * 100)
        : 0;

      // Students who attempted more than once = repeat students
      const repeatCount = Object.values(u.repeatStudents).filter(c => c > 1).length;

      // Term trend — sort terms and show pass/fail over time
      const termTrend = Object.entries(u.termBreakdown)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([term, counts]) => ({
          term,
          pass: counts.pass,
          fail: counts.fail,
          failRate: (counts.pass + counts.fail) > 0
            ? Math.round((counts.fail / (counts.pass + counts.fail)) * 100)
            : 0,
        }));

      return {
        unitID:        u.unitID,
        unitCode:      u.unitCode,
        unitName:      u.unitName,
        creditPoints:  u.creditPoints,
        totalAttempts: u.totalAttempts,
        uniqueStudents: u.students.size,
        passCount:     u.passCount,
        failCount:     u.failCount,
        failRate,
        passRate,
        repeatCount,
        isHighRisk:    failRate >= 30,
        termTrend:     termTrend.slice(-6), // last 6 terms
        courseBreakdown: Object.entries(u.courseBreakdown).map(([code, counts]) => ({
          courseCode: code,
          pass: counts.pass,
          fail: counts.fail,
        })),
      };
    });

    // ── 5. Sort & slice ────────────────────────────────────────────────────
    const byFailRate    = [...unitStats].sort((a, b) => b.failRate - a.failRate);
    const byFailCount   = [...unitStats].sort((a, b) => b.failCount - a.failCount);
    const byRepeats     = [...unitStats].sort((a, b) => b.repeatCount - a.repeatCount);
    const highRiskUnits = byFailRate.filter(u => u.isHighRisk);

    // ── 6. Overall summary ────────────────────────────────────────────────
    const totalAttempts  = unitHistories.length;
    const totalFails     = unitHistories.filter(h => isFail(h.Status)).length;
    const totalPasses    = unitHistories.filter(h => isPass(h.Status)).length;
    const overallFailRate = (totalFails + totalPasses) > 0
      ? Math.round((totalFails / (totalFails + totalPasses)) * 100)
      : 0;

    // ── 7. Term-level trend (all units combined) ──────────────────────────
    const termOverall = {};
    for (const h of unitHistories) {
      const termName = h.Term?.Name || `${h.Year}`;
      if (!termOverall[termName]) termOverall[termName] = { pass: 0, fail: 0 };
      if (isFail(h.Status)) termOverall[termName].fail++;
      if (isPass(h.Status)) termOverall[termName].pass++;
    }
    const overallTermTrend = Object.entries(termOverall)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([term, counts]) => ({
        term,
        pass: counts.pass,
        fail: counts.fail,
        failRate: (counts.pass + counts.fail) > 0
          ? Math.round((counts.fail / (counts.pass + counts.fail)) * 100)
          : 0,
      }))
      .slice(-8);

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalUnits:      unitStats.length,
          totalAttempts,
          totalFails,
          totalPasses,
          overallFailRate,
          highRiskUnitCount: highRiskUnits.length,
        },
        topByFailRate:   byFailRate.slice(0, 15),
        topByFailCount:  byFailCount.slice(0, 15),
        topByRepeats:    byRepeats.slice(0, 15),
        highRiskUnits:   highRiskUnits.slice(0, 20),
        overallTermTrend,
        allUnits:        unitStats.slice(0, 100),
      },
    });

  } catch (error) {
    console.error("Unit analytics error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load unit analytics", error: error.message },
      { status: 500 }
    );
  }
}