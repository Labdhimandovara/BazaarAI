import { NextResponse } from "next/server";
import { generateCrossSells } from "@/services/growth";
import { z } from "zod";
import { parseIntentFromConversation, ChatMessage } from "@/services/intent";
import { commerceService, SearchParams } from "@/services/commerce";
import { rankProducts } from "@/services/scoring";
import { recordAuditEvent } from "@/services/audit";
import { filterEligibleProducts } from "@/services/eligibility";
import { recordCommerceEvent } from "@/services/events";

const chatRequestSchema = z.object({
  message: z.string().min(1, "Message cannot be empty"),
  history: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })
  ).default([]),
  sessionId: z.string().optional(),
  correlationId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "INVALID_JSON", message: "Request body must be a valid JSON object." },
        { status: 400 }
      );
    }

    const validation = chatRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "INVALID_PARAMETERS",
          message: "Validation failed.",
          details: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { message, history } = validation.data;
    const correlationId = validation.data.correlationId || validation.data.sessionId || `bazaar_${Math.random().toString(36).substring(2, 10)}`;

    // 1. Call OpenAI (or fallback) to parse conversational intent
    const result = await parseIntentFromConversation(message, history as ChatMessage[]);

    // 2. Handle clarification question cases
    if (!result.isComplete) {
      // Audit clarification questions
      await recordAuditEvent({
        correlationId,
        eventType: "AI_INTENT_PARSED",
        outcome: "FAILURE",
        metadata: {
          message: "Clarification requested from user.",
          clarificationQuestion: result.clarificationQuestion,
        },
      });

      return NextResponse.json({
        type: "clarification",
        question: result.clarificationQuestion || "Could you specify what product category and budget you are looking for?",
        correlationId,
      });
    }

    const intent = result.extractedIntent;
    if (!intent) {
      return NextResponse.json(
        { error: "INTENT_EXTRACTION_FAILED", message: "Successfully completed parsing but intent payload was missing." },
        { status: 500 }
      );
    }

    // Audit parsed intent
    await recordAuditEvent({
      correlationId,
      eventType: "AI_INTENT_PARSED",
      outcome: "SUCCESS",
      metadata: {
        category: intent.category,
        budget: intent.maxBudgetPaise,
        objective: intent.objective,
        delivery: intent.maxDeliveryDays,
        source: intent.sourcePreference,
      },
    });

    // 3. Map Intent to Search parameters
    const providerStatuses: Record<string, string> = {};
    const searchParams: SearchParams = {
      query: intent.query || undefined,
      category: intent.category || undefined,
      maxPricePaise: intent.maxBudgetPaise || undefined,
      maxDeliveryDays: intent.maxDeliveryDays || undefined,
      source: intent.sourcePreference ? intent.sourcePreference.toUpperCase() : undefined,
      providerStatuses,
    };

    // 4. Query Commerce Service
    await recordCommerceEvent({
      eventType: "SEARCH_PERFORMED",
      sessionId: correlationId,
      source: searchParams.source,
      metadata: {
        query: searchParams.query,
        category: searchParams.category,
        maxPricePaise: searchParams.maxPricePaise,
        maxDeliveryDays: searchParams.maxDeliveryDays,
      },
    });

    const offers = await commerceService.searchProducts(searchParams);

    await recordCommerceEvent({
      eventType: "PRODUCTS_FOUND",
      sessionId: correlationId,
      source: searchParams.source,
      metadata: {
        query: searchParams.query,
        category: searchParams.category,
        resultCount: offers.length,
      },
    });

    // Audit search execution
    await recordAuditEvent({
      correlationId,
      eventType: "PRODUCT_SEARCHED",
      outcome: "SUCCESS",
      metadata: {
        query: searchParams.query,
        category: searchParams.category,
        resultCount: offers.length,
      },
    });

    // 5. Query Scoring/Ranking Engine
    const scoringIntent = {
      query: intent.query || "",
      keywords: intent.preferences.length > 0 ? intent.preferences : (intent.query ? intent.query.split(" ") : []),
      maxBudgetINR: intent.maxBudgetPaise ? intent.maxBudgetPaise / 100 : undefined,
      category: intent.category || undefined,
    };

    const eligibleOffers = filterEligibleProducts(offers, intent);
    const rankedOffers = rankProducts(eligibleOffers, scoringIntent, intent.objective);

    let crossSells: any[] = [];
    if (rankedOffers.length > 0) {
      const winner = rankedOffers[0];
      crossSells = await generateCrossSells(winner.offer, intent.maxBudgetPaise || null, eligibleOffers);
      
      await recordCommerceEvent({
        eventType: "PRODUCT_RECOMMENDED",
        sessionId: correlationId,
        source: winner.offer.source,
        offerId: winner.offer.offerId,
        productId: winner.offer.canonicalProductId,
        merchantId: winner.offer.merchantId,
        amount: winner.offer.pricePaise + winner.offer.shippingCostPaise,
        metadata: {
          score: winner.scoreBreakdown.overallScore,
          objective: intent.objective,
        },
      });

      // Audit product recommendations
      await recordAuditEvent({
        correlationId,
        eventType: "PRODUCT_RECOMMENDED",
        outcome: "SUCCESS",
        productId: winner.offer.canonicalProductId,
        offerId: winner.offer.offerId,
        merchantId: winner.offer.merchantId,
        amount: winner.offer.pricePaise + winner.offer.shippingCostPaise,
        metadata: {
          score: winner.scoreBreakdown.overallScore,
          objective: intent.objective,
          reason: winner.scoreBreakdown.reasons[0],
          crossSellOffered: crossSells.length > 0,
        },
      });
      
      if (crossSells.length > 0) {
        await recordCommerceEvent({
          eventType: "CROSS_SELL_SHOWN",
          sessionId: correlationId,
          source: crossSells[0].offer.source,
          offerId: crossSells[0].offer.offerId,
          productId: crossSells[0].offer.canonicalProductId,
          merchantId: crossSells[0].offer.merchantId,
          amount: crossSells[0].offer.pricePaise + crossSells[0].offer.shippingCostPaise,
          metadata: {
            reasons: crossSells[0].reasons,
          },
        });

        await recordAuditEvent({
          correlationId,
          eventType: "GROWTH_CROSS_SELL_GENERATED",
          outcome: "SUCCESS",
          productId: crossSells[0].offer.canonicalProductId,
          offerId: crossSells[0].offer.offerId,
          merchantId: crossSells[0].offer.merchantId,
          amount: crossSells[0].offer.pricePaise + crossSells[0].offer.shippingCostPaise,
          metadata: { reasons: crossSells[0].reasons }
        });
      }
    }

    // 6. Return Structured Recommendations
    return NextResponse.json({
      type: "recommendations",
      intent,
      correlationId,
      providerStatuses,
      crossSells,
      recommendations: rankedOffers.map(ro => ({
        offerId: ro.offer.offerId,
        productName: ro.offer.productName,
        brand: ro.offer.brand,
        category: ro.offer.category,
        description: ro.offer.description,
        attributes: ro.offer.attributes,
        merchantId: ro.offer.merchantId,
        merchantName: ro.offer.merchantName,
        isMerchantActive: ro.offer.isMerchantActive,
        isRazorpayEnabled: ro.offer.isRazorpayEnabled,
        source: ro.offer.source,
        pricePaise: ro.offer.pricePaise,
        currency: ro.offer.currency,
        originalPricePaise: ro.offer.originalPricePaise,
        originalCurrency: ro.offer.originalCurrency,
        displayPricePaise: ro.offer.displayPricePaise,
        displayShippingCostPaise: ro.offer.displayShippingCostPaise,
        displayCurrency: ro.offer.displayCurrency,
        fxRate: ro.offer.fxRate,
        fxRateDate: ro.offer.fxRateDate,
        fxError: ro.offer.fxError,
        shippingCostPaise: ro.offer.shippingCostPaise,
        deliveryEstimate: ro.offer.deliveryEstimate,
        sellerRating: ro.offer.sellerRating,
        discount: ro.offer.discount,
        availability: ro.offer.availability,
        productUrl: ro.offer.productUrl,
        imageUrl: ro.offer.imageUrl,
        priceFetchedAt: ro.offer.priceFetchedAt,
        scoreBreakdown: ro.scoreBreakdown,
      })),
    });
  } catch (error) {
    console.error("Chat API Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "An unexpected error occurred inside the chat router.",
      },
      { status: 500 }
    );
  }
}
