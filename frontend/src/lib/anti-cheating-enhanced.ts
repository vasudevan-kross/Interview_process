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
 * Optimized with client-side batching and event consolidation.
 */

import FingerprintJS from '@fingerprintjs/fingerprintjs'
import Bowser from 'bowser'
import { UAParser } from 'ua-parser-js'
import devtoolsDetector, { 
  addListener as addDevToolsListener, 
  removeListener as removeDevToolsListener 
} from 'devtools-detector'
import { trackActivity, trackActivityBulk } from './api/coding-interviews'

export interface EnhancedAntiCheatingTracker {
  updateQuestionId: (questionId: string) => void
  cleanup: () => void
  getFingerprint: () => Promise<string>
  checkFullscreen: () => boolean
  requestFullscreen: () => Promise<void>
  exitFullscreen: () => Promise<void>
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

  isLikelyAI(): boolean {
    if (this.keyTimings.length < 50) return false
    const variance = this.getVariance()
    const avg = this.getAverageInterval()
    return variance < 10 && avg < 50
  }
}

/**
 * Global Batch Tracker to handle all anti-cheating events
 */
class BatchTracker {
  private submissionId: string = ''
  private currentQuestionId: string = ''
  private pendingActivities: any[] = []
  private flushTimeout: NodeJS.Timeout | null = null
  private lastFocusEvent: { type: string; timestamp: number } | null = null
  private mouseLeaveTimeout: NodeJS.Timeout | null = null
  private FLUSH_INTERVAL = 10_000 // 10 seconds

  init(submissionId: string, questionId: string) {
    this.submissionId = submissionId
    this.currentQuestionId = questionId
  }

  updateQuestionId(questionId: string) {
    this.currentQuestionId = questionId
  }

  /**
   * Main tracking method with consolidation logic
   */
  async track(activity: any) {
    const now = Date.now();
    const type = activity.activity_type;

    // ── 1. Focus/Blur Consolidation ──
    // VisibilityChange and Blur often fire together. If we just logged a tab_switch, 
    // skip blur/focus for 500ms.
    if (type === 'window_blur' || type === 'window_focus') {
      if (this.lastFocusEvent && 
          now - this.lastFocusEvent.timestamp < 500 && 
          this.lastFocusEvent.type === 'tab_switch') {
        return; 
      }
    }
    
    if (type === 'tab_switch') {
      this.lastFocusEvent = { type: 'tab_switch', timestamp: now };
    }

    // ── 2. Mouse Leave Grace Period ──
    if (type === 'mouse_leave') {
      if (this.mouseLeaveTimeout) clearTimeout(this.mouseLeaveTimeout);
      this.mouseLeaveTimeout = setTimeout(() => {
        this.addEvent(activity);
        this.mouseLeaveTimeout = null;
      }, 2000); // 2 second grace period
      return;
    }

    // Cancel mouse leave if user returns quickly
    if (type === 'mouse_enter' || type === 'window_focus') {
      if (this.mouseLeaveTimeout) {
        clearTimeout(this.mouseLeaveTimeout);
        this.mouseLeaveTimeout = null;
        return; // Don't even log mouse_enter if mouse_leave was cancelled
      }
    }

    this.addEvent(activity);
  }

  private addEvent(activity: any) {
    // Ensure metadata has timestamp
    if (!activity.metadata) activity.metadata = {};
    if (!activity.metadata.timestamp) {
      activity.metadata.timestamp = new Date().toISOString();
    }
    
    // Add current context
    activity.submission_id = this.submissionId;
    activity.question_id = this.currentQuestionId;

    this.pendingActivities.push(activity);
    
    // Flush immediately if critical or buffer full
    const criticalTypes = ['multiple_tabs_detected', 'navigation_attempt', 'device_fingerprint'];
    if (criticalTypes.includes(activity.activity_type) || this.pendingActivities.length >= 20) {
      this.flush();
      return;
    }

    if (!this.flushTimeout) {
      this.flushTimeout = setTimeout(() => this.flush(), this.FLUSH_INTERVAL);
    }
  }

