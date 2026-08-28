import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const merchant = await db.merchant.findFirst({
      where: { source: "SYNTHETIC" }
    });

    if (!merchant) {
      return NextResponse.json({ error: "No merchant found" }, { status: 404 });
    }

    return NextResponse.json({
      bundleEnabled: merchant.bundleEnabled,
      discountEnabled: merchant.discountEnabled,
      catalogStatus: merchant.catalogStatus
    });
  } catch (err) {
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const merchant = await db.merchant.findFirst({
      where: { source: "SYNTHETIC" }
    });

    if (!merchant) {
      return NextResponse.json({ error: "No merchant found" }, { status: 404 });
    }

    const updated = await db.merchant.update({
      where: { id: merchant.id },
      data: {
        bundleEnabled: body.bundleEnabled !== undefined ? body.bundleEnabled : merchant.bundleEnabled,
        discountEnabled: body.discountEnabled !== undefined ? body.discountEnabled : merchant.discountEnabled
      }
    });

    return NextResponse.json({
      bundleEnabled: updated.bundleEnabled,
      discountEnabled: updated.discountEnabled,
      catalogStatus: updated.catalogStatus
    });
  } catch (err) {
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
