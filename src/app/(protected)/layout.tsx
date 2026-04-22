import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { hasSupabaseBrowserEnv } from '@/lib/supabase/config'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (!hasSupabaseBrowserEnv()) {
    redirect('/login')
  }

  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar />
      <Header />
      <main className="md:pl-64">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
