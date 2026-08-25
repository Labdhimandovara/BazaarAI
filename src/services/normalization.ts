export interface CanonicalProductData {
  id: string;
  canonicalName: string;
  brand: string;
  category: string;
  attributes: any;
}

export interface MatchResult {
  canonicalProductId: string | null;
  confidence: number;
  matchedFields: string[];
  reason: string;
}

// ==================================================
// NORMALIZATION HELPERS
// ==================================================

/**
 * Clean and normalize a product title.
 * Converts to lowercase, strips punctuation, collapses whitespace,
 * and filters out common merchant-specific suffixes / promotional words.
 */
export function normalizeProductTitle(title: string): string {
  if (!title) return "";
  
  let cleaned = title.toLowerCase();
  
  // Strip punctuation, replace with space
  cleaned = cleaned.replace(/[-_.,()\[\]{}|/\\+*!?&;:]/g, " ");
  
  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  
  // Filter out common promotional / noise terms
  const noiseTerms = [
    "best buy", "on sale", "premium", "classic", "standard",
    "exclusive", "free shipping", "original", "authentic",
    "board game", "toy for kids", "gift pack", "pack of 1",
    "online", "new edition", "standard size", "pro edition",
    "set", "board", "game", "edition"
  ];
  
  for (const term of noiseTerms) {
    // Replace whole phrase match or word boundary match
    const regex = new RegExp(`\\b${term}\\b`, "g");
    cleaned = cleaned.replace(regex, "");
  }
  
  // Re-collapse whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  
  return cleaned;
}

/**
 * Normalizes a brand name.
 */
