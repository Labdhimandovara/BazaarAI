import { NextResponse } from "next/server";
import { z } from "zod";
import { commerceService } from "@/services/commerce";

const searchSchema = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  maxPricePaise: z.union([z.string(), z.number()]).transform((val) => {
    if (typeof val === "string") return parseInt(val, 10);
    return val;
  }).pipe(z.number().int().nonnegative()).optional(),
  minRating: z.union([z.string(), z.number()]).transform((val) => {
    if (typeof val === "string") return parseFloat(val);
    return val;
  }).pipe(z.number().min(0).max(5)).optional(),
  availability: z.enum(["IN_STOCK", "ALL"]).optional().default("ALL"),
  maxDeliveryDays: z.union([z.string(), z.number()]).transform((val) => {
    if (typeof val === "string") return parseInt(val, 10);
    return val;
  }).pipe(z.number().int().nonnegative()).optional(),
  merchantId: z.string().optional(),
  source: z.string().optional(),
  sortBy: z.enum(["price_low_to_high", "price_high_to_low", "rating", "fastest_delivery"]).optional(),
});

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const paramsObj: Record<string, string | undefined> = {};
    
    searchParams.forEach((value, key) => {
      paramsObj[key] = value;
    });

    const validationResult = searchSchema.safeParse(paramsObj);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "INVALID_PARAMETERS",
          message: "One or more query parameters are invalid.",
          details: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const offers = await commerceService.searchProducts(validationResult.data);
    return NextResponse.json({ success: true, count: offers.length, offers });
  } catch (error) {
    console.error("Search API Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "An unexpected error occurred while searching for products.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    let bodyObj = {};
    try {
      bodyObj = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: "INVALID_JSON",
          message: "Request body must be a valid JSON object.",
        },
        { status: 400 }
      );
    }

    const validationResult = searchSchema.safeParse(bodyObj);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "INVALID_PARAMETERS",
          message: "One or more payload parameters are invalid.",
          details: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const offers = await commerceService.searchProducts(validationResult.data);
    return NextResponse.json({ success: true, count: offers.length, offers });
  } catch (error) {
    console.error("Search API Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "An unexpected error occurred while searching for products.",
      },
      { status: 500 }
    );
  }
}
