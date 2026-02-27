import axios from 'axios'
import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Cache for Supabase client to avoid multiple instances
let supabaseClientInstance: ReturnType<typeof createClient> | null = null

// Get or create Supabase client singleton
const getSupabaseClient = () => {
  if (!supabaseClientInstance) {
    supabaseClientInstance = createClient()
  }
  return supabaseClientInstance
}

// Create axios instance with auth interceptor
const createAuthenticatedClient = () => {
  const client = axios.create({
    baseURL: API_URL,
  })

  client.interceptors.request.use(
    async (config) => {
      try {
        const supabase = getSupabaseClient()

        // Use getSession with timeout handling
        const sessionPromise = supabase.auth.getSession()
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Session timeout')), 5000)
        )

        const { data: { session } } = await Promise.race([
          sessionPromise,
          timeoutPromise
        ]) as any

        if (session?.access_token) {
          config.headers.Authorization = `Bearer ${session.access_token}`
        }
      } catch (error) {
        console.warn('Failed to get session for auth header:', error)
        // Continue without auth header if session fetch fails
      }

      return config
    },
    (error) => Promise.reject(error)
  )

  return client
}

export interface BatchUploadResponse {
  batch_id: string
  total_papers: number
  status: string
  message: string
}

export interface BatchStatusResponse {
  batch_id: string
  status: 'processing' | 'completed' | 'error'
  total: number
  processed: number
  progress_percentage: number
}

export interface BatchResultsResponse {
  batch_id: string
  total_papers: number
  successful: number
  failed: number
  average_score: number
  results: Array<{
    filename: string
    status: 'success' | 'error'
    score?: number
    percentage?: number
    candidate_name?: string
    error?: string
  }>
}

export const testEvaluationApi = {
  /**
   * Upload multiple answer sheets for batch processing
   */
  async uploadBatch(testId: string, files: File[]): Promise<BatchUploadResponse> {
    const client = createAuthenticatedClient()
    const formData = new FormData()
    formData.append('test_id', testId)

    files.forEach(file => {
      formData.append('files', file)
    })

    const response = await client.post(
      '/api/v1/test-evaluation/batch/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
    )
    return response.data
  },

  /**
   * Check batch processing status
   */
  async getBatchStatus(batchId: string): Promise<BatchStatusResponse> {
    const client = createAuthenticatedClient()
    const response = await client.get(
      `/api/v1/test-evaluation/batch/status/${batchId}`
    )
    return response.data
  },

  /**
   * Get batch results (only after completion)
   */
  async getBatchResults(batchId: string): Promise<BatchResultsResponse> {
    const client = createAuthenticatedClient()
    const response = await client.get(
      `/api/v1/test-evaluation/batch/results/${batchId}`
    )
    return response.data
  }
}
