"use client"

import { SiteHeader, PageHeader } from "@/components/site-header"
import { OrdersWorkspace } from "@/components/orders/orders-workspace"

export default function OrdersPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader active="/orders" />
      <PageHeader
        backHref="/"
        title="Orders"
        description="Your production queue — what's in progress, what's next, what's late and what's ready."
      />
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <OrdersWorkspace />
      </main>
    </div>
  )
}
