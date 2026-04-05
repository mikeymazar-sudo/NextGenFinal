'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/providers/auth-provider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import { useTheme } from 'next-themes'
import { Loader2, User, Users, BarChart3, Moon, Sun } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { UserPhoneNumber } from '@/types/schema'

export default function SettingsPage() {
  const { profile, refreshProfile } = useAuth()
  const { setTheme, theme } = useTheme()
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [saving, setSaving] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState<UserPhoneNumber | null>(null)
  const [loadingPhoneNumber, setLoadingPhoneNumber] = useState(true)
  const [retryingPhoneNumber, setRetryingPhoneNumber] = useState(false)

  useEffect(() => {
    if (!profile?.id) return

    let cancelled = false
    const loadPhoneNumber = async () => {
      try {
        setLoadingPhoneNumber(true)
        const response = await fetch('/api/phone-number')
        const payload = await response.json().catch(() => null)

        if (!cancelled) {
          setPhoneNumber((payload?.data?.assignment as UserPhoneNumber | null) || null)
        }
      } catch (error) {
        console.error('Failed to load dedicated phone number:', error)
      } finally {
        if (!cancelled) {
          setLoadingPhoneNumber(false)
        }
      }
    }

    void loadPhoneNumber()

    return () => {
      cancelled = true
    }
  }, [profile?.id])

  const saveProfile = async () => {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, updated_at: new Date().toISOString() })
      .eq('id', profile?.id)

    setSaving(false)

    if (error) {
      toast.error('Failed to save profile')
    } else {
      await refreshProfile()
      toast.success('Profile updated')
    }
  }

  const retryPhoneProvisioning = async () => {
    try {
      setRetryingPhoneNumber(true)
      const response = await fetch('/api/phone-number', { method: 'POST' })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error || 'Provisioning failed')
      }

      setPhoneNumber((payload?.data?.assignment as UserPhoneNumber | null) || null)
      toast.success('Dedicated phone number is ready')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Provisioning failed')
    } finally {
      setRetryingPhoneNumber(false)
    }
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '??'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your account and preferences.
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          {profile?.role === 'admin' && (
            <TabsTrigger value="team" className="gap-2">
              <Users className="h-4 w-4" />
              Team
            </TabsTrigger>
          )}
          <TabsTrigger value="usage" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            API Usage
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2">
            <Moon className="h-4 w-4" />
            Appearance
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Update your personal information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="text-lg bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{profile?.full_name || 'No name set'}</p>
                  <p className="text-sm text-muted-foreground">{profile?.email}</p>
                  <p className="text-xs text-muted-foreground capitalize mt-0.5">
                    Role: {profile?.role}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    value={profile?.email || ''}
                    disabled
                    className="bg-zinc-50 dark:bg-zinc-800"
                  />
                  <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
                </div>

                <Button onClick={saveProfile} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>

              <Separator />

              <div className="space-y-3 max-w-md">
                <div className="space-y-1">
                  <Label>Dedicated Phone Number</Label>
                  <p className="text-sm font-medium">
                    {loadingPhoneNumber
                      ? 'Loading...'
                      : phoneNumber?.phone_number || 'Not assigned yet'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Provisioning: {phoneNumber?.provisioning_status || 'not-started'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Browser voice routing: {phoneNumber?.voice_routing_status || 'pending'}
                  </p>
                  {phoneNumber?.provisioning_error && (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      {phoneNumber.provisioning_error}
                    </p>
                  )}
                  {!phoneNumber?.provisioning_error && phoneNumber?.voice_routing_error && (
                    <p className="text-xs text-muted-foreground">
                      {phoneNumber.voice_routing_error}
                    </p>
                  )}
                </div>

                <Button
                  variant="outline"
                  onClick={retryPhoneProvisioning}
                  disabled={retryingPhoneNumber}
                >
                  {retryingPhoneNumber && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Retry Number Provisioning
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Tab */}
        {profile?.role === 'admin' && (
          <TabsContent value="team">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Team Management</CardTitle>
                <CardDescription>Manage your team members and permissions.</CardDescription>
              </CardHeader>
              <CardContent>
                {profile?.team_id ? (
                  <p className="text-sm text-muted-foreground">
                    Team management features coming soon.
                  </p>
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                    <h3 className="text-lg font-medium">No team yet</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create a team to collaborate with other agents.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* API Usage Tab */}
        <TabsContent value="usage">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>API Usage</CardTitle>
              <CardDescription>Monitor your API call usage and rate limits.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { name: 'Property Lookup', endpoint: 'property-lookup', limit: '50/hr' },
                  { name: 'AI Analysis', endpoint: 'ai-analyze', limit: '20/hr' },
                  { name: 'Skip Trace', endpoint: 'skip-trace', limit: '30/hr' },
                  { name: 'Rental Comps', endpoint: 'rental-comps', limit: '50/hr' },
                  { name: 'Send Email', endpoint: 'send-email', limit: '100/hr' },
                ].map((item) => (
                  <div key={item.endpoint} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.endpoint}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{item.limit}</p>
                      <p className="text-xs text-muted-foreground">rate limit</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="appearance">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Customize the look and feel of the application.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Dark Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable dark mode for a better viewing experience at night.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Sun className="h-4 w-4 text-muted-foreground" />
                  <Switch
                    checked={theme === 'dark'}
                    onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                  />
                  <Moon className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
