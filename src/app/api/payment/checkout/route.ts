import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createRazorpayOrderServer } from "@/lib/razorpay";
import { evaluatePurchasePolicy } from "@/services/policy";
import { recordAuditEvent } from "@/services/audit";
import { recordCommerceEvent } from "@/services/events";

const checkoutRequestSchema = z.object({
  approvalId: z.string().min(1, "Approval ID is required"),
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
    const correlationId = validation.data.correlationId || `bazaar_${Math.random().toString(36).substring(2, 10)}`;

    const approval = await db.purchaseApproval.findUnique({
      where: { id: approvalId },
      include: { items: true }
    });

    if (!approval) {
      return NextResponse.json(
        { error: "APPROVAL_NOT_FOUND", message: "The specified purchase approval could not be found." },
        { status: 404 }
      );
    }

    await recordCommerceEvent({
      eventType: "CHECKOUT_STARTED",
      sessionId: correlationId,
      productId: approval.productId,
      merchantId: approval.merchantId,
      amount: approval.approvedAmountPaise,
      source: approval.items.length > 0 ? approval.items[0].source : undefined,
    });

    const now = new Date();
    if (approval.expiresAt < now) {
      await db.purchaseApproval.update({
        where: { id: approval.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json(
        { error: "APPROVAL_EXPIRED", message: "The purchase approval window has expired." },
        { status: 403 }
      );
    }

    if (approval.status !== "PENDING" && approval.status !== "APPROVED") {
      return NextResponse.json(
        { error: "INVALID_STATUS", message: `Cannot checkout because approval status is ${approval.status}.` },
        { status: 403 }
      );
    }

    let dbItems = approval.items.length > 0 ? approval.items : [
      { offerId: approval.sessionId, quantity: approval.quantity }
    ];

    let currentTotalPaise = 0;
    let maxDeliveryDays = 0;
    
    for (const item of dbItems) {
      const offer = await db.productOffer.findUnique({
        where: { id: item.offerId },
      });

      if (!offer) {
        return NextResponse.json(
          { error: "OFFER_NOT_FOUND", message: "One of the original product offers is no longer available." },
          { status: 404 }
        );
      }
      
      const parseDeliveryDays = (est: string): number => {
        const cleaned = est.toLowerCase();
        if (cleaned.includes("same day") || cleaned.includes("0 day")) return 0;
        const match = cleaned.match(/(\d+)\s*day/);
        return match ? parseInt(match[1]) : 7;
      };
      
      const dDays = parseDeliveryDays(offer.deliveryEstimate);
      if (dDays > maxDeliveryDays) maxDeliveryDays = dDays;

      currentTotalPaise += offer.pricePaise * item.quantity + offer.shippingCostPaise;
    }

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
        productId: approval.productId,
        merchantId: approval.merchantId,
        amount: currentTotalPaise,
        currency: approval.currency,
        metadata: {
          approvedAmountPaise: approval.approvedAmountPaise,
          currentAmountPaise: currentTotalPaise,
          differencePaise,
          reason: "Price spike detected.",
        },
      });

      return NextResponse.json({
        allowed: false,
        reason: "Current price no longer satisfies the approved purchase policy.",
        currentAmountPaise: currentTotalPaise,
      });
    }

    const policy = await db.purchasePolicy.findFirst({
      where: { currency: approval.currency },
    });

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
      productId: approval.productId,
      offerId: approval.sessionId, 
      merchantId: approval.merchantId,
      quantity: dbItems.reduce((acc, it) => acc + it.quantity, 0),
      productPricePaise: 0,
      shippingPaise: 0,
      totalPaise: currentTotalPaise,
      currency: approval.currency,
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
            allowedMerchants: JSON.stringify([]),
            blockedCategories: JSON.stringify([]),
            maxQuantity: 10,
            expiresAt: null,
          },
      deliveryEstimateDays: maxDeliveryDays,
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

      await recordCommerceEvent({
        eventType: "POLICY_BLOCKED",
        sessionId: correlationId,
        productId: approval.productId,
        merchantId: approval.merchantId,
        amount: currentTotalPaise,
        source: approval.items.length > 0 ? approval.items[0].source : undefined,
        metadata: {
          reasons: evaluation.reasons,
          checks: evaluation.checks.map(c => ({ name: c.name, passed: c.passed, limit: c.limit }))
        }
      });

      await recordAuditEvent({
        correlationId,
        eventType: "RAZORPAY_CHECKOUT_BLOCKED",
        outcome: "BLOCKED",
        approvalId: approval.id,
        productId: approval.productId,
        merchantId: approval.merchantId,
        amount: currentTotalPaise,
        currency: approval.currency,
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

    const orderReceipt = `receipt_app_${approval.id.slice(0, 10)}_${Date.now().toString().slice(-6)}`;
    const razorpayOrder = await createRazorpayOrderServer({
      amount: currentTotalPaise,
      currency: approval.currency,
      receipt: orderReceipt,
      notes: {
        approvalId: approval.id,
        productId: approval.productId,
        merchantId: approval.merchantId,
        basketCount: dbItems.length.toString()
      },
    });

    const transaction = await db.transaction.create({
      data: {
        purchaseApprovalId: approval.id,
        razorpayOrderId: razorpayOrder.id,
        approvedAmountPaise: approval.approvedAmountPaise,
        finalAmountPaise: currentTotalPaise,
        currency: approval.currency,
        status: "INITIATED",
      },
    });

    await recordCommerceEvent({
      eventType: "RAZORPAY_ORDER_CREATED",
      sessionId: correlationId,
      productId: approval.productId,
      merchantId: approval.merchantId,
      amount: currentTotalPaise,
      source: approval.items.length > 0 ? approval.items[0].source : undefined,
      metadata: {
        orderId: razorpayOrder.id,
        transactionId: transaction.id
      }
    });

    await recordAuditEvent({
      correlationId,
      eventType: "RAZORPAY_ORDER_CREATED",
      outcome: "SUCCESS",
      approvalId: approval.id,
      transactionId: transaction.id,
      productId: approval.productId,
      merchantId: approval.merchantId,
      amount: currentTotalPaise,
      currency: approval.currency,
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
