import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { callOpenRouter } from "@/lib/ai/openrouter";
import { MTC_BOT_SYSTEM_PROMPT, SYNTHESIS_PROMPT } from "@/lib/ai/mtc-bot-prompt";
import { logAuditEntry } from "@/lib/audit";

export const maxDuration = 120;

// ── Types ────────────────────────────────────────────────────
interface DeptRow { id: string; name: string; description: string | null; tier_name: string | null }
interface MasterRow { id: string; department_id: string; name: string; affiliation: string | null; bio: string | null; default_gateway: string | null }
interface EcosystemRow { id: string; name: string; openrouter_model_string: string }

interface SquadMember {
  master_id: string;
  master_name: string;
  department: string;
  gateway: string;
  model: string;
  role_in_brief: string;
}

export interface BotPlan {
  task_type: string;
  selected_departments: Array<{ id: string; name: string; reason: string }>;
  squad: SquadMember[];
  pattern: string;
  estimated_tokens_per_call: number;
  estimated_cost_usd: number;
  risk_class: string;
  plan_summary: string;
  expert_prompts: Record<string, string>;
}

interface ExpertResult {
  master_id: string;
  master_name: string;
  output: string;
  cost_usd: number;
  tokens: number;
  latency_ms: number;
  model: string;
  ok: boolean;
}

