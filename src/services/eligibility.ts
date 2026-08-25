import { NormalizedOffer } from "./commerce";
import { ShoppingIntent } from "./intent";

export interface EligibilityResult {
  eligible: boolean;
  productType: string;
  reason: string;
}

/**
 * Resolves the target product type from user query or intent subcategory.
 */
export function resolveProductType(intent: ShoppingIntent): string | null {
  if (intent.subcategory) {
    // Map subcategories to normalized product types
    const sub = intent.subcategory.toLowerCase();
    if (sub === "laptops") return "laptop";
    if (sub === "smartphones" || sub === "phones") return "phone";
    if (sub === "tablets") return "tablet";
    if (sub === "headphones") return "headphones";
    if (sub === "earbuds") return "earbuds";
    if (sub === "smartwatches") return "smartwatch";
    if (sub === "running-shoes") return "running shoes";
    if (sub === "casual-shoes") return "casual shoes";
    if (sub === "cricket-bats") return "cricket bat";
    if (sub === "cricket-balls") return "cricket ball";
    if (sub === "chess") return "chess set";
    if (sub === "board-games") return "board games";
    if (sub === "fiction") return "book";
    if (sub === "controllers") return "gaming accessories";
    if (sub === "backpacks") return "backpack";
    if (sub === "appliances") return "kitchen appliance";
    if (sub === "vacuum") return "home appliances";
    if (sub === "hair") return "beauty/personal care";
    if (sub === "clothing") return "fashion";
    if (sub === "accessories") {
      if ((intent.query || "").toLowerCase().includes("travel")) {
        return "travel product";
      }
    }
  }

  // Fallback to keyword matching on query or intent preferences
  const queryLower = ((intent.query || "") + " " + intent.preferences.join(" ")).toLowerCase();
  
  if (/\blaptops?\b|\bnotebooks?\b/i.test(queryLower)) return "laptop";
  if (/\bsmartphones?\b|\bphones?\b|\bmobiles?\b/i.test(queryLower)) return "phone";
  if (/\btablets?\b|\bipad\b/i.test(queryLower)) return "tablet";
  if (/\bheadphones?\b|\bover-ear\b|\bon-ear\b/i.test(queryLower)) return "headphones";
  if (/\bearbuds?\b|\btws\b|\bear\s+buds?\b/i.test(queryLower)) return "earbuds";
  if (/\bsmartwatch(?:es)?\b|\bsmart\s+watch(?:es)?\b|\bfitness\s+watch(?:es)?\b/i.test(queryLower)) return "smartwatch";
  if (/\brunning\s+shoes?\b|\brunning\s+footwear\b/i.test(queryLower)) return "running shoes";
  if (/\bshoes?\b|\bfootwear\b|\bsneakers?\b/i.test(queryLower)) {
    if (queryLower.includes("cricket")) return "cricket shoes";
    return "footwear";
  }
  if (/\bcricket\s+bats?\b|\bbats?\b/i.test(queryLower)) {
    if (queryLower.includes("ball")) return "cricket ball";
    return "cricket bat";
  }
  if (/\bcricket\s+balls?\b/i.test(queryLower)) return "cricket ball";
  if (/\bchess\s+sets?\b|\bchess\s+boards?\b|\bchess\b/i.test(queryLower)) return "chess set";
  if (/\bboard\s+games?\b/i.test(queryLower)) return "board games";
  if (/\bbooks?\b/i.test(queryLower)) return "book";
  if (/\bgaming\b/i.test(queryLower)) return "gaming accessories";
  if (/\bbags?\b|\bbackpacks?\b/i.test(queryLower)) return "backpack";
  if (/\bkitchen\b/i.test(queryLower)) return "kitchen appliance";
  if (/\bvacuum\b/i.test(queryLower)) return "home appliances";
  if (/\bbeauty\b|\bhair\b|\bshampoo\b|\bface\b/i.test(queryLower)) return "beauty/personal care";
  if (/\bfashion\b|\bclothing\b|\bjeans\b|\bshirt\b/i.test(queryLower)) return "fashion";
  if (/\btoys?\b/i.test(queryLower)) return "toys";
  if (/\btravel\b|\bsuitcases?\b/i.test(queryLower)) return "travel product";

  return null;
}

