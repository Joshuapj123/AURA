"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, ShieldAlert, ShieldCheck, Terminal, Activity, Send,
  CheckCircle2, XCircle, AlertTriangle, Zap, Info,
  AlertOctagon, BookOpen, Brain, FileSearch, Gavel,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TrustMeter } from "@/components/TrustMeter";
import { AgentGraph, type PipelineStage } from "@/components/AgentGraph";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface FactClaim {
  claim: string;
  status: "VERIFIED" | "UNCERTAIN" | "INCORRECT";
  explanation: string;
}
interface FactAgent {
  overall_status: string;
  claims_checked: number;
  claims: FactClaim[];
  summary: string;
}
interface HallucAgent {
  risk_score: number;
  risk_level: string;
  hallucinations_found: string[];
  fabricated_elements: string;
  summary: string;
}
interface CitationItem { reference: string; verdict: string; note: string; }
interface CitationAgent {
  citations_found: number;
  status: string;
  items: CitationItem[];
  summary: string;
}
interface AgentAnalysis {
  fact_checker: { conclusion: string; status: string; key_finding: string };
  hallucination_detector: { conclusion: string; risk_score: number; key_finding: string };
  citation_validator: { conclusion: string; status: string; key_finding: string };
}
interface DecisionOutput {
  verdict: string;
  confidence_score: number;
  risk_level: string;
  issues_detected: string[];
  agent_analysis: AgentAnalysis;
  corrected_information: string;
  safety_recommendation: string;
  explanation: string;
}
interface ApiResult {
  query: string;
  aiResponse: string;
  agents: { factChecker: FactAgent; hallucinationDetector: HallucAgent; citationValidator: CitationAgent };
  decision: DecisionOutput;
  hallucinationScore: number;
  timestamp: string;
}

// ─── Log helpers ───────────────────────────────────────────────────────────────
interface LogLine { id: string; time: string; agent: string; level: "INFO" | "WARN" | "ERROR" | "SUCCESS" | "DEBUG"; msg: string; }
let lid = 0;
function mkLog(agent: string, level: LogLine["level"], msg: string): LogLine {
  return {
    id: `l${++lid}-${Math.random()}`,
    time: typeof window !== "undefined" ? new Date().toLocaleTimeString("en-US", { hour12: false }) : "--:--:--",
    agent, level, msg,
  };
}
const LEVEL_COLOR: Record<string, string> = { INFO: "text-cyan-400", WARN: "text-amber-400", ERROR: "text-red-400", SUCCESS: "text-emerald-400", DEBUG: "text-zinc-500" };
const AGENT_COLOR: Record<string, string> = { ORCHESTRATOR: "text-cyan-300", QA_AGENT: "text-blue-400", FACT_CHECK: "text-emerald-400", HALLUC: "text-red-400", CITATION: "text-purple-400", DECISION: "text-yellow-400", SYSTEM: "text-zinc-400" };

