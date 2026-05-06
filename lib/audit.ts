import { createServiceClient } from "@/lib/supabase/server";

export interface AuditEntry {
  user_id: string;
  execution_id: string;
  phase: string;           // stored as `action`
  model?: string;
  master_id?: string;      // stored as `target`
  prompt_tokens?: number;
  completion_tokens?: number;
  cost_usd?: number;
  latency_ms?: number;
  status?: string;
  details?: Record<string, unknown>;
}

export async function logAuditEntry(entry: AuditEntry) {
  const supabase = await createServiceClient();
  const { error } = await supabase.from("audit_log").insert({
    user_id: entry.user_id,
    execution_id: entry.execution_id,
    action: entry.phase,
    target: entry.master_id ?? null,
    status: entry.status ?? "ok",
    cost_usd: entry.cost_usd ?? 0,
    details: {
      model: entry.model,
      prompt_tokens: entry.prompt_tokens,
      completion_tokens: entry.completion_tokens,
      latency_ms: entry.latency_ms,
      ...(entry.details ?? {}),
    },
  });
  if (error) console.error("[audit] write failed:", error.message);
}
