import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { callOpenRouter } from "@/lib/ai/openrouter";
import { MTC_BOT_SYSTEM_PROMPT, SYNTHESIS_PROMPT } from "@/lib/ai/mtc-bot-prompt";
import { logAuditEntry } from "@/lib/audit";

export const maxDuration = 120;

// Default model — current valid OpenRouter catalog as of May 2026
const DEFAULT_MODEL = "anthropic/claude-opus-4.6";

// ── Types ──────────────────────────────────────────
interface DeptRow { id: string; name: string; description: string | null; tier_name: string | null }
interface MasterRow { id: string; department_id: string; name: string; affiliation: string | null; bio: string | null; default_gateway: string | null }
interface EcosystemRow { id: string; name: string; openrouter_model_string: string }
interface MasterSkillRow { master_id: string; skill_id: string; priority: number | null; use_case: string | null }
interface SkillBody { id: string; name: string; body: string | null }

interface SquadMember {
  master_id: string;
  master_name: string;
  department: string;
  gateway: string;
  model: string;
  role_in_brief: string;
}

interface InvokedSkill {
  master_id: string;
  skill_id: string;
  reason: string;
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
  invoked_skills?: InvokedSkill[];
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
  invoked_skill_ids: string[];
}

// ── Phase 1: Plan ───────────────────────────────────
async function phase1Plan(
  brief: string,
  departments: DeptRow[],
  masters: MasterRow[],
  ecosystemMap: Map<string, string>,
  skillsByMaster: Map<string, MasterSkillRow[]>
) {
  const relevantDepts = departments.slice(0, 30);
  const relevantDeptIds = new Set(relevantDepts.map(d => d.id));
  const relevantMasters = masters.filter(m => relevantDeptIds.has(m.department_id)).slice(0, 60);

  const deptContext = relevantDepts.map(d =>
    `"${d.id}" — ${d.name} (${d.tier_name ?? ""}): ${d.description ?? ""}`
  ).join("\n");

  const masterContext = relevantMasters.map(m => {
    const model = ecosystemMap.get(m.default_gateway ?? "") ?? DEFAULT_MODEL;
    const skills = skillsByMaster.get(m.id) ?? [];
    const topSkills = skills.slice(0, 3);
    const skillStr = topSkills.length > 0
      ? ` | Skills: ${topSkills.map(s => `${s.skill_id}${s.use_case ? ` (${s.use_case})` : ""}`).join("; ")}`
      : "";
    return `"${m.id}" (dept: ${m.department_id}): ${m.name}, ${m.affiliation ?? ""}. Model: ${model}${skillStr}`;
  }).join("\n");

  const response = await callOpenRouter(
    DEFAULT_MODEL,
    [
      { role: "system", content: MTC_BOT_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Brief: ${brief}\n\nTilgængelige departments (udvalg):\n${deptContext}\n\nTilgængelige masters (med deres skills):\n${masterContext}`,
      },
    ],
    6000
  );

  let raw = response.content.trim();
  if (raw.startsWith("```")) raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

  let plan: BotPlan;
  try {
    plan = JSON.parse(raw) as BotPlan;
  } catch (parseErr) {
    const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    const preview = raw.length > 400
      ? `${raw.slice(0, 200)}...[${raw.length - 400} chars]...${raw.slice(-200)}`
      : raw;
    throw new Error(`Failed to parse bot plan JSON (${errMsg}). Tokens used: ${response.usage.completion_tokens}/${6000}. Response preview: ${preview}`);
  }

  return {
    plan,
    usage: response.usage,
    cost_usd: response.cost_usd,
    latency_ms: response.latency_ms,
  };
}

// ── Phase 3: Execute (parallel expert calls) ──────────────
async function phase3Execute(
  plan: BotPlan,
  masters: MasterRow[],
  ecosystemMap: Map<string, string>,
  skillsCatalog: Map<string, SkillBody>,
  executionId: string,
  userId: string
): Promise<ExpertResult[]> {
  const masterMap = new Map(masters.map(m => [m.id, m]));
  const invokedSkills = plan.invoked_skills ?? [];

  const calls = plan.squad.map(async (squadMember) => {
    const master = masterMap.get(squadMember.master_id);
    const model = master
      ? (ecosystemMap.get(master.default_gateway ?? "") ?? squadMember.model ?? DEFAULT_MODEL)
      : (squadMember.model ?? DEFAULT_MODEL);

    // ── Skill body injection ────────────────────────
    // Find which skills the bot invoked for THIS specific master
    const skillsForThisMaster = invokedSkills.filter(
      inv => inv.master_id === squadMember.master_id
    );
    const invokedSkillIds = skillsForThisMaster.map(s => s.skill_id);

    const skillBodiesBlock = skillsForThisMaster
      .map(inv => {
        const skill = skillsCatalog.get(inv.skill_id);
        if (!skill?.body) return null;
        return `### SKILL: ${skill.name} (id: ${inv.skill_id})\n**Why invoked for this task:** ${inv.reason}\n\n${skill.body}`;
      })
      .filter((b): b is string => b !== null)
      .join("\n\n---\n\n");

    const expertPrompt = plan.expert_prompts[squadMember.master_id]
      ?? `As ${squadMember.master_name}, provide your expert analysis on: ${plan.plan_summary}`;

    const systemContent = `You are ${squadMember.master_name}${master?.affiliation ? ` (${master.affiliation})` : ""}. ${master?.bio ?? ""}

${skillBodiesBlock ? `## SKILLS TO USE FOR THIS TASK\n\nThe following skills have been activated for your role. Follow their processes, rules, and output formats exactly — these supersede any general knowledge.\n\n${skillBodiesBlock}\n\n## YOUR TASK\n\n` : ""}Provide expert analysis based on your background and specialization${skillBodiesBlock ? ", applying the skills above" : ""}.`;

    try {
      const result = await callOpenRouter(
        model,
        [
          { role: "system", content: systemContent },
          { role: "user", content: expertPrompt },
        ],
        skillBodiesBlock ? 3000 : 1500  // larger output budget when skills active
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
        details: {
          master_name: squadMember.master_name,
          role: squadMember.role_in_brief,
          invoked_skill_ids: invokedSkillIds,
          skill_bytes_injected: skillBodiesBlock.length,
        },
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
        invoked_skill_ids: invokedSkillIds,
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
        details: { error: msg, invoked_skill_ids: invokedSkillIds },
      });
      return {
        master_id: squadMember.master_id,
        master_name: squadMember.master_name,
        output: `[Error: ${msg}]`,
        cost_usd: 0, tokens: 0, latency_ms: 0, model, ok: false,
        invoked_skill_ids: invokedSkillIds,
      };
    }
  });

  return Promise.all(calls);
}

// ── Phase 4: Synthesize ─────────────────────────────────
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
    DEFAULT_MODEL,
    [{ role: "user", content: SYNTHESIS_PROMPT(brief, expertOutputs) }],
    2048
  );

  await logAuditEntry({
    user_id: userId,
    execution_id: executionId,
    phase: "synthesize",
    model: DEFAULT_MODEL,
    prompt_tokens: result.usage.prompt_tokens,
    completion_tokens: result.usage.completion_tokens,
    cost_usd: result.cost_usd,
    latency_ms: result.latency_ms,
    status: "ok",
  });

  return result;
}

