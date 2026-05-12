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

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const stats = await loadStats();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const { data: enabledToolkits } = await supabase
    .from("user_composio_toolkits")
    .select("toolkit_slug, enabled_at, composio_toolkits(name, category)")
    .eq("user_id", user.id);
  const { data: customMcps } = await supabase
    .from("custom_mcp_servers")
    .select("id, name, description, status, horizon_deployment_url, created_at")
    .eq("user_id", user.id);

  return (
    <div className="flex h-screen">
      <Sidebar stats={stats} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-10">
          <div className="mb-8">
            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Settings</p>
            <h1 className="text-3xl font-light text-white tracking-tight mb-1">Account & integrations</h1>
          </div>

          {/* Account */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 mb-4">
            <h2 className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">Account</h2>
            <div className="space-y-1.5 text-sm">
              <Row label="Email" value={user.email ?? "\u2014"} />
              <Row label="Full name" value={profile?.full_name ?? "\u2014"} />
              <Row label="Tier" value={profile?.tier ?? "Bronze"} />
              <Row label="User ID" value={user.id} mono />
            </div>
          </div>

          {/* Composio toolkits */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10px] uppercase tracking-widest text-gray-600">Enabled Composio toolkits</h2>
              <span className="text-[10px] text-gray-600">{(enabledToolkits?.length ?? 0)} / {stats.connectors} available</span>
            </div>
            {(enabledToolkits?.length ?? 0) === 0 ? (
              <p className="text-xs text-gray-500">No toolkits enabled yet. Browse the connectors page to activate.</p>
            ) : (
              <div className="space-y-1.5">
                {enabledToolkits!.map((t: any) => (
                  <div key={t.toolkit_slug} className="flex items-center justify-between text-xs">
                    <span className="text-gray-300">{t.composio_toolkits?.name ?? t.toolkit_slug}</span>
                    <span className="text-gray-600">{t.composio_toolkits?.category}</span>
                  </div>
                ))}
              </div>
            )}
            <a href="/browse/connectors" className="mt-3 inline-block text-xs text-indigo-400 hover:text-indigo-300">
              Browse all connectors \u2192
            </a>
          </div>

          {/* Custom MCPs */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 mb-4">
            <h2 className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">Custom MCP servers (Horizon)</h2>
            {(customMcps?.length ?? 0) === 0 ? (
              <p className="text-xs text-gray-500">No custom MCP servers yet. Use the Connector Builder workflow to create one.</p>
            ) : (
              <div className="space-y-2">
                {customMcps!.map((m: any) => (
                  <div key={m.id} className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                    <p className="text-sm text-white">{m.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{m.description}</p>
                    {m.horizon_deployment_url && (
                      <p className="text-[10px] font-mono text-indigo-400 mt-1">{m.horizon_deployment_url}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sign out */}
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-xs text-red-400 hover:text-red-300">Sign out \u2192</button>
          </form>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`text-gray-200 ${mono ? "font-mono text-[11px]" : ""}`}>{value}</span>
    </div>
  );
}
