import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardNav } from '@/components/dashboard/nav'
import { DashboardHeader } from '@/components/dashboard/header'
import { OrganizationProvider } from '@/contexts/OrganizationContext'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <OrganizationProvider>
      <div className="min-h-screen bg-slate-50">
        <DashboardNav />
        {/* Main content area - adjust padding for fixed sidebar */}
        <div className="transition-all duration-300 md:pl-64">
          <DashboardHeader user={user} />
          <main className="min-h-[calc(100vh-4rem)] p-4 md:p-6 max-w-full overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>
    </OrganizationProvider>
  )
}
