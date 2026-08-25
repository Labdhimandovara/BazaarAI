import React from "react";
import { ArrowUp } from "lucide-react";

interface AIInputProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
  error?: string | null;
}

export function AIInput({
  value,
  onChange,
  onSubmit,
  isLoading = false,
  isDisabled = false,
  error = null,
}: AIInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isLoading && !isDisabled) {
        onSubmit();
      }
    }
  };

  return (
    <div className="w-full flex flex-col gap-2">
      <div
        className={`relative w-full rounded-xl border bg-zinc-950 px-4 py-3 shadow-inner focus-within:border-zinc-700 transition-all ${
          error ? "border-red-900 focus-within:border-red-800" : "border-zinc-900"
        }`}
      >
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isDisabled || isLoading}
          placeholder="Try: A chess gift for my 12-year-old brother under ₹500"
          className="w-full bg-transparent text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none resize-none min-h-[56px] pr-12 leading-relaxed"
          rows={2}
        />
        
        <div className="absolute right-3 bottom-3 flex items-center gap-2">
          {value.length > 0 && (
            <span className="text-[10px] text-zinc-600 font-medium hidden sm:inline-block">
              Press Enter
            </span>
          )}
          <button
            onClick={onSubmit}
            disabled={!value.trim() || isLoading || isDisabled}
            className={`p-2 rounded-lg flex items-center justify-center transition-all ${
              value.trim() && !isLoading && !isDisabled
                ? "bg-zinc-100 text-zinc-950 hover:bg-zinc-200"
                : "bg-zinc-900 text-zinc-600 cursor-not-allowed"
            }`}
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
      {error && <span className="text-xs text-red-500 font-medium px-1">{error}</span>}
    </div>
  );
}
