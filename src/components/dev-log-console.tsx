"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Terminal,
  AlertTriangle,
  ShieldAlert,
  Info,
  CheckCircle2,
  X,
  RefreshCw,
  Copy,
  Check,
  Search,
  ChevronDown,
  ChevronRight,
  Trash2,
  Filter,
  Maximize2,
  Minimize2,
  Bug,
  Pause,
  Play,
  ArrowUpRight,
} from "lucide-react";

export interface LogItem {
  id: string;
  timestamp: string;
  source: "AUDIT" | "COMMERCE" | "CLIENT" | "SYSTEM";
  level: "ERROR" | "WARN" | "INFO" | "POLICY_BLOCK";
  eventType: string;
  sessionId?: string | null;
  outcome?: string | null;
  message: string;
  metadata?: Record<string, any> | null;
  amount?: number | null;
  currency?: string | null;
}

interface LogSummary {
  total: number;
  errors: number;
  policyBlocks: number;
  warnings: number;
  info: number;
}

export function DevLogConsole() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [summary, setSummary] = useState<LogSummary>({
    total: 0,
    errors: 0,
    policyBlocks: 0,
    warnings: 0,
    info: 0,
  });
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedLevel, setSelectedLevel] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hasNewErrors, setHasNewErrors] = useState(false);

  const prevErrorCount = useRef(0);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedLevel !== "ALL") {
        params.append("level", selectedLevel);
      }
      if (searchQuery.trim()) {
        params.append("search", searchQuery.trim());
      }
      params.append("limit", "150");

      const res = await fetch(`/api/logs?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs);
      }
      if (data.summary) {
        setSummary(data.summary);
        const currentErrors = data.summary.errors + data.summary.policyBlocks;
        if (currentErrors > prevErrorCount.current && !isOpen) {
          setHasNewErrors(true);
        }
        prevErrorCount.current = currentErrors;
      }
    } catch (err) {
      console.error("Failed to fetch dev logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedLevel, searchQuery]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs();
    }, 3500);
    return () => clearInterval(interval);
  }, [autoRefresh, selectedLevel, searchQuery, isOpen]);

  const handleOpen = () => {
    setIsOpen(true);
    setHasNewErrors(false);
    fetchLogs();
  };

  const handleClearLogs = async () => {
    if (!confirm("Are you sure you want to clear all runtime audit logs?")) return;
    try {
      await fetch("/api/logs", { method: "DELETE" });
      setLogs([]);
      setSummary({ total: 0, errors: 0, policyBlocks: 0, warnings: 0, info: 0 });
    } catch (err) {
      console.error("Failed to clear logs:", err);
    }
  };

  const handleCopyDiagnostics = () => {
    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        summary,
        logsCount: logs.length,
        logs,
      },
      null,
      2
    );
    navigator.clipboard.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalIssues = summary.errors + summary.policyBlocks;

  const getBadgeColor = (level: string) => {
    switch (level) {
      case "POLICY_BLOCK":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "ERROR":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "WARN":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      default:
        return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    }
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case "POLICY_BLOCK":
        return <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
      case "ERROR":
        return <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
      case "WARN":
        return <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />;
      default:
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
    }
  };

  return (
    <>
      {/* Persistent Floating Trigger Bar */}
      <aside aria-label="Dev Log Console" className="fixed bottom-4 right-4 z-40 flex items-center gap-2">
        <button
          onClick={handleOpen}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xl border backdrop-blur-md transition-all duration-200 ${
            totalIssues > 0
              ? "bg-zinc-950/90 text-zinc-100 border-amber-500/40 hover:border-amber-500 hover:shadow-amber-500/10"
              : "bg-zinc-950/90 text-zinc-100 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900"
          } ${hasNewErrors ? "ring-2 ring-red-500 ring-offset-2 animate-bounce" : ""}`}
        >
          <div className="relative flex items-center justify-center">
            <Terminal className="w-4 h-4 text-emerald-400" />
            {totalIssues > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-ping" />
            )}
          </div>
          <span className="font-mono">Live Logs</span>
          {totalIssues > 0 ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
              {totalIssues} {totalIssues === 1 ? "Issue" : "Issues"}
            </span>
          ) : (
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#10B981]" />
          )}
        </button>
      </aside>

      {/* Slide-Up / Expandable Drawer Panel */}
      {isOpen && (
        <div
          className={`fixed inset-x-0 bottom-0 z-50 transition-all duration-300 bg-zinc-950/98 text-zinc-100 border-t border-zinc-800 shadow-2xl backdrop-blur-xl flex flex-col font-sans ${
            isExpanded ? "h-[85vh]" : "h-[480px]"
          }`}
        >
          {/* Header Bar */}
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-200">
                  Diagnostics & Log Console
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 border-l border-zinc-800 pl-3">
                <span>Total: {summary.total}</span>
                {summary.errors > 0 && (
                  <span className="text-red-400 font-semibold">Errors: {summary.errors}</span>
                )}
                {summary.policyBlocks > 0 && (
                  <span className="text-amber-400 font-semibold">Blocks: {summary.policyBlocks}</span>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                title={autoRefresh ? "Pause Live Stream" : "Resume Live Stream"}
                className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-all ${
                  autoRefresh
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {autoRefresh ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span className="text-[10px] hidden sm:inline-block font-mono">
                  {autoRefresh ? "Live" : "Paused"}
                </span>
              </button>

              <button
                onClick={fetchLogs}
                disabled={loading}
                title="Refresh Logs"
                className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-emerald-400" : ""}`} />
              </button>

              <button
                onClick={handleCopyDiagnostics}
                title="Copy Diagnostics JSON"
                className="p-1.5 px-2.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[11px] font-mono flex items-center gap-1.5 transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied" : "Export JSON"}</span>
              </button>

              <button
                onClick={handleClearLogs}
                title="Clear Logs"
                className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-400 text-zinc-400 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? "Restore Height" : "Maximize Console"}
                className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-all hidden sm:flex"
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={() => setIsOpen(false)}
                title="Close Console"
                className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="px-4 py-2 border-b border-zinc-800/80 bg-zinc-900/30 flex flex-wrap items-center justify-between gap-2 shrink-0">
            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono">
              <button
                onClick={() => setSelectedLevel("ALL")}
                className={`px-2.5 py-1 rounded-md border transition-all ${
                  selectedLevel === "ALL"
                    ? "bg-zinc-800 text-zinc-100 border-zinc-700 font-semibold"
                    : "bg-zinc-950/60 text-zinc-400 border-zinc-800/80 hover:text-zinc-200"
                }`}
              >
                ALL ({summary.total})
              </button>
              <button
                onClick={() => setSelectedLevel("ERROR")}
                className={`px-2.5 py-1 rounded-md border transition-all flex items-center gap-1 ${
                  selectedLevel === "ERROR"
                    ? "bg-red-500/20 text-red-300 border-red-500/40 font-semibold"
                    : "bg-zinc-950/60 text-red-400/80 border-zinc-800/80 hover:text-red-300"
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                ERRORS ({summary.errors})
              </button>
              <button
                onClick={() => setSelectedLevel("POLICY_BLOCK")}
                className={`px-2.5 py-1 rounded-md border transition-all flex items-center gap-1 ${
                  selectedLevel === "POLICY_BLOCK"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold"
                    : "bg-zinc-950/60 text-amber-400/80 border-zinc-800/80 hover:text-amber-300"
                }`}
              >
                <ShieldAlert className="w-3 h-3" />
                POLICY BLOCKS ({summary.policyBlocks})
              </button>
              <button
                onClick={() => setSelectedLevel("WARN")}
                className={`px-2.5 py-1 rounded-md border transition-all ${
                  selectedLevel === "WARN"
                    ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/40 font-semibold"
                    : "bg-zinc-950/60 text-zinc-400 border-zinc-800/80 hover:text-zinc-200"
                }`}
              >
                WARNINGS ({summary.warnings})
              </button>
              <button
                onClick={() => setSelectedLevel("INFO")}
                className={`px-2.5 py-1 rounded-md border transition-all ${
                  selectedLevel === "INFO"
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold"
                    : "bg-zinc-950/60 text-zinc-400 border-zinc-800/80 hover:text-zinc-200"
                }`}
              >
                INFO ({summary.info})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search event, session, error..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-mono"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Log Stream Container */}
          <div className="flex-1 overflow-y-auto font-mono text-xs p-3 flex flex-col gap-1.5 divide-y divide-zinc-900">
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 gap-2 p-8">
                <Terminal className="w-8 h-8 opacity-40 text-zinc-600" />
                <p className="text-sm">No log entries found for current filter.</p>
                <p className="text-xs text-zinc-600">Events will stream here in real-time as actions occur.</p>
              </div>
            ) : (
              logs.map((log) => {
                const isItemExpanded = expandedLogId === log.id;
                const timeStr = new Date(log.timestamp).toLocaleTimeString();

                return (
                  <div
                    key={log.id}
                    className={`pt-1.5 pb-1 px-2 rounded-lg transition-colors duration-150 ${
                      isItemExpanded
                        ? "bg-zinc-900 border border-zinc-800"
                        : "hover:bg-zinc-900/60"
                    }`}
                  >
                    {/* Summary Row */}
                    <div
                      onClick={() => setExpandedLogId(isItemExpanded ? null : log.id)}
                      className="flex items-start justify-between gap-3 cursor-pointer select-none"
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div className="mt-0.5">{getLevelIcon(log.level)}</div>
                        <span className="text-zinc-500 text-[11px] shrink-0">{timeStr}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold border shrink-0 ${getBadgeColor(
                            log.level
                          )}`}
                        >
                          {log.eventType}
                        </span>
                        <p className="text-zinc-300 truncate text-xs font-sans font-medium flex-1">
                          {log.message}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {log.sessionId && (
                          <span className="text-[10px] text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800 hidden md:inline-block">
                            {log.sessionId.length > 18 ? `${log.sessionId.slice(0, 16)}...` : log.sessionId}
                          </span>
                        )}
                        {isItemExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                        )}
                      </div>
                    </div>

                    {/* Expandable JSON Metadata Inspector */}
                    {isItemExpanded && (
                      <div className="mt-2.5 pt-2 border-t border-zinc-800/80 flex flex-col gap-2">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/80">
                          <div>
                            <span className="text-zinc-500 block">Event Type</span>
                            <span className="text-zinc-200 font-semibold">{log.eventType}</span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block">Level / Outcome</span>
                            <span
                              className={
                                log.level === "ERROR" || log.level === "POLICY_BLOCK"
                                  ? "text-red-400 font-semibold"
                                  : "text-emerald-400 font-semibold"
                              }
                            >
                              {log.level} {log.outcome ? `(${log.outcome})` : ""}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block">Source</span>
                            <span className="text-zinc-200">{log.source}</span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block">Timestamp</span>
                            <span className="text-zinc-300 text-[10px]">{log.timestamp}</span>
                          </div>
                        </div>

                        {log.metadata && Object.keys(log.metadata).length > 0 && (
                          <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800/80 overflow-x-auto">
                            <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800 mb-2">
                              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                                Metadata Payload
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(JSON.stringify(log.metadata, null, 2));
                                }}
                                className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" /> Copy Payload
                              </button>
                            </div>
                            <pre className="text-[11px] text-emerald-400/90 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Bar */}
          <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-900/60 text-[11px] text-zinc-400 flex items-center justify-between shrink-0 font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Diagnostic Monitor Active</span>
            </div>
            <span className="text-zinc-500 text-[10px]">
              Logs are bound to internal SQLite audit trail & event stream
            </span>
          </div>
        </div>
      )}
    </>
  );
}
