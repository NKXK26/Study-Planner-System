import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import { TokenValidation } from "@app/api/api_helper";

// Helper to check auth
async function checkAuth(req) {
  const isDevOverride =
    req.headers.get("x-dev-override") === "true" &&
    process.env.NEXT_PUBLIC_MODE === "DEV";

  if (!isDevOverride) {
    const authHeader = req.headers.get("Authorization");
    const token_res = TokenValidation(authHeader);
    if (!token_res.success) {
      return { success: false, response: NextResponse.json(
        { success: false, message: token_res.message },
        { status: token_res.status }
      ) };
    }
  }
  return { success: true };
}

// GET — list all study planners with unit count
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

    // ✅ Use studyPlannerUnits instead of units
    const planners = await prisma.StudyPlanner.findMany({
      include: {
        studyPlannerUnits: true,   // just to count them (no need to load full units)
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = planners.map(p => ({
      id:        p.id,
      name:      p.name,
      createdAt: p.createdAt,
      unitCount: p.studyPlannerUnits.length,   // count from the join table
    }));

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error("Study planner list error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load study planners", error: error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/study_planners/[id]
// Supports:
// - { name: "new name" }  to rename
// - { units: [{ unitId, unitTypeId }, ...] } to replace the entire unit list
export async function PATCH(req, { params }) {
  const auth = await checkAuth(req);
  if (!auth.success) return auth.response;

  const { id } = await params;
  const body = await req.json();

  try {
    const plannerId = parseInt(id);

    // Ensure planner exists
    const existing = await prisma.StudyPlanner.findUnique({
      where: { id: plannerId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Planner not found" },
        { status: 404 }
      );
    }

    // Case 1: Update name only
    if (body.name !== undefined && body.units === undefined) {
      const updated = await prisma.StudyPlanner.update({
        where: { id: plannerId },
        data: { name: body.name.trim() },
      });
      return NextResponse.json({ success: true, data: updated });
    }

    // Case 2: Replace the unit list
    if (body.units !== undefined) {
      // Validate each entry
      if (!Array.isArray(body.units)) {
        return NextResponse.json(
          { success: false, message: "units must be an array" },
          { status: 400 }
        );
      }

      // Optional: validate that unitIds exist and unitTypeIds exist
      const unitIds = body.units.map(u => u.unitId);
      const existingUnits = await prisma.unit.findMany({
        where: { ID: { in: unitIds } },
        select: { ID: true },
      });
      if (existingUnits.length !== unitIds.length) {
        return NextResponse.json(
          { success: false, message: "One or more unit IDs are invalid" },
          { status: 400 }
        );
      }

      // Replace: delete all existing, then create new ones
      await prisma.$transaction([
        prisma.studyPlannerUnit.deleteMany({
          where: { studyPlannerId: plannerId },
        }),
        prisma.studyPlannerUnit.createMany({
          data: body.units.map(u => ({
            studyPlannerId: plannerId,
            unitId: u.unitId,
            unitTypeId: u.unitTypeId || null, // allow null if type not selected
          })),
        }),
      ]);

      // Fetch the updated planner with units
      const updatedPlanner = await prisma.StudyPlanner.findUnique({
        where: { id: plannerId },
        include: {
          studyPlannerUnits: {
            include: { unit: true, unitType: true },
          },
        },
      });

      const formatted = {
        id: updatedPlanner.id,
        name: updatedPlanner.name,
        createdAt: updatedPlanner.createdAt,
        units: updatedPlanner.studyPlannerUnits.map(spu => ({
          ID: spu.unit.ID,
          UnitCode: spu.unit.UnitCode,
          Name: spu.unit.Name,
          CreditPoints: spu.unit.CreditPoints,
          Availability: spu.unit.Availability,
          unitTypeId: spu.unitTypeId,
          unitType: spu.unitType ? { id: spu.unitType.ID, name: spu.unitType.Name } : null,
        })),
      };

      return NextResponse.json({ success: true, data: formatted });
    }

    return NextResponse.json(
      { success: false, message: "Nothing to update" },
      { status: 400 }
    );
  } catch (error) {
    console.error("PATCH planner error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update planner", error: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/study_planners/[id]
export async function DELETE(req, { params }) {
  const auth = await checkAuth(req);
  if (!auth.success) return auth.response;

  const { id } = await params;

  try {
    const plannerId = parseInt(id);

    // Check existence
    const existing = await prisma.StudyPlanner.findUnique({
      where: { id: plannerId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Planner not found" },
        { status: 404 }
      );
    }

    // Delete – cascade will remove all related StudyPlannerUnit rows
    await prisma.StudyPlanner.delete({
      where: { id: plannerId },
    });

    return NextResponse.json({ success: true, message: "Planner deleted" });
  } catch (error) {
    console.error("DELETE planner error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete planner", error: error.message },
      { status: 500 }
    );
  }
}