import { isProductEligible, resolveProductType, filterEligibleProducts } from "../src/services/eligibility";
import { NormalizedOffer } from "../src/services/commerce";
import { ShoppingIntent } from "../src/services/intent";

describe("Catalog Generalization & Hard Product Eligibility Constraints", () => {
  // Helper function to build type-compliant ShoppingIntent
  function createTestIntent(params: Partial<ShoppingIntent>): ShoppingIntent {
    return {
      query: "",
      category: null,
      subcategory: null,
      preferences: [],
      excludedPreferences: [],
      maxBudgetPaise: null,
      currency: "INR",
      recipientAge: null,
      objective: "best_value",
      quantity: 1,
      sourcePreference: null,
      ...params
    };
  }

  // Helper mock offers for different categories/subcategories
  const laptopOffer: NormalizedOffer = {
    canonicalProductId: "prod-1",
    productName: "Lenovo IdeaPad Laptop 3",
    brand: "Lenovo",
    category: "electronics",
    description: "Highly rated 15.6 inch laptop with 8GB RAM.",
    attributes: { subcategory: "laptops", productType: "laptop" },
    merchantId: "m1",
    merchantName: "Bazaar Depot",
    isMerchantActive: true,
    isRazorpayEnabled: true,
    source: "SYNTHETIC",
    offerId: "o1",
    sourceProductId: "s1",
    pricePaise: 4500000,
    currency: "INR",
    discount: 10,
    sellerRating: 4.5,
    availability: true,
    shippingCostPaise: 0,
    deliveryEstimate: "2 days",
    productUrl: "",
    imageUrl: null,
    priceFetchedAt: new Date()
  };

  const headphonesOffer: NormalizedOffer = {
    canonicalProductId: "prod-2",
    productName: "Boat Rockerz Headphones 450",
    brand: "Boat",
    category: "electronics",
    description: "Over-ear wireless headphones with Bluetooth.",
    attributes: { subcategory: "headphones", productType: "headphones" },
    merchantId: "m1",
    merchantName: "Bazaar Depot",
    isMerchantActive: true,
    isRazorpayEnabled: true,
    source: "SYNTHETIC",
    offerId: "o2",
    sourceProductId: "s2",
    pricePaise: 180000,
    currency: "INR",
    discount: 5,
    sellerRating: 4.2,
    availability: true,
    shippingCostPaise: 0,
    deliveryEstimate: "3 days",
    productUrl: "",
    imageUrl: null,
    priceFetchedAt: new Date()
  };

  const earbudsOffer: NormalizedOffer = {
    canonicalProductId: "prod-3",
    productName: "Boat Airdopes Earbuds 131",
    brand: "Boat",
    category: "electronics",
    description: "TWS True Wireless Earbuds with charging case.",
    attributes: { subcategory: "earbuds", productType: "earbuds" },
    merchantId: "m1",
    merchantName: "Bazaar Depot",
    isMerchantActive: true,
    isRazorpayEnabled: true,
    source: "SYNTHETIC",
    offerId: "o3",
    sourceProductId: "s3",
    pricePaise: 120000,
    currency: "INR",
    discount: 0,
    sellerRating: 4.0,
    availability: true,
    shippingCostPaise: 5000,
    deliveryEstimate: "2 days",
    productUrl: "",
    imageUrl: null,
    priceFetchedAt: new Date()
  };

  const phoneOffer: NormalizedOffer = {
    canonicalProductId: "prod-4",
    productName: "Samsung Galaxy M34 Phone",
    brand: "Samsung",
    category: "electronics",
    description: "Android smartphone with 6000mAh battery.",
    attributes: { subcategory: "smartphones", productType: "smartphone" },
    merchantId: "m1",
    merchantName: "Bazaar Depot",
    isMerchantActive: true,
    isRazorpayEnabled: true,
    source: "SYNTHETIC",
    offerId: "o4",
    sourceProductId: "s4",
    pricePaise: 1800000,
    currency: "INR",
    discount: 15,
    sellerRating: 4.6,
    availability: true,
    shippingCostPaise: 0,
    deliveryEstimate: "Same day",
    productUrl: "",
    imageUrl: null,
    priceFetchedAt: new Date()
  };

  const tabletOffer: NormalizedOffer = {
    canonicalProductId: "prod-5",
    productName: "Apple iPad 10.9 inch",
    brand: "Apple",
    category: "electronics",
    description: "Latest model iPad tablet with A14 Bionic.",
    attributes: { subcategory: "tablets", productType: "tablet" },
    merchantId: "m1",
    merchantName: "Bazaar Depot",
    isMerchantActive: true,
    isRazorpayEnabled: true,
    source: "SYNTHETIC",
    offerId: "o5",
    sourceProductId: "s5",
    pricePaise: 3200000,
    currency: "INR",
    discount: 5,
    sellerRating: 4.8,
    availability: true,
    shippingCostPaise: 0,
    deliveryEstimate: "1 day",
    productUrl: "",
    imageUrl: null,
    priceFetchedAt: new Date()
  };

  const watchOffer: NormalizedOffer = {
    canonicalProductId: "prod-6",
    productName: "Noise ColorFit Smartwatch",
    brand: "Noise",
    category: "electronics",
    description: "Smartwatch with blood oxygen tracker.",
    attributes: { subcategory: "smartwatches", productType: "smartwatch" },
    merchantId: "m1",
    merchantName: "Bazaar Depot",
    isMerchantActive: true,
    isRazorpayEnabled: true,
    source: "SYNTHETIC",
    offerId: "o6",
    sourceProductId: "s6",
    pricePaise: 250000,
    currency: "INR",
    discount: 10,
    sellerRating: 4.1,
    availability: true,
    shippingCostPaise: 0,
    deliveryEstimate: "2 days",
    productUrl: "",
    imageUrl: null,
    priceFetchedAt: new Date()
  };

  const runningShoesOffer: NormalizedOffer = {
    canonicalProductId: "prod-7",
    productName: "Puma Nitro Running Shoes",
    brand: "Puma",
    category: "footwear",
    description: "Athletic running shoes with foam cushioning.",
    attributes: { subcategory: "running-shoes", productType: "running-shoes" },
    merchantId: "m1",
    merchantName: "Bazaar Depot",
    isMerchantActive: true,
    isRazorpayEnabled: true,
    source: "SYNTHETIC",
    offerId: "o7",
    sourceProductId: "s7",
    pricePaise: 350000,
    currency: "INR",
    discount: 10,
    sellerRating: 4.4,
    availability: true,
    shippingCostPaise: 0,
    deliveryEstimate: "2 days",
    productUrl: "",
    imageUrl: null,
    priceFetchedAt: new Date()
  };

  const cricketShoesOffer: NormalizedOffer = {
    canonicalProductId: "prod-8",
    productName: "Adidas Spike Cricket Shoes",
    brand: "Adidas",
    category: "footwear",
    description: "Footwear with rubber spikes suitable for cricket turf.",
    attributes: { subcategory: "casual-shoes", productType: "casual shoes" },
    merchantId: "m1",
    merchantName: "Bazaar Depot",
    isMerchantActive: true,
    isRazorpayEnabled: true,
    source: "SYNTHETIC",
    offerId: "o8",
    sourceProductId: "s8",
    pricePaise: 420000,
    currency: "INR",
    discount: 5,
    sellerRating: 4.3,
    availability: true,
    shippingCostPaise: 0,
    deliveryEstimate: "3 days",
    productUrl: "",
    imageUrl: null,
    priceFetchedAt: new Date()
  };

  const cricketBatOffer: NormalizedOffer = {
    canonicalProductId: "prod-9",
    productName: "SG Kashmir Willow Cricket Bat",
    brand: "SG",
    category: "sports",
    description: "Kashmir Willow Short Handle cricket bat.",
    attributes: { subcategory: "cricket-bats", productType: "cricket-bat" },
    merchantId: "m1",
    merchantName: "Bazaar Depot",
    isMerchantActive: true,
    isRazorpayEnabled: true,
    source: "SYNTHETIC",
    offerId: "o9",
    sourceProductId: "s9",
    pricePaise: 220000,
    currency: "INR",
    discount: 5,
    sellerRating: 4.2,
    availability: true,
    shippingCostPaise: 0,
    deliveryEstimate: "2 days",
    productUrl: "",
    imageUrl: null,
    priceFetchedAt: new Date()
  };

  const cricketBallOffer: NormalizedOffer = {
    canonicalProductId: "prod-10",
    productName: "SG Red Leather Cricket Ball",
    brand: "SG",
    category: "sports",
    description: "Traditional test leather cricket ball.",
    attributes: { subcategory: "cricket-balls", productType: "cricket ball" },
    merchantId: "m1",
    merchantName: "Bazaar Depot",
    isMerchantActive: true,
    isRazorpayEnabled: true,
    source: "SYNTHETIC",
    offerId: "o10",
    sourceProductId: "s10",
    pricePaise: 40000,
    currency: "INR",
    discount: 0,
    sellerRating: 4.5,
    availability: true,
    shippingCostPaise: 0,
    deliveryEstimate: "1 day",
    productUrl: "",
    imageUrl: null,
    priceFetchedAt: new Date()
  };

  const chessOffer: NormalizedOffer = {
    canonicalProductId: "prod-11",
    productName: "Funskool Folding Chess Board Set",
    brand: "Funskool",
    category: "games",
    description: "Classic tournament chess set with board.",
    attributes: { subcategory: "chess", productType: "chess-set" },
    merchantId: "m1",
    merchantName: "Bazaar Depot",
    isMerchantActive: true,
    isRazorpayEnabled: true,
    source: "SYNTHETIC",
    offerId: "o11",
    sourceProductId: "s11",
    pricePaise: 50000,
    currency: "INR",
    discount: 10,
    sellerRating: 4.4,
    availability: true,
    shippingCostPaise: 0,
    deliveryEstimate: "2 days",
    productUrl: "",
    imageUrl: null,
    priceFetchedAt: new Date()
  };

  const toyOffer: NormalizedOffer = {
    canonicalProductId: "prod-12",
    productName: "Nerf Super Soaker Toy Gun",
    brand: "Nerf",
    category: "toys",
    description: "Water gun blaster toy for kids.",
    attributes: { subcategory: "gifts", productType: "toys" },
    merchantId: "m1",
    merchantName: "Bazaar Depot",
    isMerchantActive: true,
    isRazorpayEnabled: true,
    source: "SYNTHETIC",
    offerId: "o12",
    sourceProductId: "s12",
    pricePaise: 120000,
    currency: "INR",
    discount: 0,
    sellerRating: 4.3,
    availability: true,
    shippingCostPaise: 0,
    deliveryEstimate: "3 days",
    productUrl: "",
    imageUrl: null,
    priceFetchedAt: new Date()
  };

  const bookOffer: NormalizedOffer = {
    canonicalProductId: "prod-13",
    productName: "Penguin The Alchemist Book",
    brand: "Penguin",
    category: "books",
    description: "Best selling novel by Paulo Coelho.",
    attributes: { subcategory: "fiction", productType: "book" },
    merchantId: "m1",
    merchantName: "Bazaar Depot",
    isMerchantActive: true,
    isRazorpayEnabled: true,
    source: "SYNTHETIC",
    offerId: "o13",
    sourceProductId: "s13",
    pricePaise: 35000,
    currency: "INR",
    discount: 5,
    sellerRating: 4.6,
    availability: true,
    shippingCostPaise: 0,
    deliveryEstimate: "2 days",
    productUrl: "",
    imageUrl: null,
    priceFetchedAt: new Date()
  };

  // ==========================================
  // CROSS-CATEGORY REJECTION REGRESSIONS (11)
  // ==========================================
  
  test("Check 1: Laptop query rejects headphones", () => {
    const intent = createTestIntent({ query: "I need a laptop under ₹60,000", subcategory: "laptops", category: "electronics" });
    expect(isProductEligible(laptopOffer, intent).eligible).toBe(true);
    expect(isProductEligible(headphonesOffer, intent).eligible).toBe(false);
  });

  test("Check 2: Laptop query rejects phone", () => {
    const intent = createTestIntent({ query: "I need a laptop under ₹60,000", subcategory: "laptops", category: "electronics" });
    expect(isProductEligible(phoneOffer, intent).eligible).toBe(false);
  });

  test("Check 3: Laptop query rejects smartwatch", () => {
    const intent = createTestIntent({ query: "I need a laptop under ₹60,000", subcategory: "laptops", category: "electronics" });
    expect(isProductEligible(watchOffer, intent).eligible).toBe(false);
  });

  test("Check 4: Headphones query rejects laptop", () => {
    const intent = createTestIntent({ query: "I need wireless headphones under ₹2,000", subcategory: "headphones", category: "electronics" });
    expect(isProductEligible(headphonesOffer, intent).eligible).toBe(true);
    expect(isProductEligible(laptopOffer, intent).eligible).toBe(false);
  });

  test("Check 5: Headphones query rejects phone", () => {
    const intent = createTestIntent({ query: "I need wireless headphones under ₹2,000", subcategory: "headphones", category: "electronics" });
    expect(isProductEligible(phoneOffer, intent).eligible).toBe(false);
  });

  test("Check 6: Earbuds query rejects laptop", () => {
    const intent = createTestIntent({ query: "Show me the cheapest earbuds", subcategory: "earbuds", category: "electronics" });
    expect(isProductEligible(earbudsOffer, intent).eligible).toBe(true);
    expect(isProductEligible(laptopOffer, intent).eligible).toBe(false);
  });

  test("Check 7: Phone query rejects laptop", () => {
    const intent = createTestIntent({ query: "I need a phone under ₹20,000", subcategory: "smartphones", category: "electronics" });
    expect(isProductEligible(phoneOffer, intent).eligible).toBe(true);
    expect(isProductEligible(laptopOffer, intent).eligible).toBe(false);
  });

  test("Check 8: Smartwatch query rejects phone", () => {
    const intent = createTestIntent({ query: "Find me a smartwatch", subcategory: "smartwatches", category: "electronics" });
    expect(isProductEligible(watchOffer, intent).eligible).toBe(true);
    expect(isProductEligible(phoneOffer, intent).eligible).toBe(false);
  });

  test("Check 9: Running shoes query rejects cricket shoes", () => {
    const intent = createTestIntent({ query: "Find me running shoes under ₹4,000", subcategory: "running-shoes", category: "footwear" });
    expect(isProductEligible(runningShoesOffer, intent).eligible).toBe(true);
    expect(isProductEligible(cricketShoesOffer, intent).eligible).toBe(false);
  });

  test("Check 10: Cricket bat query rejects cricket ball", () => {
    const intent = createTestIntent({ query: "I need a cricket bat under ₹5,000", subcategory: "cricket-bats", category: "sports" });
    expect(isProductEligible(cricketBatOffer, intent).eligible).toBe(true);
    expect(isProductEligible(cricketBallOffer, intent).eligible).toBe(false);
  });

  test("Check 11: Chess query rejects unrelated toys", () => {
    const intent = createTestIntent({ query: "I need a chess gift for my brother under ₹1,000", subcategory: "chess", category: "games" });
    expect(isProductEligible(chessOffer, intent).eligible).toBe(true);
    expect(isProductEligible(toyOffer, intent).eligible).toBe(false);
  });

  // ==========================================
  // NATURAL LANGUAGE QUERY INTENT TESTS (13)
  // ==========================================
  
  test("Check 12: NL Query 1 - wireless headphones under ₹2,000", () => {
    const intent = createTestIntent({ query: "I need wireless headphones under ₹2,000" });
    expect(resolveProductType(intent)).toBe("headphones");
  });

  test("Check 13: NL Query 2 - laptop under ₹60,000", () => {
    const intent = createTestIntent({ query: "I need a laptop under ₹60,000" });
    expect(resolveProductType(intent)).toBe("laptop");
  });

  test("Check 14: NL Query 3 - running shoes under ₹4,000", () => {
    const intent = createTestIntent({ query: "Find me running shoes under ₹4,000" });
    expect(resolveProductType(intent)).toBe("running shoes");
  });

  test("Check 15: NL Query 4 - 12-year-old birthday gift under ₹1,500", () => {
    const intent = createTestIntent({ query: "I need a birthday gift for a 12-year-old under ₹1,500" });
    expect(isProductEligible(toyOffer, intent).eligible).toBe(true);
    expect(isProductEligible(laptopOffer, intent).eligible).toBe(false);
  });

  test("Check 16: NL Query 5 - smartwatch", () => {
    const intent = createTestIntent({ query: "Find me a smartwatch" });
    expect(resolveProductType(intent)).toBe("smartwatch");
  });

  test("Check 17: NL Query 6 - phone with good battery under ₹20,000", () => {
    const intent = createTestIntent({ query: "I need a phone with good battery under ₹20,000" });
    expect(resolveProductType(intent)).toBe("phone");
  });

  test("Check 18: NL Query 7 - cheapest earbuds", () => {
    const intent = createTestIntent({ query: "Show me the cheapest earbuds" });
    expect(resolveProductType(intent)).toBe("earbuds");
  });

  test("Check 19: NL Query 8 - delivered tomorrow (Vague query triggers clarification resolve)", () => {
    const intent = createTestIntent({ query: "I need something delivered tomorrow" });
    expect(resolveProductType(intent)).toBeNull();
  });

  test("Check 20: NL Query 9 - highest-rated laptop", () => {
    const intent = createTestIntent({ query: "Show me the highest-rated laptop" });
    expect(resolveProductType(intent)).toBe("laptop");
  });

  test("Check 21: NL Query 10 - cricket bat under ₹5,000", () => {
    const intent = createTestIntent({ query: "I need a cricket bat under ₹5,000" });
    expect(resolveProductType(intent)).toBe("cricket bat");
  });

  test("Check 22: NL Query 11 - chess gift under ₹1,000", () => {
    const intent = createTestIntent({ query: "I need a chess gift for my brother under ₹1,000" });
    expect(resolveProductType(intent)).toBe("chess set");
  });

  test("Check 23: NL Query 12 - Make it cheaper", () => {
    const intent = createTestIntent({ query: "Make it cheaper", subcategory: "laptops" });
    expect(resolveProductType(intent)).toBe("laptop");
  });

  test("Check 24: NL Query 13 - Only show Flipkart", () => {
    const intent = createTestIntent({ query: "Only show Flipkart", subcategory: "headphones" });
    expect(resolveProductType(intent)).toBe("headphones");
  });

  // ==========================================
  // CONSTRAINTS & FILTERING TESTS (6)
  // ==========================================

  test("Check 25: filterEligibleProducts works as expected on mix of products", () => {
    const intent = createTestIntent({ query: "I need a laptop", subcategory: "laptops" });
    const offers = [laptopOffer, headphonesOffer, watchOffer];
    const filtered = filterEligibleProducts(offers, intent);
    expect(filtered.length).toBe(1);
    expect(filtered[0].canonicalProductId).toBe("prod-1");
  });

  test("Check 26: Vague category matching returns true for matching hierarchy", () => {
    const intent = createTestIntent({ query: "electronics", category: "electronics" });
    expect(isProductEligible(laptopOffer, intent).eligible).toBe(true);
    expect(isProductEligible(headphonesOffer, intent).eligible).toBe(true);
    expect(isProductEligible(bookOffer, intent).eligible).toBe(false);
  });
});
