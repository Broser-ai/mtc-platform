import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

async function loadStats() {
  const svc = await createClient();

  const [
    { count: depts },
    { count: masters },
    { count: skills },
    { count: bundles },
    { count: workflows },
    { count: composio },
    { count: horizon },
    { count: ecosystems },
    { count: executions },
  ] = await Promise.all([
    svc.from("departments").select("*", { count: "exact", head: true }),
    svc.from("masters").select("*", { count: "exact", head: true }),
    svc.from("agent_skills").select("*", { count: "exact", head: true }),
    svc.from("output_bundles").select("*", { count: "exact", head: true }),
    svc.from("workflows").select("*", { count: "exact", head: true }),
    svc.from("composio_toolkits").select("*", { count: "exact", head: true }),
    svc.from("horizon_templates").select("*", { count: "exact", head: true }),
    svc.from("ai_ecosystems").select("*", { count: "exact", head: true }),
    svc.from("executions").select("*", { count: "exact", head: true }),
  ]);

  return {
    departments: depts ?? 0,
    masters: masters ?? 0,
    skills: skills ?? 0,
    bundles: bundles ?? 0,
    workflows: workflows ?? 0,
    connectors: (composio ?? 0) + (horizon ?? 0),
    composio: composio ?? 0,
    horizon: horizon ?? 0,
    ecosystems: ecosystems ?? 0,
    executions: executions ?? 0,
  };
}

async function loadRecentExecutions() {
  const svc = await createClient();
  const { data: { user } } = await svc.auth.getUser();
  if (!user) return [];
  const { data } = await svc
    .from("executions")
    .select("id, brief, status, task_type, total_cost_usd, total_tokens, started_at")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(5);
  return data ?? [];
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [stats, recentExecutions] = await Promise.all([loadStats(), loadRecentExecutions()]);

  return (
    <div className="flex h-screen">
      <Sidebar stats={stats} />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-10">
          {/* Header */}
          <div className="mb-10">
            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Welcome back</p>
            <h1 className="text-3xl font-light text-white tracking-tight">
              {user.email?.split("@")[0] ?? "User"}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {stats.executions === 0
                ? "No executions yet \u2014 start with a brief or browse the catalog below."
                : `${stats.executions} executions so far. Your last brief is in the table below.`}
            </p>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
            <StatCard label="Departments" value={stats.departments} accent="indigo" href="/browse/departments" />
            <StatCard label="Masters"     value={stats.masters}     accent="violet" href="/browse/masters" />
            <StatCard label="Skills"      value={stats.skills}      accent="purple" href="/browse/skills" />
            <StatCard label="Bundles"     value={stats.bundles}     accent="fuchsia" href="/browse/bundles" />
            <StatCard label="Workflows"   value={stats.workflows}   accent="pink" href="/browse/workflows" />
            <StatCard label="Connectors"  value={stats.connectors}  accent="rose" href="/browse/connectors" />
          </div>

          {/* Quick start */}
          <div className="mb-10">
            <h2 className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">Quick start</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ActionCard
                href="/chat"
                title="Start a brief"
                desc="Describe a task, MTC selects a 3-master squad and runs it through the synthesis_after_parallel pattern."
                cta="Open chat \u2192"
                accent="indigo"
              />
              <ActionCard
                href="/projects"
                title="New project"
                desc="Use the project intake wizard. Pick output bundles (33), autonomy level (0-5), region, and data sensitivity."
                cta="Open intake \u2192"
                accent="purple"
              />
            </div>
          </div>

          {/* Recent executions */}
          {recentExecutions.length > 0 && (
            <div className="mb-10">
              <h2 className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">Recent executions</h2>
              <div className="rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900/60 border-b border-gray-800">
                    <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500">
                      <th className="px-4 py-2.5">Brief</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Cost</th>
                      <th className="px-4 py-2.5 text-right">Tokens</th>
                      <th className="px-4 py-2.5">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentExecutions.map((e) => (
                      <tr key={e.id} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                        <td className="px-4 py-3 text-gray-200 max-w-md truncate">{e.brief ?? "\u2014"}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs uppercase tracking-wider">{e.task_type ?? "\u2014"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
                            e.status === "completed" ? "bg-green-950/40 text-green-400 border border-green-900" :
                            e.status === "running"   ? "bg-yellow-950/40 text-yellow-400 border border-yellow-900" :
                            "bg-gray-800 text-gray-400 border border-gray-700"
                          }`}>
                            {e.status ?? "pending"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400 font-mono text-xs">${Number(e.total_cost_usd ?? 0).toFixed(4)}</td>
                        <td className="px-4 py-3 text-right text-gray-400 font-mono text-xs">{e.total_tokens ?? 0}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{e.started_at ? new Date(e.started_at).toLocaleString("da-DK") : "\u2014"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Infrastructure status */}
          <div className="mb-10">
            <h2 className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">Infrastructure</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InfraCard label="AI Ecosystems" value={stats.ecosystems} sub="Frontier/Asian/EU sovereign" />
              <InfraCard label="Composio Toolkits" value={stats.composio} sub="500+ external apps cached" />
              <InfraCard label="Horizon Templates" value={stats.horizon} sub="MCP server templates" />
              <InfraCard label="Execution Patterns" value={8} sub="single/parallel/debate/handoff/synthesis" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, accent, href }: { label: string; value: number; accent: string; href: string }) {
  const colors: Record<string, string> = {
    indigo:  "text-indigo-400 border-indigo-900/60 hover:border-indigo-700",
    violet:  "text-violet-400 border-violet-900/60 hover:border-violet-700",
    purple:  "text-purple-400 border-purple-900/60 hover:border-purple-700",
    fuchsia: "text-fuchsia-400 border-fuchsia-900/60 hover:border-fuchsia-700",
    pink:    "text-pink-400 border-pink-900/60 hover:border-pink-700",
    rose:    "text-rose-400 border-rose-900/60 hover:border-rose-700",
  };
  return (
    <Link href={href} className={`block rounded-xl border bg-gray-900/40 px-4 py-4 transition-colors ${colors[accent]}`}>
      <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">{label}</p>
      <p className="text-2xl font-light text-white">{value}</p>
    </Link>
  );
}

function ActionCard({ href, title, desc, cta, accent }: { href: string; title: string; desc: string; cta: string; accent: string }) {
  const colors: Record<string, string> = {
    indigo: "border-indigo-900/60 hover:border-indigo-600 hover:bg-indigo-950/30",
    purple: "border-purple-900/60 hover:border-purple-600 hover:bg-purple-950/30",
  };
  return (
    <Link href={href} className={`group block rounded-xl border bg-gray-900/40 p-5 transition-all ${colors[accent]}`}>
      <p className="text-base font-medium text-white mb-1">{title}</p>
      <p className="text-xs text-gray-400 leading-relaxed mb-3">{desc}</p>
      <p className="text-xs text-indigo-400 group-hover:text-indigo-300">{cta}</p>
    </Link>
  );
}

function InfraCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3">
      <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">{label}</p>
      <p className="text-xl font-light text-white">{value}</p>
      <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>
    </div>
  );
}
