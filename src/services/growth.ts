import { db } from "@/lib/db";
import { NormalizedOffer } from "./commerce";

export interface CrossSellOpportunity {
  offer: NormalizedOffer;
  reasons: string[];
}

export async function generateCrossSells(
  primaryOffer: NormalizedOffer,
  userBudget: number | null,
  allAvailableOffers: NormalizedOffer[]
): Promise<CrossSellOpportunity[]> {
  const crossSells: CrossSellOpportunity[] = [];

  if (primaryOffer.source.toLowerCase() === "ebay") {
    return crossSells;
  }

  const primaryCost = primaryOffer.pricePaise + primaryOffer.shippingCostPaise;
  let maxCrossSellBudget: number | null = null;
  if (userBudget) {
    maxCrossSellBudget = userBudget - primaryCost;
    if (maxCrossSellBudget <= 0) return crossSells;
  }

  const merchant = await db.merchant.findUnique({
    where: { id: primaryOffer.merchantId }
  });
  if (!merchant || !merchant.bundleEnabled) {
    return crossSells;
  }

  const categoryStr = primaryOffer.category.toLowerCase();
  
  const potentialOffers = await db.productOffer.findMany({
    where: {
      merchantId: primaryOffer.merchantId,
      availability: true,
      NOT: {
        id: primaryOffer.offerId
      }
    },
    include: { product: true }
  });

  for (const pOffer of potentialOffers) {
    const cost = pOffer.pricePaise + pOffer.shippingCostPaise;
    
    if (maxCrossSellBudget !== null && cost > maxCrossSellBudget) {
      continue;
    }

    const pCategoryStr = pOffer.product.category.toLowerCase();
    const pNameStr = pOffer.product.canonicalName.toLowerCase();
    
    let compatible = false;
    let compatibilityReason = "";

    if (categoryStr.includes("chess") && (pCategoryStr.includes("chess") || pNameStr.includes("piece") || pNameStr.includes("clock"))) {
      compatible = true;
      compatibilityReason = "Compatible with your chess board";
    } else if (categoryStr.includes("phone") && (pNameStr.includes("case") || pNameStr.includes("charger") || pNameStr.includes("earphone"))) {
      compatible = true;
      compatibilityReason = "Popular accessory for this smartphone";
    } else if (categoryStr.includes("laptop") && (pNameStr.includes("mouse") || pNameStr.includes("bag"))) {
      compatible = true;
      compatibilityReason = "Essential accessory for this laptop";
    }

    if (compatible) {
      const reasons = [
        compatibilityReason,
        "Same merchant",
        "Within your remaining budget",
        "Available in inventory"
      ];
      
      if (pOffer.sellerRating && pOffer.sellerRating >= 4.0) {
        reasons.push(`Highly rated (${pOffer.sellerRating}★)`);
      }

      const normalized: NormalizedOffer = {
        offerId: pOffer.id,
        canonicalProductId: pOffer.product.id,
        productName: pOffer.product.canonicalName,
        brand: pOffer.product.brand,
        category: pOffer.product.category,
        description: pOffer.product.description || "",
        attributes: pOffer.product.attributes,
        merchantId: pOffer.merchantId,
        merchantName: primaryOffer.merchantName,
        isMerchantActive: true,
        isRazorpayEnabled: true,
        source: pOffer.source,
        sourceProductId: pOffer.sourceProductId,
        pricePaise: pOffer.pricePaise,
        currency: pOffer.currency,
        originalPricePaise: pOffer.pricePaise,
        originalCurrency: pOffer.currency,
        displayPricePaise: pOffer.pricePaise,
        displayShippingCostPaise: pOffer.shippingCostPaise,
        displayCurrency: pOffer.currency,
        fxRate: 1,
        fxRateDate: undefined,
        fxError: undefined,
        shippingCostPaise: pOffer.shippingCostPaise,
        deliveryEstimate: pOffer.deliveryEstimate,
        discount: pOffer.discount,
        sellerRating: pOffer.sellerRating,
        availability: pOffer.availability,
        productUrl: pOffer.productUrl,
        imageUrl: pOffer.imageUrl || "",
        priceFetchedAt: pOffer.priceFetchedAt,
      };

      crossSells.push({ offer: normalized, reasons });
      
      if (crossSells.length >= 1) {
        break;
      }
    }
  }

  return crossSells;
}
