/**
 * Pipeline API Client
 *
 * Provides typed API methods for:
 * - Pipeline board (Kanban data)
 * - Threshold settings
 * - Promoting resumes into pipeline
 * - Advancing candidates between stages
 * - Final hiring decisions
 */

import { createClient } from '@/lib/supabase/client'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''
const API_PREFIX = '/api/v1'

async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  }

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  return headers
}

function extractErrorMessage(detail: any, fallback: string): string {
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((e: any) => (typeof e === 'string' ? e : e.msg || JSON.stringify(e))).join('; ')
  }
  return JSON.stringify(detail)
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface PipelineCandidate {
  id: string
  job_id: string
  candidate_name: string
  candidate_email: string
  candidate_phone?: string
  current_stage: 'resume_screening' | 'technical_assessment' | 'voice_screening' | 'completed'
  skipped_stages: string[]
  resume_id?: string
  coding_submission_id?: string
  voice_candidate_id?: string
  resume_match_score?: number
  coding_score?: number
  coding_percentage?: number
  voice_status?: string
  recommendation: 'highly_recommended' | 'recommended' | 'not_recommended' | 'pending'
  final_decision: 'pending' | 'selected' | 'rejected' | 'hold'
  decision_notes?: string
  decided_by?: string
  decided_at?: string
  created_at: string
  updated_at: string
}

export interface PipelineBoard {
  resume_screening: PipelineCandidate[]
  technical_assessment: PipelineCandidate[]
  voice_screening: PipelineCandidate[]
  completed: PipelineCandidate[]
}

export interface PipelineStats {
  total: number
  stages: Record<string, number>
  recommendations: Record<string, number>
  decisions: Record<string, number>
}

export interface PipelineSettings {
  job_id: string
  title: string
  highly_recommended_threshold: number
  recommended_threshold: number
}

export interface AvailableInterview {
  id: string
  title: string
  status: string
  interview_type: string
  programming_language: string
  scheduled_start_time: string
}

export interface AvailableCampaign {
  id: string
  name: string
  job_role: string
  is_active: boolean
  candidate_type: string
  interview_style: string
}

// ── API Functions ──────────────────────────────────────────────────────────

export async function getPipelineBoard(jobId: string): Promise<PipelineBoard> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE_URL}${API_PREFIX}/pipeline/${jobId}`, { headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(extractErrorMessage(err.detail, 'Failed to load pipeline board'))
  }
  return res.json()
}

export async function getPipelineStats(jobId: string): Promise<PipelineStats> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE_URL}${API_PREFIX}/pipeline/${jobId}/stats`, { headers })
  if (!res.ok) throw new Error('Failed to load pipeline stats')
  return res.json()
}

export async function getPipelineCandidates(
  jobId: string,
  params?: { stage?: string; recommendation?: string }
): Promise<PipelineCandidate[]> {
  const headers = await getAuthHeaders()
  const searchParams = new URLSearchParams()
  if (params?.stage) searchParams.set('stage', params.stage)
  if (params?.recommendation) searchParams.set('recommendation', params.recommendation)

  const url = `${API_BASE_URL}${API_PREFIX}/pipeline/${jobId}/candidates?${searchParams}`
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error('Failed to load pipeline candidates')
  return res.json()
}

export async function getPipelineSettings(jobId: string): Promise<PipelineSettings> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE_URL}${API_PREFIX}/pipeline/${jobId}/settings`, { headers })
  if (!res.ok) throw new Error('Failed to load pipeline settings')
  return res.json()
}

export async function updatePipelineSettings(
  jobId: string,
  settings: { highly_recommended_threshold: number; recommended_threshold: number }
): Promise<PipelineSettings> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE_URL}${API_PREFIX}/pipeline/${jobId}/settings`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(settings),
  })
  if (!res.ok) throw new Error('Failed to update settings')
  return res.json()
}

export async function promoteTopipeline(jobId: string, resumeIds: string[]): Promise<{ created: number; skipped: number }> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE_URL}${API_PREFIX}/pipeline/${jobId}/promote`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ resume_ids: resumeIds }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(extractErrorMessage(err.detail, 'Failed to promote candidates'))
  }
  return res.json()
}

export async function advanceCandidates(
  jobId: string,
  candidateIds: string[],
  targetStage: string,
  interviewId?: string,
  campaignId?: string,
): Promise<{ advanced: number; skipped: number }> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE_URL}${API_PREFIX}/pipeline/${jobId}/advance`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      candidate_ids: candidateIds,
      target_stage: targetStage,
      interview_id: interviewId || null,
      campaign_id: campaignId || null,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(extractErrorMessage(err.detail, 'Failed to advance candidates'))
  }
  return res.json()
}

export async function setPipelineDecision(
  candidateId: string,
  decision: string,
  notes?: string,
): Promise<PipelineCandidate> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE_URL}${API_PREFIX}/pipeline/candidates/${candidateId}/decision`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ decision, notes }),
  })
  if (!res.ok) throw new Error('Failed to set decision')
  return res.json()
}

export async function deletePipelineCandidate(candidateId: string): Promise<void> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE_URL}${API_PREFIX}/pipeline/candidates/${candidateId}`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) throw new Error('Failed to delete candidate')
}

export async function getAvailableInterviews(jobId?: string): Promise<AvailableInterview[]> {
  const headers = await getAuthHeaders()
  const params = jobId ? `?job_id=${jobId}` : ''
  const res = await fetch(`${API_BASE_URL}${API_PREFIX}/pipeline/targets/interviews${params}`, { headers })
  if (!res.ok) throw new Error('Failed to load interviews')
  return res.json()
}

export async function getAvailableCampaigns(jobId?: string): Promise<AvailableCampaign[]> {
  const headers = await getAuthHeaders()
  const params = jobId ? `?job_id=${jobId}` : ''
  const res = await fetch(`${API_BASE_URL}${API_PREFIX}/pipeline/targets/campaigns${params}`, { headers })
  if (!res.ok) throw new Error('Failed to load campaigns')
  return res.json()
}
