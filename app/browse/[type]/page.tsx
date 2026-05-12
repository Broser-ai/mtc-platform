import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import Link from "next/link";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["departments", "masters", "skills", "bundles", "workflows", "connectors"] as const;
type BrowseType = typeof VALID_TYPES[number];

const TYPE_META: Record<BrowseType, { title: string; subtitle: string; accent: string }> = {
  departments: { title: "Departments", subtitle: "94 knowledge graphs across 10 tiers", accent: "indigo" },
  masters:     { title: "Masters",     subtitle: "134 thought leaders, framework authors and elite tools", accent: "violet" },
  skills:      { title: "Skills",      subtitle: "124 invocable methodologies with SKILL.md body", accent: "purple" },
  bundles:     { title: "Output Bundles", subtitle: "33 productized deliverable packs", accent: "fuchsia" },
  workflows:   { title: "Workflows",   subtitle: "19 standard execution flows through Universal Execution Engine", accent: "pink" },
  connectors:  { title: "Connectors",  subtitle: "54 Composio toolkits + 10 Horizon templates + 58 AI ecosystems", accent: "rose" },
};

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

export default async function BrowsePage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const { type } = await params;
  const { q, filter } = await searchParams;

  if (!VALID_TYPES.includes(type as BrowseType)) notFound();
  const browseType = type as BrowseType;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const stats = await loadStats();
  const meta = TYPE_META[browseType];

  return (
    <div className="flex h-screen">
      <Sidebar stats={stats} />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-8 py-10">
          {/* Header */}
          <div className="mb-8">
            <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-1">Browse Catalog</p>
            <h1 className="text-3xl font-light text-white tracking-tight mb-1">{meta.title}</h1>
            <p className="text-sm text-gray-500">{meta.subtitle}</p>
          </div>

          {/* Search bar */}
          <form className="mb-6 flex gap-3" action={`/browse/${browseType}`} method="get">
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder={`Search ${meta.title.toLowerCase()}\u2026`}
              className="flex-1 rounded-lg border border-gray-800 bg-gray-900/60 px-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-indigo-500 focus:outline-none"
            />
            <button type="submit" className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500">
              Search
            </button>
          </form>

          {/* Content per type */}
          {browseType === "departments" && <DepartmentsList q={q} />}
          {browseType === "masters"     && <MastersList q={q} filter={filter} />}
          {browseType === "skills"      && <SkillsList q={q} filter={filter} />}
          {browseType === "bundles"     && <BundlesList q={q} />}
          {browseType === "workflows"   && <WorkflowsList q={q} />}
          {browseType === "connectors"  && <ConnectorsList q={q} filter={filter} />}
        </div>
      </main>
    </div>
  );
}

/* ============== Per-type list components ============== */

