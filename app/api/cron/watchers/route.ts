import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Watcher cron endpoint \u2014 triggered by Vercel cron every 15 minutes (see vercel.json).
 *
 * Phase 1 (current): SAFE STUB \u2014 picks watchers due for a run and writes a watcher_runs row
 * marking them "ticked". No LLM calls, no Composio calls, no external side-effects.
 * This is intentional: we want to confirm the cron infrastructure is wired correctly before
 * spending tokens on autonomous execution.
 *
 * Phase 2 (future): call /api/mtc-bot/chat with watcher.action_description as the brief
 * and write the synthesis output to watcher_runs.output.
 *
 * Failure modes are silent (logged, not thrown) so a single bad watcher doesn't stall the rest.
 */
export async function GET() {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "service_client_unavailable", message: String(err) },
      { status: 503 }
    );
  }

  const now = new Date().toISOString();

  const { data: watchers, error: fetchError } = await supabase
    .from("watchers")
    .select("id, user_id, project_id, name, trigger_description, action_description, schedule_cron, schedule_human")
    .eq("status", "active")
    .or(`next_run_at.is.null,next_run_at.lte.${now}`);

  if (fetchError) {
    return NextResponse.json({ ok: false, error: "fetch_failed", message: fetchError.message }, { status: 500 });
  }

  if (!watchers?.length) {
    return NextResponse.json({ ok: true, ran: 0, total: 0, mode: "phase1_safe_stub" });
  }

  let ran = 0;
  const failures: { id: string; error: string }[] = [];

  for (const w of watchers) {
    try {
      // Phase 1: log a successful tick without invoking any LLM.
      const runInsert = await supabase.from("watcher_runs").insert({
        watcher_id: w.id,
        status: "ticked",
        output: { phase: "phase1_safe_stub", brief: w.action_description, note: "Cron infrastructure verified. Phase 2 will invoke MTC-Bot." },
        completed_at: now,
      });

      if (runInsert.error) {
        failures.push({ id: w.id, error: runInsert.error.message });
        continue;
      }

      // Schedule next run +1 hour ahead (Phase 2 will use schedule_cron if present)
      const nextRunAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await supabase
        .from("watchers")
        .update({ last_run_at: now, last_run_status: "ticked", next_run_at: nextRunAt })
        .eq("id", w.id);

      ran++;
    } catch (err) {
      failures.push({ id: w.id, error: String(err) });
      // Try to log the failure to watcher_runs even if the main flow crashed
      await supabase
        .from("watcher_runs")
        .insert({
          watcher_id: w.id,
          status: "error",
          error_message: String(err),
          completed_at: now,
        })
        .then(() => {})
        .catch(() => {});
    }
  }

  return NextResponse.json({
    ok: true,
    ran,
    total: watchers.length,
    failed: failures.length,
    failures: failures.slice(0, 5),
    mode: "phase1_safe_stub",
  });
}
