import { calculateBuyerScore, rankProducts, UserShoppingIntent } from "../src/services/scoring";
import { NormalizedOffer } from "../src/services/commerce";

describe("Buyer Scoring Engine Tests", () => {
  const dummyOffer: NormalizedOffer = {
    canonicalProductId: "prod-1",
    productName: "Funskool Chess Set",
    brand: "Funskool",
    category: "chess/games",
    description: "Funskool Chess Set with plastic board and standard tokens.",
    attributes: {},
    merchantId: "merch-1",
    merchantName: "Bazaar Depot",
    isMerchantActive: true,
    isRazorpayEnabled: true,
    source: "SYNTHETIC",
    offerId: "offer-1",
    sourceProductId: "syn-1",
    pricePaise: 40000, // ₹400
    currency: "INR",
    discount: 10,
    sellerRating: 4.5,
    availability: true,
    shippingCostPaise: 5000, // ₹50 (Total ₹450)
    deliveryEstimate: "2 days",
    productUrl: "http://example.com/1",
    imageUrl: null,
    priceFetchedAt: new Date(),
  };

  const intent: UserShoppingIntent = {
    keywords: ["chess", "funskool"],
    maxBudgetINR: 500,
    category: "chess/games",
  };

  test("Default best_value scoring computes correct overall score", () => {
    const breakdown = calculateBuyerScore(dummyOffer, intent, "best_value");
    expect(breakdown.overallScore).toBeGreaterThan(0);
    expect(breakdown.overallScore).toBeLessThanOrEqual(100);
    expect(breakdown.reasons.length).toBeGreaterThan(0);
  });

  test("Cheapest objective ranks cheaper product higher", () => {
    const expensiveFastOffer: NormalizedOffer = {
      ...dummyOffer,
      offerId: "offer-expensive",
      pricePaise: 45000,
      shippingCostPaise: 0, // Total ₹450
      deliveryEstimate: "Same day",
    };

    const cheapSlowOffer: NormalizedOffer = {
      ...dummyOffer,
      offerId: "offer-cheap",
      pricePaise: 25000,
      shippingCostPaise: 3000, // Total ₹280
      deliveryEstimate: "7 days",
    };

    const results = rankProducts([expensiveFastOffer, cheapSlowOffer], intent, "cheapest");
    expect(results[0].offer.offerId).toBe("offer-cheap");
    expect(results[0].scoreBreakdown.budgetScore).toBeGreaterThan(results[1].scoreBreakdown.budgetScore);
  });

  test("Fastest objective ranks faster product higher", () => {
    const expensiveFastOffer: NormalizedOffer = {
      ...dummyOffer,
      offerId: "offer-expensive",
      pricePaise: 45000,
      shippingCostPaise: 0, // Total ₹450
      deliveryEstimate: "Same day",
    };

    const cheapSlowOffer: NormalizedOffer = {
      ...dummyOffer,
      offerId: "offer-cheap",
      pricePaise: 25000,
      shippingCostPaise: 3000, // Total ₹280
      deliveryEstimate: "7 days",
    };

    const results = rankProducts([expensiveFastOffer, cheapSlowOffer], intent, "fastest");
    expect(results[0].offer.offerId).toBe("offer-expensive");
    expect(results[0].scoreBreakdown.deliveryScore).toBeGreaterThan(results[1].scoreBreakdown.deliveryScore);
  });

  test("Highest Quality objective ranks product with better seller rating higher", () => {
    const highQualityOffer: NormalizedOffer = {
      ...dummyOffer,
      offerId: "offer-high-q",
      sellerRating: 4.9,
    };

    const lowQualityOffer: NormalizedOffer = {
      ...dummyOffer,
      offerId: "offer-low-q",
      sellerRating: 3.5,
    };

    const results = rankProducts([highQualityOffer, lowQualityOffer], intent, "highest_quality");
    expect(results[0].offer.offerId).toBe("offer-high-q");
  });

  test("Out of budget offer is penalized heavily on budgetScore", () => {
    const overBudgetOffer: NormalizedOffer = {
      ...dummyOffer,
      pricePaise: 60000, // ₹600 (Budget is ₹500)
    };

    const breakdown = calculateBuyerScore(overBudgetOffer, intent, "best_value");
    expect(breakdown.budgetScore).toBeLessThan(50);
    expect(breakdown.tradeoffs).toContain("Exceeds approved budget by ₹150");
  });
});
