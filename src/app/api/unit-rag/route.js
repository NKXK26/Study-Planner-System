import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:1b';

// ─── Text similarity scorer (RAG retrieval fallback) ──────────────────────────
function similarityScore(query, target) {
    const qWords = new Set(query.toLowerCase().split(/\s+/).filter(Boolean));
    const tWords = new Set(target.toLowerCase().split(/\s+/).filter(Boolean));
    let intersection = 0;
    for (const w of qWords) if (tWords.has(w)) intersection++;
    const union = qWords.size + tWords.size - intersection;
    return union === 0 ? 0 : Math.round((intersection / union) * 100);
}

// ─── Extract discipline prefix e.g. "CSC12345" → "CSC" ───────────────────────
function codePrefix(code = '') {
    const m = code.match(/^([A-Z]+)/i);
    return m ? m[1].toUpperCase() : '';
}

// ─── Score a DB unit against the missing unit query ───────────────────────────
function scoreCandidate(unit, missingUnit) {
    const queryText = `${missingUnit.code} ${missingUnit.name || ''}`.trim();
    const targetText = `${unit.UnitCode} ${unit.Name}`;
    let score = similarityScore(queryText, targetText);

    // Boost same discipline prefix (e.g. both CSC)
    if (codePrefix(missingUnit.code) === codePrefix(unit.UnitCode)) score += 15;

    // Boost same credit points
    if (missingUnit.creditPoints && unit.CreditPoints === missingUnit.creditPoints) score += 5;

    return Math.min(100, score);
}

// ─── Robustly extract a JSON object from LLM output ──────────────────────────
// Handles: plain JSON, ```json fences, text before/after the object
function extractJson(raw = '') {
    // Strip markdown fences
    const stripped = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    // Try full parse first
    try { return JSON.parse(stripped); } catch { }

    // Extract first {...} block (greedy, handles nested braces)
    let depth = 0, start = -1;
    for (let i = 0; i < stripped.length; i++) {
        if (stripped[i] === '{') { if (depth === 0) start = i; depth++; }
        else if (stripped[i] === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
                try { return JSON.parse(stripped.slice(start, i + 1)); } catch { }
            }
        }
    }
    return null;
}

