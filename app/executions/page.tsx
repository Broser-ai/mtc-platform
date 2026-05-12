import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

async function loadStats() {
  const svc = await createClient();
  const [d, m, s, b, w, c, h] = await Promise.all([
    svc.from("departments").select("*", { count: "exact", head: true }),
    svc.from("masters").select("*", { count: "exact", head: true }),
    svc.from("agent_skills").select("*", { count: "exact", head: true }),
    svc.from("output_bundles").select("*", { count: "exact", head: true }),
    svc.from("workflows").select("*", { count: "exact", head: true }),
    svc.from("composio_toolkits").select("*", { count: "exact", head: true }),
    svc.from("horizon_templates").select("*", { count: "exact", head: true }),
  ]);
  return {
    departments: d.count ?? 0, masters: m.count ?? 0, skills: s.count ?? 0,
    bundles: b.count ?? 0, workflows: w.count ?? 0,
    connectors: (c.count ?? 0) + (h.count ?? 0),
  };
}

export default async function ExecutionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const stats = await loadStats();

  const { data: executions } = await supabase
    .from("executions")
    .select("id, brief, status, task_type, pattern_id, squad_master_ids, total_cost_usd, total_tokens, started_at, completed_at, approval_status")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(50);

  return (
    <div className="flex h-screen">
      <Sidebar stats={stats} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-10">
          <div className="mb-8">
            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">History</p>
            <h1 className="text-3xl font-light text-white tracking-tight mb-1">Executions</h1>
            <p className="text-sm text-gray-500">
              {(executions?.length ?? 0) === 0
                ? "No executions yet. Send a brief in /chat to create the first one."
                : `${executions!.length} most recent runs`}
            </p>
          </div>

          {executions && executions.length > 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-900/60 border-b border-gray-800">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-2.5">Brief</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Pattern</th>
                    <th className="px-4 py-2.5">Squad</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Cost</th>
                    <th className="px-4 py-2.5 text-right">Tokens</th>
                    <th className="px-4 py-2.5">When</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map(e => (
                    <tr key={e.id} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                      <td className="px-4 py-3 text-gray-200 max-w-xs truncate">{e.brief ?? "\u2014"}</td>
                      <td className="px-4 py-3 text-gray-400 text-[10px] uppercase tracking-wider">{e.task_type ?? "\u2014"}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs font-mono">{e.pattern_id ?? "\u2014"}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{Array.isArray(e.squad_master_ids) ? e.squad_master_ids.length : 0}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
                          e.status === "completed" ? "bg-green-950/40 text-green-400 border border-green-900" :
                          e.status === "running"   ? "bg-yellow-950/40 text-yellow-400 border border-yellow-900" :
                          e.status === "error"     ? "bg-red-950/40 text-red-400 border border-red-900" :
                          "bg-gray-800 text-gray-400 border border-gray-700"
                        }`}>{e.status ?? "pending"}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400 font-mono text-xs">${Number(e.total_cost_usd ?? 0).toFixed(4)}</td>
                      <td className="px-4 py-3 text-right text-gray-400 font-mono text-xs">{e.total_tokens ?? 0}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{e.started_at ? new Date(e.started_at).toLocaleString("da-DK") : "\u2014"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-12 text-center">
              <p className="text-sm text-gray-500 mb-4">No executions yet</p>
              <a href="/chat" className="inline-block rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500">
                Send your first brief \u2192
              </a>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
