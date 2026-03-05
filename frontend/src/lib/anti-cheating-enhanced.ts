/**
 * Enhanced Anti-Cheating System
 *
 * Features:
 * - Browser fingerprinting (unique device ID)
 * - DevTools detection (F12, inspect element)
 * - VM/Emulator detection
 * - Fullscreen enforcement
 * - Keystroke dynamics (AI typing detection)
 * - Screenshot detection
 * - Right-click prevention
 * - Multiple tab detection
 * - All existing features (tab switch, copy/paste, blur/focus)
 *
 * All activities are logged to session_activities table with NO database changes needed!
 */

import FingerprintJS from '@fingerprintjs/fingerprintjs'
import Bowser from 'bowser'
import { UAParser } from 'ua-parser-js'
import { addListener as addDevToolsListener } from 'devtools-detector'
import { trackActivity } from './api/coding-interviews'

export interface EnhancedAntiCheatingTracker {
  updateQuestionId: (questionId: string) => void
  cleanup: () => void
  getFingerprint: () => Promise<string>
  checkFullscreen: () => boolean
  requestFullscreen: () => Promise<void>
}

/**
 * Keystroke dynamics tracker
 * Analyzes typing patterns to detect AI/bot usage
 */
class KeystrokeDynamics {
  private keyTimings: number[] = []
  private lastKeyTime: number = 0

  recordKey() {
    const now = Date.now()
    if (this.lastKeyTime > 0) {
      const interval = now - this.lastKeyTime
      this.keyTimings.push(interval)
      // Keep only last 100 keystrokes
      if (this.keyTimings.length > 100) {
        this.keyTimings.shift()
      }
    }
    this.lastKeyTime = now
  }

  getAverageInterval(): number {
    if (this.keyTimings.length === 0) return 0
    const sum = this.keyTimings.reduce((a, b) => a + b, 0)
    return sum / this.keyTimings.length
  }

  getVariance(): number {
    const avg = this.getAverageInterval()
    if (this.keyTimings.length === 0) return 0
    const variance = this.keyTimings.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / this.keyTimings.length
    return Math.sqrt(variance)
  }

  /**
   * Detect AI/bot typing (too consistent = suspicious)
   * Human typing has variance 20-80ms, AI is too consistent (<10ms)
   */
  isLikelyAI(): boolean {
    if (this.keyTimings.length < 50) return false
    const variance = this.getVariance()
    const avg = this.getAverageInterval()
    return variance < 10 && avg < 50
  }
}

/**
 * Initialize enhanced anti-cheating tracking
 */
