"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const PROJECT_TYPES = [
  { id: "new_project",        label: "Start nyt projekt",       desc: "Begynd fra brief \u2014 squad-build, output-bundles, fuld execution" },
  { id: "existing_project",   label: "Forbedr eksisterende projekt", desc: "Importer repo/site/docs/data \u2014 audit + benchmark + gap-plan + execute fixes" },
  { id: "company_upgrade",    label: "Opgrader firma",          desc: "Hele firmaet gennem motoren \u2014 alle depts koordineret" },
  { id: "autonomous_operator",label: "K\u00f8r drift/autopilot", desc: "Live operator-mode \u2014 kontinuerlig drift med approval gates" },
  { id: "vertical_product",   label: "Byg vertical-produkt",    desc: "Lav SaaS/license/white-label fra dept" },
  { id: "research_only",      label: "Kun research",            desc: "Ingen execution \u2014 kun analysis + anbefalinger" },
];

const AUTONOMY = [
  { level: 0, name: "R\u00e5dgivning",        color: "#6E6E6E", desc: "Kun analyse og anbefalinger. Ingen handling." },
  { level: 1, name: "Kladder",                color: "#7B6BCF", desc: "AI laver kladder. Du gennemg\u00e5r alt f\u00f8r noget bruges." },
  { level: 2, name: "Klar til handling",      color: "#3FA4B8", desc: "AI laver f\u00e6rdige outputs. Du godkender f\u00f8r hver handling." },
  { level: 3, name: "K\u00f8r med godkendelse", color: "#3B7A57", desc: "AI eksekverer rutinem\u00e6ssigt. Approval gates ved publish/deploy/send/submit.", isDefault: true },
  { level: 4, name: "N\u00e6sten automatisk", color: "#F97E19", desc: "AI eksekverer det meste. Approval kun p\u00e5 kritiske beslutninger." },
  { level: 5, name: "Fuld automation",        color: "#C7756B", desc: "AI handler selvst\u00e6ndigt. Logger til review. Brug kun p\u00e5 lavrisiko-flows." },
];

const SENSITIVITY = [
  { id: "public",       label: "Public" },
  { id: "internal",     label: "Internal", isDefault: true },
  { id: "confidential", label: "Confidential" },
  { id: "regulated",    label: "Regulated (GDPR/HIPAA)" },
];

