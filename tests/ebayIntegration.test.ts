import { ebayTokenManager, EbayProvider, commerceService } from "../src/services/commerce";
import { parseIntentFromConversation } from "../src/services/intent";
import { filterEligibleProducts } from "../src/services/eligibility";
import { db } from "../src/lib/db";

describe("eBay Integration and Fallback Tests", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;
  let mockFetch: jest.Mock;
  let ebayResponses: any[] = [];

  const pushEbayResponse = (resp: any) => {
    ebayResponses.push(resp);
  };

  afterAll(async () => {
    await db.$disconnect();
  });

  beforeEach(() => {
    process.env.EBAY_ENVIRONMENT = "sandbox";
    process.env.EBAY_CLIENT_ID = "mock_client_id";
    process.env.EBAY_CLIENT_SECRET = "mock_client_secret";
    process.env.EBAY_MARKETPLACE_ID = "EBAY_US";
    
    ebayResponses = [];
    ebayTokenManager.resetCache();

    mockFetch = jest.fn((input: any, init: any) => {
      const url = typeof input === "string" ? input : input?.url || "";
      if (url.includes("ebay.com")) {
        const resp = ebayResponses.shift();
        if (!resp) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({}),
            text: async () => "{}",
          });
        }
        if (resp instanceof Error) return Promise.reject(resp);
        return Promise.resolve(resp);
      }
      return originalFetch(input, init);
    });
    global.fetch = mockFetch;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  // 1. OAuth success
  test("eBay authentication success", async () => {
    pushEbayResponse({
      ok: true,
      json: async () => ({
        access_token: "mock_access_token_123",
        expires_in: 7200,
      }),
    });

    const token = await ebayTokenManager.getToken();
    expect(token).toBe("mock_access_token_123");
  });

  // 2. OAuth failure
  test("eBay authentication failure", async () => {
    pushEbayResponse({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    const token = await ebayTokenManager.getToken();
    expect(token).toBeNull();
  });

  // 3. missing credentials
  test("missing eBay credentials handling", async () => {
    delete process.env.EBAY_CLIENT_ID;
    delete process.env.EBAY_CLIENT_SECRET;

    const token = await ebayTokenManager.getToken();
    expect(token).toBeNull();

    const provider = new EbayProvider();
    const results = await provider.search({ query: "laptop" });
    expect(results).toEqual([]);
  });

  // 4. token caching
  test("token caching prevents redundant HTTP requests", async () => {
    pushEbayResponse({
      ok: true,
      json: async () => ({
        access_token: "cached_token",
        expires_in: 3600,
      }),
    });

    const token1 = await ebayTokenManager.getToken();
    const token2 = await ebayTokenManager.getToken();

    expect(token1).toBe("cached_token");
    expect(token2).toBe("cached_token");
    
    // Filter out any non-ebay fetch calls
    const ebayCalls = mockFetch.mock.calls.filter(c => {
      const url = typeof c[0] === "string" ? c[0] : c[0]?.url || "";
      return url.includes("ebay.com");
    });
    expect(ebayCalls.length).toBe(1);
  });

  // 5. Browse API search
  test("eBay Browse API search mappings", async () => {
    pushEbayResponse({
      ok: true,
      json: async () => ({ access_token: "token", expires_in: 3600 }),
    });

    pushEbayResponse({
      ok: true,
      json: async () => ({
        itemSummaries: [
          {
            itemId: "112233",
            title: "eBay Laptop X1",
            image: { imageUrl: "http://image.jpg" },
            price: { value: "599.99", currency: "USD" },
            itemWebUrl: "http://ebay.com/item/112233",
            seller: { username: "super-seller" },
            brand: "Lenovo",
          },
        ],
      }),
    });

    const provider = new EbayProvider();
    const results = await provider.search({ query: "laptop" });
    expect(results.length).toBe(1);
    expect(results[0].productName).toBe("eBay Laptop X1");
    expect(results[0].pricePaise).toBe(59999);
    expect(results[0].currency).toBe("USD");
  });

  // 6. Browse API failure
  test("eBay Browse API failure returns empty array and does not crash", async () => {
    pushEbayResponse({
      ok: true,
      json: async () => ({ access_token: "token", expires_in: 3600 }),
    });

    pushEbayResponse({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const provider = new EbayProvider();
    const results = await provider.search({ query: "laptop" });
    expect(results).toEqual([]);
  });

  // 7. eBay response normalization & 8. missing eBay fields remain null/unknown & 24. product URL is preserved correctly
  test("eBay response normalization leaves unknown fields null/unknown", async () => {
    pushEbayResponse({
      ok: true,
      json: async () => ({ access_token: "token", expires_in: 3600 }),
    });

    pushEbayResponse({
      ok: true,
      json: async () => ({
        itemSummaries: [
          {
            itemId: "123",
            title: "Minimal Item",
            price: { value: "10.00", currency: "USD" },
            itemWebUrl: "https://ebay.com/minimal",
          },
        ],
      }),
    });

    const provider = new EbayProvider();
    const results = await provider.search({ query: "laptop" });
    expect(results[0]).toEqual(expect.objectContaining({
      source: "ebay",
      isRazorpayEnabled: false,
      brand: null,
      description: null,
      sellerRating: null,
      deliveryEstimate: "unknown",
      productUrl: "https://ebay.com/minimal",
    }));
  });

  // 9. currency preservation & 10. marketplace preservation
  test("currency and marketplace preservation", async () => {
    process.env.EBAY_MARKETPLACE_ID = "EBAY_IN";
    
    pushEbayResponse({
      ok: true,
      json: async () => ({ access_token: "token", expires_in: 3600 }),
    });

    pushEbayResponse({
      ok: true,
      json: async () => ({
        itemSummaries: [
          {
            itemId: "456",
            title: "Rupee Item",
            price: { value: "1500.00", currency: "INR" },
            itemWebUrl: "https://ebay.in/item/456",
          },
        ],
      }),
    });

    const provider = new EbayProvider();
    const results = await provider.search({ query: "laptop" });
    expect(results[0].currency).toBe("INR");
    
    const ebayCalls = mockFetch.mock.calls.filter(c => {
      const url = typeof c[0] === "string" ? c[0] : c[0]?.url || "";
      return url.includes("ebay.com");
    });
    const lastCall = ebayCalls[ebayCalls.length - 1];
    expect(lastCall[0]).toContain("https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search");
    expect(lastCall[1].headers["X-EBAY-C-MARKETPLACE-ID"]).toBe("EBAY_IN");
  });

  // 11. eBay provider enters CommerceService
  test("eBay provider integrates into CommerceService coordinator", async () => {
    pushEbayResponse({
      ok: true,
      json: async () => ({ access_token: "token", expires_in: 3600 }),
    });

    pushEbayResponse({
      ok: true,
      json: async () => ({
        itemSummaries: [
          {
            itemId: "ebay-999",
            title: "eBay Laptop X2",
            price: { value: "700.00", currency: "USD" },
            itemWebUrl: "http://ebay.com/item/ebay-999",
          },
        ],
      }),
    });

    const offers = await commerceService.searchProducts({ query: "laptop" });
    const hasEbay = offers.some(o => o.source.toLowerCase() === "ebay");
    const hasSynthetic = offers.some(o => o.source.toLowerCase() === "synthetic");
    expect(hasEbay).toBe(true);
    expect(hasSynthetic).toBe(true);
  });

  // 12. synthetic provider still works if eBay fails
  test("synthetic provider operates normally when eBay fails", async () => {
    pushEbayResponse({
      ok: false,
      status: 500,
      text: async () => "Error",
    });

    const offers = await commerceService.searchProducts({ query: "laptop" });
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every(o => o.source.toLowerCase() === "synthetic")).toBe(true);
  });

  // 13. laptop query rejects headphones & 14. headphones query rejects laptops
  test("hard eligibility filters category mismatches", () => {
    const mockOfferLaptop = {
      canonicalProductId: "prod-laptop",
      productName: "Dell Inspiron Laptop",
      category: "electronics",
      brand: "Dell",
      offerId: "offer-laptop",
      pricePaise: 4500000,
      shippingCostPaise: 0,
      sellerRating: 4.5,
      availability: true,
      source: "ebay",
      isRazorpayEnabled: false,
      currency: "INR",
    } as any;

    const mockOfferHeadphones = {
      canonicalProductId: "prod-headphones",
      productName: "Sony Wireless Headphones",
      category: "electronics",
      brand: "Sony",
      offerId: "offer-headphones",
      pricePaise: 150000,
      shippingCostPaise: 0,
      sellerRating: 4.8,
      availability: true,
      source: "ebay",
      isRazorpayEnabled: false,
      currency: "INR",
    } as any;

    const laptopIntent = {
      category: "electronics",
      subcategory: "laptops",
      query: "laptop",
    } as any;

    const filtered = filterEligibleProducts([mockOfferLaptop, mockOfferHeadphones], laptopIntent);
    expect(filtered.length).toBe(1);
    expect(filtered[0].offerId).toBe("offer-laptop");
  });

  // 15. phone + battery does not become cricket bat
  test("phone query containing battery parses under smartphones category", async () => {
    const res = await parseIntentFromConversation("I need a phone with good battery under ₹20,000", []);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("smartphones");
  });

  // 16. ₹2,000 budget translates exactly to 200000 paise in intent parsing
  test("₹2,000 budget translates exactly to 200000 paise in intent parsing", async () => {
    const res = await parseIntentFromConversation("I need wireless headphones under ₹2,000", []);
    expect(res.extractedIntent?.maxBudgetPaise).toBe(200000);
  });

  // 17. laptop without budget leaves maxBudgetPaise null
  test("laptop without budget leaves maxBudgetPaise null", async () => {
    const res = await parseIntentFromConversation("Find me a laptop", []);
    expect(res.extractedIntent?.maxBudgetPaise).toBeNull();
  });

  // 18. eBay result uses VIEW ON EBAY & 19. eBay result cannot trigger Razorpay
  test("eBay offer results flag Razorpay checkout as disabled", async () => {
    pushEbayResponse({
      ok: true,
      json: async () => ({ access_token: "token", expires_in: 3600 }),
    });
    pushEbayResponse({
      ok: true,
      json: async () => ({
        itemSummaries: [{ itemId: "1", title: "Item 1", price: { value: "10.00" } }],
      }),
    });

    const provider = new EbayProvider();
    const results = await provider.search({ query: "laptop" });
    expect(results[0].isRazorpayEnabled).toBe(false);
    expect(results[0].source).toBe("ebay");
  });

  // 20. secrets are never returned to client
  test("oauth Client Secret or token never returned to client", async () => {
    pushEbayResponse({
      ok: true,
      json: async () => ({ access_token: "token_secret_value", expires_in: 3600 }),
    });
    pushEbayResponse({
      ok: true,
      json: async () => ({
        itemSummaries: [{ itemId: "1", title: "Item 1", price: { value: "10.00" } }],
      }),
    });

    const provider = new EbayProvider();
    const results = await provider.search({ query: "laptop" });
    const resultString = JSON.stringify(results);
    expect(resultString).not.toContain("mock_client_secret");
    expect(resultString).not.toContain("token_secret_value");
  });

  // 22. mixed Synthetic + eBay results can be normalized
  test("mixed Synthetic + eBay results normalization check", async () => {
    pushEbayResponse({
      ok: true,
      json: async () => ({ access_token: "token", expires_in: 3600 }),
    });
    pushEbayResponse({
      ok: true,
      json: async () => ({
        itemSummaries: [{ itemId: "1", title: "eBay Product", price: { value: "10.00" } }],
      }),
    });

    const results = await commerceService.searchProducts({ query: "laptop" });
    const hasEbay = results.some(r => r.source.toLowerCase() === "ebay" && r.isRazorpayEnabled === false);
    const hasSynthetic = results.some(r => r.source.toLowerCase() === "synthetic" && r.isRazorpayEnabled === true);
    expect(hasEbay).toBe(true);
    expect(hasSynthetic).toBe(true);
  });

  // 23. provider failure does not crash /api/chat
  test("provider failure does not crash /api/chat execution flow", async () => {
    pushEbayResponse({
      ok: false,
      status: 500,
      text: async () => "Browse API Crash",
    });

    const results = await commerceService.searchProducts({ query: "laptop" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.source.toLowerCase() === "synthetic")).toBe(true);
  });

  // 25. provider status metadata is correctly populated
  test("provider status metadata is correctly populated for successful search", async () => {
    pushEbayResponse({
      ok: true,
      json: async () => ({ access_token: "token", expires_in: 3600 }),
    });
    pushEbayResponse({
      ok: true,
      json: async () => ({
        itemSummaries: [{ itemId: "1", title: "eBay Product", price: { value: "10.00" } }],
      }),
    });

    const providerStatuses: Record<string, string> = {};
    const results = await commerceService.searchProducts({ query: "laptop", providerStatuses });
    expect(providerStatuses.ebay).toBe("CONNECTED_RESULTS");
    expect(providerStatuses.synthetic).toBe("CONNECTED_RESULTS");
  });

  // 26. synthetic provider operates normally when eBay has zero results
  test("synthetic provider operates normally when eBay has zero results", async () => {
    pushEbayResponse({
      ok: true,
      json: async () => ({ access_token: "token", expires_in: 3600 }),
    });
    pushEbayResponse({
      ok: true,
      json: async () => ({ itemSummaries: [] }),
    });

    const offers = await commerceService.searchProducts({ query: "laptop" });
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every(o => o.source.toLowerCase() === "synthetic")).toBe(true);
  });

  // 27. eBay-only request with zero results
  test("eBay-only request with zero results", async () => {
    pushEbayResponse({
      ok: true,
      json: async () => ({ access_token: "token", expires_in: 3600 }),
    });
    pushEbayResponse({
      ok: true,
      json: async () => ({ itemSummaries: [] }),
    });

    const providerStatuses: Record<string, string> = {};
    const offers = await commerceService.searchProducts({ query: "laptop", source: "ebay", providerStatuses });
    expect(offers.length).toBe(0);
    expect(providerStatuses.ebay).toBe("CONNECTED_ZERO");
  });

  // 28. INR budget filtering excludes USD results on USD marketplace
  test("INR budget filtering excludes USD results on USD marketplace", async () => {
    pushEbayResponse({
      ok: true,
      json: async () => ({ access_token: "token", expires_in: 3600 }),
    });

    const providerStatuses: Record<string, string> = {};
    const provider = new EbayProvider();
    const results = await provider.search({ query: "laptop", maxPricePaise: 200000, providerStatuses });
    expect(results.length).toBe(0);
    expect(providerStatuses.ebay).toBe("CONNECTED_ZERO");
  });

  // 29. Synthetic offers are marked as Razorpay enabled
  test("Synthetic offers are marked as Razorpay enabled", async () => {
    const results = await commerceService.searchProducts({ query: "laptop", source: "synthetic" });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].isRazorpayEnabled).toBe(true);
    expect(results[0].source.toLowerCase()).toBe("synthetic");
  });
});
