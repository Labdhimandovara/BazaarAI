import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { db } from "@/lib/db";
import { isRazorpayConfigured } from "@/lib/razorpay";
import { recordAuditEvent } from "@/services/audit";

const verifyRequestSchema = z.object({
  razorpay_order_id: z.string().min(1, "Order ID is required"),
  razorpay_payment_id: z.string().min(1, "Payment ID is required"),
  razorpay_signature: z.string().min(1, "Signature is required"),
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

    const validation = verifyRequestSchema.safeParse(body);
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

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = validation.data;

    // 1. Fetch transaction record by Razorpay order ID
    const transaction = await db.transaction.findUnique({
      where: { razorpayOrderId: razorpay_order_id },
      include: { purchaseApproval: true },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: "TRANSACTION_NOT_FOUND", message: "The specified transaction record was not found." },
        { status: 404 }
      );
    }

    // Resolve correlationId from previous AuditTrail log
    let correlationId = `bazaar_${Math.random().toString(36).substring(2, 10)}`;
    const originalLog = await db.auditTrail.findFirst({
      where: {
        metadata: {
          contains: transaction.purchaseApprovalId,
        },
      },
    });
    if (originalLog) {
      correlationId = originalLog.sessionId;
    }

    // 2. Idempotency Check: Return success if already paid
    if (transaction.status === "SUCCESS") {
      return NextResponse.json({
        verified: true,
        transaction: {
          id: transaction.id,
          razorpayOrderId: transaction.razorpayOrderId,
          razorpayPaymentId: transaction.razorpayPaymentId,
          status: "SUCCESS",
        },
      });
    }

    // 3. Server-Side HMAC Signature Verification
    const secret = process.env.RAZORPAY_KEY_SECRET || "your-razorpay-key-secret-here";
    const dataString = `${razorpay_order_id}|${razorpay_payment_id}`;
    const generatedSignature = crypto
      .createHmac("sha256", secret)
      .update(dataString)
      .digest("hex");

    const isSignatureValid =
      generatedSignature === razorpay_signature ||
      (!isRazorpayConfigured && razorpay_signature === "mock_signature");

    if (!isSignatureValid) {
      // Mark transaction failed
      await db.transaction.update({
        where: { id: transaction.id },
        data: {
          status: "FAILED",
          failureReason: "HMAC signature mismatch.",
        },
      });

      // Write AuditTrail for signature failure using recordAuditEvent
      await recordAuditEvent({
        correlationId,
        eventType: "RAZORPAY_PAYMENT_VERIFICATION_FAILED",
        outcome: "FAILURE",
        approvalId: transaction.purchaseApprovalId,
        transactionId: transaction.id,
        productId: transaction.purchaseApproval.productId,
        merchantId: transaction.purchaseApproval.merchantId,
        amount: transaction.finalAmountPaise,
        currency: transaction.currency,
        metadata: {
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
          reason: "HMAC signature mismatch.",
        },
      });

      return NextResponse.json(
        {
          error: "SIGNATURE_MISMATCH",
          message: "Payment signature verification failed.",
        },
        { status: 400 }
      );
    }

    // 4. Mark transaction as SUCCESS
    const updatedTransaction = await db.transaction.update({
      where: { id: transaction.id },
      data: {
        status: "SUCCESS",
        razorpayPaymentId: razorpay_payment_id,
      },
    });

    // Write AuditTrail for verification success using recordAuditEvent
    await recordAuditEvent({
      correlationId,
      eventType: "RAZORPAY_PAYMENT_VERIFICATION_SUCCESS",
      outcome: "SUCCESS",
      approvalId: transaction.purchaseApprovalId,
      transactionId: transaction.id,
      productId: transaction.purchaseApproval.productId,
      merchantId: transaction.purchaseApproval.merchantId,
      amount: transaction.finalAmountPaise,
      currency: transaction.currency,
      metadata: {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
      },
    });

    return NextResponse.json({
      verified: true,
      transaction: {
        id: updatedTransaction.id,
        razorpayOrderId: updatedTransaction.razorpayOrderId,
        razorpayPaymentId: updatedTransaction.razorpayPaymentId,
        status: "SUCCESS",
      },
    });
  } catch (error) {
    console.error("Razorpay Verification Endpoint Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "An error occurred during signature verification.",
      },
      { status: 500 }
    );
  }
}
