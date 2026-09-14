// Rules for which fields a production task of a given type may carry, and which
// to clear when its type changes. Pure + DOM-free (unit-tested).
import type { OrderTaskType } from "@/types/orders"
import { calcKindForTaskType } from "@/lib/orders/status"

/** Machine types (3D/laser/UV) must be costed with their calculator. */
export function taskRequiresCalculator(type: OrderTaskType | string): boolean {
  return calcKindForTaskType(type) !== null
}

/**
 * Fields to null out when a task changes type, so no stale machine/material/
 * colour/payload survives across an incompatible switch. Always clears the
 * machine/material/colour/payload set: a generic type must not keep them, and a
 * calc type's payload is kind-specific so it must be re-costed after the switch.
 */
export function clearIncompatibleTaskFields(_type: OrderTaskType | string) {
  return {
    printer_id: null,
    machine_name: null,
    material_id: null,
    material_name: null,
    material_color: null,
    calc_payload: null,
  } as const
}
