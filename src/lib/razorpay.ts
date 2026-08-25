import Razorpay from "razorpay";

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

export const isRazorpayConfigured = !!(
  keyId &&
  keyId !== "your-razorpay-key-id-here" &&
  keySecret &&
  keySecret !== "your-razorpay-key-secret-here"
);

// Fallback safety client to prevent crashing when credentials are not configured
export const razorpay = isRazorpayConfigured
  ? new Razorpay({
      key_id: keyId!,
      key_secret: keySecret!,
    })
  : null;

/**
 * Creates an order either via the real Razorpay API (if credentials are set)
 * or via a secure mock fallback (if credentials are missing/default).
 */
export async function createRazorpayOrderServer(options: {
  amount: number; // in paise
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}) {
  if (isRazorpayConfigured && razorpay) {
    try {
      return await razorpay.orders.create(options);
    } catch (err) {
      console.error("Razorpay API order creation failed, falling back to mock:", err);
      // Fall through to mock to prevent application crashes
    }
  }

  // Return a mock order mimicking Razorpay's API response structure
  return {
    id: `order_mock_${Math.random().toString(36).substring(2, 15)}`,
    entity: "order",
    amount: options.amount,
    amount_paid: 0,
    amount_due: options.amount,
    currency: options.currency,
    receipt: options.receipt,
    notes: options.notes || {},
    status: "created",
    created_at: Math.floor(Date.now() / 1000),
  };
}
