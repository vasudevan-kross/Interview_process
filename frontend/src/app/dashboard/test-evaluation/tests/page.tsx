'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ClipboardList, Calendar, Users, ArrowRight, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface Test {
  id: string
  title: string
  domain: string | null
  total_marks: number
  duration_minutes: number | null
  created_at: string
  status: string
}

export default function TestsListPage() {
  const router = useRouter()
  const [tests, setTests] = useState<Test[]>([])
  const [loading, setLoading] = useState(true)
  const [answerCounts, setAnswerCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    fetchTests()
  }, [])

  const fetchTests = async () => {
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
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!userRecord) {
        toast.error('User not found')
        return
      }

      // Fetch tests
      const { data: testsData, error } = await supabase
        .from('tests')
        .select('id, title, domain, total_marks, duration_minutes, created_at, status')
        .eq('created_by', userRecord.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching tests:', error)
        toast.error('Failed to load tests')
        return
      }

      setTests(testsData || [])

      // Fetch answer sheet counts for each test
      if (testsData && testsData.length > 0) {
        const counts: Record<string, number> = {}

        for (const test of testsData) {
          const { count } = await supabase
            .from('answer_sheets')
            .select('*', { count: 'exact', head: true })
            .eq('test_id', test.id)

          counts[test.id] = count || 0
        }

        setAnswerCounts(counts)
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleViewResults = (testId: string) => {
    router.push(`/dashboard/test-evaluation/${testId}/results`)
  }

  const handleUploadAnswers = (testId: string) => {
    router.push(`/dashboard/test-evaluation/${testId}/upload-answers`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading tests...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Gradient Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500/90 to-red-600 p-8 text-white shadow-xl">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ClipboardList className="h-6 w-6" />
                <span className="text-sm font-medium opacity-90">Assessment Management</span>
              </div>
              <h1 className="text-4xl font-bold mb-2">Test Evaluations</h1>
              <p className="text-lg opacity-90">
                {tests.length} {tests.length === 1 ? 'test' : 'tests'} ready for automated evaluation
              </p>
            </div>
            <Button
              onClick={() => router.push('/dashboard/test-evaluation')}
              className="bg-white text-orange-600 hover:bg-orange-50 shadow-lg hover:shadow-xl transition-all"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Test
            </Button>
          </div>
        </div>
      </div>

      {tests.length === 0 ? (
        <Card className="border-0 shadow-lg overflow-hidden">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="p-6 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 mb-6 shadow-lg">
              <ClipboardList className="h-12 w-12 text-white" />
            </div>
            <h3 className="text-2xl font-semibold mb-2 text-slate-900">No tests yet</h3>
            <p className="text-muted-foreground mb-8 text-center max-w-md leading-relaxed">
              Create your first test to start evaluating candidate answers with AI-powered grading
            </p>
            <Button
              onClick={() => router.push('/dashboard/test-evaluation')}
              className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-md hover:shadow-lg transition-all"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Test
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {tests.map((test) => (
            <Card
              key={test.id}
              className="border-0 shadow-lg overflow-hidden relative group hover:shadow-xl transition-all cursor-pointer"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <CardHeader className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 flex gap-4">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 shadow-md flex-shrink-0 h-fit">
                      <ClipboardList className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-3 text-slate-900 group-hover:text-orange-600 transition-colors">
                        {test.title}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-4 text-sm mb-3">
                        {test.domain && (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-100">
                            <ClipboardList className="h-4 w-4" />
                            <span className="font-medium">{test.domain}</span>
                          </span>
                        )}
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 border border-slate-100">
                          <Calendar className="h-4 w-4" />
                          <span>{format(new Date(test.created_at), 'MMM d, yyyy')}</span>
                        </span>
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-100">
                          <Users className="h-4 w-4" />
                          <span className="font-medium">
                            {answerCounts[test.id] || 0} answer{answerCounts[test.id] !== 1 ? 's' : ''}
                          </span>
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <span className="text-slate-600 flex items-center gap-1">
                          <span className="font-semibold">Total Marks:</span> {test.total_marks}
                        </span>
                        {test.duration_minutes && (
                          <span className="text-slate-600 flex items-center gap-1">
                            <span className="font-semibold">Duration:</span> {test.duration_minutes} minutes
                          </span>
                        )}
                        <span className="px-2 py-1 rounded-md bg-green-50 text-green-700 text-xs font-medium capitalize">
                          {test.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {answerCounts[test.id] > 0 ? (
                      <Button
                        onClick={() => handleViewResults(test.id)}
                        className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-md hover:shadow-lg transition-all"
                      >
                        View Results
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleUploadAnswers(test.id)}
                        className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-md hover:shadow-lg transition-all"
                      >
                        Upload Answers
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
