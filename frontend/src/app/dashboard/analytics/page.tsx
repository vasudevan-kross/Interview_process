'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  TrendingUp,
  Users,
  FileText,
  ClipboardList,
  Award,
  BarChart3,
  Sparkles
} from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  RadialBarChart,
  RadialBar,
} from 'recharts'

interface AnalyticsData {
  totalJobs: number
  totalResumes: number
  totalTests: number
  totalAnswerSheets: number
  averageMatchScore: number
  topMatchScore: number
  scoreDistribution: {
    excellent: number
    good: number
    fair: number
    poor: number
  }
}

const COLORS = {
  excellent: '#10b981',
  good: '#3b82f6',
  fair: '#f59e0b',
  poor: '#ef4444',
}

export default function AnalyticsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string>('user')
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalJobs: 0,
    totalResumes: 0,
    totalTests: 0,
    totalAnswerSheets: 0,
    averageMatchScore: 0,
    topMatchScore: 0,
    scoreDistribution: {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0
    }
  })

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const fetchAnalytics = async () => {
    try {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: userRecord } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!userRecord) {
        toast.error('User not found')
        return
      }

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', userRecord.id)
        .single()

      const role = (roleData as any)?.roles?.name || 'hr'
      setUserRole(role)

      const isAdmin = role === 'admin'

      let jobsQuery = supabase.from('job_descriptions').select('id', { count: 'exact', head: true })
      if (!isAdmin) {
        jobsQuery = jobsQuery.eq('created_by', userRecord.id)
      }
      const { count: jobsCount } = await jobsQuery

      let resumesQuery = supabase.from('resumes').select('id, match_score', { count: 'exact' })
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

      let testsQuery = supabase.from('tests').select('id', { count: 'exact', head: true })
      if (!isAdmin) {
        testsQuery = testsQuery.eq('created_by', userRecord.id)
      }
      const { count: testsCount } = await testsQuery

      let answersQuery = supabase.from('answer_sheets').select('id', { count: 'exact', head: true })
      if (!isAdmin) {
        const { data: userTests } = await supabase
          .from('tests')
          .select('id')
          .eq('created_by', userRecord.id)

        const testIds = userTests?.map(t => t.id) || []
        if (testIds.length > 0) {
          answersQuery = answersQuery.in('test_id', testIds)
        }
      }
      const { count: answersCount } = await answersQuery

      const scores = resumesData?.map(r => r.match_score).filter(s => s !== null) || []
      const avgScore = scores.length > 0
        ? scores.reduce((sum, score) => sum + score, 0) / scores.length
        : 0
      const topScore = scores.length > 0 ? Math.max(...scores) : 0

      const distribution = {
        excellent: scores.filter(s => s >= 80).length,
        good: scores.filter(s => s >= 60 && s < 80).length,
        fair: scores.filter(s => s >= 40 && s < 60).length,
        poor: scores.filter(s => s < 40).length
      }

      setAnalytics({
        totalJobs: jobsCount || 0,
        totalResumes: resumesCount || 0,
        totalTests: testsCount || 0,
        totalAnswerSheets: answersCount || 0,
        averageMatchScore: avgScore,
        topMatchScore: topScore,
        scoreDistribution: distribution
      })

    } catch (error) {
      console.error('Error fetching analytics:', error)
      toast.error('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  const pieData = [
    { name: 'Excellent (80-100%)', value: analytics.scoreDistribution.excellent, color: COLORS.excellent },
    { name: 'Good (60-79%)', value: analytics.scoreDistribution.good, color: COLORS.good },
    { name: 'Fair (40-59%)', value: analytics.scoreDistribution.fair, color: COLORS.fair },
    { name: 'Poor (0-39%)', value: analytics.scoreDistribution.poor, color: COLORS.poor },
  ]

  const radialData = [
    { name: 'Average', value: analytics.averageMatchScore, fill: '#3b82f6' },
    { name: 'Top', value: analytics.topMatchScore, fill: '#10b981' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-500/90 to-emerald-600 p-8 text-white shadow-xl">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-6 w-6" />
            <span className="text-sm font-medium opacity-90">
              {userRole === 'admin' ? 'System-wide analytics' : 'Your activity analytics'}
            </span>
          </div>
          <h1 className="text-4xl font-bold mb-2">Analytics Dashboard</h1>
          <p className="text-lg opacity-90">
            Track your hiring performance and insights
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-0 shadow-lg overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent"></div>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
              <FileText className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{analytics.totalJobs}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Job descriptions posted
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent"></div>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Resumes</CardTitle>
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
              <Users className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{analytics.totalResumes}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Candidates evaluated
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent"></div>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Tests</CardTitle>
            <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-red-500">
              <ClipboardList className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{analytics.totalTests}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Tests created
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent"></div>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Answer Sheets</CardTitle>
            <div className="p-2 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500">
              <Award className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{analytics.totalAnswerSheets}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Evaluated submissions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {analytics.totalResumes > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Score Distribution Pie Chart */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Score Distribution
              </CardTitle>
              <CardDescription>Candidate quality breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => value > 0 ? `${value}` : ''}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Match Score Statistics */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Match Score Performance
              </CardTitle>
              <CardDescription>Resume matching statistics</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <RadialBarChart
                  cx="50%"
                  cy="50%"
                  innerRadius="20%"
                  outerRadius="90%"
                  data={radialData}
                  startAngle={180}
                  endAngle={0}
                >
                  <RadialBar
                    label={{ position: 'insideStart', fill: '#fff' }}
                    background
                    dataKey="value"
                  />
                  <Legend iconSize={10} layout="horizontal" verticalAlign="bottom" align="center" />
                  <Tooltip />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Average Score</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {analytics.averageMatchScore.toFixed(1)}%
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Top Score</p>
                  <p className="text-2xl font-bold text-green-600">
                    {analytics.topMatchScore.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty State */}
      {analytics.totalJobs === 0 && analytics.totalTests === 0 && (
        <Card className="border-0 shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="mb-4 inline-flex p-6 rounded-full bg-gradient-to-br from-primary/10 to-primary/5">
              <BarChart3 className="h-12 w-12 text-primary" />
            </div>
            <h3 className="text-2xl font-bold mb-2">No Data Yet</h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              Start by creating job descriptions or tests to see analytics and insights
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