async function DepartmentsList({ q }: { q?: string }) {
  const svc = await createClient();
  let query = svc.from("departments").select("id, name, tier, tier_name, scope, description").order("display_order");
  if (q) query = query.or(`name.ilike.%${q}%,scope.ilike.%${q}%,description.ilike.%${q}%`);
  const { data: depts } = await query;

  // Get master counts per dept
  const { data: masterCounts } = await svc
    .from("masters")
    .select("department_id")
    .order("department_id");
  const countMap = new Map<string, number>();
  (masterCounts ?? []).forEach((m: any) => {
    if (m.department_id) countMap.set(m.department_id, (countMap.get(m.department_id) ?? 0) + 1);
  });

  if (!depts?.length) return <Empty msg="No departments match your search" />;

  // Group by tier
  const tiers = new Map<number, typeof depts>();
  depts.forEach(d => {
    if (!tiers.has(d.tier)) tiers.set(d.tier, [] as any);
    tiers.get(d.tier)!.push(d);
  });

  return (
    <div className="space-y-8">
      {Array.from(tiers.entries()).sort(([a], [b]) => a - b).map(([tier, ds]) => (
        <div key={tier}>
          <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-3">
            Tier {tier} \u00b7 {ds[0]?.tier_name ?? ""}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {ds.map((d: any) => (
              <div key={d.id} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 hover:border-indigo-700 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-medium text-white">{d.name}</p>
                  <span className="text-[10px] font-mono text-indigo-400">{countMap.get(d.id) ?? 0} masters</span>
                </div>
                {d.scope && <p className="text-xs text-gray-500 mb-2">{d.scope}</p>}
                {d.description && <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{d.description}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

async function MastersList({ q, filter }: { q?: string; filter?: string }) {
  const svc = await createClient();
  let query = svc
    .from("masters")
    .select("id, name, affiliation, authority, bio, department_id, default_gateway")
    .order("display_order");
  if (q) query = query.or(`name.ilike.%${q}%,affiliation.ilike.%${q}%,authority.ilike.%${q}%,bio.ilike.%${q}%`);
  if (filter) query = query.eq("department_id", filter);
  const { data: masters } = await query;

  const { data: depts } = await svc.from("departments").select("id, name").order("display_order");
  const deptMap = new Map((depts ?? []).map((d: any) => [d.id, d.name]));

  if (!masters?.length) return <Empty msg="No masters match your search" />;

  return (
    <>
      {/* Filter chips */}
      {!filter && depts && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          {depts.slice(0, 20).map((d: any) => (
            <Link
              key={d.id}
              href={`/browse/masters?filter=${d.id}${q ? `&q=${q}` : ""}`}
              className="rounded-full border border-gray-800 bg-gray-900/40 px-2.5 py-1 text-[10px] text-gray-400 hover:border-indigo-600 hover:text-white"
            >
              {d.name}
            </Link>
          ))}
        </div>
      )}
      {filter && (
        <div className="mb-6">
          <Link href="/browse/masters" className="text-xs text-indigo-400 hover:text-indigo-300">\u2190 All departments</Link>
          <p className="text-sm text-white mt-1">Filtered: {deptMap.get(filter) ?? filter}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {masters.map((m: any) => (
          <div key={m.id} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 hover:border-violet-700 transition-colors">
            <p className="text-sm font-medium text-white mb-0.5">{m.name}</p>
            <p className="text-[11px] text-violet-400 mb-2">{m.affiliation ?? "\u2014"}</p>
            {m.authority && <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">{m.authority}</p>}
            <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{m.bio ?? ""}</p>
            <div className="mt-3 flex items-center justify-between text-[10px]">
              <span className="text-gray-600">{deptMap.get(m.department_id) ?? ""}</span>
              <span className="font-mono text-gray-700">{m.default_gateway?.split("/").pop() ?? ""}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

async function SkillsList({ q, filter }: { q?: string; filter?: string }) {
  const svc = await createClient();
  let query = svc
    .from("agent_skills")
    .select("id, name, description, category, provider, quality_tier, body")
    .order("display_order");
  if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%,category.ilike.%${q}%`);
  if (filter) query = query.eq("category", filter);
  const { data: skills } = await query;

  // Categories for filter
  const { data: cats } = await svc.from("agent_skills").select("category");
  const categorySet = new Set<string>();
  (cats ?? []).forEach((c: any) => c.category && categorySet.add(c.category));
  const categories = Array.from(categorySet).sort();

  if (!skills?.length) return <Empty msg="No skills match your search" />;

  return (
    <>
      {!filter && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          {categories.map(c => (
            <Link
              key={c}
              href={`/browse/skills?filter=${c}${q ? `&q=${q}` : ""}`}
              className="rounded-full border border-gray-800 bg-gray-900/40 px-2.5 py-1 text-[10px] text-gray-400 hover:border-purple-600 hover:text-white"
            >
              {c}
            </Link>
          ))}
        </div>
      )}
      {filter && (
        <div className="mb-6">
          <Link href="/browse/skills" className="text-xs text-indigo-400 hover:text-indigo-300">\u2190 All categories</Link>
          <p className="text-sm text-white mt-1">Category: {filter}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {skills.map((s: any) => (
          <div key={s.id} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 hover:border-purple-700 transition-colors">
            <div className="flex items-start justify-between mb-1">
              <p className="text-sm font-medium text-white">{s.name}</p>
              <span className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded ${
                s.quality_tier === "premium" ? "bg-yellow-950/40 text-yellow-400 border border-yellow-900" :
                "bg-gray-800 text-gray-500 border border-gray-700"
              }`}>
                {s.quality_tier ?? "standard"}
              </span>
            </div>
            <p className="text-[11px] text-purple-400 mb-2">{s.category} \u00b7 {s.provider}</p>
            <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 mb-2">{s.description}</p>
            {s.body && (
              <p className="text-[10px] text-green-400">\u25cf SKILL.md body loaded ({s.body.length} chars)</p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

async function BundlesList({ q }: { q?: string }) {
  const svc = await createClient();
  let query = svc.from("output_bundles").select("id, name, description, components").order("display_order");
  if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
  const { data: bundles } = await query;
  if (!bundles?.length) return <Empty msg="No bundles found" />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {bundles.map((b: any) => (
        <div key={b.id} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 hover:border-fuchsia-700 transition-colors">
          <p className="text-sm font-medium text-white mb-1">{b.name}</p>
          <p className="text-xs text-gray-500 leading-relaxed mb-3">{b.description}</p>
          {Array.isArray(b.components) && (
            <div className="flex flex-wrap gap-1">
              {b.components.slice(0, 6).map((c: string) => (
                <span key={c} className="text-[10px] font-mono text-fuchsia-400 bg-fuchsia-950/30 border border-fuchsia-900/60 px-1.5 py-0.5 rounded">
                  {c}
                </span>
              ))}
              {b.components.length > 6 && (
                <span className="text-[10px] text-gray-600">+{b.components.length - 6}</span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

async function WorkflowsList({ q }: { q?: string }) {
  const svc = await createClient();
  let query = svc.from("workflows").select("id, name, description, steps").order("display_order");
  if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
  const { data: workflows } = await query;
  if (!workflows?.length) return <Empty msg="No workflows found" />;
  return (
    <div className="space-y-3">
      {workflows.map((w: any) => (
        <div key={w.id} className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 hover:border-pink-700 transition-colors">
          <p className="text-sm font-medium text-white mb-1">{w.name}</p>
          <p className="text-xs text-gray-500 leading-relaxed mb-3">{w.description}</p>
          {Array.isArray(w.steps) && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
              {w.steps.map((step: string, i: number) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className="text-pink-400 bg-pink-950/30 border border-pink-900/60 px-2 py-0.5 rounded">{step}</span>
                  {i < w.steps.length - 1 && <span className="text-gray-700">\u2192</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

async function ConnectorsList({ q, filter }: { q?: string; filter?: string }) {
  const svc = await createClient();
  const tab = filter ?? "composio";

  if (tab === "composio") {
    let query = svc.from("composio_toolkits").select("slug, name, category, description, auth_type, is_popular");
    if (q) query = query.or(`name.ilike.%${q}%,category.ilike.%${q}%`);
    const { data: toolkits } = await query;

    return (
      <>
        <ConnectorTabs current="composio" q={q} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(toolkits ?? []).map((t: any) => (
            <div key={t.slug} className="rounded-xl border border-gray-800 bg-gray-900/40 p-3 hover:border-rose-700 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-white">{t.name}</p>
                {t.is_popular && <span className="text-[9px] text-yellow-400">\u2605</span>}
              </div>
              <p className="text-[11px] text-rose-400 mb-1">{t.category}</p>
              <p className="text-[10px] text-gray-600">auth: {t.auth_type ?? "\u2014"}</p>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (tab === "horizon") {
    let query = svc.from("horizon_templates").select("id, name, description, category, auth_type, capabilities");
    if (q) query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
    const { data: templates } = await query;

    return (
      <>
        <ConnectorTabs current="horizon" q={q} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(templates ?? []).map((t: any) => (
            <div key={t.id} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 hover:border-rose-700 transition-colors">
              <p className="text-sm font-medium text-white mb-1">{t.name}</p>
              <p className="text-[11px] text-rose-400 mb-2">{t.category}</p>
              <p className="text-xs text-gray-500 leading-relaxed mb-2">{t.description}</p>
              {Array.isArray(t.capabilities) && (
                <div className="flex flex-wrap gap-1">
                  {t.capabilities.slice(0, 5).map((c: string, i: number) => (
                    <span key={i} className="text-[10px] font-mono text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded">{c}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </>
    );
  }

  // ecosystems tab
  let query = svc.from("ai_ecosystems").select("id, name, role, modalities, openrouter_model_string, display_color").order("display_order");
  if (q) query = query.or(`name.ilike.%${q}%,role.ilike.%${q}%`);
  const { data: ecosystems } = await query;

  return (
    <>
      <ConnectorTabs current="ecosystems" q={q} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {(ecosystems ?? []).map((e: any) => (
          <div key={e.id} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 hover:border-rose-700 transition-colors">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-white">{e.name}</p>
              <span style={{ background: e.display_color ?? "#666" }} className="h-2 w-2 rounded-full" />
            </div>
            <p className="text-[11px] text-rose-400 mb-1">{e.role}</p>
            <p className="text-[10px] text-gray-600 mb-1">{e.modalities}</p>
            {e.openrouter_model_string && (
              <p className="text-[10px] font-mono text-gray-700 truncate">{e.openrouter_model_string}</p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function ConnectorTabs({ current, q }: { current: string; q?: string }) {
  const tabs = [
    { id: "composio",   label: "Composio (54)" },
    { id: "horizon",    label: "Horizon (10)" },
    { id: "ecosystems", label: "AI Ecosystems (58)" },
  ];
  return (
    <div className="flex gap-1 mb-6 border-b border-gray-800">
      {tabs.map(t => (
        <Link
          key={t.id}
          href={`/browse/connectors?filter=${t.id}${q ? `&q=${q}` : ""}`}
          className={`px-4 py-2 text-xs border-b-2 transition-colors ${
            current === t.id
              ? "border-rose-500 text-white"
              : "border-transparent text-gray-500 hover:text-gray-300"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-12 text-center">
      <p className="text-sm text-gray-500">{msg}</p>
    </div>
  );
}