// ─── Verdict helpers ───────────────────────────────────────────────────────────
function verdictColor(v: string) {
  if (v?.toLowerCase().includes("rejected")) return { text: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/40" };
  if (v?.toLowerCase().includes("warning")) return { text: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/40" };
  return { text: "text-emerald-400", bg: "bg-emerald-500/15", border: "border-emerald-500/40" };
}
function riskColor(level: string) {
  const l = level?.toUpperCase();
  if (l === "CRITICAL") return "text-red-400";
  if (l === "HIGH") return "text-red-400";
  if (l === "MEDIUM") return "text-amber-400";
  return "text-emerald-400";
}
function claimColor(status: string) {
  if (status === "VERIFIED") return { icon: <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />, text: "text-emerald-300" };
  if (status === "INCORRECT") return { icon: <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />, text: "text-red-300" };
  return { icon: <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />, text: "text-amber-300" };
}

// ─── Raw Response Card ─────────────────────────────────────────────────────────
function RawResponseCard({ text, quarantined }: { text: string; quarantined: boolean }) {
  return (
    <div className="glass-card rounded-lg p-4 relative flex flex-col gap-2 shrink-0">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
        <span className="font-mono text-[10px] text-red-400 font-bold tracking-widest">RAW AI RESPONSE</span>
        {quarantined && <span className="ml-auto font-mono text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded">FLAGGED</span>}
      </div>
      <div className="relative min-h-[50px]">
        <p className={cn("font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap break-words", quarantined && "blur-sm select-none")}>
          {text || "Awaiting submission..."}
        </p>
        {quarantined && <div className="quarantine-overlay"><div className="quarantine-stamp">QUARANTINED</div></div>}
      </div>
    </div>
  );
}

// ─── Rich Decision Output Card ─────────────────────────────────────────────────
function DecisionCard({ result }: { result: ApiResult }) {
  const d = result.decision;
  const vc = verdictColor(d.verdict);
  const [tab, setTab] = useState<"overview" | "agents" | "claims">("overview");

  const tabs = [
    { id: "overview", label: "Overview", icon: <Gavel className="w-3 h-3" /> },
    { id: "agents", label: "Agent Reports", icon: <Brain className="w-3 h-3" /> },
    { id: "claims", label: "Claims", icon: <FileSearch className="w-3 h-3" /> },
  ] as const;

  return (
    <div className="glass-card rounded-lg flex flex-col overflow-hidden">
      {/* Verdict header */}
      <div className={cn("px-4 py-3 border-b border-zinc-800 flex items-center gap-3", vc.bg)}>
        {d.verdict.toLowerCase().includes("rejected")
          ? <AlertOctagon className={cn("w-5 h-5", vc.text)} />
          : d.verdict.toLowerCase().includes("warning")
            ? <AlertTriangle className={cn("w-5 h-5", vc.text)} />
            : <ShieldCheck className={cn("w-5 h-5", vc.text)} />}
        <div>
          <div className={cn("font-mono text-sm font-bold tracking-widest", vc.text)}>
            {d.verdict.toUpperCase()}
          </div>
          <div className="font-mono text-[10px] text-zinc-500">FINAL SAFETY VERDICT</div>
        </div>
        <div className="ml-auto text-right">
          <div className={cn("font-mono text-xl font-bold tabular-nums", vc.text)}>
            {d.confidence_score}%
          </div>
          <div className={cn("font-mono text-[10px]", riskColor(d.risk_level))}>
            {d.risk_level} RISK
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 font-mono text-[10px] font-semibold tracking-wider transition-all border-b-2",
              tab === t.id
                ? "text-cyan-400 border-cyan-400 bg-cyan-500/5"
                : "text-zinc-600 border-transparent hover:text-zinc-400"
            )}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4 overflow-y-auto flex-1 space-y-3">

        {/* ── OVERVIEW TAB ── */}
        {tab === "overview" && (
          <div className="space-y-3">
            {/* Explanation */}
            <div className="bg-zinc-900/60 rounded-lg p-3 border border-zinc-800">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Info className="w-3 h-3 text-cyan-400" />
                <span className="font-mono text-[10px] text-cyan-400 font-bold tracking-widest">EXPLANATION</span>
              </div>
              <p className="font-mono text-xs text-zinc-300 leading-relaxed">{d.explanation}</p>
            </div>

            {/* Issues detected */}
            {d.issues_detected?.length > 0 && (
              <div className="bg-zinc-900/60 rounded-lg p-3 border border-red-500/20">
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertOctagon className="w-3 h-3 text-red-400" />
                  <span className="font-mono text-[10px] text-red-400 font-bold tracking-widest">
                    ISSUES DETECTED ({d.issues_detected.length})
                  </span>
                </div>
                <ul className="space-y-1">
                  {d.issues_detected.map((issue, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-red-500 mt-0.5 shrink-0">•</span>
                      <span className="font-mono text-[11px] text-red-300">{issue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Safety recommendation */}
            <div className="bg-zinc-900/60 rounded-lg p-3 border border-cyan-500/20">
              <div className="flex items-center gap-1.5 mb-1.5">
                <BookOpen className="w-3 h-3 text-cyan-400" />
                <span className="font-mono text-[10px] text-cyan-400 font-bold tracking-widest">RECOMMENDATION</span>
              </div>
              <p className="font-mono text-xs text-zinc-300 leading-relaxed">{d.safety_recommendation}</p>
            </div>

            {/* Corrected information */}
            {d.corrected_information && d.corrected_information !== "No correction needed." && (
              <div className="bg-zinc-900/60 rounded-lg p-3 border border-emerald-500/20">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span className="font-mono text-[10px] text-emerald-400 font-bold tracking-widest">CORRECTED INFORMATION</span>
                </div>
                <p className="font-mono text-xs text-zinc-300 leading-relaxed">{d.corrected_information}</p>
              </div>
            )}
          </div>
        )}

        {/* ── AGENTS TAB ── */}
        {tab === "agents" && (
          <div className="space-y-3">
            {/* Fact Checker */}
            <div className="bg-zinc-900/60 rounded-lg p-3 border border-emerald-500/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <FileSearch className="w-3 h-3 text-emerald-400" />
                  <span className="font-mono text-[10px] text-emerald-400 font-bold tracking-widest">FACT CHECKER</span>
                </div>
                <span className={cn("font-mono text-[10px] px-2 py-0.5 rounded border",
                  d.agent_analysis.fact_checker.status === "PASS"
                    ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                    : d.agent_analysis.fact_checker.status === "FAIL"
                      ? "text-red-400 border-red-500/30 bg-red-500/10"
                      : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                )}>
                  {d.agent_analysis.fact_checker.status}
                </span>
              </div>
              <p className="font-mono text-xs text-zinc-300 mb-1">{d.agent_analysis.fact_checker.conclusion}</p>
              <p className="font-mono text-[10px] text-zinc-500 italic">{d.agent_analysis.fact_checker.key_finding}</p>
            </div>

            {/* Hallucination Detector */}
            <div className="bg-zinc-900/60 rounded-lg p-3 border border-red-500/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Brain className="w-3 h-3 text-red-400" />
                  <span className="font-mono text-[10px] text-red-400 font-bold tracking-widest">HALLUC DETECTOR</span>
                </div>
                <span className={cn("font-mono text-[10px] px-2 py-0.5 rounded border tabular-nums",
                  (d.agent_analysis.hallucination_detector.risk_score ?? 0) > 60
                    ? "text-red-400 border-red-500/30 bg-red-500/10"
                    : (d.agent_analysis.hallucination_detector.risk_score ?? 0) > 30
                      ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                      : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                )}>
                  RISK: {d.agent_analysis.hallucination_detector.risk_score ?? result.hallucinationScore}/100
                </span>
              </div>
              {/* Risk bar */}
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mb-2">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${d.agent_analysis.hallucination_detector.risk_score ?? result.hallucinationScore}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{
                    background: (d.agent_analysis.hallucination_detector.risk_score ?? 50) > 60
                      ? "#ef4444" : (d.agent_analysis.hallucination_detector.risk_score ?? 50) > 30
                        ? "#f59e0b" : "#34d399"
                  }}
                />
              </div>
              <p className="font-mono text-xs text-zinc-300 mb-1">{d.agent_analysis.hallucination_detector.conclusion}</p>
              <p className="font-mono text-[10px] text-zinc-500 italic">{d.agent_analysis.hallucination_detector.key_finding}</p>
            </div>

            {/* Citation Validator */}
            <div className="bg-zinc-900/60 rounded-lg p-3 border border-purple-500/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <BookOpen className="w-3 h-3 text-purple-400" />
                  <span className="font-mono text-[10px] text-purple-400 font-bold tracking-widest">CITATION VALIDATOR</span>
                </div>
                <span className={cn("font-mono text-[10px] px-2 py-0.5 rounded border",
                  d.agent_analysis.citation_validator.status === "VERIFIED"
                    ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                    : d.agent_analysis.citation_validator.status === "SUSPICIOUS"
                      ? "text-red-400 border-red-500/30 bg-red-500/10"
                      : "text-zinc-400 border-zinc-600 bg-zinc-800/50"
                )}>
                  {d.agent_analysis.citation_validator.status}
                </span>
              </div>
              <p className="font-mono text-xs text-zinc-300 mb-1">{d.agent_analysis.citation_validator.conclusion}</p>
              <p className="font-mono text-[10px] text-zinc-500 italic">{d.agent_analysis.citation_validator.key_finding}</p>
            </div>
          </div>
        )}

        {/* ── CLAIMS TAB ── */}
        {tab === "claims" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-[10px] text-zinc-500 tracking-widest">
                {result.agents.factChecker.claims_checked ?? 0} CLAIMS ANALYZED
              </span>
              <span className={cn("font-mono text-[10px] px-2 py-0.5 rounded border",
                result.agents.factChecker.overall_status === "PASS"
                  ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                  : result.agents.factChecker.overall_status === "FAIL"
                    ? "text-red-400 border-red-500/30 bg-red-500/10"
                    : "text-amber-400 border-amber-500/30 bg-amber-500/10"
              )}>
                {result.agents.factChecker.overall_status}
              </span>
            </div>

            {(result.agents.factChecker.claims ?? []).length > 0
              ? (result.agents.factChecker.claims ?? []).map((c, i) => {
                const { icon, text } = claimColor(c.status);
                return (
                  <div key={i} className="bg-zinc-900/60 rounded p-2.5 border border-zinc-800">
                    <div className="flex items-start gap-2 mb-1">
                      {icon}
                      <span className={cn("font-mono text-xs font-semibold", text)}>{c.claim}</span>
                    </div>
                    <p className="font-mono text-[10px] text-zinc-500 ml-5">{c.explanation}</p>
                  </div>
                );
              })
              : <p className="font-mono text-xs text-zinc-600 italic text-center py-4">No individual claims extracted.</p>
            }

            {/* Citation items */}
            {(result.agents.citationValidator.items ?? []).length > 0 && (
              <>
                <div className="font-mono text-[10px] text-purple-400 font-bold tracking-widest mt-3 mb-1">CITATIONS</div>
                {result.agents.citationValidator.items.map((c, i) => (
                  <div key={i} className="bg-zinc-900/60 rounded p-2.5 border border-zinc-800">
                    <div className="flex items-start gap-2 mb-1">
                      <span className={cn("font-mono text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded",
                        c.verdict === "PLAUSIBLE" ? "bg-emerald-500/20 text-emerald-400"
                          : c.verdict === "SUSPICIOUS" ? "bg-red-500/20 text-red-400"
                            : "bg-zinc-700 text-zinc-400"
                      )}>{c.verdict}</span>
                      <span className="font-mono text-xs text-zinc-300">{c.reference}</span>
                    </div>
                    <p className="font-mono text-[10px] text-zinc-500 ml-0">{c.note}</p>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Terminal ──────────────────────────────────────────────────────────────────
function TerminalLog({ logs, running }: { logs: LogLine[]; running: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);
  return (
    <div className="flex flex-col h-full rounded-lg overflow-hidden border border-zinc-800">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
        </div>
        <span className="font-mono text-[10px] text-zinc-500 ml-1">firewall.sys — live</span>
        {running && <div className="ml-auto flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" /><span className="font-mono text-[10px] text-cyan-400">LIVE</span></div>}
      </div>
      <div className="flex-1 overflow-y-auto bg-zinc-950 p-2.5 space-y-0.5 relative">
        <AnimatePresence initial={false}>
          {logs.map(l => (
            <motion.div key={l.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.12 }}
              className="flex gap-1.5 font-mono text-[11px] leading-5">
              <span className="text-zinc-600 shrink-0">[{l.time}]</span>
              <span className={cn("shrink-0 font-semibold", LEVEL_COLOR[l.level])}>[{l.level.padEnd(7)}]</span>
              <span className={cn("shrink-0", AGENT_COLOR[l.agent] ?? "text-zinc-400")}>[{l.agent}]</span>
              <span className="text-zinc-300 break-all">{l.msg}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        {running && (
          <div className="flex gap-1.5 font-mono text-[11px] leading-5">
            <span className="text-zinc-600">[--:--:--]</span>
            <span className="text-cyan-400">[INFO   ]</span>
            <span className="text-cyan-300">[SYSTEM ]</span>
            <span className="text-zinc-300 terminal-cursor" />
          </div>
        )}
        <div ref={ref} />
      </div>
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function Page() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<PipelineStage>("idle");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [trust, setTrust] = useState(0);
  const [trustActive, setTrustActive] = useState(false);
  const [quarantined, setQuarantined] = useState(false);
  const [mounted, setMounted] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    setMounted(true);
    setLogs([
      mkLog("SYSTEM", "INFO", "AURA initialized"),
      mkLog("SYSTEM", "INFO", "Bytez JS SDK → llm"),
      mkLog("ORCHESTRATOR", "INFO", "5 agents on standby. Awaiting input."),
      mkLog("DECISION", "INFO", "Rich structured output mode enabled."),
    ]);
  }, []);

  const addLog = useCallback((l: LogLine) => setLogs(p => [...p.slice(-120), l]), []);
  const after = useCallback((ms: number, agent: string, level: LogLine["level"], msg: string) => {
    const t = setTimeout(() => addLog(mkLog(agent, level, msg)), ms);
    timers.current.push(t);
  }, [addLog]);

  const run = async () => {
    if (!query.trim() || loading) return;
    timers.current.forEach(clearTimeout); timers.current = [];
    setLoading(true); setResult(null); setQuarantined(false);
    setTrust(0); setTrustActive(false); setStage("idle");

    after(0, "ORCHESTRATOR", "INFO", `Query received: "${query.slice(0, 50)}"`);
    after(300, "ORCHESTRATOR", "INFO", "Initializing 5-agent safety pipeline...");
    after(600, "QA_AGENT", "INFO", "Routing to llm...");
    setTimeout(() => setStage("qa"), 500);
    after(1400, "QA_AGENT", "SUCCESS", "Primary response generated.");
    after(1600, "ORCHESTRATOR", "INFO", "Dispatching 3 verification agents in parallel...");
    after(1800, "FACT_CHECK", "INFO", "Analyzing factual claims...");
    after(2000, "HALLUC", "WARN", "Hallucination pattern scanner active...");
    after(2200, "CITATION", "INFO", "Cross-referencing sources...");
    setTimeout(() => setStage("verify"), 1600);
    after(3500, "FACT_CHECK", "SUCCESS", "Structured fact report generated.");
    after(3700, "HALLUC", "INFO", "Risk scoring complete.");
    after(3900, "CITATION", "WARN", "Citation assessment done.");
    after(4200, "ORCHESTRATOR", "INFO", "All 3 reports received. Activating Decision Agent...");
    setTimeout(() => setStage("decision"), 4000);
    after(4800, "DECISION", "INFO", "Synthesizing agent reports...");
    after(5200, "DECISION", "INFO", "Computing structured verdict...");
    after(5600, "DECISION", "INFO", "Building issue list and corrections...");

    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json() as ApiResult & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "API error");

      setResult(data);
      const rejected = data.decision.verdict.toLowerCase().includes("rejected");
      const highRisk = data.hallucinationScore > 60;
      setStage(rejected || highRisk ? "error" : "done");
      setQuarantined(rejected || highRisk);
      setTrust(data.decision.confidence_score);
      setTimeout(() => setTrustActive(true), 300);

      after(0, "DECISION", rejected ? "ERROR" : "SUCCESS",
        `VERDICT: ${data.decision.verdict.toUpperCase()} | Confidence: ${data.decision.confidence_score}%`);
      after(200, "DECISION", "INFO", `Risk Level: ${data.decision.risk_level}`);
      after(400, "DECISION", "INFO", `Issues found: ${data.decision.issues_detected?.length ?? 0}`);
      after(600, "HALLUC", highRisk ? "ERROR" : "SUCCESS",
        `Hallucination risk: ${data.hallucinationScore}/100`);
      after(800, "ORCHESTRATOR", rejected ? "ERROR" : "SUCCESS",
        rejected ? "QUARANTINED — response blocked by safety filter." : "Pipeline complete. Output approved.");

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      addLog(mkLog("SYSTEM", "ERROR", `Pipeline failed: ${msg}`));
      setStage("error");
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  const vc = result ? verdictColor(result.decision.verdict) : null;

  return (
    <div className="h-screen w-screen bg-zinc-950 flex flex-col overflow-hidden">

      {/* HEADER */}
      <header className="h-11 border-b border-zinc-800 flex items-center px-5 gap-4 bg-zinc-950 shrink-0 z-50">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          <span className="font-mono text-sm font-bold text-cyan-400 tracking-wider">AURA</span>
          <span className="font-mono text-[10px] text-zinc-600">v2.4</span>
        </div>
        <div className="flex items-center gap-4 ml-4">
          {[["Testing", "bg-emerald-400"], ["LLM", "bg-emerald-400"], ["5 AGENTS", stage !== "idle" ? "bg-cyan-400" : "bg-zinc-600"]].map(([l, d]) => (
            <div key={l} className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
              <div className={`w-1.5 h-1.5 rounded-full ${d}`} />{l}
            </div>
          ))}
        </div>
        {loading && (
          <div className="ml-auto flex items-center gap-2 font-mono text-xs text-cyan-400">
            <Activity className="w-3 h-3 animate-pulse" /> PIPELINE RUNNING
          </div>
        )}
        {result && !loading && vc && (
          <div className={cn("ml-auto font-mono text-xs font-bold px-3 py-1 rounded border", vc.text, vc.bg, vc.border)}>
            {result.decision.verdict.toUpperCase()}
          </div>
        )}
      </header>

      {/* 3-COLUMN GRID */}
      <div className="flex-1 grid overflow-hidden" style={{ gridTemplateColumns: "28% 44% 28%" }}>

        {/* ── PANE 1: LEFT ── */}
        <div className="border-r border-zinc-800 flex flex-col gap-3 p-4 overflow-hidden">
          <div className="flex items-center gap-2 shrink-0">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-mono text-[10px] text-zinc-400 tracking-widest">INTERACTION ZONE</span>
          </div>

          {/* Input */}
          <div className="glass-card rounded-lg p-3 shrink-0">
            <div className="font-mono text-[10px] text-zinc-500 mb-2 tracking-widest flex justify-between">
              <span>QUERY TERMINAL</span><span>Ctrl+Enter</span>
            </div>
            <textarea value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run(); }}
              placeholder="Enter query to simulate..." rows={3} disabled={loading}
              className={cn("w-full bg-transparent font-mono text-xs text-zinc-200 placeholder-zinc-600",
                "resize-none border border-zinc-700 rounded px-3 py-2 leading-relaxed cyber-input",
                loading && "opacity-50 cursor-not-allowed")}
            />
            <button onClick={run} disabled={loading || !query.trim()}
              className={cn("mt-2 w-full flex items-center justify-center gap-2 font-mono text-xs font-bold",
                "tracking-wider py-2 rounded border transition-all",
                loading || !query.trim()
                  ? "border-zinc-700 text-zinc-600 cursor-not-allowed"
                  : "border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-400")}>
              {loading
                ? <><div className="w-3 h-3 border border-cyan-400 border-t-transparent rounded-full animate-spin" /><span>ANALYZING...</span></>
                : <><Send className="w-3 h-3" /><span>RUN PIPELINE</span></>}
            </button>
          </div>

          {/* Raw response */}
          <RawResponseCard text={result?.aiResponse ?? ""} quarantined={quarantined} />

          {/* Hallucination summary pill */}
          {result && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="glass-card rounded-lg p-3 shrink-0">
              <div className="flex justify-between items-center mb-1.5">
                <span className="font-mono text-[10px] text-zinc-500 tracking-widest">HALLUCINATION RISK</span>
                <span className={cn("font-mono text-[10px] font-bold",
                  result.hallucinationScore > 60 ? "text-red-400" : result.hallucinationScore > 30 ? "text-amber-400" : "text-emerald-400")}>
                  {result.hallucinationScore}/100
                </span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${result.hallucinationScore}%` }}
                  transition={{ duration: 1, ease: "easeOut" }} className="h-full rounded-full"
                  style={{ background: result.hallucinationScore > 60 ? "#ef4444" : result.hallucinationScore > 30 ? "#f59e0b" : "#34d399" }} />
              </div>
            </motion.div>
          )}
        </div>

        {/* ── PANE 2: CENTER ── */}
        <div className="border-r border-zinc-800 flex flex-col overflow-hidden">
          <div className="shrink-0 flex items-center gap-2 px-4 pt-4 pb-2">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-mono text-[10px] text-zinc-400 tracking-widest">LIVE AGENT GRAPH</span>
            <span className={cn("ml-auto font-mono text-[10px] px-2 py-0.5 rounded border",
              stage === "idle" ? "text-zinc-600 border-zinc-700" :
                stage === "done" ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" :
                  stage === "error" ? "text-red-400 border-red-500/30 bg-red-500/10" :
                    "text-cyan-400 border-cyan-500/30 bg-cyan-500/10")}>
              {stage.toUpperCase()}
            </span>
          </div>

          {/* Graph — smaller when result is showing */}
          <div className={cn("transition-all duration-500", result ? "h-64 shrink-0" : "flex-1")}>
            <AgentGraph stage={stage} />
          </div>

          {/* Rich Decision Output */}
          {result && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="flex-1 min-h-0 px-4 pb-4 overflow-hidden flex flex-col">
              <DecisionCard result={result} />
            </motion.div>
          )}

          {/* Metrics bar */}
          {result && (
            <div className="shrink-0 border-t border-zinc-800 grid grid-cols-4 divide-x divide-zinc-800">
              {[
                {
                  label: "HALLUC", val: `${result.hallucinationScore}/100`,
                  color: result.hallucinationScore > 60 ? "text-red-400" : result.hallucinationScore > 30 ? "text-amber-400" : "text-emerald-400"
                },
                { label: "CONFIDENCE", val: `${result.decision.confidence_score}%`, color: "text-cyan-400" },
                {
                  label: "VERDICT",
                  val: result.decision.verdict.toLowerCase().includes("rejected") ? "FAIL" : result.decision.verdict.toLowerCase().includes("warning") ? "WARN" : "PASS",
                  color: result.decision.verdict.toLowerCase().includes("rejected") ? "text-red-400" : result.decision.verdict.toLowerCase().includes("warning") ? "text-amber-400" : "text-emerald-400"
                },
                { label: "ISSUES", val: `${result.decision.issues_detected?.length ?? 0}`, color: "text-zinc-300" },
              ].map(({ label, val, color }) => (
                <div key={label} className="py-2 px-3 text-center">
                  <div className="font-mono text-[9px] text-zinc-600 mb-0.5">{label}</div>
                  <div className={cn("font-mono text-sm font-bold tabular-nums", color)}>{val}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── PANE 3: RIGHT ── */}
        <div className="flex flex-col gap-3 p-4 overflow-hidden">
          <div className="flex items-center gap-2 shrink-0">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-mono text-[10px] text-zinc-400 tracking-widest">TELEMETRY</span>
          </div>

          <div className="glass-card rounded-lg p-4 flex justify-center shrink-0">
            <TrustMeter score={trust} active={trustActive} />
          </div>

          <div className="flex-1 min-h-0">
            <TerminalLog logs={logs} running={loading} />
          </div>
        </div>

      </div>
    </div>
  );
}
