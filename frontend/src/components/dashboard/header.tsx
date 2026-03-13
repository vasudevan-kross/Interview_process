'use client'

import { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useUserRole } from '@/hooks/useUserRole'
import { toast } from 'sonner'
import { LogOut, Shield } from 'lucide-react'

interface DashboardHeaderProps {
  user: User
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const router = useRouter()
  const { role } = useUserRole()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Logged out successfully')
    router.push('/login')
    router.refresh()
  }

  const getRoleBadge = () => {
    if (!role) return null

    const roleConfig = {
      admin: { label: 'Admin' },
      hr: { label: 'HR' },
      interviewer: { label: 'Interviewer' },
    }

    const config = roleConfig[role as keyof typeof roleConfig] || roleConfig.hr

    return (
      <Badge className="flex items-center gap-1.5 px-2.5 py-1 border border-slate-200 text-slate-600 bg-transparent text-xs font-medium">
        <Shield className="h-3 w-3" />
        {config.label}
      </Badge>
    )
  }

  return (
    <header className="h-16 border-b bg-white border-slate-200 sticky top-0 z-30">
      <div className="flex h-full items-center justify-between pl-16 pr-4 md:pl-6 md:pr-6">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back,</p>
          <h2 className="text-base font-semibold">
            {user.user_metadata?.full_name || user.email}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {getRoleBadge()}
          <div className="h-8 w-px bg-border"></div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  )
}
