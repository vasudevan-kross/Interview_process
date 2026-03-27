"""
VAPI Event Logger Service

Logs all Vapi events for debugging turn-taking and speech issues.
Helps identify why AI sometimes doesn't speak, interrupts candidates, or rushes to next question.
"""

import logging
from typing import Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class VapiEventLogger:
    """
    Log Vapi call events for debugging turn-taking issues.

    Tracks:
    - Assistant speech (when AI starts/stops speaking)
    - Candidate transcripts (what candidate says)
    - Interruptions (when candidate interrupts AI)
    - Speech updates (status changes during call)
    """

    @staticmethod
    def log_assistant_speech(call_id: str, message: str, timestamp: Optional[str] = None):
        """
        Log when assistant starts speaking.

        Args:
            call_id: Unique call identifier
            message: What the assistant said
            timestamp: ISO timestamp (optional)
        """
        ts = timestamp or datetime.utcnow().isoformat()
        logger.info(
            f"[VAPI-SPEECH] Call={call_id} Time={ts} "
            f"Assistant: {message[:150]}{'...' if len(message) > 150 else ''}"
        )

    @staticmethod
    def log_transcript(
        call_id: str,
        role: str,
        transcript: str,
        is_final: bool = True,
        timestamp: Optional[str] = None
    ):
        """
        Log speech transcripts (both assistant and candidate).

        Args:
            call_id: Unique call identifier
            role: "assistant" or "user"
            transcript: Transcribed text
            is_final: Whether this is final transcript or interim
            timestamp: ISO timestamp (optional)
        """
        ts = timestamp or datetime.utcnow().isoformat()
        final_flag = "FINAL" if is_final else "INTERIM"
        logger.info(
            f"[VAPI-TRANSCRIPT] Call={call_id} Time={ts} "
            f"Role={role.upper()} Status={final_flag} "
            f"Text: {transcript[:200]}{'...' if len(transcript) > 200 else ''}"
        )

    @staticmethod
    def log_interruption(
        call_id: str,
        interrupted_by: str,
        context: Optional[Dict[str, Any]] = None,
        timestamp: Optional[str] = None
    ):
        """
        Log when candidate interrupts assistant speech.

        Args:
            call_id: Unique call identifier
            interrupted_by: What the candidate said that caused interruption
            context: Additional context (numWords, voiceSeconds, etc.)
            timestamp: ISO timestamp (optional)
        """
        ts = timestamp or datetime.utcnow().isoformat()
        ctx_str = f" Context={context}" if context else ""
        logger.warning(
            f"[VAPI-INTERRUPT] Call={call_id} Time={ts} "
            f"InterruptedBy: '{interrupted_by}'{ctx_str}"
        )

    @staticmethod
    def log_speech_update(
        call_id: str,
        status: str,
        details: Optional[Dict[str, Any]] = None,
        timestamp: Optional[str] = None
    ):
        """
        Log speech status updates during call.

        Args:
            call_id: Unique call identifier
            status: Status type (e.g., "speech-started", "speech-ended")
            details: Additional details about the update
            timestamp: ISO timestamp (optional)
        """
        ts = timestamp or datetime.utcnow().isoformat()
        details_str = f" Details={details}" if details else ""
        logger.debug(
            f"[VAPI-UPDATE] Call={call_id} Time={ts} "
            f"Status={status}{details_str}"
        )

    @staticmethod
    def log_turn_taking_config(call_id: str, config: Dict[str, Any]):
        """
        Log the turn-taking configuration used for this call.
        Useful for debugging why certain behavior occurs.

        Args:
            call_id: Unique call identifier
            config: Turn-taking config (startSpeakingPlan, stopSpeakingPlan, etc.)
        """
        logger.info(
            f"[VAPI-CONFIG] Call={call_id} "
            f"Turn-taking config: {config}"
        )

    @staticmethod
    def log_call_start(call_id: str, campaign_id: Optional[str] = None):
        """
        Log when a call starts.

        Args:
            call_id: Unique call identifier
            campaign_id: Campaign ID (optional)
        """
        campaign_str = f" Campaign={campaign_id}" if campaign_id else ""
        logger.info(
            f"[VAPI-CALL-START] Call={call_id}{campaign_str} "
            f"Timestamp={datetime.utcnow().isoformat()}"
        )

    @staticmethod
    def log_call_end(
        call_id: str,
        duration_seconds: Optional[int] = None,
        end_reason: Optional[str] = None
    ):
        """
        Log when a call ends.

        Args:
            call_id: Unique call identifier
            duration_seconds: Total call duration
            end_reason: Why the call ended
        """
        duration_str = f" Duration={duration_seconds}s" if duration_seconds else ""
        reason_str = f" Reason={end_reason}" if end_reason else ""
        logger.info(
            f"[VAPI-CALL-END] Call={call_id}{duration_str}{reason_str} "
            f"Timestamp={datetime.utcnow().isoformat()}"
        )

    @staticmethod
    def log_silence_detected(
        call_id: str,
        silence_duration_ms: int,
        threshold_ms: int
    ):
        """
        Log when silence is detected (helps debug endpointing issues).

        Args:
            call_id: Unique call identifier
            silence_duration_ms: How long silence lasted
            threshold_ms: Configured silence threshold
        """
        logger.debug(
            f"[VAPI-SILENCE] Call={call_id} "
            f"SilenceDuration={silence_duration_ms}ms "
            f"Threshold={threshold_ms}ms "
            f"Triggered={'YES' if silence_duration_ms >= threshold_ms else 'NO'}"
        )

    @staticmethod
    def log_error(call_id: str, error: str, context: Optional[Dict[str, Any]] = None):
        """
        Log errors during call processing.

        Args:
            call_id: Unique call identifier
            error: Error message
            context: Additional context about the error
        """
        ctx_str = f" Context={context}" if context else ""
        logger.error(
            f"[VAPI-ERROR] Call={call_id} Error: {error}{ctx_str}"
        )