export function normalizeBrand(brand: string): string {
  if (!brand) return "unknown";
  return brand.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

/**
 * Normalizes a category path.
 */
export function normalizeCategory(category: string): string {
  if (!category) return "general";
  return category.toLowerCase().replace(/\s+/g, "").trim();
}

/**
 * Normalizes attributes to standard structure.
 */
export function normalizeAttributes(attributes: any): Record<string, any> {
  if (!attributes) return {};
  if (typeof attributes === "string") {
    try {
      return JSON.parse(attributes);
    } catch {
      return {};
    }
  }
  return { ...attributes };
}

// ==================================================
// SIMILARITY MEASUREMENT
// ==================================================

/**
 * Computes Jaccard Similarity between two sets of tokens (strings).
 * Intersection / Union of words.
 */
export function calculateTokenSimilarity(str1: string, str2: string): number {
  const norm1 = normalizeProductTitle(str1);
  const norm2 = normalizeProductTitle(str2);
  
  if (!norm1 || !norm2) return 0;
  
  const tokens1 = new Set(norm1.split(" "));
  const tokens2 = new Set(norm2.split(" "));
  
  const intersection = new Set<string>();
  tokens1.forEach((x) => {
    if (tokens2.has(x)) intersection.add(x);
  });
  
  const union = new Set<string>();
  tokens1.forEach((x) => union.add(x));
  tokens2.forEach((x) => union.add(x));
  
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

// ==================================================
// CANONICAL MATCHING ALGORITHM
// ==================================================

/**
 * Compare an incoming product offer against a list of canonical products and return
 * the best match, complete with confidence metrics.
 */
export function matchCanonicalProducts(
  offerTitle: string,
  offerBrand: string,
  offerCategory: string,
  offerAttributes: any,
  canonicalProducts: CanonicalProductData[],
  matchingThreshold = 0.85
): MatchResult {
  let bestMatch: CanonicalProductData | null = null;
  let maxConfidence = 0;
  let bestMatchedFields: string[] = [];
  let bestReason = "No matching canonical product found";

  const normOfferTitle = normalizeProductTitle(offerTitle);
  const normOfferBrand = normalizeBrand(offerBrand);
  const normOfferCategory = normalizeCategory(offerCategory);
  const normOfferAttrs = normalizeAttributes(offerAttributes);

  for (const product of canonicalProducts) {
    const normProductTitle = normalizeProductTitle(product.canonicalName);
    const normProductBrand = normalizeBrand(product.brand);
    const normProductCategory = normalizeCategory(product.category);
    const normProductAttrs = normalizeAttributes(product.attributes);

    let confidence = 0;
    const matchedFields: string[] = [];
    const reasons: string[] = [];

    // 1. Brand Matching (Weight: 30%)
    let brandScore = 0;
    if (normOfferBrand === normProductBrand && normOfferBrand !== "unknown") {
      brandScore = 1.0;
      matchedFields.push("brand");
      reasons.push("Exact brand match");
    } else if (normOfferBrand === "unknown" || normProductBrand === "unknown") {
      brandScore = 0.5; // Partial score for missing data
    } else {
      // Direct brand mismatch is a critical disqualifier
      brandScore = -0.5;
    }

    // 2. Category Matching (Weight: 20%)
    let categoryScore = 0;
    if (normOfferCategory === normProductCategory) {
      categoryScore = 1.0;
      matchedFields.push("category");
      reasons.push("Category path matches");
    } else if (normOfferCategory.includes(normProductCategory) || normProductCategory.includes(normOfferCategory)) {
      categoryScore = 0.6;
      matchedFields.push("category (partial)");
      reasons.push("Category paths overlap");
    }

    // 3. Title Token Matching (Weight: 40%)
    const titleScore = calculateTokenSimilarity(normOfferTitle, normProductTitle);
    if (titleScore >= 0.5) {
      matchedFields.push("title");
      reasons.push(`Token overlap of ${Math.round(titleScore * 100)}%`);
    }

    // 4. Attribute Key Match (Weight: 10%)
    let attributeScore = 0;
    const offerKeys = Object.keys(normOfferAttrs);
    const productKeys = Object.keys(normProductAttrs);
    
    if (offerKeys.length > 0 && productKeys.length > 0) {
      let keyMatches = 0;
      let valMatches = 0;
      
      for (const key of offerKeys) {
        if (productKeys.includes(key)) {
          keyMatches++;
          if (String(normOfferAttrs[key]).toLowerCase() === String(normProductAttrs[key]).toLowerCase()) {
            valMatches++;
          }
        }
      }
      
      const totalKeys = Math.max(offerKeys.length, productKeys.length);
      attributeScore = (keyMatches * 0.4 + valMatches * 0.6) / totalKeys;
      
      if (valMatches > 0) {
        matchedFields.push("attributes");
        reasons.push(`${valMatches} matching specs`);
      }
    } else {
      attributeScore = 0.5; // Default score if no specs exist
    }

    // Calculate final weighted confidence
    confidence = (brandScore * 0.3) + (categoryScore * 0.2) + (titleScore * 0.4) + (attributeScore * 0.1);
    
    // Hard cap: direct brand mismatch drops score immediately below threshold
    if (brandScore === -0.5) {
      confidence = Math.min(confidence, 0.4);
    }

    // Clip confidence score to [0, 1] range
    confidence = Math.max(0, Math.min(1.0, confidence));

    if (confidence > maxConfidence) {
      maxConfidence = confidence;
      bestMatch = product;
      bestMatchedFields = matchedFields;
      bestReason = reasons.join(", ");
    }
  }

  // Check matching threshold
  if (bestMatch && maxConfidence >= matchingThreshold) {
    return {
      canonicalProductId: bestMatch.id,
      confidence: maxConfidence,
      matchedFields: bestMatchedFields,
      reason: `Matched with '${bestMatch.canonicalName}' [Threshold check passed]: ${bestReason}`,
    };
  }

  return {
    canonicalProductId: null,
    confidence: maxConfidence,
    matchedFields: bestMatchedFields,
    reason: bestMatch 
      ? `Best match '${bestMatch.canonicalName}' fell below threshold (${Math.round(maxConfidence * 100)}% < ${Math.round(matchingThreshold * 100)}%): ${bestReason}`
      : "No canonical products matched",
  };
}
