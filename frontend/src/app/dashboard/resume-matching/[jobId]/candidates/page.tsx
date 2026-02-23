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
import { Loader2, Search, TrendingUp, Users, Award, ChevronUp, ChevronDown } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

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
        return (a.match_score - b.match_score) * modifier
      }
      return a.candidate_name.localeCompare(b.candidate_name) * modifier
    })

  const getScoreBadge = (score: number) => {
    if (score >= 80) return <Badge variant="success">{score.toFixed(1)}%</Badge>
    if (score >= 60) return <Badge variant="warning">{score.toFixed(1)}%</Badge>
    return <Badge variant="destructive">{score.toFixed(1)}%</Badge>
  }

  const toggleSort = (field: 'match_score' | 'candidate_name') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Candidate Rankings</h1>
          <p className="text-muted-foreground">
            AI-matched candidates sorted by compatibility score
          </p>
        </div>
        <Button onClick={() => router.push(`/dashboard/resume-matching/${jobId}/upload-resumes`)}>
          Upload More Resumes
        </Button>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-600" />
                Total Candidates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.total_resumes}</div>
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
              <div className="text-2xl font-bold">{statistics.average_score.toFixed(1)}%</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Award className="h-4 w-4 text-purple-600" />
                Top Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.top_score.toFixed(1)}%</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Score Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs space-y-1">
                <div>90-100%: {statistics.score_distribution?.['90-100'] || 0}</div>
                <div>80-89%: {statistics.score_distribution?.['80-89'] || 0}</div>
                <div>70-79%: {statistics.score_distribution?.['70-79'] || 0}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Search Candidates</CardTitle>
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

      {/* Candidates Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Candidates ({filteredCandidates.length})</CardTitle>
          <CardDescription>
            Click on a candidate to view detailed analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 p-3 bg-muted rounded-lg font-medium text-sm">
              <div
                className="col-span-1 cursor-pointer flex items-center gap-1"
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
                className="col-span-3 cursor-pointer flex items-center gap-1"
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
              <div className="col-span-2">Match Score</div>
              <div className="col-span-4">Key Skills</div>
              <div className="col-span-2">Submitted</div>
            </div>

            {/* Table Rows */}
            {filteredCandidates.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No candidates found. Upload resumes to get started.
              </div>
            ) : (
              filteredCandidates.map((candidate, index) => (
                <div
                  key={candidate.id}
                  className="grid grid-cols-12 gap-4 p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() =>
                    router.push(`/dashboard/resume-matching/${jobId}/candidates/${candidate.id}`)
                  }
                >
                  <div className="col-span-1 font-bold text-lg text-muted-foreground">
                    #{index + 1}
                  </div>
                  <div className="col-span-3">
                    <p className="font-medium">{candidate.candidate_name}</p>
                    {candidate.candidate_email && (
                      <p className="text-xs text-muted-foreground">{candidate.candidate_email}</p>
                    )}
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    {getScoreBadge(candidate.match_score)}
                    <Progress value={candidate.match_score} className="flex-1" />
                  </div>
                  <div className="col-span-4">
                    <div className="flex flex-wrap gap-1">
                      {candidate.skills_extracted.technical_skills
                        ?.slice(0, 3)
                        .map((skill, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                      {candidate.skills_extracted.technical_skills?.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{candidate.skills_extracted.technical_skills.length - 3}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 text-sm text-muted-foreground">
                    {formatDateTime(candidate.created_at)}
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
