import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";
import { recordAuditEvent } from "@/services/audit";

export interface LogEntry {
  id: string;
  timestamp: string;
  source: "AUDIT" | "COMMERCE" | "CLIENT" | "SYSTEM";
  level: "ERROR" | "WARN" | "INFO" | "POLICY_BLOCK";
  eventType: string;
  sessionId?: string | null;
  outcome?: string | null;
  message: string;
  metadata?: Record<string, any> | null;
  amount?: number | null;
  currency?: string | null;
}

const postLogSchema = z.object({
  eventType: z.string().min(1),
  level: z.enum(["ERROR", "WARN", "INFO", "POLICY_BLOCK"]).default("INFO"),
  sessionId: z.string().optional(),
  message: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  outcome: z.string().optional(),
});

function classifyLogLevel(eventType: string, outcome?: string | null, metadata?: any): "ERROR" | "WARN" | "INFO" | "POLICY_BLOCK" {
  const normType = eventType.toUpperCase();
  const normOutcome = (outcome || "").toUpperCase();

  if (
    normType.includes("BLOCKED") ||
    normType.includes("POLICY_BLOCKED") ||
    normType.includes("PRICE_SPIKE") ||
    normOutcome === "BLOCKED"
  ) {
    return "POLICY_BLOCK";
  }

  if (
    normOutcome === "FAILURE" ||
    normOutcome === "FAILED" ||
    normOutcome === "ERROR" ||
    normType.includes("ERROR") ||
    normType.includes("FAILED") ||
    normType.includes("INVALIDATED")
  ) {
    return "ERROR";
  }

  if (
    normType.includes("EXPIRED") ||
    normType.includes("CLARIFICATION") ||
    normType.includes("UNAVAILABLE") ||
    normType.includes("WARN")
  ) {
    return "WARN";
  }

  return "INFO";
}

