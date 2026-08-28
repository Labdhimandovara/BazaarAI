import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { evaluatePurchasePolicy } from "@/services/policy";
import { recordAuditEvent } from "@/services/audit";
import { recordCommerceEvent } from "@/services/events";
import { getUsdToInrRate } from "@/services/currency";

const prepareRequestSchema = z.object({
  offerId: z.string().optional(),
  quantity: z.number().int().positive().default(1),
  basket: z.array(z.object({
    offerId: z.string(),
    quantity: z.number().int().positive().default(1)
  })).optional(),
  policyId: z.string().default("default-policy"),
  correlationId: z.string().optional(),
}).refine(data => data.offerId || (data.basket && data.basket.length > 0), {
  message: "Either offerId or a non-empty basket is required"
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

    const validation = prepareRequestSchema.safeParse(body);
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

    const { policyId } = validation.data;
    const correlationId = validation.data.correlationId || `bazaar_${Math.random().toString(36).substring(2, 10)}`;

    const requestedItems = validation.data.basket && validation.data.basket.length > 0
      ? validation.data.basket
      : [{ offerId: validation.data.offerId!, quantity: validation.data.quantity }];

    const anchorItem = requestedItems[0];
    const offerIds = requestedItems.map(item => item.offerId);
    
    // 1. Fetch offers from database to ensure price safety (avoid frontend tampering)
    const offers = await db.productOffer.findMany({
      where: { id: { in: offerIds } },
      include: { product: true },
    });

    if (offers.length !== requestedItems.length) {
      return NextResponse.json(
        { error: "OFFER_NOT_FOUND", message: "One or more specified product offers could not be found." },
        { status: 404 }
      );
    }

    // 2. Fetch target policy from database
    const policy = await db.purchasePolicy.findUnique({
      where: { id: policyId },
    });

    if (!policy) {
      return NextResponse.json(
        { error: "POLICY_NOT_FOUND", message: "The specified purchase policy could not be found." },
        { status: 404 }
      );
    }

    // 3. Parse delivery estimate (max of all items)
    const parseDeliveryDays = (est: string): number => {
      const cleaned = est.toLowerCase();
      if (cleaned.includes("same day") || cleaned.includes("0 day")) return 0;
      const match = cleaned.match(/(\d+)\s*day/);
      return match ? parseInt(match[1]) : 7;
    };
    
    let maxDeliveryDays = 0;
    let totalPaise = 0;
    const approvalItemsData = [];

    const anchorOffer = offers.find(o => o.id === anchorItem.offerId)!;

    for (const reqItem of requestedItems) {
      const offer = offers.find(o => o.id === reqItem.offerId)!;
      const deliveryDays = parseDeliveryDays(offer.deliveryEstimate);
      if (deliveryDays > maxDeliveryDays) maxDeliveryDays = deliveryDays;
      
      const itemTotal = offer.pricePaise * reqItem.quantity + offer.shippingCostPaise;
      totalPaise += itemTotal;

      approvalItemsData.push({
        offerId: offer.id,
        productId: offer.productId,
        merchantId: offer.merchantId,
        source: offer.source,
        quantity: reqItem.quantity,
        unitPricePaise: offer.pricePaise,
        shippingCostPaise: offer.shippingCostPaise,
        totalPaise: itemTotal
      });
    }

    // Fetch the AI intent parsed event to get the user-requested budget limit securely
    let userRequestedBudget: number | null = null;
    if (correlationId) {
      const aiIntentEvent = await db.auditTrail.findFirst({
        where: {
          sessionId: correlationId,
          eventType: "AI_INTENT_PARSED",
        },
      });

      if (aiIntentEvent && aiIntentEvent.metadata) {
        try {
          const meta = JSON.parse(aiIntentEvent.metadata);
          if (typeof meta.budget === "number") {
            userRequestedBudget = meta.budget;
          } else if (typeof meta.maxBudgetPaise === "number") {
            userRequestedBudget = meta.maxBudgetPaise;
          }
        } catch (err) {
          console.error("Failed to parse AI intent audit metadata:", err);
        }
      }
    }

    const accountPolicyMaximum = policy.maxAmountPaise;
    const effectiveLimit = userRequestedBudget !== null && userRequestedBudget !== undefined
      ? Math.min(userRequestedBudget, accountPolicyMaximum)
      : accountPolicyMaximum;

    // 5. Evaluate policy
    let policyTotalPaise = totalPaise;
    let policyProductPricePaise = anchorOffer.pricePaise;
    let policyShippingPaise = anchorOffer.shippingCostPaise;
    let policyCurrency = anchorOffer.currency;

    if (anchorOffer.currency.toUpperCase() === "USD") {
      const fxData = await getUsdToInrRate();
      if (fxData && fxData.rate) {
        policyProductPricePaise = Math.round(anchorOffer.pricePaise * fxData.rate);
        policyShippingPaise = Math.round(anchorOffer.shippingCostPaise * fxData.rate);
        
        policyTotalPaise = 0;
        for (const reqItem of requestedItems) {
          const offer = offers.find(o => o.id === reqItem.offerId)!;
          const itemTotalUSD = offer.pricePaise * reqItem.quantity + offer.shippingCostPaise;
          policyTotalPaise += Math.round(itemTotalUSD * fxData.rate);
        }
        policyCurrency = "INR";
      }
    }

    const evaluation = evaluatePurchasePolicy({
      productId: anchorOffer.productId,
      offerId: anchorOffer.id,
      merchantId: anchorOffer.merchantId,
      quantity: requestedItems.reduce((sum, item) => sum + item.quantity, 0),
      productPricePaise: policyProductPricePaise,
      shippingPaise: policyShippingPaise,
      totalPaise: policyTotalPaise,
      currency: policyCurrency,
      policy: {
        id: policy.id,
        name: policy.name,
        maxAmountPaise: effectiveLimit,
        currency: policy.currency,
        allowedMerchants: policy.allowedMerchants,
        blockedCategories: policy.blockedCategories,
        maxQuantity: policy.maxQuantity,
        expiresAt: policy.expiresAt,
      },
      deliveryEstimateDays: maxDeliveryDays,
    });

    // 6. Log policy evaluation event
    await recordAuditEvent({
      correlationId,
      eventType: "PURCHASE_POLICY_EVALUATED",
      outcome: evaluation.allowed ? "SUCCESS" : "BLOCKED",
      productId: anchorOffer.productId,
      offerId: anchorOffer.id,
      merchantId: anchorOffer.merchantId,
      amount: totalPaise,
      currency: anchorOffer.currency,
      metadata: {
        itemCount: requestedItems.length,
        checks: evaluation.checks.map(c => ({ name: c.name, passed: c.passed, limit: c.limit })),
        reasons: evaluation.reasons,
      },
    });

    if (evaluation.allowed) {
      // Log PURCHASE_ALLOWED
      await recordAuditEvent({
        correlationId,
        eventType: "PURCHASE_ALLOWED",
        outcome: "SUCCESS",
        productId: anchorOffer.productId,
        offerId: anchorOffer.id,
        merchantId: anchorOffer.merchantId,
        amount: totalPaise,
        currency: anchorOffer.currency,
      });

      const existingBasketEvent = await db.commerceEvent.findFirst({
        where: { sessionId: correlationId, eventType: "BASKET_CREATED" }
      });
      const eventType = existingBasketEvent ? "BASKET_UPDATED" : "BASKET_CREATED";

      await recordCommerceEvent({
        eventType,
        sessionId: correlationId,
        source: anchorOffer.source,
        offerId: anchorOffer.id,
        productId: anchorOffer.productId,
        merchantId: anchorOffer.merchantId,
        amount: totalPaise,
        metadata: {
          itemCount: requestedItems.length,
          items: requestedItems
        }
      });

      const expirationDate = new Date();
      expirationDate.setMinutes(expirationDate.getMinutes() + 15); // Approved for 15 minutes limit

      const approval = await db.purchaseApproval.create({
        data: {
          sessionId: anchorOffer.id, 
          productId: anchorOffer.productId,
          merchantId: anchorOffer.merchantId,
          approvedAmountPaise: totalPaise,
          currency: anchorOffer.currency,
          quantity: anchorItem.quantity,
          status: "PENDING",
          expiresAt: expirationDate,
          items: {
            create: approvalItemsData
          }
        },
      });

      // Write PURCHASE_PREPARED to AuditTrail
      await recordAuditEvent({
        correlationId,
        eventType: "PURCHASE_PREPARED",
        outcome: "SUCCESS",
        approvalId: approval.id,
        productId: anchorOffer.productId,
        offerId: anchorOffer.id,
        merchantId: anchorOffer.merchantId,
        amount: totalPaise,
        currency: anchorOffer.currency,
        metadata: {
          expiresAt: approval.expiresAt,
          basketCount: requestedItems.length
        },
      });

      return NextResponse.json({
        allowed: true,
        correlationId,
        userRequestedBudget,
        accountPolicyMaximum,
        effectiveLimit,
        totalPaise,
        approvalId: approval.id,
        approval: {
          id: approval.id,
          offerId: anchorOffer.id,
          productId: approval.productId,
          merchantId: approval.merchantId,
          quantity: approval.quantity,
          approvedAmountPaise: approval.approvedAmountPaise,
          currency: approval.currency,
          policyVersion: evaluation.policyVersion,
          expiresAt: approval.expiresAt,
          status: approval.status,
        },
        checks: evaluation.checks,
      });
    } else {
      await recordCommerceEvent({
        eventType: "POLICY_BLOCKED",
        sessionId: correlationId,
        source: anchorOffer.source,
        offerId: anchorOffer.id,
        productId: anchorOffer.productId,
        merchantId: anchorOffer.merchantId,
        amount: totalPaise,
        metadata: {
          reasons: evaluation.reasons,
          checks: evaluation.checks.map(c => ({ name: c.name, passed: c.passed, limit: c.limit }))
        }
      });

      // Log PURCHASE_BLOCKED
      await recordAuditEvent({
        correlationId,
        eventType: "PURCHASE_BLOCKED",
        outcome: "BLOCKED",
        productId: anchorOffer.productId,
        offerId: anchorOffer.id,
        merchantId: anchorOffer.merchantId,
        amount: totalPaise,
        currency: anchorOffer.currency,
        metadata: {
          reasons: evaluation.reasons,
        },
      });

      return NextResponse.json({
        allowed: false,
        correlationId,
        userRequestedBudget,
        accountPolicyMaximum,
        effectiveLimit,
        totalPaise,
        reasons: evaluation.reasons,
        checks: evaluation.checks,
      });
    }
  } catch (error) {
    console.error("Payment Prepare Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "An error occurred while preparing purchase authorization.",
      },
      { status: 500 }
    );
  }
}
