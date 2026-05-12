import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { ProjectIntakeWizard } from "@/components/ProjectIntakeWizard";

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

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const stats = await loadStats();
  const { data: bundles } = await supabase
    .from("output_bundles")
    .select("id, name, description")
    .order("display_order");
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, description, status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="flex h-screen">
      <Sidebar stats={stats} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-10">
          <div className="mb-8">
            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Project Intake</p>
            <h1 className="text-3xl font-light text-white tracking-tight mb-1">Projects</h1>
            <p className="text-sm text-gray-500">
              Define a project execution contract \u2014 brief, output bundles, autonomy level, region, sensitivity.
            </p>
          </div>

          <ProjectIntakeWizard bundles={bundles ?? []} userId={user.id} />

          {projects && projects.length > 0 && (
            <div className="mt-10">
              <h2 className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">Recent projects</h2>
              <div className="space-y-2">
                {projects.map(p => (
                  <div key={p.id} className="rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{p.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{p.description ?? "\u2014"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-indigo-400">{p.status}</p>
                      <p className="text-[10px] text-gray-600 mt-0.5">{new Date(p.created_at).toLocaleDateString("da-DK")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
