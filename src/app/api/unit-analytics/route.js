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

    // ── 8. Graduation Speed (Time-to-Degree) ──────────────────────────────
    //
    // Compares each student's ACTUAL time spent on their course vs the
    // EXPECTED duration. Expected duration is taken from the MasterStudyPlanner
    // (count of distinct Years in SemesterInStudyPlannerYear) when available,
    // and falls back to CreditsRequired / STANDARD_CREDITS_PER_YEAR otherwise.
    //
    // Buckets:
    //   fast       → finished ≥ 0.25 yr earlier than expected
    //   onTime     → within ±0.25 yr of expected
    //   slow       → finished ≥ 0.25 yr later than expected
    //   inProgress → still studying (projected from current credit pace)
    //
    const STANDARD_CREDITS_PER_YEAR = 24;
    const FAST_THRESHOLD = -0.25;
    const SLOW_THRESHOLD = 0.25;

    const students = await prisma.Student.findMany({
      include: {
        Course: true,
        CourseIntake: {
          include: {
            Term: true,
            MasterStudyPlanner: {
              include: { SemesterInStudyPlannerYear: true },
            },
          },
        },
      },
    });

    // Group passed unit-history by student so we can find their last-passed term
    const passedHistoryByStudent = {};
    for (const h of unitHistories) {
      if (!isPass(h.Status)) continue;
      if (!h.Term) continue;
      if (!passedHistoryByStudent[h.StudentID]) passedHistoryByStudent[h.StudentID] = [];
      passedHistoryByStudent[h.StudentID].push(h);
    }

    // Convert a Term row into a fractional year (e.g., 2024 + (3-1)/12 = 2024.166)
    const termToFractionalYear = (term) => {
      if (!term || term.Year == null) return null;
      const month = term.Month ?? 1;
      return term.Year + (month - 1) / 12;
    };

    const studentSpeed = [];
    const speedBuckets = { fast: 0, onTime: 0, slow: 0, inProgress: 0 };
    const yearsDistribution = {}; // "3.0" → count (half-year bins)
    const speedByCourse = {};     // courseCode → aggregates

    for (const s of students) {
      const intakeTerm   = s.CourseIntake?.Term;
      const startYear    = termToFractionalYear(intakeTerm);
      const courseCode   = s.Course?.Code || 'Unknown';
      const courseName   = s.Course?.Name || courseCode;
      const creditsReq   = s.Course?.CreditsRequired || 0;
      const completed    = (s.CreditCompleted || 0) + (s.MPUCreditCompleted || 0);

      // ── Expected duration (planner first, credits-based fallback) ──
      let expectedYears = null;
      const planners = s.CourseIntake?.MasterStudyPlanner || [];
      for (const p of planners) {
        const distinctYears = new Set(
          (p.SemesterInStudyPlannerYear || []).map(sy => sy.Year)
        );
        if (distinctYears.size > 0) {
          expectedYears = Math.max(expectedYears || 0, distinctYears.size);
        }
      }
      if (!expectedYears && creditsReq > 0) {
        expectedYears = creditsReq / STANDARD_CREDITS_PER_YEAR;
      }
      if (!expectedYears) continue;

      // ── Actual or projected duration ──
      const status = (s.Status || '').toLowerCase();
      const hasGraduated = status === 'graduated' ||
        (creditsReq > 0 && completed >= creditsReq);

      let actualYears = null;
      let isInProgress = false;

      if (hasGraduated && passedHistoryByStudent[s.StudentID]?.length && startYear !== null) {
        let latestFy = -Infinity;
        for (const h of passedHistoryByStudent[s.StudentID]) {
          const fy = termToFractionalYear(h.Term);
          if (fy !== null && fy > latestFy) latestFy = fy;
        }
        if (latestFy !== -Infinity) {
          // add ~1/3 year so the last term counts as a completed term, not its start
          actualYears = (latestFy - startYear) + (1 / 3);
        }
      } else if (startYear !== null && creditsReq > 0 && completed > 0) {
        // Project: use credits-per-year pace to estimate total years needed
        let latestFy = startYear;
        for (const h of passedHistoryByStudent[s.StudentID] || []) {
          const fy = termToFractionalYear(h.Term);
          if (fy !== null && fy > latestFy) latestFy = fy;
        }
        const yearsElapsed = Math.max(0.5, (latestFy - startYear) + (1 / 3));
        const paceCpPerYear = completed / yearsElapsed;
        actualYears = creditsReq / Math.max(paceCpPerYear, 1);
        isInProgress = true;
      }

      if (actualYears == null || actualYears <= 0) {
        speedBuckets.inProgress++;
        continue;
      }

      const delta = actualYears - expectedYears;
      const speedRatio = expectedYears / actualYears;

      let bucket;
      if (isInProgress) {
        bucket = 'inProgress';
      } else if (delta <= FAST_THRESHOLD) {
        bucket = 'fast';
      } else if (delta >= SLOW_THRESHOLD) {
        bucket = 'slow';
      } else {
        bucket = 'onTime';
      }
      speedBuckets[bucket]++;

      // Histogram bins (half-year), only for finished students
      if (!isInProgress) {
        const binKey = (Math.round(actualYears * 2) / 2).toFixed(1);
        yearsDistribution[binKey] = (yearsDistribution[binKey] || 0) + 1;
      }

      if (!speedByCourse[courseCode]) {
        speedByCourse[courseCode] = {
          courseCode, courseName,
          total: 0, expectedSum: 0, actualSum: 0,
          fast: 0, onTime: 0, slow: 0, inProgress: 0,
        };
      }
      const c = speedByCourse[courseCode];
      c.total++;
      c.expectedSum += expectedYears;
      c.actualSum   += actualYears;
      c[bucket]++;

      studentSpeed.push({
        studentID:     s.StudentID,
        name:          s.FirstName || `Student ${s.StudentID}`,
        courseCode,
        courseName,
        expectedYears: Number(expectedYears.toFixed(2)),
        actualYears:   Number(actualYears.toFixed(2)),
        deltaYears:    Number(delta.toFixed(2)),
        speedRatio:    Number(speedRatio.toFixed(2)),
        bucket,
        isInProgress,
        status:        s.Status || 'Unknown',
      });
    }

    const courseSpeedStats = Object.values(speedByCourse).map(c => ({
      courseCode:       c.courseCode,
      courseName:       c.courseName,
      total:            c.total,
      avgExpectedYears: c.total > 0 ? Number((c.expectedSum / c.total).toFixed(2)) : 0,
      avgActualYears:   c.total > 0 ? Number((c.actualSum / c.total).toFixed(2)) : 0,
      avgDelta:         c.total > 0 ? Number(((c.actualSum - c.expectedSum) / c.total).toFixed(2)) : 0,
      fast:             c.fast,
      onTime:           c.onTime,
      slow:             c.slow,
    })).sort((a, b) => b.avgDelta - a.avgDelta);

    const finishedStudents = studentSpeed.filter(s => !s.isInProgress);
    const totalClassified  = speedBuckets.fast + speedBuckets.onTime + speedBuckets.slow;

    const avgActualYears = finishedStudents.length > 0
      ? Number((finishedStudents.reduce((sum, s) => sum + s.actualYears, 0) / finishedStudents.length).toFixed(2))
      : 0;
    const avgExpectedYears = finishedStudents.length > 0
      ? Number((finishedStudents.reduce((sum, s) => sum + s.expectedYears, 0) / finishedStudents.length).toFixed(2))
      : 0;

    const slowestStudents = finishedStudents
      .filter(s => s.bucket === 'slow')
      .sort((a, b) => b.deltaYears - a.deltaYears)
      .slice(0, 20);

    const fastestStudents = finishedStudents
      .filter(s => s.bucket === 'fast')
      .sort((a, b) => a.deltaYears - b.deltaYears)
      .slice(0, 20);

    const yearsDistributionChart = Object.entries(yearsDistribution)
      .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
      .map(([years, count]) => ({ years, count }));

    const graduationSpeed = {
      summary: {
        classified:       totalClassified,
        inProgress:       speedBuckets.inProgress,
        fast:             speedBuckets.fast,
        onTime:           speedBuckets.onTime,
        slow:             speedBuckets.slow,
        avgExpectedYears,
        avgActualYears,
        avgDelta:         Number((avgActualYears - avgExpectedYears).toFixed(2)),
        onTimePercent:    totalClassified > 0 ? Math.round((speedBuckets.onTime / totalClassified) * 100) : 0,
        fastPercent:      totalClassified > 0 ? Math.round((speedBuckets.fast    / totalClassified) * 100) : 0,
        slowPercent:      totalClassified > 0 ? Math.round((speedBuckets.slow    / totalClassified) * 100) : 0,
      },
      yearsDistribution: yearsDistributionChart,
      courseSpeedStats,
      slowestStudents,
      fastestStudents,
    };

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
        graduationSpeed,
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