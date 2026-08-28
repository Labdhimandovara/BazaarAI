"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { SourceSelector, CommerceSource } from "@/components/source-selector";
import { AIInput } from "@/components/ai-input";
import { explainScore, RankingObjective } from "@/services/scoring";
import { SearchCode, TrendingUp, Info, HelpCircle, Check, Award, AlertCircle, ShoppingCart, Bot, User, Trash2, ShieldAlert, ShieldCheck, X, RefreshCw, CreditCard, ChevronDown, ChevronUp, History, ExternalLink, Minus, Sparkles } from "lucide-react";

interface OfferItem {
  offerId: string;
  productName: string;
  brand: string;
  category: string;
  description: string | null;
  attributes: any;
  merchantId: string;
  merchantName: string;
  isMerchantActive: boolean;
  isRazorpayEnabled: boolean;
  source: string;
  pricePaise: number;
  currency: string;
  originalPricePaise?: number;
  originalCurrency?: string;
  displayPricePaise?: number;
  displayShippingCostPaise?: number;
  displayCurrency?: string;
  fxRate?: number;
  fxRateDate?: string;
  fxError?: boolean;
  shippingCostPaise: number;
  deliveryEstimate: string;
  sellerRating: number | null;
  discount: number;
  availability: boolean;
  productUrl: string;
  imageUrl: string | null;
  priceFetchedAt: Date;
  scoreBreakdown: any;
  canonicalProductId?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "clarification" | "recommendations";
  recommendations?: OfferItem[];
  intent?: any;
  crossSells?: any[];
}

// Global utility helper to format price in INR currency
const formatOfferPrice = (item: any, paise: number) => {
  if (item && (item.originalCurrency === 'USD' || item.currency === 'USD')) {
    return `$${(paise / 100).toFixed(2)} USD`;
  }
  return formatPrice(paise);
};

const formatPrice = (paise: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
};

