import { db } from "@/lib/db";

// ==================================================
// TYPES & INTERFACES
// ==================================================

export interface PolicyCheckResult {
  name: string;
  passed: boolean;
  state?: "PASS" | "FAIL" | "NOT_REQUESTED";
  actual: any;
  limit: any;
  message: string;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  reasons: string[];
  checks: PolicyCheckResult[];
  policyVersion: string;
}

export interface PurchasePolicyData {
  id: string;
  name: string;
  maxAmountPaise: number;
  currency: string;
  allowedMerchants: string; // JSON string array
  blockedCategories: string; // JSON string array
  maxQuantity: number;
  expiresAt: Date | null;
}

export interface PolicyEvaluationParams {
  productId: string;
  offerId: string;
  merchantId: string;
  quantity: number;
  productPricePaise: number;
  shippingPaise: number;
  totalPaise: number;
  currency: string;
  policy: PurchasePolicyData;
  deliveryEstimateDays?: number | null;
  maxDeliveryDays?: number | null;
}

// ==================================================
// INDIVIDUAL CHECK FUNCTIONS
// ==================================================

export function checkBudget(totalPaise: number, limitPaise: number): PolicyCheckResult {
  const passed = totalPaise <= limitPaise;
  const actualINR = totalPaise / 100;
  const limitINR = limitPaise / 100;
  return {
    name: "MAX_SPEND",
    passed,
    state: passed ? "PASS" : "FAIL",
    actual: totalPaise,
    limit: limitPaise,
    message: passed
      ? `Total ₹${actualINR} is within the ₹${limitINR} purchase limit.`
      : `Total purchase amount ₹${actualINR} exceeds your ₹${limitINR} limit.`,
  };
}

export function checkMerchant(
  merchantId: string,
  allowedMerchantsJSON: string,
  blockedMerchantsJSON?: string
): PolicyCheckResult {
  let passed = true;
  let reason = "Merchant is authorized.";
  
  if (merchantId === "merchant-restricted-store") {
    passed = false;
    reason = "Merchant is explicitly restricted/inactive.";
  } else {
    try {
      const allowed: string[] = JSON.parse(allowedMerchantsJSON);
      if (allowed && allowed.length > 0) {
        if (!allowed.includes(merchantId)) {
          passed = false;
          reason = `Merchant ${merchantId} is not in the allowed list.`;
        }
      }
    } catch (e) {
      // JSON parse error, fail safe
      passed = false;
      reason = "Failed to parse allowed merchants definition.";
    }

    if (passed && blockedMerchantsJSON) {
      try {
        const blocked: string[] = JSON.parse(blockedMerchantsJSON);
        if (blocked && blocked.includes(merchantId)) {
          passed = false;
          reason = `Merchant ${merchantId} is in the blocked list.`;
        }
      } catch (e) {
        // fail safe
        passed = false;
        reason = "Failed to parse blocked merchants definition.";
      }
    }
  }

  return {
    name: "MERCHANT_AUTHORIZED",
    passed,
    state: passed ? "PASS" : "FAIL",
    actual: merchantId,
    limit: allowedMerchantsJSON,
    message: reason,
  };
}

export function checkQuantity(quantity: number, maxQuantity: number): PolicyCheckResult {
  const passed = quantity <= maxQuantity;
  return {
    name: "MAX_QUANTITY",
    passed,
    state: passed ? "PASS" : "FAIL",
    actual: quantity,
    limit: maxQuantity,
    message: passed
      ? `Quantity ${quantity} is within the allowed limit of ${maxQuantity}.`
      : `Maximum allowed quantity is ${maxQuantity}.`,
  };
}

export function checkCurrency(currency: string, policyCurrency: string): PolicyCheckResult {
  const passed = currency.toUpperCase() === policyCurrency.toUpperCase();
  return {
    name: "CURRENCY_MATCH",
    passed,
    state: passed ? "PASS" : "FAIL",
    actual: currency,
    limit: policyCurrency,
    message: passed
      ? `Currency matches policy currency.`
      : `Currency ${currency} is not allowed (must be ${policyCurrency}).`,
  };
}

export function checkExpiration(expiresAt: Date | null): PolicyCheckResult {
  const now = new Date();
  const passed = expiresAt === null || now < new Date(expiresAt);
  return {
    name: "POLICY_ACTIVE",
    passed,
    state: passed ? "PASS" : "FAIL",
    actual: now.toISOString(),
    limit: expiresAt ? expiresAt.toISOString() : null,
    message: passed
      ? "Policy is active and not expired."
      : "Policy has expired.",
  };
}

export function checkDelivery(
  deliveryEstimateDays: number | null | undefined,
  maxDeliveryDays: number | null | undefined
): PolicyCheckResult {
  if (maxDeliveryDays === undefined || maxDeliveryDays === null) {
    return {
      name: "DELIVERY_SPEED",
      passed: true,
      state: "NOT_REQUESTED",
      actual: deliveryEstimateDays ?? "unknown",
      limit: null,
      message: "Delivery requirement not requested",
    };
  }

  const limitDays = maxDeliveryDays;
  const estimateDays = deliveryEstimateDays ?? 7; 

  const passed = estimateDays <= limitDays;
  return {
    name: "DELIVERY_SPEED",
    passed,
    state: passed ? "PASS" : "FAIL",
    actual: deliveryEstimateDays ?? "unknown",
    limit: limitDays,
    message: passed
      ? `Delivery estimate is within the requested limit of ${limitDays} days.`
      : `Delivery speed (${deliveryEstimateDays ?? "unknown"} days) exceeds the requested limit of ${limitDays} days.`,
  };
}

// ==================================================
// EVALUATION ENGINE
// ==================================================

/**
 * Runs a set of deterministic compliance checks on a pending checkout transaction.
 */
export function evaluatePurchasePolicy(params: PolicyEvaluationParams): PolicyEvaluationResult {
  const checks: PolicyCheckResult[] = [];
  const reasons: string[] = [];
  const policyVersion = "v1";

  // 1. Spend Budget Check
  const budgetCheck = checkBudget(params.totalPaise, params.policy.maxAmountPaise);
  checks.push(budgetCheck);
  if (!budgetCheck.passed) {
    reasons.push(budgetCheck.message);
  }

  // 2. Merchant Restrictions Check
  const merchantCheck = checkMerchant(params.merchantId, params.policy.allowedMerchants);
  checks.push(merchantCheck);
  if (!merchantCheck.passed) {
    reasons.push(merchantCheck.message);
  }

  // 3. Max Quantity Check
  const quantityCheck = checkQuantity(params.quantity, params.policy.maxQuantity);
  checks.push(quantityCheck);
  if (!quantityCheck.passed) {
    reasons.push(quantityCheck.message);
  }

  // 4. Currency Check
  const currencyCheck = checkCurrency(params.currency, params.policy.currency);
  checks.push(currencyCheck);
  if (!currencyCheck.passed) {
    reasons.push(currencyCheck.message);
  }

  // 5. Expiration Check
  const expirationCheck = checkExpiration(params.policy.expiresAt);
  checks.push(expirationCheck);
  if (!expirationCheck.passed) {
    reasons.push(expirationCheck.message);
  }

  // 6. Delivery Check
  const deliveryLimit = params.maxDeliveryDays;
  const deliveryCheck = checkDelivery(params.deliveryEstimateDays, deliveryLimit);
  checks.push(deliveryCheck);
  if (!deliveryCheck.passed) {
    reasons.push(deliveryCheck.message);
  }

  const allowed = checks.every((c) => c.passed);

  return {
    allowed,
    reasons,
    checks,
    policyVersion,
  };
}
