"use client"

import { useParams } from "next/navigation"
import { OrderDetail } from "@/components/orders/order-detail"

export default function OrderDetailPage() {
  const params = useParams()
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string)
  if (!id) return null
  return <OrderDetail orderId={id} />
}
