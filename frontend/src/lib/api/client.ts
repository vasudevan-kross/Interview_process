/**
 * API client for backend communication
 * Uses axios with interceptors for authentication
 */
import axios, { AxiosInstance, AxiosError } from 'axios'
import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

class APIClient {
  private client: AxiosInstance

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
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
    })
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
    const response = await this.client.get('/api/v1/resume-matching/models')
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

  // Health check
  async healthCheck() {
    const response = await this.client.get('/api/v1/health')
    return response.data
  }
}

// Export singleton instance
export const apiClient = new APIClient()
