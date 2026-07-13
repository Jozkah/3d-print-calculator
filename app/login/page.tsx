"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Box, KeyRound, Loader2, Mail } from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

export default function LoginPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [magicLoading, setMagicLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(signInError.message)
        toast({ title: "Sign-in failed", description: signInError.message, variant: "destructive" })
        return
      }
      router.push("/")
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to reach Supabase. Check your configuration."
      setError(message)
      toast({ title: "Sign-in failed", description: message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  async function handleMagicLink() {
    setError(null)
    if (!email) {
      setError("Enter your email address first, then request a magic link.")
      return
    }
    setMagicLoading(true)
    try {
      const supabase = createClient()
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${location.origin}/auth/callback`,
          shouldCreateUser: false,
        },
      })
      if (otpError) {
        setError(otpError.message)
        toast({ title: "Magic link failed", description: otpError.message, variant: "destructive" })
        return
      }
      toast({
        title: "Magic link sent",
        description: `Check ${email} for a sign-in link.`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to reach Supabase. Check your configuration."
      setError(message)
      toast({ title: "Magic link failed", description: message, variant: "destructive" })
    } finally {
      setMagicLoading(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/75 text-primary-foreground shadow-sm">
            <Box className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-foreground">
            Print<span className="text-primary">Calc</span>
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Access is restricted to authorized users.</CardDescription>
          </CardHeader>
          <form onSubmit={handlePasswordSignIn}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
            </CardContent>
            <CardFooter className="mt-6 flex flex-col gap-2">
              <Button type="submit" className="w-full" disabled={loading || magicLoading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                Sign in with password
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={loading || magicLoading}
                onClick={handleMagicLink}
              >
                {magicLoading ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                Email me a magic link
              </Button>
            </CardFooter>
          </form>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          This is a private business tool — there is no public sign-up. Accounts are created by an administrator in
          the Supabase dashboard (Authentication → Users).
        </p>
      </div>
    </main>
  )
}
