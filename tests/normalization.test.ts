import { 
  normalizeProductTitle, 
  normalizeBrand, 
  normalizeCategory, 
  calculateTokenSimilarity,
  matchCanonicalProducts,
  CanonicalProductData
} from "../src/services/normalization";

describe("Product Normalization Tests", () => {
  test("Title Normalization: strips punctuation, double spaces, and noise terms", () => {
    const input = "Funskool Standard Chess, Board Game (Classic Edition)!";
    const expected = "funskool chess";
    expect(normalizeProductTitle(input)).toBe(expected);
  });

  test("Title Normalization: handles upper/lower case variations", () => {
    expect(normalizeProductTitle("BOOTS")).toBe("boots");
  });

  test("Brand Normalization: removes punctuation and spaces", () => {
    expect(normalizeBrand("Rustic-Town India!")).toBe("rustictownindia");
    expect(normalizeBrand("")).toBe("unknown");
  });

  test("Category Normalization: strips spaces and lowercases", () => {
    expect(normalizeCategory("Chess / Games")).toBe("chess/games");
    expect(normalizeCategory("")).toBe("general");
  });

  test("Token Similarity: calculates correct set-based overlap", () => {
    const s1 = "Funskool Chess Set";
    const s2 = "Funskool Chess Classic";
    // normalized tokens: s1: ["funskool", "chess"], s2: ["funskool", "chess"]
    // overlap: 2/2 = 1.0
    expect(calculateTokenSimilarity(s1, s2)).toBe(1.0);
  });
});

describe("Canonical Product Matching Tests", () => {
  const canonicals: CanonicalProductData[] = [
    {
      id: "canon-chess",
      canonicalName: "Funskool Chess Set",
      brand: "Funskool",
      category: "chess/games",
      attributes: { material: "plastic", pieces: 32 }
    },
    {
      id: "canon-headphones",
      canonicalName: "Boat Rockerz Headphones",
      brand: "Boat",
      category: "electronics",
      attributes: { connection: "Bluetooth" }
    },
    {
      id: "canon-bat",
      canonicalName: "SG Cricket Bat",
      brand: "SG",
      category: "cricket/sports",
      attributes: { willow: "Kashmir" }
    }
  ];

  // 1. TRUE MATCH: Standard title variant
  test("True Match: standard naming variation matches same canonical", () => {
    const result = matchCanonicalProducts(
      "Funskool Classic Chess Board",
      "Funskool",
      "chess/games",
      { material: "plastic" },
      canonicals
    );
    expect(result.canonicalProductId).toBe("canon-chess");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  // 2. TRUE MATCH: Title variant with lowercase and spaces
  test("True Match: casing and spacing variants match", () => {
    const result = matchCanonicalProducts(
      "  funskool   chess   classic  ",
      "Funskool",
      "chess/games",
      {},
      canonicals
    );
    expect(result.canonicalProductId).toBe("canon-chess");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  // 3. TRUE MATCH: Missing attributes but strong title/brand overlap
  test("True Match: matches successfully even if specs/attributes are missing", () => {
    const result = matchCanonicalProducts(
      "SG Cricket Bat Extra",
      "SG",
      "cricket/sports",
      {},
      canonicals
    );
    expect(result.canonicalProductId).toBe("canon-bat");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  // 4. FALSE MATCH: Different brand (Boat vs Sony)
  test("False Match: direct brand mismatch fails match even with identical title keywords", () => {
    const result = matchCanonicalProducts(
      "Sony Rockerz Headphones",
      "Sony",
      "electronics",
      { connection: "Bluetooth" },
      canonicals
    );
    expect(result.canonicalProductId).toBeNull();
    expect(result.confidence).toBeLessThan(0.85);
  });

  // 5. FALSE MATCH: Different category (SG Cricket Bat vs SG chess set)
  test("False Match: category mismatch pulls matching score below threshold", () => {
    const result = matchCanonicalProducts(
      "SG Chess Set",
      "SG",
      "chess/games",
      {},
      canonicals
    );
    expect(result.canonicalProductId).toBeNull();
  });

  // 6. FALSE MATCH: Similar keywords but completely different products
  test("False Match: similar title keywords but separate products", () => {
    const result = matchCanonicalProducts(
      "Boat Cricket Bat",
      "Boat",
      "cricket/sports",
      {},
      canonicals
    );
    expect(result.canonicalProductId).toBeNull();
  });

  // 7. Configurable threshold test
  test("Threshold sensitivity: configurable threshold changes match approval", () => {
    // Under 0.85 this won't match because attributes are missing
    const lowMatchTitle = "Boat Headphones wireless"; 
    
    const resultStrict = matchCanonicalProducts(
      lowMatchTitle,
      "Boat",
      "electronics",
      {},
      canonicals,
      0.90
    );
    expect(resultStrict.canonicalProductId).toBeNull();

    const resultRelaxed = matchCanonicalProducts(
      lowMatchTitle,
      "Boat",
      "electronics",
      {},
      canonicals,
      0.70
    );
    expect(resultRelaxed.canonicalProductId).toBe("canon-headphones");
  });
});
