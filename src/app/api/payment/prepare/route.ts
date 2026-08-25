import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { evaluatePurchasePolicy } from "@/services/policy";
import { recordAuditEvent } from "@/services/audit";

const prepareRequestSchema = z.object({
  offerId: z.string().min(1, "Offer ID is required"),
  quantity: z.number().int().positive().default(1),
  policyId: z.string().default("default-policy"),
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

    const { offerId, quantity, policyId } = validation.data;
    const correlationId = validation.data.correlationId || `bazaar_${Math.random().toString(36).substring(2, 10)}`;

    // 1. Fetch current offer from database to ensure price safety (avoid frontend tampering)
    const offer = await db.productOffer.findUnique({
      where: { id: offerId },
      include: { product: true },
    });

    if (!offer) {
      return NextResponse.json(
        { error: "OFFER_NOT_FOUND", message: "The specified product offer could not be found." },
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

    // 3. Parse delivery estimate
    const parseDeliveryDays = (est: string): number => {
      const cleaned = est.toLowerCase();
      if (cleaned.includes("same day") || cleaned.includes("0 day")) return 0;
      const match = cleaned.match(/(\d+)\s*day/);
      return match ? parseInt(match[1]) : 7;
    };
    const deliveryDays = parseDeliveryDays(offer.deliveryEstimate);

    // 4. Calculate total cost server-side
    const totalPaise = offer.pricePaise * quantity + offer.shippingCostPaise;

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
    const evaluation = evaluatePurchasePolicy({
      productId: offer.productId,
      offerId: offer.id,
      merchantId: offer.merchantId,
      quantity,
      productPricePaise: offer.pricePaise,
      shippingPaise: offer.shippingCostPaise,
      totalPaise,
      currency: offer.currency,
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
      deliveryEstimateDays: deliveryDays,
    });

    // 6. Log policy evaluation event
    await recordAuditEvent({
      correlationId,
      eventType: "PURCHASE_POLICY_EVALUATED",
      outcome: evaluation.allowed ? "SUCCESS" : "BLOCKED",
      productId: offer.productId,
      offerId: offer.id,
      merchantId: offer.merchantId,
      amount: totalPaise,
      currency: offer.currency,
      metadata: {
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
        productId: offer.productId,
        offerId: offer.id,
        merchantId: offer.merchantId,
        amount: totalPaise,
        currency: offer.currency,
      });

      const expirationDate = new Date();
      expirationDate.setMinutes(expirationDate.getMinutes() + 15); // Approved for 15 minutes limit

      const approval = await db.purchaseApproval.create({
        data: {
          sessionId: offer.id, // Storing offer ID securely inside sessionId
          productId: offer.productId,
          merchantId: offer.merchantId,
          approvedAmountPaise: totalPaise,
          currency: offer.currency,
          quantity,
          status: "PENDING",
          expiresAt: expirationDate,
        },
      });

      // Write PURCHASE_PREPARED to AuditTrail
      await recordAuditEvent({
        correlationId,
        eventType: "PURCHASE_PREPARED",
        outcome: "SUCCESS",
        approvalId: approval.id,
        productId: offer.productId,
        offerId: offer.id,
        merchantId: offer.merchantId,
        amount: totalPaise,
        currency: offer.currency,
        metadata: {
          expiresAt: approval.expiresAt,
        },
      });

      return NextResponse.json({
        allowed: true,
        correlationId,
        userRequestedBudget,
        accountPolicyMaximum,
        effectiveLimit,
        approvalId: approval.id,
        approval: {
          id: approval.id,
          offerId: offer.id,
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
      // Log PURCHASE_BLOCKED
      await recordAuditEvent({
        correlationId,
        eventType: "PURCHASE_BLOCKED",
        outcome: "BLOCKED",
        productId: offer.productId,
        offerId: offer.id,
        merchantId: offer.merchantId,
        amount: totalPaise,
        currency: offer.currency,
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
