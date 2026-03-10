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
 * - Mouse leave / idle detection / time-on-question
 * - Mobile: split-screen detection, network offline, text selection,
 *           orientation change, navigation intent (beforeunload)
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

  // Time-on-question tracking
  let questionStartTime = Date.now()
  let prevQuestionId = initialQuestionId

  // Idle detection
  let lastActivityTime = Date.now()
  const IDLE_THRESHOLD_MS = 60_000
  let idleAlreadyFlagged = false

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
    // Reset idle timer on any keypress
    lastActivityTime = Date.now()
    idleAlreadyFlagged = false

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

  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0

  // ── 1. Split-screen detection (mobile only) ──────────────────────────────
  // On Android, opening split-screen shrinks the viewport significantly.
  // Only meaningful on touch devices — desktop window resize is normal behaviour.
  const initialViewportWidth = window.innerWidth
  let splitScreenFlagged = false

  const handleResize = (() => {
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    return () => {
      if (!isTouchDevice) return
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        const ratio = window.innerWidth / (screen.width || initialViewportWidth)
        const isSplitScreen = ratio < 0.65

        if (isSplitScreen && !splitScreenFlagged) {
          splitScreenFlagged = true
          trackActivity({
            submission_id: submissionId,
            activity_type: 'split_screen',
            question_id: currentQuestionId,
            metadata: {
              viewport_width: window.innerWidth,
              screen_width: screen.width,
              ratio: +ratio.toFixed(2),
              timestamp: new Date().toISOString(),
            },
          }).catch(console.error)
        } else if (!isSplitScreen) {
          splitScreenFlagged = false  // reset when they exit split-screen
        }
      }, 300)
    }
  })()

  // ── 2. Network offline detection ─────────────────────────────────────────
  // Airplane mode trick: go offline → open AI app (cached) → come back.
  let offlineAt: number | null = null

  const handleOffline = () => {
    offlineAt = Date.now()
    trackActivity({
      submission_id: submissionId,
      activity_type: 'network_offline',
      question_id: currentQuestionId,
      metadata: { timestamp: new Date().toISOString() },
    }).catch(console.error)
  }

  const handleOnline = () => {
    const offlineDuration = offlineAt ? Math.floor((Date.now() - offlineAt) / 1000) : null
    offlineAt = null
    trackActivity({
      submission_id: submissionId,
      activity_type: 'network_online',
      question_id: currentQuestionId,
      metadata: {
        offline_duration_seconds: offlineDuration,
        timestamp: new Date().toISOString(),
      },
    }).catch(console.error)
  }

  // ── 3. Question text selection ────────────────────────────────────────────
  // Long-press select on mobile to share question text to WhatsApp/ChatGPT.
  // Debounced — only fires after selection settles. Ignores tiny selections.
  let selectionTimer: ReturnType<typeof setTimeout> | null = null

  const handleSelectionChange = () => {
    if (selectionTimer) clearTimeout(selectionTimer)
    selectionTimer = setTimeout(() => {
      const selected = window.getSelection()?.toString() ?? ''
      if (selected.length > 30) {
        trackActivity({
          submission_id: submissionId,
          activity_type: 'text_selection',
          question_id: currentQuestionId,
          metadata: {
            selected_length: selected.length,
            timestamp: new Date().toISOString(),
          },
        }).catch(console.error)
      }
    }, 800)
  }

  // ── 4. Screen orientation change ─────────────────────────────────────────
  // Switching to landscape mid-exam may indicate screensharing or showing
  // the device to someone on a video call.
  const handleOrientationChange = () => {
    const orientation =
      screen.orientation?.type ??
      (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait')

    trackActivity({
      submission_id: submissionId,
      activity_type: 'orientation_change',
      question_id: currentQuestionId,
      metadata: {
        orientation,
        angle: screen.orientation?.angle ?? null,
        timestamp: new Date().toISOString(),
      },
    }).catch(console.error)
  }

  // ── 5. Navigation intent (beforeunload) ───────────────────────────────────
  // Candidate tries to close the tab or navigate away entirely.
  // Uses sendBeacon so the request completes even as the page unloads.
  const handleBeforeUnload = () => {
    const payload = JSON.stringify({
      submission_id: submissionId,
      activity_type: 'navigation_attempt',
      question_id: currentQuestionId,
      metadata: { timestamp: new Date().toISOString() },
    })
    // sendBeacon is fire-and-forget, survives page unload
    navigator.sendBeacon(
      `/api/v1/coding-interviews/activity`,
      new Blob([payload], { type: 'application/json' })
    )
  }

  // Mouse leave — cursor exited the browser viewport (desktop only)
  const handleMouseLeave = (e: MouseEvent) => {
    if (e.relatedTarget === null) {
      trackActivity({
        submission_id: submissionId,
        activity_type: 'mouse_leave',
        question_id: currentQuestionId,
        metadata: { timestamp: new Date().toISOString() },
      }).catch(console.error)
    }
  }

  // Reset idle on mouse movement (desktop) or any touch (mobile)
  const handleMouseMove = () => {
    lastActivityTime = Date.now()
    idleAlreadyFlagged = false
  }

  const handleTouchActivity = () => {
    lastActivityTime = Date.now()
    idleAlreadyFlagged = false
  }

  // Idle detection — flag once per idle period, reset on activity
  const idleCheckInterval = setInterval(() => {
    const idleSec = Math.floor((Date.now() - lastActivityTime) / 1000)
    if (idleSec >= IDLE_THRESHOLD_MS / 1000 && !idleAlreadyFlagged) {
      idleAlreadyFlagged = true
      trackActivity({
        submission_id: submissionId,
        activity_type: 'idle_detected',
        question_id: currentQuestionId,
        metadata: { idle_seconds: idleSec, timestamp: new Date().toISOString() },
      }).catch(console.error)
    }
  }, 15_000) // check every 15s

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
  document.addEventListener('selectionchange', handleSelectionChange)
  window.addEventListener('blur',    handleWindowBlur)
  window.addEventListener('focus',   handleWindowFocus)
  window.addEventListener('resize',  handleResize,  { passive: true })
  window.addEventListener('offline', handleOffline)
  window.addEventListener('online',  handleOnline)
  window.addEventListener('beforeunload', handleBeforeUnload)
  document.addEventListener('copy',        handleCopy)
  document.addEventListener('paste',       handlePaste)
  document.addEventListener('contextmenu', handleContextMenu)
  document.addEventListener('keydown',     handleKeyDown)
  window.addEventListener('storage',       handleStorageChange)

  // Orientation: prefer screen.orientation API, fall back to window event
  if (screen.orientation) {
    screen.orientation.addEventListener('change', handleOrientationChange)
  } else {
    window.addEventListener('orientationchange', handleOrientationChange)
  }

  if (isTouchDevice) {
    document.addEventListener('touchstart', handleTouchActivity, { passive: true })
    document.addEventListener('touchend',   handleTouchActivity, { passive: true })
  } else {
    document.addEventListener('mouseleave', handleMouseLeave)
    document.addEventListener('mousemove',  handleMouseMove, { passive: true })
  }

  // Store cleanup functions
  listeners.push(
    () => document.removeEventListener('visibilitychange', handleVisibilityChange),
    () => document.removeEventListener('fullscreenchange', handleFullscreenChange),
    () => document.removeEventListener('selectionchange',  handleSelectionChange),
    () => window.removeEventListener('blur',    handleWindowBlur),
    () => window.removeEventListener('focus',   handleWindowFocus),
    () => window.removeEventListener('resize',  handleResize),
    () => window.removeEventListener('offline', handleOffline),
    () => window.removeEventListener('online',  handleOnline),
    () => window.removeEventListener('beforeunload', handleBeforeUnload),
    () => document.removeEventListener('copy',        handleCopy),
    () => document.removeEventListener('paste',       handlePaste),
    () => document.removeEventListener('contextmenu', handleContextMenu),
    () => document.removeEventListener('keydown',     handleKeyDown),
    () => window.removeEventListener('storage',       handleStorageChange),
    () => clearInterval(keystrokeAnalysisInterval),
    () => clearInterval(idleCheckInterval),
    () => localStorage.removeItem(`interview_${submissionId}`)
  )

  if (screen.orientation) {
    listeners.push(() => screen.orientation.removeEventListener('change', handleOrientationChange))
  } else {
    listeners.push(() => window.removeEventListener('orientationchange', handleOrientationChange))
  }

  if (isTouchDevice) {
    listeners.push(
      () => document.removeEventListener('touchstart', handleTouchActivity),
      () => document.removeEventListener('touchend',   handleTouchActivity),
    )
  } else {
    listeners.push(
      () => document.removeEventListener('mouseleave', handleMouseLeave),
      () => document.removeEventListener('mousemove',  handleMouseMove),
    )
  }

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
      // Log time spent on the previous question before switching
      const timeSpentSec = Math.floor((Date.now() - questionStartTime) / 1000)
      trackActivity({
        submission_id: submissionId,
        activity_type: 'question_time',
        question_id: prevQuestionId,
        metadata: {
          time_spent_seconds: timeSpentSec,
          next_question_id: questionId,
          timestamp: new Date().toISOString(),
        },
      }).catch(console.error)

      questionStartTime = Date.now()
      prevQuestionId = questionId
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
