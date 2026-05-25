import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper: simple text similarity (word overlap)
function similarityScore(query, target) {
  const qWords = new Set(query.toLowerCase().split(/\s+/));
  const tWords = new Set(target.toLowerCase().split(/\s+/));
  let intersection = 0;
  for (let w of qWords) if (tWords.has(w)) intersection++;
  const union = qWords.size + tWords.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export async function POST(request) {
  try {
    const { oldUnitCode, oldUnitName } = await request.json();

    if (!oldUnitCode && !oldUnitName) {
      return NextResponse.json(
        { success: false, message: 'Provide at least unit code or name' },
        { status: 400 }
      );
    }

    // ----- 1. Retrieve all published units from DB (RAG context) -----
    const allUnits = await prisma.unit.findMany({
      where: { Availability: 'published' },
      select: {
        ID: true,
        UnitCode: true,
        Name: true,
        CreditPoints: true,
        Availability: true,
      },
      take: 1000, // limit for performance
    });

    if (!allUnits.length) {
      return NextResponse.json({
        success: true,
        suggestions: [],
        message: 'No published units found in database',
      });
    }

    // ----- 2. Rank candidates by similarity to the old unit -----
    const queryText = `${oldUnitCode || ''} ${oldUnitName || ''}`.trim();
    const candidates = allUnits
      .map(unit => {
        const targetText = `${unit.UnitCode} ${unit.Name}`;
        let score = similarityScore(queryText, targetText);
        // Bonus if code prefixes match (e.g., COMP1xxx vs COMP2xxx)
        if (oldUnitCode && unit.UnitCode) {
          const oldPrefix = oldUnitCode.slice(0, 3);
          const newPrefix = unit.UnitCode.slice(0, 3);
          if (oldPrefix === newPrefix) score += 0.2;
        }
        return { unit, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10) // top 10 candidates
      .map(c => c.unit);

    // ----- 3. Build prompt for Ollama (with real unit data) -----
    const prompt = `
You are a university curriculum advisor. A unit has been removed or renamed from the study planner.
Old unit: ${oldUnitCode} - ${oldUnitName || '(no name given)'}

Below is a list of real units from the university database (each has code, name, credits). 
Your job is to suggest the **best equivalent replacements** (maximum 3) from this list. 
Rank them from most to least suitable. For each suggestion, give a short reason (1 sentence) why it is a good replacement.

Available units:
${candidates.map((u, idx) => 
  `${idx+1}. Code: ${u.UnitCode} | Name: ${u.Name} | Credits: ${u.CreditPoints ?? '?'}`
).join('\n')}

Answer in JSON format exactly like:
{
  "suggestions": [
    { "unitId": <ID>, "unitCode": "...", "unitName": "...", "reason": "..." }
  ]
}
Only include units from the list above. Do not invent new units.
    `.trim();

    // ----- 4. Call Ollama (assumes running locally on port 11434) -----
    const ollamaResponse = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3',   // or 'mistral', 'phi3', etc.
        prompt: prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.2 },
      }),
    });

    if (!ollamaResponse.ok) {
      throw new Error(`Ollama returned ${ollamaResponse.status}`);
    }

    const ollamaData = await ollamaResponse.json();
    let suggestions = [];
    try {
      const parsed = JSON.parse(ollamaData.response);
      suggestions = parsed.suggestions || [];
    } catch (e) {
      console.error('Failed to parse Ollama JSON', e);
      suggestions = [];
    }

    // Enrich suggestions with full unit data
    const enriched = suggestions.map(sug => {
      const found = candidates.find(u => u.ID === sug.unitId || u.UnitCode === sug.unitCode);
      return found ? { ...sug, unit: found } : sug;
    });

    return NextResponse.json({
      success: true,
      suggestions: enriched,
      candidates: candidates, // for debugging or manual selection
    });
  } catch (error) {
    console.error('Equivalency API error:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}