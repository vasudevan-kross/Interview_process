/**
 * Credits API Client
 *
 * Handles all credit-related operations including:
 * - Balance queries
 * - Transaction history
 * - Credit pricing
 * - Bulk operation checks
 */

import { apiClient } from './client';

// ============================================================================
// Types
// ============================================================================

export interface CreditBalance {
  org_id: string;
  balance: number;
  total_purchased: number;
  total_consumed: number;
  last_updated: string;
}

export interface CreditTransaction {
  id: string;
  org_id: string;
  type: 'purchase' | 'deduction' | 'refund' | 'bonus';
  amount: number;
  balance_after: number;
  feature?: string;
  action?: string;
  reference_id?: string;
  notes?: string;
  created_at: string;
  created_by?: string;
}

export interface TransactionHistory {
  transactions: CreditTransaction[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreditPricing {
  resume_matching: {
    upload: number;
    job_processing: number;
  };
  coding_interview: {
    generation: number;
    submission: number;
  };
  voice_screening: {
    call_per_minute: number;
    summary: number;
  };
}

export interface BulkCreditCheck {
  feature: string;
  action: string;
  count: number;
}

export interface BulkCreditCheckResponse {
  feature: string;
  action: string;
  count: number;
  credit_per_operation: number;
  total_credits_required: number;
  current_balance: number;
  sufficient: boolean;
  shortfall: number;
}

export interface InsufficientCreditsError {
  message: string;
  required: number;
  available: number;
  feature?: string;
  action?: string;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get current credit balance for the organization
 */
export async function getCreditBalance(): Promise<CreditBalance> {
  const response = await apiClient.get<CreditBalance>('/api/v1/credits/balance');
  return response.data;
}

/**
 * Get paginated transaction history
 */
export async function getTransactionHistory(params?: {
  limit?: number;
  offset?: number;
  transaction_type?: 'purchase' | 'deduction' | 'refund' | 'bonus';
  feature?: string;
}): Promise<TransactionHistory> {
  const response = await apiClient.get<TransactionHistory>('/api/v1/credits/transactions', {
    params: {
      limit: params?.limit || 50,
      offset: params?.offset || 0,
      ...(params?.transaction_type && { transaction_type: params.transaction_type }),
      ...(params?.feature && { feature: params.feature }),
    },
  });
  return response.data;
}

/**
 * Get credit pricing catalog
 */
export async function getCreditPricing(): Promise<CreditPricing> {
  const response = await apiClient.get<CreditPricing>('/api/v1/credits/pricing');
  return response.data;
}

/**
 * Check if organization has sufficient credits for a bulk operation
 */
export async function checkBulkCredits(
  request: BulkCreditCheck
): Promise<BulkCreditCheckResponse> {
  const response = await apiClient.post<BulkCreditCheckResponse>(
    '/api/v1/credits/check-bulk',
    request
  );
  return response.data;
}

/**
 * Add credits to organization (admin only)
 */
export async function addCredits(params: {
  org_id: string;
  amount: number;
  transaction_type?: 'purchase' | 'bonus';
  notes?: string;
}): Promise<{
  transaction_id: string;
  org_id: string;
  amount: number;
  new_balance: number;
  message: string;
}> {
  const response = await apiClient.post('/api/v1/credits/admin/add', {
    org_id: params.org_id,
    amount: params.amount,
    transaction_type: params.transaction_type || 'purchase',
    notes: params.notes,
  });
  return response.data;
}

/**
 * Calculate cost for resume operations
 */
export function calculateResumeCost(resumeCount: number): {
  total: number;
  perResume: number;
  breakdown: string;
} {
  const perResume = 2;
  const total = resumeCount * perResume;
  return {
    total,
    perResume,
    breakdown: `${resumeCount} resume${resumeCount !== 1 ? 's' : ''} × ${perResume} credits`,
  };
}

/**
 * Calculate cost for coding interview operations
 */
export function calculateCodingInterviewCost(params: {
  questionGeneration?: boolean;
  submissionCount?: number;
}): {
  total: number;
  breakdown: string[];
} {
  let total = 0;
  const breakdown: string[] = [];

  if (params.questionGeneration) {
    total += 4;
    breakdown.push('AI Question Generation: 4 credits');
  }

  if (params.submissionCount && params.submissionCount > 0) {
    const submissionCost = params.submissionCount * 1;
    total += submissionCost;
    breakdown.push(
      `${params.submissionCount} submission${params.submissionCount !== 1 ? 's' : ''}: ${submissionCost} credits`
    );
  }

  return { total, breakdown };
}

/**
 * Calculate cost for voice screening operations
 */
export function calculateVoiceScreeningCost(params: {
  estimatedMinutes?: number;
  includeSummary?: boolean;
  callCount?: number;
}): {
  total: number;
  breakdown: string[];
  estimatedCallCost: number;
} {
  const perMinute = 15;
  const summaryCredit = 3;
  const estimatedMinutes = params.estimatedMinutes || 5;
  const callCount = params.callCount || 1;

  const callCostPerCall = estimatedMinutes * perMinute;
  const summaryCostPerCall = params.includeSummary ? summaryCredit : 0;
  const totalPerCall = callCostPerCall + summaryCostPerCall;

  const total = totalPerCall * callCount;

  const breakdown: string[] = [];
  if (callCount > 1) {
    breakdown.push(`${callCount} calls × ${estimatedMinutes} min × ${perMinute} credits/min = ${callCostPerCall * callCount} credits`);
  } else {
    breakdown.push(`${estimatedMinutes} min × ${perMinute} credits/min = ${callCostPerCall} credits`);
  }

  if (params.includeSummary) {
    if (callCount > 1) {
      breakdown.push(`AI Summary (${callCount} calls): ${summaryCostPerCall * callCount} credits`);
    } else {
      breakdown.push(`AI Summary: ${summaryCredit} credits`);
    }
  }

  return {
    total,
    breakdown,
    estimatedCallCost: callCostPerCall,
  };
}

/**
 * Format credit amount with commas
 */
export function formatCredits(amount: number): string {
  return amount.toLocaleString();
}

/**
 * Get feature display name
 */
export function getFeatureDisplayName(feature: string): string {
  const featureNames: Record<string, string> = {
    resume_matching: 'Resume Matching',
    coding_interview: 'Coding Interview',
    voice_screening: 'Voice Screening',
  };
  return featureNames[feature] || feature;
}

/**
 * Get action display name
 */
export function getActionDisplayName(action: string): string {
  const actionNames: Record<string, string> = {
    upload: 'Resume Upload',
    job_processing: 'Job Processing',
    generation: 'AI Question Generation',
    submission: 'Submission',
    call: 'Voice Call',
    call_per_minute: 'Voice Call (per minute)',
    summary: 'AI Summary',
  };
  return actionNames[action] || action;
}

/**
 * Get transaction type badge color
 */
export function getTransactionTypeBadgeColor(
  type: string
): 'default' | 'success' | 'destructive' | 'secondary' {
  switch (type) {
    case 'purchase':
    case 'bonus':
      return 'success';
    case 'deduction':
      return 'destructive';
    case 'refund':
      return 'secondary';
    default:
      return 'default';
  }
}

/**
 * Check if error is insufficient credits error
 */
export function isInsufficientCreditsError(error: any): error is { response: { status: number; data: InsufficientCreditsError } } {
  return error?.response?.status === 402;
}

/**
 * Extract insufficient credits details from error
 */
export function getInsufficientCreditsDetails(error: any): InsufficientCreditsError | null {
  if (isInsufficientCreditsError(error)) {
    return error.response.data;
  }
  return null;
}
