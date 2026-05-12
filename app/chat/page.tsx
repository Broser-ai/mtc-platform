"use client";

import { useState, useRef, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";

type Phase = "idle" | "planning" | "awaiting_approval" | "executing" | "complete" | "error";

interface SquadMember {
  master_id: string;
  master_name: string;
  department: string;
  model: string;
  role_in_brief: string;
}

interface Plan {
  task_type: string;
  squad: SquadMember[];
  pattern: string;
  estimated_cost_usd: number;
  risk_class: string;
  plan_summary: string;
  expert_prompts: Record<string, string>;
}

interface ExpertResult {
  master_name: string;
  output: string;
  cost_usd: number;
  tokens: number;
  latency_ms: number;
  model: string;
  ok: boolean;
}

interface Message {
  role: "user" | "bot";
  content: string;
  type?: "plan" | "result" | "error" | "info";
  plan?: Plan;
  expertResults?: ExpertResult[];
  synthesis?: string;
  totalCost?: number;
  executionId?: string;
}

function PlanCard({ plan, onApprove, onReject, loading }: {
  plan: Plan;
  onApprove: () => void;
  onReject: () => void;
  loading: boolean;
}) {
  const riskColors: Record<string, string> = {
    low: "text-green-400 bg-green-950/40 border-green-800",
    medium: "text-yellow-400 bg-yellow-950/40 border-yellow-800",
    high: "text-orange-400 bg-orange-950/40 border-orange-800",
    critical: "text-red-400 bg-red-950/40 border-red-800",
  };

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-5 space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-gray-400">MTC-Bot Plan</span>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${riskColors[plan.risk_class] ?? "text-gray-400"}`}>
          {plan.risk_class} risk
        </span>
      </div>
      <p className="text-gray-200 leading-relaxed">{plan.plan_summary}</p>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-gray-500">Squad ({plan.squad.length} masters)</p>
        {plan.squad.map(m => (
          <div key={m.master_id} className="flex items-start gap-3 rounded-lg bg-gray-800/60 p-3">
            <div className="mt-0.5 h-6 w-6 rounded-full bg-indigo-600/30 flex items-center justify-center text-xs text-indigo-300 shrink-0">
              {m.master_name.charAt(0)}
            </div>
            <div>
              <p className="font-medium text-white">{m.master_name}</p>
              <p className="text-gray-400 text-xs">{m.department} \u00b7 {m.model.split("/")[1]}</p>
              <p className="text-gray-500 text-xs mt-0.5">{m.role_in_brief}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-gray-700 pt-3">
        <span className="text-gray-400">
          Estimated cost: <span className="text-white font-medium">${plan.estimated_cost_usd.toFixed(4)}</span>
        </span>
        <span className="text-gray-500 text-xs">Pattern: {plan.pattern}</span>
      </div>
      <div className="flex gap-3 pt-1">
        <button
          onClick={onApprove}
          disabled={loading}
          className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {loading ? "Executing\u2026" : "\u2713 Approve & Execute"}
        </button>
        <button
          onClick={onReject}
          disabled={loading}
          className="rounded-lg border border-gray-600 px-4 py-2.5 text-gray-300 hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

function ResultCard({ expertResults, synthesis, totalCost }: {
  expertResults: ExpertResult[];
  synthesis: string;
  totalCost: number;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-xl border border-indigo-800 bg-indigo-950/30 p-5">
        <p className="text-xs uppercase tracking-widest text-indigo-400 mb-3">Synthesis</p>
        <p className="text-gray-200 leading-relaxed whitespace-pre-wrap">{synthesis}</p>
      </div>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-gray-500">Expert outputs ({expertResults.length})</p>
        {expertResults.map(r => (
          <div key={r.master_name} className="rounded-lg border border-gray-700 bg-gray-900/40 overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === r.master_name ? null : r.master_name)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className={`h-2 w-2 rounded-full ${r.ok ? "bg-green-500" : "bg-red-500"}`} />
                <span className="font-medium text-white">{r.master_name}</span>
                <span className="text-gray-500 text-xs">{r.model.split("/")[1]}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>${r.cost_usd.toFixed(5)}</span>
                <span>{r.latency_ms}ms</span>
                <span>{expanded === r.master_name ? "\u25b2" : "\u25bc"}</span>
              </div>
            </button>
            {expanded === r.master_name && (
              <div className="px-4 pb-4 border-t border-gray-700">
                <p className="text-gray-300 leading-relaxed whitespace-pre-wrap mt-3 text-xs">{r.output}</p>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-500 border-t border-gray-800 pt-3">
        <span>Total cost: <span className="text-white">${totalCost.toFixed(5)}</span></span>
        <span>4 audit entries written</span>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      type: "info",
      content: "Hej! Jeg er MTC-Bot \u2014 din AI-orkestrerer. Beskriv din opgave, s\u00e5 sammens\u00e6tter jeg den rette squad og v\u00e6lger de bedste AI-modeller.",
    }
  ]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  const [currentBrief, setCurrentBrief] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function addMessage(msg: Message) {
    setMessages(prev => [...prev, msg]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || phase === "planning" || phase === "executing") return;
    const brief = input.trim();
    setInput("");
    setCurrentBrief(brief);
    addMessage({ role: "user", content: brief });
    setPhase("planning");
    addMessage({ role: "bot", type: "info", content: "\u23f3 Analyserer brief og sammens\u00e6tter squad\u2026" });

    try {
      const res = await fetch("/api/mtc-bot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, phase: "plan" }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      setMessages(prev => prev.filter(m => m.content !== "\u23f3 Analyserer brief og sammens\u00e6tter squad\u2026"));
      setCurrentPlan(data.plan);
      setCurrentExecutionId(data.execution_id);
      addMessage({ role: "bot", type: "plan", content: "", plan: data.plan });
      setPhase("awaiting_approval");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages(prev => prev.filter(m => m.content !== "\u23f3 Analyserer brief og sammens\u00e6tter squad\u2026"));
      addMessage({ role: "bot", type: "error", content: `Fejl under planl\u00e6gning: ${msg}` });
      setPhase("error");
    }
  }

  async function handleApprove() {
    if (!currentPlan || !currentExecutionId) return;
    setPhase("executing");
    setMessages(prev => prev.map(m =>
      m.type === "plan" ? { ...m, plan: undefined, type: "info", content: `\u2713 Plan godkendt \u2014 eksekverer ${currentPlan.squad.length} parallel expert-calls\u2026` } : m
    ));
    try {
      const res = await fetch("/api/mtc-bot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: "execute", brief: currentBrief, execution_id: currentExecutionId, plan: currentPlan }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      addMessage({
        role: "bot", type: "result", content: "",
        expertResults: data.expert_results,
        synthesis: data.synthesis,
        totalCost: data.total_cost_usd,
        executionId: data.execution_id,
      });
      setPhase("complete");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addMessage({ role: "bot", type: "error", content: `Fejl under eksekveringen: ${msg}` });
      setPhase("error");
    }
  }

  function handleReject() {
    setMessages(prev => prev.filter(m => m.type !== "plan"));
    addMessage({ role: "bot", type: "info", content: "Plan afvist. Beskriv hvad du gerne vil \u00e6ndre, eller skriv en ny brief." });
    setCurrentPlan(null);
    setCurrentExecutionId(null);
    setPhase("idle");
  }

  const isLoading = phase === "planning" || phase === "executing";

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-800">
          <div className="h-8 w-8 rounded-lg bg-indigo-600/30 flex items-center justify-center text-lg">\u25ee</div>
          <div>
            <h1 className="font-semibold text-white text-sm">MTC-Bot</h1>
            <p className="text-xs text-gray-500">Master Team Console \u00b7 Live Orchestrator</p>
          </div>
          <div className="ml-auto">
            {phase !== "idle" && phase !== "complete" && (
              <span className="text-xs text-indigo-400 animate-pulse">
                {phase === "planning" ? "Planning\u2026" : phase === "executing" ? "Executing\u2026" : phase === "awaiting_approval" ? "Awaiting approval" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 max-w-4xl mx-auto w-full">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "user" ? (
                <div className="max-w-xl rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-3 text-white text-sm leading-relaxed">
                  {msg.content}
                </div>
              ) : msg.type === "plan" && msg.plan ? (
                <div className="w-full max-w-2xl">
                  <PlanCard plan={msg.plan} onApprove={handleApprove} onReject={handleReject} loading={phase === "executing"} />
                </div>
              ) : msg.type === "result" && msg.expertResults ? (
                <div className="w-full max-w-2xl">
                  <ResultCard expertResults={msg.expertResults} synthesis={msg.synthesis ?? ""} totalCost={msg.totalCost ?? 0} />
                </div>
              ) : (
                <div className={`max-w-xl rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed ${
                  msg.type === "error"
                    ? "bg-red-950/40 border border-red-800 text-red-300"
                    : "bg-gray-800 text-gray-200"
                }`}>
                  {msg.content}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-gray-800">
          <form onSubmit={handleSubmit} className="flex gap-3 max-w-4xl mx-auto">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={
                phase === "awaiting_approval" ? "Godkend planen ovenfor, eller skriv en ny brief\u2026" :
                phase === "planning" || phase === "executing" ? "Venter\u2026" :
                "Beskriv din opgave p\u00e5 dansk eller engelsk\u2026"
              }
              disabled={isLoading}
              className="flex-1 rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none disabled:opacity-50 text-sm"
            />
            <button type="submit" disabled={isLoading || !input.trim()} className="rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
              \u2192
            </button>
          </form>
          <p className="mt-2 text-center text-xs text-gray-600 max-w-4xl mx-auto">
            Pr\u00f8v: \"Lav konkurrentanalyse for circular B2B i Tyskland\"
          </p>
        </div>
      </main>
    </div>
  );
}
