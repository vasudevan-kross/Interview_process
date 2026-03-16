'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Sparkles, Loader2, ArrowRight, CheckCircle2, Building2, Plus } from 'lucide-react'
import { getInvitationByToken, acceptInvitation, getDiscoverableOrganizations, joinOrganization } from '@/lib/api/organizations'

export default function SignupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get('invite')
  const [loading, setLoading] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [invitation, setInvitation] = useState<any>(null)
  const [isJoinLink, setIsJoinLink] = useState(false)

  // Organization discovery state
  const [discoverableOrgs, setDiscoverableOrgs] = useState<any[]>([])
  const [selectedOrgToJoin, setSelectedOrgToJoin] = useState<string | null>(null)
  const [creatingOwnOrg, setCreatingOwnOrg] = useState(false)
  const [checkingOrgs, setCheckingOrgs] = useState(false)

  useEffect(() => {
    if (inviteToken) {
      // Try as email invitation first
      getInvitationByToken(inviteToken)
        .then((data) => {
          setInvitation(data)
          setEmail(data.email || '')
          setIsJoinLink(false)
        })
        .catch(() => {
          // If that fails, treat it as a join link (will be validated after signup)
          setIsJoinLink(true)
        })
    }
  }, [inviteToken])

  // Trigger organization discovery when email changes
  const handleEmailBlur = async () => {
    if (!email || !email.includes('@') || inviteToken) return

    setCheckingOrgs(true)
    try {
      const orgs = await getDiscoverableOrganizations(email)
      setDiscoverableOrgs(orgs)

      // Default to creating own org if no matches
      if (orgs.length === 0) {
        setCreatingOwnOrg(true)
      }
    } catch (err) {
      console.error('Failed to fetch discoverable orgs:', err)
      setCreatingOwnOrg(true) // Fallback to org creation
    } finally {
      setCheckingOrgs(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const supabase = createClient()

      // Create Supabase Auth account
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            // Only include org_name if creating own org
            org_name: creatingOwnOrg ? organizationName : undefined,
          },
        },
      })

      if (error) {
        toast.error(error.message)
        return
      }

      if (data.user) {
        // If there's an invite token, handle email invitation vs join link
        if (inviteToken) {
          if (isJoinLink) {
            // For join links, redirect back to invite page to complete the join
            toast.success('Account created! Completing your organization join...')
            router.push(`/invite/${inviteToken}`)
            return
          } else {
            // For email invitations, accept directly
            try {
              await acceptInvitation(inviteToken)
              toast.success('Account created and invitation accepted!')
              router.push('/dashboard')
              return
            } catch {
              // Invitation accept may fail if email verification required
              toast.success('Account created! Please verify your email, then the invitation will be accepted on login.')
            }
          }
        }
        // If joining an existing org, call join endpoint after signup
        else if (selectedOrgToJoin) {
          try {
            await joinOrganization(selectedOrgToJoin)
            toast.success('Account created and joined organization!')
          } catch (joinErr: any) {
            toast.warning(
              'Account created, but could not join organization automatically. ' +
              'Please contact the organization admin or verify your email first.'
            )
          }
        } else {
          toast.success('Account created successfully! Please check your email to verify.')
        }
        router.push(inviteToken ? '/dashboard' : '/login')
      }
    } catch (error) {
      toast.error('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-slate-950 text-white overflow-hidden flex">
      {/* Background Elements */}
      <div className="fixed inset-0 pointer-events-none z-[-1]">
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute top-0 inset-x-0 h-[800px] bg-[radial-gradient(ellipse_100%_100%_at_50%_0%,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20" />
      </div>

      {/* Left panel — form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center justify-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">
              AI Interview
            </span>
          </div>

          {/* Card */}
          <div className="relative">
            <div className="relative bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl shadow-black/50">
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-white mb-1">
                  {invitation ? `Join ${invitation.org_name}` : isJoinLink ? 'Join Organization' : 'Create your account'}
                </h1>
                <p className="text-slate-400 text-sm">
                  {invitation
                    ? `You've been invited as ${invitation.role}`
                    : isJoinLink
                    ? 'Create an account to join the organization'
                    : 'Start automating your hiring process today'}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName" className="text-sm font-medium text-slate-300">
                    Full Name
                  </Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    disabled={loading}
                    className="bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500/20 h-11"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-sm font-medium text-slate-300">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={handleEmailBlur}
                    required
                    disabled={loading || !!invitation}
                    className="bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500/20 h-11"
                  />
                  {checkingOrgs && (
                    <p className="text-xs text-slate-400 mt-1">
                      <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
                      Checking for organizations...
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm font-medium text-slate-300">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    disabled={loading}
                    className="bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500/20 h-11"
                  />
                </div>

                {/* Organization Discovery Section */}
                {email && email.includes('@') && discoverableOrgs.length > 0 && !inviteToken && (
                  <div className="space-y-3 pt-2">
                    <Label className="text-sm font-medium text-slate-300">
                      Choose an option:
                    </Label>

                    {/* Discovered Organizations */}
                    {discoverableOrgs.map((org) => (
                      <button
                        key={org.id}
                        type="button"
                        onClick={() => {
                          setSelectedOrgToJoin(org.id)
                          setCreatingOwnOrg(false)
                        }}
                        className={`w-full p-3 rounded-lg border-2 transition-all ${
                          selectedOrgToJoin === org.id
                            ? 'border-indigo-500 bg-indigo-500/10'
                            : 'border-slate-800 bg-slate-900/50 hover:border-indigo-500/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0">
                            {org.logo_url ? (
                              <img src={org.logo_url} alt={org.name} className="h-10 w-10 rounded-lg" />
                            ) : (
                              <div className="h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center">
                                <Building2 className="h-6 w-6 text-slate-400" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 text-left">
                            <p className="font-semibold text-white text-sm">{org.name}</p>
                            <p className="text-xs text-slate-400">
                              Join as {org.auto_role.charAt(0).toUpperCase() + org.auto_role.slice(1)}
                            </p>
                          </div>
                          {selectedOrgToJoin === org.id && (
                            <CheckCircle2 className="h-5 w-5 text-indigo-400" />
                          )}
                        </div>
                      </button>
                    ))}

                    {/* Create Own Org Option */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOrgToJoin(null)
                        setCreatingOwnOrg(true)
                      }}
                      className={`w-full p-3 rounded-lg border-2 transition-all ${
                        creatingOwnOrg
                          ? 'border-indigo-500 bg-indigo-500/10'
                          : 'border-slate-800 bg-slate-900/50 hover:border-indigo-500/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                          <div className="h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center">
                            <Plus className="h-6 w-6 text-slate-400" />
                          </div>
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-semibold text-white text-sm">Create My Own Organization</p>
                          <p className="text-xs text-slate-400">
                            Start fresh with your own workspace
                          </p>
                        </div>
                        {creatingOwnOrg && (
                          <CheckCircle2 className="h-5 w-5 text-indigo-400" />
                        )}
                      </div>
                    </button>
                  </div>
                )}

                {/* Selected Org Badge */}
                {selectedOrgToJoin && !inviteToken && (
                  <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
                    <p className="text-sm text-indigo-300">
                      <CheckCircle2 className="inline h-4 w-4 mr-1" />
                      You'll join{' '}
                      <strong className="text-white">
                        {discoverableOrgs.find(o => o.id === selectedOrgToJoin)?.name}
                      </strong>
                    </p>
                  </div>
                )}

                {/* Organization Name Field - Only show if creating own org */}
                {creatingOwnOrg && !inviteToken && (
                  <div className="space-y-1.5">
                    <Label htmlFor="organizationName" className="text-sm font-medium text-slate-300">
                      Organization Name
                    </Label>
                    <Input
                      id="organizationName"
                      type="text"
                      placeholder="Acme Corp"
                      value={organizationName}
                      onChange={(e) => setOrganizationName(e.target.value)}
                      required
                      disabled={loading}
                      className="bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500/20 h-11"
                    />
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all duration-300 group rounded-lg"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Create account
                      <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-500">
                Already have an account?{' '}
                <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Right panel — benefits (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12">
        {/* Logo */}
        <div className="flex justify-end">
          <Link href="/" className="flex items-center gap-3 group w-fit">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">
              AI Interview
            </span>
          </Link>
        </div>

        {/* Center content */}
        <div className="space-y-8">
          <div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="text-4xl font-black mb-4 leading-tight text-white"
            >
              Everything you need<br />to hire better.
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="text-slate-400 text-lg leading-relaxed max-w-sm"
            >
              Join teams that cut hiring time by 80% using AI-driven screening, grading, and interviews.
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="space-y-3"
          >
            {[
              'Rank hundreds of resumes in seconds',
              'Grade 50 answer sheets simultaneously',
              'AI phone screens candidates automatically',
              'Live coding tests with instant AI scoring',
              'Full analytics dashboard included',
              'No credit card required to start',
            ].map((benefit) => (
              <div key={benefit} className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <span className="text-sm text-slate-300">{benefit}</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Bottom stat row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="grid grid-cols-3 gap-4"
        >
          {[
            { value: '80%', label: 'Time saved' },
            { value: '95%', label: 'Accuracy' },
            { value: '50+', label: 'Candidates/day' },
          ].map((stat) => (
            <div key={stat.label} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
              <div className="text-xl font-bold text-white">
                {stat.value}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
