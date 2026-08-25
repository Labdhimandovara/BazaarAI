import { NextResponse } from "next/server";
import { getAuditTimeline } from "@/services/audit";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const approvalId = url.searchParams.get("approvalId") || undefined;
    const correlationId = url.searchParams.get("correlationId") || undefined;

    if (!approvalId && !correlationId) {
      return NextResponse.json(
        { error: "INVALID_PARAMETERS", message: "Either approvalId or correlationId must be provided." },
        { status: 400 }
      );
    }

    const events = await getAuditTimeline({ approvalId, correlationId });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("GET /api/audit/timeline Error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Failed to load audit timeline." },
      { status: 500 }
    );
  }
}
