import React from "react";

export type CommerceSource = "ALL" | "SYNTHETIC" | "EBAY";

interface SourceSelectorProps {
  selectedSource: CommerceSource;
  onChange: (source: CommerceSource) => void;
  providerStatuses?: Record<string, string>;
}

export function SourceSelector({ selectedSource, onChange, providerStatuses }: SourceSelectorProps) {
  const sources: Array<{ id: CommerceSource; label: string; detail: string }> = [
    { id: "ALL", label: "ALL SOURCES", detail: "Aggregated results" },
    { id: "SYNTHETIC", label: "BAZAAR PRODUCTS", detail: "Authorized catalog" },
    { id: "EBAY", label: "EBAY", detail: "Live marketplace" },
  ];

  const getStatusIndicator = (sourceId: CommerceSource, statuses?: Record<string, string>) => {
    if (!statuses) return null;
    if (sourceId === "ALL") return null;
    
    const statusKey = sourceId === "SYNTHETIC" ? "synthetic" : "ebay";
    const status = statuses[statusKey];
    if (!status) return null;

    const sourceName = sourceId === "EBAY" ? "eBay" : "Bazaar";

    switch (status) {
      case "CONNECTED_RESULTS":
        return (
          <span className="text-[10px] text-[#079669] flex items-center gap-1.5 font-medium mt-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#079669] animate-pulse shadow-[0_0_4px_#079669]" />
            <span>Connected &middot; Live listings available</span>
          </span>
        );
      case "CONNECTED_ZERO":
        return (
          <span className="text-[10px] text-[#B7791F] flex items-center gap-1.5 font-medium mt-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#B7791F]" />
            <span>Connected &middot; No matching {sourceName} listings</span>
          </span>
        );
      case "UNAVAILABLE":
        return (
          <span className="text-[10px] text-[#667085] flex items-center gap-1.5 font-medium mt-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#667085]" />
            <span>Unavailable</span>
          </span>
        );
      case "FAILED":
        return (
          <span className="text-[10px] text-[#D64545] flex items-center gap-1.5 font-medium mt-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D64545]" />
            <span>Connection failed</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[#667085] text-xs font-semibold uppercase tracking-wider pl-1">
        Authorized Commerce Sources
      </span>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {sources.map((src) => {
          const isSelected = selectedSource === src.id;
          return (
            <button
              key={src.id}
              onClick={() => onChange(src.id)}
              className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all duration-200 ${
                isSelected
                  ? "bg-[#FFFFFF] border-[#E6E0D6] text-[#172033] shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
                  : "bg-[#FFFDF9] border-transparent hover:border-[#E6E0D6] text-[#667085] hover:text-[#172033]"
              }`}
            >
              <span className={`text-sm font-semibold tracking-tight ${isSelected ? "text-[#172033]" : "text-[#172033]"}`}>
                {src.label}
              </span>
              <span className="text-xs text-[#667085] mt-0.5 font-normal line-clamp-1">
                {src.detail}
              </span>
              {getStatusIndicator(src.id, providerStatuses)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
