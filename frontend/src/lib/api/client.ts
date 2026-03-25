/**
 * API client for backend communication
 * Uses axios with interceptors for authentication
 */
import axios, { AxiosInstance, AxiosError } from 'axios'
import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

class APIClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 180000, // 3 minutes — LLM calls can be slow
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
    })

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      async (config) => {
        const supabase = createClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (session?.access_token) {
          config.headers.Authorization = `Bearer ${session.access_token}`
        }

        return config
      },
      (error) => Promise.reject(error)
    )

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Redirect to login on unauthorized
          if (typeof window !== 'undefined') {
            window.location.href = '/login'
          }
        }
        if (error.response?.status === 429) {
          // Surface rate-limit errors clearly
          return Promise.reject(new Error('Too many requests — please wait a moment and try again.'))
        }
        if (error.response?.status === 503) {
          return Promise.reject(new Error('Service temporarily unavailable. Please try again shortly.'))
        }
        return Promise.reject(error)
      }
    )
  }

  // Resume Matching APIs
  async uploadJobDescription(formData: FormData) {
    const response = await this.client.post('/api/v1/resume-matching/job-description', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  }

  async uploadResume(formData: FormData) {
    const response = await this.client.post('/api/v1/resume-matching/resume', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  }

  async uploadMultipleResumes(formData: FormData) {
    const response = await this.client.post('/api/v1/resume-matching/resumes/batch', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000, // 10 minutes — LLM batch processing is slow
    })
    return response.data
  }

  async listJobDescriptions() {
    const response = await this.client.get('/api/v1/resume-matching/jobs')
    return response.data
  }

  async getJobDescription(jobId: string) {
    const response = await this.client.get(`/api/v1/resume-matching/job/${jobId}`)
    return response.data
  }

  async getRankedCandidates(jobId: string, limit: number = 50) {
    const response = await this.client.get(`/api/v1/resume-matching/job/${jobId}/candidates`, {
      params: { limit },
    })
    return response.data
  }

  async getJobStatistics(jobId: string) {
    const response = await this.client.get(`/api/v1/resume-matching/job/${jobId}/statistics`)
    return response.data
  }

  async extractSkills(text: string, model?: string) {
    const response = await this.client.post('/api/v1/resume-matching/extract-skills', {
      text,
      model,
    })
    return response.data
  }

  async calculateMatchScore(jobDescription: string, resume: string, model?: string) {
    const response = await this.client.post('/api/v1/resume-matching/calculate-match', {
      job_description: jobDescription,
      resume,
      model,
    })
    return response.data
  }

  async listModels() {
    // Fetch models from local Ollama instance via common API endpoint
    const response = await this.client.get('/api/v1/common/models')
    return response.data
  }

  async getAvailableModels() {
    // Returns list of models available in local Ollama installation
    return this.listModels()
  }

  async deleteJobDescription(jobId: string) {
    const response = await this.client.delete(`/api/v1/resume-matching/job/${jobId}`)
    return response.data
  }

  async deleteResumes(resumeIds: string[]) {
    const response = await this.client.delete('/api/v1/resume-matching/resumes', {
      data: { resume_ids: resumeIds }
    })
    return response.data
  }

  // Test Evaluation APIs
  async uploadQuestionPaper(formData: FormData) {
    const response = await this.client.post('/api/v1/test-evaluation/question-paper', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  }

  async uploadAnswerSheet(formData: FormData) {
    const response = await this.client.post('/api/v1/test-evaluation/answer-sheet', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  }

  async getTestResults(testId: string, limit: number = 100) {
    const response = await this.client.get(`/api/v1/test-evaluation/test/${testId}/results`, {
      params: { limit },
    })
    return response.data
  }

  async getTestStatistics(testId: string) {
    const response = await this.client.get(`/api/v1/test-evaluation/test/${testId}/statistics`)
    return response.data
  }

  async getTestDetails(testId: string, includeQuestions: boolean = true) {
    const response = await this.client.get(`/api/v1/test-evaluation/test/${testId}`, {
      params: { include_questions: includeQuestions },
    })
    return response.data
  }

  async getAnswerSheetEvaluation(answerSheetId: string) {
    const response = await this.client.get(`/api/v1/test-evaluation/answer-sheet/${answerSheetId}`)
    return response.data
  }

  async listTests(testType?: string, limit: number = 50, offset: number = 0) {
    const response = await this.client.get('/api/v1/test-evaluation/tests', {
      params: { test_type: testType, limit, offset },
    })
    return response.data
  }

  async deleteAnswerSheets(answerSheetIds: string[]) {
    const response = await this.client.delete('/api/v1/test-evaluation/answer-sheets', {
      data: { answer_sheet_ids: answerSheetIds }
    })
    return response.data
  }

  // Voice Screening APIs
  async createVoiceCandidate(data: { name: string; email?: string; phone?: string; is_fresher: boolean }) {
    const response = await this.client.post('/api/v1/voice-screening/candidates', data)
    return response.data
  }

  async bulkCreateVoiceCandidates(candidates: { name: string; email?: string; phone?: string; is_fresher: boolean }[]) {
    const response = await this.client.post('/api/v1/voice-screening/candidates/bulk', { candidates })
    return response.data
  }

  async uploadVoiceCandidatesFile(formData: FormData) {
    const response = await this.client.post('/api/v1/voice-screening/candidates/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  }

  async listVoiceCandidates(params?: { limit?: number; offset?: number; status_filter?: string }) {
    const response = await this.client.get('/api/v1/voice-screening/candidates', { params })
    return response.data
  }

  async deleteVoiceCandidate(candidateId: string) {
    const response = await this.client.delete(`/api/v1/voice-screening/candidates/${candidateId}`)
    return response.data
  }

  async exportVoiceScreeningExcel() {
    const response = await this.client.get('/api/v1/voice-screening/export', {
      responseType: 'blob',
    })
    return response.data
  }

  // Campaign Management APIs
  async listCampaigns(params?: { status?: string; limit?: number; offset?: number }) {
    const response = await this.client.get('/api/v1/campaigns', { params })
    return response.data
  }

  async getCampaign(campaignId: string) {
    const response = await this.client.get(`/api/v1/campaigns/${campaignId}`)
    return response.data
  }

  async createCampaign(data: {
    name: string
    description?: string
    metadata?: {
      slots?: Array<{ name: string; time_start: string; time_end: string; description?: string }>
      target_roles?: string[]
      settings?: Record<string, any>
    }
  }) {
    const response = await this.client.post('/api/v1/campaigns', data)
    return response.data
  }

  async updateCampaign(campaignId: string, data: {
    name?: string
    description?: string
    status?: string
    metadata?: any
  }) {
    const response = await this.client.patch(`/api/v1/campaigns/${campaignId}`, data)
    return response.data
  }

  async deleteCampaign(campaignId: string) {
    const response = await this.client.delete(`/api/v1/campaigns/${campaignId}`)
    return response.data
  }

  async getCampaignAnalytics(campaignId: string) {
    const response = await this.client.get(`/api/v1/campaigns/${campaignId}/analytics`)
    return response.data
  }

  async getCampaignCandidates(campaignId: string, params?: {
    job_id?: string
    stage?: string
    limit?: number
    offset?: number
  }) {
    const response = await this.client.get(`/api/v1/campaigns/${campaignId}/candidates`, { params })
    return response.data
  }

  async addCandidateToCampaign(campaignId: string, data: {
    job_id: string
    candidate_name: string
    candidate_email: string
    candidate_phone?: string
    interview_slot?: {
      slot_name: string
      scheduled_date?: string
      time_window?: string
    }
  }) {
    const response = await this.client.post(`/api/v1/campaigns/${campaignId}/candidates`, data)
    return response.data
  }

  async previewCandidateImport(campaignId: string, file: File) {
    const formData = new FormData()
    formData.append('file', file)
    const response = await this.client.post(
      `/api/v1/campaigns/${campaignId}/import/preview`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    return response.data
  }

  async importCandidates(campaignId: string, data: {
    candidates: Array<{
      email: string
      name: string
      phone?: string
      job_role?: string
      slot?: string
      notes?: string
    }>
    job_mappings: Record<string, string>
    slot_mappings?: Record<string, string>
  }) {
    const response = await this.client.post(`/api/v1/campaigns/${campaignId}/import`, data)
    return response.data
  }

  // Campaign Pipeline APIs
  async getCampaignPipelineBoard(campaignId: string, jobId: string) {
    const response = await this.client.get(`/api/v1/campaigns/${campaignId}/pipeline/board`, {
      params: { job_id: jobId }
    })
    return response.data
  }

  async getAvailableInterviews(jobId?: string) {
    const response = await this.client.get('/api/v1/pipeline/available-interviews', {
      params: jobId ? { job_id: jobId } : {}
    })
    return response.data
  }

  async getAvailableVoiceCampaigns(jobId?: string) {
    const response = await this.client.get('/api/v1/pipeline/available-campaigns', {
      params: jobId ? { job_id: jobId } : {}
    })
    return response.data
  }

  async advanceCampaignCandidates(campaignId: string, data: {
    candidate_ids: string[]
    target_stage: string
    interview_id?: string
    voice_campaign_id?: string
  }) {
    const response = await this.client.post(`/api/v1/campaigns/${campaignId}/pipeline/advance`, data)
    return response.data
  }

  async setCandidateDecision(campaignId: string, candidateId: string, data: {
    decision: string
    notes?: string
  }) {
    const response = await this.client.post(
      `/api/v1/campaigns/${campaignId}/candidates/${candidateId}/decision`,
      data
    )
    return response.data
  }

  async deleteCampaignCandidate(campaignId: string, candidateId: string) {
    const response = await this.client.delete(`/api/v1/campaigns/${campaignId}/candidates/${candidateId}`)
    return response.data
  }

  // Health check
  async healthCheck() {
    const response = await this.client.get('/api/v1/health')
    return response.data
  }
}

// Export singleton instance
export const apiClient = new APIClient()