function generateHumanMessage(entry: {
  eventType: string;
  outcome?: string | null;
  amount?: number | null;
  currency?: string | null;
  metadata?: any;
}): string {
  const meta = entry.metadata || {};
  const inrStr = entry.amount ? `₹${(entry.amount / 100).toFixed(0)}` : "";

  switch (entry.eventType) {
    case "AI_INTENT_PARSED":
      if (entry.outcome === "FAILURE") {
        return `AI intent parser required user clarification: "${meta.clarificationQuestion || meta.message || "Unspecified"}"`;
      }
      return `Parsed shopping intent for "${meta.category || meta.query || "general"}" (Budget: ${meta.budget ? `₹${meta.budget / 100}` : "None"}, Objective: ${meta.objective || "best_value"})`;

    case "SEARCH_PERFORMED":
      return `Commerce search executed for query "${meta.query || "all"}" in category "${meta.category || "any"}"`;

    case "PRODUCTS_FOUND":
      return `Commerce search returned ${meta.resultCount ?? 0} offers from catalog`;

    case "PRODUCT_RECOMMENDED":
      return `Recommended winning product ${inrStr ? `(${inrStr})` : ""} with score ${meta.score ?? "N/A"}`;

    case "PURCHASE_POLICY_EVALUATED":
      if (entry.outcome === "BLOCKED") {
        return `Purchase policy BLOCKED transaction. Reasons: ${Array.isArray(meta.reasons) ? meta.reasons.join("; ") : "Policy limits exceeded"}`;
      }
      return `Purchase policy PASSED ${meta.itemCount ? `for ${meta.itemCount} item(s)` : ""} ${inrStr ? `totaling ${inrStr}` : ""}`;

    case "PURCHASE_PREPARED":
      return `Purchase authorization token issued (15-min lock) ${inrStr ? `for ${inrStr}` : ""}`;

    case "RAZORPAY_CHECKOUT_BLOCKED":
      return `Razorpay checkout BLOCKED: ${meta.reason || "Policy violation or price spike detected"}`;

    case "RAZORPAY_ORDER_CREATED":
      return `Razorpay order created (${meta.orderId || "order_pending"}) for ${inrStr}`;

    case "PAYMENT_CAPTURED":
      return `Payment successfully captured! Payment ID: ${meta.paymentId || "confirmed"}`;

    case "PAYMENT_FAILED":
      return `Payment failed: ${meta.reason || meta.error || "Payment verification failed"}`;

    case "CLIENT_ERROR":
      return `Client runtime error: ${meta.message || "Unknown error"}`;

    default:
      return `${entry.eventType} ${entry.outcome ? `[${entry.outcome}]` : ""}`;
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const level = searchParams.get("level")?.toUpperCase() || "ALL";
    const sessionId = searchParams.get("sessionId") || searchParams.get("correlationId");
    const query = searchParams.get("search")?.toLowerCase();
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 300);

    // 1. Fetch AuditTrail logs
    const auditWhere: any = {};
    if (sessionId) {
      auditWhere.sessionId = sessionId;
    }

    const auditRecords = await db.auditTrail.findMany({
      where: auditWhere,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // 2. Fetch CommerceEvent logs
    const commerceWhere: any = {};
    if (sessionId) {
      commerceWhere.sessionId = sessionId;
    }

    const commerceRecords = await db.commerceEvent.findMany({
      where: commerceWhere,
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    // 3. Normalize into unified LogEntry schema
    const combinedLogs: LogEntry[] = [];

    for (const item of auditRecords) {
      let meta: any = null;
      if (item.metadata) {
        try {
          meta = JSON.parse(item.metadata);
        } catch {
          meta = { raw: item.metadata };
        }
      }

      const calculatedLevel = classifyLogLevel(item.eventType, item.outcome, meta);
      const message = generateHumanMessage({
        eventType: item.eventType,
        outcome: item.outcome,
        amount: meta?.amount,
        currency: meta?.currency,
        metadata: meta,
      });

      combinedLogs.push({
        id: `audit_${item.id}`,
        timestamp: item.createdAt.toISOString(),
        source: "AUDIT",
        level: calculatedLevel,
        eventType: item.eventType,
        sessionId: item.sessionId,
        outcome: item.outcome,
        message,
        metadata: meta,
        amount: meta?.amount,
        currency: meta?.currency,
      });
    }

    for (const item of commerceRecords) {
      let meta: any = null;
      if (item.metadata) {
        try {
          meta = JSON.parse(item.metadata);
        } catch {
          meta = { raw: item.metadata };
        }
      }

      const calculatedLevel = classifyLogLevel(item.eventType, null, meta);
      const message = generateHumanMessage({
        eventType: item.eventType,
        amount: item.amount,
        metadata: meta,
      });

      combinedLogs.push({
        id: `comm_${item.id}`,
        timestamp: item.timestamp.toISOString(),
        source: "COMMERCE",
        level: calculatedLevel,
        eventType: item.eventType,
        sessionId: item.sessionId,
        message,
        metadata: meta,
        amount: item.amount,
      });
    }

    // Sort descending by timestamp
    combinedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Filter by level if specified
    let filtered = combinedLogs;
    if (level !== "ALL") {
      if (level === "ERROR") {
        filtered = filtered.filter((l) => l.level === "ERROR" || l.level === "POLICY_BLOCK");
      } else {
        filtered = filtered.filter((l) => l.level === level);
      }
    }

    // Search query filter
    if (query) {
      filtered = filtered.filter(
        (l) =>
          l.eventType.toLowerCase().includes(query) ||
          l.message.toLowerCase().includes(query) ||
          (l.sessionId && l.sessionId.toLowerCase().includes(query)) ||
          JSON.stringify(l.metadata || {}).toLowerCase().includes(query)
      );
    }

    const cappedLogs = filtered.slice(0, limit);

    // Compute summary metrics
    const errorCount = combinedLogs.filter((l) => l.level === "ERROR").length;
    const policyBlockCount = combinedLogs.filter((l) => l.level === "POLICY_BLOCK").length;
    const warnCount = combinedLogs.filter((l) => l.level === "WARN").length;
    const infoCount = combinedLogs.filter((l) => l.level === "INFO").length;

    return NextResponse.json({
      logs: cappedLogs,
      summary: {
        total: combinedLogs.length,
        errors: errorCount,
        policyBlocks: policyBlockCount,
        warnings: warnCount,
        info: infoCount,
      },
    });
  } catch (err: any) {
    console.error("GET /api/logs error:", err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: err.message || "Failed to fetch logs" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    const parsed = postLogSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BODY", details: parsed.error.flatten() }, { status: 400 });
    }

    const { eventType, level, sessionId, message, metadata, outcome } = parsed.data;

    const record = await recordAuditEvent({
      correlationId: sessionId || `client_${Math.random().toString(36).substring(2, 10)}`,
      eventType: eventType.toUpperCase(),
      outcome: outcome || (level === "ERROR" ? "FAILURE" : level === "POLICY_BLOCK" ? "BLOCKED" : "SUCCESS"),
      metadata: {
        level,
        message,
        ...metadata,
      },
    });

    return NextResponse.json({ success: true, logId: record.id });
  } catch (err: any) {
    console.error("POST /api/logs error:", err);
    return NextResponse.json({ error: "FAILED_TO_WRITE_LOG" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await db.auditTrail.deleteMany({});
    await db.commerceEvent.deleteMany({});
    return NextResponse.json({ success: true, message: "Logs cleared successfully." });
  } catch (err: any) {
    console.error("DELETE /api/logs error:", err);
    return NextResponse.json({ error: "FAILED_TO_CLEAR_LOGS" }, { status: 500 });
  }
}
