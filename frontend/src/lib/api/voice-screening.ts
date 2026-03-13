/**
 * Voice Screening API wrapper - Clean schema with dynamic field extraction
 */
import axios from 'axios'
import { apiClient } from './client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

// Campaign Types
export interface Campaign {
    id: string
    created_at: string
    updated_at?: string
    created_by?: string
    name: string
    job_role: string
    description?: string
    is_active: boolean

    // Job context
    job_description_text?: string
    technical_requirements?: string

    // Configuration
    custom_questions: string[]
    required_fields: string[]
    interview_persona: 'professional' | 'casual' | 'technical'
    candidate_type: 'fresher' | 'experienced' | 'general'
    interview_style: 'structured' | 'adaptive' | 'conversational'

    // AI-generated
    generated_system_prompt: string
    generated_schema: Record<string, any>
    vapi_config: Record<string, any>

    // VAPI integration
    knowledge_base_file_ids: string[]
    vapi_functions: Array<Record<string, any>>

    // Tracking
    generation_model?: string
    generation_metadata?: {
        expected_questions?: string[]
        conversation_flow?: string
    }
}

export interface CampaignCreateRequest {
    name: string
    job_role: string
    description?: string
    job_description_text?: string
    technical_requirements?: string
    custom_questions?: string[]
    required_fields?: string[]
    interview_persona?: 'professional' | 'casual' | 'technical'
    candidate_type?: 'fresher' | 'experienced' | 'general'
    interview_style?: 'structured' | 'adaptive' | 'conversational'
    knowledge_base_file_ids?: string[]
    job_id?: string  // Link to job_descriptions for pipeline
}

// Candidate Types (Minimal - no hardcoded extracted fields)
export interface VoiceCandidate {
    id: string
    created_at?: string
    updated_at?: string
    created_by?: string

    // Campaign
    campaign_id?: string
    campaign_name?: string  // Campaign name (joined from campaign)
    vapi_config?: any  // Campaign VAPI configuration (from campaign)

    // Identity
    interview_token: string
    name: string
    email?: string
    phone?: string

    // Status
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
    latest_call_id?: string

    // Notes
    recruiter_notes?: string
}

export interface VoiceCandidatePublic {
    id: string
    interview_token: string
    name: string
    status: string
    campaign_id?: string
    vapi_config?: any
}

// Call History Types
export interface CallHistory {
    id: string
    created_at: string
    updated_at?: string

    // Call info
    candidate_id: string
    call_id: string
    status: string

    // Timing
    started_at: string
    ended_at?: string
    duration_seconds?: number

    // Content
    transcript?: string
    recording_url?: string

    // Dynamic extracted data (flexible per campaign)
    structured_data: Record<string, any>

    // AI-generated analysis
    interview_summary?: string
    key_points: string[]
    technical_assessment: TechnicalAssessment

    // Metadata
    call_type: string
    initiated_by?: string
    notes?: string

    // VAPI
    vapi_cost_cents?: number
    vapi_duration_minutes?: number
    vapi_metadata: Record<string, any>
}

export interface TechnicalAssessment {
    skills_mentioned: string[]
    experience_level?: string
    years_experience?: string
    tech_stack_match_percentage?: number
    strengths: string[]
    gaps: string[]
    recommendation?: string
    hiring_decision_confidence?: string
}

// VAPI File Types
export interface VapiFile {
    file_id: string
    name: string
    status: string
}

// Question Generation
export interface QuestionGenerationRequest {
    job_role: string
    candidate_type?: 'fresher' | 'experienced' | 'general'
    num_questions?: number
    job_description_text?: string
    technical_requirements?: string
}

export interface QuestionGenerationResponse {
    questions: string[]
    model: string
}

// ============================================================================
// CAMPAIGN API FUNCTIONS
// ============================================================================

export async function createCampaign(data: CampaignCreateRequest): Promise<Campaign> {
    const response = await apiClient['client'].post('/api/v1/voice-screening/campaigns', data)
    return response.data
}

export async function listCampaigns(params?: {
    is_active?: boolean
}): Promise<Campaign[]> {
    const response = await apiClient['client'].get('/api/v1/voice-screening/campaigns', {
        params,
    })
    return response.data
}

export async function getCampaign(campaignId: string): Promise<Campaign> {
    const response = await apiClient['client'].get(`/api/v1/voice-screening/campaigns/${campaignId}`)
    return response.data
}

export async function updateCampaign(campaignId: string, updates: Partial<Campaign>): Promise<Campaign> {
    const response = await apiClient['client'].patch(`/api/v1/voice-screening/campaigns/${campaignId}`, updates)
    return response.data
}

export async function deleteCampaign(campaignId: string): Promise<void> {
    await apiClient['client'].delete(`/api/v1/voice-screening/campaigns/${campaignId}`)
}

