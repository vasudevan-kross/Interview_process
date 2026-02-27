/**
 * Coding Interviews API Client
 *
 * Provides typed API methods for:
 * - Creating and managing coding/testing interviews
 * - AI question generation
 * - Candidate submission flow
 * - Anti-cheating tracking
 * - Evaluation and review
 */

import { createClient } from '@/lib/supabase/client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';
const API_PREFIX = '/api/v1';

/**
 * Get auth headers with current logged-in user's token
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  };

  // Add authorization header with user's JWT token
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  return headers;
}

// ============================================================================
// Types
// ============================================================================

export interface Question {
  id?: string;
  question_text: string;
  difficulty: 'easy' | 'medium' | 'hard';
  marks: number;
  starter_code?: string;
  solution_code?: string;
  test_cases?: Array<{ input: string; expected_output: string }>;
  topics?: string[];
  time_estimate_minutes?: number;
}

export interface Interview {
  id: string;
  title: string;
  description?: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  grace_period_minutes: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'expired';
  access_token: string;
  link_expires_at: string;
  interview_type: 'coding' | 'testing' | 'both';
  programming_language: string;
  allowed_languages?: string[];  // Languages candidates can choose from. undefined/[] = ANY language
  total_marks: number;
  duration_minutes?: number;
  resume_required: 'mandatory' | 'optional' | 'disabled';
  created_at: string;
  questions?: Question[];
}

export interface Submission {
  id: string;
  interview_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone?: string;
  preferred_language?: string;  // Language chosen by candidate
  started_at: string;
  submitted_at?: string;
  status: 'in_progress' | 'submitted' | 'auto_submitted' | 'abandoned';
  total_marks_obtained?: number;
  percentage?: number;
  late_submission: boolean;
  suspicious_activity: boolean;
  session_duration_seconds?: number;
  resume_path?: string;
  resume_uploaded_at?: string;
  answers?: Answer[];
  activities?: Activity[];
}

export interface Answer {
  id: string;
  submission_id: string;
  question_id: string;
  submitted_code?: string;
  programming_language: string;
  marks_awarded?: number;
  is_correct: boolean;
  similarity_score?: number;
  feedback?: string;
  key_points_covered?: string[];
  key_points_missed?: string[];
  code_quality_score?: number;
  evaluated_at?: string;
}

export interface Activity {
  id: string;
  submission_id: string;
  activity_type: string;
  timestamp: string;
  question_id?: string;
  metadata?: Record<string, any>;
  flagged: boolean;
  severity: 'low' | 'medium' | 'high';
}

// ============================================================================
// API Methods - Authenticated (Interviewer)
// ============================================================================

/**
 * Create a new coding/testing interview
 */
export async function createInterview(data: {
  title: string;
  description?: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  programming_language: string;
  allowed_languages?: string[];  // Languages candidates can choose from
  interview_type: 'coding' | 'testing' | 'both';
  grace_period_minutes?: number;
  resume_required?: 'mandatory' | 'optional' | 'disabled';
  questions: Question[];
}): Promise<{
  interview_id: string;
  access_token: string;
  shareable_link: string;
  questions: Question[];
}> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/coding-interviews`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to create interview');
  }

  return response.json();
}

/**
 * Generate questions using AI (Ollama codellama:7b)
 */
export async function generateQuestions(data: {
  job_description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  num_questions: number;
  programming_language?: string;
  test_framework?: string;
  interview_type: 'coding' | 'testing' | 'both';
}): Promise<{ questions: Question[]; count: number }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/coding-interviews/generate-questions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to generate questions');
  }

  return response.json();
}

/**
 * Extract questions from uploaded document (PDF, Word, Image, Excel, CSV)
 */
export async function extractQuestionsFromDocument(data: {
  file: File;
  programming_language?: string;
  interview_type?: 'coding' | 'testing' | 'both';
  difficulty?: 'easy' | 'medium' | 'hard';
}): Promise<{ questions: Question[]; count: number; extracted_text_length: number }> {
  const formData = new FormData();
  formData.append('file', data.file);
  formData.append('programming_language', data.programming_language || 'python');
  formData.append('interview_type', data.interview_type || 'coding');
  formData.append('difficulty', data.difficulty || 'medium');

  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/coding-interviews/extract-questions`, {
    method: 'POST',
    body: formData,
    // Note: Don't set Content-Type header - browser will set it with boundary for multipart/form-data
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to extract questions from document');
  }

  return response.json();
}

/**
 * List all interviews created by current user
 */
