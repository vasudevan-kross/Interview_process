'use client'

import { useUserRole, type UserRole } from '@/hooks/useUserRole'
import { Loader2 } from 'lucide-react'

interface RoleGuardProps {
  allowedRoles: UserRole[]
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function RoleGuard({ allowedRoles, children, fallback }: RoleGuardProps) {
  const { role, loading, hasRole } = useUserRole()

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!hasRole(allowedRoles)) {
    return (
      fallback || (
        <div className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            You don't have permission to view this content.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Your role: <span className="font-semibold">{role}</span>
          </p>
        </div>
      )
    )
  }

  return <>{children}</>
}
