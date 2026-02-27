/**
 * Video Interviews API Client
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface Interviewer {
  name: string
  email: string
  user_id?: string
}

export interface InterviewQuestion {
  question_text: string
  question_type?: string
  difficulty?: string
  expected_duration_minutes?: number
  skills_assessed?: string[]
  topics?: string[]
  code_template?: string
  test_cases?: any[]
}

export interface ScheduleInterviewRequest {
  job_description_id: string
  candidate_email: string
  candidate_name: string
  resume_id?: string
  title?: string
  description?: string
  scheduled_at: string
  duration_minutes: number
  interviewers: Interviewer[]
  questions?: InterviewQuestion[]
  interview_type?: 'panel' | 'one_on_one' | 'technical'
}

export interface ScheduleInterviewResponse {
  interview_id: string
  room_id: string
  room_name: string
  scheduled_at: string
  duration_minutes: number
  candidate_join_url: string
  interviewer_join_urls: Array<{
    name: string
    email: string
    join_url: string
  }>
  total_participants: number
}

export interface Interview {
  id: string
  job_description_id: string
  resume_id?: string
  candidate_email: string
  candidate_name?: string
  title: string
  description?: string
  interview_type: string
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  scheduled_at: string
  duration_minutes: number
  room_id?: string
  room_name?: string
  recording_path?: string
  recording_duration_seconds?: number
  transcript_text?: string
  started_at?: string
  completed_at?: string
  created_at: string
  updated_at: string
  created_by: string
}

export interface Participant {
  id: string
  video_interview_id: string
  name: string
  email: string
  role: string
  join_url?: string
  joined_at?: string
  left_at?: string
  duration_seconds?: number
  created_at: string
}

export interface Question {
  id: string
  video_interview_id: string
  question_number: number
  question_text: string
  question_type?: string
  difficulty?: string
  expected_duration_minutes?: number
  skills_assessed: string[]
  topics: string[]
  created_at: string
}

export interface Evaluation {
  id: string
  video_interview_id: string
  evaluator_id?: string
  evaluation_type: string
  overall_score?: number
  communication_score?: number
  technical_score?: number
  problem_solving_score?: number
  cultural_fit_score?: number
  strengths: string[]
  weaknesses: string[]
  key_highlights?: string
  concerns?: string
  recommendation?: string
  next_steps?: string
  ai_sentiment_score?: number
  ai_confidence?: number
  created_at: string
  updated_at: string
}

export interface InterviewDetails extends Interview {
  participants: Participant[]
  questions: Question[]
  evaluations: Evaluation[]
}

export interface InterviewListResponse {
  interviews: Interview[]
  total: number
  page: number
  page_size: number
}

export interface CreateEvaluationRequest {
  overall_score: number
  communication_score?: number
  technical_score?: number
  problem_solving_score?: number
  cultural_fit_score?: number
  strengths?: string[]
  weaknesses?: string[]
  key_highlights?: string
  concerns?: string
  recommendation: 'strong_hire' | 'hire' | 'maybe' | 'no_hire' | 'strong_no_hire'
  next_steps?: string
}

/**
 * Schedule a new video interview
 */
export async function scheduleInterview(
  data: ScheduleInterviewRequest
): Promise<ScheduleInterviewResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/video-interviews/schedule`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to schedule interview')
  }

  return response.json()
}

/**
 * List all video interviews with optional filters
 */
export async function listInterviews(params?: {
  status?: string
  job_id?: string
  page?: number
  page_size?: number
}): Promise<InterviewListResponse> {
  const searchParams = new URLSearchParams()
  if (params?.status) searchParams.set('status_filter', params.status)
  if (params?.job_id) searchParams.set('job_id', params.job_id)
  if (params?.page) searchParams.set('page', params.page.toString())
  if (params?.page_size) searchParams.set('page_size', params.page_size.toString())

  const url = `${API_BASE_URL}/api/v1/video-interviews?${searchParams.toString()}`
  const response = await fetch(url)

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to list interviews')
  }

  return response.json()
}

/**
 * Get interview details by ID
 */
export async function getInterviewDetails(interviewId: string): Promise<InterviewDetails> {
  const response = await fetch(`${API_BASE_URL}/api/v1/video-interviews/${interviewId}`)

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to get interview details')
  }

  return response.json()
}

/**
 * Update interview
 */
export async function updateInterview(
  interviewId: string,
  data: {
    scheduled_at?: string
    duration_minutes?: number
    status?: string
    description?: string
  }
): Promise<Interview> {
  const response = await fetch(`${API_BASE_URL}/api/v1/video-interviews/${interviewId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to update interview')
  }

  return response.json()
}

/**
 * Delete/cancel interview
 */
export async function deleteInterview(interviewId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/video-interviews/${interviewId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to delete interview')
  }
}

/**
 * Get interview participants
 */
export async function getInterviewParticipants(interviewId: string): Promise<Participant[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/video-interviews/${interviewId}/participants`)

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to get participants')
  }

  return response.json()
}

/**
 * Get interview questions
 */
export async function getInterviewQuestions(interviewId: string): Promise<Question[]> {
  const response = await fetch(`${API_BASE_URL}/api/v1/video-interviews/${interviewId}/questions`)

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to get questions')
  }

  return response.json()
}

/**
 * Get recording signed URL
 */
export async function getRecordingUrl(interviewId: string): Promise<{
  recording_url: string
  duration_seconds?: number
  expires_in: number
}> {
  const response = await fetch(`${API_BASE_URL}/api/v1/video-interviews/${interviewId}/recording`)

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to get recording URL')
  }

  return response.json()
}

/**
 * Create interview evaluation
 */
export async function createEvaluation(
  interviewId: string,
  data: CreateEvaluationRequest
): Promise<Evaluation> {
  const response = await fetch(`${API_BASE_URL}/api/v1/video-interviews/${interviewId}/evaluate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to create evaluation')
  }

  return response.json()
}
