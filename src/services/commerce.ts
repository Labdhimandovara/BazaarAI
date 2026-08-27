import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { getUsdToInrRate } from "./currency";

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
  providerStatuses?: Record<string, string>;
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
  originalPricePaise?: number;
  originalCurrency?: string;
  displayPricePaise?: number;
  displayShippingCostPaise?: number;
  displayCurrency?: string;
  fxRate?: number;
  fxRateDate?: string;
  fxError?: boolean;
  discount: number;
  sellerRating: number | null;
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
      normalized = normalized.filter((o) => o.source.toLowerCase() === params.source!.toLowerCase());
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
      normalized = normalized.filter((o) => (o.sellerRating ?? 0) >= params.minRating!);
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
          normalized.sort((a, b) => (b.sellerRating ?? 0) - (a.sellerRating ?? 0));
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
    
    if (params.providerStatuses) {
      params.providerStatuses.synthetic = normalized.length > 0 ? "CONNECTED_RESULTS" : "CONNECTED_ZERO";
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
// EBAY PROVIDER OAUTH & BROWSE API IMPLEMENTATION
// ==================================================

export async function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 3000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export interface EbayTokenCache {
  accessToken: string;
  expiresAt: number;
}

export class EbayTokenManager {
  private cache: EbayTokenCache | null = null;

  async getToken(): Promise<string | null> {
    const environment = process.env.EBAY_ENVIRONMENT || "sandbox";
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.log("[eBay OAuth] Credentials missing (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET). Marking eBay provider as unavailable.");
      return null;
    }

    if (this.cache && this.cache.expiresAt > Date.now() + 60000) {
      return this.cache.accessToken;
    }

    const tokenUrl = environment === "sandbox"
      ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
      : "https://api.ebay.com/identity/v1/oauth2/token";

    try {
      const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      
      const response = await fetchWithTimeout(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${authHeader}`,
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          scope: "https://api.ebay.com/oauth/api_scope",
        }).toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[eBay OAuth] Token request failed with status ${response.status}: ${errorText}`);
        return null;
      }

      const data = await response.json();
      if (!data.access_token) {
        console.error("[eBay OAuth] Response did not contain access_token.");
        return null;
      }

      const expiresInMs = (data.expires_in || 7200) * 1000;
      this.cache = {
        accessToken: data.access_token,
        expiresAt: Date.now() + expiresInMs,
      };

      return this.cache.accessToken;
    } catch (err) {
      console.error("[eBay OAuth] Unexpected error retrieving access token:", err);
      return null;
    }
  }

  resetCache() {
    this.cache = null;
  }
}

export const ebayTokenManager = new EbayTokenManager();

export class EbayProvider implements ICommerceProvider {
  private tokenManager = ebayTokenManager;

  async search(params: SearchParams): Promise<NormalizedOffer[]> {
    console.log("[EBAY] search started");
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    const hasCredentials = !!(clientId && clientSecret);
    console.log(`[EBAY] credentials configured: ${hasCredentials}`);

    if (!hasCredentials) {
      if (params.providerStatuses) {
        params.providerStatuses.ebay = "UNAVAILABLE";
      }
      console.log("[EBAY] result count: 0");
      console.log("[EBAY] search completed");
      return [];
    }

    let token: string | null = null;
    try {
      token = await this.tokenManager.getToken();
    } catch (err) {
      console.error("[EBAY] OAuth exception occurred:", err);
    }

    if (!token) {
      console.log("[EBAY] OAuth failure");
      if (params.providerStatuses) {
        params.providerStatuses.ebay = "FAILED";
      }
      console.log("[EBAY] result count: 0");
      console.log("[EBAY] search completed");
      return [];
    }
    console.log("[EBAY] OAuth success");

    const environment = process.env.EBAY_ENVIRONMENT || "sandbox";
    const marketplaceId = process.env.EBAY_MARKETPLACE_ID || "EBAY_US";
    const currency = marketplaceId === "EBAY_IN" ? "INR" : "USD";

    const baseUrl = environment === "sandbox"
      ? "https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search"
      : "https://api.ebay.com/buy/browse/v1/item_summary/search";

    const urlParams = new URLSearchParams();
    if (params.query) {
      urlParams.append("q", params.query);
    } else if (params.category) {
      urlParams.append("q", params.category);
    } else {
      if (params.providerStatuses) {
        params.providerStatuses.ebay = "CONNECTED_ZERO";
      }
      console.log("[EBAY] result count: 0");
      console.log("[EBAY] search completed");
      return [];
    }

    urlParams.append("limit", "10");

    if (params.maxPricePaise !== undefined) {
      const maxPrice = params.maxPricePaise / 100;
      urlParams.append("filter", `price:[0..${maxPrice}],priceCurrency:${currency}`);
    }

    const url = `${baseUrl}?${urlParams.toString()}`;

    try {
      const response = await fetchWithTimeout(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
          "Content-Type": "application/json",
        },
      });

