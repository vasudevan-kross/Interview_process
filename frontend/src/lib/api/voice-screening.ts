/**
 * Voice Screening API wrapper
 */
import axios from 'axios'
import { apiClient } from './client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

// Types
export interface VoiceCandidate {
    id: string
    created_at?: string
    updated_at?: string
    created_by?: string
    interview_token: string
    name: string
    email?: string
    phone?: string
    is_fresher: boolean
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
    call_id?: string
    gender?: string
    current_work_location?: string
    native_location?: string
    current_employer?: string
    work_type?: string
    employment_type?: string
    current_role?: string
    expertise_in?: string
    total_experience?: string
    certifications?: string
    projects_handled?: string
    current_ctc?: string
    expected_ctc?: string
    notice_period?: string
    serving_notice_period?: string
    tentative_joining_date?: string
    existing_offers?: string
    available_interview_time?: string
    current_team_size?: string
    current_shift_timing?: string
    reason_for_leaving?: string
    transcript?: string
    recording_url?: string
}

export interface VoiceCandidatePublic {
    id: string
    interview_token: string
    name: string
    is_fresher: boolean
    status: string
}

// API Functions (authenticated - use apiClient)
export async function createCandidate(data: {
    name: string
    email?: string
    phone?: string
    is_fresher: boolean
}): Promise<VoiceCandidate> {
    const response = await apiClient['client'].post('/api/v1/voice-screening/candidates', data)
    return response.data
}

export async function bulkCreateCandidates(candidates: {
    name: string
    email?: string
    phone?: string
    is_fresher: boolean
}[]): Promise<{ created: number; candidates: VoiceCandidate[] }> {
    const response = await apiClient['client'].post('/api/v1/voice-screening/candidates/bulk', {
        candidates,
    })
    return response.data
}

export async function uploadCandidatesFile(file: File): Promise<{ created: number; candidates: VoiceCandidate[]; filename: string }> {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient['client'].post('/api/v1/voice-screening/candidates/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
}

export async function listCandidates(params?: {
    limit?: number
    offset?: number
    status_filter?: string
}): Promise<{ candidates: VoiceCandidate[]; count: number }> {
    const response = await apiClient['client'].get('/api/v1/voice-screening/candidates', {
        params,
    })
    return response.data
}

export async function deleteCandidate(candidateId: string): Promise<void> {
    await apiClient['client'].delete(`/api/v1/voice-screening/candidates/${candidateId}`)
}

export async function exportToExcel(): Promise<Blob> {
    const response = await apiClient['client'].get('/api/v1/voice-screening/export', {
        responseType: 'blob',
    })
    return response.data
}

// Public API Functions (no auth needed - for shareable link page)
export async function getCandidateByToken(token: string): Promise<VoiceCandidatePublic> {
    const response = await axios.get(`${API_URL}/api/v1/voice-screening/candidates/token/${token}`)
    return response.data
}

export async function startCall(token: string, callId?: string): Promise<void> {
    await axios.post(`${API_URL}/api/v1/voice-screening/candidates/token/${token}/start-call`, null, {
        params: { call_id: callId },
    })
}
