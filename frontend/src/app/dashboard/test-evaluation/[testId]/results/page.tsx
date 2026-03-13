'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiClient } from '@/lib/api/client'
import { toast } from 'sonner'
import { Search, Award, Users, TrendingUp, CheckCircle2, Trash2 } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '@/components/ui/skeleton'

interface TestResult {
  id: string
  candidate_name: string
  candidate_email: string
  total_marks_obtained: number | null
  percentage: number | null
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
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteAction, setDeleteAction] = useState<{
    type: 'single' | 'bulk'
    resultId?: string
    candidateName?: string
  } | null>(null)

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

  const toggleSelectAll = () => {
    if (selectedResults.size === filteredResults.length) {
      setSelectedResults(new Set())
    } else {
      setSelectedResults(new Set(filteredResults.map(r => r.id)))
    }
  }

  const toggleSelectResult = (resultId: string) => {
    const newSelected = new Set(selectedResults)
    if (newSelected.has(resultId)) {
      newSelected.delete(resultId)
    } else {
      newSelected.add(resultId)
    }
    setSelectedResults(newSelected)
  }

  const handleDeleteSelected = () => {
    if (selectedResults.size === 0) return
    setDeleteAction({ type: 'bulk' })
    setDeleteDialogOpen(true)
  }

  const handleDeleteSingle = (resultId: string, candidateName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteAction({ type: 'single', resultId, candidateName })
    setDeleteDialogOpen(true)
  }

  const executeDelete = async () => {
    if (!deleteAction) return

    setDeleting(true)
    setDeleteDialogOpen(false)

    try {
      if (deleteAction.type === 'bulk') {
        console.log('Deleting bulk results:', Array.from(selectedResults))
        const response = await apiClient.deleteAnswerSheets(Array.from(selectedResults))
        console.log('Delete response:', response)
        toast.success(`Successfully deleted ${selectedResults.size} result${selectedResults.size > 1 ? 's' : ''}`)
        setSelectedResults(new Set())
      } else if (deleteAction.type === 'single' && deleteAction.resultId) {
        console.log('Deleting single result:', deleteAction.resultId)
        const response = await apiClient.deleteAnswerSheets([deleteAction.resultId])
        console.log('Delete response:', response)
        toast.success(`Successfully deleted ${deleteAction.candidateName}`)
      }
      console.log('Refreshing data...')
      await fetchData()
      console.log('Data refreshed')
    } catch (error: any) {
      console.error('Delete error:', error)
      toast.error(error.response?.data?.detail || error.message || 'Failed to delete result(s)')
    } finally {
      setDeleting(false)
      setDeleteAction(null)
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <SkeletonPageHeader />
        <SkeletonStatCards />
        <SkeletonTable rows={5} cols={7} />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Test Results"
        description="Candidate evaluations and performance statistics powered by AI."
        action={
          <Button
            onClick={() => router.push(`/dashboard/test-evaluation/${testId}/upload-answers`)}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            Upload More Answers
          </Button>
        }
      />

      {/* Statistics */}
      {statistics && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
          <Card className="border border-slate-200 bg-white">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-600">Total Submissions</CardTitle>
                <Users className="h-4 w-4 text-slate-300" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-slate-900">
                {statistics.total_submissions}
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 bg-white">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-600">Average Score</CardTitle>
                <TrendingUp className="h-4 w-4 text-slate-300" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-slate-900">
                {statistics.average_percentage.toFixed(1)}%
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 bg-white">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-600">Highest Score</CardTitle>
                <Award className="h-4 w-4 text-slate-300" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-slate-900">
                {statistics.highest_score.toFixed(1)}%
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 bg-white">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-600">Pass Rate</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-slate-300" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-slate-900">
                {statistics.pass_rate.toFixed(1)}%
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {statistics.passed_count} passed / {statistics.failed_count} failed
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Search className="h-4 w-4 text-slate-400" />
            <CardTitle className="text-lg">Search Results</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 border-slate-200"
            />
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="h-4 w-4 text-slate-400" />
              <div>
                <CardTitle className="text-lg">All Candidates ({filteredResults.length})</CardTitle>
                <CardDescription>Click on a candidate to view detailed evaluation breakdown</CardDescription>
              </div>
            </div>
            {selectedResults.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={deleting}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected ({selectedResults.size})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {/* Table Header */}
            {filteredResults.length > 0 && (
              <div className="grid grid-cols-12 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200 font-medium text-xs uppercase tracking-wider text-slate-500">
                <div className="col-span-1 flex items-center" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedResults.size === filteredResults.length}
                    onCheckedChange={toggleSelectAll}
                    className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                  />
                </div>
                <div className="col-span-1">#</div>
                <div className="col-span-3">Candidate</div>
                <div className="col-span-3">Score</div>
                <div className="col-span-2">Marks</div>
                <div className="col-span-1">Submitted</div>
                <div className="col-span-1 text-center">Actions</div>
              </div>
            )}

            {/* Table Rows */}
            {filteredResults.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm font-medium text-slate-900 mb-1">No results found</p>
                <p className="text-sm text-slate-400 mb-4">Upload answer sheets to get AI-powered evaluation results</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                {filteredResults.map((result, index) => (
                  <div
                    key={result.id}
                    className="grid grid-cols-12 gap-4 p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all cursor-pointer group mb-2"
                    onClick={() =>
                      router.push(`/dashboard/test-evaluation/answer-sheet/${result.id}`)
                    }
                  >
                    <div className="col-span-1 flex items-center" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedResults.has(result.id)}
                        onCheckedChange={() => toggleSelectResult(result.id)}
                        className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                      />
                    </div>
                    <div className="col-span-1 flex items-center">
                      <div className="w-7 h-7 rounded-md bg-slate-100 text-slate-700 font-semibold text-xs flex items-center justify-center">
                        {index + 1}
                      </div>
                    </div>
                    <div className="col-span-3 flex flex-col justify-center">
                      <p className="font-semibold text-slate-900">
                        {result.candidate_name}
                      </p>
                      {result.candidate_email && (
                        <p className="text-xs text-muted-foreground">{result.candidate_email}</p>
                      )}
                    </div>
                    <div className="col-span-3 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {(result.percentage ?? 0).toFixed(1)}%
                      </span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all"
                          style={{ width: `${result.percentage ?? 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="col-span-2 flex flex-col justify-center">
                      <p className="text-sm font-semibold text-slate-900">
                        {result.total_marks_obtained || 0} marks
                      </p>
                      <p className="text-xs text-slate-600 capitalize">
                        {result.status}
                      </p>
                    </div>
                    <div className="col-span-1 flex items-center text-xs text-slate-600">
                      {result.submitted_at ? formatDateTime(result.submitted_at) : 'N/A'}
                    </div>
                    <div className="col-span-1 flex items-center justify-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handleDeleteSingle(result.id, result.candidate_name, e)}
                        disabled={deleting}
                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteAction?.type === 'bulk'
                ? `Delete ${selectedResults.size} Result${selectedResults.size > 1 ? 's' : ''}?`
                : `Delete ${deleteAction?.candidateName}?`
              }
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base text-slate-600">
              {deleteAction?.type === 'bulk'
                ? `This will permanently delete ${selectedResults.size} selected result${selectedResults.size > 1 ? 's' : ''} and their evaluation data. This action cannot be undone.`
                : `This will permanently delete this result and its evaluation data. This action cannot be undone.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-300 hover:bg-slate-100">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={executeDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
