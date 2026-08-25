import { commerceService } from "../src/services/commerce";
import { db } from "../src/lib/db";

describe("Commerce Service Tests", () => {
  // Ensure we close database connections after testing
  afterAll(async () => {
    await db.$disconnect();
  });

  // 1. Search "chess"
  test("Search query 'chess' returns chess related offers", async () => {
    const results = await commerceService.searchProducts({ query: "chess" });
    expect(results.length).toBeGreaterThan(0);
    results.forEach((offer) => {
      const match =
        offer.productName.toLowerCase().includes("chess") ||
        (offer.description && offer.description.toLowerCase().includes("chess")) ||
        offer.category.toLowerCase().includes("chess");
      expect(match).toBe(true);
    });
  });

  // 2. Search "cricket"
  test("Search query 'cricket' returns cricket related offers", async () => {
    const results = await commerceService.searchProducts({ query: "cricket" });
    expect(results.length).toBeGreaterThan(0);
    results.forEach((offer) => {
      const match =
        offer.productName.toLowerCase().includes("cricket") ||
        (offer.description && offer.description.toLowerCase().includes("cricket")) ||
        offer.category.toLowerCase().includes("cricket");
      expect(match).toBe(true);
    });
  });

  // 3. Search with budget ₹500 (50000 paise)
  test("Budget filter ₹500 restricts price + shipping <= 50000 paise", async () => {
    const results = await commerceService.searchProducts({ maxPricePaise: 50000 });
    expect(results.length).toBeGreaterThan(0);
    results.forEach((offer) => {
      expect(offer.pricePaise + offer.shippingCostPaise).toBeLessThanOrEqual(50000);
    });
  });

  // 4. Search with budget ₹300 (30000 paise)
  test("Budget filter ₹300 restricts price + shipping <= 30000 paise", async () => {
    const results = await commerceService.searchProducts({ maxPricePaise: 30000 });
    results.forEach((offer) => {
      expect(offer.pricePaise + offer.shippingCostPaise).toBeLessThanOrEqual(30000);
    });
  });

  // 5. Search only in-stock products
  test("Availability filter IN_STOCK returns only available products", async () => {
    const results = await commerceService.searchProducts({ availability: "IN_STOCK" });
    expect(results.length).toBeGreaterThan(0);
    results.forEach((offer) => {
      expect(offer.availability).toBe(true);
    });
  });

  // 6. Search specific merchant
  test("Merchant filter limits offers to that merchant", async () => {
    const merchantId = "merchant-sports-games";
    const results = await commerceService.searchProducts({ merchantId });
    expect(results.length).toBeGreaterThan(0);
    results.forEach((offer) => {
      expect(offer.merchantId).toBe(merchantId);
    });
  });

  // 7. Search category
  test("Category filter restricts offers to specified category", async () => {
    const category = "electronics";
    const results = await commerceService.searchProducts({ category });
    expect(results.length).toBeGreaterThan(0);
    results.forEach((offer) => {
      expect(offer.category).toBe(category);
    });
  });

  // 8. Sorting by price low to high
  test("Sorting by price_low_to_high sorts asc by price + shipping", async () => {
    const results = await commerceService.searchProducts({ sortBy: "price_low_to_high" });
    expect(results.length).toBeGreaterThan(1);
    for (let i = 0; i < results.length - 1; i++) {
      const currentTotal = results[i].pricePaise + results[i].shippingCostPaise;
      const nextTotal = results[i + 1].pricePaise + results[i + 1].shippingCostPaise;
      expect(currentTotal).toBeLessThanOrEqual(nextTotal);
    }
  });

  // 9. Sorting by fastest delivery
  test("Sorting by fastest_delivery sorts ascending by delivery time", async () => {
    const results = await commerceService.searchProducts({ sortBy: "fastest_delivery" });
    expect(results.length).toBeGreaterThan(1);
    
    const parseDeliveryDays = (estimate: string): number => {
      const cleaned = estimate.toLowerCase().trim();
      if (cleaned.includes("same day") || cleaned.includes("0 day")) return 0;
      const match = cleaned.match(/(\d+)\s*day/);
      return match ? parseInt(match[1]) : 7;
    };

    for (let i = 0; i < results.length - 1; i++) {
      const currentDays = parseDeliveryDays(results[i].deliveryEstimate);
      const nextDays = parseDeliveryDays(results[i + 1].deliveryEstimate);
      expect(currentDays).toBeLessThanOrEqual(nextDays);
    }
  });

  // 10. Canonical product retrieval with multiple offers
  test("getProduct retrieves canonical product and all its offers", async () => {
    const product = await commerceService.getProduct("prod-chess-set");
    expect(product).not.toBeNull();
    expect(product!.canonicalName).toBe("Funskool Chess Set");
    // Under seed config, Funskool Chess set has offers from multiple merchants
    expect(product!.offers.length).toBeGreaterThan(1);
  });

  // 11. Empty results for nonexistent product
  test("getProduct for nonexistent ID returns null", async () => {
    const product = await commerceService.getProduct("nonexistent-id");
    expect(product).toBeNull();
  });

  // 12. Retrieve the dynamic price-spike product
  test("getProduct retrieves dynamic test product", async () => {
    const product = await commerceService.getProduct("prod-dynamic-test");
    expect(product).not.toBeNull();
    expect(product!.canonicalName).toBe("Dynamic Price Test Item");
    expect(product!.offers[0].sourceProductId).toBe("dynamic-price-test");
  });
});