export default function Home() {
  const [source, setSource] = useState<CommerceSource>("ALL");
  const [providerStatuses, setProviderStatuses] = useState<Record<string, string>>({
    synthetic: "CONNECTED_RESULTS",
    ebay: "UNAVAILABLE",
  });
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [objective, setObjective] = useState<RankingObjective>("best_value");
  
  // Chat History state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "initial",
      role: "assistant",
      content: "Hello. I am Bazaar AI, your agentic buyer. Tell me what you want to purchase and under what rules, and I will find, compare, and safely recommend the best option.",
      type: "text",
    },
  ]);

  // Expansion tracker for "Why this?"
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);

  // Policy evaluations mapping offerId to parsed response
  const [policyEvaluations, setPolicyEvaluations] = useState<Record<string, any>>({});
  const [basketAdditions, setBasketAdditions] = useState<Record<string, any[]>>({});
  const [basketQuantities, setBasketQuantities] = useState<Record<string, number>>({});
  const [primaryAddedMap, setPrimaryAddedMap] = useState<Record<string, boolean>>({});
  
  // Active prepare approvals mapping offerId to approval object
  const [currentApprovals, setCurrentApprovals] = useState<Record<string, any>>({});

  // Active confirm status mapping offerId to approve response details
  const [confirmStatus, setConfirmStatus] = useState<Record<string, {
    allowed: boolean;
    status: string;
    approvedAmountPaise?: number;
    currentAmountPaise?: number;
    reasons?: string[];
    priceDecreased?: boolean;
    priceSpike?: boolean;
    approvalId?: string;
  }>>({});

  // Confirming loader state
  const [isConfirmingMap, setIsConfirmingMap] = useState<Record<string, boolean>>({});

  // Checkout and verification states
  const [checkoutLoaderMap, setCheckoutLoaderMap] = useState<Record<string, string>>({});
  const [checkoutVerifyMap, setCheckoutVerifyMap] = useState<Record<string, {
    verified: boolean;
    orderId?: string;
    paymentId?: string;
    status?: string;
    error?: string;
  }>>({});

  // Active trace correlation ID
  const [currentCorrelationId, setCurrentCorrelationId] = useState<string | null>(null);

  // Collapsible Audit Timeline states
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);
  const [isFullAuditModalOpen, setIsFullAuditModalOpen] = useState(false);

  // Active modal details
  const [activeDetailOffer, setActiveDetailOffer] = useState<OfferItem | null>(null);
  const [activeSourceDetail, setActiveSourceDetail] = useState<{
    name: string;
    merchant: string;
    price: number;
    delivery: string;
  } | null>(null);

  // Track user-selected alternative override for recommendations cards
  const [selectedWinnerOfferId, setSelectedWinnerOfferId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Find the current winner offer based on objective and user overrides (declared early)
  const currentWinnerOffer = useMemo(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.type !== "recommendations" || !lastMsg.recommendations || lastMsg.recommendations.length === 0) {
      return null;
    }

    const recs = lastMsg.recommendations;
    
    if (selectedWinnerOfferId) {
      const match = recs.find(o => o.offerId === selectedWinnerOfferId);
      if (match) return match;
    }

    const sorted = [...recs].sort((a, b) => {
      const scoreA = a.scoreBreakdown.overallScore;
      const scoreB = b.scoreBreakdown.overallScore;
      if (scoreB === scoreA) {
        return (a.pricePaise + a.shippingCostPaise) - (b.pricePaise + b.shippingCostPaise);
      }
      return scoreB - scoreA;
    });
    return sorted[0];
  }, [messages, objective, selectedWinnerOfferId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Load Razorpay Checkout script dynamically in browser
  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const parseDeliveryDays = (est: string): number => {
    const cleaned = est.toLowerCase();
    if (cleaned.includes("same day") || cleaned.includes("0 day")) return 0;
    const match = cleaned.match(/(\d+)\s*day/);
    return match ? parseInt(match[1]) : 7;
  };

  // Fetch audit timeline periodically when expanded
  const fetchTimeline = async () => {
    const approval = currentWinnerOffer ? currentApprovals[currentWinnerOffer.offerId] : null;
    const approvalId = approval?.id;
    
    if (!approvalId && !currentCorrelationId) return;

    try {
      const param = approvalId ? `approvalId=${approvalId}` : `correlationId=${currentCorrelationId}`;
      const res = await fetch(`/api/audit/timeline?${param}`);
      if (res.ok) {
        const data = await res.json();
        setTimelineEvents(data.events || []);
      }
    } catch (err) {
      console.error("Failed to fetch timeline:", err);
    }
  };

  useEffect(() => {
    if (isTimelineExpanded) {
      fetchTimeline();
      const interval = setInterval(fetchTimeline, 3000);
      return () => clearInterval(interval);
    }
  }, [isTimelineExpanded, currentWinnerOffer, currentCorrelationId]);



  const fetchPolicyForOffer = async (
    offerId: string, 
    customBasket?: any[], 
    customQuantities?: Record<string, number>,
    customPrimaryAdded?: boolean
  ) => {
    try {
      const bsk = customBasket || basketAdditions[offerId] || [];
      const qtyMap = customQuantities || basketQuantities;
      const isPrimaryAdded = customPrimaryAdded !== undefined ? customPrimaryAdded : !!primaryAddedMap[offerId];
      const primaryQty = qtyMap[offerId] || 1;

      const payloadBasket: any[] = [];
      if (isPrimaryAdded) {
        payloadBasket.push({ offerId, quantity: primaryQty });
      }
      bsk.forEach(cs => {
        payloadBasket.push({
          offerId: cs.offer.offerId,
          quantity: qtyMap[cs.offer.offerId] || 1
        });
      });

      if (payloadBasket.length === 0) {
        setPolicyEvaluations((prev) => {
          const updated = { ...prev };
          delete updated[offerId];
          return updated;
        });
        setCurrentApprovals((prev) => {
          const updated = { ...prev };
          delete updated[offerId];
          return updated;
        });
        return;
      }

      const res = await fetch("/api/payment/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId,
          quantity: primaryQty,
          basket: payloadBasket,
          policyId: "default-policy",
          correlationId: currentCorrelationId || undefined
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPolicyEvaluations((prev) => ({ ...prev, [offerId]: data }));
        if (data.allowed && data.approval) {
          setCurrentApprovals((prev) => ({ ...prev, [offerId]: data.approval }));
        } else {
          // Clear approval if not allowed
          setCurrentApprovals((prev) => {
            const updated = { ...prev };
            delete updated[offerId];
            return updated;
          });
        }
        if (data.correlationId) {
          setCurrentCorrelationId(data.correlationId);
        }
        if (isTimelineExpanded) fetchTimeline();
      }
    } catch (err) {
      console.error("Failed to fetch policy evaluation:", err);
    }
  };

  const handleConfirmPurchase = async (offerId: string) => {
    const approval = currentApprovals[offerId];
    if (!approval) return;

    setIsConfirmingMap((prev) => ({ ...prev, [offerId]: true }));
    try {
      const res = await fetch("/api/payment/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: approval.id }),
      });
      const data = await res.json();
      setConfirmStatus((prev) => ({ ...prev, [offerId]: data }));
      if (isTimelineExpanded) fetchTimeline();
    } catch (err) {
      console.error("Failed to confirm purchase approval:", err);
    } finally {
      setIsConfirmingMap((prev) => ({ ...prev, [offerId]: false }));
    }
  };

  const handleRazorpayCheckout = async (offerId: string) => {
    const approval = currentApprovals[offerId];
    const confirmInfo = confirmStatus[offerId];
    if (!approval || !confirmInfo || confirmInfo.status !== "APPROVED") return;

    setCheckoutLoaderMap((prev) => ({ ...prev, [offerId]: "Creating secure payment..." }));
    
    try {
      const res = await fetch("/api/payment/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: approval.id }),
      });

      const data = await res.json();
      if (!res.ok || !data.allowed) {
        setCheckoutVerifyMap((prev) => ({
          ...prev,
          [offerId]: {
            verified: false,
            error: data.reason || "Current price no longer satisfies the approved purchase policy.",
            status: "INVALIDATED"
          }
        }));
        setConfirmStatus((prev) => ({
          ...prev,
          [offerId]: {
            allowed: false,
            status: "INVALIDATED",
            approvedAmountPaise: approval.approvedAmountPaise,
            currentAmountPaise: data.currentAmountPaise || approval.approvedAmountPaise + 1000
          }
        }));
        setCheckoutLoaderMap((prev) => ({ ...prev, [offerId]: "" }));
        if (isTimelineExpanded) fetchTimeline();
        return;
      }

      setCheckoutLoaderMap((prev) => ({ ...prev, [offerId]: "Opening Razorpay Checkout..." }));
      if (isTimelineExpanded) fetchTimeline();

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        setCheckoutVerifyMap((prev) => ({
          ...prev,
          [offerId]: { verified: false, error: "PAYMENT_CONNECTION_FAILED" }
        }));
        setCheckoutLoaderMap((prev) => ({ ...prev, [offerId]: "" }));
        return;
      }

      const isMock = data.keyId === "your-razorpay-key-id-here" || data.keyId === "mock-key-id";

      if (isMock) {
        alert("Payment demo unavailable — configure Razorpay Test Mode credentials in your local environment keys.");
        setCheckoutVerifyMap((prev) => ({
          ...prev,
          [offerId]: { verified: false, error: "Razorpay credentials not configured." }
        }));
        setCheckoutLoaderMap((prev) => ({ ...prev, [offerId]: "" }));
        return;
      }

      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: "Bazaar AI checkout",
        description: currentWinnerOffer?.productName || "RazorBuy Purchase",
        order_id: data.orderId,
        handler: async function (response: any) {
          setCheckoutLoaderMap((prev) => ({ ...prev, [offerId]: "Verifying signature..." }));
          try {
            const verifyRes = await fetch("/api/payment/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.verified) {
              setCheckoutVerifyMap((prev) => ({
                ...prev,
                [offerId]: {
                  verified: true,
                  orderId: response.razorpay_order_id,
                  paymentId: response.razorpay_payment_id,
                  status: "SUCCESS"
                }
              }));
            } else {
              setCheckoutVerifyMap((prev) => ({
                ...prev,
                [offerId]: { verified: false, error: "PAYMENT_VERIFICATION_FAILED" }
              }));
            }
          } catch (err) {
            setCheckoutVerifyMap((prev) => ({
              ...prev,
              [offerId]: { verified: false, error: "PAYMENT_CONNECTION_FAILED" }
            }));
          } finally {
            setCheckoutLoaderMap((prev) => ({ ...prev, [offerId]: "" }));
            if (isTimelineExpanded) fetchTimeline();
          }
        },
        prefill: {
          name: "Mando Dev",
          email: "mando_dev@example.com",
          contact: "9999999999"
        },
        notes: {
          approvalId: approval.id
        },
        theme: {
          color: "#0f172a"
        },
        modal: {
          ondismiss: function () {
            setCheckoutLoaderMap((prev) => ({ ...prev, [offerId]: "" }));
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error("Checkout setup failed:", err);
      setCheckoutVerifyMap((prev) => ({
        ...prev,
        [offerId]: { verified: false, error: "PAYMENT_SETUP_FAILED" }
      }));
      setCheckoutLoaderMap((prev) => ({ ...prev, [offerId]: "" }));
    }
  };

  const handleResetApprovalFlow = (offerId: string) => {
    setSelectedWinnerOfferId(null);
    setConfirmStatus((prev) => {
      const copy = { ...prev };
      delete copy[offerId];
      return copy;
    });
    setCurrentApprovals((prev) => {
      const copy = { ...prev };
      delete copy[offerId];
      return copy;
    });
    setPolicyEvaluations((prev) => {
      const copy = { ...prev };
      delete copy[offerId];
      return copy;
    });
    setCheckoutVerifyMap((prev) => {
      const copy = { ...prev };
      delete copy[offerId];
      return copy;
    });
    setCheckoutLoaderMap((prev) => {
      const copy = { ...prev };
      delete copy[offerId];
      return copy;
    });
    setPrimaryAddedMap((prev) => {
      const copy = { ...prev };
      delete copy[offerId];
      return copy;
    });
    setBasketAdditions((prev) => {
      const copy = { ...prev };
      delete copy[offerId];
      return copy;
    });
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: "initial",
        role: "assistant",
        content: "Hello. I am Bazaar AI, your agentic buyer. Tell me what you want to purchase and under what rules, and I will find, compare, and safely recommend the best option.",
        type: "text",
      },
    ]);
    setInputVal("");
    setError(null);
    setExpandedOfferId(null);
    setPolicyEvaluations({});
    setCurrentApprovals({});
    setConfirmStatus({});
    setSelectedWinnerOfferId(null);
    setCheckoutVerifyMap({});
    setCheckoutLoaderMap({});
    setCurrentCorrelationId(null);
    setTimelineEvents([]);
    setIsTimelineExpanded(false);
  };

  const handleSend = async () => {
    if (!inputVal.trim()) return;
    const userMessageText = inputVal;
    setInputVal("");
    setError(null);
    setLoading(true);
    setSelectedWinnerOfferId(null);
    setExpandedOfferId(null);
    setPolicyEvaluations({});
    setCurrentApprovals({});
    setConfirmStatus({});
    setCheckoutVerifyMap({});
    setCheckoutLoaderMap({});

    const traceId = currentCorrelationId || `bazaar_${Math.random().toString(36).substring(2, 10)}`;
    setCurrentCorrelationId(traceId);

    const userMessageId = `msg-${Date.now()}`;
    const newMessages: ChatMessage[] = [
      ...messages,
      {
        id: userMessageId,
        role: "user",
        content: userMessageText,
      },
    ];
    setMessages(newMessages);

    try {
      const apiHistory = newMessages.slice(1, -1).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let contextualMessage = userMessageText;
      if (source !== "ALL") {
        if (source === "SYNTHETIC") {
          contextualMessage = `${userMessageText} (Search only synthetic/Razorpay merchants)`;
        } else {
          contextualMessage = `${userMessageText} (Search only ${source})`;
        }
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: contextualMessage,
          history: apiHistory,
          correlationId: traceId,
        }),
      });

      if (!res.ok) {
        throw new Error("Bazaar AI connection timeout or validation failure.");
      }

      const data = await res.json();
      if (data.providerStatuses) {
        setProviderStatuses(data.providerStatuses);
      }
      const assistantMessageId = `msg-${Date.now() + 1}`;

      if (data.type === "clarification") {
        setMessages([
          ...newMessages,
          {
            id: assistantMessageId,
            role: "assistant",
            content: data.question,
            type: "clarification",
          },
        ]);
      } else if (data.type === "recommendations") {
        setMessages([
          ...newMessages,
          {
            id: assistantMessageId,
            role: "assistant",
            content: `I analyzed matches for your request on the network. Selected parameters: category is "${data.intent.category || "general"}", budget limit is ${data.intent.maxBudgetPaise ? formatPrice(data.intent.maxBudgetPaise) : "unspecified"}.`,
            type: "recommendations",
            recommendations: data.recommendations || [],
            intent: data.intent,
          },
        ]);
        if (data.intent.objective) {
          setObjective(data.intent.objective);
        }
      }
    } catch (err: any) {
      console.error(err);
      setError("AI interpretation is temporarily unavailable. Try a simpler search such as 'chess gift under ₹500'.");
      
      setMessages([
        ...newMessages,
        {
          id: `msg-${Date.now() + 1}`,
          role: "assistant",
          content: "AI interpretation is temporarily unavailable. Try a simpler search such as 'chess gift under ₹500'.",
          type: "text",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const renderTimelineItem = (event: any) => {
    const timeStr = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    switch (event.eventType) {
      case "AI_INTENT_PARSED":
        return (
          <div key={event.id} className="flex gap-2.5 text-xs text-[#172033]">
            <span className="text-emerald-500 font-bold select-none">✓</span>
            <div>
              <p className="font-semibold text-[#172033]">AI understood your request</p>
              {event.category && <p className="text-[10px] text-[#667085]">Category: {event.category} | Objective: {event.objective}</p>}
              <p className="text-[9px] text-zinc-600">{timeStr}</p>
            </div>
          </div>
        );
      case "PRODUCT_RECOMMENDED":
        return (
          <div key={event.id} className="flex gap-2.5 text-xs text-[#172033]">
            <span className="text-emerald-500 font-bold select-none">✓</span>
            <div>
              <p className="font-semibold text-[#172033]">Product recommendation created</p>
              {event.amount && <p className="text-[10px] text-[#667085]">Price: {formatPrice(event.amount)} | Score: {event.score}/100</p>}
              <p className="text-[9px] text-zinc-600">{timeStr}</p>
            </div>
          </div>
        );
      case "PURCHASE_POLICY_EVALUATED":
        const passed = event.outcome === "SUCCESS";
        return (
          <div key={event.id} className="flex gap-2.5 text-xs text-[#172033]">
            <span className={passed ? "text-emerald-500 font-bold select-none" : "text-[#D64545] font-bold select-none"}>
              {passed ? "✓" : "✕"}
            </span>
            <div>
              <p className="font-semibold text-[#172033]">Purchase policy evaluated</p>
              <p className="text-[10px] text-[#667085]">Outcome: {event.outcome}</p>
              <p className="text-[9px] text-zinc-600">{timeStr}</p>
            </div>
          </div>
        );
      case "PURCHASE_ALLOWED":
        return (
          <div key={event.id} className="flex gap-2.5 text-xs text-[#172033]">
            <span className="text-emerald-500 font-bold select-none">✓</span>
            <div>
              <p className="font-semibold text-[#172033]">Purchase policy passed</p>
              {event.amount && <p className="text-[10px] text-emerald-500 font-medium">Approved: {formatPrice(event.amount)}</p>}
              <p className="text-[9px] text-zinc-600">{timeStr}</p>
            </div>
          </div>
        );
      case "PURCHASE_BLOCKED":
        return (
          <div key={event.id} className="flex gap-2.5 text-xs text-[#172033]">
            <span className="text-[#D64545] font-bold select-none">🔒</span>
            <div>
              <p className="font-semibold text-red-400">Purchase policy blocked</p>
              {event.reasons && <p className="text-[10px] text-[#667085]">{event.reasons.join(", ")}</p>}
              <p className="text-[9px] text-zinc-600">{timeStr}</p>
            </div>
          </div>
        );
      case "PURCHASE_PREPARED":
        return (
          <div key={event.id} className="flex gap-2.5 text-xs text-[#172033]">
            <span className="text-emerald-500 font-bold select-none">✓</span>
            <div>
              <p className="font-semibold text-[#172033]">Purchase prepared</p>
              <p className="text-[10px] text-[#667085]">Approval created</p>
              <p className="text-[9px] text-zinc-600">{timeStr}</p>
            </div>
          </div>
        );
      case "PURCHASE_APPROVED":
        return (
          <div key={event.id} className="flex gap-2.5 text-xs text-[#172033]">
            <span className="text-emerald-500 font-bold select-none">✓</span>
            <div>
              <p className="font-semibold text-[#172033]">Purchase approved</p>
              <p className="text-[9px] text-zinc-600">{timeStr}</p>
            </div>
          </div>
        );
      case "PURCHASE_INVALIDATED":
        return (
          <div key={event.id} className="flex gap-2.5 text-xs text-[#172033]">
            <span className="text-[#D64545] font-bold select-none">🔒</span>
            <div>
              <p className="font-semibold text-red-400">Purchase invalidated</p>
              <p className="text-[10px] text-[#667085]">Reason: Current amount exceeds authorized limit.</p>
              <p className="text-[9px] text-zinc-600">{timeStr}</p>
            </div>
          </div>
        );
      case "PURCHASE_PRICE_CHANGED":
        const spike = (event.differencePaise || 0) > 0;
        return (
          <div key={event.id} className="flex gap-2.5 text-xs text-[#172033]">
            <span className="text-amber-500 font-bold select-none">⚠</span>
            <div>
              <p className="font-semibold text-[#172033]">Price changed</p>
              <p className="text-[10px] text-[#667085]">
                Approved: {formatPrice(event.approvedAmountPaise || 0)} | Current: {formatPrice(event.currentAmountPaise || 0)}
              </p>
              <p className="text-[10px] text-[#667085] font-bold">
                Difference: {spike ? "+" : ""}{formatPrice(event.differencePaise || 0)}
              </p>
              <p className="text-[9px] text-zinc-600">{timeStr}</p>
            </div>
          </div>
        );
      case "RAZORPAY_ORDER_CREATED":
        return (
          <div key={event.id} className="flex gap-2.5 text-xs text-[#172033]">
            <span className="text-emerald-500 font-bold select-none">✓</span>
            <div>
              <p className="font-semibold text-[#172033]">Razorpay order created</p>
              {event.amount && <p className="text-[10px] text-[#667085]">Order ID: {event.orderId} | Amount: {formatPrice(event.amount)}</p>}
              <p className="text-[9px] text-zinc-600">{timeStr}</p>
            </div>
          </div>
        );
      case "RAZORPAY_CHECKOUT_STARTED":
        return (
          <div key={event.id} className="flex gap-2.5 text-xs text-[#172033]">
            <span className="text-emerald-500 font-bold select-none">✓</span>
            <div>
              <p className="font-semibold text-[#172033]">Razorpay checkout opened</p>
              <p className="text-[9px] text-zinc-600">{timeStr}</p>
            </div>
          </div>
        );
      case "RAZORPAY_PAYMENT_VERIFICATION_SUCCESS":
        return (
          <div key={event.id} className="flex gap-2.5 text-xs text-[#172033]">
            <span className="text-emerald-400 font-bold select-none">✓</span>
            <div>
              <p className="font-semibold text-emerald-400">Payment verified</p>
              <p className="text-[10px] text-[#667085]">Razorpay Order: {event.orderId}</p>
              <p className="text-[9px] text-zinc-600">{timeStr}</p>
            </div>
          </div>
        );
      case "RAZORPAY_PAYMENT_VERIFICATION_FAILED":
        return (
          <div key={event.id} className="flex gap-2.5 text-xs text-[#172033]">
            <span className="text-[#D64545] font-bold select-none">⚠</span>
            <div>
              <p className="font-semibold text-red-400">Payment verification failed</p>
              <p className="text-[9px] text-zinc-600">{timeStr}</p>
            </div>
          </div>
        );
      case "RAZORPAY_WEBHOOK_RECEIVED":
        return (
          <div key={event.id} className="flex gap-2.5 text-xs text-[#172033]">
            <span className="text-emerald-500 font-bold select-none">✓</span>
            <div>
              <p className="font-semibold text-[#172033]">Razorpay Webhook Received</p>
              <p className="text-[10px] text-[#667085]">Event: {event.event}</p>
              <p className="text-[9px] text-zinc-600">{timeStr}</p>
            </div>
          </div>
        );
      default:
        return (
          <div key={event.id} className="flex gap-2.5 text-xs text-[#172033]">
            <span className="text-[#667085] select-none">•</span>
            <div>
              <p className="font-semibold text-[#172033]">{event.eventType}</p>
              <p className="text-[9px] text-zinc-600">{timeStr}</p>
            </div>
          </div>
        );
    }
  };

  // Helper to render recommendations blocks
  const renderRecommendations = (message: ChatMessage) => {
    const recs = message.recommendations || [];
    const intent = message.intent || {};

    if (recs.length === 0) {
      const budgetLimitVal = intent.maxBudgetPaise ? intent.maxBudgetPaise / 100 : null;
      const budgetStr = budgetLimitVal ? ` under ₹${budgetLimitVal.toLocaleString("en-IN")}` : "";
      const productType = intent.subcategory || intent.query || "products";
      const productPlural = productType.endsWith("s") ? productType : `${productType}s`;

      const isEbayOnly = source === "EBAY" || intent.sourcePreference?.toLowerCase() === "ebay";
      const headingStr = isEbayOnly 
        ? (intent.maxBudgetPaise ? `No matching eBay listings${budgetStr} found.` : `No matching eBay listings found.`)
        : `No matching ${productPlural}${budgetStr} found.`;
      
      const detailStr = (isEbayOnly && providerStatuses.ebay === "CONNECTED_ZERO")
        ? "eBay is connected, but no matching listings were returned."
        : "All scanned merchant feeds returned zero offers fitting these filters.";

      return (
        <div className="border border-dashed border-[#F3F4F6] rounded-xl p-8 text-center flex flex-col items-center justify-center gap-3 bg-white/20">
          <SearchCode className="w-8 h-8 text-[#172033]" />
          <div className="flex flex-col gap-1">
            <span className="text-[#172033] text-xs font-semibold">
              {headingStr}
            </span>
            <span className="text-zinc-650 text-[10px] max-w-xs">
              {detailStr}
            </span>
          </div>
        </div>
      );
    }

    const hasUserRequestedBudget = intent.maxBudgetPaise !== undefined && intent.maxBudgetPaise !== null;
    const budgetLimit = hasUserRequestedBudget ? intent.maxBudgetPaise / 100 : Infinity;
    
    // Sort logic to identify specials
    const cheapest = [...recs].sort(
      (a, b) => (a.pricePaise + a.shippingCostPaise) - (b.pricePaise + b.shippingCostPaise)
    )[0];
    
    const fastest = [...recs].sort(
      (a, b) => parseDeliveryDays(a.deliveryEstimate) - parseDeliveryDays(b.deliveryEstimate)
    )[0];
    
    const highestRated = [...recs].sort(
      (a, b) => (b.sellerRating ?? 0) - (a.sellerRating ?? 0)
    )[0];

    const cheapestTotalPaise = cheapest.pricePaise + cheapest.shippingCostPaise;
    const budgetViolationAll = hasUserRequestedBudget && (cheapestTotalPaise > budgetLimit * 100);

    const sortedOffers = [...recs].sort((a, b) => {
      const scoreA = a.scoreBreakdown.overallScore;
      const scoreB = b.scoreBreakdown.overallScore;
      if (scoreB === scoreA) {
        return (a.pricePaise + a.shippingCostPaise) - (b.pricePaise + b.shippingCostPaise);
      }
      return scoreB - scoreA;
    });

    const winner = selectedWinnerOfferId
      ? recs.find(o => o.offerId === selectedWinnerOfferId) || sortedOffers[0]
      : sortedOffers[0];

    const addedCrossSells = basketAdditions[winner.offerId] || [];
    const isPrimaryAdded = !!primaryAddedMap[winner.offerId];
    const primaryQty = basketQuantities[winner.offerId] || 1;

    const formatBasketItemUnitPrice = (item: any) => {
      const isEbay = item.source?.toLowerCase() === 'ebay';
      const pricePaise = item.pricePaise || item.displayPricePaise || 0;
      if (isEbay) {
        const usdPriceStr = `$${(pricePaise / 100).toFixed(2)} USD`;
        if (item.displayCurrency === 'INR' && item.displayPricePaise) {
          return `${formatPrice(item.displayPricePaise)} approx. (${usdPriceStr})`;
        }
        return usdPriceStr;
      }
      return formatPrice(pricePaise);
    };

    const formatBasketItemPrice = (item: any, quantity: number) => {
      const isEbay = item.source?.toLowerCase() === 'ebay';
      const pricePaise = item.pricePaise || item.displayPricePaise || 0;
      const totalItemPaise = pricePaise * quantity;
      
      if (isEbay) {
        const usdPriceStr = `$${(totalItemPaise / 100).toFixed(2)} USD`;
        if (item.displayCurrency === 'INR' && item.displayPricePaise) {
          const inrPricePaise = item.displayPricePaise * quantity;
          return `${formatPrice(inrPricePaise)} approx. (${usdPriceStr})`;
        }
        return usdPriceStr;
      }
      return formatPrice(totalItemPaise);
    };

    let itemCount = 0;
    let basketSubtotalPaise = 0;
    if (isPrimaryAdded) {
      itemCount += primaryQty;
      basketSubtotalPaise += winner.pricePaise * primaryQty;
    }
    addedCrossSells.forEach((cs: any) => {
      const qty = basketQuantities[cs.offer.offerId] || 1;
      itemCount += qty;
      basketSubtotalPaise += cs.offer.pricePaise * qty;
    });

    const updateQuantity = (itemOfferId: string, delta: number) => {
      setBasketQuantities((prev) => {
        const current = prev[itemOfferId] || 1;
        const next = Math.max(1, current + delta);
        const updated = { ...prev, [itemOfferId]: next };
        fetchPolicyForOffer(winner.offerId, addedCrossSells, updated, isPrimaryAdded);
        return updated;
      });
    };

    const handleRemoveCrossSell = (itemOfferId: string) => {
      const updatedBasket = addedCrossSells.filter((x: any) => x.offer.offerId !== itemOfferId);
      setBasketAdditions((prev) => ({ ...prev, [winner.offerId]: updatedBasket }));
      fetchPolicyForOffer(winner.offerId, updatedBasket, basketQuantities, isPrimaryAdded);
    };

    const handleRemovePrimary = () => {
      setPrimaryAddedMap((prev) => {
        const updated = { ...prev, [winner.offerId]: false };
        fetchPolicyForOffer(winner.offerId, addedCrossSells, basketQuantities, false);
        return updated;
      });
    };

    const handleAddPrimary = () => {
      setPrimaryAddedMap((prev) => {
        const updated = { ...prev, [winner.offerId]: true };
        fetchPolicyForOffer(winner.offerId, addedCrossSells, basketQuantities, true);
        return updated;
      });
    };

    // Compute tradeoff string
    let tradeoffText = "";
    if (winner && cheapest && fastest) {
      const winnerCost = winner.pricePaise + winner.shippingCostPaise;
      const cheapestCost = cheapest.pricePaise + cheapest.shippingCostPaise;
      const priceDiff = winnerCost - cheapestCost;
      
      if (priceDiff === 0) {
        if (winner.offerId !== fastest.offerId) {
          const daysDiff = parseDeliveryDays(winner.deliveryEstimate) - parseDeliveryDays(fastest.deliveryEstimate);
          tradeoffText = `This is the cheapest option, but arrives ${daysDiff} day${daysDiff > 1 ? "s" : ""} slower than the fastest merchant (${fastest.merchantName}).`;
        } else {
          tradeoffText = "Cheapest and most cost-effective offer on the network with no price tradeoffs.";
        }
      } else {
        const fastestDays = parseDeliveryDays(fastest.deliveryEstimate);
        const winnerDays = parseDeliveryDays(winner.deliveryEstimate);
        if (winnerDays === fastestDays && fastestDays < parseDeliveryDays(cheapest.deliveryEstimate)) {
          tradeoffText = `₹${priceDiff / 100} more than the cheapest option, but arrives ${parseDeliveryDays(cheapest.deliveryEstimate) - fastestDays} days earlier.`;
        } else {
          tradeoffText = `₹${priceDiff / 100} more than the cheapest option (${cheapest.merchantName}).`;
        }
      }
    }

    const getObjectiveExplanation = () => {
      switch (objective) {
        case "best_value":
          return "You requested best overall value. This matches keywords and categories, fits ratings, and stays in budget.";
        case "cheapest":
          return "Recommended because it has the lowest total purchase amount (price + shipping cost).";
        case "fastest":
          return "Recommended because it has the earliest delivery arrival time on the network.";
        case "highest_quality":
          return "Recommended because it displays the strongest quality ratings and seller reliability indices.";
      }
    };

    if (budgetViolationAll) {
      return (
        <div className="flex flex-col gap-4 mt-2">
          <div className="bg-[#FFFDF9] border border-[#D64545]/30 rounded-xl p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-[#D64545] shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 text-left">
              <h4 className="text-sm font-semibold text-[#D64545]">No strong match found under ₹{budgetLimit}</h4>
              <p className="text-[#667085] text-xs">
                All available options on the network exceed your specified budget constraint of ₹{budgetLimit}.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 text-left">
            <span className="text-[#667085] text-[10px] font-semibold uppercase tracking-wider">
              Closest Alternatives (Exceed Budget)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sortedOffers.slice(0, 2).map((item) => (
                <div
                  key={item.offerId}
                  onClick={() => setActiveDetailOffer(item)}
                  className="bg-white border border-[#F3F4F6] rounded-xl p-4 flex flex-col justify-between hover:border-[#E5E7EB] cursor-pointer transition-all"
                >
                  <div>
                    <span className="text-[10px] text-[#667085] uppercase">{item.brand}</span>
                    <h4 className="text-[#172033] font-semibold text-xs line-clamp-1">{item.productName}</h4>
                    <p className="text-[10px] text-[#667085] mt-1">Merchant: {item.merchantName}</p>
                  </div>
                  <div className="border-t border-[#F3F4F6] mt-3 pt-2 flex items-center justify-between text-xs">
                    <span className="font-bold text-[#D64545]">
                      {formatOfferPrice(item, item.pricePaise + item.shippingCostPaise)}
                    </span>
                    <span className="text-[10px] text-[#667085]">
                      Exceeds by {formatOfferPrice(item, item.pricePaise + item.shippingCostPaise - (budgetLimit * 100))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    const evaluation = policyEvaluations[winner.offerId];
    const evaluationTotalPaise = evaluation?.totalPaise || (winner.pricePaise + winner.shippingCostPaise);
    const approval = currentApprovals[winner.offerId];
    const confirm = confirmStatus[winner.offerId];
    const isConfirming = isConfirmingMap[winner.offerId];
    const checkoutLoader = checkoutLoaderMap[winner.offerId];
    const checkoutVerify = checkoutVerifyMap[winner.offerId];

    return (
      <div className="flex flex-col gap-6 mt-3">
        
        {/* Featured Recommendation Banner */}
        <div className="bg-[#FFFDF9] border border-[#E6E0D6] rounded-xl p-5 flex flex-col relative text-left shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#B58A3A] via-[#E6E0D6] to-[#B58A3A]" />
          
          <div className="flex items-start justify-between gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[#B58A3A] font-bold uppercase tracking-wider flex items-center gap-1">
                <Award className="w-3.5 h-3.5" />
                <span>Bazaar AI Recommends</span>
              </span>
              <h4 className="text-[#172033] font-bold text-lg mt-1 tracking-tight leading-snug">
                {winner.productName}
              </h4>
              
              <button
                onClick={() => setActiveSourceDetail({
                  name: winner.source,
                  merchant: winner.merchantName,
                  price: winner.pricePaise + winner.shippingCostPaise,
                  delivery: winner.deliveryEstimate
                })}
                className="text-[#667085] hover:text-[#172033] text-[10px] font-semibold uppercase tracking-wider text-left underline underline-offset-2"
              >
                {winner.brand || "eBay Seller"} • {winner.merchantName} ({winner.source.toLowerCase() === "ebay" ? "eBay Marketplace" : `${winner.source} — synthetic catalog`})
              </button>
            </div>

            <div className="text-right shrink-0">
              {winner.displayCurrency === 'INR' ? (
                <>
                  <span className="text-[#172033] font-extrabold text-xl">
                    {formatPrice((winner.displayPricePaise || 0) + (winner.displayShippingCostPaise || 0))} approx.
                  </span>
                  <p className="text-[10px] text-[#667085] font-semibold mt-0.5">
                    ≈ ${(((winner.originalPricePaise || winner.pricePaise) + winner.shippingCostPaise) / 100).toFixed(2)} USD
                  </p>
                </>
              ) : (
                <span className="text-[#172033] font-extrabold text-xl">
                  {winner.originalCurrency === 'USD' || winner.currency === 'USD' ? `$${((winner.pricePaise + winner.shippingCostPaise)/100).toFixed(2)} USD` : formatOfferPrice(winner, winner.pricePaise + winner.shippingCostPaise)}
                </span>
              )}
              <p className="text-[9px] text-[#667085] mt-0.5 font-medium">
                Total (Item + Shipping)
              </p>
            </div>
          </div>

          {/* Pricing Details Breakdown */}
          {winner.displayCurrency === 'INR' ? (
            <div className="mt-2 flex flex-col gap-1">
              <div className="text-[10px] text-[#667085] flex gap-4">
                <span>Item Price: ${((winner.originalPricePaise || winner.pricePaise) / 100).toFixed(2)} USD</span>
                <span>Shipping: ${(winner.shippingCostPaise / 100).toFixed(2)} USD</span>
              </div>
              <div className="text-[9px] text-[#8C95A6]">
                Converted from USD at 1 USD = ₹{winner.fxRate}. Rate date: {winner.fxRateDate}
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-col gap-1">
              <div className="text-[10px] text-[#667085] flex gap-4">
                <span>Item Price: {winner.originalCurrency === 'USD' || winner.currency === 'USD' ? `$${(winner.pricePaise/100).toFixed(2)} USD` : formatPrice(winner.pricePaise)}</span>
                <span>Shipping: {winner.originalCurrency === 'USD' || winner.currency === 'USD' ? `$${(winner.shippingCostPaise/100).toFixed(2)} USD` : formatPrice(winner.shippingCostPaise)}</span>
              </div>
              {winner.fxError && (
                <div className="text-[9px] text-[#D64545]">
                  eBay prices are currently shown in USD because INR conversion is temporarily unavailable.
                </div>
              )}
            </div>
          )}

          {/* Metrics Row */}
          <div className="grid grid-cols-3 gap-2 mt-4 bg-white/80 border border-[#F3F4F6] rounded-lg p-2.5 text-xs">
            <div className="flex flex-col">
              <span className="text-[9px] text-[#667085] font-medium uppercase">Bazaar Score</span>
              <span className="text-[#172033] font-bold mt-0.5">{winner.scoreBreakdown.overallScore}/100</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] text-[#667085] font-medium uppercase">Delivery</span>
              <span className="text-[#172033] font-semibold mt-0.5 truncate">{winner.deliveryEstimate}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] text-[#667085] font-medium uppercase">Rating</span>
              <span className="text-[#172033] font-semibold mt-0.5">{winner.sellerRating}★ / 5.0</span>
            </div>
          </div>

          {/* Basket UI Component */}
          {(addedCrossSells.length > 0 || isPrimaryAdded) && (
            <div className="mt-5 bg-white border border-[#E6E0D6] rounded-xl p-5 shadow-sm text-left">
              <div className="flex justify-between items-center border-b border-[#F3F4F6] pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-[#172033]" />
                  <span className="font-bold text-sm text-[#172033]">Your Basket</span>
                </div>
                <span className="text-[10px] font-bold bg-[#F7F4EE] text-[#172033] px-2.5 py-0.5 rounded-full">
                  {itemCount} {itemCount === 1 ? "item" : "items"}
                </span>
              </div>

              <div className="space-y-4">
                {/* Primary Item Row */}
                {isPrimaryAdded ? (
                  <div className="flex justify-between items-center gap-4 text-xs pb-3 border-b border-[#F3F4F6]">
                    <div className="flex-1">
                      <div className="font-semibold text-[#172033]">{winner.productName}</div>
                      <div className="text-[10px] text-[#667085] mt-0.5">
                        {winner.source} • Unit Price: {formatBasketItemUnitPrice(winner)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 border border-[#D1D5DB] rounded bg-white">
                        <button
                          onClick={() => updateQuantity(winner.offerId, -1)}
                          className="px-2 py-0.5 text-xs hover:bg-[#F3F4F6] font-bold text-[#172033]"
                        >
                          -
                        </button>
                        <span className="px-1 text-xs text-[#172033] font-semibold">{primaryQty}</span>
                        <button
                          onClick={() => updateQuantity(winner.offerId, 1)}
                          className="px-2 py-0.5 text-xs hover:bg-[#F3F4F6] font-bold text-[#172033]"
                        >
                          +
                        </button>
                      </div>
                      <span className="font-bold text-[#172033] w-16 text-right">
                        {formatBasketItemPrice(winner, primaryQty)}
                      </span>
                      <button
                        onClick={handleRemovePrimary}
                        className="text-red-500 hover:text-red-700 font-bold ml-2 text-[10px]"
                      >
                        REMOVE
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-[#667085] italic py-1 border-b border-[#F3F4F6] flex justify-between items-center">
                    <span>Primary item removed from basket</span>
                    <button
                      onClick={handleAddPrimary}
                      className="text-[10px] font-bold text-[#079669] hover:underline"
                    >
                      + ADD BACK
                    </button>
                  </div>
                )}

                {/* Cross Sell Rows */}
                {addedCrossSells.map((cs: any) => {
                  const qty = basketQuantities[cs.offer.offerId] || 1;
                  return (
                    <div key={cs.offer.offerId} className="flex justify-between items-center gap-4 text-xs pb-3 border-b border-[#F3F4F6]">
                      <div className="flex-1">
                        <div className="font-semibold text-[#172033]">{cs.offer.productName}</div>
                        <div className="text-[10px] text-[#667085] mt-0.5">
                          {cs.offer.source} • Unit Price: {formatBasketItemUnitPrice(cs.offer)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 border border-[#D1D5DB] rounded bg-white">
                          <button
                            onClick={() => updateQuantity(cs.offer.offerId, -1)}
                            className="px-2 py-0.5 text-xs hover:bg-[#F3F4F6] font-bold text-[#172033]"
                          >
                            -
                          </button>
                          <span className="px-1 text-xs text-[#172033] font-semibold">{qty}</span>
                          <button
                            onClick={() => updateQuantity(cs.offer.offerId, 1)}
                            className="px-2 py-0.5 text-xs hover:bg-[#F3F4F6] font-bold text-[#172033]"
                          >
                            +
                          </button>
                        </div>
                        <span className="font-bold text-[#172033] w-16 text-right">
                          {formatBasketItemPrice(cs.offer, qty)}
                        </span>
                        <button
                          onClick={() => handleRemoveCrossSell(cs.offer.offerId)}
                          className="text-red-500 hover:text-red-700 font-bold ml-2 text-[10px]"
                        >
                          REMOVE
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 pt-3 flex justify-between items-center text-xs font-bold text-[#172033] border-t border-[#F3F4F6]">
                <span>Basket Subtotal:</span>
                <span className="text-base text-[#172033]">
                  {winner.source.toLowerCase() === 'ebay'
                    ? formatBasketItemPrice(winner, primaryQty)
                    : formatPrice(basketSubtotalPaise)
                  }
                </span>
              </div>
            </div>
          )}

          {/* POLICY ENGINE VERIFICATION AREA */}
          {evaluation ? (
            <div className="mt-5 border-t border-[#F3F4F6] pt-4 flex flex-col gap-3">
              {evaluation.allowed ? (
                <div className="flex flex-col gap-3">
                  <span className="text-[10px] text-[#079669] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#079669]" />
                    <span>PURCHASE PROTECTED</span>
                  </span>
                  
                  <div className="flex flex-col gap-1.5 pl-1">
                    {evaluation.checks.map((chk: any) => (
                      <div key={chk.name} className="flex items-center gap-2 text-xs">
                        {chk.state === "NOT_REQUESTED" ? (
                          <Minus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-[#079669] shrink-0" />
                        )}
                        <span className={chk.state === "NOT_REQUESTED" ? "text-[#667085] italic" : "text-[#667085]"}>{chk.message}</span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white border border-[#F3F4F6] rounded-lg p-3.5 flex flex-col gap-2 text-xs mt-1">
                    <div className="flex justify-between">
                      <span className="text-[#667085]">Purchase total:</span>
                      <span className="text-[#172033] font-semibold">
                        {winner.source.toLowerCase() === 'ebay' && winner.displayCurrency === 'INR' && winner.displayPricePaise
                          ? `${formatPrice(Math.round(evaluationTotalPaise * (winner.displayPricePaise / winner.pricePaise)))} approx. ($${(evaluationTotalPaise / 100).toFixed(2)} USD)`
                          : formatPrice(evaluationTotalPaise)
                        }
                      </span>
                    </div>
                    {evaluation.userRequestedBudget !== undefined && evaluation.userRequestedBudget !== null && (
                      <div className="flex justify-between">
                        <span className="text-[#667085]">Your requested limit:</span>
                        <span className="text-[#172033] font-semibold">{formatPrice(evaluation.userRequestedBudget)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-[#667085]">Account safety limit:</span>
                      <span className="text-[#172033] font-semibold">{formatPrice(evaluation.accountPolicyMaximum)}</span>
                    </div>
                    <div className="flex justify-between border-t border-[#F3F4F6] pt-1.5 font-bold">
                      <span className="text-[#667085]">Effective limit:</span>
                      <span className="text-emerald-400">{formatPrice(evaluation.effectiveLimit)}</span>
                    </div>
                    <div className="text-[10px] text-[#079669] font-bold mt-1 text-center">
                      ✓ Amount is within effective limit
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-red-950/15 border border-red-900/35 rounded-xl p-4 flex flex-col gap-3">
                  <span className="text-xs text-[#D64545] font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-[#D64545]" />
                    <span>🔒 PURCHASE PROTECTED — ACTION BLOCKED</span>
                  </span>

                  <div className="flex flex-col gap-1.5 text-left">
                    {evaluation.checks.filter((chk: any) => !chk.passed).map((chk: any) => (
                      <div key={chk.name} className="flex items-start gap-1.5 text-xs">
                        <span className="text-[#D64545] font-bold select-none">✗</span>
                        <span className="text-[#D64545] font-semibold">
                          {chk.message}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white border border-[#F3F4F6] rounded-lg p-3.5 flex flex-col gap-2 text-xs mt-1">
                    <div className="flex justify-between">
                      <span className="text-[#667085]">Basket total:</span>
                      <span className="text-[#D64545] font-semibold">
                        {winner.source.toLowerCase() === 'ebay' && winner.displayCurrency === 'INR' && winner.displayPricePaise
                          ? `${formatPrice(Math.round(evaluationTotalPaise * (winner.displayPricePaise / winner.pricePaise)))} approx. ($${(evaluationTotalPaise / 100).toFixed(2)} USD)`
                          : formatPrice(evaluationTotalPaise)
                        }
                      </span>
                    </div>
                    {evaluation.userRequestedBudget !== undefined && evaluation.userRequestedBudget !== null && (
                      <div className="flex justify-between">
                        <span className="text-[#667085]">Your requested budget:</span>
                        <span className="text-[#172033] font-semibold">{formatPrice(evaluation.userRequestedBudget)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-[#667085]">Account safety limit:</span>
                      <span className="text-[#172033] font-semibold">{formatPrice(evaluation.accountPolicyMaximum)}</span>
                    </div>
                    <div className="flex justify-between border-t border-[#F3F4F6] pt-1.5 font-bold">
                      <span className="text-[#667085]">Effective limit:</span>
                      <span className="text-[#D64545] font-semibold">
                        {formatPrice(evaluation.effectiveLimit)}
                      </span>
                    </div>
                    {(() => {
                      const conv = winner.source.toLowerCase() === 'ebay' && winner.displayCurrency === 'INR' && winner.displayPricePaise
                        ? (winner.displayPricePaise / winner.pricePaise)
                        : 1;
                      const totalINR = evaluationTotalPaise * conv;
                      if (evaluation.effectiveLimit && totalINR > evaluation.effectiveLimit) {
                        return (
                          <>
                            <div className="text-[10px] text-[#D64545] font-bold mt-1 text-center">
                              ✕ Exceeds effective limit
                            </div>
                            <div className="text-xs text-[#D64545] italic font-semibold mt-1 border-t border-red-900/10 pt-2 text-center">
                              Exceeds budget limit by {formatPrice(Math.round(totalINR - evaluation.effectiveLimit))}.
                            </div>
                          </>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 border-t border-[#F3F4F6] pt-3 text-xs text-[#667085] flex items-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-[#E5E7EB] border-t-[#172033] rounded-full animate-spin" />
              <span>Verifying purchase policies server-side...</span>
            </div>
          )}

          {/* DYNAMIC CONFIRMATION AND PAYMENT FLOW UI */}
          {winner.source.toLowerCase() !== "ebay" && evaluation && evaluation.allowed && approval && (
            <div className="mt-4 border-t border-[#F3F4F6] pt-4 flex flex-col gap-3">
              {checkoutVerify ? (
                checkoutVerify.verified ? (
                  <div className="bg-[#052e16]/20 border border-emerald-805 p-4 rounded-lg flex flex-col gap-2 text-xs">
                    <span className="text-emerald-400 font-bold flex items-center gap-1.5 uppercase text-[10px]">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>✓ PAYMENT VERIFIED</span>
                    </span>
                    <div className="text-[#172033] flex flex-col gap-0.5">
                      <span>Order: {checkoutVerify.orderId}</span>
                      <span>Payment: {checkoutVerify.paymentId}</span>
                      <span className="text-emerald-400 font-semibold mt-1">Status: Verified</span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#FFFDF9] border border-red-900/60 p-4 rounded-lg flex flex-col gap-2 text-xs">
                    <span className="text-[#D64545] font-bold flex items-center gap-1.5 uppercase text-[10px]">
                      <ShieldAlert className="w-4 h-4 text-[#D64545]" />
                      <span>⚠ {checkoutVerify.error || "PAYMENT SETUP FAILED"}</span>
                    </span>
                    <p className="text-[#667085]">Checkout failed. Please recheck listing rules.</p>
                    <button
                      onClick={() => handleResetApprovalFlow(winner.offerId)}
                      className="mt-2 bg-[#F7F5F0] hover:bg-zinc-850 text-[#172033] border border-[#E5E7EB] py-1.5 rounded text-[11px] font-bold text-center"
                    >
                      FIND ANOTHER OPTION
                    </button>
                  </div>
                )
              ) : confirm ? (
                confirm.status === "APPROVED" ? (
                  confirm.priceDecreased ? (
                    <div className="bg-[#079669]/5 border border-emerald-900/50 rounded-lg p-3 flex flex-col gap-1.5">
                      <span className="text-xs text-emerald-400 font-bold flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>✓ PRICE IMPROVED</span>
                      </span>
                      <div className="text-xs text-[#172033] flex justify-between">
                        <span>Original Approved: {formatPrice(confirm.approvedAmountPaise || 0)}</span>
                        <span>Current Price: {formatPrice(confirm.currentAmountPaise || 0)}</span>
                      </div>
                      <span className="text-xs text-emerald-400 font-semibold block mt-0.5">
                        You save: {formatPrice((confirm.approvedAmountPaise || 0) - (confirm.currentAmountPaise || 0))}!
                      </span>
                    </div>
                  ) : (
                    <div className="bg-[#079669]/5 border border-emerald-900/35 rounded-lg p-3 flex flex-col gap-1">
                      <span className="text-xs text-emerald-400 font-bold flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4" />
                        <span>✓ PURCHASE APPROVED</span>
                      </span>
                      <span className="text-xs text-[#172033]">{formatPrice(confirm.currentAmountPaise || 0)} verified just now</span>
                    </div>
                  )
                ) : confirm.status === "INVALIDATED" ? (
                  <div className="bg-[#D64545]/10 border border-[#D64545]/30 rounded-lg p-3.5 flex flex-col gap-2">
                    <span className="text-xs text-[#D64545] font-bold flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-[#D64545]" />
                      <span>🔒 PURCHASE INVALIDATED</span>
                    </span>
                    <p className="text-xs text-[#172033]">The price changed after preparation authorization.</p>
                    
                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-white/50 p-2 rounded border border-[#F3F4F6] mt-1">
                      <div>
                        <span className="text-[#667085] block uppercase text-[8px]">Approved Amount</span>
                        <span className="text-[#172033] font-medium">{formatPrice(confirm.approvedAmountPaise || 0)}</span>
                      </div>
                      <div>
                        <span className="text-[#667085] block uppercase text-[8px]">Staged Price</span>
                        <span className="text-[#D64545] font-semibold">{formatPrice(confirm.currentAmountPaise || 0)}</span>
                      </div>
                      <div className="col-span-2 border-t border-[#F3F4F6] pt-1 flex justify-between">
                        <span className="text-[#667085]">Difference:</span>
                        <span className="text-[#D64545] font-bold">
                          +{formatPrice((confirm.currentAmountPaise || 0) - (confirm.approvedAmountPaise || 0))}
                        </span>
                      </div>
                    </div>
                    <p className="text-[10px] text-[#667085] italic mt-1 leading-normal">
                      Reason: Current purchase no longer satisfies your authorized spending policy.
                    </p>
                  </div>
                ) : (
                  <div className="bg-white border border-[#F3F4F6] rounded-lg p-3 text-xs text-[#D64545]">
                    ✕ {confirm.reasons?.[0] || "Authorization verification failed."}
                  </div>
                )
              ) : (
                <div className="bg-white border border-[#F3F4F6] rounded-lg p-3 flex flex-col gap-2 text-xs">
                  <span className="text-[#172033] font-bold uppercase tracking-wider text-[10px] flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-[#667085]" />
                    <span>✓ PURCHASE READY</span>
                  </span>
                  <div className="flex justify-between text-[#667085]">
                    <span>Approved Total:</span>
                    <span className="text-[#172033] font-bold">{formatPrice(approval.approvedAmountPaise)}</span>
                  </div>
                  <div className="flex justify-between text-[#667085]">
                    <span>Limit Allowance:</span>
                    <span>{formatPrice(evaluation.effectiveLimit)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-[#667085] border-t border-[#F3F4F6] pt-1.5">
                    <span>Safety Token binds 15 min</span>
                    <span>Expires: {new Date(approval.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reasons */}
          <div className="mt-4 border-t border-[#F3F4F6] pt-4 flex flex-col gap-1.5">
            <span className="text-[9px] text-[#667085] font-bold uppercase tracking-wider">
              Why I Recommend This
            </span>
            <div className="flex flex-col gap-1.5">
              {winner.scoreBreakdown.reasons.slice(0, 3).map((reason: string, idx: number) => (
                <div key={idx} className="flex items-start gap-1.5 text-xs text-[#172033]">
                  <Check className="w-3.5 h-3.5 text-[#079669] shrink-0 mt-0.5" />
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tradeoff */}
          {tradeoffText && (
            <div className="mt-3.5 border-t border-[#F3F4F6] pt-3 flex flex-col gap-1">
              <span className="text-[9px] text-[#667085] font-bold uppercase tracking-wider">
                Tradeoff
              </span>
              <p className="text-xs text-[#667085] font-normal">
                {tradeoffText}
              </p>
            </div>
          )}

          {/* Why this is best fit */}
          <div className="mt-3.5 border-t border-[#F3F4F6] pt-3 flex flex-col gap-1">
            <span className="text-[9px] text-[#667085] font-bold uppercase tracking-wider">
              Why this is the best fit
            </span>
            <p className="text-xs text-[#667085] italic">
              "{getObjectiveExplanation()}"
            </p>
          </div>

          {/* COLLAPSIBLE PURCHASE TIMELINE (AUDIT TRAIL) */}
          {(currentCorrelationId || (approval && approval.id)) && (
            <div className="mt-4 border-t border-[#F3F4F6] pt-4 flex flex-col gap-2">
              <button
                onClick={() => setIsTimelineExpanded(!isTimelineExpanded)}
                className="flex items-center justify-between text-[10px] text-[#667085] hover:text-[#172033] font-bold uppercase tracking-wider transition-all"
              >
                <div className="flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-[#667085]" />
                  <span>Purchase Activity Timeline</span>
                </div>
                {isTimelineExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {isTimelineExpanded && (
                <div className="mt-2 flex flex-col gap-3 pl-1.5 border-l border-[#E5E7EB] py-1 max-h-[220px] overflow-y-auto select-none">
                  {timelineEvents.length > 0 ? (
                    timelineEvents.map((ev) => renderTimelineItem(ev))
                  ) : (
                    <span className="text-[10px] text-zinc-600">Initializing transaction trace logs...</span>
                  )}
                  {timelineEvents.length > 0 && (
                    <button
                      onClick={() => setIsFullAuditModalOpen(true)}
                      className="text-left text-[10px] text-[#667085] hover:text-[#172033] font-semibold underline underline-offset-2 mt-1 select-none"
                    >
                      [ View full audit trail ]
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Growth Agent Cross-Sells */}
          {message.crossSells && message.crossSells.length > 0 && !evaluation && (
            <div className="mt-4 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl p-4 flex flex-col gap-3">
              <span className="text-[9px] text-[#079669] font-bold uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-[#079669]" />
                <span>Frequently Bought Together</span>
              </span>
              
              {message.crossSells.map((cs: any) => {
                const added = basketAdditions[winner.offerId]?.some(x => x.offer.offerId === cs.offer.offerId) || false;
                return (
                  <div key={cs.offer.offerId} className="flex flex-col gap-2 p-3 bg-white border border-[#E5E7EB] rounded-lg shadow-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[10px] text-[#667085] uppercase">{cs.offer.brand}</span>
                        <h5 className="text-[#172033] font-semibold text-xs leading-tight">{cs.offer.productName}</h5>
                        <p className="text-[#667085] text-[10px] mt-0.5">{cs.reasons[0]}</p>
                      </div>
                      <span className="text-[#172033] font-bold text-xs shrink-0 ml-3">
                        {formatPrice(cs.offer.pricePaise + cs.offer.shippingCostPaise)}
                      </span>
                    </div>
                    <button 
                      onClick={() => {
                        setBasketAdditions(prev => {
                          const curr = prev[winner.offerId] || [];
                          if (added) {
                            const updated = curr.filter(x => x.offer.offerId !== cs.offer.offerId);
                            fetchPolicyForOffer(winner.offerId, updated, basketQuantities, isPrimaryAdded);
                            return { ...prev, [winner.offerId]: updated };
                          } else {
                            const updated = [...curr, cs];
                            fetch("/api/merchant/events", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                eventType: "CROSS_SELL_ADDED",
                                sessionId: currentCorrelationId || undefined,
                                source: cs.offer.source,
                                offerId: cs.offer.offerId,
                                productId: cs.offer.canonicalProductId,
                                merchantId: cs.offer.merchantId,
                                amount: cs.offer.pricePaise + cs.offer.shippingCostPaise
                              })
                            }).catch(err => console.error("Failed to log event:", err));
                            fetchPolicyForOffer(winner.offerId, updated, basketQuantities, isPrimaryAdded);
                            return { ...prev, [winner.offerId]: updated };
                          }
                        });
                      }}
                      className={`w-full py-1.5 rounded text-[10px] font-bold transition-all border ${added ? 'bg-[#079669] border-[#079669] text-white' : 'bg-white border-[#D1D5DB] text-[#172033] hover:bg-[#F9FAFB]'}`}
                    >
                      {added ? '✓ ADDED' : '+ ADD'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Actions Section */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {!isPrimaryAdded ? (
              <button
                onClick={handleAddPrimary}
                className="w-full flex items-center justify-center gap-1.5 bg-[#172033] hover:bg-[#172033]/90 text-[#FFFDF9] px-5 py-2.5 rounded-lg text-xs font-bold transition-all shadow"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>ADD TO BASKET</span>
              </button>
            ) : winner.source.toLowerCase() === "ebay" ? (
              !evaluation ? (
                <div className="w-full text-center text-xs text-[#667085]">
                  Verifying policy limit for eBay basket...
                </div>
              ) : evaluation.allowed ? (
                <a
                  href={winner.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    fetch("/api/merchant/events", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        eventType: "EBAY_CLICKED",
                        sessionId: currentCorrelationId || undefined,
                        source: "EBAY",
                        offerId: winner.offerId,
                        productId: winner.canonicalProductId,
                        merchantId: winner.merchantId,
                        amount: winner.pricePaise + winner.shippingCostPaise
                      })
                    }).catch(err => console.error("Failed to log eBay click event:", err));
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-[#FFFDF9] px-5 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow text-center"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>VIEW ON EBAY</span>
                </a>
              ) : (
                <div className="w-full flex flex-col gap-2">
                  <div className="bg-[#D64545]/10 border border-[#D64545]/30 rounded-lg p-3 text-center text-xs text-[#D64545] font-semibold flex items-center justify-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-[#D64545]" />
                    <span>Purchase request violates active policy spending rules.</span>
                  </div>
                </div>
              )
            ) : (
              !evaluation ? (
                <div className="w-full text-center text-xs text-[#667085]">
                  Verifying policy limit...
                </div>
              ) : evaluation.allowed ? (
                checkoutVerify && checkoutVerify.verified ? (
                  <div className="bg-[#052e16]/20 border border-emerald-955 text-emerald-400 px-4 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 w-full select-none">
                    <ShieldCheck className="w-4 h-4" />
                    <span>PAYMENT SUCCESSFUL</span>
                  </div>
                ) : checkoutLoader ? (
                  <div className="bg-[#F7F5F0] border border-[#E5E7EB] text-[#667085] px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2.5 w-full select-none">
                    <div className="w-3.5 h-3.5 border-2 border-[#E5E7EB] border-t-[#172033] rounded-full animate-spin" />
                    <span>{checkoutLoader}</span>
                  </div>
                ) : confirm ? (
                  confirm.status === "APPROVED" ? (
                    <div className="w-full flex flex-col gap-1.5">
                      <button
                        onClick={() => handleRazorpayCheckout(winner.offerId)}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-[#172033] px-5 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow"
                      >
                        <CreditCard className="w-4 h-4 text-[#FFFDF9]" />
                        <span>PAY WITH RAZORPAY (TEST MODE)</span>
                      </button>
                      <span className="text-[9px] text-[#667085] text-center uppercase tracking-wide font-semibold block animate-pulse">
                        RAZORPAY TEST MODE
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleResetApprovalFlow(winner.offerId)}
                      className="w-full bg-[#172033] hover:bg-[#172033]/90 text-[#FFFDF9] py-2.5 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>FIND ANOTHER OPTION</span>
                    </button>
                  )
                ) : approval ? (
                  <button
                    onClick={() => handleConfirmPurchase(winner.offerId)}
                    disabled={isConfirming}
                    className="w-full flex items-center justify-center gap-1.5 bg-[#172033] hover:bg-[#172033]/90 text-[#FFFDF9] px-5 py-2.5 rounded-lg text-xs font-bold transition-all shadow"
                  >
                    {isConfirming ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-[#F3F4F6] border-t-[#FFFDF9] rounded-full animate-spin" />
                        <span>Verifying Price Safety...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>CONFIRM PURCHASE</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="w-full text-center text-xs text-[#667085]">
                    Authorization loading...
                  </div>
                )
              ) : (
                <div className="w-full flex flex-col gap-2">
                  <div className="bg-[#D64545]/10 border border-[#D64545]/30 rounded-lg p-3 text-center text-xs text-[#D64545] font-semibold flex items-center justify-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-[#D64545]" />
                    <span>Purchase request violates active policy spending rules.</span>
                  </div>
                  <button
                    onClick={() => handleResetApprovalFlow(winner.offerId)}
                    className="w-full bg-[#172033] hover:bg-[#172033]/90 text-[#FFFDF9] px-5 py-2.5 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-1 shadow"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>RESET & START OVER</span>
                  </button>
                </div>
              )
            )}

            {!confirm && (
              <button
                onClick={() => setExpandedOfferId(expandedOfferId === winner.offerId ? null : winner.offerId)}
                className="flex items-center justify-center gap-1 bg-[#F7F5F0] hover:bg-zinc-850 text-[#172033] border border-[#E5E7EB] px-3 py-1.5 rounded-lg text-xs font-bold transition-all mt-1 w-full"
              >
                <HelpCircle className="w-3.5 h-3.5 text-[#667085]" />
                <span>{expandedOfferId === winner.offerId ? "Hide Analysis" : "Why this?"}</span>
              </button>
            )}
          </div>

          {/* Expanded Analysis */}
          {expandedOfferId === winner.offerId && (
            <div className="bg-[#070708] border border-[#F3F4F6] rounded-lg p-3.5 mt-3 text-[11px] leading-relaxed text-[#667085] select-none animate-fadeIn">
              <h5 className="font-bold text-[#172033] mb-1 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-[#667085]" />
                <span>Scoring Calculation Analysis</span>
              </h5>
              {explainScore(winner.scoreBreakdown)}
            </div>
          )}
        </div>

        {/* ALTERNATIVES ROW */}
        {sortedOffers.length > 1 && (
          <div className="flex flex-col gap-2.5 text-left">
            <span className="text-[#667085] text-[10px] font-bold uppercase tracking-wider">
              Other Good Options (Alternatives)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {sortedOffers.map((item) => {
                if (item.offerId === winner.offerId) return null;

                const isCheapest = item.offerId === cheapest?.offerId;
                const isFastest = item.offerId === fastest?.offerId;
                const isHighestRated = item.offerId === highestRated?.offerId;

                let label = "Alternative";
                let labelStyle = "bg-[#F7F5F0] border-zinc-855 text-[#667085]";
                
                if (isCheapest) {
                  label = "💰 Cheapest";
                  labelStyle = "bg-[#079669]/5 border-emerald-950 text-[#079669]";
                } else if (isFastest) {
                  label = "⚡ Fastest";
                  labelStyle = "bg-blue-950/20 border-blue-950 text-blue-500";
                } else if (isHighestRated) {
                  label = "⭐ Highest Rated";
                  labelStyle = "bg-purple-950/20 border-purple-950 text-purple-500";
                }

                return (
                  <div
                    key={item.offerId}
                    onClick={() => setActiveDetailOffer(item)}
                    className="bg-white border border-[#F3F4F6] hover:border-[#E5E7EB] rounded-xl p-4 flex flex-col justify-between hover:scale-[1.01] hover:bg-[#F7F5F0]/10 cursor-pointer transition-all duration-200"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`px-2 py-0.5 border rounded text-[9px] font-semibold uppercase tracking-wider ${labelStyle}`}>
                          {label}
                        </span>
                        <span className="text-[9px] text-[#667085] font-bold">
                          Score {item.scoreBreakdown.overallScore}
                        </span>
                      </div>
                      <h5 className="text-[#172033] font-semibold text-xs mt-3.5 line-clamp-1">{item.productName}</h5>
                      <p className="text-[9px] text-[#667085]">{item.brand} • {item.merchantName}</p>
                    </div>
                    <div className="border-t border-[#F3F4F6] mt-4 pt-3 flex items-center justify-between text-xs">
                      <span className="font-bold text-[#172033]">
                        {formatOfferPrice(item, item.pricePaise + item.shippingCostPaise)}
                      </span>
                      <span className="text-[#667085] text-[10px]">
                        {item.deliveryEstimate}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const alternativeTradeoffDetailText = useMemo(() => {
    if (!activeDetailOffer || !currentWinnerOffer) return "";
    
    const winnerCost = currentWinnerOffer.pricePaise + currentWinnerOffer.shippingCostPaise;
    const detailCost = activeDetailOffer.pricePaise + activeDetailOffer.shippingCostPaise;
    
    const diff = winnerCost - detailCost;
    if (diff > 0) {
      return `Saves ${formatOfferPrice(activeDetailOffer, diff)} compared with current recommendation, but has a different score/rating profile.`;
    } else if (diff < 0) {
      return `Costs ${formatOfferPrice(activeDetailOffer, Math.abs(diff))} more than current recommendation.`;
    }
    return "Matches the total checkout cost of the current recommendation.";
  }, [activeDetailOffer, currentWinnerOffer]);

  return (
    <AppShell>
      <div className="flex flex-col gap-6 py-4 flex-1">
        {/* Hero Section */}
        <div className="flex flex-col gap-3 border-b border-[#E6E0D6] pb-5 text-center sm:text-left">
          <div className="flex flex-col">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#172033] mb-1">
              Your AI buyer for the open commerce network.
            </h2>
            <p className="text-[#667085] text-sm sm:text-base font-medium max-w-2xl">
              Search authorized commerce sources, compare options, apply your purchasing rules, and take the safest available action.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FFFDF9] border border-[#E6E0D6] shadow-sm">
              <Check className="w-3.5 h-3.5 text-[#079669]" />
              <span className="text-[10px] font-bold text-[#172033] uppercase tracking-wide">Policy controlled</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FFFDF9] border border-[#E6E0D6] shadow-sm">
              <Check className="w-3.5 h-3.5 text-[#079669]" />
              <span className="text-[10px] font-bold text-[#172033] uppercase tracking-wide">Authorized sources</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FFFDF9] border border-[#E6E0D6] shadow-sm">
              <Check className="w-3.5 h-3.5 text-[#079669]" />
              <span className="text-[10px] font-bold text-[#172033] uppercase tracking-wide">Explainable decisions</span>
            </div>
          </div>
        </div>

        <SourceSelector selectedSource={source} onChange={setSource} providerStatuses={providerStatuses} />

        {/* Chat Conversational Messages Container */}
        <div className="flex-1 flex flex-col justify-between gap-4 bg-[#FFFDF9] border border-[#E6E0D6] rounded-[24px] shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-4 sm:p-6 mt-2">
          <div className="flex flex-col gap-5 overflow-y-auto max-h-[500px] px-1">
            {messages.map((msg) => {
              const isAssistant = msg.role === "assistant";
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 max-w-full ${isAssistant ? "justify-start" : "justify-end"}`}
                >
                  {isAssistant && (
                    <div className="w-8 h-8 rounded-full border border-[#E6E0D6] bg-[#FFFFFF] flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <Bot className="w-4 h-4 text-[#172033]" />
                    </div>
                  )}
                  
                  <div className={`flex flex-col ${isAssistant ? "max-w-[90%]" : "max-w-[75%]"}`}>
                    <div
                      className={`px-4 py-2.5 rounded-2xl border text-sm leading-relaxed ${
                        isAssistant
                          ? "bg-[#FFFDF9] border-[#E6E0D6] text-[#172033] rounded-tl-sm shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
                          : "bg-[#EFE9DE] border-[#E6E0D6] text-[#172033] rounded-tr-sm font-medium"
                      }`}
                    >
                      {msg.content}
                    </div>

                    {isAssistant && msg.type === "recommendations" && renderRecommendations(msg)}
                  </div>
                </div>
              );
            })}
            
            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-lg border border-[#E5E7EB] bg-[#F7F5F0] flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-[#667085]" />
                </div>
                <div className="px-4 py-2.5 rounded-xl border bg-white border-[#F3F4F6] rounded-tl-none flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce delay-100" />
                  <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce delay-200" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {messages.length > 1 && (
            <div className="flex justify-end pt-2 border-t border-[#F3F4F6]">
              <button
                onClick={handleClearHistory}
                className="flex items-center gap-1 text-[10px] text-[#667085] hover:text-[#172033] font-semibold uppercase tracking-wider transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear chat history</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <AIInput
            value={inputVal}
            onChange={setInputVal}
            onSubmit={handleSend}
            isLoading={loading}
            error={error}
          />
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-full">
              <span className="text-[10px] text-zinc-600 font-semibold uppercase tracking-wider mr-1">Objective</span>
              {[
                { id: "best_value" as const, label: "Best match" },
                { id: "cheapest" as const, label: "Cheapest" },
                { id: "fastest" as const, label: "Fastest" },
                { id: "highest_quality" as const, label: "Quality" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setObjective(tab.id);
                    setSelectedWinnerOfferId(null);
                  }}
                  className={`px-2.5 py-0.5 rounded text-[10px] font-semibold border transition-all ${
                    objective === tab.id
                      ? "bg-[#F7F5F0] border-[#E5E7EB] text-[#172033]"
                      : "bg-white border-[#F3F4F6] text-[#667085] hover:text-[#172033]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 text-zinc-600 text-[10px] font-semibold uppercase tracking-wider self-end sm:self-auto select-none">
              <Bot className="w-3.5 h-3.5" />
              <span>Bazaar AI Scanners Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* 1. PRODUCT DETAIL DRAWER / MODAL */}
      {activeDetailOffer && (
        <div className="fixed inset-0 z-50 bg-[#F7F5F0]/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#FFFDF9] border border-[#E5E7EB] rounded-xl max-w-lg w-full p-6 flex flex-col gap-5 relative text-left shadow-2xl animate-scaleUp">
            <button onClick={() => setActiveDetailOffer(null)} className="absolute top-4 right-4 text-[#667085] hover:text-[#172033]">
              <X className="w-5 h-5" />
            </button>
            <div>
              <span className="text-[10px] text-yellow-500 font-bold uppercase tracking-wider font-semibold">Product Details</span>
              <h3 className="text-[#172033] font-bold text-lg mt-1 leading-snug">{activeDetailOffer.productName}</h3>
              <p className="text-[#667085] text-xs mt-0.5">Brand: {activeDetailOffer.brand} • Category: {activeDetailOffer.category}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs border-y border-[#F3F4F6] py-3.5">
              <div className="flex flex-col gap-1"><span className="text-[#667085] text-[9px] uppercase tracking-wide">Merchant</span><span className="text-[#172033] font-semibold">{activeDetailOffer.merchantName}</span></div>
              <div className="flex flex-col gap-1"><span className="text-[#667085] text-[9px] uppercase tracking-wide">Source Status</span><span className="text-[#172033] font-semibold">{activeDetailOffer.source.toLowerCase() === 'ebay' ? 'eBay (Live marketplace)' : 'Bazaar Products'}</span></div>
              <div className="flex flex-col gap-1"><span className="text-[#667085] text-[9px] uppercase tracking-wide">Delivery Speed</span><span className="text-[#172033] font-semibold">{activeDetailOffer.deliveryEstimate}</span></div>
              <div className="flex flex-col gap-1"><span className="text-[#667085] text-[9px] uppercase tracking-wide">Customer Rating</span><span className="text-[#172033] font-semibold">{activeDetailOffer.sellerRating}★</span></div>
            </div>
            <div className="flex justify-between items-center bg-white border border-[#F3F4F6] rounded-lg p-3 text-xs">
              <div className="flex flex-col"><span className="text-[#667085] text-[9px] uppercase">Breakdown</span><span className="text-[#667085] mt-1">Item: {formatOfferPrice(activeDetailOffer, activeDetailOffer.pricePaise)}</span><span className="text-[#667085]">Shipping: {formatOfferPrice(activeDetailOffer, activeDetailOffer.shippingCostPaise)}</span></div>
              <div className="text-right"><span className="text-[#667085] text-[9px] uppercase block">Total Cost</span><span className="text-[#172033] font-bold text-base block mt-0.5">{formatOfferPrice(activeDetailOffer, activeDetailOffer.pricePaise + activeDetailOffer.shippingCostPaise)}</span></div>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs"><span className="text-[#667085] font-semibold">Bazaar Buyer Score:</span><span className="text-[#172033] font-bold">{activeDetailOffer.scoreBreakdown.overallScore}/100</span></div>
              <p className="text-[11px] text-[#667085] leading-relaxed italic">"{explainScore(activeDetailOffer.scoreBreakdown)}"</p>
            </div>
            <div className="flex flex-col gap-1"><span className="text-[#667085] text-[9px] uppercase tracking-wide font-bold">Tradeoff Versus Recommendation</span><p className="text-xs text-[#667085] italic">{alternativeTradeoffDetailText}</p></div>
            <div className="flex gap-3 mt-2">
              <button onClick={() => { setSelectedWinnerOfferId(activeDetailOffer.offerId); setActiveDetailOffer(null); }} className="flex-1 bg-[#172033] hover:bg-[#172033]/90 text-[#FFFDF9] py-2 rounded-lg text-xs font-bold transition-all shadow">SELECT THIS</button>
              <button onClick={() => setActiveDetailOffer(null)} className="flex-1 bg-[#F7F5F0] hover:bg-[#E6E0D6] text-[#667085] border border-[#E5E7EB] py-2 rounded-lg text-xs font-bold transition-all">CLOSE</button>
            </div>
          </div>
        </div>
      )}

      {/* 2. SOURCE DETAIL DRAWER / MODAL */}
      {activeSourceDetail && (
        <div className="fixed inset-0 z-50 bg-[#F7F5F0]/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#FFFDF9] border border-[#E5E7EB] rounded-xl max-w-sm w-full p-5 flex flex-col gap-4 relative text-left shadow-2xl animate-scaleUp">
            <button onClick={() => setActiveSourceDetail(null)} className="absolute top-4 right-4 text-[#667085] hover:text-[#172033]">
              <X className="w-5 h-5" />
            </button>
            <div>
              <span className="text-[10px] text-[#667085] font-bold uppercase tracking-wider">Source Details</span>
              <h3 className="text-[#172033] font-bold text-base mt-0.5">{activeSourceDetail.name} — {activeSourceDetail.name.toLowerCase() === 'ebay' ? 'Live marketplace' : 'Demo Catalog'}</h3>
            </div>
            <div className="flex flex-col gap-3 text-xs bg-white border border-[#F3F4F6] rounded-lg p-3.5">
              <div className="flex justify-between"><span className="text-[#667085]">Merchant:</span><span className="text-[#172033] font-semibold">{activeSourceDetail.merchant}</span></div>
              <div className="flex justify-between"><span className="text-[#667085]">Price:</span><span className="text-[#172033] font-semibold">{formatPrice(activeSourceDetail.price)}</span></div>
              <div className="flex justify-between"><span className="text-[#667085]">Delivery:</span><span className="text-[#172033] font-semibold">{activeSourceDetail.delivery}</span></div>
              <div className="flex justify-between border-t border-[#F3F4F6] pt-2 text-[#667085]"><span>Catalog Status:</span><span className={activeSourceDetail.name.toLowerCase() === 'ebay' ? 'text-emerald-500 font-bold' : 'text-yellow-500 font-bold'}>{activeSourceDetail.name.toLowerCase() === 'ebay' ? 'Live eBay Production API' : 'Synthetic Demo Catalog'}</span></div>
            </div>
            <div className="text-[11px] text-[#667085] text-center leading-relaxed">
              {activeSourceDetail.name.toLowerCase() === 'ebay' ? '* Note: This data is sourced live from the eBay Production Browse API.' : '* Note: This is simulated synthetic demo catalog data. No live external marketplace API is connected in this sandbox stage.'}
              {activeSourceDetail.name.toLowerCase() !== 'ebay' && <p className="font-semibold text-[#667085] mt-1.5">"Demo catalog — no external checkout"</p>}
            </div>
            <button onClick={() => setActiveSourceDetail(null)} className="w-full bg-[#F7F5F0] hover:bg-zinc-850 text-[#667085] border border-[#E5E7EB] py-2 rounded-lg text-xs font-bold transition-all">CLOSE</button>
          </div>
        </div>
      )}

      {/* 3. FULL AUDIT TIMELINE DETAIL MODAL */}
      {isFullAuditModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#F7F5F0]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#FFFDF9] border border-[#E5E7EB] rounded-xl max-w-xl w-full p-6 flex flex-col gap-4 relative text-left shadow-2xl max-h-[85vh] overflow-y-auto">
            <button onClick={() => setIsFullAuditModalOpen(false)} className="absolute top-4 right-4 text-[#667085] hover:text-[#172033]">
              <X className="w-5 h-5" />
            </button>
            <div>
              <span className="text-[10px] text-[#667085] font-bold uppercase tracking-wider">Audit logs</span>
              <h3 className="text-[#172033] font-bold text-lg mt-0.5">Bazaar Shopping Journey Trace Logs</h3>
              <p className="text-[#667085] text-[10px] mt-1 font-mono uppercase">Correlation Trace ID: {currentCorrelationId}</p>
            </div>

            <div className="flex flex-col gap-4 border-t border-[#F3F4F6] pt-4 max-h-[50vh] overflow-y-auto pr-1">
              {timelineEvents.map((event) => {
                const timeStr = new Date(event.timestamp).toLocaleString();
                return (
                  <div key={event.id} className="bg-white border border-[#F3F4F6] rounded-lg p-3 text-xs leading-relaxed">
                    <div className="flex justify-between items-center border-b border-[#F3F4F6] pb-1.5 mb-2">
                      <span className="text-[#172033] font-bold font-mono text-[10px] uppercase text-[#172033]">{event.eventType}</span>
                      <span className={`px-1.5 py-0.2 text-[9px] rounded font-bold uppercase tracking-wider ${
                        event.outcome === "SUCCESS" ? "bg-emerald-950/20 text-emerald-400 border border-emerald-950" : "bg-red-950/20 text-red-400 border border-red-950"
                      }`}>{event.outcome}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] text-[#667085]">
                      <div><span className="text-[#667085] block uppercase text-[8px]">Timestamp</span>{timeStr}</div>
                      {event.productId && <div><span className="text-[#667085] block uppercase text-[8px]">Product ID</span>{event.productId}</div>}
                      {event.merchantId && <div><span className="text-[#667085] block uppercase text-[8px]">Merchant ID</span>{event.merchantId}</div>}
                      {event.amount && <div><span className="text-[#667085] block uppercase text-[8px]">Amount</span>{formatPrice(event.amount)}</div>}
                      {event.differencePaise !== undefined && (
                        <div className="col-span-2 text-[#172033] font-medium">
                          Price Delta: {event.differencePaise > 0 ? "+" : ""}{formatPrice(event.differencePaise)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setIsFullAuditModalOpen(false)}
              className="w-full bg-[#F7F5F0] hover:bg-zinc-850 text-[#667085] border border-[#E5E7EB] py-2.5 rounded-lg text-xs font-bold transition-all mt-2"
            >
              CLOSE AUDIT TIMELINE
            </button>
          </div>
        </div>
      )}

    </AppShell>
  );
}