// ─── POST /api/unit-rag ───────────────────────────────────────────────────────
export async function POST(request) {
    const startTime = Date.now();

    try {
        const { missingUnit, intakeYear, currentSem } = await request.json();
        console.log(`[unit-rag] ▶ ${missingUnit?.code} | intake ${intakeYear} | ${currentSem}`);

        if (!missingUnit?.code) {
            return NextResponse.json({ success: false, message: 'Missing unit code.' }, { status: 400 });
        }

        // ── 1. Fetch published units from DB ──────────────────────────────────────
        const allUnits = await prisma.unit.findMany({
            where: { Availability: 'published' },
            select: { ID: true, UnitCode: true, Name: true, CreditPoints: true },
            take: 500,
        });

        console.log(`[unit-rag] DB returned ${allUnits.length} published units`);

        if (allUnits.length === 0) {
            return NextResponse.json({
                success: true, suggestions: [], noMatchFound: true,
                reasoning: 'No published units in the database.',
                meta: { totalUnitsScanned: 0, candidatesRetrieved: 0, model: OLLAMA_MODEL },
            });
        }

        // ── 2. Score & retrieve top candidates (RAG retrieval step) ───────────────
        const scored = allUnits
            .filter(unit => unit.UnitCode !== missingUnit.code) // ← ADD THIS LINE
            .map(unit => ({ unit, score: scoreCandidate(unit, missingUnit) }))
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);

        console.log(`[unit-rag] Top candidates: ${scored.map(c => `${c.unit.UnitCode}(${c.score})`).join(', ')}`);

        // ── 3. Call Ollama /api/chat ───────────────────────────────────────────────
        // NOTE: We do NOT do a /api/tags preflight — it has its own timeout and
        // causes a 2-second failure window that kills requests before the model call.
        // If Ollama is unreachable the fetch below will simply throw and we fall back.

        const systemPrompt =
            `You are a university academic advisor. Your job is to find equivalent replacement units.
You MUST ONLY suggest units from the provided list — never invent codes or names.
Respond ONLY with valid JSON (no markdown fences, no explanation text before or after).`;

        const userPrompt =
            `A student from the ${intakeYear ?? 'unknown'} intake is missing this unit:
Code: ${missingUnit.code}
Name: ${missingUnit.name || missingUnit.code}
Credit points: ${missingUnit.creditPoints ?? 'unknown'}
${currentSem ? `Current semester: ${currentSem}` : ''}

Suggest up to 3 equivalents from the list below. Use ONLY units in this list.

AVAILABLE UNITS:
${scored.map((c, i) => `${i + 1}. ${c.unit.UnitCode} — ${c.unit.Name} (${c.unit.CreditPoints ?? '?'} CP)`).join('\n')}

Respond ONLY with this JSON (no other text):
{
  "suggestions": [
    { "code": "UNITCODE", "name": "Unit Name", "creditPoints": 12.5, "matchScore": 85, "reason": "Why it matches", "caveats": "Any warnings or null" }
  ],
  "reasoning": "One sentence summary for the lecturer"
}`;

        let ollamaSuccess = false;
        let aiSuggestions = [];
        let aiReasoning = null;
        let ollamaError = null;

        try {
            const controller = new AbortController();
            // 90s — llama3.2:3b on CPU can be slow on first load
            const timeoutId = setTimeout(() => controller.abort(), 90_000);

            console.log(`[unit-rag] Calling Ollama ${OLLAMA_URL}/api/chat model=${OLLAMA_MODEL}`);

            const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    model: OLLAMA_MODEL,
                    stream: false,
                    options: { temperature: 0.15, num_predict: 600 },
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                }),
            });
            clearTimeout(timeoutId);

            if (!ollamaRes.ok) {
                const errBody = await ollamaRes.text().catch(() => '');
                ollamaError = `HTTP ${ollamaRes.status}: ${errBody.slice(0, 300)}`;
                console.error(`[unit-rag] Ollama HTTP error: ${ollamaError}`);
            } else {
                const data = await ollamaRes.json();
                // /api/chat returns { message: { content: "..." } }
                const rawContent = data?.message?.content || '';
                console.log(`[unit-rag] Raw LLM output (first 400 chars): ${rawContent.slice(0, 400)}`);

                const parsed = extractJson(rawContent);
                if (!parsed) {
                    ollamaError = `Could not extract JSON from: ${rawContent.slice(0, 200)}`;
                    console.error(`[unit-rag] JSON extraction failed`);
                } else if (!Array.isArray(parsed.suggestions) || parsed.suggestions.length === 0) {
                    ollamaError = 'LLM returned empty suggestions array';
                    console.warn(`[unit-rag] ${ollamaError}`);
                } else {
                    // ── Ground-truth validation: strip hallucinated unit codes ──────────
                    const validCodes = new Set(scored.map(c => c.unit.UnitCode.toUpperCase()));
                    const validated = parsed.suggestions.filter(s => {
                        const exists = validCodes.has((s.code || '').toUpperCase());
                        if (!exists) console.warn(`[unit-rag] Hallucinated unit removed: ${s.code}`);
                        return exists;
                    });

                    if (validated.length === 0) {
                        ollamaError = 'All LLM suggestions were hallucinated and removed';
                        console.warn(`[unit-rag] ${ollamaError}`);
                    } else {
                        aiSuggestions = validated;
                        aiReasoning = parsed.reasoning ?? null;
                        ollamaSuccess = true;
                        console.log(`[unit-rag] ✓ Ollama success — ${aiSuggestions.length} validated suggestion(s) in ${Date.now() - startTime}ms`);
                    }
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                ollamaError = 'Ollama timed out after 90 seconds. Model may be loading — try again shortly.';
            } else {
                ollamaError = `${err.name}: ${err.message}`;
            }
            console.error(`[unit-rag] Ollama exception: ${ollamaError}`);
        }

        const elapsed = Date.now() - startTime;

        // ── 4. Return AI result OR similarity-based fallback ──────────────────────
        if (ollamaSuccess && aiSuggestions.length > 0) {
            return NextResponse.json({
                success: true,
                suggestions: aiSuggestions,
                reasoning: aiReasoning,
                noMatchFound: false,
                meta: {
                    model: OLLAMA_MODEL,
                    totalUnitsScanned: allUnits.length,
                    candidatesRetrieved: scored.length,
                    elapsedMs: elapsed,
                    source: 'ollama',
                },
            });
        }

        // Fallback: return similarity scores with a clear notice
        console.log(`[unit-rag] Using similarity fallback — Ollama error: ${ollamaError}`);
        const fallback = scored.slice(0, 5).map(c => ({
            code: c.unit.UnitCode,
            name: c.unit.Name,
            creditPoints: c.unit.CreditPoints,
            matchScore: c.score,
            reason: `Similarity match (${c.score}%) based on unit code and name.`,
            caveats: 'AI advisor unreachable — please verify equivalence with the program coordinator.',
        }));

        return NextResponse.json({
            success: true,
            suggestions: fallback,
            reasoning: `AI unavailable (${ollamaError ?? 'unknown error'}). Showing similarity-based results from the database.`,
            noMatchFound: fallback.length === 0,
            meta: {
                model: 'similarity-only',
                totalUnitsScanned: allUnits.length,
                candidatesRetrieved: scored.length,
                elapsedMs: elapsed,
                source: 'fallback',
                ollamaError,
            },
        });

    } catch (error) {
        console.error('[unit-rag] Unhandled error:', error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}