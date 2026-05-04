import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import { TokenValidation } from "@app/api/api_helper";

const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:1b';

const SYSTEM_PROMPT = `
You are a helpful ACADEMIC ADVISOR AI ASSISTANT for a university student study planner system.

Your role is to assist advisors, faculty, and administrators with any questions about students, courses, units, and academic progress.

---

## WHAT YOU CAN DO

You have access to student graduation data including:

- **graduationStats** – Overall counts (total students, eligible, at-risk, overdue, on-track, graduation rate, average completion)
- **eligibleStudents** – Students who have met credit requirements and are active
- **atRiskStudents** – Students behind schedule (low completion %, multiple failures, or inactive)
- **overdueStudents** – Students who have exceeded maximum study duration
- **topFailedUnits** – Units with the highest failure rates
- **specificStudentDetail** – If the user asks about a particular student by ID or name

---

## YOUR CAPABILITIES

You can answer questions about:

1. **Graduation & Eligibility** – Who is ready, what's blocking them, requirements
2. **Student Progress** – Individual student status, credit completion, at-risk flags
3. **Course & Unit Analysis** – Which units are failed most, which courses have issues
4. **Comparisons & Rankings** – Best/worst performing students, course comparisons
5. **Trends & Summaries** – Overall health of the cohort, semester comparisons
6. **General Academic Questions** – Explain policies, suggest interventions, recommend next steps

**You are NOT limited to just graduation questions.** If someone asks about a specific student, unit performance, or general academic advice — answer naturally using the available data.

---

## DATA RULES

- Use ONLY the data provided in the context — never invent numbers
- If data is missing for something asked, say: "I don't have that data in the system yet"
- Be specific: include student IDs, names, unit codes, percentages when available
- Keep responses clear, actionable, and helpful for academic staff

---

## RESPONSE STYLE

- Friendly and professional
- Use bullet points for lists
- Bold important numbers or names
- Offer follow-up suggestions when appropriate
- If a question is vague, ask for clarification (e.g., "Which student do you mean?")

---

## EXAMPLES OF QUESTIONS YOU CAN ANSWER

| Question Type | Example |
|---------------|---------|
| Eligibility | "Who can graduate this semester?" |
| At-risk | "Show me students falling behind" |
| Specific student | "Tell me about student 12345" or "What's John's status?" |
| Failed units | "Which courses fail the most students?" |
| Comparisons | "Who has the highest completion percentage?" |
| Overdue | "Which students took too long to finish?" |
| Recommendations | "What should I tell my at-risk advisees?" |
| Counting | "How many students are active right now?" |
| Blockers | "Why can't Maria graduate yet?" |
| Progress | "Show me credit completion by major" |

---

Remember: You are a smart, flexible academic advisor. Help the user with whatever they need related to student academic progress.
`;

// The rest of your code remains EXACTLY the same from here down
// (GRADUATION_REGEX, isOllamaAvailable, callOllama, buildGraduationContext, POST)

const GRADUATION_REGEX = /(graduat|eligible|eligibility|on.?track|behind|complet|credit|finish|final.?year|semester.?left|duration|requirements|qualify|qualified|ready.?to|slow|delay|overdue|behind.?schedule|progress|how.?many.?student|at.?risk|student\s+\w+|tell me about|show me|what is|who is|compare|versus|highest|lowest|average|total|count|list|units?|course|major)/i;

// =========================
// CHECK OLLAMA
// =========================
async function isOllamaAvailable() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.models?.some(m => m.name.includes(OLLAMA_MODEL.split(':')[0]));
  } catch {
    return false;
  }
}

// =========================
// CALL OLLAMA
// =========================
async function callOllama(question, contextString, conversationHistory) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory.slice(-5).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    {
      role: 'user',
      content: `QUESTION: ${question}\n\nSTUDENT GRADUATION DATA:\n${contextString}\n\nAnswer the question naturally based on this data. If the user asks about a specific student, find them in the data. Be helpful and conversational.`,
    },
  ];

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      options: { temperature: 0.2, num_predict: 1200 },
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();
  return data.message?.content || null;
}

