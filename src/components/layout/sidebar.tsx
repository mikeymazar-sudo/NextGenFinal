'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/auth-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  LayoutDashboard,
  Building2,
  Phone,
  Megaphone,
  Settings,
  LogOut,
  User,
  ChevronUp,
} from 'lucide-react'
import { DialerSidebarWidget } from '@/components/dialer/dialer-sidebar-widget'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Building2 },
  { href: '/dialer', label: 'Dialer', icon: Phone },
  { href: '/marketing', label: 'Marketing', icon: Megaphone },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, signOut } = useAuth()
  const showDialerWidget = !pathname.startsWith('/dialer')

  const handleSignOut = async () => {
    await signOut()
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
    : profile?.email?.slice(0, 2).toUpperCase() || '??'

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 z-30">
      <div className="flex flex-col flex-1 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800">
        {/* Logo */}
        <div className="flex items-center gap-2.5 h-16 px-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight">NextGen Realty</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-medium dark:bg-blue-950 dark:text-blue-300'
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
                )}
              >
                <item.icon className={cn('h-5 w-5', isActive ? 'text-blue-600 dark:text-blue-400' : '')} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Dialer Widget */}
        {showDialerWidget ? <DialerSidebarWidget /> : null}

        {/* User Menu */}
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between h-auto py-2.5 px-3"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-semibold dark:bg-blue-900 dark:text-blue-300">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left">
                    <p className="text-sm font-medium truncate max-w-[140px]">
                      {profile?.full_name || 'User'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate max-w-[140px]">
                      {profile?.email}
                    </p>
                  </div>
                </div>
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link href="/settings" className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  void handleSignOut()
                }}
                className="text-red-600 cursor-pointer dark:text-red-400"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </aside>
  )
}
