"""
VAPI Configuration Builder Service

Builds complete VAPI assistant configuration JSON from AI-generated prompts.
"""

from typing import Dict, Any
import logging

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class VAPIConfigBuilder:
    """
    Builds complete VAPI assistant configuration JSON.

    This replaces the hardcoded configuration in setup_vapi_assistant.py
    Supports knowledge base integration and function calling.
    """

    def __init__(self):
        self.settings = get_settings()

    def build_vapi_config(
        self,
        system_prompt: str,
        structured_data_schema: Dict[str, Any],
        candidate_type: str = "general",
        knowledge_base_file_ids: list = None,
        enable_functions: bool = True,
        interview_style: str = "conversational",
        max_duration_seconds: int = 900
    ) -> Dict[str, Any]:
        """
        Construct full VAPI assistant configuration.

        Args:
            system_prompt: AI-generated system prompt for VAPI
            structured_data_schema: Field schema for structured data extraction
            candidate_type: Type of candidate (fresher/experienced/general)
            knowledge_base_file_ids: List of VAPI file IDs for knowledge base
            enable_functions: Enable function calling (e.g., end_call)
            interview_style: structured/adaptive/conversational
            max_duration_seconds: Maximum call duration in seconds (default: 900 = 15 min)

        Returns:
            Complete VAPI configuration dict ready for vapi.start(config)
        """
        logger.info(f"Building VAPI config for candidate type: {candidate_type}, style: {interview_style}")

        # Build config for vapi.start() — inline assistant config (NOT server-created assistant)
        # Do NOT include server-dependent tools (end_call, flag_concern) as they require
        # a reachable webhook URL. Use VAPI's built-in endCallFunctionEnabled instead.
        config: Dict[str, Any] = {
            "model": {
                "provider": "openai",
                "model": "gpt-4o-mini",
                "temperature": 0.4,
                "messages": [
                    {
                        "role": "system",
                        "content": system_prompt
                    }
                ],
            },
            "voice": {
                "provider": "11labs",
                "voiceId": "nPczCjzI2devNBz1zQrb",
                "model": "eleven_turbo_v2_5",
                "stability": 0.5,
                "similarityBoost": 0.8,
            },
            "firstMessage": "Hi! Thank you for taking the time to speak with me today. Let's get started with the interview.",
            "recordingEnabled": True,
            "maxDurationSeconds": max_duration_seconds,  # Configurable duration (default: 900 = 15 min)
            "silenceTimeoutSeconds": 60,  # 60s silence before auto-end (was 45, too aggressive)
            "transcriber": {
                "provider": "deepgram",
                "model": "nova-2",
                "language": "en",
                "endpointing": 1200,  # Wait 1200ms (1.2s) of silence - allows thinking pauses
            },
            "analysisPlan": {
                "structuredDataPrompt": "You are a strict data extractor. ONLY extract information that was EXPLICITLY stated by the candidate during the conversation. If the candidate did not clearly mention a piece of information, you MUST use null. Do NOT guess, infer, or assume any information. If the conversation was too short or the candidate did not provide substantive answers, ALL fields should be null.",
                "structuredDataSchema": self._build_analysis_schema(structured_data_schema)
            },
            # Use VAPI's built-in end call — no webhook needed
            "endCallFunctionEnabled": True,
            # Turn-taking: prevent AI from speaking over the candidate
            "startSpeakingPlan": {
                "waitSeconds": 2.8,  # Wait 2.8s before assistant starts speaking (gives thinking time)
                "smartEndpointingEnabled": True,
                "transcriptionEndpointingPlan": {
                    "onPunctuationSeconds": 0.4,   # Wait 0.4s after punctuation
                    "onNoPunctuationSeconds": 1.8, # Wait 1.8s if no punctuation (thinking/incomplete)
                    "onNumberSeconds": 1.2,        # Wait 1.2s for complete numbers
                }
            },
            "stopSpeakingPlan": {
                "numWords": 2,           # Require 2+ words to count as interruption (ignores "ah", "um")
                "voiceSeconds": 0.4,     # Require 0.4s of voice activity to count as interruption
                "backoffSeconds": 1.5,   # Wait 1.5s after interruption before resuming
            },
        }

        # Only include server/webhook block if BACKEND_URL is set and not localhost
        backend_url = self.settings.BACKEND_URL
        if backend_url and "localhost" not in backend_url and "127.0.0.1" not in backend_url:
            webhook_url = f"{backend_url}/api/v1/voice-screening/webhook"
            config["server"] = {
                "url": webhook_url,
                "secret": self.settings.SECRET_KEY
            }
            logger.info(f"Webhook URL: {webhook_url}")
        else:
            logger.warning("BACKEND_URL not set or is localhost — skipping server/webhook block. Post-call data will be fetched via API instead.")

        if knowledge_base_file_ids and len(knowledge_base_file_ids) > 0:
            logger.info(f"Knowledge base file IDs provided ({len(knowledge_base_file_ids)}) - content should be included in system prompt")

        logger.info(f"Built VAPI config with {len(structured_data_schema)} fields to extract")
        return config

    def _build_analysis_schema(self, field_schema: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert field schema to VAPI analysis schema format.

        Input format (from Ollama):
        {
            "phone_number": {
                "type": "string",
                "description": "Candidate's phone number",
                "example": "+1234567890"
            }
        }

        Output format (for VAPI):
        {
            "type": "object",
            "properties": {
                "phone_number": {
                    "type": "string",
                    "description": "Candidate's phone number"
                }
            },
            "required": ["phone_number", ...]
        }
        """
        properties = {}
        required_fields = []

        for field_name, field_def in field_schema.items():
            properties[field_name] = {
                "type": field_def.get("type", "string"),
                "description": field_def.get("description", "")
            }
            required_fields.append(field_name)

        schema = {
            "type": "object",
            "properties": properties,
            "required": required_fields
        }

        logger.debug(f"Built analysis schema with {len(required_fields)} required fields")
        return schema
