import { createClient as createSupabaseClient } from "@supabase/supabase-js"

/**
 * Service-role client for server actions only.
 * The board has no user accounts, so writes are performed server-side
 * after the action validates intent (and the password for admin actions).
 */
export function createAdminClient() {
  return createSupabaseClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
