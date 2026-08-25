import { commerceService } from "../src/services/commerce";

describe("Commerce Tokenized Search Tests", () => {
  test("I want a chess set", async () => {
    const results = await commerceService.searchProducts({ query: "I want a chess set" });
    expect(results.length).toBeGreaterThan(0);
    // Verified that results contain chess
    const matches = results.every(o => o.productName.toLowerCase().includes("chess") || o.category.includes("chess"));
    expect(matches).toBe(true);
  });

  test("I need a chess set", async () => {
    const results = await commerceService.searchProducts({ query: "I need a chess set" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].productName.toLowerCase()).toContain("chess");
  });

  test("Find me a chess gift", async () => {
    const results = await commerceService.searchProducts({ query: "Find me a chess gift" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].productName.toLowerCase()).toContain("chess");
  });

  test("Show me a cricket bat", async () => {
    const results = await commerceService.searchProducts({ query: "Show me a cricket bat" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].productName.toLowerCase()).toContain("cricket");
  });

  test("I need a cricket bat under ₹1000", async () => {
    const results = await commerceService.searchProducts({ 
      query: "I need a cricket bat under ₹1000",
      maxPricePaise: 100000 
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].productName.toLowerCase()).toContain("cricket");
    
    // Check budget constraint on all returned items
    const underBudget = results.every(o => (o.pricePaise + o.shippingCostPaise) <= 100000);
    expect(underBudget).toBe(true);
  });

  test("Find a birthday gift for my brother", async () => {
    // Should tokenise to birthday, gift, brother. Since "birthday", "gift", "brother" match the catalog items.
    const results = await commerceService.searchProducts({ query: "Find a birthday gift for my brother" });
    expect(results.length).toBeGreaterThan(0);
  });

  test("Please find something for chess", async () => {
    const results = await commerceService.searchProducts({ query: "Please find something for chess" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].productName.toLowerCase()).toContain("chess");
  });

  test("Can you show me cricket products", async () => {
    const results = await commerceService.searchProducts({ query: "Can you show me cricket products" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].productName.toLowerCase()).toContain("cricket");
  });

  test("chess (simple keyword)", async () => {
    const results = await commerceService.searchProducts({ query: "chess" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].productName.toLowerCase()).toContain("chess");
  });

  test("SG Cricket Bat (exact model search)", async () => {
    const results = await commerceService.searchProducts({ query: "SG Cricket Bat" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].productName.toLowerCase()).toContain("cricket");
  });

  test("I need a chess set under ₹500 applies filter correctly", async () => {
    const results = await commerceService.searchProducts({ 
      query: "I need a chess set under ₹500",
      maxPricePaise: 50000
    });
    expect(results.length).toBeGreaterThan(0);
    // Verifies all items are <= ₹500 (50000 paise)
    const allUnder500 = results.every(o => (o.pricePaise + o.shippingCostPaise) <= 50000);
    expect(allUnder500).toBe(true);
  });
});
