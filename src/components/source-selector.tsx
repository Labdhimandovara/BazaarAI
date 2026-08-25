import React from "react";

export type CommerceSource = "ALL" | "AMAZON" | "FLIPKART" | "SYNTHETIC";

interface SourceSelectorProps {
  selectedSource: CommerceSource;
  onChange: (source: CommerceSource) => void;
}

export function SourceSelector({ selectedSource, onChange }: SourceSelectorProps) {
  const sources: Array<{ id: CommerceSource; label: string; detail: string }> = [
    { id: "ALL", label: "All Stores", detail: "Aggregated results" },
    { id: "AMAZON", label: "Amazon", detail: "Authorized catalog feed" },
    { id: "FLIPKART", label: "Flipkart", detail: "Authorized merchant feed" },
    { id: "SYNTHETIC", label: "Razorpay Merchants", detail: "Verified test stores" },
  ];

  return (
    <div className="flex flex-col gap-2">
      <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
        Authorized Commerce Sources
      </span>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {sources.map((src) => {
          const isSelected = selectedSource === src.id;
          return (
            <button
              key={src.id}
              onClick={() => onChange(src.id)}
              className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all duration-200 ${
                isSelected
                  ? "bg-zinc-900 border-zinc-500 text-zinc-50 shadow-sm"
                  : "bg-zinc-950 border-zinc-900 hover:border-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <span className={`text-sm font-semibold ${isSelected ? "text-zinc-50" : "text-zinc-300"}`}>
                {src.label}
              </span>
              <span className="text-[11px] text-zinc-500 mt-1 font-normal line-clamp-1">
                {src.detail}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
