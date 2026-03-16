'use client'

import { useEffect, useState, useCallback } from 'react'
import { getCurrentOrganization, listMembers } from '@/lib/api/organizations'
import { has_permission } from '@/lib/permissions'

export type OrgRole = 'owner' | 'admin' | 'hr' | 'interviewer' | 'viewer'

export interface Organization {
  id: string
  name: string
  slug: string
  logo_url: string | null
  plan: string
  settings: Record<string, unknown>
  current_role: OrgRole
  allow_domain_join?: boolean
  auto_join_domains?: string[]
  auto_join_role?: string
}

export interface OrgMember {
  id: string
  user_id: string
  role: OrgRole
  joined_at: string | null
  user_name: string | null
  user_email: string | null
}

export function useOrganization() {
  const [org, setOrg] = useState<Organization | null>(null)
  const [role, setRole] = useState<OrgRole | null>(null)
  const [members, setMembers] = useState<OrgMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchOrg = useCallback(async () => {
    try {
      setLoading(true)
      const data = await getCurrentOrganization()
      setOrg(data)
      setRole(data.current_role)
      setError(null)
    } catch (err: any) {
      console.error('Failed to fetch organization:', err)
      setError(err.message)
      // Fallback: treat as hr role for backward compat during migration
      setRole('hr')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchMembers = useCallback(async () => {
    try {
      const data = await listMembers()
      setMembers(data)
    } catch (err) {
      console.error('Failed to fetch members:', err)
    }
  }, [])

  useEffect(() => {
    fetchOrg()
  }, [fetchOrg])

  const can = useCallback((permission: string): boolean => {
    if (!role) return false
    return has_permission(role, permission)
  }, [role])

  const isOwner = useCallback(() => role === 'owner', [role])
  const isAdmin = useCallback(() => role === 'owner' || role === 'admin', [role])
  const canManage = useCallback(() => ['owner', 'admin'].includes(role || ''), [role])
  const canEdit = useCallback(() => ['owner', 'admin', 'hr'].includes(role || ''), [role])
  const canView = useCallback(() => !!role, [role])

  return {
    org,
    role,
    members,
    loading,
    error,
    can,
    isOwner,
    isAdmin,
    canManage,
    canEdit,
    canView,
    refetchOrg: fetchOrg,
    fetchMembers,
  }
}