// =========================
// BUILD GRADUATION CONTEXT
// =========================
async function buildGraduationContext(question) {

  // ── 1. Fetch all students with course, major, intake ──────────────────────
  const students = await prisma.Student.findMany({
    include: {
      Course:       true,
      Major:        true,
      CourseIntake: true,
    },
  });

  // ── 2. Fetch unit history for failure tracking ────────────────────────────
  const unitHistories = await prisma.UnitHistory.findMany({
    include: {
      Unit: true,
      Term: true,
    },
    orderBy: { ID: 'desc' },
    take: 5000,
  });

  // Group by student
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

  // ── 3. Analyse each student ───────────────────────────────────────────────
  const summaries      = [];
  const eligible       = [];
  const atRisk         = [];
  const overdue        = [];
  const unitFailCounts = {};

  for (const s of students) {
    const creditsRequired  = s.Course?.CreditsRequired  ?? 0;
    const creditsCompleted = s.CreditCompleted           ?? 0;
    const mpuCompleted     = s.MPUCreditCompleted        ?? 0;
    const totalCompleted   = creditsCompleted + mpuCompleted;
    const creditsRemaining = Math.max(0, creditsRequired - totalCompleted);
    const completionPercent = creditsRequired > 0
      ? Math.round((totalCompleted / creditsRequired) * 100)
      : 0;

    const history      = historyByStudent[s.StudentID] || [];
    const failedUnits  = history.filter(h => isFail(h.Status));
    const failureCount = failedUnits.length;

    for (const f of failedUnits) {
      const code = f.Unit?.UnitCode || `Unit#${f.UnitID}`;
      unitFailCounts[code] = (unitFailCounts[code] || 0) + 1;
    }

    const isActive    = s.Status?.toLowerCase() === 'active';
    const isEligible  = creditsRequired > 0 && totalCompleted >= creditsRequired && isActive;
    const isStudentAtRisk = !isEligible && (
      completionPercent < 60 || failureCount >= 2 || !isActive
    );
    const isStudentOverdue = !isActive && !isEligible;

    const summary = {
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
      failedUnitCodes:  failedUnits.map(f => f.Unit?.UnitCode).filter(Boolean).slice(0, 5),
      isEligible,
      isAtRisk:         isStudentAtRisk,
      isOverdue:        isStudentOverdue,
    };

    summaries.push(summary);
    if (isEligible)        eligible.push(summary);
    if (isStudentAtRisk)   atRisk.push(summary);
    if (isStudentOverdue)  overdue.push(summary);
  }

  // ── 4. Top failed units ───────────────────────────────────────────────────
  const topFailedUnits = Object.entries(unitFailCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([code, count]) => ({ unitCode: code, failureCount: count }));

  // ── 5. Overall stats ──────────────────────────────────────────────────────
  const graduationStats = {
    totalStudents:  summaries.length,
    eligibleCount:  eligible.length,
    atRiskCount:    atRisk.length,
    overdueCount:   overdue.length,
    onTrackCount:   summaries.filter(
      s => s.completionPercent >= 60 && !s.isEligible && !s.isAtRisk
    ).length,
    onTimeRate: summaries.length > 0
      ? Math.round((eligible.length / summaries.length) * 100) + '%'
      : '0%',
    avgCompletion: summaries.length > 0
      ? Math.round(
          summaries.reduce((sum, s) => sum + s.completionPercent, 0) / summaries.length
        ) + '%'
      : '0%',
  };

  // ── 6. Specific student lookup from question ──────────────────────────────
  const specificMatch = question.match(/student\s+([A-Za-z0-9]+)/i);
  let specificStudent = null;
  if (specificMatch) {
    const query = specificMatch[1].toLowerCase();
    specificStudent = summaries.find(s =>
      String(s.studentID).includes(query) ||
      s.name?.toLowerCase().includes(query)
    ) || null;
  }

  return {
    graduationStats,
    eligibleStudents: eligible.slice(0, 30),
    atRiskStudents:   atRisk.slice(0, 30),
    overdueStudents:  overdue.slice(0, 20),
    topFailedUnits,
    ...(specificStudent ? { specificStudentDetail: specificStudent } : {}),
  };
}

// =========================
// MAIN API
// =========================
export async function POST(req) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const isDevOverride =
      req.headers.get("x-dev-override") === "true" &&
      process.env.NEXT_PUBLIC_MODE === "DEV";

    if (!isDevOverride) {
      const authHeader = req.headers.get("Authorization");
      const token_res  = TokenValidation(authHeader);
      if (!token_res.success) {
        return NextResponse.json(
          { success: false, message: token_res.message },
          { status: token_res.status }
        );
      }
    }

    const { question, conversationHistory = [] } = await req.json();

    if (!question) {
      return NextResponse.json(
        { success: false, message: "Question required" },
        { status: 400 }
      );
    }

    // ── Guard ─────────────────────────────────────────────────────────────────
    // UPDATED: Now matches a wider range of questions, including "student info for X"
    if (!GRADUATION_REGEX.test(question)) {
      return NextResponse.json({
        success: true,
        answer: `I specialize in academic advising and student progress tracking. Try asking things like:\n\n📋 **Student Lookup**\n- "Tell me about student 12345"\n- "What's Joe's progress?"\n\n🎓 **Graduation**\n- "Which students are eligible to graduate?"\n- "Who is at risk of not graduating on time?"\n\n📊 **Unit Analysis**\n- "Which units are most commonly failed?"\n- "What's blocking students from finishing?"\n\n📈 **Statistics**\n- "What's the graduation rate?"\n- "How many students are on track?"`,
        source: 'system',
      });
    }

    // ── Build context ─────────────────────────────────────────────────────────
    const context = await buildGraduationContext(question);

    if (context.graduationStats.totalStudents === 0) {
      return NextResponse.json({
        success: true,
        answer: "No student data found in the system.",
        source: 'system',
      });
    }

    const contextString = JSON.stringify(context, null, 2);

    // ── Ollama ────────────────────────────────────────────────────────────────
    const ollamaAvailable = await isOllamaAvailable();
    if (!ollamaAvailable) {
      return NextResponse.json({
        success: true,
        answer: "⚠️ AI Assistant is still setting up. Please wait for the model to finish downloading, then try again.",
        source: 'none',
      });
    }

    let answer = null;
    try {
      console.log('[AI] Calling Ollama for query...');
      answer = await callOllama(question, contextString, conversationHistory);
      console.log('[AI] ✅ Ollama responded');
    } catch (err) {
      console.error('[AI] Ollama failed:', err.message);
    }

    if (!answer) {
      return NextResponse.json({
        success: true,
        answer: "⚠️ AI response timed out. Please try again.",
        source: 'none',
      });
    }

    return NextResponse.json({ success: true, answer, source: 'ollama' });

  } catch (error) {
    console.error("AI Assistant error:", error);
    return NextResponse.json(
      { success: false, message: "AI service failed", error: error.message },
      { status: 500 }
    );
  }
}