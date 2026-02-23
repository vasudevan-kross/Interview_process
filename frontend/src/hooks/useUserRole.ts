'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type UserRole = 'admin' | 'hr' | 'interviewer' | 'user'

export function useUserRole() {
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUserRole()
  }, [])

  const fetchUserRole = async () => {
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setRole(null)
        return
      }

      // Get user roles from user_roles table
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id)

      if (userRoles && userRoles.length > 0) {
        // @ts-ignore
        setRole(userRoles[0].roles.name as UserRole)
      } else {
        // Default to 'user' role if no role assigned
        setRole('user')
      }
    } catch (error) {
      console.error('Error fetching user role:', error)
      setRole('user')
    } finally {
      setLoading(false)
    }
  }

  const hasRole = (requiredRole: UserRole | UserRole[]) => {
    if (!role) return false

    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
    return roles.includes(role)
  }

  const isAdmin = () => role === 'admin'
  const isHR = () => role === 'hr' || role === 'admin'
  const isInterviewer = () => ['interviewer', 'hr', 'admin'].includes(role || '')

  return {
    role,
    loading,
    hasRole,
    isAdmin,
    isHR,
    isInterviewer,
  }
}
