import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import { TokenValidation } from "@app/api/api_helper";

function auth(req) {
  const isDevOverride =
    req.headers.get("x-dev-override") === "true" &&
    process.env.NEXT_PUBLIC_MODE === "DEV";
  if (isDevOverride) return { success: true };
  const token_res = TokenValidation(req.headers.get("Authorization"));
  return token_res;
}

// GET – get a single planner with its units and their types
export async function GET(req, { params }) {
  try {
    const check = auth(req);
    if (!check.success) {
      return NextResponse.json(
        { success: false, message: check.message },
        { status: check.status }
      );
    }

    // ✅ await params (Next.js App Router requirement)
    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id, 10);
    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid ID" },
        { status: 400 }
      );
    }

    const planner = await prisma.studyPlanner.findUnique({
      where: { id },
      include: {
        studyPlannerUnits: {
          include: {
            unit: true,
            unitType: true,
          },
        },
      },
    });

    if (!planner) {
      return NextResponse.json(
        { success: false, message: "Study planner not found" },
        { status: 404 }
      );
    }

    // Transform to the format expected by the frontend detail page
    const transformed = {
      id: planner.id,
      name: planner.name,
      createdAt: planner.createdAt,
      units: planner.studyPlannerUnits.map(spu => ({
        ID: spu.unit.ID,
        UnitCode: spu.unit.UnitCode,
        Name: spu.unit.Name,
        CreditPoints: spu.unit.CreditPoints,
        Availability: spu.unit.Availability,
        unitTypeId: spu.unitTypeId,
        unitType: spu.unitType ? { id: spu.unitType.ID, name: spu.unitType.Name } : null,
      })),
    };

    return NextResponse.json({ success: true, data: transformed });

  } catch (error) {
    console.error("Get planner error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load study planner", error: error.message },
      { status: 500 }
    );
  }
}

// PATCH – update planner name and/or its units (with unitTypeId)
export async function PATCH(req, { params }) {
  try {
    const check = auth(req);
    if (!check.success) {
      return NextResponse.json(
        { success: false, message: check.message },
        { status: check.status }
      );
    }

    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id, 10);
    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid ID" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const updateData = {};

    // Update name if provided
    if (body.name?.trim()) {
      updateData.name = body.name.trim();
    }

    // Update units if provided (expects { units: [{ unitId, unitTypeId }] })
    if (body.units !== undefined) {
      if (!Array.isArray(body.units)) {
        return NextResponse.json(
          { success: false, message: "units must be an array" },
          { status: 400 }
        );
      }

      // Validate unit IDs exist
      const unitIds = body.units.map(u => u.unitId).filter(v => v != null);
      if (unitIds.length !== body.units.length) {
        return NextResponse.json(
          { success: false, message: "Every unit must have a unitId" },
          { status: 400 }
        );
      }

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

      // Replace all join records
      await prisma.$transaction([
        prisma.studyPlannerUnit.deleteMany({
          where: { studyPlannerId: id },
        }),
        prisma.studyPlannerUnit.createMany({
          data: body.units.map(u => ({
            studyPlannerId: id,
            unitId: u.unitId,
            unitTypeId: u.unitTypeId || null,
          })),
        }),
      ]);
    }

    // Apply name update separately if needed
    if (Object.keys(updateData).length > 0) {
      await prisma.studyPlanner.update({
        where: { id },
        data: updateData,
      });
    }

    // Fetch fresh data to return
    const updatedPlanner = await prisma.studyPlanner.findUnique({
      where: { id },
      include: {
        studyPlannerUnits: {
          include: { unit: true, unitType: true },
        },
      },
    });

    const transformed = {
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

    return NextResponse.json({ success: true, data: transformed });

  } catch (error) {
    console.error("Update planner error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update study planner", error: error.message },
      { status: 500 }
    );
  }
}

// DELETE – remove planner (cascade deletes join records)
export async function DELETE(req, { params }) {
  try {
    const check = auth(req);
    if (!check.success) {
      return NextResponse.json(
        { success: false, message: check.message },
        { status: check.status }
      );
    }

    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id, 10);
    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid ID" },
        { status: 400 }
      );
    }

    await prisma.studyPlanner.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Deleted successfully" });

  } catch (error) {
    console.error("Delete planner error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete study planner", error: error.message },
      { status: 500 }
    );
  }
}