/**
 * Anti-Cheating Activity Tracker
 *
 * Tracks suspicious activities during coding interviews:
 * - Tab/window switches
 * - Copy/paste events
 * - Window blur/focus
 * - Code changes (debounced)
 *
 * Usage:
 *   const tracker = initializeAntiCheating(submissionId, questionId);
 *   // Later when changing questions:
 *   tracker.updateQuestionId(newQuestionId);
 *   // When interview ends:
 *   tracker.cleanup();
 */

import { trackActivity } from './api/coding-interviews';

export interface AntiCheatingTracker {
  updateQuestionId: (questionId: string) => void;
  cleanup: () => void;
}

/**
 * Initialize anti-cheating event tracking
 */
export function initializeAntiCheating(
  submissionId: string,
  initialQuestionId: string
): AntiCheatingTracker {
  let currentQuestionId = initialQuestionId;
  const listeners: Array<() => void> = [];

  // Track visibility changes (tab switches)
  const handleVisibilityChange = () => {
    if (document.hidden) {
      trackActivity({
        submission_id: submissionId,
        activity_type: 'tab_switch',
        question_id: currentQuestionId,
        metadata: { action: 'blur', timestamp: new Date().toISOString() },
      }).catch(console.error);
    } else {
      trackActivity({
        submission_id: submissionId,
        activity_type: 'tab_switch',
        question_id: currentQuestionId,
        metadata: { action: 'focus', timestamp: new Date().toISOString() },
      }).catch(console.error);
    }
  };

  // Track window blur/focus
  const handleWindowBlur = () => {
    trackActivity({
      submission_id: submissionId,
      activity_type: 'window_blur',
      question_id: currentQuestionId,
      metadata: { timestamp: new Date().toISOString() },
    }).catch(console.error);
  };

  const handleWindowFocus = () => {
    trackActivity({
      submission_id: submissionId,
      activity_type: 'window_focus',
      question_id: currentQuestionId,
      metadata: { timestamp: new Date().toISOString() },
    }).catch(console.error);
  };

  // Track copy events
  const handleCopy = (e: ClipboardEvent) => {
    const selection = window.getSelection()?.toString() || '';
    trackActivity({
      submission_id: submissionId,
      activity_type: 'copy',
      question_id: currentQuestionId,
      metadata: {
        selection_length: selection.length,
        timestamp: new Date().toISOString(),
      },
    }).catch(console.error);
  };

  // Track paste events
  const handlePaste = (e: ClipboardEvent) => {
    const pastedText = e.clipboardData?.getData('text') || '';
    trackActivity({
      submission_id: submissionId,
      activity_type: 'paste',
      question_id: currentQuestionId,
      metadata: {
        paste_length: pastedText.length,
        timestamp: new Date().toISOString(),
      },
    }).catch(console.error);
  };

  // Register all event listeners
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('blur', handleWindowBlur);
  window.addEventListener('focus', handleWindowFocus);
  document.addEventListener('copy', handleCopy);
  document.addEventListener('paste', handlePaste);

  // Store cleanup functions
  listeners.push(
    () => document.removeEventListener('visibilitychange', handleVisibilityChange),
    () => window.removeEventListener('blur', handleWindowBlur),
    () => window.removeEventListener('focus', handleWindowFocus),
    () => document.removeEventListener('copy', handleCopy),
    () => document.removeEventListener('paste', handlePaste)
  );

  // Return tracker interface
  return {
    updateQuestionId: (questionId: string) => {
      currentQuestionId = questionId;
    },
    cleanup: () => {
      listeners.forEach((cleanup) => cleanup());
    },
  };
}

/**
 * Debounce utility for code change tracking
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Track code change event (use with debounce)
 */
export function trackCodeChange(
  submissionId: string,
  questionId: string,
  codeLength: number
): void {
  trackActivity({
    submission_id: submissionId,
    activity_type: 'code_change',
    question_id: questionId,
    metadata: {
      code_length: codeLength,
      timestamp: new Date().toISOString(),
    },
  }).catch(console.error);
}

/**
 * Create debounced code change tracker (call every 5 seconds max)
 */
export function createCodeChangeTracker(submissionId: string, questionId: string) {
  return debounce((codeLength: number) => {
    trackCodeChange(submissionId, questionId, codeLength);
  }, 5000);
}
