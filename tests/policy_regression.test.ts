import { evaluatePurchasePolicy, PolicyEvaluationParams } from "../src/services/policy";
import { runLocalFallback } from "../src/services/intent";

describe("Policy Engine Regression Tests", () => {
  const basePolicy = {
    id: "p1",
    name: "Standard",
    maxAmountPaise: 10000000, // ₹100,000
    currency: "INR",
    allowedMerchants: JSON.stringify(["m1"]),
    blockedCategories: "[]",
    maxQuantity: 5,
    expiresAt: null,
  };

  const baseParams: PolicyEvaluationParams = {
    productId: "p1",
    offerId: "o1",
    merchantId: "m1",
    quantity: 1,
    productPricePaise: 49000, // ₹490
    shippingPaise: 0,
    totalPaise: 49000,
    currency: "INR",
    policy: basePolicy,
    deliveryEstimateDays: 4,
    maxDeliveryDays: null,
  };

  test("No explicit delivery requirement -> 4-day product is NOT blocked", () => {
    const result = evaluatePurchasePolicy({ ...baseParams, maxDeliveryDays: null });
    expect(result.allowed).toBe(true);
    const delCheck = result.checks.find(c => c.name === "DELIVERY_SPEED");
    expect(delCheck?.state).toBe("NOT_REQUESTED");
  });

  test("Explicit 3-day delivery -> 4-day product blocked", () => {
    const result = evaluatePurchasePolicy({ ...baseParams, maxDeliveryDays: 3 });
    expect(result.allowed).toBe(false);
    const delCheck = result.checks.find(c => c.name === "DELIVERY_SPEED");
    expect(delCheck?.state).toBe("FAIL");
    expect(delCheck?.passed).toBe(false);
  });

  test("Explicit 3-day delivery -> 3-day product allowed", () => {
    const result = evaluatePurchasePolicy({ ...baseParams, maxDeliveryDays: 3, deliveryEstimateDays: 3 });
    expect(result.allowed).toBe(true);
    const delCheck = result.checks.find(c => c.name === "DELIVERY_SPEED");
    expect(delCheck?.state).toBe("PASS");
  });

  test("₹490 product with ₹100000 limit -> budget passes", () => {
    const result = evaluatePurchasePolicy(baseParams);
    const budCheck = result.checks.find(c => c.name === "MAX_SPEND");
    expect(budCheck?.passed).toBe(true);
    expect(budCheck?.state).toBe("PASS");
  });
});

describe("Intent Engine Regression Tests", () => {
  test("1. Follow-up budget inherits subject", () => {
    const history = [{ role: "user" as const, content: "Find me headphones" }];
    const res = runLocalFallback("under 2000", history);
    expect(res.extractedIntent?.category).toBe("electronics");
    expect(res.extractedIntent?.subcategory).toBe("headphones");
    expect(res.extractedIntent?.maxBudgetPaise).toBe(200000);
    expect(res.extractedIntent?.maxDeliveryDays).toBe(null);
  });

  test("2. Follow-up delivery inherits subject", () => {
    const history = [{ role: "user" as const, content: "Find me headphones" }];
    const res = runLocalFallback("within 3 days", history);
    expect(res.extractedIntent?.category).toBe("electronics");
    expect(res.extractedIntent?.maxDeliveryDays).toBe(3);
    expect(res.extractedIntent?.maxBudgetPaise).toBe(null);
  });

  test("3. Follow-up objective inherits subject", () => {
    const history = [{ role: "user" as const, content: "Find me headphones" }];
    const res = runLocalFallback("cheapest", history);
    expect(res.extractedIntent?.category).toBe("electronics");
    expect(res.extractedIntent?.objective).toBe("cheapest");
  });

  test("4. New product resets budget", () => {
    const history = [{ role: "user" as const, content: "Find me headphones under 2000" }];
    const res = runLocalFallback("Find me a chess board", history);
    expect(res.extractedIntent?.category).toBe("chess/games");
    expect(res.extractedIntent?.maxBudgetPaise).toBe(null);
  });

  test("5. New product resets delivery", () => {
    const history = [{ role: "user" as const, content: "Find me headphones within 3 days" }];
    const res = runLocalFallback("Find me a chess board", history);
    expect(res.extractedIntent?.maxDeliveryDays).toBe(null);
  });

  test("6. New product resets source preference", () => {
    const history = [{ role: "user" as const, content: "Find me headphones only ebay" }];
    const res = runLocalFallback("Find me a chess board", history);
    expect(res.extractedIntent?.sourcePreference).toBe(null);
  });

  test("8. under 500 after chess modifies chess request", () => {
    const history = [
      { role: "user" as const, content: "Find me headphones within 3 days" },
      { role: "user" as const, content: "Find me a chess board" }
    ];
    const res = runLocalFallback("under 500", history);
    expect(res.extractedIntent?.category).toBe("chess/games");
    expect(res.extractedIntent?.maxBudgetPaise).toBe(50000);
    expect(res.extractedIntent?.maxDeliveryDays).toBe(null);
  });

  test("10. Find me chess after headphones clears headphone constraints", () => {
    const history = [{ role: "user" as const, content: "Find me headphones under 2000 within 3 days" }];
    const res = runLocalFallback("Find me a chess board", history);
    expect(res.extractedIntent?.category).toBe("chess/games");
    expect(res.extractedIntent?.maxBudgetPaise).toBe(null);
    expect(res.extractedIntent?.maxDeliveryDays).toBe(null);
  });

  test("11. Find me chess under 500 does not inherit headphone delivery", () => {
    const history = [{ role: "user" as const, content: "Find me headphones under 2000 within 3 days" }];
    const res = runLocalFallback("Find me chess under 500", history);
    expect(res.extractedIntent?.category).toBe("chess/games");
    expect(res.extractedIntent?.maxBudgetPaise).toBe(50000);
    expect(res.extractedIntent?.maxDeliveryDays).toBe(null);
  });

  test("12. phone with good battery remains smartphones", () => {
    const res = runLocalFallback("Find me a phone with good battery", []);
    expect(res.extractedIntent?.category).toBe("electronics");
    expect(res.extractedIntent?.subcategory).toBe("smartphones");
  });
});
