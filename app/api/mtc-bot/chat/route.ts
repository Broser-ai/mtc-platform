import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { callOpenRouter, estimateCost } from "@/lib/ai/openrouter";
import { MTC_BOT_SYSTEM_PROMPT, SYNTHESIS_PROMPT } from "@/lib/ai/mtc-bot-prompt";
import { logAuditEntry } from "@/lib/audit";

export const maxDuration = 120;

// ── Phase 1: Plan ────────────────────────────────────────────
async function phase1Plan(
  brief: string,
  departments: DeptRow[],
  masters: MasterRow[]
) {
  const deptContext = departments.map(d =>
    `Dept "${d.id}": ${d.name} — ${d.description}`
  ).join("\n");

  const masterContext = masters.map(m =>
    `Master "${m.id}" (${m.department_id}): ${m.name}, ${m.affiliation}. Gateway: ${m.default_gateway}. Model: ${m.ai_ecosystems?.openrouter_model_string ?? "anthropic/claude-opus-4"}`
  ).join("\n");

  const userPrompt = `Brief: ${brief}\n\nTilgængelige departments:\n${deptContext}\n\nTilgængelige masters:\n${masterContext}`;

  const response = await callOpenRouter(
    "anthropic/claude-opus-4",
    [
      { role: "system", content: MTC_BOT_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    1024
  );

  // Strip markdown if wrapped
  let raw = response.content.trim();
  if (raw.startsWith("```")) raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  return { plan: JSON.parse(raw), usage: response.usage, cost_usd: response.cost_usd, latency_ms: response.latency_ms };
}

// ── Phase 3: Execute (parallel expert calls) ─────────────────
async function phase3Execute(
  plan: BotPlan,
  masters: MasterRow[],
  executionId: string,
  userId: string
) {
  const masterMap = new Map(masters.map(m => [m.id, m]));

  const calls = plan.squad.map(async (squadMember) => {
    const master = masterMap.get(squadMember.master_id);
    const model = master?.ai_ecosystems?.openrouter_model_string ?? squadMember.model ?? "anthropic/claude-opus-4";
    const prompt = plan.expert_prompts[squadMember.master_id] ?? `As ${squadMember.master_name}, provide your expert analysis: ${plan.plan_summary}`;

    try {
      const result = await callOpenRouter(model, [
        {
          role: "system",
          content: `Du er ${squadMember.master_name} (${master?.affiliation ?? "Expert"}). ${master?.bio ?? ""}\n\nGiv din ekspertanalyse baseret på din baggrund og specialisering.`,
        },
        { role: "user", content: prompt },
      ], 1500);

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

      return { master_id: squadMember.master_id, master_name: squadMember.master_name, output: result.content, cost_usd: result.cost_usd, tokens: result.usage.total_tokens, latency_ms: result.latency_ms, model, ok: true };
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
      return { master_id: squadMember.master_id, master_name: squadMember.master_name, output: `[Error: ${msg}]`, cost_usd: 0, tokens: 0, latency_ms: 0, model, ok: false };
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

  const start = Date.now();
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

// ── Types ────────────────────────────────────────────────────
interface DeptRow { id: string; name: string; description: string | null }
interface MasterRow {
  id: string; department_id: string; name: string; affiliation: string | null;
  bio: string | null; default_gateway: string | null;
  ai_ecosystems: { openrouter_model_string: string } | null;
}
interface SquadMember { master_id: string; master_name: string; department: string; gateway: string; model: string; role_in_brief: string }
interface BotPlan {
  task_type: string; selected_departments: Array<{ id: string; name: string; reason: string }>;
  squad: SquadMember[]; pattern: string; estimated_tokens_per_call: number;
  estimated_cost_usd: number; risk_class: string; plan_summary: string;
  expert_prompts: Record<string, string>;
}
interface ExpertResult { master_id: string; master_name: string; output: string; cost_usd: number; tokens: number; latency_ms: number; model: string; ok: boolean }

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
    conversation_id?: string;
    project_id?: string;
  };

  const serviceClient = await createServiceClient();

  // ── Phase 1: Plan ──────────────────────────────────────────
  if (!body.phase || body.phase === "plan") {
    if (!body.brief) return NextResponse.json({ error: "brief required" }, { status: 400 });

    // Load departments + masters with their ecosystem
    const { data: departments } = await serviceClient.from("departments").select("id, name, description").order("display_order");
    const { data: masters } = await serviceClient
      .from("masters")
      .select("id, department_id, name, affiliation, bio, default_gateway, ai_ecosystems(openrouter_model_string)")
      .order("display_order");

    const { plan, usage, cost_usd, latency_ms } = await phase1Plan(
      body.brief,
      (departments ?? []) as DeptRow[],
      (masters ?? []) as unknown as MasterRow[]
    );

    // Create execution record
    const { data: execution } = await serviceClient.from("executions").insert({
      user_id: user.id,
      project_id: body.project_id ?? null,
      brief: body.brief,
      task_type: plan.task_type,
      pattern_id: plan.pattern,
      squad_master_ids: plan.squad.map((s: SquadMember) => s.master_id),
      gateway_assignments: Object.fromEntries(plan.squad.map((s: SquadMember) => [s.master_id, s.model])),
      status: "awaiting_approval",
      plan,
    }).select("id").single();

    // Log plan phase to audit
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

  // ── Phase 3+4+5: Execute → Synthesize → Audit ─────────────
  if (body.phase === "execute") {
    const { execution_id, plan } = body;
    if (!execution_id || !plan) return NextResponse.json({ error: "execution_id + plan required" }, { status: 400 });

    // Load masters for bios + model strings
    const { data: masters } = await serviceClient
      .from("masters")
      .select("id, department_id, name, affiliation, bio, default_gateway, ai_ecosystems(openrouter_model_string)")
      .in("id", plan.squad.map((s: SquadMember) => s.master_id));

    await serviceClient.from("executions").update({ status: "running", started_at: new Date().toISOString() }).eq("id", execution_id);

    // Phase 3: parallel expert calls
    const expertResults = await phase3Execute(plan, (masters ?? []) as unknown as MasterRow[], execution_id, user.id);

    // Phase 4: synthesis
    const synthesis = await phase4Synthesize(body.brief ?? plan.plan_summary, expertResults, execution_id, user.id);

    // Totals
    const totalCost = expertResults.reduce((s, r) => s + r.cost_usd, 0) + synthesis.cost_usd;
    const totalTokens = expertResults.reduce((s, r) => s + r.tokens, 0) + synthesis.usage.total_tokens;

    // Phase 5: update execution
    await serviceClient.from("executions").update({
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
