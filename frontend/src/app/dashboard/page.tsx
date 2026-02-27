'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, FileText, TrendingUp, Briefcase, ArrowRight, Sparkles, Clock, Award } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface DashboardStats {
  jobsCount: number
  resumesCount: number
  avgScore: string
  testsCount: number
  recentJobs: Array<{
    id: string
    title: string
    created_at: string
  }>
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    jobsCount: 0,
    resumesCount: 0,
    avgScore: '0',
    testsCount: 0,
    recentJobs: [],
  })
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setUserName(user.user_metadata?.full_name || user.email || '')

      const { data: userRecord } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!userRecord) return

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', userRecord.id)
        .single()

      const isAdmin = (roleData as any)?.roles?.name === 'admin'

      let jobsQuery = supabase
        .from('job_descriptions')
        .select('id', { count: 'exact', head: true })

      if (!isAdmin) {
        jobsQuery = jobsQuery.eq('created_by', userRecord.id)
      }

      const { count: jobsCount } = await jobsQuery

      let resumesQuery = supabase
        .from('resumes')
        .select('id, match_score', { count: 'exact' })

      if (!isAdmin) {
        const { data: userJobs } = await supabase
          .from('job_descriptions')
          .select('id')
          .eq('created_by', userRecord.id)

        const jobIds = userJobs?.map(j => j.id) || []
        if (jobIds.length > 0) {
          resumesQuery = resumesQuery.in('job_description_id', jobIds)
        }
      }

      const { data: resumesData, count: resumesCount } = await resumesQuery

      const scores = resumesData?.map(r => r.match_score).filter(s => s !== null && s !== undefined) || []
      const avgScore = scores.length > 0
        ? (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)
        : '0'

      let testsQuery = supabase
        .from('tests')
        .select('id', { count: 'exact', head: true })

      if (!isAdmin) {
        testsQuery = testsQuery.eq('created_by', userRecord.id)
      }

      const { count: testsCount } = await testsQuery

      const { data: recentJobs } = await supabase
        .from('job_descriptions')
        .select('id, title, created_at')
        .eq('created_by', userRecord.id)
        .order('created_at', { ascending: false })
        .limit(3)

      setStats({
        jobsCount: jobsCount || 0,
        resumesCount: resumesCount || 0,
        avgScore,
        testsCount: testsCount || 0,
        recentJobs: recentJobs || [],
      })
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    {
      title: 'Active Jobs',
      value: stats.jobsCount.toString(),
      description: 'Job descriptions posted',
      icon: Briefcase,
      gradient: 'from-blue-500 to-cyan-500',
      href: '/dashboard/resume-matching/jobs',
    },
    {
      title: 'Total Candidates',
      value: stats.resumesCount.toString(),
      description: 'Resumes processed',
      icon: Users,
      gradient: 'from-purple-500 to-pink-500',
      href: '/dashboard/resume-matching/jobs',
    },
    {
      title: 'Avg Match Score',
      value: `${stats.avgScore}%`,
      description: 'Resume matching',
      icon: Award,
      gradient: 'from-green-500 to-emerald-500',
      href: '/dashboard/analytics',
    },
    {
      title: 'Active Tests',
      value: stats.testsCount.toString(),
      description: 'Tests created',
      icon: FileText,
      gradient: 'from-orange-500 to-red-500',
      href: '/dashboard/test-evaluation/tests',
    },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Clean Header */}
      <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-8 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-primary/80">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Welcome back</span>
            </div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">{userName}</h1>
            <p className="text-lg text-slate-600">
              Here's what's happening with your hiring process today
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, index) => {
          const Icon = stat.icon
          return (
            <Link
              key={stat.title}
              href={stat.href}
              className="group"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <Card className="relative overflow-hidden transition-all duration-200 hover:shadow-lg border border-slate-200 bg-white">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <div className={`p-2.5 rounded-xl bg-gradient-to-br ${stat.gradient} shadow-sm`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-slate-900">
                    {stat.value}
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    {stat.description}
                    <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </p>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Quick Actions */}
        <Card className="border border-slate-200 shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Sparkles className="h-5 w-5 text-primary" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link
              href="/dashboard/resume-matching"
              className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-primary/40 hover:bg-slate-50 transition-all group"
            >
              <div>
                <h3 className="font-semibold mb-1 flex items-center gap-2 text-slate-900">
                  <Briefcase className="h-4 w-4 text-primary" />
                  Upload Job Description
                </h3>
                <p className="text-sm text-muted-foreground">
                  Start a new resume matching round
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-primary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </Link>

            <Link
              href="/dashboard/test-evaluation"
              className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-orange-500/40 hover:bg-slate-50 transition-all group"
            >
              <div>
                <h3 className="font-semibold mb-1 flex items-center gap-2 text-slate-900">
                  <FileText className="h-4 w-4 text-orange-500" />
                  Create Test
                </h3>
                <p className="text-sm text-muted-foreground">
                  Upload a question paper for evaluation
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-orange-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </Link>

            <Link
              href="/dashboard/analytics"
              className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-green-500/40 hover:bg-slate-50 transition-all group"
            >
              <div>
                <h3 className="font-semibold mb-1 flex items-center gap-2 text-slate-900">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  View Analytics
                </h3>
                <p className="text-sm text-muted-foreground">
                  See detailed insights and statistics
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-green-500 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </Link>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border border-slate-200 shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Clock className="h-5 w-5 text-primary" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentJobs && stats.recentJobs.length > 0 ? (
              <div className="space-y-3">
                {stats.recentJobs.map((job, index) => (
                  <Link
                    key={job.id}
                    href={`/dashboard/resume-matching/${job.id}/candidates`}
                    className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:border-primary/40 hover:bg-slate-50 transition-all group"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Briefcase className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium text-sm text-slate-900 group-hover:text-primary transition-colors">
                          {job.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(job.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="mb-3 inline-flex p-4 rounded-full bg-slate-100">
                  <Clock className="h-8 w-8 text-slate-400" />
                </div>
                <p className="text-sm text-muted-foreground">
                  No recent activity yet. Start by uploading a job description!
                </p>
                <Button asChild className="mt-4" variant="outline">
                  <Link href="/dashboard/resume-matching">
                    Get Started
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