/**
 * Checks if a product offer satisfies the category and subcategory constraints.
 */
export function isProductEligible(offer: NormalizedOffer, intent: ShoppingIntent): EligibilityResult {
  const targetType = resolveProductType(intent);
  
  // Resolve product type from database metadata or fields
  const offerType = (offer.attributes?.productType || offer.attributes?.subcategory || offer.category || "").toLowerCase();
  const nameLower = offer.productName.toLowerCase();
  // 12-year-old gift check
  const queryLower = (intent.query || "").toLowerCase();
  if (queryLower.includes("12-year-old") || queryLower.includes("12 year old")) {
    const allowedGiftCats = ["gaming", "gifts", "toys", "books", "sports", "games"];
    const currentCat = offer.category.toLowerCase();
    const isGiftEligible = allowedGiftCats.some(c => currentCat.includes(c));
    if (!isGiftEligible) {
      return {
        eligible: false,
        productType: offerType,
        reason: `Product category: ${offer.category} is not suitable for 12-year-old gifts`,
      };
    }
  }

  // Broad Category validation first
  if (intent.category) {
    const offerCat = offer.category.toLowerCase();
    const intentCat = intent.category.toLowerCase();
    
    // Check hierarchical or direct category match
    if (intentCat !== "general" && intentCat !== "all") {
      const broadElectronics = ["electronics", "phones", "laptops", "headphones", "earbuds", "smartwatches", "tablets", "computers/accessories"];
      const isBothElec = broadElectronics.includes(intentCat) && broadElectronics.includes(offerCat);
      
      if (offerCat !== intentCat && !isBothElec) {
        return {
          eligible: false,
          productType: offerType,
          reason: `Requested category: ${intent.category}, but product category is: ${offer.category}`,
        };
      }
    }
  }

  // If no targetType is resolved from query/intent, it is eligible
  if (!targetType) {
    return {
      eligible: true,
      productType: offerType,
      reason: "No specific product type requested, all categories eligible",
    };
  }

  // Define semantic matching definitions
  const descLower = (offer.description || "").toLowerCase();
  const matchLaptop = offerType.includes("laptop") || nameLower.includes("laptop") || nameLower.includes("notebook");
  const matchPhone = offerType.includes("phone") || offerType.includes("smartphone") || nameLower.includes("phone") || nameLower.includes("smartphone") || nameLower.includes("mobile");
  const matchTablet = offerType.includes("tablet") || nameLower.includes("tablet") || nameLower.includes("ipad");
  const matchHeadphones = (offerType.includes("headphones") || nameLower.includes("headphones") || nameLower.includes("headphone") || nameLower.includes("over-ear") || nameLower.includes("on-ear")) && 
                          !nameLower.includes("earbud") && !nameLower.includes("earbuds") && !nameLower.includes("tws") && !offerType.includes("earbuds");
  const matchEarbuds = offerType.includes("earbuds") || offerType.includes("earbud") || offerType.includes("tws") || nameLower.includes("earbud") || nameLower.includes("earbuds") || nameLower.includes("tws");
  const matchSmartwatch = offerType.includes("smartwatch") || offerType.includes("watch") || nameLower.includes("smartwatch") || nameLower.includes("smart watch") || nameLower.includes("fitness watch");
  const matchRunningShoes = (nameLower.includes("running") || descLower.includes("running")) && 
                            (offerType.includes("footwear") || offerType.includes("shoes") || nameLower.includes("shoe") || nameLower.includes("footwear") || nameLower.includes("sneaker")) && 
                            !nameLower.includes("cricket") && !descLower.includes("cricket");
  const matchFootwear = offerType.includes("footwear") || offerType.includes("shoes") || nameLower.includes("shoe") || nameLower.includes("footwear") || nameLower.includes("sneaker") || nameLower.includes("boot");
  const matchCricketBat = nameLower.includes("bat") && !nameLower.includes("ball") && !nameLower.includes("glove") && !nameLower.includes("pad");
  const matchCricketBall = nameLower.includes("ball") && (nameLower.includes("cricket") || offerType.includes("cricket"));
  const matchChessSet = nameLower.includes("chess") && (nameLower.includes("set") || nameLower.includes("board") || nameLower.includes("pieces") || nameLower.includes("game"));
  const matchBoardGames = offerType.includes("board games") || nameLower.includes("monopoly") || nameLower.includes("scrabble") || nameLower.includes("ludo") || offerType.includes("chess");
  const matchBook = offerType.includes("book") || offerType.includes("fiction") || nameLower.includes("alchemist") || nameLower.includes("mockingbird") || nameLower.includes("pakistan");
  const matchBackpack = offerType.includes("backpack") || offerType.includes("bag") || nameLower.includes("pack") || nameLower.includes("backpack") || nameLower.includes("suitcase");
  const matchKitchen = offerType.includes("kitchen") || offerType.includes("appliance") || nameLower.includes("cooker") || nameLower.includes("kettle") || nameLower.includes("grinder");
  const matchHomeAppl = offerType.includes("vacuum") || offerType.includes("appliance") || nameLower.includes("vacuum");
  const matchBeauty = offerType.includes("beauty") || offerType.includes("hair") || nameLower.includes("shampoo") || nameLower.includes("mask") || nameLower.includes("wash");
  const matchFashion = offerType.includes("fashion") || offerType.includes("clothing") || nameLower.includes("jeans") || nameLower.includes("tee") || nameLower.includes("polo");
  const matchTravel = offerType.includes("travel") || offerType.includes("suitcase") || nameLower.includes("luggage") || nameLower.includes("cabin") || nameLower.includes("pillow");

  let isEligible = false;
  switch (targetType) {
    case "laptop": isEligible = matchLaptop; break;
    case "phone": isEligible = matchPhone; break;
    case "tablet": isEligible = matchTablet; break;
    case "headphones": isEligible = matchHeadphones; break;
    case "earbuds": isEligible = matchEarbuds; break;
    case "smartwatch": isEligible = matchSmartwatch; break;
    case "running shoes": isEligible = matchRunningShoes; break;
    case "footwear": isEligible = matchFootwear; break;
    case "cricket bat": isEligible = matchCricketBat; break;
    case "cricket ball": isEligible = matchCricketBall; break;
    case "chess set": isEligible = matchChessSet; break;
    case "board games": isEligible = matchBoardGames; break;
    case "book": isEligible = matchBook; break;
    case "backpack": isEligible = matchBackpack; break;
    case "kitchen appliance": isEligible = matchKitchen; break;
    case "home appliances": isEligible = matchHomeAppl; break;
    case "beauty/personal care": isEligible = matchBeauty; break;
    case "fashion": isEligible = matchFashion; break;
    case "travel product": isEligible = matchTravel; break;
  }



  if (isEligible) {
    return {
      eligible: true,
      productType: targetType,
      reason: `Matches requested product type: ${targetType}`,
    };
  } else {
    return {
      eligible: false,
      productType: offerType,
      reason: `Requested: ${targetType}, but product is: ${offerType}`,
    };
  }
}

/**
 * Filter list of offers keeping only eligible ones.
 */
export function filterEligibleProducts(offers: NormalizedOffer[], intent: ShoppingIntent): NormalizedOffer[] {
  return offers.filter(o => isProductEligible(o, intent).eligible);
}

/**
 * Gets rejection reason narrative if a product did not qualify.
 */
export function getRejectedProductReason(offer: NormalizedOffer, intent: ShoppingIntent): string {
  return isProductEligible(offer, intent).reason;
}