      console.log(`[EBAY] Browse API status: ${response.status}`);
      let rawBody = "";
      let data: any = {};
      if (typeof response.text === "function") {
        rawBody = await response.text();
        try {
          data = JSON.parse(rawBody);
        } catch (e) {}
      } else if (typeof response.json === "function") {
        data = await response.json();
        rawBody = JSON.stringify(data);
      }

      const warnings = data.warnings ? JSON.stringify(data.warnings) : "none";
      const errors = data.errors ? JSON.stringify(data.errors) : (data.message || "none");

      console.log(`[EBAY DEBUG]`);
      console.log(`HTTP status: ${response.status}`);
      console.log(`response item count: ${data.itemSummaries ? data.itemSummaries.length : 0}`);
      console.log(`response warnings/errors: warnings: ${warnings}, errors: ${errors}`);
      console.log(`marketplace: ${marketplaceId}`);
      console.log(`currency: ${currency}`);

      if (!response.ok) {
        console.error(`[eBay Provider] Search request failed with status ${response.status}: ${rawBody}`);
        if (params.providerStatuses) {
          params.providerStatuses.ebay = "FAILED";
        }
        console.log("[EBAY] result count: 0");
        console.log("[EBAY] search completed");
        return [];
      }

      if (!data.itemSummaries || !Array.isArray(data.itemSummaries)) {
        if (params.providerStatuses) {
          params.providerStatuses.ebay = "CONNECTED_ZERO";
        }
        console.log("[EBAY] result count: 0");
        console.log("[EBAY] search completed");
        return [];
      }

      const count = data.itemSummaries.length;
      console.log(`[EBAY] result count: ${count}`);
      if (params.providerStatuses) {
        params.providerStatuses.ebay = count > 0 ? "CONNECTED_RESULTS" : "CONNECTED_ZERO";
      }
      console.log("[EBAY] search completed");

      const fxData = await getUsdToInrRate();
      let fxRate = undefined;
      let fxRateDate = undefined;
      let fxError = false;
      if (fxData) {
        fxRate = fxData.rate;
        fxRateDate = fxData.date;
      } else {
        fxError = true;
      }