export async function initializeEnhancedAntiCheating(
  submissionId: string,
  initialQuestionId: string
): Promise<EnhancedAntiCheatingTracker> {
  let currentQuestionId = initialQuestionId
  const listeners: Array<() => void> = []
  const keystrokeDynamics = new KeystrokeDynamics()
  let fingerprintCache: string | null = null

  // Initialize fingerprint
  const fpPromise = FingerprintJS.load()

  // Get browser/device info
  const browser = Bowser.getParser(window.navigator.userAgent)
  const browserInfo = browser.getResult()
  const parser = new UAParser()
  const uaInfo = parser.getResult()

  // Log device fingerprint at start
  const logFingerprint = async () => {
    try {
      const fp = await fpPromise
      const result = await fp.get()
      fingerprintCache = result.visitorId

      await trackActivity({
        submission_id: submissionId,
        activity_type: 'device_fingerprint',
        question_id: currentQuestionId,
        metadata: {
          fingerprint: result.visitorId,
          browser: browserInfo.browser.name,
          browser_version: browserInfo.browser.version,
          os: browserInfo.os.name,
          os_version: browserInfo.os.version,
          device: browserInfo.platform.type,
          screen_resolution: `${window.screen.width}x${window.screen.height}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: navigator.language,
          cores: navigator.hardwareConcurrency,
          memory: (navigator as any).deviceMemory || 'unknown',
          timestamp: new Date().toISOString(),
        },
      })
    } catch (error) {
      console.error('Fingerprint logging error:', error)
    }
  }

  logFingerprint()

  // Detect VM/Emulator
  const detectVM = () => {
    const isVM =
      /vmware|virtualbox|qemu|xen/i.test(navigator.userAgent) ||
      (navigator as any).webdriver === true ||
      window.outerWidth === 0 ||
      window.outerHeight === 0

    if (isVM) {
      trackActivity({
        submission_id: submissionId,
        activity_type: 'vm_detected',
        question_id: currentQuestionId,
        metadata: {
          user_agent: navigator.userAgent,
          webdriver: (navigator as any).webdriver,
          dimensions: `${window.outerWidth}x${window.outerHeight}`,
          timestamp: new Date().toISOString(),
        },
      }).catch(console.error)
    }
  }

  detectVM()

  // DevTools detection
  const devToolsListener = addDevToolsListener((isOpen) => {
    trackActivity({
      submission_id: submissionId,
      activity_type: 'devtools',
      question_id: currentQuestionId,
      metadata: {
        is_open: isOpen,
        timestamp: new Date().toISOString(),
      },
    }).catch(console.error)
  })

  // Fullscreen change detection
  const handleFullscreenChange = () => {
    const isFullscreen = Boolean(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement
    )

    trackActivity({
      submission_id: submissionId,
      activity_type: 'fullscreen_change',
      question_id: currentQuestionId,
      metadata: {
        is_fullscreen: isFullscreen,
        timestamp: new Date().toISOString(),
      },
    }).catch(console.error)
  }

  // Screenshot detection (works in some browsers)
  const handleKeyDown = (e: KeyboardEvent) => {
    // Detect common screenshot shortcuts
    const isScreenshot =
      (e.key === 'PrintScreen') ||
      (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4')) || // Mac
      (e.metaKey && e.shiftKey && e.key === 's') || // Windows Snipping Tool
      (e.ctrlKey && e.key === 'PrintScreen')

    if (isScreenshot) {
      trackActivity({
        submission_id: submissionId,
        activity_type: 'screenshot_attempt',
        question_id: currentQuestionId,
        metadata: {
          key: e.key,
          ctrl: e.ctrlKey,
          meta: e.metaKey,
          shift: e.shiftKey,
          timestamp: new Date().toISOString(),
        },
      }).catch(console.error)
    }

    // Track keystroke dynamics
    keystrokeDynamics.recordKey()
  }

  // Periodic keystroke analysis
  const keystrokeAnalysisInterval = setInterval(() => {
    if (keystrokeDynamics.isLikelyAI()) {
      trackActivity({
        submission_id: submissionId,
        activity_type: 'ai_typing_detected',
        question_id: currentQuestionId,
        metadata: {
          avg_interval: keystrokeDynamics.getAverageInterval(),
          variance: keystrokeDynamics.getVariance(),
          sample_size: 100,
          timestamp: new Date().toISOString(),
        },
      }).catch(console.error)
    }
  }, 30000) // Check every 30 seconds

  // Track visibility changes (tab switches)
  const handleVisibilityChange = () => {
    if (document.hidden) {
      trackActivity({
        submission_id: submissionId,
        activity_type: 'tab_switch',
        question_id: currentQuestionId,
        metadata: { action: 'blur', timestamp: new Date().toISOString() },
      }).catch(console.error)
    } else {
      trackActivity({
        submission_id: submissionId,
        activity_type: 'tab_switch',
        question_id: currentQuestionId,
        metadata: { action: 'focus', timestamp: new Date().toISOString() },
      }).catch(console.error)
    }
  }

  // Track window blur/focus
  const handleWindowBlur = () => {
    trackActivity({
      submission_id: submissionId,
      activity_type: 'window_blur',
      question_id: currentQuestionId,
      metadata: { timestamp: new Date().toISOString() },
    }).catch(console.error)
  }

  const handleWindowFocus = () => {
    trackActivity({
      submission_id: submissionId,
      activity_type: 'window_focus',
      question_id: currentQuestionId,
      metadata: { timestamp: new Date().toISOString() },
    }).catch(console.error)
  }

  // Track copy events
  const handleCopy = (e: ClipboardEvent) => {
    const selection = window.getSelection()?.toString() || ''
    trackActivity({
      submission_id: submissionId,
      activity_type: 'copy',
      question_id: currentQuestionId,
      metadata: {
        selection_length: selection.length,
        timestamp: new Date().toISOString(),
      },
    }).catch(console.error)
  }

  // Track paste events
  const handlePaste = (e: ClipboardEvent) => {
    const pastedText = e.clipboardData?.getData('text') || ''
    trackActivity({
      submission_id: submissionId,
      activity_type: 'paste',
      question_id: currentQuestionId,
      metadata: {
        paste_length: pastedText.length,
        timestamp: new Date().toISOString(),
      },
    }).catch(console.error)
  }

  // Disable right-click (inspect element)
  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    trackActivity({
      submission_id: submissionId,
      activity_type: 'right_click_attempt',
      question_id: currentQuestionId,
      metadata: {
        x: e.clientX,
        y: e.clientY,
        timestamp: new Date().toISOString(),
      },
    }).catch(console.error)
  }

  // Detect multiple tabs (local storage sync)
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === `interview_${submissionId}` && e.newValue !== e.oldValue) {
      trackActivity({
        submission_id: submissionId,
        activity_type: 'multiple_tabs_detected',
        question_id: currentQuestionId,
        metadata: {
          old_value: e.oldValue,
          new_value: e.newValue,
          timestamp: new Date().toISOString(),
        },
      }).catch(console.error)
    }
  }

  // Set tab marker
  localStorage.setItem(`interview_${submissionId}`, Date.now().toString())

  // Register all event listeners
  document.addEventListener('visibilitychange', handleVisibilityChange)
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  window.addEventListener('blur', handleWindowBlur)
  window.addEventListener('focus', handleWindowFocus)
  document.addEventListener('copy', handleCopy)
  document.addEventListener('paste', handlePaste)
  document.addEventListener('contextmenu', handleContextMenu)
  document.addEventListener('keydown', handleKeyDown)
  window.addEventListener('storage', handleStorageChange)

  // Store cleanup functions
  listeners.push(
    () => document.removeEventListener('visibilitychange', handleVisibilityChange),
    () => document.removeEventListener('fullscreenchange', handleFullscreenChange),
    () => window.removeEventListener('blur', handleWindowBlur),
    () => window.removeEventListener('focus', handleWindowFocus),
    () => document.removeEventListener('copy', handleCopy),
    () => document.removeEventListener('paste', handlePaste),
    () => document.removeEventListener('contextmenu', handleContextMenu),
    () => document.removeEventListener('keydown', handleKeyDown),
    () => window.removeEventListener('storage', handleStorageChange),
    () => clearInterval(keystrokeAnalysisInterval),
    () => localStorage.removeItem(`interview_${submissionId}`)
  )

  // Fullscreen helpers
  const checkFullscreen = (): boolean => {
    return Boolean(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement
    )
  }

  const requestFullscreen = async (): Promise<void> => {
    const elem = document.documentElement
    try {
      if (elem.requestFullscreen) {
        await elem.requestFullscreen()
      } else if ((elem as any).webkitRequestFullscreen) {
        await (elem as any).webkitRequestFullscreen()
      } else if ((elem as any).mozRequestFullScreen) {
        await (elem as any).mozRequestFullScreen()
      }
    } catch (error) {
      console.error('Fullscreen request failed:', error)
    }
  }

  // Return enhanced tracker interface
  return {
    updateQuestionId: (questionId: string) => {
      currentQuestionId = questionId
    },
    cleanup: () => {
      listeners.forEach((cleanup) => cleanup())
    },
    getFingerprint: async () => {
      if (fingerprintCache) return fingerprintCache
      const fp = await fpPromise
      const result = await fp.get()
      fingerprintCache = result.visitorId
      return result.visitorId
    },
    checkFullscreen,
    requestFullscreen,
  }
}

/**
 * Debounce utility for code change tracking
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
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
  }).catch(console.error)
}

/**
 * Create debounced code change tracker (call every 5 seconds max)
 */
export function createCodeChangeTracker(submissionId: string, questionId: string) {
  return debounce((codeLength: number) => {
    trackCodeChange(submissionId, questionId, codeLength)
  }, 5000)
}
