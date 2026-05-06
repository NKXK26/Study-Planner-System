import prisma from "@utils/db/db";
import { NextResponse } from "next/server";
import { TokenValidation } from "@app/api/api_helper";

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

    const planners = await prisma.StudyPlanner.findMany({
      include: {
        units: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = planners.map(p => ({
      id:        p.id,
      name:      p.name,
      createdAt: p.createdAt,
      unitCount: p.units.length,
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

// POST — create new study planner
export async function POST(req) {
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

    const { name } = await req.json();

    if (!name?.trim()) {
      return NextResponse.json(
        { success: false, message: "Name is required" },
        { status: 400 }
      );
    }

    const planner = await prisma.StudyPlanner.create({
      data: { name: name.trim() },
    });

    return NextResponse.json({ success: true, data: planner });

  } catch (error) {
    console.error("Create study planner error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create study planner", error: error.message },
      { status: 500 }
    );
  }
}