      let mapped = data.itemSummaries.map((item: any) => {
        const itemId = item.itemId || "unknown";
        const priceVal = parseFloat(item.price?.value || "0");
        const pricePaise = Math.round(priceVal * 100);
        const itemCurrency = item.price?.currency || currency;

        let shippingCostPaise = 0;
        if (item.shippingOptions && item.shippingOptions.length > 0) {
          const costVal = parseFloat(item.shippingOptions[0].shippingCost?.value || "0");
          shippingCostPaise = Math.round(costVal * 100);
        }

        const sellerRating = item.seller?.feedbackScore !== undefined ? 4.5 : null;

        let originalPricePaise = pricePaise;
        let originalCurrency = itemCurrency;
        let displayPricePaise = undefined;
        let displayShippingCostPaise = undefined;
        let displayCurrency = undefined;

        if (itemCurrency === 'USD' && fxRate) {
           displayPricePaise = Math.round(priceVal * fxRate * 100);
           displayShippingCostPaise = Math.round((shippingCostPaise / 100) * fxRate * 100);
           displayCurrency = 'INR';
        }

        return {
          canonicalProductId: `ebay-${itemId}`,
          productName: item.title || "eBay Product",
          brand: item.brand || null,
          category: params.category || "electronics",
          description: null,
          attributes: item.itemAspects || {},
          merchantId: item.seller?.username || "ebay-merchant",
          merchantName: item.seller?.username || "eBay Merchant",
          isMerchantActive: true,
          isRazorpayEnabled: false,
          source: "ebay",
          offerId: `ebay-offer-${itemId}`,
          sourceProductId: itemId,
          pricePaise,
          currency: itemCurrency,
          originalPricePaise,
          originalCurrency,
          displayPricePaise,
          displayShippingCostPaise,
          displayCurrency,
          fxRate,
          fxRateDate,
          fxError,
          discount: 0,
          sellerRating,
          availability: true,
          shippingCostPaise,
          deliveryEstimate: "unknown",
          productUrl: item.itemWebUrl || "https://www.ebay.com",
          imageUrl: item.image?.imageUrl || null,
          priceFetchedAt: new Date(),
        };
      });

      if (params.maxPricePaise !== undefined) {
        mapped = mapped.filter((o: NormalizedOffer) => {
          if (o.displayCurrency === 'INR' && o.displayPricePaise !== undefined) {
             const totalInr = o.displayPricePaise + (o.displayShippingCostPaise || 0);
             return totalInr <= params.maxPricePaise!;
          }
          if (o.currency === 'INR') {
             return (o.pricePaise + o.shippingCostPaise) <= params.maxPricePaise!;
          }
          return true;
        });
      }
      return mapped;
    } catch (err) {
      console.error("[EBAY] Browse API exception occurred:", err);
      if (params.providerStatuses) {
        params.providerStatuses.ebay = "FAILED";
      }
      console.log("[EBAY] result count: 0");
      console.log("[EBAY] search completed");
      return [];
    }
  }

  async getProduct(productId: string): Promise<ProductDetails | null> {
    const cleanId = productId.replace(/^ebay-/, "");
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    const token = await this.tokenManager.getToken();
    if (!token) return null;

    const environment = process.env.EBAY_ENVIRONMENT || "sandbox";
    const marketplaceId = process.env.EBAY_MARKETPLACE_ID || "EBAY_US";

    const url = environment === "sandbox"
      ? `https://api.sandbox.ebay.com/buy/browse/v1/item/${cleanId}`
      : `https://api.ebay.com/buy/browse/v1/item/${cleanId}`;

    try {
      const response = await fetchWithTimeout(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) return null;

      const item = await response.json();
      const priceVal = parseFloat(item.price?.value || "0");
      const pricePaise = Math.round(priceVal * 100);
      const itemCurrency = item.price?.currency || (marketplaceId === "EBAY_IN" ? "INR" : "USD");

      const offer: NormalizedOffer = {
        canonicalProductId: `ebay-${cleanId}`,
        productName: item.title || "eBay Product",
        brand: item.brand || null,
        category: "electronics",
        description: item.description || null,
        attributes: item.localizedAspects || {},
        merchantId: item.seller?.username || "ebay-merchant",
        merchantName: item.seller?.username || "eBay Merchant",
        isMerchantActive: true,
        isRazorpayEnabled: false,
        source: "ebay",
        offerId: `ebay-offer-${cleanId}`,
        sourceProductId: cleanId,
        pricePaise,
        currency: itemCurrency,
        discount: 0,
        sellerRating: item.seller?.feedbackScore !== undefined ? 4.5 : null,
        availability: true,
        shippingCostPaise: 0,
        deliveryEstimate: "unknown",
        productUrl: item.itemWebUrl || "https://www.ebay.com",
        imageUrl: item.image?.imageUrl || null,
        priceFetchedAt: new Date(),
      };

      return {
        id: `ebay-${cleanId}`,
        canonicalName: item.title || "eBay Product",
        brand: item.brand || "eBay Seller",
        model: null,
        category: "electronics",
        description: item.description || null,
        attributes: item.localizedAspects || {},
        offers: [offer],
      };
    } catch (err) {
      console.error(`[eBay Provider] getProduct failed for ID ${cleanId}:`, err);
      return null;
    }
  }

  async getOffers(productId: string): Promise<NormalizedOffer[]> {
    const details = await this.getProduct(productId);
    return details ? details.offers : [];
  }

  async getMerchant(merchantId: string): Promise<NormalizedMerchant | null> {
    return {
      id: merchantId,
      name: merchantId,
      logo: null,
      source: "ebay",
      isActive: true,
      isRazorpayEnabled: false,
      checkoutType: "external",
      catalogStatus: "active",
    };
  }
}

