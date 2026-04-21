'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/auth-provider'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Menu,
  LayoutDashboard,
  Building2,
  Phone,
  Megaphone,
  Settings,
  LogOut,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Building2 },
  { href: '/dialer', label: 'Dialer', icon: Phone },
  { href: '/marketing', label: 'Marketing', icon: Megaphone },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { profile, signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
    setOpen(false)
    router.replace('/login')
    router.refresh()
  }

  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '??'

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-2.5 h-16 px-6 border-b border-zinc-200 dark:border-zinc-800">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">NextGen Realty</span>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-medium dark:bg-blue-950 dark:text-blue-300'
                      : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800'
                  )}
                >
                  <item.icon className={cn('h-5 w-5', isActive ? 'text-blue-600' : '')} />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* User */}
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{profile?.full_name || 'User'}</p>
                <p className="text-xs text-muted-foreground">{profile?.email}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => {
                void handleSignOut()
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
