import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client used by background jobs (e.g. cron watchers).
 * Bypasses RLS. ONLY use in server-side routes that cannot rely on a user session.
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (set this in Vercel project settings if missing)
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "createServiceClient: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var. " +
      "Add SUPABASE_SERVICE_ROLE_KEY in Vercel project settings to enable cron and admin routes."
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
