import { db } from "../src/lib/db";
import { recordCommerceEvent } from "../src/services/events";

describe("P1 Commerce Event and Analytics Tests", () => {
  beforeEach(async () => {
    // Clear CommerceEvent database entries before each test
    await db.commerceEvent.deleteMany({});
  });

  test("1. Create and verify basic CommerceEvent entries", async () => {
    const event = await recordCommerceEvent({
      eventType: "SEARCH_PERFORMED",
      sessionId: "session-123",
      source: "BAZAAR",
      metadata: { query: "chess set" }
    });

    expect(event).toBeDefined();
    expect(event!.eventType).toBe("SEARCH_PERFORMED");
    expect(event!.sessionId).toBe("session-123");
    expect(event!.source).toBe("BAZAAR");

    const eventsInDb = await db.commerceEvent.findMany({});
    expect(eventsInDb.length).toBe(1);
    expect(JSON.parse(eventsInDb[0].metadata || "{}").query).toBe("chess set");
  });

  test("2. Verify metadata structure handles multiple items", async () => {
    const event = await recordCommerceEvent({
      eventType: "BASKET_CREATED",
      sessionId: "session-123",
      source: "BAZAAR",
      offerId: "off-1",
      productId: "prod-1",
      merchantId: "merch-1",
      amount: 45000,
      metadata: {
        items: [
          { offerId: "off-1", quantity: 1, price: 40000 },
          { offerId: "off-2", quantity: 2, price: 2500 }
        ]
      }
    });

    expect(event).toBeDefined();
    expect(event!.amount).toBe(45000);

    const retrieved = await db.commerceEvent.findFirst({
      where: { sessionId: "session-123" }
    });
    expect(retrieved).not.toBeNull();
    const meta = JSON.parse(retrieved!.metadata || "{}");
    expect(meta.items.length).toBe(2);
    expect(meta.items[1].quantity).toBe(2);
  });
});
