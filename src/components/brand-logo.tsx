import React from "react";
import Image from "next/image";

interface BrandLogoProps {
  className?: string;
  showText?: boolean;
}

export function BrandLogo({ className = "", showText = true }: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative w-9 h-9 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900 flex items-center justify-center">
        <Image
          src="/logo.jpg"
          alt="Bazaar AI Logo"
          fill
          className="object-cover scale-110"
          priority
        />
      </div>
      {showText && (
        <div className="flex flex-col">
          <span className="text-[#172033] font-bold tracking-tight leading-none text-base">
            Bazaar AI
          </span>
          <span className="text-[#667085] text-[10px] font-medium tracking-wide mt-0.5 uppercase">
            Agentic Commerce
          </span>
        </div>
      )}
    </div>
  );
}
