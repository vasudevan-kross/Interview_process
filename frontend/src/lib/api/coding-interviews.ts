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

/** Extract a human-readable error string from any FastAPI error shape */
function extractErrorMessage(detail: any, fallback: string): string {
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((e: any) => (typeof e === 'string' ? e : e.msg || JSON.stringify(e))).join('; ');
  }
  return JSON.stringify(detail);
}

/**
 * Get auth headers with current logged-in user's token
 */
/**
 * Get auth headers with current logged-in user's token
 */
async function getAuthHeaders(includeContentType = true): Promise<HeadersInit> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  const headers: Record<string, string> = {
    'ngrok-skip-browser-warning': 'true',
  };

  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }

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
  interview_type: string;
  programming_language: string;
  allowed_languages?: string[];  // Languages candidates can choose from. undefined/[] = ANY language
  total_marks: number;
  duration_minutes?: number;
  submission_count?: number;
  resume_required: 'mandatory' | 'optional' | 'disabled';
  bond_terms?: string;  // Terms and conditions text
  bond_document_url?: string;  // URL to uploaded bond document
  require_signature?: boolean;  // Whether signature is required
  bond_years?: number;  // Number of years for bond
  bond_timing?: 'before_start' | 'before_submission';  // When bond appears
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
  status: 'in_progress' | 'submitted' | 'auto_submitted' | 'abandoned' | 'evaluated';
  total_marks_obtained?: number;
  percentage?: number;
  late_submission: boolean;
  suspicious_activity: boolean;
  session_duration_seconds?: number;
  resume_path?: string;
  resume_uploaded_at?: string;
  signature_data?: string;  // Base64 encoded signature image
  signature_accepted_at?: string;  // When signature was provided
  terms_ip_address?: string;  // IP address for audit trail
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
  question_text?: string;
  question_marks?: number;
  question_difficulty?: string;
  question_topics?: string[];
  evaluator_notes?: string;
  evaluator_id?: string;
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
  interview_type: string;
  grace_period_minutes?: number;
  resume_required?: 'mandatory' | 'optional' | 'disabled';
  bond_terms?: string;  // Terms and conditions text
  bond_document_url?: string;  // URL to uploaded bond document
  require_signature?: boolean;  // Whether signature is required
  bond_years?: number;  // Number of years for bond
  bond_timing?: 'before_start' | 'before_submission';
  job_id?: string;  // Link to job_descriptions for pipeline
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
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to create interview'));
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
  domain_tool?: string;
  interview_type: string;
}): Promise<{ questions: Question[]; count: number; detected_type?: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/coding-interviews/generate-questions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to generate questions'));
  }

  return response.json();
}

/**
 * Extract questions from uploaded document (PDF, Word, Image, Excel, CSV)
 */
export async function extractQuestionsFromDocument(data: {
  file: File;
  programming_language?: string;
  interview_type?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}): Promise<{ questions: Question[]; count: number; extracted_text_length: number }> {
  const formData = new FormData();
  formData.append('file', data.file);
  formData.append('programming_language', data.programming_language || 'python');
  formData.append('interview_type', data.interview_type || 'coding');
  formData.append('difficulty', data.difficulty || 'medium');

  const headers = await getAuthHeaders(false);
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/coding-interviews/extract-questions`, {
    method: 'POST',
    headers,
    body: formData,
    // Note: Don't set Content-Type header - browser will set it with boundary for multipart/form-data
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to extract questions from document'));
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
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to list interviews'));
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
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to get interview'));
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
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to delete interview'));
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
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to list submissions'));
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
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to get submission'));
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
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to re-evaluate submission'));
  }

  return response.json();
}

/**
 * Evaluate all submissions for an interview at once
 */
export async function evaluateAllSubmissions(interviewId: string): Promise<{
  message: string;
  total: number;
  evaluated: number;
  failed: number;
  status?: string;
  results: Array<{
    submission_id: string;
    status: 'success' | 'failed';
    total_marks?: number;
    percentage?: number;
    error?: string;
  }>;
}> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coding-interviews/${interviewId}/evaluate-all`,
    {
      method: 'POST',
      headers,
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to evaluate submissions'));
  }

  return response.json();
}

// ============================================================================
// API Methods - Public (Candidate)
// ============================================================================

/**
 * Join interview with access token (public endpoint)
 */
// NOTE: Public endpoints use relative URLs (no API_BASE_URL) so they route
// through the Next.js proxy rewrite. Critical for ngrok/external access.

