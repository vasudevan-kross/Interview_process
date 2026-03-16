'use client'

import React, { createContext, useContext } from 'react'
import { useOrganization, Organization, OrgRole, OrgMember } from '@/hooks/useOrganization'

interface OrganizationContextValue {
  org: Organization | null
  role: OrgRole | null
  members: OrgMember[]
  loading: boolean
  error: string | null
  can: (permission: string) => boolean
  isOwner: () => boolean
  isAdmin: () => boolean
  canManage: () => boolean
  canEdit: () => boolean
  canView: () => boolean
  refetchOrg: () => Promise<void>
  fetchMembers: () => Promise<void>
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null)

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const orgData = useOrganization()

  return (
    <OrganizationContext.Provider value={orgData}>
      {children}
    </OrganizationContext.Provider>
  )
}

export function useOrg() {
  const context = useContext(OrganizationContext)
  if (!context) {
    throw new Error('useOrg must be used within an OrganizationProvider')
  }
  return context
}