export function ProjectIntakeWizard({
  bundles,
  userId,
}: {
  bundles: { id: string; name: string; description: string | null }[];
  userId: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [type, setType] = useState("new_project");
  const [selectedBundles, setSelectedBundles] = useState<string[]>([]);
  const [autonomy, setAutonomy] = useState(3);
  const [region, setRegion] = useState("EU");
  const [sensitivity, setSensitivity] = useState("internal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleBundle(id: string) {
    setSelectedBundles(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const sb = createClient();
      const { data: project, error: projErr } = await sb
        .from("projects")
        .insert({
          user_id: userId,
          name,
          description: brief,
          status: "planning",
          metadata: { project_type: type, region, sensitivity, autonomy_level: autonomy },
        })
        .select()
        .single();
      if (projErr) throw projErr;

      const contract = {
        project_id: project.id,
        project_name: name,
        project_type: type,
        selected_outputs: selectedBundles,
        autonomy_level: autonomy,
        preferred_region: region,
        data_sensitivity: sensitivity,
        artifact_search_required: true,
        mcp_execution_enabled: autonomy >= 3,
        connector_building_enabled: true,
        approval_required_for: deriveApprovals(autonomy),
        brief,
        schema_version: "1.1",
      };

      const { error: ctxErr } = await sb.from("project_contracts").insert({
        project_id: project.id,
        contract_data: contract,
        is_active: true,
        version: 1,
      });
      if (ctxErr) throw ctxErr;

      router.refresh();
      router.push(`/chat?project=${project.id}`);
    } catch (e: any) {
      setError(e.message ?? "Failed to create project");
      setSaving(false);
    }
  }

  function deriveApprovals(level: number): string[] {
    if (level >= 5) return [];
    if (level === 4) return ["spend_money", "send_legal", "submit_application", "activate_insurance"];
    if (level === 3) return ["publish", "deploy", "send_external", "submit_application", "submit_tender", "spend_money", "connect_live_api", "activate_insurance", "send_legal"];
    return ["publish", "deploy", "send_external", "submit_application", "submit_tender", "spend_money", "connect_live_api", "activate_insurance", "change_prices", "send_legal"];
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-6">
      {/* Progress bar */}
      <div className="flex gap-2 mb-6">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${s <= step ? "bg-indigo-500" : "bg-gray-800"}`} />
        ))}
      </div>

      {step === 1 && (
        <div>
          <h3 className="text-base font-medium text-white mb-1">1 \u00b7 Brief & Type</h3>
          <p className="text-xs text-gray-500 mb-4">Hvad skal projektet hedde, og hvad handler det om?</p>

          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Project name"
            className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-indigo-500 focus:outline-none mb-3"
          />
          <textarea
            value={brief}
            onChange={e => setBrief(e.target.value)}
            placeholder="Brief \u2014 hvad skal bygges?"
            rows={4}
            className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-indigo-500 focus:outline-none mb-4 resize-y"
          />

          <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Project type</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-6">
            {PROJECT_TYPES.map(t => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  type === t.id ? "border-indigo-500 bg-indigo-950/30" : "border-gray-800 bg-gray-900/40 hover:border-gray-600"
                }`}
              >
                <p className="text-sm font-medium text-white mb-0.5">{t.label}</p>
                <p className="text-[11px] text-gray-500 leading-relaxed">{t.desc}</p>
              </button>
            ))}
          </div>

          <button
            onClick={() => setStep(2)}
            disabled={!name}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-600"
          >
            N\u00e6ste \u2192 Output Bundles
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h3 className="text-base font-medium text-white mb-1">2 \u00b7 Output Bundles</h3>
          <p className="text-xs text-gray-500 mb-4">V\u00e6lg hvilke outputs projektet skal producere ({selectedBundles.length} valgt af {bundles.length})</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-96 overflow-y-auto mb-4 pr-1">
            {bundles.map(b => (
              <button
                key={b.id}
                onClick={() => toggleBundle(b.id)}
                className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                  selectedBundles.includes(b.id) ? "border-indigo-500 bg-indigo-950/30" : "border-gray-800 bg-gray-900/40 hover:border-gray-600"
                }`}
              >
                <p className="text-xs font-medium text-white mb-0.5">{b.name}</p>
                <p className="text-[10px] text-gray-500 leading-relaxed line-clamp-2">{b.description}</p>
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:bg-gray-800/60">
              \u2190 Tilbage
            </button>
            <button onClick={() => setStep(3)} disabled={selectedBundles.length === 0} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-600">
              N\u00e6ste \u2192 Autonomi
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h3 className="text-base font-medium text-white mb-1">3 \u00b7 Autonomi & Privacy</h3>
          <p className="text-xs text-gray-500 mb-4">Hvor selvst\u00e6ndigt skal AI handle, og hvor f\u00f8lsom er data?</p>

          <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Autonomy level (0-5)</p>
          <div className="space-y-2 mb-5">
            {AUTONOMY.map(l => (
              <button
                key={l.level}
                onClick={() => setAutonomy(l.level)}
                className={`w-full text-left rounded-lg border px-3 py-2.5 flex items-center gap-3 transition-colors ${
                  autonomy === l.level ? "border-indigo-500 bg-indigo-950/30" : "border-gray-800 bg-gray-900/40 hover:border-gray-600"
                }`}
              >
                <div
                  style={{ background: autonomy === l.level ? l.color : "transparent", borderColor: l.color }}
                  className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-medium text-white shrink-0"
                >
                  {l.level}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{l.name} {l.isDefault && <span className="text-[10px] text-gray-500 ml-1">(default)</span>}</p>
                  <p className="text-[11px] text-gray-500 leading-relaxed">{l.desc}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Region</p>
              <select value={region} onChange={e => setRegion(e.target.value)} className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white">
                <option value="EU">EU</option>
                <option value="US">US</option>
                <option value="UK">UK</option>
                <option value="ASIA">Asia</option>
                <option value="GLOBAL">Global</option>
              </select>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Data sensitivity</p>
              <select value={sensitivity} onChange={e => setSensitivity(e.target.value)} className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white">
                {SENSITIVITY.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:bg-gray-800/60">\u2190 Tilbage</button>
            <button onClick={() => setStep(4)} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500">N\u00e6ste \u2192 Review</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <h3 className="text-base font-medium text-white mb-1">4 \u00b7 Review Execution Contract</h3>
          <p className="text-xs text-gray-500 mb-4">Bekr\u00e6ft kontrakten og opret projektet.</p>

          <div className="rounded-lg border border-gray-800 bg-gray-950 p-4 mb-4 max-h-96 overflow-y-auto">
            <pre className="text-[11px] font-mono text-gray-400 whitespace-pre-wrap">
{JSON.stringify({
  project_name: name,
  project_type: type,
  brief,
  selected_outputs: selectedBundles,
  autonomy_level: autonomy,
  preferred_region: region,
  data_sensitivity: sensitivity,
  approval_required_for: deriveApprovals(autonomy),
  schema_version: "1.1",
}, null, 2)}
            </pre>
          </div>

          {error && (
            <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 mb-3 text-xs text-red-400">{error}</div>
          )}

          <div className="flex gap-2">
            <button onClick={() => setStep(3)} disabled={saving} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:bg-gray-800/60">\u2190 Tilbage</button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-lg bg-green-700 px-5 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:bg-gray-800 disabled:text-gray-600"
            >
              {saving ? "Creating\u2026" : "\u2713 Create project"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
