'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api/client'
import { toast } from 'sonner'
import { Search, TrendingUp, Users, Award, ChevronUp, ChevronDown, Trash2, FileText, CheckCircle2, XCircle, ThumbsUp, ThumbsDown, Minus, GitBranch } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonPageHeader, SkeletonStatCards, SkeletonTable } from '@/components/ui/skeleton'
import { promoteTopipeline } from '@/lib/api/pipeline'

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
  recommendation: string
  overall_assessment: string
  experience_match: string
  key_matches: string[]
  missing_requirements: string[]
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

  const [promoting, setPromoting] = useState(false)

  const [jobDescriptionText, setJobDescriptionText] = useState('')
  const [jdDialogOpen, setJdDialogOpen] = useState(false)

  useEffect(() => {
    fetchData()
  }, [jobId])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [candidatesRes, statsRes, jdRes] = await Promise.all([
        apiClient.getRankedCandidates(jobId),
        apiClient.getJobStatistics(jobId),
        apiClient.getJobDescription(jobId).catch(() => null)
      ])

      setCandidates(candidatesRes.candidates || [])
      setStatistics(statsRes)
      if (jdRes && jdRes.raw_text) {
        setJobDescriptionText(jdRes.raw_text)
      }
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
        const aScore = a.match_score || 0
        const bScore = b.match_score || 0
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
    e.stopPropagation()
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
          toast.success(`Deleted ${result.deleted_count} candidate${result.deleted_count > 1 ? 's' : ''}`)
        } else {
          toast.error('Failed to delete candidates')
        }
        setSelectedCandidates(new Set())
      } else if (deleteAction.type === 'single' && deleteAction.candidateId) {
        const result = await apiClient.deleteResumes([deleteAction.candidateId])
        if (result.deleted_count > 0) {
          toast.success(`Deleted ${deleteAction.candidateName}`)
        } else {
          toast.error(`Failed to delete ${deleteAction.candidateName}`)
        }
      }
      await fetchData()
    } catch (error: any) {
      toast.error(error.response?.data?.detail || error.message || 'Failed to delete candidate(s)')
    } finally {
      setDeleting(false)
      setDeleteAction(null)
    }
  }

  const handlePromoteToPipeline = async () => {
    if (selectedCandidates.size === 0) return
    setPromoting(true)
    try {
      const result = await promoteTopipeline(jobId, Array.from(selectedCandidates))
      if (result.created > 0) {
        toast.success(`Added ${result.created} candidate${result.created > 1 ? 's' : ''} to pipeline`)
      }
      if (result.skipped > 0) {
        toast(`${result.skipped} candidate(s) were already in the pipeline`, { icon: 'ℹ️' })
      }
      setSelectedCandidates(new Set())
    } catch (error: any) {
      toast.error(error.message || 'Failed to add to pipeline')
    } finally {
      setPromoting(false)
    }
  }

  const getRecommendationBadge = (rec: string) => {
    const r = (rec || '').toLowerCase()
    if (r.includes('strong recommend'))
      return <Badge className="bg-green-50 text-green-700 border border-green-200 rounded-md whitespace-nowrap"><ThumbsUp className="h-3 w-3 mr-1" />Strong Fit</Badge>
    if (r.includes('recommend'))
      return <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md whitespace-nowrap"><ThumbsUp className="h-3 w-3 mr-1" />Good Fit</Badge>
    if (r.includes('consider'))
      return <Badge className="bg-amber-50 text-amber-700 border border-amber-200 rounded-md whitespace-nowrap"><Minus className="h-3 w-3 mr-1" />Consider</Badge>
    if (r.includes('not recommended') || r.includes('not a fit'))
      return <Badge className="bg-red-50 text-red-700 border border-red-200 rounded-md whitespace-nowrap"><ThumbsDown className="h-3 w-3 mr-1" />Not a Fit</Badge>
    return <Badge className="bg-slate-100 text-slate-500 border border-slate-200 rounded-md whitespace-nowrap">Pending</Badge>
  }

  // Stats for recommendation distribution
  const recommendedCount = candidates.filter(c => {
    const r = (c.recommendation || '').toLowerCase()
    return r.includes('strong recommend') || r.includes('recommend')
  }).length

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <SkeletonPageHeader />
        <SkeletonStatCards />
        <SkeletonTable rows={6} cols={6} />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Candidate Rankings"
        description="AI-matched candidates sorted by compatibility score."
        backHref="/dashboard/resume-matching/jobs"
        action={
          <div className="flex flex-wrap gap-2">
            {jobDescriptionText && (
              <Button variant="outline" onClick={() => setJdDialogOpen(true)}>
                <FileText className="h-4 w-4 mr-2" />
                View Job Description
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => router.push(`/dashboard/resume-matching/${jobId}/upload-resumes`)}
            >
              <FileText className="h-4 w-4 mr-2" />
              Upload More Resumes
            </Button>
            {selectedCandidates.size > 0 && (
              <>
                <Button
                  onClick={handlePromoteToPipeline}
                  disabled={promoting}
                >
                  <GitBranch className="h-4 w-4 mr-2" />
                  {promoting ? 'Adding...' : `Add to Pipeline (${selectedCandidates.size})`}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteSelected}
                  disabled={deleting}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Selected ({selectedCandidates.size})
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Statistics */}
      {statistics && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border border-slate-200 bg-white">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-500">Total Candidates</CardTitle>
                <Users className="h-4 w-4 text-slate-300" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-slate-900">
                {statistics.total_resumes}
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 bg-white">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-500">Average Score</CardTitle>
                <TrendingUp className="h-4 w-4 text-slate-300" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-slate-900">
                {(statistics.average_score || 0).toFixed(1)}%
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 bg-white">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-500">Top Score</CardTitle>
                <Award className="h-4 w-4 text-slate-300" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-slate-900">
                {(statistics.top_score || 0).toFixed(1)}%
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 bg-white">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-500">Recommended</CardTitle>
                <ThumbsUp className="h-4 w-4 text-slate-300" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums text-slate-900">
                {recommendedCount}
                <span className="text-sm font-normal text-slate-400 ml-1">
                  / {statistics.total_resumes}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <Card className="border border-slate-200 bg-white">
        <CardContent className="pt-4">
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

      {/* Candidates Table */}
      <Card className="border border-slate-200 bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">All Candidates ({filteredCandidates.length})</CardTitle>
              <CardDescription>Click on a candidate to view detailed analysis</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredCandidates.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-slate-900 mb-1">No candidates found</p>
              <p className="text-sm text-slate-400 mb-4">Upload resumes to see AI-ranked candidates here</p>
              <Button onClick={() => router.push(`/dashboard/resume-matching/${jobId}/upload-resumes`)}>
                Upload Resumes
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedCandidates.size === filteredCandidates.length && filteredCandidates.length > 0}
                        onCheckedChange={toggleSelectAll}
                        className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                      />
                    </TableHead>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort('candidate_name')}
                    >
                      <div className="flex items-center gap-1">
                        Candidate
                        {sortField === 'candidate_name' && (
                          sortDirection === 'desc' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort('match_score')}
                    >
                      <div className="flex items-center gap-1">
                        Score
                        {sortField === 'match_score' && (
                          sortDirection === 'desc' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead>Recommendation</TableHead>
                    <TableHead>Matching Skills</TableHead>
                    <TableHead>Skill Gaps</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCandidates.map((candidate, index) => (
                    <TableRow
                      key={candidate.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => router.push(`/dashboard/resume-matching/${jobId}/candidates/${candidate.id}`)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedCandidates.has(candidate.id)}
                          onCheckedChange={() => toggleSelectCandidate(candidate.id)}
                          className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="w-7 h-7 rounded-md bg-slate-100 text-slate-600 font-semibold text-xs flex items-center justify-center">
                          {index + 1}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-semibold text-slate-900">{candidate.candidate_name}</p>
                          {candidate.candidate_email && (
                            <p className="text-xs text-slate-500">{candidate.candidate_email}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap">
                            {candidate.match_score != null ? candidate.match_score.toFixed(1) : '0.0'}%
                          </span>
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full transition-all"
                              style={{ width: `${Math.max(0, candidate.match_score || 0)}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getRecommendationBadge(candidate.recommendation)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {(candidate.key_matches || []).slice(0, 3).map((skill, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-700 border border-green-200"
                            >
                              {skill}
                            </span>
                          ))}
                          {(candidate.key_matches?.length || 0) > 3 && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-green-50 text-green-600 border border-green-200">
                              +{candidate.key_matches.length - 3}
                            </span>
                          )}
                          {(!candidate.key_matches || candidate.key_matches.length === 0) && (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {(candidate.missing_requirements || []).slice(0, 3).map((skill, i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 rounded text-xs bg-red-50 text-red-600 border border-red-200"
                            >
                              {skill}
                            </span>
                          ))}
                          {(candidate.missing_requirements?.length || 0) > 3 && (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-red-50 text-red-500 border border-red-200">
                              +{candidate.missing_requirements.length - 3}
                            </span>
                          )}
                          {(!candidate.missing_requirements || candidate.missing_requirements.length === 0) && (
                            <span className="text-xs text-green-600">None</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => handleDeleteSingle(candidate.id, candidate.candidate_name, e)}
                          disabled={deleting}
                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteAction?.type === 'bulk'
                ? `Delete ${selectedCandidates.size} Candidate${selectedCandidates.size > 1 ? 's' : ''}?`
                : `Delete ${deleteAction?.candidateName}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteAction?.type === 'bulk'
                ? `This will permanently delete ${selectedCandidates.size} selected candidate${selectedCandidates.size > 1 ? 's' : ''} and their data. This action cannot be undone.`
                : `This will permanently delete this candidate and their data. This action cannot be undone.`}
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

      {/* View Job Description Modal */}
      <AlertDialog open={jdDialogOpen} onOpenChange={setJdDialogOpen}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-slate-500" />
              Job Description Details
            </AlertDialogTitle>
            <AlertDialogDescription>
              Review the original criteria AI used for matching.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex-1 overflow-y-auto p-4 border border-slate-200 rounded-lg bg-slate-50 mt-4 font-mono text-sm whitespace-pre-wrap text-slate-700">
            {jobDescriptionText}
          </div>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
