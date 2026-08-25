import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

// ==================================================
// TYPES & INTERFACES
// ==================================================

export interface SearchParams {
  query?: string;
  category?: string;
  maxPricePaise?: number;
  minRating?: number;
  availability?: "IN_STOCK" | "ALL";
  maxDeliveryDays?: number;
  merchantId?: string;
  source?: string;
  sortBy?: "price_low_to_high" | "price_high_to_low" | "rating" | "fastest_delivery";
}

export interface NormalizedOffer {
  canonicalProductId: string;
  productName: string;
  brand: string;
  category: string;
  description: string | null;
  attributes: any;
  merchantId: string;
  merchantName: string;
  isMerchantActive: boolean;
  isRazorpayEnabled: boolean;
  source: string;
  offerId: string;
  sourceProductId: string;
  pricePaise: number;
  currency: string;
  discount: number;
  sellerRating: number;
  availability: boolean;
  shippingCostPaise: number;
  deliveryEstimate: string;
  productUrl: string;
  imageUrl: string | null;
  priceFetchedAt: Date;
}

export interface NormalizedMerchant {
  id: string;
  name: string;
  logo: string | null;
  source: string;
  isActive: boolean;
  isRazorpayEnabled: boolean;
  checkoutType: string;
  catalogStatus: string;
}

export interface ProductDetails {
  id: string;
  canonicalName: string;
  brand: string;
  model: string | null;
  category: string;
  description: string | null;
  attributes: any;
  offers: NormalizedOffer[];
}

// Provider interface for future growth (Flipkart, Amazon, etc.)
export interface ICommerceProvider {
  search(params: SearchParams): Promise<NormalizedOffer[]>;
  getProduct(productId: string): Promise<ProductDetails | null>;
  getOffers(productId: string): Promise<NormalizedOffer[]>;
  getMerchant(merchantId: string): Promise<NormalizedMerchant | null>;
}

// ==================================================
// SYNTHETIC PROVIDER IMPLEMENTATION
// ==================================================

export class SyntheticProvider implements ICommerceProvider {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  private parseDeliveryDays(estimate: string): number {
    const cleaned = estimate.toLowerCase().trim();
    if (cleaned.includes("same day") || cleaned.includes("0 day")) return 0;
    const match = cleaned.match(/(\d+)\s*day/);
    if (match) {
      return parseInt(match[1]);
    }
    return 7; // Default fallback for long delivery
  }

