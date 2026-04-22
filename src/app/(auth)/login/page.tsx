'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { hasSupabaseBrowserEnv } from '@/lib/supabase/config'
import { Building2, Loader2 } from 'lucide-react'

function getAuthCookiePrefixes() {
  const prefixes = ['supabase.auth.token']

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (supabaseUrl) {
      const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
      prefixes.unshift(`sb-${projectRef}-auth-token`)
    }
  } catch {
    // Ignore malformed env values and fall back to the legacy prefix.
  }

  return prefixes
}

async function waitForAuthCookie(timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs
  const authCookiePrefixes = getAuthCookiePrefixes()

  while (Date.now() < deadline) {
    const hasAuthCookie = document.cookie
      .split('; ')
      .map((cookie) => cookie.split('=')[0] ?? '')
      .some((name) =>
        authCookiePrefixes.some(
          (prefix) => name === prefix || name.startsWith(`${prefix}.`)
        )
      )

    if (hasAuthCookie) {
      return true
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  return false
}

export default function LoginPage() {
  const authConfigured = hasSupabaseBrowserEnv()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { signIn, signUp } = useAuth()
  const router = useRouter()

  const navigateToDashboard = () => {
    router.replace('/dashboard')
  }

  const ensureDedicatedPhoneNumber = async () => {
    const response = await fetch('/api/phone-number', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const payload = await response.json().catch(() => null)
    const assignment = payload?.data?.assignment

    if (!response.ok || !assignment?.phone_number) {
      throw new Error(
        payload?.error ||
          'Account created, but dedicated phone number provisioning failed.'
      )
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (isSignUp) {
        const { error: signUpError } = await signUp(email, password, fullName)
        if (signUpError) {
          setError(signUpError)
        } else {
          setError(null)
          // Auto sign in after signup
          const { error: signInError } = await signIn(email, password)
          if (signInError) {
            setError('Account created! Please check your email to verify, then sign in.')
          } else {
            const hasAuthCookie = await waitForAuthCookie()
            if (!hasAuthCookie) {
              setError('Account created, but your browser did not keep the session. Please sign in again.')
              return
            }
            await ensureDedicatedPhoneNumber()
            navigateToDashboard()
          }
        }
      } else {
        const { error: signInError } = await signIn(email, password)
        if (signInError) {
          setError(signInError)
        } else {
          const hasAuthCookie = await waitForAuthCookie()
          if (!hasAuthCookie) {
            setError('Signed in, but your browser did not keep the session. Please try again.')
            return
          }
          navigateToDashboard()
        }
      }
    } catch (error) {
      setError(
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Something went wrong. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  if (!authConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 px-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <span className="text-2xl font-bold tracking-tight">NextGen Realty</span>
            </div>
            <CardTitle className="text-xl">Authentication needs setup</CardTitle>
            <CardDescription>
              Add your Supabase public environment variables to enable sign-in on this deployment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Missing environment variables:</p>
            <p className="font-mono text-xs rounded-md bg-zinc-100 dark:bg-zinc-900 px-3 py-2">
              NEXT_PUBLIC_SUPABASE_URL
              <br />
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="h-10 w-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight">NextGen Realty</span>
          </div>
          <CardTitle className="text-xl">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </CardTitle>
          <CardDescription>
            {isSignUp
              ? 'Get started with your wholesaling CRM'
              : 'Sign in to your wholesaling CRM'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required={isSignUp}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
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
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 px-3 py-2 rounded-md">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSignUp ? 'Create Account' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {isSignUp ? (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => { setIsSignUp(false); setError(null) }}
                  className="text-blue-600 hover:underline font-medium"
                >
                  Sign In
                </button>
              </>
            ) : (
              <>
                Don&apos;t have an account?{' '}
                <button
                  onClick={() => { setIsSignUp(true); setError(null) }}
                  className="text-blue-600 hover:underline font-medium"
                >
                  Sign Up
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
