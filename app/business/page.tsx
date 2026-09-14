"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageLoading } from "@/components/page-loading"

function Redirect({ owner }: { owner: "single" | "dual" }) {
  const router = useRouter()
  const params = useSearchParams()
  useEffect(() => {
    const q = new URLSearchParams(params.toString())
    if (!q.get("owner") && !q.get("edit")) q.set("owner", owner)
    router.replace(`/calculator?${q.toString()}`)
  }, [router, params, owner])
  return <PageLoading />
}

export default function Page() {
  // business -> dual
  return (
    <Suspense fallback={<PageLoading />}>
      <Redirect owner="dual" />
    </Suspense>
  )
}
