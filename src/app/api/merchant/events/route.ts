import { NextResponse } from "next/server";
import { recordCommerceEvent } from "@/services/events";
import { z } from "zod";

const eventSchema = z.object({
  eventType: z.enum(["CROSS_SELL_ADDED", "EBAY_CLICKED"]),
  sessionId: z.string().optional(),
  source: z.string().optional(),
  offerId: z.string().optional(),
  productId: z.string().optional(),
  merchantId: z.string().optional(),
  amount: z.number().optional(),
  metadata: z.record(z.any()).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = eventSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid parameters", details: result.error.flatten() }, { status: 400 });
    }

    const event = await recordCommerceEvent(result.data);
    return NextResponse.json({ success: true, event });
  } catch (error) {
    console.error("Failed to handle event logger API:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
