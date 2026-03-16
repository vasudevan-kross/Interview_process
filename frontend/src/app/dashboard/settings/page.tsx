'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { User, Settings2, Users, Bot, Save, Shield, Building2 } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonPageHeader } from '@/components/ui/skeleton'
import { useOrg } from '@/contexts/OrganizationContext'
import { updateOrganization, inviteMember, updateMemberRole, removeMember, listInvitations, cancelInvitation } from '@/lib/api/organizations'
import { Badge } from '@/components/ui/badge'
import { Trash2, Mail } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { JoinLinkSection } from '@/components/organization/JoinLinkSection'

interface UserProfile {
  id: string
  email: string
  full_name: string
  avatar_url: string | null
}

interface LLMModel {
  name: string
  size: string
}

const ORG_ROLES = ['admin', 'hr', 'interviewer', 'viewer'] as const

export default function SettingsPage() {
  const router = useRouter()
  const { org, role: orgRole, members, canManage, fetchMembers, refetchOrg } = useOrg()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userRole, setUserRole] = useState<string>('user')
  const [profile, setProfile] = useState<UserProfile>({
    id: '',
    email: '',
    full_name: '',
    avatar_url: null
  })
  const [availableModels, setAvailableModels] = useState<LLMModel[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')

  // Org settings state
  const [orgName, setOrgName] = useState('')
  const [orgLogoUrl, setOrgLogoUrl] = useState('')
  const [savingOrg, setSavingOrg] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('viewer')
  const [inviting, setInviting] = useState(false)
  const [invitations, setInvitations] = useState<any[]>([])

  // Domain joining settings
  const [allowDomainJoin, setAllowDomainJoin] = useState(false)
  const [autoJoinDomains, setAutoJoinDomains] = useState<string[]>([])
  const [autoJoinRole, setAutoJoinRole] = useState('viewer')
  const [domainInput, setDomainInput] = useState('')

  useEffect(() => {
    loadSettings()
    fetchMembers()
    loadInvitations()
  }, [])

  useEffect(() => {
    if (org) {
      setOrgName(org.name || '')
      setOrgLogoUrl(org.logo_url || '')
      setAllowDomainJoin(org.allow_domain_join || false)
      setAutoJoinDomains(org.auto_join_domains || [])
      setAutoJoinRole(org.auto_join_role || 'viewer')
    }
  }, [org])

  const loadInvitations = async () => {
    try {
      const data = await listInvitations()
      setInvitations(data)
    } catch { /* may not have permission */ }
  }

  const handleSaveOrg = async () => {
    if (!orgName.trim()) return
    setSavingOrg(true)
    try {
      await updateOrganization({
        name: orgName.trim(),
        logo_url: orgLogoUrl.trim() || undefined,
        allow_domain_join: allowDomainJoin,
        auto_join_domains: autoJoinDomains,
        auto_join_role: autoJoinRole,
      })
      await refetchOrg()
      toast.success('Organization updated')
    } catch (err: any) {
      toast.error(err.message || 'Failed to update')
    } finally {
      setSavingOrg(false)
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

  const handleRemoveMember = async (userId: string, userName: string) => {
    if (!confirm(`Remove ${userName || 'this member'} from the organization?`)) return
    try {
      await removeMember(userId)
      toast.success('Member removed')
      fetchMembers()
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove member')
    }
  }

  const handleAddDomain = () => {
    const domain = domainInput.trim().toLowerCase()
    if (!domain) return
    if (autoJoinDomains.includes(domain)) {
      toast.error('Domain already added')
      return
    }
    setAutoJoinDomains([...autoJoinDomains, domain])
    setDomainInput('')
  }

  const handleRemoveDomain = (domain: string) => {
    setAutoJoinDomains(autoJoinDomains.filter(d => d !== domain))
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

  const loadSettings = async () => {
    try {
      const supabase = createClient()

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Get user record
      const { data: userRecord } = await supabase
        .from('users')
        .select('id, email, full_name, avatar_url')
        .eq('auth_user_id', user.id)
        .single()

      if (!userRecord) {
        toast.error('User not found')
        return
      }

      setProfile(userRecord)

      // Get user role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', userRecord.id)
        .single()

      const role = (roleData as any)?.roles?.name || 'hr'
      setUserRole(role)

      // Load LLM models if admin
      if (role === 'admin') {
        try {
          console.log('Fetching available models...')
          const response = await apiClient.getAvailableModels()
          console.log('Models response:', response)

          if (response && response.models && Array.isArray(response.models)) {
            setAvailableModels(response.models)
            console.log('Loaded models:', response.models)
            if (response.models.length === 0) {
              toast.info('No models found. Pull models using Ollama CLI.')
            }
          } else {
            console.warn('Invalid models response:', response)
            setAvailableModels([])
          }
        } catch (error: any) {
          console.error('Error loading models:', error)
          console.error('Error details:', error.response?.data || error.message)

          const errorMessage = error.response?.data?.detail || error.message
          if (errorMessage.includes('ollama')) {
            toast.error('Ollama is not installed or not running. Please start Ollama.')
          } else if (error.code === 'ERR_NETWORK' || error.message.includes('Network Error')) {
            toast.error('Backend server is not running. Please start the FastAPI server.')
          } else {
            toast.error(`Failed to load models: ${errorMessage}`)
          }
          setAvailableModels([])
        }
      }

    } catch (error) {
      console.error('Error loading settings:', error)
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      const supabase = createClient()

      const { error } = await supabase
        .from('users')
        .update({
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)

      if (error) throw error

      toast.success('Profile updated successfully')
    } catch (error) {
      console.error('Error saving profile:', error)
      toast.error('Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonPageHeader />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your account and application preferences."
      />

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="flex w-full h-auto p-1 bg-slate-100 overflow-x-auto">
          <TabsTrigger value="profile" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
            <User className="h-4 w-4 mr-2" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="organization" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
            <Building2 className="h-4 w-4 mr-2" />
            Organization
          </TabsTrigger>
          <TabsTrigger value="members" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
            <Users className="h-4 w-4 mr-2" />
            Members
          </TabsTrigger>
          <TabsTrigger value="preferences" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
            <Settings2 className="h-4 w-4 mr-2" />
            Preferences
          </TabsTrigger>
          {isManager && (
            <TabsTrigger value="models" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <Bot className="h-4 w-4 mr-2" />
              LLM Models
            </TabsTrigger>
          )}
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card className="border border-slate-200 bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-slate-100">
                  <User className="h-4 w-4 text-slate-600" />
                </div>
                Profile Information
              </CardTitle>
              <CardDescription>
                Update your personal information and profile details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                <Input
                  id="email"
                  value={profile.email}
                  disabled
                  className="bg-slate-50 border-slate-200"
                />
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Email address is managed by your authentication provider
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-medium">Full Name</Label>
                <Input
                  id="fullName"
                  value={profile.full_name || ''}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  placeholder="Enter your full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="avatarUrl" className="text-sm font-medium">Avatar URL</Label>
                <Input
                  id="avatarUrl"
                  value={profile.avatar_url || ''}
                  onChange={(e) => setProfile({ ...profile, avatar_url: e.target.value })}
                  placeholder="https://example.com/avatar.jpg"
                />
                <p className="text-xs text-muted-foreground">
                  Provide a URL to your profile picture
                </p>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-md bg-slate-200">
                    <Shield className="h-4 w-4 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Current Role</p>
                    <p className="text-sm font-semibold capitalize text-indigo-600">
                      {userRole}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button
                  onClick={handleSaveProfile}
                  disabled={saving}
                >
                  {saving ? (
                    <Save className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Organization Tab */}
        <TabsContent value="organization">
          <Card className="border border-slate-200 bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-slate-100">
                  <Building2 className="h-4 w-4 text-slate-600" />
                </div>
                Organization Settings
              </CardTitle>
              <CardDescription>
                Manage your organization details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization Name</Label>
                <Input
                  id="org-name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  disabled={!isManager}
                  placeholder="My Organization"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-logo">Logo URL</Label>
                <Input
                  id="org-logo"
                  value={orgLogoUrl}
                  onChange={(e) => setOrgLogoUrl(e.target.value)}
                  disabled={!isManager}
                  placeholder="https://example.com/logo.png"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Plan</Label>
                  <p className="text-sm text-slate-500 capitalize">{org?.plan || 'free'}</p>
                </div>
                <div>
                  <Label>Slug</Label>
                  <p className="text-sm text-slate-500">{org?.slug}</p>
                </div>
                <div>
                  <Label>Your Role</Label>
                  <p className="text-sm text-slate-500 capitalize">{orgRole}</p>
                </div>
              </div>

              {/* Domain-Based Joining Settings - Owner/Admin Only */}
              {isManager && (
                <div className="pt-6 border-t space-y-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900 mb-1">Domain-Based Joining</h3>
                    <p className="text-sm text-slate-500">
                      Allow users with specific email domains to automatically join your organization
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="enable-domain-join">Enable Domain Joining</Label>
                      <p className="text-sm text-slate-500">
                        Users with matching email domains can join during signup
                      </p>
                    </div>
                    <Switch
                      id="enable-domain-join"
                      checked={allowDomainJoin}
                      onCheckedChange={setAllowDomainJoin}
                    />
                  </div>

                  {allowDomainJoin && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="domain-input">Allowed Domains</Label>
                        <div className="flex gap-2">
                          <Input
                            id="domain-input"
                            placeholder="example.com"
                            value={domainInput}
                            onChange={(e) => setDomainInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddDomain()}
                          />
                          <Button type="button" onClick={handleAddDomain} variant="outline">
                            Add
                          </Button>
                        </div>
                        {autoJoinDomains.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {autoJoinDomains.map((domain) => (
                              <Badge
                                key={domain}
                                variant="secondary"
                                className="pl-2.5 pr-1 py-1 text-sm"
                              >
                                {domain}
                                <button
                                  onClick={() => handleRemoveDomain(domain)}
                                  className="ml-1.5 hover:bg-slate-300 rounded p-0.5"
                                >
                                  <span className="sr-only">Remove {domain}</span>
                                  ×
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="auto-join-role">Default Role</Label>
                        <Select value={autoJoinRole} onValueChange={setAutoJoinRole}>
                          <SelectTrigger id="auto-join-role">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">Viewer</SelectItem>
                            <SelectItem value="interviewer">Interviewer</SelectItem>
                            <SelectItem value="hr">HR</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500">
                          Users who join via domain match will be assigned this role
                        </p>
                      </div>

                      {autoJoinDomains.length > 0 && (
                        <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                          <p className="text-sm text-slate-700">
                            <strong>Preview:</strong> Users with email addresses ending in{' '}
                            {autoJoinDomains.map((d, i) => (
                              <span key={d}>
                                <code className="px-1 py-0.5 rounded bg-white text-indigo-600">
                                  @{d}
                                </code>
                                {i < autoJoinDomains.length - 1 ? ', ' : ''}
                              </span>
                            ))}{' '}
                            will be able to join as <strong className="capitalize">{autoJoinRole}</strong>.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {isManager && (
                <div className="flex justify-end pt-4 border-t">
                  <Button onClick={handleSaveOrg} disabled={savingOrg || !orgName.trim()}>
                    <Save className="mr-2 h-4 w-4" />
                    {savingOrg ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members">
          <Card className="border border-slate-200 bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-slate-100">
                  <Users className="h-4 w-4 text-slate-600" />
                </div>
                Team Members
              </CardTitle>
              <CardDescription>
                Manage team members and invitations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Invite form */}
              {isManager && (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
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
                      {ORG_ROLES.map(r => (
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
              <div className="border border-slate-200 rounded-lg overflow-hidden">
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
                              {ORG_ROLES.map(r => (
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
                                onClick={() => handleRemoveMember(m.user_id, m.user_name || '')}
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
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences">
          <Card className="border border-slate-200 bg-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-slate-100">
                  <Settings2 className="h-4 w-4 text-slate-600" />
                </div>
                Application Preferences
              </CardTitle>
              <CardDescription>
                Customize your application experience and behavior
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="p-4 rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <Label className="text-sm font-medium">Default LLM Model</Label>
                      <p className="text-sm text-slate-500">
                        Choose the default AI model for processing resumes and tests
                      </p>
                    </div>
                    <select className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-white" defaultValue="Mistral 7B">
                      <option>Mistral 7B</option>
                      <option>Llama 2 7B</option>
                      <option>CodeLlama 7B</option>
                    </select>
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <Label className="text-sm font-medium">Results Per Page</Label>
                      <p className="text-sm text-slate-500">
                        Number of candidates or results to display per page
                      </p>
                    </div>
                    <select className="border border-slate-200 rounded-md px-3 py-2 text-sm bg-white" defaultValue="50">
                      <option>10</option>
                      <option>25</option>
                      <option>50</option>
                      <option>100</option>
                    </select>
                  </div>
                </div>

                <div className="p-4 rounded-lg border border-slate-200 bg-white">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <Label className="text-sm font-medium">Email Notifications</Label>
                      <p className="text-sm text-slate-500">
                        Receive email updates about evaluations and new candidates
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <Button>
                  <Save className="mr-2 h-4 w-4" />
                  Save Preferences
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LLM Models Tab (Admin Only) */}
        {isManager && (
          <TabsContent value="models">
            <Card className="border border-slate-200 bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-slate-100">
                    <Bot className="h-4 w-4 text-slate-600" />
                  </div>
                  LLM Model Configuration
                </CardTitle>
                <CardDescription>
                  Manage and configure AI models for resume matching and test evaluation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Available Models</Label>
                    <span className="text-sm text-muted-foreground">
                      {availableModels.length} model{availableModels.length !== 1 ? 's' : ''} installed
                    </span>
                  </div>
                  {availableModels.length > 0 ? (
                    <div className="space-y-3">
                      {availableModels.map((model, index) => (
                        <div
                          key={index}
                          className="group flex items-center justify-between p-4 border border-slate-200 rounded-lg bg-white hover:border-orange-300 hover:shadow-md transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-md bg-slate-100">
                              <Bot className="h-4 w-4 text-slate-500" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">{model.name}</p>
                              <p className="text-sm text-muted-foreground">
                                Size: {model.size || 'Unknown'}
                              </p>
                            </div>
                          </div>
                          <Button variant="outline" size="sm">
                            Set as Default
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-10 text-center">
                      <p className="text-sm font-medium text-slate-900 mb-1">No models found</p>
                      <p className="text-sm text-slate-400">Make sure Ollama is running with models pulled.</p>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-orange-500 inline-block"></span>
                    Pull New Model
                  </h3>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g., llama2:7b, mistral:7b, codellama:7b"
                      className="flex-1 border-slate-200 focus:border-orange-500 transition-colors"
                    />
                    <Button>
                      Pull Model
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <span className="h-1 w-1 rounded-full bg-slate-400 inline-block"></span>
                    This will download the specified model from the Ollama registry
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

      </Tabs>
    </div>
  )
}
