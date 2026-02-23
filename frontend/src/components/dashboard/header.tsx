'use client'

import { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useUserRole } from '@/hooks/useUserRole'
import { toast } from 'sonner'
import { LogOut, User as UserIcon, Shield } from 'lucide-react'

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
      admin: { variant: 'default' as const, label: 'Admin' },
      hr: { variant: 'secondary' as const, label: 'HR' },
      interviewer: { variant: 'outline' as const, label: 'Interviewer' },
      user: { variant: 'outline' as const, label: 'User' },
    }

    const config = roleConfig[role] || roleConfig.user

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Shield className="h-3 w-3" />
        {config.label}
      </Badge>
    )
  }

  return (
    <header className="h-16 border-b">
      <div className="flex h-full items-center justify-between px-6">
        <div>
          <h2 className="text-lg font-semibold">
            Welcome back, {user.user_metadata?.full_name || user.email}
          </h2>
        </div>
        <div className="flex items-center gap-4">
          {getRoleBadge()}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UserIcon className="h-4 w-4" />
            {user.email}
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </header>
  )
}
