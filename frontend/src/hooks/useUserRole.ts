'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type UserRole = 'admin' | 'hr' | 'interviewer'

export function useUserRole() {
  const [role, setRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchUserRole()
    
    // Safety timeout: stop loading after 5s regardless of result
    const timer = setTimeout(() => {
      setLoading(false)
    }, 5000)
    
    return () => clearTimeout(timer)
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

      // First get the user record from users table using auth_user_id
      const { data: userRecord } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!userRecord) {
        console.error('User record not found in users table')
        setRole('hr')
        return
      }

      // Get user roles from user_roles table using the users.id
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', userRecord.id)

      if (userRoles && userRoles.length > 0) {
        // @ts-ignore
        const roleName = userRoles[0].roles.name
        // Only accept valid roles
        if (['admin', 'hr', 'interviewer'].includes(roleName)) {
          setRole(roleName as UserRole)
        } else {
          setRole('hr') // Fallback to hr instead of 'user'
        }
      } else {
        // Default to 'hr' role if no role assigned
        console.warn('No role assigned, defaulting to hr')
        setRole('hr')
      }
    } catch (error) {
      console.error('Error fetching user role:', error)
      setRole('hr')
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