/** Safely parse error from response (handles non-JSON and ngrok HTML pages) */
async function safeParseError(response: Response, fallback: string): Promise<string> {
  try {
    const text = await response.text();
    const json = JSON.parse(text);
    return extractErrorMessage(json.detail, fallback);
  } catch {
    return `${fallback} (HTTP ${response.status})`;
  }
}

export async function joinInterview(accessToken: string): Promise<Interview> {
  const response = await fetch(`${API_PREFIX}/coding-interviews/join/${accessToken}`, {
    headers: { 'ngrok-skip-browser-warning': 'true' },
  });

  if (!response.ok) {
    const msg = await safeParseError(response, 'Failed to join interview');
    throw new Error(msg);
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
  const response = await fetch(`${API_PREFIX}/coding-interviews/start?interview_id=${interviewId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const msg = await safeParseError(response, 'Failed to start submission');
    throw new Error(msg);
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
  const response = await fetch(`${API_PREFIX}/coding-interviews/save-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const msg = await safeParseError(response, 'Failed to save code');
    throw new Error(msg);
  }

  return response.json();
}

/**
 * Submit interview (public endpoint)
 */
export async function submitInterview(
  submissionId: string,
  options?: {
    signature_data?: string;
    terms_accepted?: boolean;
  }
): Promise<{
  message: string;
  submission_id: string;
  submitted_at: string;
}> {
  const response = await fetch(`${API_PREFIX}/coding-interviews/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
    body: JSON.stringify({
      submission_id: submissionId,
      signature_data: options?.signature_data,
      terms_accepted: options?.terms_accepted || false,
    }),
  });

  if (!response.ok) {
    const msg = await safeParseError(response, 'Failed to submit interview');
    throw new Error(msg);
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
  const response = await fetch(`${API_PREFIX}/coding-interviews/activity`, {
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

  const response = await fetch(`${API_PREFIX}/coding-interviews/upload-resume`, {
    method: 'POST',
    headers: { 'ngrok-skip-browser-warning': 'true' },
    body: formData,
  });

  if (!response.ok) {
    const msg = await safeParseError(response, 'Failed to upload resume');
    throw new Error(msg);
  }

  return response.json();
}

/**
 * Get resume download URL for a submission (authenticated)
 */
export async function getResumeUrl(submissionId: string): Promise<{ resume_url: string; resume_path: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_PREFIX}/coding-interviews/submissions/${submissionId}/resume`,
    { headers }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to get resume'));
  }

  return response.json();
}

// ============================================================================
// Candidate Pipeline
// ============================================================================

export interface InterviewCandidate {
  id: string;
  candidate_id?: string;  // interview_candidates.id — present means editable/deletable
  name: string;
  email?: string;
  phone?: string;
  submitted: boolean;
  submission_id?: string;
  score?: number;
  percentage?: number;
  decision: 'pending' | 'advanced' | 'rejected' | 'hold';
}

export interface CandidateListResponse {
  interview_id: string;
  interview_title: string;
  access_token: string;
  interview_total_marks?: number;
  candidates: InterviewCandidate[];
  total: number;
  submitted: number;
  advanced: number;
  rejected: number;
  hold: number;
}

/**
 * Upload Excel/CSV to pre-register candidates for an interview
 */
export async function bulkImportCandidates(
  interviewId: string,
  file: File
): Promise<{ imported: number; duplicates: number; candidates: any[] }> {
  const headers = await getAuthHeaders();
  delete (headers as any)['Content-Type']; // let browser set multipart boundary

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coding-interviews/${interviewId}/candidates/bulk`,
    { method: 'POST', headers, body: formData }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to import candidates'));
  }

  return response.json();
}

/**
 * Get all candidates (imported + submitted) for an interview
 */
export async function getInterviewCandidates(
  interviewId: string
): Promise<CandidateListResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coding-interviews/${interviewId}/candidates`,
    { headers }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to get candidates'));
  }

  return response.json();
}

/**
 * Edit a pre-registered candidate's details
 */
export async function updateCandidate(
  interviewId: string,
  candidateId: string,
  data: { name: string; email?: string; phone?: string }
): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coding-interviews/${interviewId}/candidates/${candidateId}`,
    { method: 'PATCH', headers, body: JSON.stringify(data) }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to update candidate'));
  }
  return response.json();
}

/**
 * Remove a pre-registered candidate
 */
export async function deleteCandidate(
  interviewId: string,
  candidateId: string
): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coding-interviews/${interviewId}/candidates/${candidateId}`,
    { method: 'DELETE', headers }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to delete candidate'));
  }
}

/**
 * Delete a candidate submission (in_progress or submitted)
 */
