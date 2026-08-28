import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const merchantId = searchParams.get("merchantId");
    
    const whereClause: any = {};
    if (merchantId) {
      whereClause.merchantId = merchantId;
    }
    
    // Only return Bazaar / Synthetic catalog items
    whereClause.source = "SYNTHETIC";
    
    const offers = await db.productOffer.findMany({
      where: whereClause,
      include: {
        product: true,
        merchant: true
      },
      take: 100 // Hard limit for demo
    });
    
    const catalogData = offers.map(offer => {
      return {
        id: offer.id,
        name: offer.product.canonicalName,
        brand: offer.product.brand || null,
        category: offer.product.category,
        description: offer.product.description || null,
        keywords: offer.product.attributes ? JSON.parse(offer.product.attributes).keywords || [] : [],
        price: {
          amount: offer.pricePaise / 100,
          currency: offer.currency
        },
        inventory: {
          available: offer.availability,
          quantityLimit: 5 // Default limit per policy
        },
        delivery: {
          estimate: offer.deliveryEstimate
        },
        rating: offer.sellerRating || null,
        merchant: {
          id: offer.merchant.id,
          name: offer.merchant.name
        },
        url: offer.productUrl || null,
        compatibleCategories: getCompatibleCategories(offer.product.category)
      };
    });

    return NextResponse.json({
      success: true,
      count: catalogData.length,
      data: catalogData
    });
    
  } catch (error) {
    console.error("Catalog API Error:", error);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "Failed to retrieve catalog."
      },
      { status: 500 }
    );
  }
}

function getCompatibleCategories(category: string): string[] {
  const lowerCat = category.toLowerCase();
  if (lowerCat.includes("chess")) return ["Games", "Toys", "Hobbies"];
  if (lowerCat.includes("phone")) return ["Accessories", "Electronics"];
  if (lowerCat.includes("laptop")) return ["Computer Accessories", "Office"];
  return [];
}
