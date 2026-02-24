'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiClient } from '@/lib/api/client'
import { toast } from 'sonner'
import { Loader2, Search, Award, Users, TrendingUp, CheckCircle2, Trash2 } from 'lucide-react'
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
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
                <Award className="h-6 w-6" />
                <span className="text-sm font-medium opacity-90">Evaluation Results</span>
              </div>
              <h1 className="text-4xl font-bold mb-2">Test Results</h1>
              <p className="text-lg opacity-90">
                Candidate evaluations and performance statistics powered by AI
              </p>
            </div>
            <Button
              onClick={() => router.push(`/dashboard/test-evaluation/${testId}/upload-answers`)}
              className="bg-white text-orange-600 hover:bg-orange-50 shadow-lg hover:shadow-xl transition-all"
            >
              Upload More Answers
            </Button>
          </div>
        </div>
      </div>

      {/* Statistics */}
      {statistics && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-0 shadow-lg overflow-hidden relative group hover:shadow-xl transition-all">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent"></div>
            <CardHeader className="pb-2 relative">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 shadow-md">
                  <Users className="h-4 w-4 text-white" />
                </div>
                <CardTitle className="text-sm font-medium">Total Submissions</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="relative">
              <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                {statistics.total_submissions}
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg overflow-hidden relative group hover:shadow-xl transition-all">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent"></div>
            <CardHeader className="pb-2 relative">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 shadow-md">
                  <TrendingUp className="h-4 w-4 text-white" />
                </div>
                <CardTitle className="text-sm font-medium">Average Score</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="relative">
              <div className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                {statistics.average_percentage.toFixed(1)}%
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg overflow-hidden relative group hover:shadow-xl transition-all">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent"></div>
            <CardHeader className="pb-2 relative">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 shadow-md">
                  <Award className="h-4 w-4 text-white" />
                </div>
                <CardTitle className="text-sm font-medium">Highest Score</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="relative">
              <div className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                {statistics.highest_score.toFixed(1)}%
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg overflow-hidden relative group hover:shadow-xl transition-all">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-transparent"></div>
            <CardHeader className="pb-2 relative">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 shadow-md">
                  <CheckCircle2 className="h-4 w-4 text-white" />
                </div>
                <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="relative">
              <div className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
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
      <Card className="border-0 shadow-lg overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent"></div>
        <CardHeader className="relative">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 shadow-md">
              <Search className="h-4 w-4 text-white" />
            </div>
            <CardTitle className="text-lg">Search Results</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-orange-400" />
            <Input
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 border-slate-200 focus:border-orange-500 focus:ring-orange-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card className="border-0 shadow-lg overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent"></div>
        <CardHeader className="relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 shadow-md">
                <Users className="h-4 w-4 text-white" />
              </div>
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
                className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Selected ({selectedResults.size})
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="relative">
          <div className="space-y-2">
            {/* Table Header */}
            {filteredResults.length > 0 && (
              <div className="grid grid-cols-12 gap-4 p-4 bg-orange-50 rounded-xl border border-orange-200 font-semibold text-sm">
                <div className="col-span-1 flex items-center" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedResults.size === filteredResults.length}
                    onCheckedChange={toggleSelectAll}
                    className="border-orange-400 data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600"
                  />
                </div>
                <div className="col-span-1 text-orange-900">#</div>
                <div className="col-span-3 text-orange-900">Candidate</div>
                <div className="col-span-3 text-orange-900">Score</div>
                <div className="col-span-2 text-orange-900">Marks</div>
                <div className="col-span-1 text-orange-900">Submitted</div>
                <div className="col-span-1 text-orange-900 text-center">Actions</div>
              </div>
            )}

            {/* Table Rows */}
            {filteredResults.length === 0 ? (
              <div className="text-center py-16">
                <div className="p-6 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 mb-4 inline-block shadow-lg">
                  <Users className="h-12 w-12 text-white" />
                </div>
                <p className="text-lg font-medium text-slate-900 mb-2">No results found</p>
                <p className="text-slate-600">Upload answer sheets to get AI-powered evaluation results</p>
              </div>
            ) : (
              filteredResults.map((result, index) => (
                <div
                  key={result.id}
                  className="grid grid-cols-12 gap-4 p-4 border border-slate-200 rounded-xl hover:border-orange-300 hover:bg-orange-50/50 transition-all cursor-pointer group"
                  onClick={() =>
                    router.push(`/dashboard/test-evaluation/answer-sheet/${result.id}`)
                  }
                >
                  <div className="col-span-1 flex items-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedResults.has(result.id)}
                      onCheckedChange={() => toggleSelectResult(result.id)}
                      className="border-orange-400 data-[state=checked]:bg-orange-600 data-[state=checked]:border-orange-600"
                    />
                  </div>
                  <div className="col-span-1 flex items-center">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
                      {index + 1}
                    </div>
                  </div>
                  <div className="col-span-3 flex flex-col justify-center">
                    <p className="font-semibold text-slate-900 group-hover:text-orange-700 transition-colors">
                      {result.candidate_name}
                    </p>
                    {result.candidate_email && (
                      <p className="text-xs text-muted-foreground">{result.candidate_email}</p>
                    )}
                  </div>
                  <div className="col-span-3 flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-sm font-bold bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md">
                      {(result.percentage ?? 0).toFixed(1)}%
                    </span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all"
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
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="border-2 border-orange-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
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
              className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white shadow-md"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