// ── Phase 1: Plan ────────────────────────────────────────────
async function phase1Plan(
  brief: string,
  departments: DeptRow[],
  masters: MasterRow[],
  ecosystemMap: Map<string, string>
) {
  // Limit context to avoid huge prompts — take first 30 depts and their masters
  const relevantDepts = departments.slice(0, 30);
  const relevantDeptIds = new Set(relevantDepts.map(d => d.id));
  const relevantMasters = masters.filter(m => relevantDeptIds.has(m.department_id)).slice(0, 60);

  const deptContext = relevantDepts.map(d =>
    `"${d.id}" — ${d.name} (${d.tier_name ?? ""}): ${d.description ?? ""}`
  ).join("\n");

  const masterContext = relevantMasters.map(m => {
    const model = ecosystemMap.get(m.default_gateway ?? "") ?? "anthropic/claude-opus-4";
    return `"${m.id}" (dept: ${m.department_id}): ${m.name}, ${m.affiliation ?? ""}. Model: ${model}`;
  }).join("\n");

  const response = await callOpenRouter(
    "anthropic/claude-opus-4",
    [
      { role: "system", content: MTC_BOT_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Brief: ${brief}\n\nTilgængelige departments (udvalg):\n${deptContext}\n\nTilgængelige masters:\n${masterContext}`,
      },
    ],
    1200
  );

  let raw = response.content.trim();
  if (raw.startsWith("```")) raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  return {
    plan: JSON.parse(raw) as BotPlan,
    usage: response.usage,
    cost_usd: response.cost_usd,
    latency_ms: response.latency_ms,
  };
}

// ── Phase 3: Execute (parallel expert calls) ─────────────────
async function phase3Execute(
  plan: BotPlan,
  masters: MasterRow[],
  ecosystemMap: Map<string, string>,
  executionId: string,
  userId: string
): Promise<ExpertResult[]> {
  const masterMap = new Map(masters.map(m => [m.id, m]));

  const calls = plan.squad.map(async (squadMember) => {
    const master = masterMap.get(squadMember.master_id);
    const model = master
      ? (ecosystemMap.get(master.default_gateway ?? "") ?? squadMember.model ?? "anthropic/claude-opus-4")
      : (squadMember.model ?? "anthropic/claude-opus-4");

    const expertPrompt = plan.expert_prompts[squadMember.master_id]
      ?? `As ${squadMember.master_name}, provide your expert analysis on: ${plan.plan_summary}`;

    try {
      const result = await callOpenRouter(
        model,
        [
          {
            role: "system",
            content: `You are ${squadMember.master_name}${master?.affiliation ? ` (${master.affiliation})` : ""}. ${master?.bio ?? ""}\n\nProvide expert analysis based on your background and specialization.`,
          },
          { role: "user", content: expertPrompt },
        ],
        1500
      );

      await logAuditEntry({
        user_id: userId,
        execution_id: executionId,
        phase: "execute",
        model,
        master_id: squadMember.master_id,
        prompt_tokens: result.usage.prompt_tokens,
        completion_tokens: result.usage.completion_tokens,
        cost_usd: result.cost_usd,
        latency_ms: result.latency_ms,
        status: "ok",
        details: { master_name: squadMember.master_name, role: squadMember.role_in_brief },
      });

      return {
        master_id: squadMember.master_id,
        master_name: squadMember.master_name,
        output: result.content,
        cost_usd: result.cost_usd,
        tokens: result.usage.total_tokens,
        latency_ms: result.latency_ms,
        model,
        ok: true,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await logAuditEntry({
        user_id: userId,
        execution_id: executionId,
        phase: "execute",
        model,
        master_id: squadMember.master_id,
        status: "error",
        details: { error: msg },
      });
      return {
        master_id: squadMember.master_id,
        master_name: squadMember.master_name,
        output: `[Error: ${msg}]`,
        cost_usd: 0, tokens: 0, latency_ms: 0, model, ok: false,
      };
    }
  });

  return Promise.all(calls);
}

// ── Phase 4: Synthesize ──────────────────────────────────────
async function phase4Synthesize(
  brief: string,
  expertResults: ExpertResult[],
  executionId: string,
  userId: string
) {
  const expertOutputs = expertResults.filter(r => r.ok).map(r => ({
    master: r.master_name,
    output: r.output,
  }));

  const result = await callOpenRouter(
    "anthropic/claude-opus-4",
    [{ role: "user", content: SYNTHESIS_PROMPT(brief, expertOutputs) }],
    2048
  );

  await logAuditEntry({
    user_id: userId,
    execution_id: executionId,
    phase: "synthesize",
    model: "anthropic/claude-opus-4",
    prompt_tokens: result.usage.prompt_tokens,
    completion_tokens: result.usage.completion_tokens,
    cost_usd: result.cost_usd,
    latency_ms: result.latency_ms,
    status: "ok",
  });

  return result;
}

// ── POST /api/mtc-bot/chat ───────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    brief?: string;
    phase?: "plan" | "execute";
    execution_id?: string;
    plan?: BotPlan;
    project_id?: string;
  };

  const svc = await createServiceClient();

  // Load lookup data used by both phases
  const [{ data: departments }, { data: masters }, { data: ecosystems }] = await Promise.all([
    svc.from("departments").select("id, name, description, tier_name").order("display_order"),
    svc.from("masters").select("id, department_id, name, affiliation, bio, default_gateway").order("display_order"),
    svc.from("ai_ecosystems").select("id, name, openrouter_model_string"),
  ]);

  const ecosystemMap = new Map<string, string>(
    (ecosystems ?? []).map((e: EcosystemRow) => [e.id, e.openrouter_model_string])
  );

  // ── Phase 1: Plan ──────────────────────────────────────────
  if (!body.phase || body.phase === "plan") {
    if (!body.brief) return NextResponse.json({ error: "brief required" }, { status: 400 });

    const { plan, usage, cost_usd, latency_ms } = await phase1Plan(
      body.brief,
      (departments ?? []) as DeptRow[],
      (masters ?? []) as MasterRow[],
      ecosystemMap
    );

    const { data: execution } = await svc.from("executions").insert({
      user_id: user.id,
      project_id: body.project_id ?? null,
      brief: body.brief,
      task_type: plan.task_type,
      pattern_id: plan.pattern,
      squad_master_ids: plan.squad.map(s => s.master_id),
      gateway_assignments: Object.fromEntries(plan.squad.map(s => [s.master_id, s.model])),
      status: "awaiting_approval",
      plan,
    }).select("id").single();

    await logAuditEntry({
      user_id: user.id,
      execution_id: execution!.id,
      phase: "plan",
      model: "anthropic/claude-opus-4",
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      cost_usd,
      latency_ms,
      status: "ok",
      details: { task_type: plan.task_type, squad_size: plan.squad.length },
    });

    return NextResponse.json({ phase: "plan", execution_id: execution!.id, plan });
  }

  // ── Phase 3-5: Execute → Synthesize → Audit ───────────────
  if (body.phase === "execute") {
    const { execution_id, plan, brief } = body;
    if (!execution_id || !plan) return NextResponse.json({ error: "execution_id + plan required" }, { status: 400 });

    await svc.from("executions").update({ status: "running", started_at: new Date().toISOString() }).eq("id", execution_id);

    const expertResults = await phase3Execute(
      plan,
      (masters ?? []) as MasterRow[],
      ecosystemMap,
      execution_id,
      user.id
    );

    const synthesis = await phase4Synthesize(
      brief ?? plan.plan_summary,
      expertResults,
      execution_id,
      user.id
    );

    const totalCost = expertResults.reduce((s, r) => s + r.cost_usd, 0) + synthesis.cost_usd;
    const totalTokens = expertResults.reduce((s, r) => s + r.tokens, 0) + synthesis.usage.total_tokens;

    await svc.from("executions").update({
      status: "completed",
      results: expertResults,
      synthesis_output: synthesis.content,
      total_tokens: totalTokens,
      total_cost_usd: totalCost,
      completed_at: new Date().toISOString(),
    }).eq("id", execution_id);

    return NextResponse.json({
      phase: "complete",
      execution_id,
      expert_results: expertResults,
      synthesis: synthesis.content,
      total_cost_usd: totalCost,
      total_tokens: totalTokens,
    });
  }

  return NextResponse.json({ error: "Unknown phase" }, { status: 400 });
}
