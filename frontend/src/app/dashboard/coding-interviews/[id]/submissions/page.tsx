'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Eye,
  Search,
  Loader2,
  AlertTriangle,
  Clock,
  Award,
  Users,
  ChevronLeft,
} from 'lucide-react'
import { getInterview, listSubmissions, type Interview, type Submission } from '@/lib/api/coding-interviews'
import { toast } from 'sonner'
import { format } from 'date-fns'

export default function SubmissionsPage() {
  const params = useParams()
  const router = useRouter()
  const interviewId = params.id as string

  const [interview, setInterview] = useState<Interview | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    fetchData()
  }, [interviewId])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [interviewData, submissionsData] = await Promise.all([
        getInterview(interviewId),
        listSubmissions(interviewId),
      ])

      setInterview(interviewData)
      setSubmissions(submissionsData.submissions)
    } catch (error: any) {
      toast.error(error.message || 'Failed to load submissions')
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      in_progress: 'bg-blue-100 text-blue-800',
      submitted: 'bg-green-100 text-green-800',
      auto_submitted: 'bg-yellow-100 text-yellow-800',
      abandoned: 'bg-red-100 text-red-800',
    }

    return (
      <Badge className={variants[status] || variants.submitted}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    )
  }

  const filteredSubmissions = submissions.filter(
    (submission) =>
      submission.candidate_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      submission.candidate_email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const averageScore =
    submissions.length > 0
      ? submissions.reduce((sum, s) => sum + (s.percentage || 0), 0) / submissions.length
      : 0

  const completedCount = submissions.filter((s) => s.status === 'submitted' || s.status === 'auto_submitted').length
  const suspiciousCount = submissions.filter((s) => s.suspicious_activity).length

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Submissions
          </h1>
          {interview && (
            <p className="text-gray-600 mt-1">
              {interview.title} - {format(new Date(interview.scheduled_start_time), 'MMM dd, yyyy')}
            </p>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Submissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{submissions.length}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedCount}</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Award className="h-4 w-4" />
              Average Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{averageScore.toFixed(1)}%</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Flagged
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{suspiciousCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Submissions Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Submissions</CardTitle>
          <CardDescription>Review candidate submissions and evaluations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-gray-300 mb-4" />
              <p className="text-gray-500 text-center">
                {searchQuery ? 'No submissions found matching your search' : 'No submissions yet'}
              </p>
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Submitted At</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Flags</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubmissions.map((submission) => (
                    <TableRow key={submission.id}>
                      <TableCell className="font-medium">{submission.candidate_name}</TableCell>
                      <TableCell>{submission.candidate_email}</TableCell>
                      <TableCell>
                        {submission.submitted_at ? (
                          format(new Date(submission.submitted_at), 'MMM dd, HH:mm')
                        ) : (
                          <span className="text-gray-400">In Progress</span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(submission.status)}</TableCell>
                      <TableCell>
                        {submission.percentage !== null && submission.percentage !== undefined ? (
                          <div className="flex items-center gap-2">
                            <Award className="h-4 w-4 text-yellow-600" />
                            <span className="font-semibold">{submission.percentage.toFixed(1)}%</span>
                          </div>
                        ) : (
                          <span className="text-gray-400">Not evaluated</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {submission.late_submission && (
                            <Badge variant="outline" className="text-orange-700 border-orange-300">
                              Late
                            </Badge>
                          )}
                          {submission.suspicious_activity && (
                            <Badge variant="outline" className="text-red-700 border-red-300">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Flagged
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            router.push(`/dashboard/coding-interviews/submissions/${submission.id}`)
                          }
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
