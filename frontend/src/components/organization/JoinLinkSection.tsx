'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Copy, RefreshCw, Link as LinkIcon, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { generateJoinLink, getJoinLinkInfo, toggleJoinLink } from '@/lib/api/organizations'

const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || (typeof window !== 'undefined' ? window.location.origin : '')

export function JoinLinkSection() {
  const [loading, setLoading] = useState(true)
  const [joinLinkToken, setJoinLinkToken] = useState<string | null>(null)
  const [joinLinkEnabled, setJoinLinkEnabled] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    loadJoinLinkInfo()
  }, [])

  async function loadJoinLinkInfo() {
    try {
      setLoading(true)
      const data = await getJoinLinkInfo()
      setJoinLinkToken(data.join_link_token)
      setJoinLinkEnabled(data.join_link_enabled || false)
    } catch (error: any) {
      console.error('Failed to load join link info:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate() {
    try {
      setGenerating(true)
      const data = await generateJoinLink()
      setJoinLinkToken(data.join_link_token)
      setJoinLinkEnabled(data.join_link_enabled)
      toast.success('Join link generated successfully!')
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate join link')
    } finally {
      setGenerating(false)
    }
  }

  async function handleToggle(enabled: boolean) {
    try {
      setToggling(true)
      await toggleJoinLink(enabled)
      setJoinLinkEnabled(enabled)
      toast.success(enabled ? 'Join link enabled' : 'Join link disabled')
    } catch (error: any) {
      toast.error(error.message || 'Failed to update join link')
    } finally {
      setToggling(false)
    }
  }

  function handleCopyLink() {
    if (!joinLinkToken) return
    const joinLink = `${FRONTEND_URL}/invite/${joinLinkToken}`
    navigator.clipboard.writeText(joinLink)
    toast.success('Join link copied to clipboard!')
  }

  const joinLink = joinLinkToken ? `${FRONTEND_URL}/invite/${joinLinkToken}` : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LinkIcon className="h-5 w-5" />
          Join Link
        </CardTitle>
        <CardDescription>
          Generate a shareable link that allows anyone to join your organization as an interviewer
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            {!joinLinkToken ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center">
                <p className="text-sm text-slate-600 mb-4">
                  No join link has been generated yet
                </p>
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <LinkIcon className="mr-2 h-4 w-4" />
                      Generate Join Link
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Enable/Disable Toggle */}
                <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="join-link-enabled" className="text-base">
                      Enable Join Link
                    </Label>
                    <p className="text-sm text-slate-500">
                      {joinLinkEnabled ? 'Anyone with the link can join' : 'Link is currently disabled'}
                    </p>
                  </div>
                  <Switch
                    id="join-link-enabled"
                    checked={joinLinkEnabled}
                    onCheckedChange={handleToggle}
                    disabled={toggling}
                  />
                </div>

                {/* Join Link Display */}
                {joinLink && (
                  <div className="space-y-2">
                    <Label>Share this link</Label>
                    <div className="flex gap-2">
                      <div className="flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-mono break-all">
                        {joinLink}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopyLink}
                        title="Copy link"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Regenerate Button */}
                <div className="flex items-center justify-between pt-2">
                  <p className="text-sm text-slate-500">
                    Regenerating the link will invalidate the old one
                  </p>
                  <Button
                    variant="outline"
                    onClick={handleGenerate}
                    disabled={generating}
                  >
                    {generating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Regenerating...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Regenerate
                      </>
                    )}
                  </Button>
                </div>

                {/* Info Box */}
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                  <p className="text-sm text-blue-900">
                    <strong>Note:</strong> Members who join via this link will automatically be assigned the <strong>interviewer</strong> role.
                    You can change their role later from the Members tab.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
