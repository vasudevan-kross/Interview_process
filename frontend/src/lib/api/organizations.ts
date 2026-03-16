/**
 * Organization API client functions
 */
import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  }
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }
  return headers
}

async function apiFetch(path: string, options: RequestInit = {}) {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(error.detail || res.statusText)
  }
  return res.json()
}

// ── Organization CRUD ──────────────────────────────────────────────────

export async function createOrganization(name: string, slug?: string) {
  return apiFetch('/api/v1/organizations', {
    method: 'POST',
    body: JSON.stringify({ name, slug }),
  })
}

export async function getCurrentOrganization() {
  return apiFetch('/api/v1/organizations/current')
}

export async function updateOrganization(updates: {
  name?: string
  logo_url?: string
  settings?: Record<string, unknown>
  allow_domain_join?: boolean
  auto_join_domains?: string[]
  auto_join_role?: string
}) {
  return apiFetch('/api/v1/organizations/current', {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

// ── Members ────────────────────────────────────────────────────────────

export async function listMembers() {
  return apiFetch('/api/v1/organizations/current/members')
}

export async function inviteMember(email: string, role: string) {
  return apiFetch('/api/v1/organizations/current/invite', {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  })
}

export async function updateMemberRole(memberUserId: string, role: string) {
  return apiFetch(`/api/v1/organizations/current/members/${memberUserId}/role`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  })
}

export async function removeMember(memberUserId: string) {
  return apiFetch(`/api/v1/organizations/current/members/${memberUserId}`, {
    method: 'DELETE',
  })
}

// ── Invitations ────────────────────────────────────────────────────────

export async function listInvitations() {
  return apiFetch('/api/v1/organizations/current/invitations')
}

export async function cancelInvitation(invitationId: string) {
  return apiFetch(`/api/v1/organizations/current/invitations/${invitationId}`, {
    method: 'DELETE',
  })
}

export async function getInvitationByToken(token: string) {
  return apiFetch(`/api/v1/organizations/invite/${token}`)
}

export async function acceptInvitation(token: string) {
  return apiFetch(`/api/v1/organizations/accept-invite/${token}`, {
    method: 'POST',
  })
}

// ── Organization Discovery (Domain-based Joining) ──────────────────────

/**
 * Get organizations discoverable by email domain
 * Public endpoint - no authentication required
 */
export async function getDiscoverableOrganizations(email?: string) {
  const params = email ? `?email=${encodeURIComponent(email)}` : ''
  const response = await fetch(`${API_URL}/api/v1/organizations/discoverable${params}`, {
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail || 'Failed to fetch discoverable organizations')
  }

  return response.json()
}

/**
 * Join an organization (authenticated)
 * Requires valid session
 */
export async function joinOrganization(orgId: string) {
  return apiFetch(`/api/v1/organizations/join/${orgId}`, {
    method: 'POST',
  })
}

// ── Join Link ──────────────────────────────────────────────────────────

/**
 * Generate or regenerate the join link token
 * Owner/admin only
 */
export async function generateJoinLink() {
  return apiFetch('/api/v1/organizations/current/join-link/generate', {
    method: 'POST',
  })
}

/**
 * Get join link information
 * Owner/admin only
 */
export async function getJoinLinkInfo() {
  return apiFetch('/api/v1/organizations/current/join-link')
}

/**
 * Enable or disable the join link
 * Owner/admin only
 */
export async function toggleJoinLink(enabled: boolean) {
  return apiFetch(`/api/v1/organizations/current/join-link/toggle?enabled=${enabled}`, {
    method: 'PUT',
  })
}

/**
 * Join organization via join link
 * Public endpoint (requires authentication)
 */
export async function joinViaLink(token: string) {
  return apiFetch(`/api/v1/organizations/join-link/${token}`, {
    method: 'POST',
  })
}
