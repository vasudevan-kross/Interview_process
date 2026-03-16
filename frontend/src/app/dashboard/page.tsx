'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, FileText, Briefcase, ArrowRight, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonStatCards } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useOrganization } from '@/hooks/useOrganization'

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
  const { org } = useOrganization()
  const [stats, setStats] = useState<DashboardStats>({
    jobsCount: 0,
    resumesCount: 0,
    avgScore: '0',
    testsCount: 0,
    recentJobs: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (org) {
      fetchDashboardData()
    }
  }, [org])

  const fetchDashboardData = async () => {
    try {
      const supabase = createClient()

      if (!org?.id) return

      // Count jobs in this organization
      const { count: jobsCount } = await supabase
        .from('job_descriptions')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org.id)
        .is('deleted_at', null)

      // Count resumes and get scores for jobs in this organization
      const { data: orgJobs } = await supabase
        .from('job_descriptions')
        .select('id')
        .eq('org_id', org.id)
        .is('deleted_at', null)

      const jobIds = orgJobs?.map(j => j.id) || []

      let resumesData: any[] = []
      let resumesCount = 0

      if (jobIds.length > 0) {
        const { data, count } = await supabase
          .from('resumes')
          .select('id, match_score', { count: 'exact' })
          .in('job_description_id', jobIds)

        resumesData = data || []
        resumesCount = count || 0
      }

      const scores = resumesData?.map(r => r.match_score).filter(s => s !== null && s !== undefined) || []
      const avgScore = scores.length > 0
        ? (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)
        : '0'

      // Count tests in this organization
      const { count: testsCount } = await supabase
        .from('tests')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org.id)

      // Get recent jobs in this organization
      const { data: recentJobs } = await supabase
        .from('job_descriptions')
        .select('id, title, created_at')
        .eq('org_id', org.id)
        .is('deleted_at', null)
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
      toast.error('Failed to load dashboard data.')
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
      href: '/dashboard/resume-matching/jobs',
    },
    {
      title: 'Total Candidates',
      value: stats.resumesCount.toString(),
      description: 'Resumes processed',
      icon: Users,
      href: '/dashboard/resume-matching/jobs',
    },
    {
      title: 'Avg Match Score',
      value: `${stats.avgScore}%`,
      description: 'Resume matching',
      icon: ArrowRight,
      href: '/dashboard/resume-matching/jobs',
    },
    {
      title: 'Active Tests',
      value: stats.testsCount.toString(),
      description: 'Tests created',
      icon: FileText,
      href: '/dashboard/test-evaluation/tests',
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Here's what's happening with your hiring process today."
      />

      {loading ? (
        <SkeletonStatCards />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((stat) => {
            const Icon = stat.icon
            return (
              <Link key={stat.title} href={stat.href} className="group">
                <Card className="relative transition-all duration-200 hover:shadow-card-hover border border-slate-200 bg-white">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-slate-500">
                      {stat.title}
                    </CardTitle>
                    <Icon className="h-4 w-4 text-slate-300" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold tabular-nums text-slate-900">
                      {stat.value}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{stat.description}</p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Quick Actions */}
        <Card className="border border-slate-200 shadow-card bg-white">
          <CardHeader>
            <CardTitle className="text-slate-900">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link
              href="/dashboard/resume-matching"
              className="flex items-center justify-between p-3 rounded-md border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all group"
            >
              <div>
                <h3 className="font-medium text-sm text-slate-900">Upload Job Description</h3>
                <p className="text-xs text-slate-400 mt-0.5">Start a new resume matching round</p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </Link>

            <Link
              href="/dashboard/test-evaluation"
              className="flex items-center justify-between p-3 rounded-md border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all group"
            >
              <div>
                <h3 className="font-medium text-sm text-slate-900">Create Test</h3>
                <p className="text-xs text-slate-400 mt-0.5">Upload a question paper for evaluation</p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </Link>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border border-slate-200 shadow-card bg-white">
          <CardHeader>
            <CardTitle className="text-slate-900">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentJobs && stats.recentJobs.length > 0 ? (
              <div className="space-y-2">
                {stats.recentJobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/dashboard/resume-matching/${job.id}/candidates`}
                    className="flex items-center justify-between p-3 rounded-md border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-slate-300 shrink-0" />
                      <div>
                        <div className="font-medium text-sm text-slate-900">
                          {job.title}
                        </div>
                        <div className="text-xs text-slate-400">
                          {new Date(job.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center">
                <p className="text-sm font-medium text-slate-900 mb-1">No recent activity</p>
                <p className="text-sm text-slate-400 mb-4">Start by uploading a job description.</p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/resume-matching">Get Started</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
