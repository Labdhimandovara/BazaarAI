import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { evaluatePurchasePolicy } from "@/services/policy";
import { recordAuditEvent } from "@/services/audit";

const approveRequestSchema = z.object({
  approvalId: z.string().min(1, "Approval ID is required"),
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

    const validation = approveRequestSchema.safeParse(body);
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

    const { approvalId } = validation.data;

    // 1. Fetch PurchaseApproval record
    const approval = await db.purchaseApproval.findUnique({
      where: { id: approvalId },
    });

    if (!approval) {
      return NextResponse.json(
        { error: "APPROVAL_NOT_FOUND", message: "The specified purchase approval was not found." },
        { status: 404 }
      );
    }

    // Resolve correlationId from previous AuditTrail log
    let correlationId = `bazaar_${Math.random().toString(36).substring(2, 10)}`;
    const originalLog = await db.auditTrail.findFirst({
      where: {
        metadata: {
          contains: approval.id,
        },
      },
    });
    if (originalLog) {
      correlationId = originalLog.sessionId;
    }

    // 2. Reuse Protection: Verify status is PENDING
    if (approval.status !== "PENDING") {
      await recordAuditEvent({
        correlationId,
        eventType: "PURCHASE_APPROVAL_REUSED",
        outcome: "BLOCKED",
        approvalId: approval.id,
        productId: approval.productId,
        merchantId: approval.merchantId,
        amount: approval.approvedAmountPaise,
        metadata: {
          previousStatus: approval.status,
        },
      });

      return NextResponse.json({
        allowed: false,
        status: "BLOCKED",
        reasons: ["Purchase approval has already been consumed."],
      });
    }

    // 3. Expiration Check
    const now = new Date();
    if (now > new Date(approval.expiresAt)) {
      await db.purchaseApproval.update({
        where: { id: approval.id },
        data: { status: "EXPIRED" },
      });

      await recordAuditEvent({
        correlationId,
        eventType: "PURCHASE_APPROVAL_EXPIRED",
        outcome: "EXPIRED",
        approvalId: approval.id,
        productId: approval.productId,
        merchantId: approval.merchantId,
        amount: approval.approvedAmountPaise,
      });

      return NextResponse.json({
        allowed: false,
        status: "EXPIRED",
        reasons: ["Purchase approval has expired."],
      });
    }

    // 4. Retrieve original bound offer ID from sessionId
    const offerId = approval.sessionId;

    // 5. Fetch CURRENT offer from database
    const offer = await db.productOffer.findUnique({
      where: { id: offerId },
    });

    if (!offer) {
      return NextResponse.json(
        { error: "OFFER_NOT_FOUND", message: "The original product offer is no longer available." },
        { status: 404 }
      );
    }

    // 6. Recalculate current total server-side
    const currentTotalPaise = offer.pricePaise * approval.quantity + offer.shippingCostPaise;

    // 7. Check for Price Spike
    if (currentTotalPaise > approval.approvedAmountPaise) {
      await db.purchaseApproval.update({
        where: { id: approval.id },
        data: {
          status: "INVALIDATED",
          invalidatedAt: now,
          invalidationReason: "Price spike detected during confirmation.",
        },
      });

      const differencePaise = currentTotalPaise - approval.approvedAmountPaise;

      await recordAuditEvent({
        correlationId,
        eventType: "PURCHASE_INVALIDATED",
        outcome: "FAILURE",
        approvalId: approval.id,
        productId: offer.productId,
        offerId: offer.id,
        merchantId: offer.merchantId,
        amount: currentTotalPaise,
        metadata: {
          approvedAmountPaise: approval.approvedAmountPaise,
          currentAmountPaise: currentTotalPaise,
          differencePaise,
        },
      });

      return NextResponse.json({
        allowed: false,
        status: "INVALIDATED",
        reasons: [
          `The current price is ₹${differencePaise / 100} higher than the approved amount and exceeds your authorized purchase.`,
        ],
        priceSpike: true,
        approvedAmountPaise: approval.approvedAmountPaise,
        currentAmountPaise: currentTotalPaise,
      });
    }

    // 8. Re-evaluate policy against current DB settings
    const policy = await db.purchasePolicy.findFirst({
      where: { currency: offer.currency },
    });

    const parseDeliveryDays = (est: string): number => {
      const cleaned = est.toLowerCase();
      if (cleaned.includes("same day") || cleaned.includes("0 day")) return 0;
      const match = cleaned.match(/(\d+)\s*day/);
      return match ? parseInt(match[1]) : 7;
    };
    const deliveryDays = parseDeliveryDays(offer.deliveryEstimate);

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

    const accountPolicyMaximum = policy ? policy.maxAmountPaise : 100000000;
    const effectiveLimit = userRequestedBudget !== null && userRequestedBudget !== undefined
      ? Math.min(userRequestedBudget, accountPolicyMaximum)
      : accountPolicyMaximum;

    const evaluation = evaluatePurchasePolicy({
      productId: offer.productId,
      offerId: offer.id,
      merchantId: offer.merchantId,
      quantity: approval.quantity,
      productPricePaise: offer.pricePaise,
      shippingPaise: offer.shippingCostPaise,
      totalPaise: currentTotalPaise,
      currency: offer.currency,
      policy: policy
        ? {
            id: policy.id,
            name: policy.name,
            maxAmountPaise: effectiveLimit,
            currency: policy.currency,
            allowedMerchants: policy.allowedMerchants,
            blockedCategories: policy.blockedCategories,
            maxQuantity: policy.maxQuantity,
            expiresAt: policy.expiresAt,
          }
        : {
            id: "fallback-policy",
            name: "RazorBuy Hackathon Policy",
            maxAmountPaise: effectiveLimit,
            currency: "INR",
            allowedMerchants: JSON.stringify([
              "merchant-bazaar-depot",
              "merchant-sports-games",
              "merchant-fastkart",
              "merchant-premium-boutique",
            ]),
            blockedCategories: JSON.stringify(["restricted"]),
            maxQuantity: 1,
            expiresAt: null,
          },
      deliveryEstimateDays: deliveryDays,
    });

    if (!evaluation.allowed) {
      await db.purchaseApproval.update({
        where: { id: approval.id },
        data: {
          status: "BLOCKED",
          invalidatedAt: now,
          invalidationReason: "Policy check failed during confirmation.",
        },
      });

      await recordAuditEvent({
        correlationId,
        eventType: "PURCHASE_BLOCKED",
        outcome: "BLOCKED",
        approvalId: approval.id,
        productId: offer.productId,
        offerId: offer.id,
        merchantId: offer.merchantId,
        amount: currentTotalPaise,
        metadata: {
          reasons: evaluation.reasons,
        },
      });

      return NextResponse.json({
        allowed: false,
        status: "BLOCKED",
        reasons: evaluation.reasons,
        userRequestedBudget,
        accountPolicyMaximum,
        effectiveLimit,
      });
    }

    // 9. Handle Price Decrease
    const isPriceDecreased = currentTotalPaise < approval.approvedAmountPaise;

    await db.purchaseApproval.update({
      where: { id: approval.id },
      data: {
        status: "APPROVED",
        approvedAt: now,
      },
    });

    if (isPriceDecreased) {
      const differencePaise = approval.approvedAmountPaise - currentTotalPaise;

      await recordAuditEvent({
        correlationId,
        eventType: "PURCHASE_PRICE_CHANGED",
        outcome: "SUCCESS",
        approvalId: approval.id,
        productId: offer.productId,
        offerId: offer.id,
        merchantId: offer.merchantId,
        amount: currentTotalPaise,
        metadata: {
          approvedAmountPaise: approval.approvedAmountPaise,
          currentAmountPaise: currentTotalPaise,
          differencePaise: -differencePaise,
        },
      });

      await recordAuditEvent({
        correlationId,
        eventType: "PURCHASE_APPROVED",
        outcome: "SUCCESS",
        approvalId: approval.id,
        productId: offer.productId,
        offerId: offer.id,
        merchantId: offer.merchantId,
        amount: currentTotalPaise,
      });

      return NextResponse.json({
        allowed: true,
        status: "APPROVED",
        approvalId: approval.id,
        priceDecreased: true,
        approvedAmountPaise: approval.approvedAmountPaise,
        currentAmountPaise: currentTotalPaise,
        userRequestedBudget,
        accountPolicyMaximum,
        effectiveLimit,
      });
    }

    // Standard Price match
    await recordAuditEvent({
      correlationId,
      eventType: "PURCHASE_APPROVED",
      outcome: "SUCCESS",
      approvalId: approval.id,
      productId: offer.productId,
      offerId: offer.id,
      merchantId: offer.merchantId,
      amount: currentTotalPaise,
    });

    return NextResponse.json({
      allowed: true,
      status: "APPROVED",
      approvalId: approval.id,
      approvedAmountPaise: approval.approvedAmountPaise,
      currentAmountPaise: currentTotalPaise,
      userRequestedBudget,
      accountPolicyMaximum,
      effectiveLimit,
    });
  } catch (error) {
    console.error("Payment Approve Confirm Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "An error occurred while confirming purchase authorization.",
      },
      { status: 500 }
    );
  }
}
