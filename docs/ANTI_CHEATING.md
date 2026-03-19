# Anti-Cheating System Documentation

This document outlines the anti-cheating measures, activity tracking, risk scoring, and flagging thresholds used during coding interviews.

## 1. Frontend Tracking (`anti-cheating-enhanced.ts`)
The frontend monitors candidate behavior and securely sends payloads (`activity_type`, `metadata`, `timestamp`) to the backend.

### Monitored Events
* **mouse_enter / mouse_leave**: Tracks when the cursor enters or exits the browser document.
* **window_blur / window_focus**: Tracks when the browser window loses or gains focus.
* **visibilitychange**: Tracks when the user switches to a different tab (`tab_switch`).
* **fullscreenchange**: Tracks whether the user is in full-screen mode or has exited.
* **copy / paste**: Tracks clipboard operations and the length of the string being pasted/copied.
* **contextmenu**: Tracks right-click attempts.
* **keydown**: Monitors keystrokes to detect AI typing cadences (via `keystrokeDynamics.isLikelyAI()`).
* **storage**: Detects if the same session is opened in multiple tabs.
* **idle_detected**: Triggers if there is no mouse or keyboard activity for 60 seconds.

## 2. Backend Risk Evaluation (`coding_interview_service.py`)

After a submission is completed and evaluated for correctness, the system runs a comprehensive risk analysis to determine the integrity of the submission.

### Basic Flagging (`check_suspicious_activity`)
This evaluates immediate hard-stop violations that flip the `suspicious_activity` boolean to `True` on the submission record:
1. **Excessive Tab Switching**: > 10 tab switches.
2. **Large Paste Volume**: > 5 paste events **AND** total pasted characters > 500.

If triggered, specific flags (e.g., `"Excessive tab switching (11 times)"`) are added to the submission metadata.

### Comprehensive Risk Scoring (`get_submission_risk_score`)
Every tracked event is assigned a specific risk score. The cumulative score determines the final `risk_level` for the candidate.

#### Point Values per Event Type
* **100 points**: `vm_detected` (Critical - Virtual machine or automation tool detected)
* **75 points**: `ai_typing_detected` (Very suspicious - Robot-like typing cadence)
* **50 points**: `devtools` (Opened F12/Developer Tools), `multiple_tabs_detected`
* **40 points**: `split_screen` (Opening dual windows on mobile, typically used for ChatGPT)
* **30 points**: `navigation_attempt` (Trying to close or leave the tab via beforeunload)
* **25 points**: `screenshot_attempt` (Trying to capture question text)
* **20 points**: `network_offline` (Went offline, often used to bypass tracking)
* **15 points**: `idle_detected` (No interaction for 60+ seconds)
* **10 points**: `fullscreen_change` (Specifically exiting fullscreen), `copy`, `paste`
* **8 points**: `text_selection` (Selecting question text to copy/share)
* **5 points**: `tab_switch`, `orientation_change`, `right_click_attempt`
* **4 points**: `mouse_leave` (Cursor explicitly moved outside the window)
* **3 points**: `window_blur`
* **1 point**: `window_focus`

#### Risk Levels
Based on the accumulated points, the candidate is categorized into one of four risk levels:
* **Critical**: `>= 150 points`
* **High**: `100 - 149 points`
* **Medium**: `50 - 99 points`
* **Low**: `< 50 points`

#### Ad-hoc Pattern Flags
During scoring, dynamic warning flags are also generated if pattern thresholds are met (independent of total score):
* `excessive_tab_switching` (High severity) if `tab_switch > 15`
* `excessive_pasting` (Medium severity) if `paste > 10`

### Pipeline Sync
These results are logged in `coding_submissions` and `session_activities` tables, and securely synced back to recruiters for review before candidate progression.