  async flush() {
    if (this.flushTimeout) clearTimeout(this.flushTimeout);
    this.flushTimeout = null;

    if (this.pendingActivities.length === 0) return;

    const activitiesToFlush = [...this.pendingActivities];
    this.pendingActivities.length = 0;

    try {
      // Use Bulk API if available, otherwise fallback to individual
      await trackActivityBulk({
        submission_id: this.submissionId,
        activities: activitiesToFlush.map(a => ({
          activity_type: a.activity_type,
          question_id: a.question_id,
          metadata: a.metadata
        }))
      });
    } catch (error) {
      console.error('Failed to flush activities:', error);
      // Fallback to individual calls if bulk fails (backwards compatibility)
      try {
        await Promise.all(activitiesToFlush.map(act => trackActivity(act)));
      } catch (e) {
        console.error('Individual fallback failed:', e);
      }
    }
  }
}

// Global instance
const globalTracker = new BatchTracker();

/**
 * Initialize enhanced anti-cheating tracking
 */
export async function initializeEnhancedAntiCheating(
  submissionId: string,
  initialQuestionId: string
): Promise<EnhancedAntiCheatingTracker> {
  globalTracker.init(submissionId, initialQuestionId);
  
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

      globalTracker.track({
        activity_type: 'device_fingerprint',
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
      globalTracker.track({
        activity_type: 'vm_detected',
        metadata: {
          user_agent: navigator.userAgent,
          webdriver: (navigator as any).webdriver,
          dimensions: `${window.outerWidth}x${window.outerHeight}`,
          timestamp: new Date().toISOString(),
        },
      })
    }
  }

  detectVM()

  // DevTools detection
  const handleDevToolsChange = (isOpen: boolean) => {
    if (isOpen) {
      globalTracker.track({
        activity_type: 'devtools',
        metadata: {
          is_open: isOpen,
          timestamp: new Date().toISOString(),
        },
      })
    }
  }
  addDevToolsListener(handleDevToolsChange)
  devtoolsDetector.launch()

  // Fullscreen change detection
  const handleFullscreenChange = () => {
    const isFullscreen = Boolean(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement
    )

    globalTracker.track({
      activity_type: 'fullscreen_change',
      metadata: {
        is_fullscreen: isFullscreen,
        timestamp: new Date().toISOString(),
      },
    })
  }

  // Screenshot detection
  const handleKeyDown = (e: KeyboardEvent) => {
    lastActivityTime = Date.now()
    idleAlreadyFlagged = false

    const isScreenshot =
      (e.key === 'PrintScreen') ||
      (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4')) ||
      (e.metaKey && e.shiftKey && e.key === 's') ||
      (e.ctrlKey && e.key === 'PrintScreen')

    if (isScreenshot) {
      globalTracker.track({
        activity_type: 'screenshot_attempt',
        metadata: {
          key: e.key,
          ctrl: e.ctrlKey,
          meta: e.metaKey,
          shift: e.shiftKey,
          timestamp: new Date().toISOString(),
        },
      })
    }

    keystrokeDynamics.recordKey()
  }

  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
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
          globalTracker.track({
            activity_type: 'split_screen',
            metadata: {
              viewport_width: window.innerWidth,
              screen_width: screen.width,
              ratio: +ratio.toFixed(2),
              timestamp: new Date().toISOString(),
            },
          })
        } else if (!isSplitScreen) {
          splitScreenFlagged = false
        }
      }, 300)
    }
  })()

  let offlineAt: number | null = null

  const handleOffline = () => {
    offlineAt = Date.now()
    globalTracker.track({
      activity_type: 'network_offline',
      metadata: { timestamp: new Date().toISOString() },
    })
  }

  const handleOnline = () => {
    const offlineDuration = offlineAt ? Math.floor((Date.now() - offlineAt) / 1000) : null
    offlineAt = null
    globalTracker.track({
      activity_type: 'network_online',
      metadata: {
        offline_duration_seconds: offlineDuration,
        timestamp: new Date().toISOString(),
      },
    })
  }

  let selectionTimer: ReturnType<typeof setTimeout> | null = null

  const handleSelectionChange = () => {
    if (selectionTimer) clearTimeout(selectionTimer)
    selectionTimer = setTimeout(() => {
      const selected = window.getSelection()?.toString() ?? ''
      if (selected.length > 50) { // Increased threshold to 50
        globalTracker.track({
          activity_type: 'text_selection',
          metadata: {
            selected_length: selected.length,
            timestamp: new Date().toISOString(),
          },
        })
      }
    }, 1500)
  }

  const handleOrientationChange = () => {
    const orientation = screen.orientation?.type ?? (window.innerWidth > window.innerHeight ? 'landscape' : 'portrait')
    globalTracker.track({
      activity_type: 'orientation_change',
      metadata: {
        orientation,
        angle: screen.orientation?.angle ?? null,
        timestamp: new Date().toISOString(),
      },
    })
  }

  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    // We flush all pending activities before unloading
    globalTracker.flush();
    
    // We also use sendBeacon for a final critical event
    const payload = JSON.stringify({
      submission_id: submissionId,
      activity_type: 'navigation_attempt',
      question_id: globalTracker['currentQuestionId'],
      metadata: { timestamp: new Date().toISOString() },
    })
    navigator.sendBeacon(`/api/v1/coding-interviews/activity`, new Blob([payload], { type: 'application/json' }))
  }

  const handleMouseLeave = (e: MouseEvent) => {
    if (e.relatedTarget === null) {
      globalTracker.track({
        activity_type: 'mouse_leave',
        metadata: { timestamp: new Date().toISOString() },
      })
    }
  }

  const handleMouseMove = () => {
    lastActivityTime = Date.now()
    idleAlreadyFlagged = false
  }

  const handleMouseEnter = () => {
    globalTracker.track({
      activity_type: 'mouse_enter',
      metadata: { timestamp: new Date().toISOString() },
    })
  }

  const handleTouchActivity = () => {
    lastActivityTime = Date.now()
    idleAlreadyFlagged = false
  }

  const idleCheckInterval = setInterval(() => {
    const idleSec = Math.floor((Date.now() - lastActivityTime) / 1000)
    if (idleSec >= IDLE_THRESHOLD_MS / 1000 && !idleAlreadyFlagged) {
      idleAlreadyFlagged = true
      globalTracker.track({
        activity_type: 'idle_detected',
        metadata: { idle_seconds: idleSec, timestamp: new Date().toISOString() },
      })
    }
  }, 30_000) // check every 30s

  const keystrokeAnalysisInterval = setInterval(() => {
    if (keystrokeDynamics.isLikelyAI()) {
      globalTracker.track({
        activity_type: 'ai_typing_detected',
        metadata: {
          avg_interval: keystrokeDynamics.getAverageInterval(),
          variance: keystrokeDynamics.getVariance(),
          sample_size: 100,
          timestamp: new Date().toISOString(),
        },
      })
    }
  }, 60000) // Check every 60 seconds

  const handleVisibilityChange = () => {
    const action = document.hidden ? 'blur' : 'focus';
    globalTracker.track({
      activity_type: 'tab_switch',
      metadata: { action, timestamp: new Date().toISOString() },
    })
  }

  const handleWindowBlur = () => {
    globalTracker.track({
      activity_type: 'window_blur',
      metadata: { timestamp: new Date().toISOString() },
    })
  }

  const handleWindowFocus = () => {
    globalTracker.track({
      activity_type: 'window_focus',
      metadata: { timestamp: new Date().toISOString() },
    })
  }

  const handleCopy = (e: ClipboardEvent) => {
    const selection = window.getSelection()?.toString() || ''
    globalTracker.track({
      activity_type: 'copy',
      metadata: {
        selection_length: selection.length,
        timestamp: new Date().toISOString(),
      },
    })
  }

  const handlePaste = (e: ClipboardEvent) => {
    const pastedText = e.clipboardData?.getData('text') || ''
    globalTracker.track({
      activity_type: 'paste',
      metadata: {
        paste_length: pastedText.length,
        timestamp: new Date().toISOString(),
      },
    })
  }

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    globalTracker.track({
      activity_type: 'right_click_attempt',
      metadata: {
        x: e.clientX,
        y: e.clientY,
        timestamp: new Date().toISOString(),
      },
    })
  }

  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === `interview_${submissionId}` && e.newValue !== e.oldValue) {
      globalTracker.track({
        activity_type: 'multiple_tabs_detected',
        metadata: {
          old_value: e.oldValue,
          new_value: e.newValue,
          timestamp: new Date().toISOString(),
        },
      })
    }
  }

  localStorage.setItem(`interview_${submissionId}`, Date.now().toString())

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

  if (screen.orientation) {
    screen.orientation.addEventListener('change', handleOrientationChange)
  } else {
    window.addEventListener('orientationchange', handleOrientationChange)
  }

  if (isTouchDevice) {
    document.addEventListener('touchstart', handleTouchActivity, { passive: true })
    document.addEventListener('touchend',   handleTouchActivity, { passive: true })
    listeners.push(
      () => document.removeEventListener('touchstart', handleTouchActivity),
      () => document.removeEventListener('touchend',   handleTouchActivity)
    )
  } else {
    document.addEventListener('mouseleave', handleMouseLeave)
    document.addEventListener('mouseenter', handleMouseEnter)
    document.addEventListener('mousemove',  handleMouseMove, { passive: true })
    listeners.push(
      () => document.removeEventListener('mouseleave', handleMouseLeave),
      () => document.removeEventListener('mouseenter', handleMouseEnter),
      () => document.removeEventListener('mousemove',  handleMouseMove)
    )
  }

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
    () => removeDevToolsListener(handleDevToolsChange),
    () => devtoolsDetector.stop(),
    () => localStorage.removeItem(`interview_${submissionId}`)
  )

  const checkFullscreen = (): boolean => {
    return Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement || (document as any).mozFullScreenElement)
  }

  const requestFullscreen = async (): Promise<void> => {
    const elem = document.documentElement
    try {
      if (elem.requestFullscreen) await elem.requestFullscreen()
      else if ((elem as any).webkitRequestFullscreen) await (elem as any).webkitRequestFullscreen()
      else if ((elem as any).mozRequestFullScreen) await (elem as any).mozRequestFullScreen()
    } catch (error) {
      console.error('Fullscreen request failed:', error)
    }
  }

  const exitFullscreen = async (): Promise<void> => {
    if (checkFullscreen()) {
      try {
        if (document.exitFullscreen) await document.exitFullscreen()
        else if ((document as any).webkitExitFullscreen) await (document as any).webkitExitFullscreen()
        else if ((document as any).mozCancelFullScreen) await (document as any).mozCancelFullScreen()
      } catch (error) {
        console.error('Fullscreen exit failed:', error)
      }
    }
  }

  return {
    updateQuestionId: (questionId: string) => {
      const timeSpentSec = Math.floor((Date.now() - questionStartTime) / 1000)
      globalTracker.track({
        activity_type: 'question_time',
        question_id: prevQuestionId,
        metadata: {
          time_spent_seconds: timeSpentSec,
          next_question_id: questionId,
          timestamp: new Date().toISOString(),
        },
      })
      questionStartTime = Date.now()
      prevQuestionId = questionId
      globalTracker.updateQuestionId(questionId)
    },
    cleanup: () => {
      listeners.forEach((cleanup) => cleanup())
      globalTracker.flush();
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
    exitFullscreen,
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
 * Track code change event (Uses central batch tracker)
 */
export function trackCodeChange(
  submissionId: string,
  questionId: string,
  codeLength: number
): void {
  // Always update global tracker context just in case
  globalTracker.init(submissionId, questionId);
  
  globalTracker.track({
    activity_type: 'code_change',
    metadata: {
      code_length: codeLength,
      timestamp: new Date().toISOString(),
    },
  })
}

/**
 * Create debounced code change tracker (Increased wait to 15s)
 */
export function createCodeChangeTracker(submissionId: string, questionId: string) {
  let lastCodeLength = -1;
  const DEBOUNCE_TIME = 15000;
  
  return debounce((codeLength: number) => {
    // Only log if length changed significantly (> 5 chars)
    if (Math.abs(codeLength - lastCodeLength) > 5) {
      trackCodeChange(submissionId, questionId, codeLength)
      lastCodeLength = codeLength;
    }
  }, DEBOUNCE_TIME)
}
