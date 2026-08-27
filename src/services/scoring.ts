import { NormalizedOffer } from "./commerce";

// ==================================================
// TYPES & INTERFACES
// ==================================================

export type RankingObjective = "best_value" | "cheapest" | "fastest" | "highest_quality";

export interface BuyerScoreBreakdown {
  overallScore: number;
  preferenceScore: number;
  budgetScore: number;
  qualityScore: number;
  sellerScore: number;
  deliveryScore: number;
  offerScore: number;
  reasons: string[];
  tradeoffs: string[];
}

export interface UserShoppingIntent {
  query?: string;
  keywords: string[];
  maxBudgetINR?: number;
  category?: string;
}

// Weight configurations based on target objective
export const OBJECTIVE_WEIGHTS: Record<RankingObjective, {
  preference: number;
  budget: number;
  quality: number;
  seller: number;
  delivery: number;
  offer: number;
}> = {
  best_value: {
    preference: 0.35,
    budget: 0.20,
    quality: 0.15,
    seller: 0.10,
    delivery: 0.10,
    offer: 0.10,
  },
  cheapest: {
    preference: 0.15,
    budget: 0.60,
    quality: 0.05,
    seller: 0.05,
    delivery: 0.05,
    offer: 0.10,
  },
  fastest: {
    preference: 0.15,
    budget: 0.10,
    quality: 0.05,
    seller: 0.05,
    delivery: 0.60,
    offer: 0.05,
  },
  highest_quality: {
    preference: 0.15,
    budget: 0.10,
    quality: 0.50,
    seller: 0.15,
    delivery: 0.05,
    offer: 0.05,
  },
};

// ==================================================
// SCORE CALCULATION SERVICE
// ==================================================

/**
 * Calculates a detailed Buyer Score out of 100 for a given offer and user intent.
 */
export function calculateBuyerScore(
  offer: NormalizedOffer,
  intent: UserShoppingIntent,
  objective: RankingObjective = "best_value"
): BuyerScoreBreakdown {
  const reasons: string[] = [];
  const tradeoffs: string[] = [];
  
  // 1. Preference Score (35% default)
  // Check how many of the intent's keywords are present in product title / description
  let preferenceScore = 50; // base score for category overlap
  if (intent.category && offer.category.toLowerCase() === intent.category.toLowerCase()) {
    preferenceScore = 80;
    reasons.push("Matches the requested category path");
  }
  
  if (intent.keywords.length > 0) {
    const title = offer.productName.toLowerCase();
    const desc = (offer.description || "").toLowerCase();
    let matches = 0;
    
    intent.keywords.forEach((keyword) => {
      const kw = keyword.toLowerCase().trim();
      if (title.includes(kw) || desc.includes(kw)) {
        matches++;
      }
    });
    
    const kwMatchRatio = matches / intent.keywords.length;
    preferenceScore = Math.round(preferenceScore * 0.4 + (kwMatchRatio * 100) * 0.6);
    
    if (matches > 0) {
      reasons.push(`Contains matching keywords: "${intent.keywords.filter(k => title.includes(k.toLowerCase()) || desc.includes(k.toLowerCase())).join(", ")}"`);
    } else {
      tradeoffs.push("Does not contain matching keyword keywords in description");
    }
  }

  // 2. Budget Score (20% default)
  // If total price (price + shipping) is <= budget: 100 score.
  // Otherwise, penalize linearly.
  let budgetScore = 100;
  const totalPricePaise = offer.pricePaise + offer.shippingCostPaise;
  const budgetPaise = intent.maxBudgetINR ? intent.maxBudgetINR * 100 : 0;
  
  if (budgetPaise > 0) {
    if (totalPricePaise <= budgetPaise) {
      // Reward cheaper products (nearer to budget gets higher, or cheaper gets better)
      const ratio = totalPricePaise / budgetPaise;
      budgetScore = Math.round(100 - (ratio * 15)); // max score 100, decays slightly as it gets closer to max budget
      reasons.push(`Within the limit of your ₹${intent.maxBudgetINR} budget`);
    } else {
      const diff = totalPricePaise - budgetPaise;
      const penalty = (diff / budgetPaise) * 100;
      budgetScore = Math.max(0, Math.round(50 - penalty)); // poor score for exceeding budget
      tradeoffs.push(`Exceeds approved budget by ₹${Math.round(diff / 100)}`);
    }
  } else {
    budgetScore = 80; // neutral default if no budget is specified
  }

  // 3. Quality Score (15% default)
  // Uses rating (0 to 5) -> 0 to 100
  // Synthetic data has generic quality rating, mapped to sellerRating for now or calculated from attributes
  const rating = offer.sellerRating; // standard rating signal
  const qualityScore = rating !== null ? Math.round(rating * 20) : 70; // neutral score (e.g. 70) for unknown
  if (rating !== null) {
    if (rating >= 4.5) {
      reasons.push(`Highly rated by buyers (${rating}★)`);
    } else if (rating < 3.8) {
      tradeoffs.push(`Customer reviews are lower than average (${rating}★)`);
    }
  }

  // 4. Seller Score (10% default)
  // Checks active merchant indicators and ratings
  const sellerScore = offer.isMerchantActive ? 90 : 30;
  if (offer.isMerchantActive) {
    reasons.push(`Listed by a verified and active merchant (${offer.merchantName})`);
  } else {
    tradeoffs.push(`Merchant status is flagged as restricted/inactive`);
  }

  // 5. Delivery Score (10% default)
  // same day = 100, 1 day = 90, 2 days = 80, 4 days = 60, 7 days = 40, else = 20
  let deliveryScore = 50;
  const est = offer.deliveryEstimate.toLowerCase();
  if (est.includes("same day") || est.includes("0 day")) {
    deliveryScore = 100;
    reasons.push("Available for immediate Same-Day delivery");
  } else if (est.includes("1 day")) {
    deliveryScore = 90;
    reasons.push("Fast 1-Day shipping available");
  } else if (est.includes("2 day")) {
    deliveryScore = 80;
    reasons.push("Standard 2-Day shipping estimate");
  } else if (est.includes("4 day")) {
    deliveryScore = 65;
  } else {
    deliveryScore = 40;
    tradeoffs.push(`Slow delivery estimate (${offer.deliveryEstimate})`);
  }

  // 6. Offer Score (10% default)
  // discount based, 0% -> 50, 30%+ -> 100
  const discount = offer.discount;
  const offerScore = Math.min(100, Math.round(50 + discount * 1.6));
  if (discount > 15) {
    reasons.push(`Includes a meaningful discount of ${discount}%`);
  } else if (discount === 0) {
    tradeoffs.push("No discount offers currently applied");
  }

  // 7. Calculate overall weighted score
  const weights = OBJECTIVE_WEIGHTS[objective];
  const overallScore = Number((
    (preferenceScore * weights.preference) +
    (budgetScore * weights.budget) +
    (qualityScore * weights.quality) +
    (sellerScore * weights.seller) +
    (deliveryScore * weights.delivery) +
    (offerScore * weights.offer)
  ).toFixed(1));

  // Determine relative price tradeoff
  // (We check if it's the cheapest/fastest in the parent logic, but can add general tradeoffs here)

  return {
    overallScore,
    preferenceScore,
    budgetScore,
    qualityScore,
    sellerScore,
    deliveryScore,
    offerScore,
    reasons: Array.from(new Set(reasons)),
    tradeoffs: Array.from(new Set(tradeoffs)),
  };
}

