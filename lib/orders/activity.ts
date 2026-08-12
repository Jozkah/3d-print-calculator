// Order activity timeline — a lightweight internal audit log.
//
// Every meaningful order event is appended here (status changes, uploads, task
// transitions, payments…). Writes are best-effort: a failed activity insert must
// never block the underlying action, so logActivity swallows its own errors.

import { createClient } from "@/lib/supabase/client"
import type { ActivityType, OrderActivity } from "@/types/orders"

export async function logActivity(
  orderId: string,
  type: ActivityType,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = createClient()
    await supabase.from("order_activity").insert([
      {
        order_id: orderId,
        type,
        message,
        meta: meta ?? null,
        created_at: new Date().toISOString(),
      },
    ])
  } catch {
    // Non-critical: the audit trail losing one entry must not fail the action.
  }
}

export async function getOrderActivity(orderId: string): Promise<OrderActivity[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from("order_activity")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
  return (data as OrderActivity[]) ?? []
}
