'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getInvitationByToken, acceptInvitation, joinViaLink } from '@/lib/api/organizations'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileCheck, Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'

export default function AcceptInvitePage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [invitation, setInvitation] = useState<any>(null)
  const [isJoinLink, setIsJoinLink] = useState(false)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    loadInvitation()
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
  }

  const loadInvitation = async () => {
    try {
      // First try as email invitation
      const data = await getInvitationByToken(token)
      setInvitation(data)
      setIsJoinLink(false)
    } catch (err: any) {
      // If that fails, treat it as a join link (validated on accept)
      setIsJoinLink(true)
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async () => {
    if (!user) {
      // Redirect to signup/login with token
      router.push(`/signup?invite=${token}`)
      return
    }

    setAccepting(true)
    try {
      if (isJoinLink) {
        // Join via shareable link
        const result = await joinViaLink(token)
        toast.success(result.already_member
          ? `You are already a member of ${result.org_name}`
          : `Successfully joined ${result.org_name} as an ${result.role}!`
        )
      } else {
        // Accept email invitation
        await acceptInvitation(token)
        toast.success('Invitation accepted successfully!')
      }
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Failed to join organization')
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-md">
          <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm mb-4">
            {error}
          </div>
          <Button variant="outline" onClick={() => router.push('/login')}>
            Go to Login
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white border border-slate-200 rounded-lg p-8 max-w-md w-full mx-4">
        <div className="text-center mb-6">
          <div className="inline-flex p-2 rounded-md bg-indigo-600 mb-4">
            {isJoinLink ? (
              <Users className="h-6 w-6 text-white" />
            ) : (
              <FileCheck className="h-6 w-6 text-white" />
            )}
          </div>
          <h1 className="text-xl font-semibold text-slate-900">
            {isJoinLink ? 'Join Organization' : 'You\u0027re invited to join'}
          </h1>
          {!isJoinLink && invitation && (
            <p className="text-2xl font-semibold text-slate-900 mt-1">
              {invitation.org_name}
            </p>
          )}
        </div>

        {!isJoinLink && invitation && (
          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Role</span>
              <Badge variant="outline" className="capitalize">{invitation.role}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Invited as</span>
              <span className="text-slate-900">{invitation.email}</span>
            </div>
          </div>
        )}

        {isJoinLink && (
          <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900">
              You'll be joining as an <strong>interviewer</strong>. Your role can be changed later by an admin.
            </p>
          </div>
        )}

        {user ? (
          <Button
            className="w-full"
            onClick={handleAccept}
            disabled={accepting}
          >
            {accepting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Joining...
              </>
            ) : (
              'Accept Invitation'
            )}
          </Button>
        ) : (
          <div className="space-y-3">
            <Button className="w-full" onClick={handleAccept}>
              Sign up to join
            </Button>
            <p className="text-center text-xs text-slate-500">
              Already have an account?{' '}
              <a
                href={`/login?redirect=/invite/${token}`}
                className="text-indigo-600 hover:underline"
              >
                Log in
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
