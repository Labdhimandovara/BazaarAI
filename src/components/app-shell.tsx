import React from "react";
import { BrandLogo } from "./brand-logo";
import { ShieldCheck, User } from "lucide-react";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#070708] text-zinc-100 flex flex-col font-sans selection:bg-zinc-800 selection:text-zinc-100">
      {/* Premium Fintech Top Header */}
      <header className="w-full border-b border-zinc-900 bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-50 px-4 sm:px-8 py-3 flex items-center justify-between">
        <BrandLogo />
        
        {/* Bounded Safety Badge (Trust Indicator) */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-950 bg-emerald-950/10 text-emerald-500 text-xs font-semibold select-none">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Deterministic Purchase Policy Active</span>
        </div>

        {/* User Account Mock Button */}
        <button className="flex items-center gap-2 p-1.5 px-3 rounded-lg border border-zinc-900 hover:border-zinc-850 hover:bg-zinc-900/50 text-zinc-300 transition-all">
          <User className="w-4 h-4 text-zinc-500" />
          <span className="text-xs font-semibold hidden sm:inline-block">mando_dev</span>
        </button>
      </header>

      {/* Main Core Layout */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-8 py-10 flex flex-col justify-start">
        {children}
      </main>

      {/* Bottom Footer */}
      <footer className="w-full border-t border-zinc-900 py-6 px-4 text-center bg-[#070708]">
        <p className="text-zinc-600 text-xs font-medium">
          Bazaar AI — Bounded Agentic Purchasing Network. Built for Razorpay Hackathon.
        </p>
      </footer>
    </div>
  );
}