export class FutureMerchantProvider implements ICommerceProvider {
  async search(params: SearchParams): Promise<NormalizedOffer[]> {
    return [];
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
      ebay: new EbayProvider(),
      merchant: new FutureMerchantProvider(),
    };
  }

  getProvider(name: string): ICommerceProvider {
    const key = name.toLowerCase();
    return this.providers[key] || this.providers[this.defaultProvider];
  }

  async searchProducts(params: SearchParams): Promise<NormalizedOffer[]> {
    const providerName = params.source ? params.source.toLowerCase() : null;
    
    if (providerName) {
      try {
        return await this.getProvider(providerName).search(params);
      } catch (err) {
        console.error(`Error querying provider ${providerName}:`, err);
        if (providerName === "synthetic") throw err;
        return [];
      }
    }

    const results: NormalizedOffer[] = [];
    
    // 1. Query Synthetic
    try {
      const syntheticOffers = await this.getProvider("synthetic").search(params);
      results.push(...syntheticOffers);
    } catch (err) {
      console.error("Synthetic provider search failed:", err);
      throw err;
    }

    // 2. Query eBay
    try {
      const ebayOffers = await this.getProvider("ebay").search(params);
      results.push(...ebayOffers);
    } catch (err) {
      console.error("eBay provider search failed:", err);
    }

    return results;
  }

  async getProduct(productId: string, source: string = "synthetic"): Promise<ProductDetails | null> {
    const resolvedSource = productId.startsWith("ebay-") ? "ebay" : source;
    return this.getProvider(resolvedSource).getProduct(productId);
  }

  async getOffers(productId: string, source: string = "synthetic"): Promise<NormalizedOffer[]> {
    const resolvedSource = productId.startsWith("ebay-") ? "ebay" : source;
    return this.getProvider(resolvedSource).getOffers(productId);
  }

  async getPrice(productId: string, merchantId: string, source: string = "synthetic"): Promise<number | null> {
    const resolvedSource = productId.startsWith("ebay-") ? "ebay" : source;
    const offers = await this.getOffers(productId, resolvedSource);
    const offer = offers.find((o) => o.merchantId === merchantId && o.availability);
    return offer ? offer.pricePaise : null;
  }

  async getAvailability(productId: string, merchantId: string, source: string = "synthetic"): Promise<boolean> {
    const resolvedSource = productId.startsWith("ebay-") ? "ebay" : source;
    const offers = await this.getOffers(productId, resolvedSource);
    const offer = offers.find((o) => o.merchantId === merchantId);
    return offer ? offer.availability : false;
  }

  async getShipping(productId: string, merchantId: string, source: string = "synthetic"): Promise<number | null> {
    const resolvedSource = productId.startsWith("ebay-") ? "ebay" : source;
    const offers = await this.getOffers(productId, resolvedSource);
    const offer = offers.find((o) => o.merchantId === merchantId);
    return offer ? offer.shippingCostPaise : null;
  }

  async getMerchant(merchantId: string, source: string = "synthetic"): Promise<NormalizedMerchant | null> {
    const resolvedSource = source === "ebay" || merchantId.startsWith("ebay") ? "ebay" : source;
    return this.getProvider(resolvedSource).getMerchant(merchantId);
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
