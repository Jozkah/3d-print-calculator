"use client"

import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// "Start from template" selector shown above the calculators. The calculator
// pages are server components on this branch, so the interactive Select lives
// in this small client component: picking a template navigates to
// `${basePath}?template=<id>` and the server page re-renders the calculator
// with that templateId.
export function TemplatePicker({
  templates,
  value,
  basePath,
}: {
  templates: { id: string; name: string }[]
  value?: string
  basePath: string
}) {
  const router = useRouter()

  if (templates.length === 0) return null

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <span className="text-sm font-medium text-muted-foreground shrink-0">Start from template:</span>
        <Select value={value ?? ""} onValueChange={(next) => router.push(`${basePath}?template=${next}`)}>
          <SelectTrigger className="w-full sm:w-[300px] bg-card" aria-label="Start from template">
            <SelectValue placeholder="Choose a template" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
