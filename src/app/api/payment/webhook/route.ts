import { NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { recordAuditEvent } from "@/services/audit";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature") || "";
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // 1. Signature Verification (if configured)
    if (webhookSecret && webhookSecret !== "your-razorpay-webhook-secret-here" && webhookSecret !== "") {
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");

      if (expectedSignature !== signature) {
        return NextResponse.json(
          { error: "INVALID_SIGNATURE", message: "Webhook signature verification failed." },
          { status: 400 }
        );
      }
    }

    // 2. Parse Webhook Event Payload
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "INVALID_JSON", message: "Failed to parse webhook payload." },
        { status: 400 }
      );
    }

    const event = payload.event;
    const paymentEntity = payload.payload?.payment?.entity;
    const orderId = paymentEntity?.order_id || payload.payload?.order?.entity?.id;
    const paymentId = paymentEntity?.id;

    // Resolve correlationId from previous AuditTrail log
    let correlationId = orderId || `bazaar_${Math.random().toString(36).substring(2, 10)}`;
    if (orderId) {
      const originalLog = await db.auditTrail.findFirst({
        where: {
          metadata: {
            contains: orderId,
          },
        },
      });
      if (originalLog) {
        correlationId = originalLog.sessionId;
      }
    }

    // 3. Log Webhook Receipt using recordAuditEvent
    await recordAuditEvent({
      correlationId,
      eventType: "RAZORPAY_WEBHOOK_RECEIVED",
      outcome: "SUCCESS",
      metadata: {
        event,
        orderId,
        paymentId,
      },
    });

    // 4. Handle Payment Capture Event
    if ((event === "payment.captured" || event === "order.paid") && orderId) {
      const transaction = await db.transaction.findUnique({
        where: { razorpayOrderId: orderId },
        include: { purchaseApproval: true },
      });

      if (transaction && transaction.status !== "SUCCESS") {
        await db.transaction.update({
          where: { id: transaction.id },
          data: {
            status: "SUCCESS",
            razorpayPaymentId: paymentId || transaction.razorpayPaymentId,
          },
        });

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
            orderId,
            paymentId,
            via: "webhook",
          },
        });
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Razorpay Webhook Error:", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Webhook handler failed." },
      { status: 500 }
    );
  }
}
