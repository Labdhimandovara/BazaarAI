import React, { useState } from "react";
import { BrandLogo } from "./brand-logo";
import { ShieldCheck, User, X } from "lucide-react";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F7F4EE] text-[#172033] flex flex-col font-sans selection:bg-[#E6E0D6] selection:text-[#172033]">
      {/* Premium Fintech Top Header */}
      <header className="w-full border-b border-[#E6E0D6] bg-[#FFFDF9]/80 backdrop-blur-md sticky top-0 z-50 px-4 sm:px-8 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <BrandLogo showText={true} />
        </div>
        
        {/* Bounded Safety Badge (Trust Indicator) */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#079669]/20 bg-[#079669]/5 text-[#079669] text-[10px] font-bold select-none uppercase tracking-wide shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-[#079669] animate-pulse shadow-[0_0_4px_#079669]" />
          <span>Purchase Policy Active</span>
        </div>

        {/* User Account Mock Button */}
        <button onClick={() => setAccountOpen(true)} className="flex items-center gap-2 p-1.5 px-3 rounded-xl border border-[#E6E0D6] bg-[#FFFFFF] hover:bg-[#F7F4EE] text-[#172033] transition-all shadow-sm">
          <User className="w-4 h-4 text-[#667085]" />
          <span className="text-xs font-semibold hidden sm:inline-block">Account</span>
        </button>
      </header>

      {/* Main Core Layout */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-8 py-8 flex flex-col justify-start">
        {children}
      </main>

      {/* Bottom Footer */}
      <footer className="w-full border-t border-[#E6E0D6] py-6 px-4 text-center bg-[#F7F4EE]">
        <p className="text-[#667085] text-xs font-medium">
          Bazaar AI — Bounded Agentic Purchasing Network.
        </p>
      </footer>
      {accountOpen && (
        <div className="fixed inset-0 z-50 bg-[#172033]/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#FFFDF9] border border-[#E6E0D6] rounded-xl max-w-sm w-full p-6 flex flex-col gap-4 relative shadow-2xl">
            <button onClick={() => setAccountOpen(false)} className="absolute top-4 right-4 text-[#667085] hover:text-[#172033]">
              <X className="w-5 h-5" />
            </button>
            <div className="flex flex-col gap-1 items-center justify-center text-center mt-2">
              <div className="w-12 h-12 rounded-full bg-[#F7F4EE] border border-[#E6E0D6] flex items-center justify-center mb-2">
                <User className="w-6 h-6 text-[#172033]" />
              </div>
              <h3 className="text-[#172033] font-bold text-lg leading-snug">Account</h3>
              <div className="mt-4 p-4 rounded-lg bg-[#F7F4EE] border border-[#E6E0D6] w-full">
                <p className="text-[11px] font-bold text-[#667085] uppercase tracking-wider mb-1">Authentication Status</p>
                <p className="text-sm font-semibold text-[#172033]">Not connected</p>
              </div>
              <p className="text-xs text-[#667085] mt-4 px-2">Account linking and authentication are currently not configured for this environment.</p>
            </div>
            <button onClick={() => setAccountOpen(false)} className="mt-4 w-full py-2.5 rounded-lg bg-[#172033] hover:bg-[#172033]/90 text-[#FFFDF9] font-semibold text-sm transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
