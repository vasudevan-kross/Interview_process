'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { apiClient } from '@/lib/api/client'
import { toast } from 'sonner'
import { Loader2, Search, Award, Users, TrendingUp, CheckCircle2 } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

interface TestResult {
  id: string
  candidate_name: string
  candidate_email: string
  total_marks_obtained: number
  percentage: number
  status: string
  submitted_at: string
}

export default function TestResultsPage() {
  const params = useParams()
  const router = useRouter()
  const testId = params.testId as string

  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState<TestResult[]>([])
  const [statistics, setStatistics] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchData()
  }, [testId])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [resultsRes, statsRes] = await Promise.all([
        apiClient.getTestResults(testId),
        apiClient.getTestStatistics(testId),
      ])

      setResults(resultsRes.results || [])
      setStatistics(statsRes)
    } catch (error: any) {
      toast.error('Failed to load test results')
    } finally {
      setLoading(false)
    }
  }

  const filteredResults = results.filter((r) =>
    r.candidate_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.candidate_email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getScoreBadge = (percentage: number) => {
    if (percentage >= 80) return <Badge variant="success">{percentage.toFixed(1)}%</Badge>
    if (percentage >= 60) return <Badge variant="warning">{percentage.toFixed(1)}%</Badge>
    return <Badge variant="destructive">{percentage.toFixed(1)}%</Badge>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Test Results</h1>
          <p className="text-muted-foreground">
            Candidate evaluations and performance statistics
          </p>
        </div>
        <Button onClick={() => router.push(`/dashboard/test-evaluation/${testId}/upload-answers`)}>
          Upload More Answers
        </Button>
      </div>

      {/* Statistics */}
      {statistics && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-600" />
                Total Submissions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.total_submissions}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                Average Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.average_percentage.toFixed(1)}%</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Award className="h-4 w-4 text-purple-600" />
                Highest Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.highest_score.toFixed(1)}%</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Pass Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.pass_rate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                {statistics.passed_count} passed / {statistics.failed_count} failed
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Search Results</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Candidates ({filteredResults.length})</CardTitle>
          <CardDescription>
            Click on a candidate to view detailed evaluation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredResults.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No results found. Upload answer sheets to get started.
              </div>
            ) : (
              filteredResults.map((result, index) => (
                <div
                  key={result.id}
                  className="grid grid-cols-12 gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() =>
                    router.push(`/dashboard/test-evaluation/answer-sheet/${result.id}`)
                  }
                >
                  <div className="col-span-1 font-bold text-lg text-muted-foreground">
                    #{index + 1}
                  </div>
                  <div className="col-span-4">
                    <p className="font-medium">{result.candidate_name}</p>
                    {result.candidate_email && (
                      <p className="text-xs text-muted-foreground">{result.candidate_email}</p>
                    )}
                  </div>
                  <div className="col-span-3 flex items-center gap-2">
                    {getScoreBadge(result.percentage)}
                    <Progress value={result.percentage} className="flex-1" />
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm font-medium">
                      {result.total_marks_obtained || 0} marks
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Status: {result.status}
                    </p>
                  </div>
                  <div className="col-span-2 text-sm text-muted-foreground">
                    {result.submitted_at ? formatDateTime(result.submitted_at) : 'N/A'}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