/**
 * Rank a list of product offers based on the calculated Buyer Score.
 */
export interface RankedOffer {
  offer: NormalizedOffer;
  scoreBreakdown: BuyerScoreBreakdown;
}

export function rankProducts(
  offers: NormalizedOffer[],
  intent: UserShoppingIntent,
  objective: RankingObjective = "best_value"
): RankedOffer[] {
  const scoredOffers: RankedOffer[] = offers.map((offer) => {
    const scoreBreakdown = calculateBuyerScore(offer, intent, objective);
    return {
      offer,
      scoreBreakdown,
    };
  });

  // Sort by overallScore descending. If equal, sort by price ascending.
  scoredOffers.sort((a, b) => {
    if (b.scoreBreakdown.overallScore === a.scoreBreakdown.overallScore) {
      const priceA = a.offer.pricePaise + a.offer.shippingCostPaise;
      const priceB = b.offer.pricePaise + b.offer.shippingCostPaise;
      return priceA - priceB;
    }
    return b.scoreBreakdown.overallScore - a.scoreBreakdown.overallScore;
  });

  // Inject comparative tradeoffs dynamically (e.g. cheapest vs fastest)
  if (scoredOffers.length > 1) {
    let cheapestIdx = 0;
    let cheapestPrice = Infinity;
    let fastestIdx = 0;
    let fastestDays = Infinity;

    const parseDays = (est: string): number => {
      const cleaned = est.toLowerCase();
      if (cleaned.includes("same day")) return 0;
      const match = cleaned.match(/(\d+)\s*day/);
      return match ? parseInt(match[1]) : 7;
    };

    scoredOffers.forEach((so, idx) => {
      const price = so.offer.pricePaise + so.offer.shippingCostPaise;
      if (price < cheapestPrice) {
        cheapestPrice = price;
        cheapestIdx = idx;
      }

      const days = parseDays(so.offer.deliveryEstimate);
      if (days < fastestDays) {
        fastestDays = days;
        fastestIdx = idx;
      }
    });

    // Label Cheapest
    scoredOffers[cheapestIdx].scoreBreakdown.reasons.push("Cheapest available option on the network");
    scoredOffers.forEach((so, idx) => {
      if (idx !== cheapestIdx) {
        so.scoreBreakdown.tradeoffs.push("Not the cheapest available option");
      }
    });

    // Label Fastest
    scoredOffers[fastestIdx].scoreBreakdown.reasons.push("Fastest delivery speed on the network");
    scoredOffers.forEach((so, idx) => {
      if (idx !== fastestIdx) {
        so.scoreBreakdown.tradeoffs.push("Slower delivery than the fastest merchant");
      }
    });
  }

  return scoredOffers;
}

/**
 * Format the score breakdown into an explainable narrative.
 */
export function explainScore(breakdown: BuyerScoreBreakdown): string {
  let explanation = `Overall Buyer Score is ${breakdown.overallScore}/100. `;
  
  if (breakdown.overallScore >= 85) {
    explanation += "This product is an excellent match for your requirements. ";
  } else if (breakdown.overallScore >= 70) {
    explanation += "This product is a good match, with minor tradeoffs. ";
  } else {
    explanation += "This product has some material tradeoffs. ";
  }

  if (breakdown.reasons.length > 0) {
    explanation += `Key benefits: ${breakdown.reasons.slice(0, 3).join(", ")}. `;
  }

  if (breakdown.tradeoffs.length > 0) {
    explanation += `Tradeoffs to consider: ${breakdown.tradeoffs.slice(0, 2).join(", ")}.`;
  }

  return explanation;
}
