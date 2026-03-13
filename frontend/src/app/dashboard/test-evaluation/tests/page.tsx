'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ClipboardList, Calendar, Users, ArrowRight, Plus, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonTable } from '@/components/ui/skeleton'

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
      toast.error('Failed to load tests')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Test Evaluations"
        description={`${tests.length} ${tests.length === 1 ? 'test' : 'tests'} ready for automated evaluation.`}
        action={
          <Button onClick={() => router.push('/dashboard/test-evaluation')}>
            <Plus className="mr-2 h-4 w-4" />
            New Test
          </Button>
        }
      />

      {loading ? (
        <SkeletonTable rows={4} cols={6} />
      ) : tests.length === 0 ? (
        <Card className="border border-slate-200 bg-white">
          <CardContent>
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-slate-900 mb-1">No tests yet</p>
              <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto">
                Create your first test to start evaluating candidate answers with AI grading.
              </p>
              <Button onClick={() => router.push('/dashboard/test-evaluation')}>
                <Plus className="mr-2 h-4 w-4" />
                Create Test
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Answers</TableHead>
                <TableHead>Total Marks</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tests.map((test) => (
                <TableRow key={test.id}>
                  <TableCell className="font-medium text-slate-900">{test.title}</TableCell>
                  <TableCell className="text-slate-600">{test.domain || '—'}</TableCell>
                  <TableCell className="text-slate-600">
                    {format(new Date(test.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {answerCounts[test.id] ?? 0}
                  </TableCell>
                  <TableCell className="text-slate-600">{test.total_marks}</TableCell>
                  <TableCell>
                    <Badge className="border-green-200 bg-green-50 text-green-700 capitalize">
                      {test.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => router.push(`/dashboard/test-evaluation/${test.id}/upload-answers`)}
                        title="Upload answers"
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => router.push(`/dashboard/test-evaluation/${test.id}/results`)}
                        title="View results"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
