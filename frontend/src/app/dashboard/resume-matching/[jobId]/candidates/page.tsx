'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiClient } from '@/lib/api/client'
import { toast } from 'sonner'
import { Loader2, Search, TrendingUp, Users, Award, ChevronUp, ChevronDown, Trash2 } from 'lucide-react'
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

interface Candidate {
  id: string
  candidate_name: string
  candidate_email: string
  match_score: number
  match_details: {
    key_matches: string[]
    missing_requirements: string[]
    reasoning: string
  }
  skills_extracted: {
    technical_skills: string[]
    soft_skills: string[]
    tools: string[]
    languages: string[]
  }
  created_at: string
}

export default function CandidatesPage() {
  const params = useParams()
  const router = useRouter()
  const jobId = params.jobId as string

  const [loading, setLoading] = useState(true)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [statistics, setStatistics] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<'match_score' | 'candidate_name'>('match_score')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteAction, setDeleteAction] = useState<{
    type: 'single' | 'bulk'
    candidateId?: string
    candidateName?: string
  } | null>(null)

  useEffect(() => {
    fetchData()
  }, [jobId])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [candidatesRes, statsRes] = await Promise.all([
        apiClient.getRankedCandidates(jobId),
        apiClient.getJobStatistics(jobId),
      ])

      setCandidates(candidatesRes.candidates || [])
      setStatistics(statsRes)
    } catch (error: any) {
      toast.error('Failed to load candidates')
    } finally {
      setLoading(false)
    }
  }

  const filteredCandidates = candidates
    .filter((c) =>
      c.candidate_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.candidate_email?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const modifier = sortDirection === 'asc' ? 1 : -1
      if (sortField === 'match_score') {
        const aScore = a.match_score || 0;
        const bScore = b.match_score || 0;
        return (aScore - bScore) * modifier
      }
      return a.candidate_name.localeCompare(b.candidate_name) * modifier
    })

  const toggleSort = (field: 'match_score' | 'candidate_name') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const toggleSelectAll = () => {
    if (selectedCandidates.size === filteredCandidates.length) {
      setSelectedCandidates(new Set())
    } else {
      setSelectedCandidates(new Set(filteredCandidates.map(c => c.id)))
    }
  }

  const toggleSelectCandidate = (candidateId: string) => {
    const newSelected = new Set(selectedCandidates)
    if (newSelected.has(candidateId)) {
      newSelected.delete(candidateId)
    } else {
      newSelected.add(candidateId)
    }
    setSelectedCandidates(newSelected)
  }

  const handleDeleteSelected = () => {
    if (selectedCandidates.size === 0) return
    setDeleteAction({ type: 'bulk' })
    setDeleteDialogOpen(true)
  }

  const handleDeleteSingle = (candidateId: string, candidateName: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent row click
    setDeleteAction({ type: 'single', candidateId, candidateName })
    setDeleteDialogOpen(true)
  }

  const executeDelete = async () => {
    if (!deleteAction) return

    setDeleting(true)
    setDeleteDialogOpen(false)

    try {
      if (deleteAction.type === 'bulk') {
        const result = await apiClient.deleteResumes(Array.from(selectedCandidates))
        if (result.deleted_count > 0) {
          toast.success(`Successfully deleted ${result.deleted_count} candidate${result.deleted_count > 1 ? 's' : ''}`)
        } else {
          toast.error('Failed to delete candidates')
        }
        setSelectedCandidates(new Set())
      } else if (deleteAction.type === 'single' && deleteAction.candidateId) {
        const result = await apiClient.deleteResumes([deleteAction.candidateId])
        if (result.deleted_count > 0) {
          toast.success(`Successfully deleted ${deleteAction.candidateName}`)
        } else {
          toast.error(`Failed to delete ${deleteAction.candidateName}`)
        }
      }
      await fetchData() // Refresh data
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete candidate(s)')
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
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-500/90 to-pink-600 p-8 text-white shadow-xl">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Award className="h-6 w-6" />
                <span className="text-sm font-medium opacity-90">Ranked Results</span>
              </div>
              <h1 className="text-4xl font-bold mb-2">Candidate Rankings</h1>
              <p className="text-lg opacity-90">
                AI-matched candidates sorted by compatibility score
              </p>
            </div>
            <Button
              onClick={() => router.push(`/dashboard/resume-matching/${jobId}/upload-resumes`)}
              className="bg-white text-purple-600 hover:bg-purple-50 shadow-lg hover:shadow-xl transition-all"
            >
              Upload More Resumes
            </Button>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-0 shadow-lg overflow-hidden relative group hover:shadow-xl transition-all">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent"></div>
            <CardHeader className="pb-2 relative">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 shadow-md">
                  <Users className="h-4 w-4 text-white" />
                </div>
                <CardTitle className="text-sm font-medium">Total Candidates</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="relative">
              <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                {statistics.total_resumes}
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
                {(statistics.average_score || 0).toFixed(1)}%
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg overflow-hidden relative group hover:shadow-xl transition-all">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent"></div>
            <CardHeader className="pb-2 relative">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 shadow-md">
                  <Award className="h-4 w-4 text-white" />
                </div>
                <CardTitle className="text-sm font-medium">Top Score</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="relative">
              <div className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                {(statistics.top_score || 0).toFixed(1)}%
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg overflow-hidden relative group hover:shadow-xl transition-all">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-500/10 to-transparent"></div>
            <CardHeader className="pb-2 relative">
              <CardTitle className="text-sm font-medium">Score Distribution</CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">90-100%</span>
                  <span className="font-semibold text-green-600">{statistics.score_distribution?.['90-100'] || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">80-89%</span>
                  <span className="font-semibold text-blue-600">{statistics.score_distribution?.['80-89'] || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">70-79%</span>
                  <span className="font-semibold text-orange-600">{statistics.score_distribution?.['70-79'] || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <Card className="border-0 shadow-lg overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent"></div>
        <CardHeader className="relative">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 shadow-md">
              <Search className="h-4 w-4 text-white" />
            </div>
            <CardTitle className="text-lg">Search Candidates</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-purple-400" />
            <Input
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 border-slate-200 focus:border-purple-500 focus:ring-purple-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* Candidates Table */}
      <Card className="border-0 shadow-lg overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent"></div>
        <CardHeader className="relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 shadow-md">
                <Users className="h-4 w-4 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg">All Candidates ({filteredCandidates.length})</CardTitle>
                <CardDescription>Click on a candidate to view detailed analysis</CardDescription>
              </div>
            </div>
            {selectedCandidates.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete {selectedCandidates.size} Selected
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="relative">
          <div className="space-y-2">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl font-semibold text-sm border border-purple-100">
              <div className="col-span-1 flex items-center gap-2">
                <Checkbox
                  checked={filteredCandidates.length > 0 && selectedCandidates.size === filteredCandidates.length}
                  onCheckedChange={toggleSelectAll}
                  className="border-purple-400 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                />
                <span className="text-purple-900">Select</span>
              </div>
              <div
                className="col-span-1 cursor-pointer flex items-center gap-1 text-purple-900"
                onClick={() => toggleSort('match_score')}
              >
                Rank
                {sortField === 'match_score' &&
                  (sortDirection === 'desc' ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  ))}
              </div>
              <div
                className="col-span-2 cursor-pointer flex items-center gap-1 text-purple-900"
                onClick={() => toggleSort('candidate_name')}
              >
                Candidate
                {sortField === 'candidate_name' &&
                  (sortDirection === 'desc' ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  ))}
              </div>
              <div className="col-span-2 text-purple-900">Match Score</div>
              <div className="col-span-3 text-purple-900">Key Skills</div>
              <div className="col-span-2 text-purple-900">Submitted</div>
              <div className="col-span-1 text-purple-900 text-center">Actions</div>
            </div>

            {/* Table Rows */}
            {filteredCandidates.length === 0 ? (
              <div className="text-center py-16">
                <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 mb-4 inline-block shadow-lg">
                  <Users className="h-12 w-12 text-white" />
                </div>
                <p className="text-lg font-medium text-slate-900 mb-2">No candidates found</p>
                <p className="text-slate-600">Upload resumes to get started with AI matching</p>
              </div>
            ) : (
              filteredCandidates.map((candidate, index) => (
                <div
                  key={candidate.id}
                  className="grid grid-cols-12 gap-4 p-4 border border-slate-200 rounded-xl hover:border-purple-300 hover:bg-purple-50/50 transition-all cursor-pointer group"
                  onClick={() =>
                    router.push(`/dashboard/resume-matching/${jobId}/candidates/${candidate.id}`)
                  }
                >
                  <div className="col-span-1 flex items-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedCandidates.has(candidate.id)}
                      onCheckedChange={() => toggleSelectCandidate(candidate.id)}
                      className="border-purple-400 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                    />
                  </div>
                  <div className="col-span-1 flex items-center">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
                      {index + 1}
                    </div>
                  </div>
                  <div className="col-span-2 flex flex-col justify-center">
                    <p className="font-semibold text-slate-900 group-hover:text-purple-700 transition-colors">
                      {candidate.candidate_name}
                    </p>
                    {candidate.candidate_email && (
                      <p className="text-xs text-muted-foreground">{candidate.candidate_email}</p>
                    )}
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-sm font-bold bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md">
                      {candidate.match_score != null ? candidate.match_score.toFixed(1) : '0.0'}%
                    </span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all"
                        style={{ width: `${Math.max(0, candidate.match_score || 0)}%` }}
                      />
                    </div>
                  </div>
                  <div className="col-span-3 flex items-center">
                    <div className="flex flex-wrap gap-1">
                      {candidate.skills_extracted.technical_skills
                        ?.slice(0, 3)
                        .map((skill, i) => (
                          <span key={i} className="px-2 py-1 rounded-md bg-purple-100 text-purple-700 text-xs font-medium border border-purple-200">
                            {skill}
                          </span>
                        ))}
                      {candidate.skills_extracted.technical_skills?.length > 3 && (
                        <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200">
                          +{candidate.skills_extracted.technical_skills.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 flex items-center text-sm text-slate-600">
                    {formatDateTime(candidate.created_at)}
                  </div>
                  <div className="col-span-1 flex items-center justify-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handleDeleteSingle(candidate.id, candidate.candidate_name, e)}
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
        <AlertDialogContent className="border-2 border-purple-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              {deleteAction?.type === 'bulk'
                ? `Delete ${selectedCandidates.size} Candidate${selectedCandidates.size > 1 ? 's' : ''}?`
                : `Delete ${deleteAction?.candidateName}?`
              }
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base text-slate-600">
              {deleteAction?.type === 'bulk'
                ? `This will permanently delete ${selectedCandidates.size} selected candidate${selectedCandidates.size > 1 ? 's' : ''} and their resume data. This action cannot be undone.`
                : `This will permanently delete this candidate and their resume data. This action cannot be undone.`
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
