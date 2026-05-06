import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import { TokenValidation } from "@app/api/api_helper";

const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:1b';

const SYSTEM_PROMPT = `
You are a STUDY PLANNER AI ASSISTANT.

RULES:
- ONLY answer using provided data
- Be concise and helpful
- If a planner name is not found, list ALL available planner names
- For unit lists, show unit codes and credit points

Available planners will be provided in the data.
`;

// Helper to fetch units from database
async function fetchUnits() {
  const units = await prisma.Unit.findMany({
    select: {
      ID: true,
      UnitCode: true,
      Name: true,
      CreditPoints: true,
    },
    orderBy: { UnitCode: 'asc' },
    take: 500,
  });

  return units.map(u => ({
    id: u.ID,
    code: (u.UnitCode || '').trim(),
    name: u.Name || '',
    credits: u.CreditPoints || 0,
  }));
}

// Helper to fetch study planners with their units
async function fetchPlanners() {
  const planners = await prisma.StudyPlanner.findMany({
    include: {
      units: {
        select: {
          UnitCode: true,
          Name: true,
          CreditPoints: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return planners.map(p => ({
    name: p.name,
    id: p.id,
    units: p.units.map(u => ({
      code: (u.UnitCode || '').trim(),
      name: u.Name || '',
      credits: u.CreditPoints || 0,
    })),
    totalCredits: p.units.reduce((sum, u) => sum + (u.CreditPoints || 0), 0),
  }));
}

// ── Normalize "COS 30008" → "COS30008" anywhere in a string ──────────────────
function normalizeUnitCodes(str) {
  return str.replace(/([a-zA-Z]{2,4})\s+(\d{3,5})/g, '$1$2');
}
// ── Extract a single unit code from text ─────────────────────────────────────
function extractUnitCode(text) {
  if (!text) return null;
  // Normalize first to handle "COS 30008" -> "COS30008"
  const normalized = normalizeUnitCodes(text);
  const match = normalized.match(/[A-Z]{2,4}\d{3,5}/i);
  return match ? match[0].toUpperCase() : null;
}

// ── Extract multiple unit codes (for multi‑select) ───────────────────────────
function extractUnitCodes(text) {
  if (!text) return [];
  const normalized = normalizeUnitCodes(text);
  const matches = normalized.match(/[A-Z]{2,4}\d{3,5}/gi);
  if (!matches) return [];
  return matches.map(code => code.toUpperCase());
}

// ── Get last mentioned unit from conversation history ─────────────────────────
function getLastMentionedUnit(conversationHistory, currentQuestion) {
  let code = extractUnitCode(currentQuestion);
  if (code) return code;
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const msg = conversationHistory[i];
    if (msg.role === 'assistant' && msg.content) {
      code = extractUnitCode(msg.content);
      if (code) return code;
    }
  }
  return null;
}
function detectIntent(raw) {
  const q = normalizeUnitCodes(raw).toLowerCase();
  if ((q.includes("does not contain") || q.includes("doesn't contain") || 
       q.includes("exclude") || q.includes("missing") || q.includes("not in")) && 
      (q.includes("unit") || extractUnitCode(q))) {
    return "exclude_unit";
  }
  // ── List all planners ────────────────────────────────────────────────────
  // Only trigger when NOT also searching for a unit name/code
  const hasUnitCode = !!q.match(/[a-z]{2,4}\d{3,5}/i);
  const isSearchingUnit =
    q.includes("have") || q.includes("has") || q.includes("contain") ||
    q.includes("find") || q.includes("search") || q.includes("which planner");

  if (
    !hasUnitCode && !isSearchingUnit &&
    (q.includes("list all") || q.includes("show all") ||
     (q.includes("all") && q.includes("planner")) ||
     (q.includes("list") && q.includes("planner") && !q.includes("unit")))
  ) {
    return "list_all";
  }

  // ── Compare planners ─────────────────────────────────────────────────────
  if (q.includes("compare")) return "compare";

  // ── Most credits / units ─────────────────────────────────────────────────
  if (q.includes("most credits")) return "most_credits";
  if (q.includes("most units"))   return "most_units";

  // ── Credits for a specific planner ───────────────────────────────────────
  if ((q.includes("total credit") || q.includes("how many credits")) && !q.includes("most")) {
    return "credits";
  }

  // ── List units inside a named planner ────────────────────────────────────
  if (q.includes("what units") || q.includes("list units") || q.includes("units in")) {
    return "list_units";
  }

  // ── Find by unit CODE ────────────────────────────────────────────────────
  // Triggered by: code pattern present + any search-like keyword OR just a bare code
  if (hasUnitCode) {
    const searchKeywords =
      q.includes("find") || q.includes("contain") || q.includes("search") ||
      q.includes("which planner") || q.includes("have") || q.includes("has") ||
      q.includes("show") || q.includes("what planner") || q.includes("in which");
    if (searchKeywords || q.match(/^[a-z]{2,4}\d{3,5}/i)) {
      return "find_unit";
    }
  }

  // ── Find by unit NAME ────────────────────────────────────────────────────
  // Triggered when user asks about planners but supplies a name instead of a code
  if (
    q.includes("which planner") || q.includes("what planner") ||
    ((q.includes("have") || q.includes("has") || q.includes("contain")) &&
     (q.includes("planner") || q.includes("unit"))) ||
    (q.includes("find") && !hasUnitCode) ||
    ((q.includes("list") || q.includes("show")) && q.includes("with") && !hasUnitCode)
  ) {
    return "find_by_name";
  }

  return "ai";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findPlanner(planners, question) {
  const q = question.toLowerCase();

  // Exact name match
  let found = planners.find(p => q.includes(p.name.toLowerCase()));
  if (found) return found;

  // Partial word match
  found = planners.find(p => {
    const parts = p.name.toLowerCase().split(/[\s\-_]+/);
    return parts.some(part => part.length > 2 && q.includes(part));
  });
  return found || null;
}

function handleListAll(planners) {
  if (!planners.length) return "No study planners found.";

  let response = "**📋 Available Study Planners:**\n";
  planners.forEach(p => {
    response += `• **${p.name}**\n`;
    response += `   • Units: ${p.units.length}\n`;
    response += `   • Total Credits: ${p.totalCredits}\n`;
  });
  response += `**Total:** ${planners.length} planners`;
  return response;
}

function handleListUnits(planners, question) {
  const planner = findPlanner(planners, question);
  if (!planner) {
    const names = planners.map(p => `"${p.name}"`).join(", ");
    return `Planner not found. Available planners: ${names}`;
  }
  if (!planner.units.length) {
    return `"${planner.name}" has no units assigned yet.`;
  }

  let response = `**Units in "${planner.name}" (${planner.units.length} units, ${planner.totalCredits} credits):**\n\n`;
  planner.units.forEach(u => {
    response += `• **${u.code}** - ${u.name || 'No name'} (${u.credits || 0} credits)\n`;
  });
  return response;
}

function handleCredits(planners, question) {
  const planner = findPlanner(planners, question);
  if (!planner) {
    const names = planners.map(p => `"${p.name}"`).join(", ");
    return `Planner not found. Available planners: ${names}`;
  }
  return `**${planner.name}** has **${planner.totalCredits}** total credits across ${planner.units.length} units.`;
}

function handleCompare(planners, question) {
  const q = question.toLowerCase();
  const found = planners.filter(p => q.includes(p.name.toLowerCase()));

  if (found.length < 2) {
    const names = planners.map(p => `"${p.name}"`).join(", ");
    return `Please specify two planners to compare.\n\nAvailable planners: ${names}\n\nExample: "Compare 23-Feb-CSCS and 23-Feb-CSDS"`;
  }

  const [a, b] = found;
  const aSet = new Set(a.units.map(u => u.code));
  const bSet = new Set(b.units.map(u => u.code));

  const onlyA  = [...aSet].filter(x => !bSet.has(x));
  const onlyB  = [...bSet].filter(x => !aSet.has(x));
  const common = [...aSet].filter(x =>  bSet.has(x));

  let response = `**${a.name} vs ${b.name}**\n\n`;
  response += `**Units only in ${a.name}:** ${onlyA.length ? onlyA.map(u => '`' + u + '`').join(", ") : "None"}\n\n`;
  response += `**Units only in ${b.name}:** ${onlyB.length ? onlyB.map(u => '`' + u + '`').join(", ") : "None"}\n\n`;
  response += `**Common units:** ${common.length ? common.map(u => '`' + u + '`').join(", ") : "None"}\n\n`;
  response += `**Total Credits:**\n- ${a.name}: ${a.totalCredits} credits\n- ${b.name}: ${b.totalCredits} credits\n\n`;
  response += `**Unit Counts:**\n- ${a.name}: ${a.units.length} units\n- ${b.name}: ${b.units.length} units`;
  return response;
}

function handleMostCredits(planners) {
  if (!planners.length) return "No study planners found.";
  const top = [...planners].sort((a, b) => b.totalCredits - a.totalCredits)[0];
  return `**🏆 ${top.name}** has the most credits with **${top.totalCredits}** credits across ${top.units.length} units.`;
}

function handleMostUnits(planners) {
  if (!planners.length) return "No study planners found.";
  const top = [...planners].sort((a, b) => b.units.length - a.units.length)[0];
  return `**🏆 ${top.name}** has the most units with **${top.units.length}** units totaling ${top.totalCredits} credits.`;
}

function handleFindUnit(planners, question, units) {
  const normalizedQ = normalizeUnitCodes(question);
  const unitMatch   = normalizedQ.match(/[A-Z]{2,4}\d{3,5}/i);

  if (!unitMatch) {
    return "Please specify a unit code (e.g., CSC101, ENG10004, COS30008).";
  }

  const unitCode = unitMatch[0].toUpperCase().trim();

  // .trim() on every comparison to guard against DB whitespace
  const unitDetails   = units.find(u => u.code.toUpperCase().trim() === unitCode);
  const foundPlanners = planners.filter(p =>
    p.units.some(u => u.code.toUpperCase().trim() === unitCode)
  );

  if (!foundPlanners.length) {
    // Helpful fallback: show similar codes from the same prefix
    const similar = units
      .filter(u => u.code.toUpperCase().trim().startsWith(unitCode.slice(0, 3)))
      .slice(0, 5)
      .map(u => `\`${u.code}\``);
    const hint = similar.length
      ? `\n\nSimilar units in the database: ${similar.join(", ")}`
      : "";
    return `Unit **${unitCode}** was not found in any study planner.${hint}`;
  }

  let response = `**Unit ${unitCode}**`;
  if (unitDetails?.name)    response += ` - ${unitDetails.name}`;
  if (unitDetails?.credits) response += ` (${unitDetails.credits} credits)`;
  response += `\n\nFound in **${foundPlanners.length}** planner(s):\n\n`;
  foundPlanners.forEach(p => { response += `• **${p.name}**\n`; });
  return response;
}
function handleExcludeUnit(planners, units, unitCode) {
  if (!unitCode) {
    return "Please specify a unit code (e.g., CSC101, COS30008, TNE30009)";
  }
  
  const unitDetails = units.find(u => u.code.toUpperCase() === unitCode);
  const plannersThatContain = planners.filter(p => 
    p.units.some(u => u.code.toUpperCase() === unitCode)
  );
  const plannersThatDoNotContain = planners.filter(p => 
    !p.units.some(u => u.code.toUpperCase() === unitCode)
  );
  
  if (plannersThatDoNotContain.length === 0) {
    return `Unit **${unitCode}** is in EVERY planner. No planner excludes it.`;
  }
  
  let response = `**Unit ${unitCode}**`;
  if (unitDetails?.name) response += ` - ${unitDetails.name}`;
  if (unitDetails?.credits) response += ` (${unitDetails.credits} credits)`;
  response += `\n\n**NOT** found in ${plannersThatDoNotContain.length} planner(s):\n\n`;
  
  plannersThatDoNotContain.forEach((p, idx) => {
    response += `${idx + 1}. **${p.name}**\n`;
  });
  
  response += `\n\n*Total planners: ${planners.length} | Contains: ${plannersThatContain.length} | Does NOT contain: ${plannersThatDoNotContain.length}*`;
  
  return response;
}

function handleFindByName(planners, question) {
  // Strip common filler words to isolate the actual search term
  const stopWords = /\b(which|what|list|all|planner|planners|find|show|have|has|contain|contains|the|unit|units|with|in|a|an|is|are|does|do)\b/gi;
  const searchTerm = question
    .replace(stopWords, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase();

  if (!searchTerm || searchTerm.length < 2) {
    return "Please provide a unit name or keyword to search for.\n\nExample: *\"which planners have Data Structures?\"*";
  }

  const found = planners.filter(p =>
    p.units.some(u =>
      (u.name && u.name.toLowerCase().includes(searchTerm)) ||
      u.code.toLowerCase().includes(searchTerm)
    )
  );

  if (!found.length) {
    return `No planners found containing a unit matching **"${searchTerm}"**.\n\nTry using the unit code instead (e.g., \`COS30008\`).`;
  }

  let response = `**Planners containing "${searchTerm}" (${found.length} found):**\n\n`;
  found.forEach(p => {
    // Show every matched unit within that planner
    const matchedUnits = p.units.filter(u =>
      (u.name && u.name.toLowerCase().includes(searchTerm)) ||
      u.code.toLowerCase().includes(searchTerm)
    );
    const unitList = matchedUnits.map(u => `\`${u.code}\` ${u.name}`).join(", ");
    response += `• **${p.name}** — ${unitList}\n`;
  });
  return response;
}

// ── Ollama fallback ───────────────────────────────────────────────────────────
async function callOllama(question, planners) {
  try {
    const compactData = {
      totalPlanners: planners.length,
      plannerNames:  planners.map(p => p.name),
      planners: planners.slice(0, 10).map(p => ({
        name:         p.name,
        unitCount:    p.units.length,
        totalCredits: p.totalCredits,
        unitCodes:    p.units.slice(0, 15).map(u => u.code),
      })),
    };

    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: `QUESTION: ${question}\n\nDATA:\n${JSON.stringify(compactData, null, 2)}` },
        ],
        stream: false,
        options: { temperature: 0.2, num_predict: 500 },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.message?.content || null;
  } catch (err) {
    console.error("Ollama call failed:", err.message);
    return null;
  }
}

// ==================== GET endpoint for units and planners ====================
export async function GET(req) {
  try {
    const url  = new URL(req.url);
    const type = url.searchParams.get('type');

    if (type === 'units') {
      const units = await fetchUnits();
      return NextResponse.json({ success: true, data: units });
    }

    if (type === 'planners') {
      const planners = await fetchPlanners();
      return NextResponse.json({ success: true, data: planners });
    }

    return NextResponse.json(
      { success: false, message: "Specify type=units or type=planners" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Planner AI GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// ==================== MAIN POST ====================
export async function POST(req) {
  try {
    const isDevOverride =
      req.headers.get("x-dev-override") === "true" &&
      process.env.NEXT_PUBLIC_MODE === "DEV";

    if (!isDevOverride) {
      const authHeader  = req.headers.get("Authorization");
      const token_res   = TokenValidation(authHeader);
      if (!token_res.success) {
        return NextResponse.json(
          { success: false, message: token_res.message },
          { status: token_res.status }
        );
      }
    }

    const { question } = await req.json();

    if (!question?.trim()) {
      return NextResponse.json(
        { success: false, message: "Question required" },
        { status: 400 }
      );
    }

    // Fetch fresh data on every request
    const [planners, units] = await Promise.all([fetchPlanners(), fetchUnits()]);

    if (!planners.length) {
      return NextResponse.json({
        success: true,
        answer:  "No study planners found. Please create a study planner first.",
        source:  "system",
      });
    }

    const intent = detectIntent(question);
    let answer;
    let source = "system";

    switch (intent) {
      case "list_all":      answer = handleListAll(planners);                    break;
      case "list_units":    answer = handleListUnits(planners, question);        break;
      case "credits":       answer = handleCredits(planners, question);          break;
      case "compare":       answer = handleCompare(planners, question);          break;
      case "most_credits":  answer = handleMostCredits(planners);                break;
      case "most_units":    answer = handleMostUnits(planners);                  break;
      case "find_unit":     answer = handleFindUnit(planners, question, units);  break;
      case "find_by_name":  answer = handleFindByName(planners, question);       break;
      case "exclude_unit":  answer = handleExcludeUnit(planners, units, extractUnitCode(question)); break;
      default:
        source = "ollama";
        answer = await callOllama(question, planners);
        if (!answer) {
          answer = "I'm having trouble processing your request. Please try rephrasing or use one of the suggestion buttons.";
        }
    }

    return NextResponse.json({ success: true, answer, source });

  } catch (error) {
    console.error("Planner AI error:", error);
    return NextResponse.json(
      { success: false, message: "AI service failed", error: error.message },
      { status: 500 }
    );
  }
}