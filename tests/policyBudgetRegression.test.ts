import { db } from "../src/lib/db";
import { recordAuditEvent } from "../src/services/audit";
import { parseBudgetToRupees, parseBudgetToPaise } from "../src/services/intent";
import { POST as preparePOST } from "../src/app/api/payment/prepare/route";
import { POST as approvePOST } from "../src/app/api/payment/approve/route";
import { POST as checkoutPOST } from "../src/app/api/payment/checkout/route";

describe("Dynamic Budget Policy and Price Protection Regression Tests", () => {
  const correlationId = "regression_test_session_id";
  const policyId = "regression-test-policy";
  const offerId = "regression-test-offer";

  beforeAll(async () => {
    // Upsert merchant and product for foreign keys
    await db.merchant.upsert({
      where: { id: "merchant-bazaar-depot" },
      update: {},
      create: {
        id: "merchant-bazaar-depot",
        name: "Bazaar Depot",
        source: "SYNTHETIC",
        isRazorpayEnabled: true,
        isActive: true,
      },
    });

    await db.product.upsert({
      where: { id: "prod-chess-set" },
      update: {},
      create: {
        id: "prod-chess-set",
        canonicalName: "Chess Set",
        brand: "Bazaar Brand",
        category: "chess",
        attributes: "{}",
      },
    });
  });

  afterEach(async () => {
    // Clear tests records
    await db.auditTrail.deleteMany({
      where: { sessionId: correlationId },
    });
    await db.purchaseApproval.deleteMany({
      where: { sessionId: offerId },
    });
  });

  async function createOffer(pricePaise: number, shippingCostPaise: number = 0) {
    return await db.productOffer.upsert({
      where: { id: offerId },
      update: {
        pricePaise,
        shippingCostPaise,
      },
      create: {
        id: offerId,
        productId: "prod-chess-set",
        merchantId: "merchant-bazaar-depot",
        source: "SYNTHETIC",
        sourceProductId: "src-regression-offer",
        pricePaise,
        shippingCostPaise,
        deliveryEstimate: "2 days",
        productUrl: "http://example.com",
      },
    });
  }

  async function createPolicy(maxAmountPaise: number) {
    return await db.purchasePolicy.upsert({
      where: { id: policyId },
      update: {
        maxAmountPaise,
      },
      create: {
        id: policyId,
        name: "Regression Safety Policy",
        maxAmountPaise,
        allowedMerchants: JSON.stringify(["merchant-bazaar-depot"]),
        blockedCategories: JSON.stringify(["restricted"]),
        maxQuantity: 10,
      },
    });
  }

  async function seedAiIntent(maxBudgetPaise: number | null) {
    await db.auditTrail.deleteMany({
      where: { sessionId: correlationId, eventType: "AI_INTENT_PARSED" },
    });

    if (maxBudgetPaise !== null) {
      await recordAuditEvent({
        correlationId,
        eventType: "AI_INTENT_PARSED",
        outcome: "SUCCESS",
        metadata: {
          maxBudgetPaise,
        },
      });
    }
  }

  // 1. User ₹500 → ₹400 passes.
  test("Check 1: User requested budget ₹500 and price ₹400 passes policy evaluation", async () => {
    await createPolicy(1000000); // Account maximum limit: ₹10,000 (1,000,000 paise)
    await createOffer(40000);    // Product total: ₹400 (40,000 paise)
    await seedAiIntent(50000);   // User requested limit: ₹500 (50,000 paise)

    const req = new Request("http://localhost/api/payment/prepare", {
      method: "POST",
      body: JSON.stringify({
        offerId,
        quantity: 1,
        policyId,
        correlationId,
      }),
    });

    const res = await preparePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.allowed).toBe(true);
    expect(data.effectiveLimit).toBe(50000);
  });

  // 2. User ₹500 → ₹600 fails.
  test("Check 2: User requested budget ₹500 and price ₹600 fails policy evaluation", async () => {
    await createPolicy(1000000); // Account limit: ₹10,000
    await createOffer(60000);    // Product total: ₹600
    await seedAiIntent(50000);   // User limit: ₹500

    const req = new Request("http://localhost/api/payment/prepare", {
      method: "POST",
      body: JSON.stringify({
        offerId,
        quantity: 1,
        policyId,
        correlationId,
      }),
    });

    const res = await preparePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.allowed).toBe(false);
    expect(data.effectiveLimit).toBe(50000);
    expect(data.reasons[0]).toContain("exceeds your ₹500 limit");
  });

  // 3. User ₹2,000 → ₹1,900 passes.
  test("Check 3: User requested budget ₹2000 and price ₹1900 passes policy evaluation", async () => {
    await createPolicy(1000000); // Account limit: ₹10,000
    await createOffer(190000);   // Product total: ₹1,900
    await seedAiIntent(200000);  // User limit: ₹2,000

    const req = new Request("http://localhost/api/payment/prepare", {
      method: "POST",
      body: JSON.stringify({
        offerId,
        quantity: 1,
        policyId,
        correlationId,
      }),
    });

    const res = await preparePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.allowed).toBe(true);
    expect(data.effectiveLimit).toBe(200000);
  });

  // 4. User ₹2,000 → ₹2,100 fails.
  test("Check 4: User requested budget ₹2000 and price ₹2100 fails policy evaluation", async () => {
    await createPolicy(1000000); // Account limit: ₹10,000
    await createOffer(210000);   // Product total: ₹2,100
    await seedAiIntent(200000);  // User limit: ₹2,000

    const req = new Request("http://localhost/api/payment/prepare", {
      method: "POST",
      body: JSON.stringify({
        offerId,
        quantity: 1,
        policyId,
        correlationId,
      }),
    });

    const res = await preparePOST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.allowed).toBe(false);
    expect(data.effectiveLimit).toBe(200000);
    expect(data.reasons[0]).toContain("exceeds your ₹2000 limit");
  });

  // 5. User ₹2,000 + account limit ₹10,000 → effective ₹2,000.
  test("Check 5: User limit ₹2,000 and account limit ₹10,000 sets effective limit to ₹2,000", async () => {
    await createPolicy(1000000); // Account limit: ₹10,000
    await createOffer(150000);   // Product total: ₹1,500
    await seedAiIntent(200000);  // User limit: ₹2,000

    const req = new Request("http://localhost/api/payment/prepare", {
      method: "POST",
      body: JSON.stringify({
        offerId,
        quantity: 1,
        policyId,
        correlationId,
      }),
    });

    const res = await preparePOST(req);
    const data = await res.json();

    expect(data.effectiveLimit).toBe(200000);
    expect(data.accountPolicyMaximum).toBe(1000000);
    expect(data.userRequestedBudget).toBe(200000);
  });

  // 6. User ₹15,000 + account limit ₹10,000 → effective ₹10,000.
  test("Check 6: User limit ₹15,000 and account limit ₹10,000 sets effective limit to ₹10,000", async () => {
    await createPolicy(1000000); // Account limit: ₹10,000
    await createOffer(1100000);  // Product total: ₹11,000 (breaches account limit)
    await seedAiIntent(1500000); // User limit: ₹15,000

    const req = new Request("http://localhost/api/payment/prepare", {
      method: "POST",
      body: JSON.stringify({
        offerId,
        quantity: 1,
        policyId,
        correlationId,
      }),
    });

    const res = await preparePOST(req);
    const data = await res.json();

    expect(data.allowed).toBe(false);
    expect(data.effectiveLimit).toBe(1000000); // Caps at account limit ₹10,000
    expect(data.reasons[0]).toContain("exceeds your ₹10000 limit");
  });

  // 7. No user budget + account limit ₹10,000 → effective ₹10,000.
  test("Check 7: No user budget constraints falls back to account limit ₹10,000", async () => {
    await createPolicy(1000000); // Account limit: ₹10,000
    await createOffer(900000);   // Product total: ₹9,000
    await seedAiIntent(null);    // No user limit specified

    const req = new Request("http://localhost/api/payment/prepare", {
      method: "POST",
      body: JSON.stringify({
        offerId,
        quantity: 1,
        policyId,
        correlationId,
      }),
    });

    const res = await preparePOST(req);
    const data = await res.json();

    expect(data.allowed).toBe(true);
    expect(data.effectiveLimit).toBe(1000000);
  });

  // 8. Client attempts to modify price → server ignores it.
  test("Check 8: Server ignores client-supplied price or amount parameter overrides", async () => {
    await createPolicy(1000000);
    await createOffer(40000); // Authentic DB price is ₹400
    await seedAiIntent(50000);

    // Client passes a lower hijacked price in the body parameters
    const req = new Request("http://localhost/api/payment/prepare", {
      method: "POST",
      body: JSON.stringify({
        offerId,
        quantity: 1,
        policyId,
        correlationId,
        pricePaise: 1000,       // Tampered price
        totalPaise: 1000,       // Tampered total
        approvedAmountPaise: 10 // Tampered limit
      } as any),
    });

    const res = await preparePOST(req);
    const data = await res.json();

    expect(data.allowed).toBe(true);
    // Server still evaluates and approves the correct database price of ₹400
    expect(data.approval.approvedAmountPaise).toBe(40000);
  });

  // 9. Client attempts to modify budget during checkout → server ignores it.
  test("Check 9: Client attempts to modify budget during checkout are ignored by server", async () => {
    await createPolicy(1000000);
    await createOffer(40000);
    await seedAiIntent(50000);

    // 1. Prepare
    const prepReq = new Request("http://localhost/api/payment/prepare", {
      method: "POST",
      body: JSON.stringify({ offerId, quantity: 1, policyId, correlationId }),
    });
    const prepRes = await preparePOST(prepReq);
    const prepData = await prepRes.json();
    const approvalId = prepData.approval.id;

    // Approve
    const approveReq = new Request("http://localhost/api/payment/approve", {
      method: "POST",
      body: JSON.stringify({ approvalId }),
    });
    const approveRes = await approvePOST(approveReq);
    const approveData = await approveRes.json();
    expect(approveData.allowed).toBe(true);
    expect(approveData.status).toBe("APPROVED");

    // 2. Checkout (Client passes fake budget settings to test server protection)
    const checkReq = new Request("http://localhost/api/payment/checkout", {
      method: "POST",
      body: JSON.stringify({
        approvalId,
        maxBudgetPaise: 9999999, // Hacked budget override parameter
        policy: { maxAmountPaise: 9999999 } // Hacked policy limit override
      } as any),
    });

    const checkRes = await checkoutPOST(checkReq);
    const checkData = await checkRes.json();

    expect(checkData.allowed).toBe(true);
    // The amount in order creation matches authentic DB price + shipping only
    expect(checkData.amount).toBe(40000);
  });

  // 10. Price increase after approval still invalidates the purchase.
  test("Check 10: Price increase after approval invalidates the checkout flow", async () => {
    await createPolicy(50000); // Account safety limit: ₹500
    await createOffer(45000);  // Offer price: ₹450
    await seedAiIntent(50000);  // User requested budget: ₹500

    // 1. Prepare at ₹450 (passes)
    const prepReq = new Request("http://localhost/api/payment/prepare", {
      method: "POST",
      body: JSON.stringify({ offerId, quantity: 1, policyId, correlationId }),
    });
    const prepRes = await preparePOST(prepReq);
    const prepData = await prepRes.json();
    const approvalId = prepData.approval.id;

    // Approve
    const approveReq = new Request("http://localhost/api/payment/approve", {
      method: "POST",
      body: JSON.stringify({ approvalId }),
    });
    const approveRes = await approvePOST(approveReq);
    const approveData = await approveRes.json();
    expect(approveData.allowed).toBe(true);
    expect(approveData.status).toBe("APPROVED");

    // 2. Simulate merchant price spike to ₹550 in DB
    await createOffer(55000);

    // 3. Checkout (must fail spike protection)
    const checkReq = new Request("http://localhost/api/payment/checkout", {
      method: "POST",
      body: JSON.stringify({ approvalId }),
    });

    const checkRes = await checkoutPOST(checkReq);
    const checkData = await checkRes.json();

    expect(checkData.allowed).toBe(false);
    expect(checkData.reason).toContain("price no longer satisfies the approved purchase policy");

    // 4. Verify Approval is marked INVALIDATED in database
    const finalApproval = await db.purchaseApproval.findUnique({
      where: { id: approvalId },
    });
    expect(finalApproval?.status).toBe("INVALIDATED");
  });

  // 11. Natural language budget parsing regression tests
  test("Check 11: Natural language budget parsing regression tests", () => {
    const testCases = [
      { input: "under ₹500", rupees: 500, paise: 50000 },
      { input: "under ₹1,00,000", rupees: 100000, paise: 10000000 },
      { input: "under ₹2,000", rupees: 2000, paise: 200000 },
      { input: "under ₹10,000", rupees: 10000, paise: 1000000 },
      { input: "under ₹50,000", rupees: 50000, paise: 5000000 },
      { input: "under ₹1,00,000", rupees: 100000, paise: 10000000 },
      { input: "below Rs 2,000", rupees: 2000, paise: 200000 },
      { input: "under INR 2,000", rupees: 2000, paise: 200000 },
      { input: "less than 2,000 rupees", rupees: 2000, paise: 200000 },
      { input: "budget is ₹2,000", rupees: 2000, paise: 200000 },
      { input: "I need wireless headphones under ₹2,000", rupees: 2000, paise: 200000 },
      { input: "Find me a laptop under ₹60,000", rupees: 60000, paise: 6000000 },
      { input: "I need a phone below ₹15,000", rupees: 15000, paise: 1500000 },
      { input: "gift under ₹1,500", rupees: 1500, paise: 150000 },
    ];

    for (const tc of testCases) {
      const parsedRupees = parseBudgetToRupees(tc.input);
      const parsedPaise = parseBudgetToPaise(tc.input);
      expect(parsedRupees).toBe(tc.rupees);
      expect(parsedPaise).toBe(tc.paise);
    }
  });

  // 12. End-to-end regression test
  test("Check 12: End-to-end user flow for wireless headphones under ₹2,000", async () => {
    // 1. Simulate user query parsing
    const userQuery = "I need wireless headphones under ₹2,000";
    const parsedBudget = parseBudgetToPaise(userQuery);
    expect(parsedBudget).toBe(200000);

    // 2. Prepare database rules & offers
    await createPolicy(1000000); // Account maximum safety limit: ₹10,000
    await seedAiIntent(parsedBudget); // AI intent parsed: ₹2,000

    // Test product 1: costing ₹1,900 (allowed)
    await createOffer(190000);
    const req1 = new Request("http://localhost/api/payment/prepare", {
      method: "POST",
      body: JSON.stringify({ offerId, quantity: 1, policyId, correlationId }),
    });
    const res1 = await preparePOST(req1);
    const data1 = await res1.json();
    expect(data1.allowed).toBe(true);
    expect(data1.effectiveLimit).toBe(200000); // Should be min(₹2000, ₹10000) = ₹2000

    // Test product 2: costing ₹2,100 (blocked)
    await createOffer(210000);
    const req2 = new Request("http://localhost/api/payment/prepare", {
      method: "POST",
      body: JSON.stringify({ offerId, quantity: 1, policyId, correlationId }),
    });
    const res2 = await preparePOST(req2);
    const data2 = await res2.json();
    expect(data2.allowed).toBe(false);
    expect(data2.effectiveLimit).toBe(200000);
  });

  // 13. Dynamic budget checks from Task 7 (Items 1-4)
  test("Check 13: Parsed budgets for natural language queries are correct", () => {
    expect(parseBudgetToPaise("I need wireless headphones under ₹2,000")).toBe(200000);
    expect(parseBudgetToPaise("I need a laptop under ₹60,000")).toBe(6000000);
    expect(parseBudgetToPaise("I need a phone under ₹20,000")).toBe(2000000);
    expect(parseBudgetToPaise("Find running shoes under ₹4,000")).toBe(400000);
  });

  // 14. Verification of ₹44,100 laptop with a ₹60,000 requested budget (Item 5)
  test("Check 14: Laptop of ₹44,100 with ₹60,000 requested budget is allowed when account policy permits", async () => {
    await createPolicy(10000000); // Account safety limit: ₹100,000 (10,000,000 paise)
    await createOffer(4410000);    // Laptop total: ₹44,100 (4,410,000 paise)
    await seedAiIntent(6000000);   // User limit: ₹60,000 (6,000,000 paise)

    const req = new Request("http://localhost/api/payment/prepare", {
      method: "POST",
      body: JSON.stringify({ offerId, quantity: 1, policyId, correlationId }),
    });
    const res = await preparePOST(req);
    const data = await res.json();
    expect(data.allowed).toBe(true);
    expect(data.effectiveLimit).toBe(6000000); // min(₹60k, ₹100k) = ₹60k
    expect(data.userRequestedBudget).toBe(6000000);
    expect(data.accountPolicyMaximum).toBe(10000000);
  });

  // 15. Verify a product above the effective limit is blocked (Item 6)
  test("Check 15: Product above effective limit is blocked and returns correct limit details", async () => {
    await createPolicy(10000000); // Account safety limit: ₹100,000
    await createOffer(6500000);    // Product total: ₹65,000
    await seedAiIntent(6000000);   // User limit: ₹60,000 (effectiveLimit = ₹60,000)

    const req = new Request("http://localhost/api/payment/prepare", {
      method: "POST",
      body: JSON.stringify({ offerId, quantity: 1, policyId, correlationId }),
    });
    const res = await preparePOST(req);
    const data = await res.json();
    expect(data.allowed).toBe(false);
    expect(data.effectiveLimit).toBe(6000000);
    expect(data.userRequestedBudget).toBe(6000000);
    expect(data.accountPolicyMaximum).toBe(10000000);
  });

  // 16. Verify no-budget query (Item 7)
  test("Check 16: No-budget query uses accountPolicyMaximum as effectiveLimit", async () => {
    await createPolicy(10000000); // Account safety limit: ₹100,000
    await createOffer(4410000);    // Laptop total: ₹44,100
    await seedAiIntent(null);      // No user budget provided

    const req = new Request("http://localhost/api/payment/prepare", {
      method: "POST",
      body: JSON.stringify({ offerId, quantity: 1, policyId, correlationId }),
    });
    const res = await preparePOST(req);
    const data = await res.json();
    expect(data.allowed).toBe(true);
    expect(data.userRequestedBudget).toBeNull();
    expect(data.accountPolicyMaximum).toBe(10000000);
    expect(data.effectiveLimit).toBe(10000000);
  });
});
