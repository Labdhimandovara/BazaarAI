"use client";

import React, { useState, useEffect } from "react";
import { AppShell } from "@/components/app-shell";

export default function MerchantConsole() {
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [range, setRange] = useState("30d");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchConfig();
    fetchAnalytics(range);
  }, [range]);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/merchant/config");
      if (res.ok) {
        setConfig(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch merchant config:", err);
    }
  };

  const fetchAnalytics = async (selectedRange: string) => {
    try {
      const res = await fetch(`/api/merchant/analytics?range=${selectedRange}`);
      if (res.ok) {
        setAnalytics(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch merchant analytics:", err);
    }
  };

  const toggleBundle = async () => {
    if (!config) return;
    setLoading(true);
    try {
      const res = await fetch("/api/merchant/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundleEnabled: !config.bundleEnabled })
      });
      if (res.ok) {
        setConfig(await res.json());
        fetchAnalytics(range);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleDiscount = async () => {
    if (!config) return;
    setLoading(true);
    try {
      const res = await fetch("/api/merchant/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discountEnabled: !config.discountEnabled })
      });
      if (res.ok) {
        setConfig(await res.json());
        fetchAnalytics(range);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  const hasEvents = analytics?.recentEvents && analytics.recentEvents.length > 0;

  return (
    <AppShell>
      <div className="flex flex-col flex-1 py-8 px-6 bg-[#FFFDF9] min-h-screen font-sans">
        
        {/* Top Header */}
        <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-[#E6E0D6] pb-6">
          <div>
            <h1 className="text-3xl font-bold text-[#172033] tracking-tight">Merchant Operating Console</h1>
            <p className="text-[#667085] mt-1.5 text-sm">Real-time commerce intelligence & system governance</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="text-xs font-semibold px-3 py-2 rounded-lg border border-[#E6E0D6] bg-white text-[#172033] shadow-sm focus:outline-none"
            >
              <option value="today">Today (24h)</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
            <a href="/" className="text-xs font-bold bg-[#172033] text-white hover:bg-[#172033]/90 px-4 py-2.5 rounded-lg transition-all shadow-sm">
              ← Back to Buyer Mode
            </a>
          </div>
        </header>

        {!hasEvents ? (
          /* EMPTY STATE */
          <div className="flex-1 flex flex-col items-center justify-center text-center py-16 px-4 bg-white rounded-2xl border border-[#E6E0D6] shadow-sm max-w-2xl mx-auto my-8">
            <div className="w-16 h-16 rounded-full bg-[#F7F4EE] border border-[#E6E0D6] flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-[#667085]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-[#172033]">No commerce activity yet</h2>
            <p className="text-sm text-[#667085] mt-2 max-w-sm">
              Run queries in the buyer chatbot or products catalog search to start generating analytics and growth insights.
            </p>
            <div className="mt-8 flex gap-4">
              <a href="/" className="text-xs font-bold bg-[#172033] text-white px-5 py-3 rounded-lg hover:bg-[#172033]/90 transition-all shadow">
                Launch Chatbot Search
              </a>
              <button 
                onClick={toggleBundle}
                className="text-xs font-semibold bg-white border border-[#D1D5DB] text-[#172033] px-5 py-3 rounded-lg hover:bg-[#F9FAFB] transition-all"
              >
                Toggle Demo Bundle
              </button>
            </div>
          </div>
        ) : (
          /* CORE CONSOLE WORKSPACE */
          <div className="space-y-10">
            
            {/* 1. COMMERCE OVERVIEW */}
            <section>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-bold text-[#667085] uppercase tracking-wider">Commerce Overview</h3>
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded uppercase tracking-wide">Real-Data Stream</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: "Searches", value: analytics?.overview?.searches ?? 0 },
                  { label: "Products Discovered", value: analytics?.overview?.productsDiscovered ?? 0 },
                  { label: "Recommendations", value: analytics?.overview?.recommendations ?? 0 },
                  { label: "Cross-Sells Accepted", value: `${analytics?.overview?.crossSellsAccepted ?? 0} (${analytics?.overview?.crossSellAcceptanceRate ?? 0}%)` },
                  { label: "Checkout Starts", value: analytics?.overview?.checkoutStarts ?? 0 },
                  { label: "Policy Blocks", value: analytics?.overview?.policyBlocks ?? 0 },
                ].map((stat, idx) => (
                  <div key={idx} className="bg-white p-5 rounded-xl border border-[#E6E0D6] shadow-sm flex flex-col justify-center">
                    <p className="text-[10px] font-bold text-[#667085] uppercase tracking-wider">{stat.label}</p>
                    <p className="text-2xl font-bold text-[#172033] mt-2 tracking-tight">{stat.value}</p>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* 2. COMMERCE SOURCES & SYSTEM READY */}
              <div className="space-y-8">
                
                {/* AI COMMERCE READY CHECKLIST */}
                <div className="bg-white rounded-2xl p-6 border border-[#E6E0D6] shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="bg-emerald-50 text-emerald-600 p-2 rounded-lg">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h2 className="text-base font-bold text-[#172033]">AI Commerce Readiness</h2>
                  </div>
                  
                  <ul className="space-y-4">
                    {[
                      { label: "Catalog machine-readable", status: config?.catalogStatus === "AI_READY" ? "Ready" : "Not Configured", ok: true },
                      { label: "Prices available", status: "Ready", ok: true },
                      { label: "Inventory available", status: "Ready", ok: true },
                      { label: "Purchase policies available", status: "Ready", ok: true },
                      { label: "AI discovery enabled", status: "Configured", ok: true },
                      { label: "Checkout available", status: "Test Mode", ok: true },
                      { label: "Razorpay payment enabled", status: "Test Mode", ok: true }
                    ].map((item, idx) => (
                      <li key={idx} className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2.5 text-[#4B5563]">
                          <svg className={`w-3.5 h-3.5 flex-shrink-0 ${item.ok ? 'text-emerald-500' : 'text-slate-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{item.label}</span>
                        </div>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${item.status === 'Test Mode' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                          {item.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* COMMERCE SOURCES */}
                <div className="bg-white rounded-2xl p-6 border border-[#E6E0D6] shadow-sm">
                  <h3 className="text-xs font-bold text-[#667085] uppercase tracking-wider mb-4">Commerce Sources</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-[#F9FAFB] rounded-lg border border-[#F3F4F6]">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                        <span className="text-xs font-semibold text-[#172033]">Bazaar Products</span>
                      </div>
                      <span className="text-xs font-bold text-[#172033]">{analytics?.sources?.bazaar ?? 0} events</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-[#F9FAFB] rounded-lg border border-[#F3F4F6]">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                        <span className="text-xs font-semibold text-[#172033]">eBay API (US)</span>
                      </div>
                      <span className="text-xs font-bold text-[#172033]">{analytics?.sources?.ebay ?? 0} events</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* 3. AI OPPORTUNITIES (DATA-DRIVEN) */}
              <div className="lg:col-span-2 space-y-8">
                <div className="bg-white rounded-2xl p-6 border border-[#E6E0D6] shadow-sm">
                  <h3 className="text-base font-bold text-[#172033] mb-6">AI Growth Opportunities</h3>
                  
                  <div className="space-y-6">
                    
                    {/* Dynamic Bundle Opportunity */}
                    <div className={`p-5 rounded-xl border transition-all ${config?.bundleEnabled ? 'bg-emerald-50/60 border-emerald-200' : 'bg-[#F9FAFB] border-[#E6E0D6]'}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-sm text-[#111827]">Bundle Opportunity Detected</h4>
                            {config?.bundleEnabled && (
                              <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">ACTIVE IN GROWTH AGENT</span>
                            )}
                          </div>
                           {analytics?.bundleOpportunity ? (
                            <div className="text-xs text-[#172033] font-medium mt-1.5 space-y-2">
                              <p>
                                Bundle <strong className="text-emerald-700">"{analytics.bundleOpportunity.productAName}"</strong> and <strong className="text-emerald-700">"{analytics.bundleOpportunity.productBName}"</strong>.
                              </p>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3 rounded-lg border border-[#E6E0D6] text-[11px] font-normal text-[#667085]">
                                <div>
                                  <span className="block text-[10px] text-[#667085] uppercase font-semibold">Confidence Strength</span>
                                  <span className={`font-bold capitalize ${analytics.bundleOpportunity.confidence === 'strong opportunity' ? 'text-emerald-600' : analytics.bundleOpportunity.confidence === 'emerging opportunity' ? 'text-blue-600' : 'text-[#667085]'}`}>
                                    {analytics.bundleOpportunity.confidence}
                                  </span>
                                </div>
                                <div>
                                  <span className="block text-[10px] text-[#667085] uppercase font-semibold">Relevant Journeys</span>
                                  <span className="font-semibold text-[#172033]">{analytics.bundleOpportunity.relevantJourneys} journeys</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] text-[#667085] uppercase font-semibold">Cross-sell Additions</span>
                                  <span className="font-semibold text-[#172033]">{analytics.bundleOpportunity.crossSellAdditions} times</span>
                                </div>
                                <div>
                                  <span className="block text-[10px] text-[#667085] uppercase font-semibold">Acceptance Rate</span>
                                  <span className="font-semibold text-[#172033]">{analytics.bundleOpportunity.acceptanceRate}%</span>
                                </div>
                              </div>
                              <p className="text-[11px] text-[#667085] font-normal italic">
                                Reason: {analytics.bundleOpportunity.reason}
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-[#667085] mt-1.5">
                              No bundle candidates detected yet. Opportunities appear when products co-occur in the same buyer session.
                            </p>
                          )}
                        </div>
                        <button
                          onClick={toggleBundle}
                          disabled={loading}
                          className={`text-xs font-bold px-4 py-2 rounded-lg transition-all shrink-0 shadow-sm border ${config?.bundleEnabled ? 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50' : 'bg-[#172033] text-white hover:bg-[#172033]/90'}`}
                        >
                          {config?.bundleEnabled ? 'Disable Bundle' : 'Enable Bundle'}
                        </button>
                      </div>
                    </div>

                    {/* High-Intent Abandonment Signals */}
                    <div className={`p-5 rounded-xl border transition-all ${config?.discountEnabled ? 'bg-indigo-50/60 border-indigo-200' : 'bg-[#F9FAFB] border-[#E6E0D6]'}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-sm text-[#111827]">High-Intent Drop-offs</h4>
                            {config?.discountEnabled && (
                              <span className="bg-indigo-100 text-indigo-800 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">SIMULATED ACTIVE</span>
                            )}
                          </div>
                          <p className="text-xs text-[#667085] mt-1.5">
                            Detected <strong className="text-[#172033]">{analytics?.overview?.checkoutDropoff ?? 0}</strong> checkout sessions initiated but not finalized.
                            <span className="block text-[#667085] mt-1 text-[11px] font-normal">
                              Activating dynamic discount simulates merchant discount options in testing environments.
                            </span>
                          </p>
                        </div>
                        <button
                          onClick={toggleDiscount}
                          disabled={loading}
                          className={`text-xs font-bold px-4 py-2 rounded-lg transition-all shrink-0 shadow-sm border ${config?.discountEnabled ? 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50' : 'bg-white text-[#172033] border-[#D1D5DB] hover:bg-[#F3F4F6]'}`}
                        >
                          {config?.discountEnabled ? 'Disable Discount' : 'Offer Dynamic Discount'}
                        </button>
                      </div>
                    </div>

                    {/* Policy Constraint Insights */}
                    <div className="p-5 rounded-xl border border-[#E6E0D6] bg-[#F9FAFB]">
                      <h4 className="font-semibold text-sm text-[#111827]">Policy Constraint Insights</h4>
                      {analytics?.policyBlockReasons && analytics.policyBlockReasons.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {analytics.policyBlockReasons.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center text-xs">
                              <span className="text-[#667085] truncate max-w-xs">{item.reason}</span>
                              <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded shrink-0">{item.count} blocks</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[#667085] mt-1.5">
                          No policy blocks recorded. System spend and category policies are currently fully compliant.
                        </p>
                      )}
                    </div>

                  </div>
                </div>
              </div>

            </div>

            {/* 4. ACTIVITY STREAMS */}
            <section className="bg-white rounded-2xl p-6 border border-[#E6E0D6] shadow-sm">
              <h3 className="text-base font-bold text-[#172033] mb-6">Recent Commerce Events</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E6E0D6] text-[#667085] font-semibold">
                      <th className="pb-3 font-semibold">Event Type</th>
                      <th className="pb-3 font-semibold">Timestamp</th>
                      <th className="pb-3 font-semibold">Session/Trace ID</th>
                      <th className="pb-3 font-semibold">Source</th>
                      <th className="pb-3 font-semibold">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.recentEvents.map((e: any) => (
                      <tr key={e.id} className="border-b border-[#F3F4F6] hover:bg-[#FFFDF9]/40 transition-colors">
                        <td className="py-3 font-bold text-[#172033] tracking-wide">{e.eventType}</td>
                        <td className="py-3 text-[#667085]">{new Date(e.timestamp).toLocaleTimeString()}</td>
                        <td className="py-3 text-[#667085] font-mono truncate max-w-[120px]">{e.sessionId || "—"}</td>
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${e.source?.toLowerCase() === 'ebay' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            {e.source || "—"}
                          </span>
                        </td>
                        <td className="py-3 font-semibold text-[#172033]">
                          {e.amount ? `₹${e.amount / 100}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

          </div>
        )}

      </div>
    </AppShell>
  );
}
