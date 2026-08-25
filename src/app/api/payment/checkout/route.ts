import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { evaluatePurchasePolicy } from "@/services/policy";
import { createRazorpayOrderServer } from "@/lib/razorpay";
import { recordAuditEvent } from "@/services/audit";

const checkoutRequestSchema = z.object({
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

    const validation = checkoutRequestSchema.safeParse(body);
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

    // 1. Fetch PurchaseApproval
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

    // Write checkout started event
    await recordAuditEvent({
      correlationId,
      eventType: "RAZORPAY_CHECKOUT_STARTED",
      outcome: "SUCCESS",
      approvalId: approval.id,
      productId: approval.productId,
      merchantId: approval.merchantId,
      amount: approval.approvedAmountPaise,
      currency: approval.currency,
    });

    // 2. Confirm status is APPROVED
    if (approval.status !== "APPROVED") {
      await recordAuditEvent({
        correlationId,
        eventType: "RAZORPAY_CHECKOUT_BLOCKED",
        outcome: "BLOCKED",
        approvalId: approval.id,
        productId: approval.productId,
        merchantId: approval.merchantId,
        amount: approval.approvedAmountPaise,
        currency: approval.currency,
        metadata: {
          reason: "Approval is not in APPROVED state.",
          currentStatus: approval.status,
        },
      });

      return NextResponse.json(
        {
          allowed: false,
          reason: "Purchase approval must be in APPROVED state to proceed.",
        },
        { status: 400 }
      );
    }

    // 3. Confirm not expired
    const now = new Date();
    if (now > new Date(approval.expiresAt)) {
      await db.purchaseApproval.update({
        where: { id: approval.id },
        data: { status: "EXPIRED" },
      });

      await recordAuditEvent({
        correlationId,
        eventType: "RAZORPAY_CHECKOUT_BLOCKED",
        outcome: "BLOCKED",
        approvalId: approval.id,
        productId: approval.productId,
        merchantId: approval.merchantId,
        amount: approval.approvedAmountPaise,
        currency: approval.currency,
        metadata: {
          reason: "Approval has expired before checkout.",
        },
      });

      return NextResponse.json(
        {
          allowed: false,
          reason: "Purchase approval has expired.",
        },
        { status: 400 }
      );
    }

    // 4. Retrieve bound offer
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

    // 6. Recalculate total cost
    const currentTotalPaise = offer.pricePaise * approval.quantity + offer.shippingCostPaise;

    // 7. Verify price safety (spike protection check)
    if (currentTotalPaise > approval.approvedAmountPaise) {
      await db.purchaseApproval.update({
        where: { id: approval.id },
        data: {
          status: "INVALIDATED",
          invalidatedAt: now,
          invalidationReason: "Price spike detected during checkout initialization.",
        },
      });

      const differencePaise = currentTotalPaise - approval.approvedAmountPaise;

      await recordAuditEvent({
        correlationId,
        eventType: "RAZORPAY_CHECKOUT_BLOCKED",
        outcome: "BLOCKED",
        approvalId: approval.id,
        productId: offer.productId,
        offerId: offer.id,
        merchantId: offer.merchantId,
        amount: currentTotalPaise,
        currency: offer.currency,
        metadata: {
          approvedAmountPaise: approval.approvedAmountPaise,
          currentAmountPaise: currentTotalPaise,
          differencePaise,
          reason: "Price spike detected.",
        },
      });

      // Also record PURCHASE_INVALIDATED event
      await recordAuditEvent({
        correlationId,
        eventType: "PURCHASE_INVALIDATED",
        outcome: "FAILURE",
        approvalId: approval.id,
        productId: offer.productId,
        offerId: offer.id,
        merchantId: offer.merchantId,
        amount: currentTotalPaise,
        currency: offer.currency,
        metadata: {
          approvedAmountPaise: approval.approvedAmountPaise,
          currentAmountPaise: currentTotalPaise,
          differencePaise,
        },
      });

      return NextResponse.json({
        allowed: false,
        reason: "Current price no longer satisfies the approved purchase policy.",
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
          invalidationReason: "Policy validation failed during checkout.",
        },
      });

      await recordAuditEvent({
        correlationId,
        eventType: "RAZORPAY_CHECKOUT_BLOCKED",
        outcome: "BLOCKED",
        approvalId: approval.id,
        productId: offer.productId,
        offerId: offer.id,
        merchantId: offer.merchantId,
        amount: currentTotalPaise,
        currency: offer.currency,
        metadata: {
          reason: "Policy check failed during checkout.",
          reasons: evaluation.reasons,
        },
      });

      return NextResponse.json({
        allowed: false,
        reason: "Current purchase no longer satisfies your authorized spending policy.",
        userRequestedBudget,
        accountPolicyMaximum,
        effectiveLimit,
      });
    }

    // 9. Create Razorpay order
    const orderReceipt = `receipt_app_${approval.id.slice(0, 10)}_${Date.now().toString().slice(-6)}`;
    const razorpayOrder = await createRazorpayOrderServer({
      amount: currentTotalPaise,
      currency: offer.currency,
      receipt: orderReceipt,
      notes: {
        approvalId: approval.id,
        productId: offer.productId,
        offerId: offer.id,
        merchantId: offer.merchantId,
      },
    });

    // 10. Store order in Transaction table
    const transaction = await db.transaction.create({
      data: {
        purchaseApprovalId: approval.id,
        razorpayOrderId: razorpayOrder.id,
        approvedAmountPaise: approval.approvedAmountPaise,
        finalAmountPaise: currentTotalPaise,
        currency: offer.currency,
        status: "INITIATED",
      },
    });

    // 11. Write AuditTrail record
    await recordAuditEvent({
      correlationId,
      eventType: "RAZORPAY_ORDER_CREATED",
      outcome: "SUCCESS",
      approvalId: approval.id,
      transactionId: transaction.id,
      productId: offer.productId,
      offerId: offer.id,
      merchantId: offer.merchantId,
      amount: currentTotalPaise,
      currency: offer.currency,
      metadata: {
        orderId: razorpayOrder.id,
      },
    });

    return NextResponse.json({
      allowed: true,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID || "your-razorpay-key-id-here",
      userRequestedBudget,
      accountPolicyMaximum,
      effectiveLimit,
    });
  } catch (error) {
    console.error("Razorpay Checkout Endpoint Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "An error occurred while setting up payment order.",
      },
      { status: 500 }
    );
  }
}
