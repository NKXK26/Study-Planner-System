import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import { TokenValidation } from "@app/api/api_helper";

// Helper functions
const isFail = (status) => {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return ['fail', 'f', '0', 'incomplete', 'nf', 'failed'].includes(s);
};

const isPass = (status) => {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return ['pass', 'p', 'a', 'a-', 'b+', 'b', 'b-', 'c+', 'c', 'c-',
    'credit', 'distinction', 'hd', '1'].includes(s);
};

export async function GET(req) {
  try {
    // ── Authentication ──────────────────────────────────────────────────────
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
          include: { 
            Course: true, 
            Major: true 
          },
        },
      },
      orderBy: { ID: 'desc' },
      take: 10000,
    });

    // ── 2. Fetch all active units for reference ────────────────────────────
    const allUnits = await prisma.Unit.findMany({
      where: {
        Availability: "published"
      },
      select: { 
        ID: true, 
        UnitCode: true, 
        Name: true, 
        CreditPoints: true,
        Availability: true
      },
    });

    const unitRef = {};
    for (const u of allUnits) unitRef[u.ID] = u;

    // ── 3. Group by unit ──────────────────────────────────────────────────
    const unitMap = {};

    for (const h of unitHistories) {
      const unitID = h.UnitID;
      if (!unitID) continue;

      const unit = h.Unit || unitRef[unitID];
      if (!unit) continue;

      const code = unit.UnitCode || `Unit#${unitID}`;

      if (!unitMap[unitID]) {
        unitMap[unitID] = {
          unitID,
          unitCode: code,
          unitName: unit.Name || code,
          creditPoints: unit.CreditPoints || 0,
          totalAttempts: 0,
          passCount: 0,
          failCount: 0,
          students: new Set(),
          repeatStudents: {},
          termBreakdown: {},
          courseBreakdown: {},
        };
      }

      const entry = unitMap[unitID];
      entry.totalAttempts++;
      entry.students.add(h.StudentID);

      // Track repeats
      entry.repeatStudents[h.StudentID] = (entry.repeatStudents[h.StudentID] || 0) + 1;

      const termName = h.Term?.Name || `${h.Year || 'Unknown'}`;
      const courseCode = h.Student?.Course?.Code || 'Unknown';

      if (isFail(h.Status)) {
        entry.failCount++;
        
        if (!entry.termBreakdown[termName]) entry.termBreakdown[termName] = { pass: 0, fail: 0 };
        entry.termBreakdown[termName].fail++;

        if (!entry.courseBreakdown[courseCode]) entry.courseBreakdown[courseCode] = { pass: 0, fail: 0 };
        entry.courseBreakdown[courseCode].fail++;
      }

      if (isPass(h.Status)) {
        entry.passCount++;
        
        if (!entry.termBreakdown[termName]) entry.termBreakdown[termName] = { pass: 0, fail: 0 };
        entry.termBreakdown[termName].pass++;

        if (!entry.courseBreakdown[courseCode]) entry.courseBreakdown[courseCode] = { pass: 0, fail: 0 };
        entry.courseBreakdown[courseCode].pass++;
      }
    }

    // ── 4. Compute derived metrics per unit ───────────────────────────────
    const unitStats = Object.values(unitMap).map(u => {
      const totalGraded = u.passCount + u.failCount;
      const failRate = totalGraded > 0
        ? Math.round((u.failCount / totalGraded) * 100)
        : 0;
      const passRate = totalGraded > 0
        ? Math.round((u.passCount / totalGraded) * 100)
        : 0;

      const repeatCount = Object.values(u.repeatStudents).filter(c => c > 1).length;

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
        unitID: u.unitID,
        unitCode: u.unitCode,
        unitName: u.unitName,
        creditPoints: u.creditPoints,
        totalAttempts: u.totalAttempts,
        uniqueStudents: u.students.size,
        passCount: u.passCount,
        failCount: u.failCount,
        failRate,
        passRate,
        repeatCount,
        isHighRisk: failRate >= 30,
        termTrend: termTrend.slice(-6),
        courseBreakdown: Object.entries(u.courseBreakdown).map(([code, counts]) => ({
          courseCode: code,
          pass: counts.pass,
          fail: counts.fail,
        })),
      };
    });

    // ── 5. Sort & slice ────────────────────────────────────────────────────
    const byFailRate = [...unitStats].sort((a, b) => b.failRate - a.failRate);
    const byFailCount = [...unitStats].sort((a, b) => b.failCount - a.failCount);
    const byRepeats = [...unitStats].sort((a, b) => b.repeatCount - a.repeatCount);
    const worstPerformingUnits = [...unitStats]
      .filter(u => u.failRate >= 30)
      .sort((a, b) => b.failRate - a.failRate);

    // ── 6. Overall summary ────────────────────────────────────────────────
    const totalAttempts = unitHistories.length;
    const totalFails = unitHistories.filter(h => isFail(h.Status)).length;
    const totalPasses = unitHistories.filter(h => isPass(h.Status)).length;
    const overallFailRate = (totalFails + totalPasses) > 0
      ? Math.round((totalFails / (totalFails + totalPasses)) * 100)
      : 0;

    // ── 7. Term-level trend (all units combined) ──────────────────────────
    const termOverall = {};
    for (const h of unitHistories) {
      const termName = h.Term?.Name || `${h.Year || 'Unknown'}`;
      if (!termOverall[termName]) termOverall[termName] = { pass: 0, fail: 0 };
      if (isFail(h.Status)) termOverall[termName].fail++;
      if (isPass(h.Status)) termOverall[termName].pass++;
    }

    // Calculate fail rate change
    let failRateChange = 0;
    const sortedTerms = Object.keys(termOverall).sort();
    if (sortedTerms.length >= 2) {
      const lastTerm = termOverall[sortedTerms[sortedTerms.length - 1]];
      const prevTerm = termOverall[sortedTerms[sortedTerms.length - 2]];
      const lastRate = (lastTerm.pass + lastTerm.fail) > 0 
        ? Math.round((lastTerm.fail / (lastTerm.pass + lastTerm.fail)) * 100) 
        : 0;
      const prevRate = (prevTerm.pass + prevTerm.fail) > 0 
        ? Math.round((prevTerm.fail / (prevTerm.pass + prevTerm.fail)) * 100) 
        : 0;
      failRateChange = lastRate - prevRate;
    }

    const overallTermTrend = Object.entries(termOverall)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([term, counts]) => {
        const total = counts.pass + counts.fail;
        return {
          term,
          pass: counts.pass,
          fail: counts.fail,
          total,
          failRate: total > 0 ? Math.round((counts.fail / total) * 100) : 0,
        };
      })
      .slice(-8);

    // ── 8. Get additional unit details from your Unit table ────────────────
    const unitDetails = await prisma.Unit.findMany({
      where: {
        ID: { in: unitStats.map(u => u.unitID) }
      },
      select: {
        ID: true,
        UnitCode: true,
        Name: true,
        CreditPoints: true,
        Availability: true,
        UnitTermOffered: {
          select: { TermType: true }
        }
      }
    });

    const unitDetailsMap = {};
    for (const ud of unitDetails) {
      unitDetailsMap[ud.ID] = ud;
    }

    // Merge additional details into unitStats
    const enrichedUnitStats = unitStats.map(stat => ({
      ...stat,
      availability: unitDetailsMap[stat.unitID]?.Availability || 'unknown',
      offeredTerms: unitDetailsMap[stat.unitID]?.UnitTermOffered?.map(t => t.TermType) || [],
    }));

    // Update sorted arrays with enriched data
    const enrichedByFailRate = [...enrichedUnitStats].sort((a, b) => b.failRate - a.failRate);
    const enrichedByFailCount = [...enrichedUnitStats].sort((a, b) => b.failCount - a.failCount);
    const enrichedByRepeats = [...enrichedUnitStats].sort((a, b) => b.repeatCount - a.repeatCount);
    const enrichedWorstPerforming = enrichedUnitStats
      .filter(u => u.failRate >= 30)
      .sort((a, b) => b.failRate - a.failRate);

    // ── 9. Return response ────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalUnits: unitStats.length,
          totalAttempts,
          totalFails,
          totalPasses,
          overallFailRate,
          highRiskUnitCount: unitStats.filter(u => u.failRate >= 30).length,
          criticalUnitCount: unitStats.filter(u => u.failRate >= 50).length,
          failRateChange,
        },
        topByFailRate: enrichedByFailRate.slice(0, 20),
        topByFailCount: enrichedByFailCount.slice(0, 20),
        topByRepeats: enrichedByRepeats.slice(0, 20),
        worstPerformingUnits: enrichedWorstPerforming.slice(0, 20),
        termTrend: overallTermTrend,
        allUnits: enrichedUnitStats.slice(0, 100),
      },
    });

  } catch (error) {
    console.error("Unit analytics error:", error);
    return NextResponse.json(
      { 
        success: false, 
        message: "Failed to load unit analytics", 
        error: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}