  async search(params: SearchParams): Promise<NormalizedOffer[]> {
    // We query offers joining with product and merchant tables
    const dbOffers = await this.prisma.productOffer.findMany({
      include: {
        product: true,
        merchant: true,
      },
    });

    let normalized: NormalizedOffer[] = dbOffers.map((o) => {
      let parsedAttrs = {};
      try {
        parsedAttrs = typeof o.product.attributes === "string" 
          ? JSON.parse(o.product.attributes) 
          : o.product.attributes;
      } catch (err) {
        parsedAttrs = o.product.attributes;
      }

      return {
        canonicalProductId: o.productId,
        productName: o.product.canonicalName,
        brand: o.product.brand,
        category: o.product.category,
        description: o.product.description,
        attributes: parsedAttrs,
        merchantId: o.merchantId,
        merchantName: o.merchant.name,
        isMerchantActive: o.merchant.isActive,
        isRazorpayEnabled: o.merchant.isRazorpayEnabled,
        source: o.source,
        offerId: o.id,
        sourceProductId: o.sourceProductId,
        pricePaise: o.pricePaise,
        currency: o.currency,
        discount: o.discount,
        sellerRating: o.sellerRating,
        availability: o.availability,
        shippingCostPaise: o.shippingCostPaise,
        deliveryEstimate: o.deliveryEstimate,
        productUrl: o.productUrl,
        imageUrl: o.imageUrl,
        priceFetchedAt: o.priceFetchedAt,
      };
    });

    // 1. Filter by merchant/source
    if (params.merchantId) {
      normalized = normalized.filter((o) => o.merchantId === params.merchantId);
    }
    if (params.source) {
      normalized = normalized.filter((o) => o.source === params.source);
    }

    // 2. Filter by category
    if (params.category) {
      normalized = normalized.filter(
        (o) => o.category.toLowerCase() === params.category!.toLowerCase()
      );
    }

    // 3. Filter by maxPrice (including shipping cost)
    if (params.maxPricePaise !== undefined) {
      normalized = normalized.filter(
        (o) => (o.pricePaise + o.shippingCostPaise) <= params.maxPricePaise!
      );
    }

    // 4. Filter by minRating
    if (params.minRating !== undefined) {
      normalized = normalized.filter((o) => o.sellerRating >= params.minRating!);
    }

    // 5. Filter by availability
    if (params.availability === "IN_STOCK") {
      normalized = normalized.filter((o) => o.availability === true);
    }

    // 6. Filter by delivery requirement (max days)
    if (params.maxDeliveryDays !== undefined) {
      normalized = normalized.filter(
        (o) => this.parseDeliveryDays(o.deliveryEstimate) <= params.maxDeliveryDays!
      );
    }

    // 7. Filter by text query (tokenized keyword matching with search relevance ranking)
    if (params.query) {
      const originalQuery = params.query.toLowerCase().trim();
      
      // Tokenize the query:
      // Strip punctuation and special characters
      let cleaned = originalQuery.replace(/[-_.,()\[\]{}|/\\+*!?&;:]/g, " ");
      
      // Remove currency keywords/symbols and all numbers (budget details/age filters)
      cleaned = cleaned.replace(/\b(?:rs\.?|inr|rupees|₹|under|below|above|maximum|max|limit|paise|paisa)\b/g, "");
      cleaned = cleaned.replace(/\b\d+\b/g, "");
      
      // Common stop words to exclude
      const stopWords = new Set([
        "i", "want", "need", "a", "an", "the", "for", "me", "please", "show", "find", "give", "get",
        "looking", "something", "can", "you", "to", "would", "like", "to", "with", "it", "about",
        "my", "your", "his", "her", "their", "our", "year", "years", "old"
      ]);

      const tokens = cleaned
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 1 && !stopWords.has(t));

      // Fallback: If tokenization stripped everything, use the original query as a single token
      const searchTokens = tokens.length > 0 ? tokens : [originalQuery];

      // Add a matching strength score to each offer
      const scoredOffers = normalized.map((o) => {
        let matchCount = 0;
        const nameLower = o.productName.toLowerCase();
        const descLower = (o.description || "").toLowerCase();
        const brandLower = o.brand.toLowerCase();
        const catLower = o.category.toLowerCase();

        for (const token of searchTokens) {
          if (
            nameLower.includes(token) ||
            descLower.includes(token) ||
            brandLower.includes(token) ||
            catLower.includes(token)
          ) {
            matchCount++;
          }
        }
        return { offer: o, matchCount };
      });

      // Filter out offers with 0 matches
      const filteredScored = scoredOffers.filter((item) => item.matchCount > 0);

      // If no explicit sorting has been requested (e.g. sortBy is undefined),
      // we rank the offers by matchCount descending by default.
      if (!params.sortBy) {
        filteredScored.sort((a, b) => b.matchCount - a.matchCount);
      }

      // Extract the offers back
      normalized = filteredScored.map((item) => item.offer);
    }

    // 8. Deterministic sorting
    if (params.sortBy) {
      switch (params.sortBy) {
        case "price_low_to_high":
          normalized.sort((a, b) => (a.pricePaise + a.shippingCostPaise) - (b.pricePaise + b.shippingCostPaise));
          break;
        case "price_high_to_low":
          normalized.sort((a, b) => (b.pricePaise + b.shippingCostPaise) - (a.pricePaise + a.shippingCostPaise));
          break;
        case "rating":
          normalized.sort((a, b) => b.sellerRating - a.sellerRating);
          break;
        case "fastest_delivery":
          normalized.sort(
            (a, b) =>
              this.parseDeliveryDays(a.deliveryEstimate) -
              this.parseDeliveryDays(b.deliveryEstimate)
          );
          break;
      }
    }

    return normalized;
  }

  async getProduct(productId: string): Promise<ProductDetails | null> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        offers: {
          include: {
            merchant: true,
          },
        },
      },
    });

    if (!product) return null;

    let parsedAttrs = {};
    try {
      parsedAttrs = typeof product.attributes === "string" 
        ? JSON.parse(product.attributes) 
        : product.attributes;
    } catch (err) {
      parsedAttrs = product.attributes;
    }

    const offers: NormalizedOffer[] = product.offers.map((o) => ({
      canonicalProductId: o.productId,
      productName: product.canonicalName,
      brand: product.brand,
      category: product.category,
      description: product.description,
      attributes: parsedAttrs,
      merchantId: o.merchantId,
      merchantName: o.merchant.name,
      isMerchantActive: o.merchant.isActive,
      isRazorpayEnabled: o.merchant.isRazorpayEnabled,
      source: o.source,
      offerId: o.id,
      sourceProductId: o.sourceProductId,
      pricePaise: o.pricePaise,
      currency: o.currency,
      discount: o.discount,
      sellerRating: o.sellerRating,
      availability: o.availability,
      shippingCostPaise: o.shippingCostPaise,
      deliveryEstimate: o.deliveryEstimate,
      productUrl: o.productUrl,
      imageUrl: o.imageUrl,
      priceFetchedAt: o.priceFetchedAt,
    }));

    return {
      id: product.id,
      canonicalName: product.canonicalName,
      brand: product.brand,
      model: product.model,
      category: product.category,
      description: product.description,
      attributes: parsedAttrs,
      offers,
    };
  }

  async getOffers(productId: string): Promise<NormalizedOffer[]> {
    const details = await this.getProduct(productId);
    return details ? details.offers : [];
  }

  async getMerchant(merchantId: string): Promise<NormalizedMerchant | null> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) return null;

    return {
      id: merchant.id,
      name: merchant.name,
      logo: merchant.logo,
      source: merchant.source,
      isActive: merchant.isActive,
      isRazorpayEnabled: merchant.isRazorpayEnabled,
      checkoutType: merchant.checkoutType,
      catalogStatus: merchant.catalogStatus,
    };
  }
}

