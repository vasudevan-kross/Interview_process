'use client'

import { useState, useEffect } from 'react'
import { useOrg } from '@/contexts/OrganizationContext'
import { inviteMember, updateMemberRole, removeMember, listInvitations, cancelInvitation } from '@/lib/api/organizations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { JoinLinkSection } from '@/components/organization/JoinLinkSection'
import { toast } from 'sonner'
import { Trash2, Mail } from 'lucide-react'

const ROLES = ['admin', 'hr', 'interviewer', 'viewer'] as const

export default function MembersPage() {
  const { members, fetchMembers, canManage, role: myRole } = useOrg()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('viewer')
  const [inviting, setInviting] = useState(false)
  const [invitations, setInvitations] = useState<any[]>([])

  useEffect(() => {
    fetchMembers()
    loadInvitations()
  }, [])

  const loadInvitations = async () => {
    try {
      const data = await listInvitations()
      setInvitations(data)
    } catch {
      // ignore — may not have permission
    }
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      await inviteMember(inviteEmail.trim(), inviteRole)
      toast.success(`Invitation sent to ${inviteEmail}`)
      setInviteEmail('')
      loadInvitations()
    } catch (err: any) {
      toast.error(err.message || 'Failed to send invitation')
    } finally {
      setInviting(false)
    }
  }

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateMemberRole(userId, newRole)
      toast.success('Role updated')
      fetchMembers()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update role')
    }
  }

  const handleRemove = async (userId: string, userName: string) => {
    if (!confirm(`Remove ${userName || 'this member'} from the organization?`)) return
    try {
      await removeMember(userId)
      toast.success('Member removed')
      fetchMembers()
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove member')
    }
  }

  const handleCancelInvite = async (id: string) => {
    try {
      await cancelInvitation(id)
      toast.success('Invitation cancelled')
      loadInvitations()
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel invitation')
    }
  }

  const isManager = canManage()

  return (
    <div className="space-y-6">
      <PageHeader title="Team Members" />

      {/* Invite form */}
      {isManager && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 max-w-lg">
          <h3 className="text-sm font-medium mb-3">Invite a new member</h3>
          <div className="flex gap-2">
            <Input
              placeholder="Email address"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              type="email"
              className="flex-1"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
            >
              {ROLES.map(r => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
              <Mail className="h-4 w-4 mr-1" />
              {inviting ? 'Sending...' : 'Invite'}
            </Button>
          </div>
        </div>
      )}

      {/* Join Link Section */}
      {isManager && <JoinLinkSection />}

      {/* Members list */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">Name</th>
              <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">Email</th>
              <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">Role</th>
              {isManager && <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 text-sm">{m.user_name || '—'}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{m.user_email || '—'}</td>
                <td className="px-4 py-3">
                  {isManager && m.role !== 'owner' ? (
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                      className="border border-slate-200 rounded-md px-2 py-1 text-xs bg-white"
                    >
                      {ROLES.map(r => (
                        <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>
                  ) : (
                    <Badge variant="outline" className="text-xs capitalize">{m.role}</Badge>
                  )}
                </td>
                {isManager && (
                  <td className="px-4 py-3 text-right">
                    {m.role !== 'owner' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(m.user_id, m.user_name || '')}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pending invitations */}
      {isManager && invitations.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3">Pending Invitations</h3>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">Email</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">Role</th>
                  <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 text-sm">{inv.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs capitalize">{inv.role}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelInvite(inv.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        Cancel
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
