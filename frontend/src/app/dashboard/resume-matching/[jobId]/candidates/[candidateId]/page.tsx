'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Mail, Phone, Calendar, Award, CheckCircle2, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface CandidateDetails {
  id: string
  candidate_name: string
  candidate_email: string | null
  candidate_phone: string | null
  match_score: number
  skill_match: {
    key_matches: string[]
    missing_requirements: string[]
    reasoning: string
  }
  parsed_data: {
    skills_extracted: {
      technical_skills: string[]
      soft_skills: string[]
      tools: string[]
      languages: string[]
      certifications: string[]
    }
    file_name: string
  }
  raw_text: string
  created_at: string
}

export default function CandidateDetailPage() {
  const router = useRouter()
  const params = useParams()
  const jobId = params.jobId as string
  const candidateId = params.candidateId as string

  const [candidate, setCandidate] = useState<CandidateDetails | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCandidateDetails()
  }, [candidateId])

  const fetchCandidateDetails = async () => {
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from('resumes')
        .select('*')
        .eq('id', candidateId)
        .single()

      if (error) {
        console.error('Error fetching candidate:', error)
        toast.error('Failed to load candidate details')
        return
      }

      setCandidate(data)
    } catch (error) {
      console.error('Error:', error)
      toast.error('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50'
    if (score >= 60) return 'text-yellow-600 bg-yellow-50'
    return 'text-red-600 bg-red-50'
  }

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent Match'
    if (score >= 60) return 'Good Match'
    return 'Fair Match'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading candidate details...</p>
        </div>
      </div>
    )
  }

  if (!candidate) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <h2 className="text-2xl font-bold mb-4">Candidate Not Found</h2>
        <Button onClick={() => router.push(`/dashboard/resume-matching/${jobId}/candidates`)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Candidates
        </Button>
      </div>
    )
  }

  const skills = candidate.parsed_data?.skills_extracted || {}
  const matchDetails = candidate.skill_match || { key_matches: [], missing_requirements: [], reasoning: '' }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => router.push(`/dashboard/resume-matching/${jobId}/candidates`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to All Candidates
        </Button>
      </div>

      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-3xl mb-2">{candidate.candidate_name}</CardTitle>
              <div className="space-y-1 text-sm text-muted-foreground">
                {candidate.candidate_email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    {candidate.candidate_email}
                  </div>
                )}
                {candidate.candidate_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    {candidate.candidate_phone}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Submitted {format(new Date(candidate.created_at), 'MMM d, yyyy')}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${getScoreColor(candidate.match_score || 0)}`}>
                <Award className="h-5 w-5" />
                <div>
                  <div className="text-2xl font-bold">{candidate.match_score != null ? candidate.match_score.toFixed(1) : '0.0'}%</div>
                  <div className="text-xs">{getScoreLabel(candidate.match_score || 0)}</div>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Match Analysis */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              Key Matches
            </CardTitle>
            <CardDescription>Skills and qualifications that match the job</CardDescription>
          </CardHeader>
          <CardContent>
            {matchDetails.key_matches && matchDetails.key_matches.length > 0 ? (
              <ul className="space-y-2">
                {matchDetails.key_matches.map((match, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{match}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No specific matches identified</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-600">
              <XCircle className="h-5 w-5" />
              Missing Requirements
            </CardTitle>
            <CardDescription>Skills or qualifications not found</CardDescription>
          </CardHeader>
          <CardContent>
            {matchDetails.missing_requirements && matchDetails.missing_requirements.length > 0 ? (
              <ul className="space-y-2">
                {matchDetails.missing_requirements.map((requirement, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{requirement}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">All requirements met</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Analysis */}
      {matchDetails.reasoning && (
        <Card>
          <CardHeader>
            <CardTitle>AI Analysis</CardTitle>
            <CardDescription>Detailed reasoning for the match score</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{matchDetails.reasoning}</p>
          </CardContent>
        </Card>
      )}

      {/* Skills Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Extracted Skills</CardTitle>
          <CardDescription>Skills identified from the resume</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {skills.technical_skills && skills.technical_skills.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Technical Skills</h4>
              <div className="flex flex-wrap gap-2">
                {skills.technical_skills.map((skill, index) => (
                  <Badge key={index} variant="secondary">{skill}</Badge>
                ))}
              </div>
            </div>
          )}

          {skills.tools && skills.tools.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Tools & Technologies</h4>
              <div className="flex flex-wrap gap-2">
                {skills.tools.map((tool, index) => (
                  <Badge key={index} variant="outline">{tool}</Badge>
                ))}
              </div>
            </div>
          )}

          {skills.languages && skills.languages.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Programming Languages</h4>
              <div className="flex flex-wrap gap-2">
                {skills.languages.map((lang, index) => (
                  <Badge key={index} variant="secondary">{lang}</Badge>
                ))}
              </div>
            </div>
          )}

          {skills.soft_skills && skills.soft_skills.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Soft Skills</h4>
              <div className="flex flex-wrap gap-2">
                {skills.soft_skills.map((skill, index) => (
                  <Badge key={index} variant="outline">{skill}</Badge>
                ))}
              </div>
            </div>
          )}

          {skills.certifications && skills.certifications.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Certifications</h4>
              <div className="flex flex-wrap gap-2">
                {skills.certifications.map((cert, index) => (
                  <Badge key={index} className="bg-blue-100 text-blue-800">{cert}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resume Text */}
      <Card>
        <CardHeader>
          <CardTitle>Resume Text</CardTitle>
          <CardDescription>Full extracted resume content</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted p-4 rounded-lg">
            <pre className="whitespace-pre-wrap text-sm font-mono">{candidate.raw_text}</pre>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
