import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import Link from "next/link";

export const dynamic = "force-dynamic";

const LAYERS = [
  { id: "L1_ui",         num: "L1",  name: "Simple UI / Output Selector",       route: "/dashboard",         check: "dashboard" },
  { id: "L2_contract",   num: "L2",  name: "Project Execution Contract",        route: "/projects",          check: "projects" },
  { id: "L3_ubi",        num: "L3",  name: "Universal Build Intelligence",      route: "/browse/bundles",    check: "bundles" },
  { id: "L4_artifact",   num: "L4",  name: "Artifact Intelligence Engine",      route: "/browse/skills",     check: "skills" },
  { id: "L5_conductor",  num: "L5",  name: "AI Conductor (MTC-Bot)",            route: "/chat",              check: "chat" },
  { id: "L6_aggregator", num: "L6",  name: "Model Aggregator (8 patterns)",     route: "/chat",              check: "patterns" },
  { id: "L7_gateway",    num: "L7",  name: "Gateway Layer (58 AI ecosystems)",  route: "/browse/connectors", check: "ecosystems" },
  { id: "L8_mcp",        num: "L8",  name: "MCP / Connector Layer (Horizon)",   route: "/browse/connectors", check: "horizon" },
  { id: "L8b_composio",  num: "L8b", name: "Composio Tool Router (54 toolkits)",route: "/browse/connectors", check: "composio" },
  { id: "L8c_automation",num: "L8c", name: "Automation Platforms (n8n/Make/\u2026)", route: "/browse/connectors", check: "automation" },
  { id: "L9_agents",     num: "L9",  name: "Agent Orchestration (94 departments)", route: "/browse/departments", check: "departments" },
  { id: "L10_security",  num: "L10", name: "QA / Approval / Security (4 risk classes)", route: "/browse/connectors", check: "risk_classes" },
  { id: "L11_delivery",  num: "L11", name: "Delivery / Memory / Watchers",      route: "/executions",        check: "executions_table" },
  { id: "L11b_workflows",num: "L11b",name: "Workflows (19 standard flows)",     route: "/browse/workflows",  check: "workflows" },
];

async function loadStats(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [d, m, s, b, w, c, h, e, p, r, ex, wt] = await Promise.all([
    supabase.from("departments").select("*", { count: "exact", head: true }),
    supabase.from("masters").select("*", { count: "exact", head: true }),
    supabase.from("agent_skills").select("*", { count: "exact", head: true }),
    supabase.from("output_bundles").select("*", { count: "exact", head: true }),
    supabase.from("workflows").select("*", { count: "exact", head: true }),
    supabase.from("composio_toolkits").select("*", { count: "exact", head: true }),
    supabase.from("horizon_templates").select("*", { count: "exact", head: true }),
    supabase.from("ai_ecosystems").select("*", { count: "exact", head: true }),
    supabase.from("execution_patterns").select("*", { count: "exact", head: true }),
    supabase.from("risk_classes").select("*", { count: "exact", head: true }),
    supabase.from("executions").select("*", { count: "exact", head: true }),
    supabase.from("watchers").select("*", { count: "exact", head: true }),
  ]);
  return {
    departments: d.count ?? 0,
    masters: m.count ?? 0,
    skills: s.count ?? 0,
    bundles: b.count ?? 0,
    workflows: w.count ?? 0,
    composio: c.count ?? 0,
    horizon: h.count ?? 0,
    ecosystems: e.count ?? 0,
    patterns: p.count ?? 0,
    risk_classes: r.count ?? 0,
    executions: ex.count ?? 0,
    watchers: wt.count ?? 0,
    connectors: (c.count ?? 0) + (h.count ?? 0),
  };
}

export default async function ArchitecturePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const stats = await loadStats(supabase);

  const checks: Record<string, boolean> = {
    dashboard: true,
    projects: true,
    bundles: stats.bundles >= 33,
    skills: stats.skills >= 100,
    chat: true,
    patterns: stats.patterns === 8,
    ecosystems: stats.ecosystems >= 50,
    horizon: stats.horizon >= 10,
    composio: stats.composio >= 50,
    automation: true,
    departments: stats.departments >= 90,
    risk_classes: stats.risk_classes === 4,
    executions_table: true,
    workflows: stats.workflows >= 19,
  };

  const passing = LAYERS.filter(l => checks[l.check]).length;
  const total = LAYERS.length;
  const percent = Math.round((passing / total) * 100);

  return (
    <div className="flex h-screen">
      <Sidebar stats={{
        departments: stats.departments,
        masters: stats.masters,
        skills: stats.skills,
        bundles: stats.bundles,
        workflows: stats.workflows,
        connectors: stats.connectors,
      }} />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Health Check</p>
            <h1 className="text-3xl font-light text-white tracking-tight mb-1">Architecture Status</h1>
            <p className="text-sm text-gray-500">
              {passing}/{total} layers active \u00b7 {percent}% coverage
            </p>
          </div>

          {/* Progress bar */}
          <div className="mb-8">
            <div className="h-2 rounded-full bg-gray-900 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          {/* Stat grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
            <StatCard label="Departments" value={stats.departments} threshold={90} />
            <StatCard label="Masters"     value={stats.masters}     threshold={100} />
            <StatCard label="Skills"      value={stats.skills}      threshold={100} />
            <StatCard label="Patterns"    value={stats.patterns}    threshold={8} exact />
            <StatCard label="Ecosystems"  value={stats.ecosystems}  threshold={50} />
            <StatCard label="Risk Classes" value={stats.risk_classes} threshold={4} exact />
          </div>

          {/* Layer list */}
          <div className="space-y-1.5">
            {LAYERS.map((layer) => {
              const ok = checks[layer.check];
              return (
                <Link
                  key={layer.id}
                  href={layer.route}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    ok
                      ? "bg-green-950/20 border-green-900/40 hover:border-green-700"
                      : "bg-gray-900/40 border-gray-800 hover:border-gray-700"
                  }`}
                >
                  <span className={`text-sm font-mono ${ok ? "text-green-400" : "text-gray-600"}`}>
                    {ok ? "\u2713" : "\u25cb"}
                  </span>
                  <span className="text-[10px] font-mono text-gray-500 w-8">{layer.num}</span>
                  <span className={`flex-1 text-sm ${ok ? "text-white" : "text-gray-500"}`}>
                    {layer.name}
                  </span>
                  <span className="text-[10px] text-indigo-400 group-hover:text-indigo-300">
                    {layer.route} \u2192
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Footer note */}
          <div className="mt-10 rounded-xl border border-gray-800 bg-gray-900/40 p-5">
            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Live infrastructure</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <Row label="Executions logged" value={stats.executions} />
              <Row label="Active watchers"   value={stats.watchers} />
              <Row label="Composio toolkits" value={stats.composio} />
              <Row label="Horizon templates" value={stats.horizon} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, threshold, exact }: { label: string; value: number; threshold: number; exact?: boolean }) {
  const ok = exact ? value === threshold : value >= threshold;
  return (
    <div className={`rounded-xl border bg-gray-900/40 px-4 py-4 ${ok ? "border-green-900/60" : "border-gray-800"}`}>
      <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-light text-white">{value}</p>
        <p className={`text-[10px] font-mono ${ok ? "text-green-400" : "text-gray-600"}`}>
          {ok ? "\u2713" : `< ${threshold}`}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-white font-mono">{value}</span>
    </div>
  );
}
