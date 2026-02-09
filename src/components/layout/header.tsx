'use client'

import { MobileNav } from './mobile-nav'

export function Header() {
  return (
    <header className="md:hidden sticky top-0 z-40 flex items-center h-14 px-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <MobileNav />
      <div className="flex items-center gap-2 ml-3">
        <div className="h-7 w-7 rounded-md bg-blue-600 flex items-center justify-center">
          <span className="text-white text-xs font-bold">N</span>
        </div>
        <span className="text-sm font-bold tracking-tight">NextGen Realty</span>
      </div>
    </header>
  )
}
