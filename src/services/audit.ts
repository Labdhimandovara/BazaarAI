import { db } from "@/lib/db";

export interface AuditEventInput {
  correlationId: string;
  eventType: string; // e.g. "AI_INTENT_PARSED" | "PRODUCT_RECOMMENDED"
  outcome: string; // "SUCCESS" | "FAILURE" | "BLOCKED"
  approvalId?: string;
  transactionId?: string;
  productId?: string;
  offerId?: string;
  merchantId?: string;
  amount?: number;
  currency?: string;
  metadata?: Record<string, any>;
}

/**
 * Centrally records audit trail events ensuring no credentials or secrets leak.
 */
export async function recordAuditEvent(input: AuditEventInput) {
  // Standardize correlationId fallback
  const correlationId = input.correlationId || `bazaar_${Math.random().toString(36).substring(2, 10)}`;

  // Defensive deep clone & filter secrets from metadata
  const cleanMetadata: Record<string, any> = {};
  if (input.metadata) {
    const secretKeys = ["apiKey", "secret", "password", "token", "key", "credential", "auth"];
    for (const [key, value] of Object.entries(input.metadata)) {
      const isSecret = secretKeys.some((s) => key.toLowerCase().includes(s));
      if (!isSecret) {
        cleanMetadata[key] = value;
      }
    }
  }

  // Consolidate payload parameters in metadata
  const payloadMetadata = {
    approvalId: input.approvalId,
    transactionId: input.transactionId,
    productId: input.productId,
    offerId: input.offerId,
    merchantId: input.merchantId,
    amount: input.amount,
    currency: input.currency || "INR",
    ...cleanMetadata,
  };

  return await db.auditTrail.create({
    data: {
      sessionId: correlationId, // Store trace correlation ID in sessionId
      eventType: input.eventType,
      outcome: input.outcome,
      metadata: JSON.stringify(payloadMetadata),
    },
  });
}

/**
 * Returns timeline events ordered from oldest to newest.
 */
export async function getAuditTimeline(query: { approvalId?: string; correlationId?: string }): Promise<any[]> {
  let correlationId = query.correlationId;

  // Resolve correlation ID from approvalId if needed
  if (!correlationId && query.approvalId) {
    const matchedLog = await db.auditTrail.findFirst({
      where: {
        metadata: {
          contains: query.approvalId,
        },
      },
    });
    if (matchedLog) {
      correlationId = matchedLog.sessionId;
    }
  }

  if (!correlationId) {
    // If correlationId is not resolved, fallback to query directly by sessionId
    const directLogs = await db.auditTrail.findMany({
      where: { sessionId: query.approvalId },
      orderBy: { createdAt: "asc" },
    });
    return directLogs.map(mapDbRecordToTimelineEvent);
  }

  const logs = await db.auditTrail.findMany({
    where: { sessionId: correlationId },
    orderBy: { createdAt: "asc" },
  });

  return logs.map(mapDbRecordToTimelineEvent);
}

function mapDbRecordToTimelineEvent(log: any) {
  let meta: Record<string, any> = {};
  if (log.metadata) {
    try {
      meta = JSON.parse(log.metadata);
    } catch {
      meta = {};
    }
  }

  return {
    id: log.id,
    eventType: log.eventType,
    timestamp: log.createdAt,
    outcome: log.outcome,
    correlationId: log.sessionId,
    ...meta,
  };
}
