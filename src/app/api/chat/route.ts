import { NextResponse } from "next/server";
import { z } from "zod";
import { parseIntentFromConversation, ChatMessage } from "@/services/intent";
import { commerceService, SearchParams } from "@/services/commerce";
import { rankProducts } from "@/services/scoring";
import { recordAuditEvent } from "@/services/audit";
import { filterEligibleProducts } from "@/services/eligibility";

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
    const searchParams: SearchParams = {
      query: intent.query || undefined,
      category: intent.category || undefined,
      maxPricePaise: intent.maxBudgetPaise || undefined,
      maxDeliveryDays: intent.maxDeliveryDays || undefined,
      source: intent.sourcePreference ? intent.sourcePreference.toUpperCase() : undefined,
    };

    // 4. Query Commerce Service
    const offers = await commerceService.searchProducts(searchParams);

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

    // Audit product recommendations
    if (rankedOffers.length > 0) {
      const winner = rankedOffers[0];
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
        },
      });
    }

    // 6. Return Structured Recommendations
    return NextResponse.json({
      type: "recommendations",
      intent,
      correlationId,
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
