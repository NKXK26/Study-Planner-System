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

// GET — single planner with all its units
export async function GET(req, { params }) {
  try {
    const check = auth(req);
    if (!check.success) {
      return NextResponse.json(
        { success: false, message: check.message },
        { status: check.status }
      );
    }

    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid ID" },
        { status: 400 }
      );
    }

    const planner = await prisma.StudyPlanner.findUnique({
      where: { id },
      include: {
        units: {
          select: {
            ID:           true,
            UnitCode:     true,
            Name:         true,
            CreditPoints: true,
            Availability: true,
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

    return NextResponse.json({ success: true, data: planner });

  } catch (error) {
    console.error("Get planner error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load study planner", error: error.message },
      { status: 500 }
    );
  }
}

// PATCH — update planner name and/or its units
export async function PATCH(req, { params }) {
  try {
    const check = auth(req);
    if (!check.success) {
      return NextResponse.json(
        { success: false, message: check.message },
        { status: check.status }
      );
    }

    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid ID" },
        { status: 400 }
      );
    }

    const { name, unitIds } = await req.json();

    // Build update payload
    const updateData = {};

    if (name?.trim()) {
      updateData.name = name.trim();
    }

    // If unitIds provided, replace the unit connections
    if (Array.isArray(unitIds)) {
      updateData.units = {
        set: unitIds.map(uid => ({ ID: uid })),
      };
    }

    const updated = await prisma.StudyPlanner.update({
      where: { id },
      data: updateData,
      include: {
        units: {
          select: {
            ID:           true,
            UnitCode:     true,
            Name:         true,
            CreditPoints: true,
            Availability: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: updated });

  } catch (error) {
    console.error("Update planner error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update study planner", error: error.message },
      { status: 500 }
    );
  }
}

// DELETE — delete a study planner
export async function DELETE(req, { params }) {
  try {
    const check = auth(req);
    if (!check.success) {
      return NextResponse.json(
        { success: false, message: check.message },
        { status: check.status }
      );
    }

    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid ID" },
        { status: 400 }
      );
    }

    await prisma.StudyPlanner.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "Deleted successfully" });

  } catch (error) {
    console.error("Delete planner error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete study planner", error: error.message },
      { status: 500 }
    );
  }
}
