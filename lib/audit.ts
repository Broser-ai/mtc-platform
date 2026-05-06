import { createServiceClient } from "@/lib/supabase/server";

export interface AuditEntry {
  user_id: string;
  execution_id: string;
  phase: string;
  model?: string;
  master_id?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  cost_usd?: number;
  latency_ms?: number;
  status?: string;
  details?: Record<string, unknown>;
}

export async function logAuditEntry(entry: AuditEntry) {
  const supabase = await createServiceClient();
  const { error } = await supabase.from("audit_log").insert(entry);
  if (error) console.error("[audit] write failed:", error.message);
}
