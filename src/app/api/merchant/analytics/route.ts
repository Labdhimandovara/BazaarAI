import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "30d"; // today, 7d, 30d

    let timeFilter: Date | undefined;
    const now = new Date();
    if (range === "today") {
      timeFilter = new Date();
      timeFilter.setHours(0, 0, 0, 0);
    } else if (range === "7d") {
      timeFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (range === "30d") {
      timeFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const whereClause: any = {};
    if (timeFilter) {
      whereClause.timestamp = { gte: timeFilter };
    }

    // 1. Get all events in range
    const events = await db.commerceEvent.findMany({
      where: whereClause,
      orderBy: { timestamp: "desc" }
    });

    // 2. Compute Core Overview Counts
    const searches = events.filter(e => e.eventType === "SEARCH_PERFORMED").length;
    const recommendations = events.filter(e => e.eventType === "PRODUCT_RECOMMENDED").length;
    const crossSellsShown = events.filter(e => e.eventType === "CROSS_SELL_SHOWN").length;
    const crossSellsAccepted = events.filter(e => e.eventType === "CROSS_SELL_ADDED").length;
    const basketCreatedCount = events.filter(e => e.eventType === "BASKET_CREATED").length;
    const checkoutStarts = events.filter(e => e.eventType === "CHECKOUT_STARTED").length;
    const policyBlocks = events.filter(e => e.eventType === "POLICY_BLOCKED").length;
    const razorpayOrders = events.filter(e => e.eventType === "RAZORPAY_ORDER_CREATED").length;
    const ebayClicks = events.filter(e => e.eventType === "EBAY_CLICKED").length;

    // Calculate dynamic products discovered
    let productsDiscovered = 0;
    events.forEach(e => {
      if (e.eventType === "PRODUCTS_FOUND" && e.metadata) {
        try {
          const meta = JSON.parse(e.metadata);
          if (typeof meta.resultCount === "number") {
            productsDiscovered += meta.resultCount;
          }
        } catch {}
      }
    });

    const crossSellAcceptanceRate = crossSellsShown > 0 
      ? parseFloat(((crossSellsAccepted / crossSellsShown) * 100).toFixed(1)) 
      : 0;

    // 3. Compute Commerce Sources
    const bazaarProductsCount = events.filter(e => e.source?.toLowerCase() === "synthetic").length;
    const ebayProductsCount = events.filter(e => e.source?.toLowerCase() === "ebay").length;

    // 4. Activity Lists (Recent 10)
    const recentEvents = events.slice(0, 10).map(e => {
      let parsedMeta = null;
      if (e.metadata) {
        try { parsedMeta = JSON.parse(e.metadata); } catch {}
      }
      return {
        id: e.id,
        eventType: e.eventType,
        timestamp: e.timestamp,
        sessionId: e.sessionId,
        source: e.source,
        offerId: e.offerId,
        productId: e.productId,
        merchantId: e.merchantId,
        amount: e.amount,
        metadata: parsedMeta
      };
    });

    // 5. Data-Driven Bundle Opportunities
    // Group all events by sessionId to find products that co-occurred in the same session
    const sessionProductsMap: Record<string, Set<string>> = {};
    events.forEach(e => {
      if (e.sessionId && e.productId) {
        if (!sessionProductsMap[e.sessionId]) {
          sessionProductsMap[e.sessionId] = new Set();
        }
        sessionProductsMap[e.sessionId].add(e.productId);
      }
    });

    const pairCounts: Record<string, number> = {};
    Object.values(sessionProductsMap).forEach(prodSet => {
      const prodList = Array.from(prodSet);
      if (prodList.length > 1) {
        for (let i = 0; i < prodList.length; i++) {
          for (let j = i + 1; j < prodList.length; j++) {
            const sortedPair = [prodList[i], prodList[j]].sort();
            const pairKey = sortedPair.join(",");
            pairCounts[pairKey] = (pairCounts[pairKey] || 0) + 1;
          }
        }
      }
    });

    // Sort pairs by co-occurrence count
    const sortedPairs = Object.entries(pairCounts).sort((a, b) => b[1] - a[1]);
    let bundleOpportunity = null;

    if (sortedPairs.length > 0) {
      const [pairKey, count] = sortedPairs[0];
      const [productAId, productBId] = pairKey.split(",");

      // Fetch product details
      const products = await db.product.findMany({
        where: { id: { in: [productAId, productBId] } }
      });

      const prodA = products.find(p => p.id === productAId);
      const prodB = products.find(p => p.id === productBId);

      if (prodA && prodB) {
        const crossSellAdditions = events.filter(e => 
          e.eventType === "CROSS_SELL_ADDED" && 
          e.productId === productBId
        ).length;

        const acceptanceRate = count > 0 
          ? parseFloat(((crossSellAdditions / count) * 100).toFixed(1))
          : 0;

        let confidence = "observed signal";
        if (count === 2) {
          confidence = "emerging opportunity";
        } else if (count >= 3) {
          confidence = "strong opportunity";
        }

        let reason = `Observed co-occurrence in user search paths.`;
        if (confidence === "strong opportunity") {
          reason = `High frequent co-occurrence (${count} journeys) indicating strong cross-sell affinity.`;
        } else if (confidence === "emerging opportunity") {
          reason = `Growing co-occurrence trend observed in recent customer journeys.`;
        }

        bundleOpportunity = {
          productAId: prodA.id,
          productAName: prodA.canonicalName,
          productBId: prodB.id,
          productBName: prodB.canonicalName,
          coOccurrences: count,
          relevantJourneys: count,
          crossSellAdditions,
          acceptanceRate,
          confidence,
          reason,
          evidence: `Co-occurred in ${count} journey${count > 1 ? "s" : ""}. Confidence: ${confidence}.`
        };
      }
    }

    // 6. Policy Block Reasons
    const policyBlockReasons: Record<string, number> = {};
    events.forEach(e => {
      if (e.eventType === "POLICY_BLOCKED" && e.metadata) {
        try {
          const meta = JSON.parse(e.metadata);
          if (Array.isArray(meta.reasons)) {
            meta.reasons.forEach((r: string) => {
              policyBlockReasons[r] = (policyBlockReasons[r] || 0) + 1;
            });
          }
        } catch {}
      }
    });

    // 7. Most Searched Categories
    const searchedCategories: Record<string, number> = {};
    events.forEach(e => {
      if (e.eventType === "SEARCH_PERFORMED" && e.metadata) {
        try {
          const meta = JSON.parse(e.metadata);
          if (meta.category) {
            searchedCategories[meta.category] = (searchedCategories[meta.category] || 0) + 1;
          }
        } catch {}
      }
    });

    // 8. Frequently Recommended Products
    const recommendedProductCounts: Record<string, number> = {};
    events.forEach(e => {
      if (e.eventType === "PRODUCT_RECOMMENDED" && e.productId) {
        recommendedProductCounts[e.productId] = (recommendedProductCounts[e.productId] || 0) + 1;
      }
    });

    const sortedRecommendations = await Promise.all(
      Object.entries(recommendedProductCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(async ([prodId, count]) => {
          const prod = await db.product.findUnique({ where: { id: prodId } });
          return {
            id: prodId,
            name: prod?.canonicalName || "Unknown Product",
            count
          };
        })
    );

    // 9. Checkout dropoff count
    const checkoutDropoff = Math.max(0, checkoutStarts - razorpayOrders);

    return NextResponse.json({
      success: true,
      range,
      overview: {
        searches,
        productsDiscovered,
        recommendations,
        crossSellsShown,
        crossSellsAccepted,
        crossSellAcceptanceRate,
        basketCreatedCount,
        checkoutStarts,
        policyBlocks,
        razorpayOrders,
        ebayClicks,
        checkoutDropoff
      },
      sources: {
        bazaar: bazaarProductsCount,
        ebay: ebayProductsCount
      },
      bundleOpportunity,
      policyBlockReasons: Object.entries(policyBlockReasons).map(([reason, count]) => ({ reason, count })),
      searchedCategories: Object.entries(searchedCategories).map(([category, count]) => ({ category, count })),
      frequentlyRecommended: sortedRecommendations,
      recentEvents
    });
  } catch (error) {
    console.error("Failed to generate real merchant analytics:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}
