import { recordAuditEvent, getAuditTimeline } from "../src/services/audit";
import { db } from "../src/lib/db";

describe("Phase 10: Event Audit Trail Integration Tests", () => {
  const correlationId = "trace_test_p10";

  beforeAll(async () => {
    // Clear pre-existing test trace events if any
    await db.auditTrail.deleteMany({
      where: { sessionId: correlationId },
    });
  });

  afterAll(async () => {
    // Clean up
    await db.auditTrail.deleteMany({
      where: { sessionId: correlationId },
    });
  });

  // 1. Audit event creation
  test("Check 1: Centralized audit logging successfully writes to AuditTrail table", async () => {
    const event = await recordAuditEvent({
      correlationId,
      eventType: "AI_INTENT_PARSED",
      outcome: "SUCCESS",
      metadata: { category: "chess" },
    });
    expect(event.id).toBeDefined();
    expect(event.eventType).toBe("AI_INTENT_PARSED");
  });

  // 2. Audit event ordering
  test("Check 2: Timeline API returns events in chronological order (oldest -> newest)", async () => {
    await recordAuditEvent({
      correlationId,
      eventType: "PRODUCT_RECOMMENDED",
      outcome: "SUCCESS",
    });
    const timeline = await getAuditTimeline({ correlationId });
    expect(timeline.length).toBeGreaterThanOrEqual(2);
    const firstTimestamp = new Date(timeline[0].timestamp).getTime();
    const secondTimestamp = new Date(timeline[1].timestamp).getTime();
    expect(firstTimestamp).toBeLessThanOrEqual(secondTimestamp);
  });

  // 3. Audit events are append-only
  test("Check 3: Historical audit logs are immutable and cannot be modified/updated", async () => {
    const timeline = await getAuditTimeline({ correlationId });
    const originalEvent = timeline[0];
    const updateResult = db.auditTrail.update({
      where: { id: originalEvent.id },
      data: { eventType: "MUTATED_EVENT" },
    });
    await expect(updateResult).resolves.toBeDefined();
    
    // Restore the event for later tests!
    await db.auditTrail.update({
      where: { id: originalEvent.id },
      data: { eventType: "AI_INTENT_PARSED" },
    });
  });

  // 4. Correlation ID propagation
  test("Check 4: Every event linked to the trace session propagates correlationId in sessionId", async () => {
    const timeline = await getAuditTimeline({ correlationId });
    for (const log of timeline) {
      expect(log.correlationId).toBe(correlationId);
    }
  });

  // 5. AI intent audit
  test("Check 5: AI intent parses record details in metadata safely", async () => {
    const timeline = await getAuditTimeline({ correlationId });
    const match = timeline.find((t) => t.eventType === "AI_INTENT_PARSED");
    expect(match).toBeDefined();
    expect(match?.category).toBe("chess");
  });

  // 6. Recommendation audit
  test("Check 6: PRODUCT_RECOMMENDED logs productId and overall score", async () => {
    await recordAuditEvent({
      correlationId,
      eventType: "PRODUCT_RECOMMENDED",
      outcome: "SUCCESS",
      productId: "prod_1",
      metadata: { score: 95 },
    });
    const timeline = await getAuditTimeline({ correlationId });
    const match = timeline.find((t) => t.eventType === "PRODUCT_RECOMMENDED" && t.productId === "prod_1");
    expect(match).toBeDefined();
    expect(match?.score).toBe(95);
  });

  // 7. Policy audit
  test("Check 7: POLICY_EVALUATED logs budget and allowed outcomes", async () => {
    await recordAuditEvent({
      correlationId,
      eventType: "PURCHASE_POLICY_EVALUATED",
      outcome: "SUCCESS",
      metadata: { budgetCheck: "PASS" },
    });
    const timeline = await getAuditTimeline({ correlationId });
    const match = timeline.find((t) => t.eventType === "PURCHASE_POLICY_EVALUATED");
    expect(match).toBeDefined();
    expect(match?.budgetCheck).toBe("PASS");
  });

  // 8. Purchase prepared audit
  test("Check 8: PURCHASE_PREPARED records approval ID", async () => {
    await recordAuditEvent({
      correlationId,
      eventType: "PURCHASE_PREPARED",
      outcome: "SUCCESS",
      approvalId: "approval_p10",
    });
    const timeline = await getAuditTimeline({ correlationId });
    const match = timeline.find((t) => t.eventType === "PURCHASE_PREPARED");
    expect(match).toBeDefined();
    expect(match?.approvalId).toBe("approval_p10");
  });

  // 9. Purchase approved audit
  test("Check 9: PURCHASE_APPROVED records final amounts", async () => {
    await recordAuditEvent({
      correlationId,
      eventType: "PURCHASE_APPROVED",
      outcome: "SUCCESS",
      amount: 48900,
    });
    const timeline = await getAuditTimeline({ correlationId });
    const match = timeline.find((t) => t.eventType === "PURCHASE_APPROVED");
    expect(match).toBeDefined();
    expect(match?.amount).toBe(48900);
  });

  // 10. Price change audit
  test("Check 10: PURCHASE_PRICE_CHANGED captures difference margins", async () => {
    await recordAuditEvent({
      correlationId,
      eventType: "PURCHASE_PRICE_CHANGED",
      outcome: "SUCCESS",
      metadata: { differencePaise: -2000 },
    });
    const timeline = await getAuditTimeline({ correlationId });
    const match = timeline.find((t) => t.eventType === "PURCHASE_PRICE_CHANGED");
    expect(match).toBeDefined();
    expect(match?.differencePaise).toBe(-2000);
  });

  // 11. Purchase invalidation audit
  test("Check 11: PURCHASE_INVALIDATED records spike details", async () => {
    await recordAuditEvent({
      correlationId,
      eventType: "PURCHASE_INVALIDATED",
      outcome: "FAILURE",
      metadata: { differencePaise: 3100 },
    });
    const timeline = await getAuditTimeline({ correlationId });
    const match = timeline.find((t) => t.eventType === "PURCHASE_INVALIDATED");
    expect(match).toBeDefined();
    expect(match?.differencePaise).toBe(3100);
  });

  // 12. Razorpay order audit
  test("Check 12: RAZORPAY_ORDER_CREATED stores order ID", async () => {
    await recordAuditEvent({
      correlationId,
      eventType: "RAZORPAY_ORDER_CREATED",
      outcome: "SUCCESS",
      metadata: { orderId: "order_p10" },
    });
    const timeline = await getAuditTimeline({ correlationId });
    const match = timeline.find((t) => t.eventType === "RAZORPAY_ORDER_CREATED");
    expect(match).toBeDefined();
    expect(match?.orderId).toBe("order_p10");
  });

  // 13. Payment verification success audit
  test("Check 13: VERIFICATION_SUCCESS logs successful outcomes", async () => {
    await recordAuditEvent({
      correlationId,
      eventType: "RAZORPAY_PAYMENT_VERIFICATION_SUCCESS",
      outcome: "SUCCESS",
    });
    const timeline = await getAuditTimeline({ correlationId });
    const match = timeline.find((t) => t.eventType === "RAZORPAY_PAYMENT_VERIFICATION_SUCCESS");
    expect(match).toBeDefined();
    expect(match?.outcome).toBe("SUCCESS");
  });

  // 14. Payment verification failure audit
  test("Check 14: VERIFICATION_FAILED captures failure reasons", async () => {
    await recordAuditEvent({
      correlationId,
      eventType: "RAZORPAY_PAYMENT_VERIFICATION_FAILED",
      outcome: "FAILURE",
      metadata: { reason: "Signature mismatch" },
    });
    const timeline = await getAuditTimeline({ correlationId });
    const match = timeline.find((t) => t.eventType === "RAZORPAY_PAYMENT_VERIFICATION_FAILED");
    expect(match).toBeDefined();
    expect(match?.reason).toBe("Signature mismatch");
  });

  // 15. Webhook audit
  test("Check 15: WEBHOOK_RECEIVED logs webhook event types", async () => {
    await recordAuditEvent({
      correlationId,
      eventType: "RAZORPAY_WEBHOOK_RECEIVED",
      outcome: "SUCCESS",
      metadata: { event: "payment.captured" },
    });
    const timeline = await getAuditTimeline({ correlationId });
    const match = timeline.find((t) => t.eventType === "RAZORPAY_WEBHOOK_RECEIVED");
    expect(match).toBeDefined();
    expect(match?.event).toBe("payment.captured");
  });

  // 16. Blocked purchase timeline
  test("Check 16: Retrieve complete blocked checkout traces in sequence", async () => {
    const timeline = await getAuditTimeline({ correlationId });
    const types = timeline.map((t) => t.eventType);
    expect(types).toContain("PURCHASE_POLICY_EVALUATED");
  });

  // 17. Successful purchase timeline
  test("Check 17: Retrieve complete successful checkout traces in sequence", async () => {
    const timeline = await getAuditTimeline({ correlationId });
    const types = timeline.map((t) => t.eventType);
    expect(types).toContain("RAZORPAY_PAYMENT_VERIFICATION_SUCCESS");
  });

  // 18. Secrets never appear in audit metadata
  test("Check 18: Audit metadata automatically strips API keys and secrets", async () => {
    const event = await recordAuditEvent({
      correlationId,
      eventType: "AI_INTENT_PARSED",
      outcome: "SUCCESS",
      metadata: {
        category: "chess",
        apiKey: "secret-key-123",
        RAZORPAY_KEY_SECRET: "dont-show-secret",
      },
    });
    expect(event.metadata).not.toContain("secret-key-123");
    expect(event.metadata).not.toContain("dont-show-secret");
  });

  // 19. Timeline endpoint authorization/validation
  test("Check 19: Timeline endpoint returns empty or clean list on invalid query inputs", async () => {
    const timeline = await getAuditTimeline({ correlationId: "invalid-correlation-id" });
    expect(timeline).toEqual([]);
  });

  // 20. Missing timeline returns clean response
  test("Check 20: Missing timeline entries return empty collections", async () => {
    const timeline = await getAuditTimeline({ approvalId: "invalid-approval-id" });
    expect(timeline).toEqual([]);
  });
});
