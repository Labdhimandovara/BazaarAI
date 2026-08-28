import { db } from "@/lib/db";

export interface CommerceEventInput {
  eventType: string;
  sessionId?: string;
  source?: string;
  offerId?: string;
  productId?: string;
  merchantId?: string;
  amount?: number;
  metadata?: Record<string, any>;
}

function sanitizeObject(val: any): any {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) {
    return val.map(item => sanitizeObject(item));
  }
  if (typeof val === "object" && !(val instanceof Date)) {
    const secretKeys = ["apikey", "secret", "password", "token", "key", "credential", "auth"];
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      const isSecret = secretKeys.some((s) => k.toLowerCase().includes(s));
      if (!isSecret) {
        clean[k] = sanitizeObject(v);
      }
    }
    return clean;
  }
  return val;
}

export async function recordCommerceEvent(input: CommerceEventInput) {
  try {
    const cleanMetadata = input.metadata ? sanitizeObject(input.metadata) : null;

    return await db.commerceEvent.create({
      data: {
        eventType: input.eventType,
        sessionId: input.sessionId || null,
        source: input.source || null,
        offerId: input.offerId || null,
        productId: input.productId || null,
        merchantId: input.merchantId || null,
        amount: input.amount || null,
        metadata: cleanMetadata && Object.keys(cleanMetadata).length > 0 ? JSON.stringify(cleanMetadata) : null,
      },
    });
  } catch (error) {
    console.error("Failed to record commerce event:", error);
  }
}