export async function deleteSubmission(submissionId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coding-interviews/submissions/${submissionId}`,
    { method: 'DELETE', headers }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to delete submission'));
  }
}

/**
 * Set recruiter decision on a submission
 */
export async function setSubmissionDecision(
  submissionId: string,
  decision: 'advanced' | 'rejected' | 'hold' | 'pending',
  notes?: string
): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coding-interviews/submissions/${submissionId}/decision`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ decision, notes }),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to set decision'));
  }

  return response.json();
}

/**
 * Export all submitted candidates' resumes + answers as a ZIP archive
 */
export async function exportSubmissions(interviewId: string, interviewTitle: string): Promise<void> {
  const headers = await getAuthHeaders();
  delete (headers as any)['Content-Type'];

  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coding-interviews/${interviewId}/export`,
    { headers }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to export submissions');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${interviewTitle}_submissions.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// Helper Functions
// ============================================================================

// ============================================================================
// New API methods: Edit, Clone, Send Invites, Bulk Decision, Bulk Delete, Notes
// ============================================================================

/**
 * Update interview details, bond settings, and questions
 */
export async function updateInterview(
  interviewId: string,
  data: {
    title?: string;
    description?: string;
    scheduled_start_time?: string;
    scheduled_end_time?: string;
    grace_period_minutes?: number;
    require_signature?: boolean;
    bond_terms?: string;
    bond_years?: number;
    bond_timing?: string;
    bond_document_url?: string;
    questions?: Array<{
      id?: string;
      question_text: string;
      difficulty: string;
      marks: number;
      time_estimate_minutes?: number;
      starter_code?: string;
      topics?: string[];
    }>;
  }
): Promise<Interview> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/coding-interviews/${interviewId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to update interview'));
  }
  return response.json();
}

/**
 * Clone an interview (copies all questions, generates new access token)
 */
export async function cloneInterview(interviewId: string): Promise<{
  interview_id: string;
  access_token: string;
  shareable_link: string;
  title: string;
}> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/coding-interviews/${interviewId}/clone`, {
    method: 'POST',
    headers,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to clone interview'));
  }
  return response.json();
}

/**
 * Send invite emails to all pre-registered candidates who haven't submitted
 */
export async function sendInterviewInvites(interviewId: string): Promise<{
  sent: number;
  skipped: number;
  no_email: number;
  total: number;
}> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coding-interviews/${interviewId}/send-invites`,
    { method: 'POST', headers }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to send invites'));
  }
  return response.json();
}

/**
 * Set the same decision on multiple submissions at once
 */
export async function bulkSubmissionDecision(
  interviewId: string,
  submissionIds: string[],
  decision: 'advanced' | 'rejected' | 'hold' | 'pending'
): Promise<{ updated: number; decision: string }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coding-interviews/${interviewId}/bulk-decision`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ submission_ids: submissionIds, decision }),
    }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to update decisions'));
  }
  return response.json();
}

/**
 * Delete multiple pre-registered candidates
 */
export async function bulkDeleteCandidates(
  interviewId: string,
  candidateIds: string[]
): Promise<{ deleted: number }> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coding-interviews/${interviewId}/candidates/bulk-delete`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ candidate_ids: candidateIds }),
    }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to delete candidates'));
  }
  return response.json();
}

/**
 * Save evaluator notes and optionally override AI-assigned marks for an answer
 */
export async function saveEvaluatorNotes(
  submissionId: string,
  answerId: string,
  data: { notes?: string; marks_override?: number }
): Promise<Answer> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coding-interviews/submissions/${submissionId}/answers/${answerId}/notes`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data),
    }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to save notes'));
  }
  return response.json();
}

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

// ============================================================================
// Voice Interview Creation
// ============================================================================

export interface VoiceSessionResponse {
  reply: string;
  session_state: Record<string, any>;
  done: boolean;
  interview_id?: string;
  access_token?: string;
  shareable_link?: string;
}

/**
 * Get the opening greeting and initial session state for voice interview creation.
 * Call this once when the voice modal opens.
 */
export async function getVoiceSessionStart(): Promise<VoiceSessionResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coding-interviews/voice-session/start`,
    { method: 'GET', headers }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Failed to start voice session'));
  }
  return response.json();
}

/**
 * Send one voice turn (speech transcript) to the server and get the agent's reply.
 */
export async function voiceSession(data: {
  message: string;
  session_state: Record<string, any>;
  user_timezone_offset?: number;
}): Promise<VoiceSessionResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    `${API_BASE_URL}${API_PREFIX}/coding-interviews/voice-session`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: data.message,
        session_state: data.session_state,
        user_timezone_offset: data.user_timezone_offset ?? -new Date().getTimezoneOffset(),
      }),
    }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error.detail, 'Voice session failed'));
  }
  return response.json();
}
