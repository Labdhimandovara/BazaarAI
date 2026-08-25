import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting database reset...");
  
  await prisma.auditTrail.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.purchaseApproval.deleteMany({});
  await prisma.recommendation.deleteMany({});
  await prisma.productOffer.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.merchant.deleteMany({});
  await prisma.purchasePolicy.deleteMany({});

  console.log("Database cleared.");

  // 1. Seed Merchants
  console.log("Seeding merchants...");
  const merchants = [
    {
      id: "merchant-bazaar-depot",
      name: "Bazaar Depot",
      logo: "https://bazaarai.com/logos/depot.png",
      source: "SYNTHETIC",
      isActive: true,
      isRazorpayEnabled: true,
      checkoutType: "direct",
      catalogStatus: "AI_READY",
    },
    {
      id: "merchant-sports-games",
      name: "Sports & Games India",
      logo: "https://bazaarai.com/logos/sports.png",
      source: "SYNTHETIC",
      isActive: true,
      isRazorpayEnabled: true,
      checkoutType: "direct",
      catalogStatus: "AI_READY",
    },
    {
      id: "merchant-fastkart",
      name: "FastKart Express",
      logo: "https://bazaarai.com/logos/fastkart.png",
      source: "SYNTHETIC",
      isActive: true,
      isRazorpayEnabled: true,
      checkoutType: "direct",
      catalogStatus: "AI_READY",
    },
    {
      id: "merchant-premium-boutique",
      name: "Premium Boutique",
      logo: "https://bazaarai.com/logos/premium.png",
      source: "SYNTHETIC",
      isActive: true,
      isRazorpayEnabled: true,
      checkoutType: "direct",
      catalogStatus: "AI_READY",
    },
    {
      id: "merchant-restricted-store",
      name: "Restricted Store",
      logo: "https://bazaarai.com/logos/restricted.png",
      source: "SYNTHETIC",
      isActive: false, // Inactive/Blocked merchant
      isRazorpayEnabled: false,
      checkoutType: "direct",
      catalogStatus: "MANUAL",
    },
  ];

  for (const m of merchants) {
    await prisma.merchant.create({ data: m });
  }

  // 2. Seed Default Purchase Policy
  await prisma.purchasePolicy.create({
    data: {
      id: "default-policy",
      name: "RazorBuy Hackathon Policy",
      maxAmountPaise: 10000000, // ₹100,000
      currency: "INR",
      allowedMerchants: JSON.stringify(["merchant-bazaar-depot", "merchant-sports-games", "merchant-fastkart", "merchant-premium-boutique"]),
      blockedCategories: JSON.stringify(["restricted"]),
      maxQuantity: 5,
      approvalRequired: true,
      expiresAt: null,
    },
  });

  // 3. Seed Canonical Products (explicit ones first)
  const explicitProducts = [
    {
      id: "prod-chess-set",
      canonicalName: "Funskool Chess Set",
      brand: "Funskool",
      model: "Classic",
      category: "chess/games",
      description: "Classic folding board game with plastic pieces.",
      attributes: JSON.stringify({ subcategory: "chess", productType: "chess-set", pieces: 32, boardMaterial: "plastic", minAge: 6 }),
    },
    {
      id: "prod-cricket-bat",
      canonicalName: "SG Cricket Bat",
      brand: "SG",
      model: "Nexus Extra",
      category: "cricket/sports",
      description: "Kashmir willow cricket bat with web grip.",
      attributes: JSON.stringify({ subcategory: "cricket-bats", productType: "cricket-bat", willow: "Kashmir", size: "Short Handle", weight: "1.1kg" }),
    },
    {
      id: "prod-headphones",
      canonicalName: "Boat Rockerz Headphones",
      brand: "Boat",
      model: "Rockerz 450",
      category: "electronics",
      description: "On-ear wireless Bluetooth headphones with mic.",
      attributes: JSON.stringify({ subcategory: "headphones", productType: "headphones", connection: "Bluetooth", batteryHours: 15, mic: true }),
    },
    {
      id: "prod-leather-journal",
      canonicalName: "Leather Journal Notebook",
      brand: "RusticTown",
      model: "Vintage",
      category: "gifts",
      description: "Handcrafted leather journal with unlined cotton papers.",
      attributes: JSON.stringify({ subcategory: "journal", productType: "gifts", cover: "Genuine Leather", pages: 200, bind: "Hand-stitched" }),
    },
    {
      id: "prod-dynamic-test",
      canonicalName: "Dynamic Price Test Item",
      brand: "RazorBuy",
      model: "Demo-1",
      category: "gifts",
      description: "A placeholder item used to simulate checkout price fluctuations.",
      attributes: JSON.stringify({ subcategory: "test-item", productType: "gifts", useCase: "price-spike-simulation" }),
    },
    {
      id: "prod-antique-chessboard",
      canonicalName: "Rare Antique Chessboard",
      brand: "Heritage",
      model: "Limited",
      category: "chess/games",
      description: "Collector's edition solid walnut wood chessboard.",
      attributes: JSON.stringify({ subcategory: "chess", productType: "chess-set", material: "Walnut Wood", pieces: 32, finish: "Varnish" }),
    },
  ];

  for (const p of explicitProducts) {
    await prisma.product.create({ data: p });
  }

  // Define Category specs for generating ~350 products
  const categorySpecs = [
    { category: "electronics", subcategory: "laptops", productType: "laptop", brands: ["Lenovo", "HP", "Dell", "Asus", "Acer"], models: ["IdeaPad", "Pavilion", "Inspiron", "Vivobook", "Aspire"], basePrice: 45000, attributes: { ram: "16GB", storage: "512GB SSD" } },
    { category: "electronics", subcategory: "smartphones", productType: "phone", brands: ["Samsung", "Xiaomi", "OnePlus", "Realme", "Motorola"], models: ["Galaxy M34", "Redmi Note", "Nord CE", "Narzo", "Moto G"], basePrice: 18000, attributes: { battery: "5000mAh", connection: "5G" } },
    { category: "electronics", subcategory: "tablets", productType: "tablet", brands: ["Apple", "Samsung", "Lenovo", "Xiaomi"], models: ["iPad", "Tab S6 Lite", "Tab M10", "Pad 6"], basePrice: 28000, attributes: { screen: "10.9 inch" } },
    { category: "electronics", subcategory: "headphones", productType: "headphones", brands: ["Boat", "JBL", "Sony", "Sennheiser"], models: ["Rockerz", "Tune", "WH-CH", "HD Wireless"], basePrice: 1800, attributes: { connection: "Bluetooth", batteryHours: 20 } },
    { category: "electronics", subcategory: "earbuds", productType: "earbuds", brands: ["Boat", "Noise", "Boult", "Realme"], models: ["Airdopes", "Buds VS", "Airbass", "Buds Air"], basePrice: 1400, attributes: { batteryHours: 30 } },
    { category: "electronics", subcategory: "smartwatches", productType: "smartwatch", brands: ["Noise", "boAt", "Fire-Boltt", "Samsung"], models: ["ColorFit", "Wave", "Ninja", "Galaxy Watch"], basePrice: 2500, attributes: { screen: "AMOLED" } },
    { category: "footwear", subcategory: "running-shoes", productType: "running shoes", brands: ["Puma", "Adidas", "Nike", "Sparx"], models: ["Nitro", "Ultraboost", "Downshifter", "Running SM"], basePrice: 3200, attributes: { purpose: "Running" } },
    { category: "footwear", subcategory: "casual-shoes", productType: "casual shoes", brands: ["Bata", "Red Tape", "Puma", "Woodland"], models: ["Loafer Classy", "Sneaker RT", "Classic Sneaker", "Leather Boot"], basePrice: 1900, attributes: { purpose: "Casual" } },
    { category: "cricket/sports", subcategory: "cricket-bats", productType: "cricket bat", brands: ["SG", "SS", "MRF", "DSC"], models: ["Nexus Extra", "Ton Super", "Grand Edition", "Fearless"], basePrice: 2200, attributes: { willow: "Kashmir", size: "Short Handle" } },
    { category: "cricket/sports", subcategory: "cricket-balls", productType: "cricket ball", brands: ["SG", "Kookaburra", "SS"], models: ["Club Leather Ball", "Turf", "Test Leather"], basePrice: 400, attributes: { material: "Leather" } },
    { category: "chess/games", subcategory: "chess", productType: "chess-set", brands: ["Funskool", "Chesscraft", "Glow"], models: ["Classic Chess", "Wooden Tournament", "Magnetic Travel"], basePrice: 500, attributes: { pieces: 32 } },
    { category: "games", subcategory: "board-games", productType: "board games", brands: ["Hasbro", "Mattel", "Funskool"], models: ["Monopoly", "Scrabble", "Ludo Classic"], basePrice: 700, attributes: { minPlayers: 2 } },
    { category: "books", subcategory: "fiction", productType: "book", brands: ["Penguin", "HarperCollins", "Rupa Books"], models: ["The Alchemist Special", "To Kill a Mockingbird Anniversary", "Train to Pakistan Classic"], basePrice: 350, attributes: { format: "Paperback" } },
    { category: "gaming", subcategory: "controllers", productType: "gaming accessories", brands: ["Sony", "Microsoft", "Redgear"], models: ["DualSense Wireless", "Xbox Wireless Controller", "Pro Gamepad Wireless"], basePrice: 2800, attributes: { interface: "Bluetooth" } },
    { category: "bags", subcategory: "backpacks", productType: "backpack", brands: ["Skybags", "American Tourister", "Wildcraft"], models: ["Brat Pack", "Fizz", "Wiki Backpack"], basePrice: 1200, attributes: { capacity: "30L" } },
    { category: "kitchen", subcategory: "appliances", productType: "kitchen appliance", brands: ["Prestige", "Philips", "Bajaj"], models: ["Induction Cooker", "Mixer Grinder XL", "Electric Kettle 1.5L"], basePrice: 1900, attributes: { power: "1500W" } },
    { category: "home appliances", subcategory: "vacuum", productType: "home appliances", brands: ["Eureka Forbes", "Dyson", "Philips"], models: ["Super Clean Vacuum", "V11 Absolute", "Dry Vacuum Cleaner"], basePrice: 6000, attributes: { filter: "HEPA" } },
    { category: "beauty/personal care", subcategory: "hair", productType: "beauty/personal care", brands: ["Nivea", "Himalaya", "The Man Company"], models: ["Anti Hairfall Shamp", "Face Wash Neem", "Charcoal Peel Mask"], basePrice: 280, attributes: { volume: "200ml" } },
    { category: "fashion", subcategory: "clothing", productType: "fashion", brands: ["Levis", "Puma", "U.S. Polo"], models: ["Slim Fit Jeans", "Essential Tee", "Classic Polo Shirt"], basePrice: 1600, attributes: { material: "Cotton" } },
    { category: "travel", subcategory: "accessories", productType: "travel product", brands: ["Safari", "Skybags", "VIP"], models: ["Suitcase Hard", "Cabin Spinner", "Travel Neck Pillow"], basePrice: 3800, attributes: { warranty: "5 years" } }
  ];

  console.log("Generating dynamic catalog products...");
  const generatedProducts: any[] = [];
  let progCounter = 1;

  for (const spec of categorySpecs) {
    // Generate ~18 products per spec to reach ~360 products
    for (let i = 1; i <= 18; i++) {
      const brand = spec.brands[(i - 1) % spec.brands.length];
      const model = spec.models[(i - 1) % spec.models.length];
      const prodId = `prod-prog-${progCounter++}`;
      
      generatedProducts.push({
        id: prodId,
        canonicalName: `${brand} ${model} ${i}`,
        brand,
        category: spec.category,
        description: `Premium quality ${spec.productType} manufactured by ${brand}. Extremely durable and highly recommended.`,
        attributes: JSON.stringify({
          subcategory: spec.subcategory,
          productType: spec.productType,
          ...spec.attributes,
        }),
      });
    }
  }

  // Bulk write generated products
  for (const p of generatedProducts) {
    await prisma.product.create({ data: p });
  }
  console.log(`Successfully seeded ${explicitProducts.length + generatedProducts.length} products.`);

  // 4. Seed Product Offers (~1,000 offers)
  console.log("Generating product offers...");
  const offersList: any[] = [];

  // Seed explicit product offers first
  offersList.push(
    {
      productId: "prod-chess-set",
      merchantId: "merchant-bazaar-depot",
      source: "SYNTHETIC",
      sourceProductId: "syn-chess-bazaar-depot",
      pricePaise: 45000,
      shippingCostPaise: 4000,
      deliveryEstimate: "2 days",
      availability: true,
      discount: 10,
      sellerRating: 4.2,
      productUrl: "https://bazaarai.com/products/syn-chess-bazaar-depot",
      imageUrl: "https://bazaarai.com/images/chess_classic.png",
    },
    {
      productId: "prod-chess-set",
      merchantId: "merchant-sports-games",
      source: "SYNTHETIC",
      sourceProductId: "syn-chess-sports-games",
      pricePaise: 43000,
      shippingCostPaise: 6000,
      deliveryEstimate: "4 days",
      availability: true,
      discount: 15,
      sellerRating: 4.5,
      productUrl: "https://bazaarai.com/products/syn-chess-sports-games",
      imageUrl: "https://bazaarai.com/images/chess_standard.png",
    },
    {
      productId: "prod-chess-set",
      merchantId: "merchant-fastkart",
      source: "SYNTHETIC",
      sourceProductId: "syn-chess-fastkart",
      pricePaise: 49000,
      shippingCostPaise: 0,
      deliveryEstimate: "1 day",
      availability: true,
      discount: 0,
      sellerRating: 4.0,
      productUrl: "https://bazaarai.com/products/syn-chess-fastkart",
      imageUrl: "https://bazaarai.com/images/chess_fast.png",
    },
    {
      productId: "prod-cricket-bat",
      merchantId: "merchant-sports-games",
      source: "SYNTHETIC",
      sourceProductId: "syn-bat-sports-games",
      pricePaise: 95000,
      shippingCostPaise: 4000,
      deliveryEstimate: "4 days",
      availability: true,
      discount: 20,
      sellerRating: 4.4,
      productUrl: "https://bazaarai.com/products/syn-bat-sports-games",
      imageUrl: "https://bazaarai.com/images/bat_sports.png",
    },
    {
      productId: "prod-cricket-bat",
      merchantId: "merchant-bazaar-depot",
      source: "SYNTHETIC",
      sourceProductId: "syn-bat-bazaar-depot",
      pricePaise: 120000,
      shippingCostPaise: 5000,
      deliveryEstimate: "4 days",
      availability: true,
      discount: 5,
      sellerRating: 4.1,
      productUrl: "https://bazaarai.com/products/syn-bat-bazaar-depot",
      imageUrl: "https://bazaarai.com/images/bat_depot.png",
    },
    {
      productId: "prod-headphones",
      merchantId: "merchant-fastkart",
      source: "SYNTHETIC",
      sourceProductId: "syn-head-fastkart",
      pricePaise: 180000,
      shippingCostPaise: 10000,
      deliveryEstimate: "Same day",
      availability: true,
      discount: 10,
      sellerRating: 4.7,
      productUrl: "https://bazaarai.com/products/syn-head-fastkart",
      imageUrl: "https://bazaarai.com/images/headphones_fast.png",
    },
    {
      productId: "prod-headphones",
      merchantId: "merchant-bazaar-depot",
      source: "SYNTHETIC",
      sourceProductId: "syn-head-bazaar-depot",
      pricePaise: 150000,
      shippingCostPaise: 0,
      deliveryEstimate: "4 days",
      availability: true,
      discount: 15,
      sellerRating: 4.2,
      productUrl: "https://bazaarai.com/products/syn-head-bazaar-depot",
      imageUrl: "https://bazaarai.com/images/headphones_depot.png",
    },
    {
      productId: "prod-leather-journal",
      merchantId: "merchant-premium-boutique",
      source: "SYNTHETIC",
      sourceProductId: "syn-journal-premium",
      pricePaise: 65000,
      shippingCostPaise: 0,
      deliveryEstimate: "Same day",
      availability: true,
      discount: 5,
      sellerRating: 4.8,
      productUrl: "https://bazaarai.com/products/syn-journal-premium",
      imageUrl: "https://bazaarai.com/images/journal_premium.png",
    },
    {
      productId: "prod-leather-journal",
      merchantId: "merchant-bazaar-depot",
      source: "SYNTHETIC",
      sourceProductId: "syn-journal-bazaar-depot",
      pricePaise: 35000,
      shippingCostPaise: 10000,
      deliveryEstimate: "7 days",
      availability: true,
      discount: 25,
      sellerRating: 3.5,
      productUrl: "https://bazaarai.com/products/syn-journal-bazaar-depot",
      imageUrl: "https://bazaarai.com/images/journal_depot.png",
    },
    {
      productId: "prod-leather-journal",
      merchantId: "merchant-fastkart",
      source: "SYNTHETIC",
      sourceProductId: "syn-journal-fastkart",
      pricePaise: 45000,
      shippingCostPaise: 3000,
      deliveryEstimate: "2 days",
      availability: true,
      discount: 10,
      sellerRating: 4.6,
      productUrl: "https://bazaarai.com/products/syn-journal-fastkart",
      imageUrl: "https://bazaarai.com/images/journal_fast.png",
    },
    {
      productId: "prod-dynamic-test",
      merchantId: "merchant-bazaar-depot",
      source: "SYNTHETIC",
      sourceProductId: "dynamic-price-test",
      pricePaise: 44900,
      shippingCostPaise: 4000,
      deliveryEstimate: "2 days",
      availability: true,
      discount: 0,
      sellerRating: 4.9,
      productUrl: "https://bazaarai.com/products/dynamic-test",
      imageUrl: "https://bazaarai.com/images/dynamic_test.png",
    },
    {
      productId: "prod-antique-chessboard",
      merchantId: "merchant-premium-boutique",
      source: "SYNTHETIC",
      sourceProductId: "syn-antique-premium",
      pricePaise: 1500000,
      shippingCostPaise: 50000,
      deliveryEstimate: "7 days",
      availability: false,
      discount: 0,
      sellerRating: 4.9,
      productUrl: "https://bazaarai.com/products/syn-antique-premium",
      imageUrl: "https://bazaarai.com/images/antique_chess.png",
    }
  );

  // Distribute offers programmatically for generated products
  const activeMerchants = ["merchant-bazaar-depot", "merchant-sports-games", "merchant-fastkart", "merchant-premium-boutique"];
  const deliveryEstimates = ["Same day", "1 day", "2 days", "4 days", "7 days"];

  let offerCounter = 1;
  for (const p of generatedProducts) {
    const spec = categorySpecs.find(s => s.category === p.category && s.productType === JSON.parse(p.attributes).productType)!;
    
    // Create 3 offers per product (different merchants, prices)
    for (let j = 0; j < 3; j++) {
      const merchantId = activeMerchants[j % activeMerchants.length];
      const offset = offerCounter++;
      
      // Calculate realistic price in INR based on offset
      const basePriceINR = spec.basePrice;
      const priceVariationPercent = 0.9 + (j * 0.08); // 90%, 98%, 106% of base price
      const finalPricePaise = Math.round(basePriceINR * priceVariationPercent) * 100;
      
      const shippingCostPaise = finalPricePaise < 50000 ? 5000 : 0; // ₹50 shipping for items under ₹500
      const discount = (offset * j) % 25; // 0% to 25% discount
      const sellerRating = Number((3.9 + ((offset + j) % 12) * 0.1).toFixed(1)); // 3.9 to 5.0
      
      offersList.push({
        productId: p.id,
        merchantId,
        source: "SYNTHETIC",
        sourceProductId: `syn-${p.id}-${j}`,
        pricePaise: finalPricePaise,
        shippingCostPaise,
        deliveryEstimate: deliveryEstimates[(offset + j) % deliveryEstimates.length],
        availability: true,
        discount,
        sellerRating,
        productUrl: `https://bazaarai.com/products/${p.id}-${j}`,
        imageUrl: `https://bazaarai.com/images/${p.id}.png`,
      });
    }
  }

  // Bulk write offers
  for (const offer of offersList) {
    await prisma.productOffer.create({ data: offer });
  }

  console.log(`Seeded ${offersList.length} product offers.`);
  console.log("Database seed completed successfully.");
}

main()
  .catch((e) => {
    console.error("Error running seed script:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
