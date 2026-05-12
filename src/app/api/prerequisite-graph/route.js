import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import prisma from '@utils/db/db';
import SecureSessionManager from '@utils/auth/SimpleSessionManager';

const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);

async function validateAuthenticatedRequest(req) {
    const isDevOverride = req.headers.get('x-dev-override') === 'true' && process.env.NEXT_PUBLIC_MODE === 'DEV';
    if (isDevOverride) return { user: { email: 'developer@dev.local', roles: ['Developer'], isActive: true } };

    const sessionEmail = req.headers.get('x-session-email');
    if (!sessionEmail) return { error: NextResponse.json({ success: false, message: 'Missing authentication header' }, { status: 401 }) };

    const user = await SecureSessionManager.authenticateUser(req);
    if (!user) return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };

    return { user };
}

export async function GET(req) {
    const authResult = await validateAuthenticatedRequest(req);
    if (authResult.error) return authResult.error;

    const url = new URL(req.url);
    const code = url.searchParams.get('code')?.trim().toUpperCase();
    const highlight = url.searchParams.get('highlight'); // comma-separated unit codes

    try {
        let units, edges;

        if (!code) {
            // ---------- FULL GRAPH (all units and all prerequisite edges) ----------
            const involvedUnits = await prisma.$queryRaw`
                SELECT DISTINCT u.ID, u.UnitCode, u.Name, u.CreditPoints
                FROM Unit u
                WHERE u.ID IN (
                    SELECT RequisiteUnitID FROM UnitRequisiteRelationship WHERE RequisiteUnitID IS NOT NULL
                    UNION
                    SELECT UnitID FROM UnitRequisiteRelationship WHERE UnitID IS NOT NULL
                )
            `;
            units = involvedUnits.map(u => ({
                unitCode: u.UnitCode,
                name: u.Name,
                creditPoints: u.CreditPoints || 0,
            }));

            const relations = await prisma.unitRequisiteRelationship.findMany({
                where: {
                    RequisiteUnitID: { not: null },
                    UnitID: { not: null },
                    UnitRelationship: { not: 'min' },
                },
                select: {
                    RequisiteUnitID: true,
                    UnitID: true,
                },
            });

            const idToCode = new Map();
            for (const u of involvedUnits) {
                idToCode.set(u.ID, u.UnitCode);
            }

            edges = [];
            for (const rel of relations) {
                const fromCode = idToCode.get(rel.RequisiteUnitID);
                const toCode = idToCode.get(rel.UnitID);
                if (fromCode && toCode) {
                    edges.push({ from: fromCode, to: toCode });
                }
            }
        } else {
            // ---------- SUBGRAPH for a specific unit (BFS from that unit) ----------
            const rootUnit = await prisma.unit.findFirst({
                where: { UnitCode: code },
                select: { ID: true, UnitCode: true, Name: true, CreditPoints: true }
            });
            if (!rootUnit) {
                return NextResponse.json({ success: false, message: `Unit ${code} not found` }, { status: 404 });
            }

            const visited = new Set();
            const queue = [rootUnit.ID];
            const unitsMap = new Map();
            const rawEdges = [];

            while (queue.length) {
                const uid = queue.shift();
                if (visited.has(uid)) continue;
                visited.add(uid);

                const unit = await prisma.unit.findUnique({
                    where: { ID: uid },
                    select: { ID: true, UnitCode: true, Name: true, CreditPoints: true }
                });
                if (unit) unitsMap.set(uid, unit);

                // Prerequisites (uid depends on RequisiteUnitID)
                const prereqs = await prisma.unitRequisiteRelationship.findMany({
                    where: { UnitID: uid, RequisiteUnitID: { not: null }, UnitRelationship: { not: 'min' } },
                    select: { RequisiteUnitID: true }
                });
                for (const p of prereqs) {
                    rawEdges.push({ fromId: p.RequisiteUnitID, toId: uid });
                    if (!visited.has(p.RequisiteUnitID)) queue.push(p.RequisiteUnitID);
                }

                // Dependents (units that require this unit)
                const dependents = await prisma.unitRequisiteRelationship.findMany({
                    where: { RequisiteUnitID: uid, UnitID: { not: null }, UnitRelationship: { not: 'min' } },
                    select: { UnitID: true }
                });
                for (const d of dependents) {
                    rawEdges.push({ fromId: uid, toId: d.UnitID });
                    if (!visited.has(d.UnitID)) queue.push(d.UnitID);
                }
            }

            units = Array.from(unitsMap.values()).map(u => ({
                unitCode: u.UnitCode,
                name: u.Name,
                creditPoints: u.CreditPoints || 0,
            }));

            const idToCode = new Map(unitsMap.entries());
            edges = rawEdges.map(e => ({
                from: idToCode.get(e.fromId)?.UnitCode,
                to: idToCode.get(e.toId)?.UnitCode,
            })).filter(e => e.from && e.to);
        }

        if (!units.length) {
            return NextResponse.json({ success: false, message: 'No units found' }, { status: 404 });
        }

        // Prepare temporary files
        const publicGraphDir = path.join(process.cwd(), 'public', 'graphs');
        await mkdir(publicGraphDir, { recursive: true });

        const timestamp = Date.now();
        const fileName = code ? `graph_${code}_${timestamp}.html` : `graph_full_${timestamp}.html`;
        const outputPath = path.join(publicGraphDir, fileName);
        const graphUrl = `/graphs/${fileName}`;

        const unitsJsonPath = path.join(publicGraphDir, `units_${timestamp}.json`);
        const edgesJsonPath = path.join(publicGraphDir, `edges_${timestamp}.json`);

        await writeFile(unitsJsonPath, JSON.stringify(units));
        await writeFile(edgesJsonPath, JSON.stringify(edges));

        // Build command arguments for Python script
        const scriptPath = path.join(process.cwd(), 'scripts', 'generate_pyvis_graph.py');
        const args = ['--units', unitsJsonPath, '--edges', edgesJsonPath, '--output', outputPath];
        if (highlight) {
            args.push('--highlight', highlight);
        }

        // Spawn Python process
        const pythonProcess = spawn('python', [scriptPath, ...args]);
        let stderr = '';

        pythonProcess.stderr.on('data', (data) => { stderr += data.toString(); });

        const exitCode = await new Promise((resolve) => pythonProcess.on('close', resolve));

        // Clean up temporary JSON files
        await unlink(unitsJsonPath).catch(() => {});
        await unlink(edgesJsonPath).catch(() => {});

        if (exitCode !== 0) {
            console.error('Python error:', stderr);
            return NextResponse.json({ success: false, message: 'Graph generation failed', details: stderr }, { status: 500 });
        }

        return NextResponse.json({ success: true, graphUrl });
    } catch (error) {
        console.error('API error:', error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}