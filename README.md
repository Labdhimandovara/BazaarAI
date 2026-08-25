# RazorBuy AI - Synthetic Commerce Catalog & Environment

This repository contains a controlled, provider-agnostic synthetic commerce catalog built for the RazorBuy AI Agent. It allows developers to test complex buyer search, scoring, and purchase policy workflows deterministically.

## Scenarios Configured in Seeding

The catalog includes 5 merchants (with one blocked), 100+ canonical products, and 250+ individual product offers with varying metadata in INR (paise).

### 1. Same Product Across Merchants (Product Normalization)
- **Product**: `Funskool Chess Set`
- **Merchant Offers**:
  - *Bazaar Depot*: "Funskool Classic Chess Board" (₹450 + ₹40 shipping, 2-day delivery, 4.2 rating)
  - *Sports & Games India*: "Funskool Standard Chess Set" (₹430 + ₹60 shipping, 4-day delivery, 4.5 rating)
  - *FastKart Express*: "Funskool Chess Classic" (₹490 + ₹0 shipping, 1-day delivery, 4.0 rating)

### 2. Cheapest Scenario
- **Product**: `SG Cricket Bat`
- **Merchant Offers**:
  - *Sports & Games India* offers it at ₹950 (cheapest).
  - *Bazaar Depot* offers it at ₹1200.

### 3. Fastest Scenario
- **Product**: `Boat Rockerz Headphones`
- **Merchant Offers**:
  - *FastKart Express* offers same-day delivery for ₹1800 + ₹100 shipping.
  - *Bazaar Depot* offers 4-day delivery for ₹1500 + ₹0 shipping.

### 4. Best Value Scenario
- **Product**: `Leather Journal Notebook`
- **Merchant Offers**:
  - *Bazaar Depot*: ₹350 + ₹100 shipping, 7 days delivery, 3.5 rating (cheapest but slow & low rating).
  - *Premium Boutique*: ₹650, Same-day delivery, 4.8 rating (fastest but expensive).
  - *FastKart Express*: ₹450 + ₹30 shipping, 2 days delivery, 4.6 rating (optimal overall balance).

### 5. Price Spike Scenario (Verification Gate)
- **Product**: `Dynamic Price Test Item`
- **Merchant**: *Bazaar Depot* (Offer code: `dynamic-price-test`)
- Initial pricing is set to ₹449 + ₹40 shipping (Total: ₹489). During checkout tests, the pricing will be dynamically mutated to ₹509 to trigger the purchase policy lock (approved ₹489 vs checkout ₹509).

### 6. Blocked/Inactive Merchant
- **Merchant**: `Restricted Store` (Status: `isActive = false`, `isRazorpayEnabled = false`).
- Trying to purchase any product from this store will violate policy check controls.

### 7. Out-of-Stock / Unavailable Items
- **Product**: `Rare Antique Chessboard` (Status: `availability = false`).

---

## Seeding and Database Control

All monetary values are saved as **paise** (integers) to prevent precision loss.

### How to Reset and Seed
1. Ensure your database environment variable `DATABASE_URL` is set in your `.env` file.
2. Run the migration to apply database schemas:
   ```bash
   npx prisma db push
   ```
3. Run the seed script:
   ```bash
   npx prisma db seed
   ```

To reset the database entirely, run the seed script; it automatically performs a clean delete of all related models in order of dependency before inserting the fresh dataset.

## Installation & Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in the placeholders:
   ```bash
   cp .env.example .env
   ```
3. **Database Migration and Seeding**:
   ```bash
   npx prisma db push
   npx prisma db seed
   ```

## Development & Build Commands

* **Run Development Server**:
  ```bash
  npm run dev
  ```
* **Run Tests**:
  ```bash
  npx jest
  ```
* **Type-check Codebase**:
  ```bash
  npx tsc --noEmit
  ```
* **Build for Production**:
  ```bash
  npm run build
  ```

## Integration Status
* **eBay Integration**: Not yet connected (placeholder configuration ready in `.env.example`).
* **Razorpay Payment**: Integration active in Test Mode.