export async function regenerateCampaignPrompt(campaignId: string): Promise<Campaign> {
    const response = await apiClient['client'].post(`/api/v1/voice-screening/campaigns/${campaignId}/regenerate`)
    return response.data
}

// ============================================================================
// CANDIDATE API FUNCTIONS
// ============================================================================

export async function createCandidate(data: {
    name: string
    email?: string
    phone?: string
    campaign_id: string
}): Promise<VoiceCandidate> {
    const response = await apiClient['client'].post('/api/v1/voice-screening/candidates', data)
    return response.data
}

export async function bulkCreateCandidates(data: {
    campaign_id: string
    candidates: Array<{
        name: string
        email?: string
        phone?: string
    }>
}): Promise<VoiceCandidate[]> {
    const response = await apiClient['client'].post('/api/v1/voice-screening/candidates/bulk', data)
    return response.data
}

export async function uploadCandidatesFile(campaignId: string, file: File): Promise<{ message: string; count: number }> {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient['client'].post(`/api/v1/voice-screening/candidates/upload?campaign_id=${campaignId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
}

export async function listCandidates(params?: {
    campaign_id?: string
    status?: string
}): Promise<VoiceCandidate[]> {
    const response = await apiClient['client'].get('/api/v1/voice-screening/candidates', {
        params,
    })
    return response.data
}

export async function getCandidate(candidateId: string): Promise<VoiceCandidate> {
    const response = await apiClient['client'].get(`/api/v1/voice-screening/candidates/${candidateId}`)
    return response.data
}

export async function updateCandidate(candidateId: string, updates: {
    name?: string
    email?: string
    phone?: string
}): Promise<VoiceCandidate> {
    const response = await apiClient['client'].patch(`/api/v1/voice-screening/candidates/${candidateId}`, updates)
    return response.data
}

export async function deleteCandidate(candidateId: string): Promise<void> {
    await apiClient['client'].delete(`/api/v1/voice-screening/candidates/${candidateId}`)
}

// ============================================================================
// CALL HISTORY API FUNCTIONS
// ============================================================================

export async function fetchCallData(token: string, callId: string): Promise<{
    success: boolean
    message: string
    call_data?: any
    call_history_id?: string
}> {
    const response = await axios.post(`/api/v1/voice-screening/candidates/token/${token}/fetch-call-data`, {
        call_id: callId
    }, {
        headers: {
            'ngrok-skip-browser-warning': 'true',
        },
    })
    return response.data
}

export async function getCallHistory(candidateId: string): Promise<CallHistory[]> {
    const response = await apiClient['client'].get(`/api/v1/voice-screening/candidates/${candidateId}/call-history`)
    return response.data
}

export async function reEvaluateInterview(callHistoryId: string): Promise<CallHistory> {
    const response = await apiClient['client'].post(`/api/v1/voice-screening/call-history/${callHistoryId}/re-evaluate`)
    return response.data
}

// ============================================================================
// VAPI FILE API FUNCTIONS
// ============================================================================

export async function uploadVapiFile(file: File): Promise<VapiFile> {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient['client'].post('/api/v1/voice-screening/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
}

// Alias for backward compatibility
export const uploadFileToVapi = uploadVapiFile

export async function listVapiFiles(): Promise<{ files: VapiFile[] }> {
    const response = await apiClient['client'].get('/api/v1/voice-screening/files')
    return response.data
}

export async function deleteVapiFile(fileId: string): Promise<void> {
    await apiClient['client'].delete(`/api/v1/voice-screening/files/${fileId}`)
}

// ============================================================================
// QUESTION GENERATION API FUNCTION
// ============================================================================

export async function generateQuestions(request: QuestionGenerationRequest): Promise<QuestionGenerationResponse> {
    const response = await apiClient['client'].post('/api/v1/voice-screening/generate-questions', request)
    return response.data
}

// ============================================================================
// EXPORT API FUNCTION
// ============================================================================

export async function exportToExcel(campaignId?: string): Promise<Blob> {
    const response = await apiClient['client'].get('/api/v1/voice-screening/export', {
        params: campaignId ? { campaign_id: campaignId } : undefined,
        responseType: 'blob',
    })
    return response.data
}

// ============================================================================
// PUBLIC API FUNCTIONS (no auth needed - for shareable link page)
// ============================================================================

export async function getCandidateByToken(token: string): Promise<VoiceCandidatePublic> {
    const response = await axios.get(`/api/v1/voice-screening/candidates/token/${token}`, {
        headers: {
            'ngrok-skip-browser-warning': 'true',
        },
    })
    return response.data
}

export async function startCall(token: string, callId?: string): Promise<void> {
    await axios.post(`/api/v1/voice-screening/candidates/token/${token}/start-call`, null, {
        params: { call_id: callId },
        headers: {
            'ngrok-skip-browser-warning': 'true',
        },
    })
}
