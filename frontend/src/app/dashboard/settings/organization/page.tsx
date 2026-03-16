'use client'

import { useState } from 'react'
import { useOrg } from '@/contexts/OrganizationContext'
import { updateOrganization } from '@/lib/api/organizations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

export default function OrganizationSettingsPage() {
  const { org, role, refetchOrg, canManage } = useOrg()
  const [name, setName] = useState(org?.name || '')
  const [logoUrl, setLogoUrl] = useState(org?.logo_url || '')
  const [saving, setSaving] = useState(false)

  // Domain join settings
  const [allowDomainJoin, setAllowDomainJoin] = useState(org?.allow_domain_join || false)
  const [autoJoinDomains, setAutoJoinDomains] = useState<string[]>(org?.auto_join_domains || [])
  const [autoJoinRole, setAutoJoinRole] = useState(org?.auto_join_role || 'viewer')

  // Sync state when org loads
  if (org && !name && org.name) {
    setName(org.name)
    if (org.logo_url) setLogoUrl(org.logo_url)
    if (org.allow_domain_join !== undefined) setAllowDomainJoin(org.allow_domain_join)
    if (org.auto_join_domains) setAutoJoinDomains(org.auto_join_domains)
    if (org.auto_join_role) setAutoJoinRole(org.auto_join_role)
  }

  const handleSave = async () => {
    if (!name.trim()) return

    // Validate domain settings if enabled
    if (allowDomainJoin && autoJoinDomains.length === 0) {
      toast.error('Please add at least one allowed domain')
      return
    }

    setSaving(true)
    try {
      await updateOrganization({
        name: name.trim(),
        logo_url: logoUrl.trim() || undefined,
        allow_domain_join: allowDomainJoin,
        auto_join_domains: autoJoinDomains,
        auto_join_role: autoJoinRole,
      })
      await refetchOrg()
      toast.success('Organization updated')
    } catch (err: any) {
      toast.error(err.message || 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  const handleDomainsChange = (value: string) => {
    const domains = value.split(',').map(d => d.trim()).filter(Boolean)
    setAutoJoinDomains(domains)
  }

  const isEditable = canManage()

  // Debug logging
  console.log('🔍 Debug:', { org, role, isEditable, canManageResult: canManage() })

  return (
    <div className="space-y-6">
      <PageHeader title="Organization Settings" />

      <div className="max-w-2xl space-y-6">
        {/* Basic Settings Card */}
        <Card className="border border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="text-xl text-slate-900">Basic Information</CardTitle>
            <CardDescription>
              Update your organization's name and branding
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="org-name" className="text-sm font-medium text-slate-700">
                Organization Name
              </Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isEditable}
                placeholder="My Organization"
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="org-logo" className="text-sm font-medium text-slate-700">
                Logo URL
              </Label>
              <Input
                id="org-logo"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                disabled={!isEditable}
                placeholder="https://example.com/logo.png"
                className="mt-2"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Plan</Label>
              <p className="text-sm text-slate-500 capitalize mt-1">{org?.plan || 'free'}</p>
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Slug</Label>
              <p className="text-sm text-slate-500 mt-1">{org?.slug}</p>
            </div>

            <div>
              <Label className="text-sm font-medium text-slate-700">Your Role</Label>
              <p className="text-sm text-slate-500 capitalize mt-1">{role}</p>
            </div>
          </CardContent>
        </Card>

        {/* Domain-Based Joining Card */}
        {isEditable && (
          <Card className="border border-slate-200 bg-white">
            <CardHeader>
              <CardTitle className="text-xl text-slate-900">Domain-Based Joining</CardTitle>
              <CardDescription>
                Allow users with matching email domains to join automatically during signup
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Enable Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="allow-domain-join" className="text-sm font-medium text-slate-700">
                    Enable Domain Joining
                  </Label>
                  <p className="text-xs text-slate-500 mt-1">
                    Users with whitelisted email domains can join without invitation
                  </p>
                </div>
                <Switch
                  id="allow-domain-join"
                  checked={allowDomainJoin}
                  onCheckedChange={setAllowDomainJoin}
                />
              </div>

              {allowDomainJoin && (
                <>
                  {/* Whitelisted Domains */}
                  <div>
                    <Label htmlFor="auto-join-domains" className="text-sm font-medium text-slate-700">
                      Allowed Domains
                    </Label>
                    <p className="text-xs text-slate-500 mt-1 mb-2">
                      Enter email domains (comma-separated). Example: acme.com, acme.io
                    </p>
                    <Input
                      id="auto-join-domains"
                      type="text"
                      value={autoJoinDomains.join(', ')}
                      onChange={(e) => handleDomainsChange(e.target.value)}
                      placeholder="company.com, company.io"
                    />
                  </div>

                  {/* Default Role */}
                  <div>
                    <Label htmlFor="auto-join-role" className="text-sm font-medium text-slate-700">
                      Default Role
                    </Label>
                    <p className="text-xs text-slate-500 mt-1 mb-2">
                      Role assigned to users who join via domain matching
                    </p>
                    <Select value={autoJoinRole} onValueChange={setAutoJoinRole}>
                      <SelectTrigger id="auto-join-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer (Read-only)</SelectItem>
                        <SelectItem value="interviewer">Interviewer</SelectItem>
                        <SelectItem value="hr">HR Manager</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Preview */}
                  {autoJoinDomains.length > 0 && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs text-blue-900">
                        <strong>Preview:</strong> Users with emails ending in{' '}
                        {autoJoinDomains.map((d, i) => (
                          <span key={i}>
                            <code className="bg-blue-100 px-1 rounded text-blue-900">@{d}</code>
                            {i < autoJoinDomains.length - 1 ? ', ' : ''}
                          </span>
                        ))}{' '}
                        will be able to join as <strong>{autoJoinRole}</strong> during signup.
                      </p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Save Button */}
        {isEditable && (
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {saving ? 'Saving...' : 'Save All Settings'}
          </Button>
        )}
      </div>
    </div>
  )
}