// ==================================================
// FUTURE PROVIDER MOCKS (EXTENSIBLE STUBS)
// ==================================================

export class FutureFlipkartProvider implements ICommerceProvider {
  async search(params: SearchParams): Promise<NormalizedOffer[]> {
    return []; // Stub for future integration
  }
  async getProduct(productId: string): Promise<ProductDetails | null> {
    return null;
  }
  async getOffers(productId: string): Promise<NormalizedOffer[]> {
    return [];
  }
  async getMerchant(merchantId: string): Promise<NormalizedMerchant | null> {
    return null;
  }
}

export class FutureAmazonProvider implements ICommerceProvider {
  async search(params: SearchParams): Promise<NormalizedOffer[]> {
    return []; // Stub for future integration
  }
  async getProduct(productId: string): Promise<ProductDetails | null> {
    return null;
  }
  async getOffers(productId: string): Promise<NormalizedOffer[]> {
    return [];
  }
  async getMerchant(merchantId: string): Promise<NormalizedMerchant | null> {
    return null;
  }
}

export class FutureMerchantProvider implements ICommerceProvider {
  async search(params: SearchParams): Promise<NormalizedOffer[]> {
    return []; // Stub for future integration
  }
  async getProduct(productId: string): Promise<ProductDetails | null> {
    return null;
  }
  async getOffers(productId: string): Promise<NormalizedOffer[]> {
    return [];
  }
  async getMerchant(merchantId: string): Promise<NormalizedMerchant | null> {
    return null;
  }
}

// ==================================================
// COMMERCE SERVICE COORDINATOR (SINGLETON)
// ==================================================

export class CommerceService {
  private providers: Record<string, ICommerceProvider>;
  private defaultProvider: string = "synthetic";

  constructor(prisma: PrismaClient) {
    this.providers = {
      synthetic: new SyntheticProvider(prisma),
      flipkart: new FutureFlipkartProvider(),
      amazon: new FutureAmazonProvider(),
      merchant: new FutureMerchantProvider(),
    };
  }

  getProvider(name: string): ICommerceProvider {
    const key = name.toLowerCase();
    return this.providers[key] || this.providers[this.defaultProvider];
  }

  async searchProducts(params: SearchParams): Promise<NormalizedOffer[]> {
    const providerName = params.source ? params.source.toLowerCase() : "synthetic";
    return this.getProvider(providerName).search(params);
  }

  async getProduct(productId: string, source: string = "synthetic"): Promise<ProductDetails | null> {
    return this.getProvider(source).getProduct(productId);
  }

  async getOffers(productId: string, source: string = "synthetic"): Promise<NormalizedOffer[]> {
    return this.getProvider(source).getOffers(productId);
  }

  async getPrice(productId: string, merchantId: string, source: string = "synthetic"): Promise<number | null> {
    const offers = await this.getOffers(productId, source);
    const offer = offers.find((o) => o.merchantId === merchantId && o.availability);
    return offer ? offer.pricePaise : null;
  }

  async getAvailability(productId: string, merchantId: string, source: string = "synthetic"): Promise<boolean> {
    const offers = await this.getOffers(productId, source);
    const offer = offers.find((o) => o.merchantId === merchantId);
    return offer ? offer.availability : false;
  }

  async getShipping(productId: string, merchantId: string, source: string = "synthetic"): Promise<number | null> {
    const offers = await this.getOffers(productId, source);
    const offer = offers.find((o) => o.merchantId === merchantId);
    return offer ? offer.shippingCostPaise : null;
  }

  async getMerchant(merchantId: string, source: string = "synthetic"): Promise<NormalizedMerchant | null> {
    return this.getProvider(source).getMerchant(merchantId);
  }

  async compareProducts(productIds: string[], source: string = "synthetic"): Promise<ProductDetails[]> {
    const details: ProductDetails[] = [];
    for (const id of productIds) {
      const prod = await this.getProduct(id, source);
      if (prod) {
        details.push(prod);
      }
    }
    return details;
  }
}

// Export a singleton instance using the default database client
export const commerceService = new CommerceService(db);