export async function listInterviews(params?: {
  status_filter?: string;
  limit?: number;
  offset?: number;
}): Promise<{ interviews: Interview[]; count: number }> {
  const query = new URLSearchParams();
  if (params?.status_filter) query.set('status_filter', params.status_filter);
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.offset) query.set('offset', params.offset.toString());

  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/coding-interviews?${query}`, {
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to list interviews');
  }

  return response.json();
}

/**
 * Get interview details with questions
 */
export async function getInterview(interviewId: string): Promise<Interview> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/coding-interviews/${interviewId}`, {
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get interview');
  }

  return response.json();
}

/**
 * Delete an interview
 */
export async function deleteInterview(interviewId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/coding-interviews/${interviewId}`, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to delete interview');
  }
}

/**
 * List submissions for an interview
 */
export async function listSubmissions(
  interviewId: string
): Promise<{ submissions: Submission[]; count: number }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/coding-interviews/${interviewId}/submissions`, {
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to list submissions');
  }

  return response.json();
}

/**
 * Get submission details with answers and activities
 */
export async function getSubmission(submissionId: string): Promise<Submission> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/coding-interviews/submissions/${submissionId}`, {
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get submission');
  }

  return response.json();
}

/**
 * Re-evaluate a submission
 */
export async function reevaluateSubmission(submissionId: string): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coding-interviews/submissions/${submissionId}/evaluate`,
    {
      method: 'POST',
      headers,
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to re-evaluate submission');
  }

  return response.json();
}

// ============================================================================
// API Methods - Public (Candidate)
// ============================================================================

/**
 * Join interview with access token (public endpoint)
 */
export async function joinInterview(accessToken: string): Promise<Interview> {
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/coding-interviews/join/${accessToken}`, {
    headers: { 'ngrok-skip-browser-warning': 'true' },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to join interview');
  }

  return response.json();
}

/**
 * Start submission (public endpoint)
 */
export async function startSubmission(
  interviewId: string,
  data: {
    candidate_name: string;
    candidate_email: string;
    candidate_phone?: string;
    preferred_language?: string;  // Language chosen by candidate
  }
): Promise<{
  submission_id: string;
  started_at: string;
  expires_at: string;
}> {
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/coding-interviews/start?interview_id=${interviewId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to start submission');
  }

  return response.json();
}

/**
 * Auto-save code (public endpoint)
 */
export async function saveCode(data: {
  submission_id: string;
  question_id: string;
  code: string;
  programming_language: string;
}): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/coding-interviews/save-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to save code');
  }

  return response.json();
}

/**
 * Submit interview (public endpoint)
 */
export async function submitInterview(submissionId: string): Promise<{
  message: string;
  submission_id: string;
  submitted_at: string;
}> {
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/coding-interviews/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
    body: JSON.stringify({ submission_id: submissionId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to submit interview');
  }

  return response.json();
}

/**
 * Track activity event (public endpoint)
 */
export async function trackActivity(data: {
  submission_id: string;
  activity_type: string;
  question_id?: string;
  metadata?: Record<string, any>;
}): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/coding-interviews/activity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
    body: JSON.stringify(data),
  });

  // Don't throw error if tracking fails (non-critical)
  if (!response.ok) {
    console.warn('Failed to track activity:', data.activity_type);
    return { status: 'failed' };
  }

  return response.json();
}

// ============================================================================
// Resume Upload/View
// ============================================================================

/**
 * Upload resume for a submission (public endpoint)
 */
export async function uploadResume(data: {
  submission_id: string;
  file: File;
}): Promise<{ status: string; resume_path: string; filename: string }> {
  const formData = new FormData();
  formData.append('submission_id', data.submission_id);
  formData.append('file', data.file);

  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/coding-interviews/upload-resume`, {
    method: 'POST',
    headers: { 'ngrok-skip-browser-warning': 'true' },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to upload resume');
  }

  return response.json();
}

/**
 * Get resume download URL for a submission (authenticated)
 */
export async function getResumeUrl(submissionId: string): Promise<{ resume_url: string; resume_path: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coding-interviews/submissions/${submissionId}/resume`,
    { headers }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get resume');
  }

  return response.json();
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate shareable link for candidate
 */
export function generateShareableLink(accessToken: string): string {
  const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';
  return `${frontendUrl}/interview/${accessToken}`;
}

/**
 * Format time remaining
 */
export function formatTimeRemaining(expiresAt: string): string {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = expires.getTime() - now.getTime();

  if (diff <= 0) return 'Expired';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Check if interview is active
 */
export function isInterviewActive(interview: Interview): boolean {
  const now = new Date();
  const start = new Date(interview.scheduled_start_time);
  const expires = new Date(interview.link_expires_at);

  return now >= start && now <= expires;
}
