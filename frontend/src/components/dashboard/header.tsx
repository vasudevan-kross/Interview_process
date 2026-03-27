'use client'

import { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useOrg } from '@/contexts/OrganizationContext'
import { toast } from 'sonner'
import { LogOut, Shield, Coins } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getCreditBalance, formatCredits } from '@/lib/api/credits'
import Link from 'next/link'

interface DashboardHeaderProps {
  user: User
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const router = useRouter()
  const { role } = useOrg()

  // Fetch credit balance
  const { data: balance } = useQuery({
    queryKey: ['credit-balance'],
    queryFn: getCreditBalance,
    refetchInterval: 60000, // Refresh every minute
  })

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Logged out successfully')
    router.push('/login')
    router.refresh()
  }

  const getRoleBadge = () => {
    if (!role) return null

    const roleLabels: Record<string, string> = {
      owner: 'Owner',
      admin: 'Admin',
      hr: 'HR',
      interviewer: 'Interviewer',
      viewer: 'Viewer',
    }

    return (
      <Badge className="flex items-center gap-1.5 px-2.5 py-1 border border-slate-200 text-slate-600 bg-transparent text-xs font-medium">
        <Shield className="h-3 w-3" />
        {roleLabels[role] || role}
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

          {/* Credit Balance */}
          <Link href="/dashboard/credits">
            <Badge
              variant="outline"
              className="flex items-center gap-2 px-3 py-1.5 border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer"
            >
              <Coins className="h-4 w-4" />
              <span className="font-semibold tabular-nums">
                {balance ? formatCredits(balance.balance) : '...'}
              </span>
              <span className="text-xs font-normal text-indigo-600">credits</span>
              {balance && balance.balance < 100 && (
                <span className="ml-1 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                  Low
                </span>
              )}
            </Badge>
          </Link>

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