// ── POST /api/mtc-bot/chat ────────────────────────────
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
  const [
    { data: departments },
    { data: masters },
    { data: ecosystems },
    { data: masterSkills },
  ] = await Promise.all([
    svc.from("departments").select("id, name, description, tier_name").order("display_order"),
    svc.from("masters").select("id, department_id, name, affiliation, bio, default_gateway").order("display_order"),
    svc.from("ai_ecosystems").select("id, name, openrouter_model_string"),
    svc.from("master_skills").select("master_id, skill_id, priority, use_case").order("priority", { ascending: true }),
  ]);

  const ecosystemMap = new Map<string, string>(
    (ecosystems ?? []).map((e: EcosystemRow) => [e.id, e.openrouter_model_string])
  );

  const skillsByMaster = new Map<string, MasterSkillRow[]>();
  (masterSkills ?? []).forEach((ms: MasterSkillRow) => {
    if (!skillsByMaster.has(ms.master_id)) skillsByMaster.set(ms.master_id, []);
    skillsByMaster.get(ms.master_id)!.push(ms);
  });

  // ── Phase 1: Plan ──────────────────────────────────
  if (!body.phase || body.phase === "plan") {
    if (!body.brief) return NextResponse.json({ error: "brief required" }, { status: 400 });

    const { plan, usage, cost_usd, latency_ms } = await phase1Plan(
      body.brief,
      (departments ?? []) as DeptRow[],
      (masters ?? []) as MasterRow[],
      ecosystemMap,
      skillsByMaster
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

    if (!execution) {
      throw new Error("Failed to create execution row \u2014 check DB constraints (user_id FK to profiles, pattern_id NOT NULL)");
    }

    await logAuditEntry({
      user_id: user.id,
      execution_id: execution.id,
      phase: "plan",
      model: DEFAULT_MODEL,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      cost_usd,
      latency_ms,
      status: "ok",
      details: {
        task_type: plan.task_type,
        squad_size: plan.squad.length,
        invoked_skills_count: plan.invoked_skills?.length ?? 0,
        invoked_skill_ids: Array.from(new Set((plan.invoked_skills ?? []).map(s => s.skill_id))),
      },
    });

    return NextResponse.json({ phase: "plan", execution_id: execution.id, plan });
  }

  // ── Phase 3-5: Execute → Synthesize → Audit ────────────
  if (body.phase === "execute") {
    const { execution_id, plan, brief } = body;
    if (!execution_id || !plan) return NextResponse.json({ error: "execution_id + plan required" }, { status: 400 });

    // ── Just-in-time skill body loading ──────────────────
    // Only load bodies for skills the bot actually invoked
    const invokedSkillIds = Array.from(new Set((plan.invoked_skills ?? []).map(s => s.skill_id)));
    const skillsCatalog = new Map<string, SkillBody>();
    if (invokedSkillIds.length > 0) {
      const { data: skillRows } = await svc
        .from("agent_skills")
        .select("id, name, body")
        .in("id", invokedSkillIds);
      (skillRows ?? []).forEach((s: SkillBody) => skillsCatalog.set(s.id, s));
    }

    await svc.from("executions").update({ status: "running", started_at: new Date().toISOString() }).eq("id", execution_id);

    const expertResults = await phase3Execute(
      plan,
      (masters ?? []) as MasterRow[],
      ecosystemMap,
      skillsCatalog,
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
