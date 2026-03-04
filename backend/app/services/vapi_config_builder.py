"""
VAPI Configuration Builder Service

Builds complete VAPI assistant configuration JSON from AI-generated prompts.
"""

from typing import Dict, Any
import os
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
        interview_style: str = "conversational"
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

        Returns:
            Complete VAPI configuration dict ready for vapi.start(config)
        """
        logger.info(f"Building VAPI config for candidate type: {candidate_type}, style: {interview_style}")

        # Get webhook URL from environment
        frontend_url = self.settings.FRONTEND_URL or "http://localhost:3000"
        backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
        webhook_url = f"{backend_url}/api/v1/voice-screening/webhook"

        logger.debug(f"Webhook URL: {webhook_url}")

        config = {
            "name": f"Dynamic Interview - {candidate_type}",
            "model": {
                "provider": "openai",
                "model": "gpt-4o-mini",
                "temperature": 0.4,
                "systemPrompt": system_prompt,
                "messages": [
                    {
                        "role": "assistant",
                        "content": "Hi! Thank you for taking the time to speak with me today."
                    }
                ]
            },
            "voice": {
                "provider": "11labs",
                "voiceId": "z0gdR3nhVl1Ig2kiEigL",  # Custom voice
                "model": "eleven_turbo_v2_5",
                "stability": 0.5,
                "similarityBoost": 0.8,
                "style": 0.0,
                "useSpeakerBoost": True
            },
            "firstMessage": "Hi! Thank you for taking the time to speak with me today. Let's get started with the interview.",
            "recordingEnabled": True,
            "maxDurationSeconds": 900,  # 15 minutes
            "silenceTimeoutSeconds": 30,
            "endCallPhrases": [
                "goodbye",
                "thank you bye",
                "that's all",
                "end interview"
            ],
            "transcriber": {
                "provider": "deepgram",
                "model": "nova-2",
                "language": "en"
            },
            "server": {
                "url": webhook_url,
                "secret": self.settings.SECRET_KEY
            },
            "analysisPlan": {
                "structuredDataPrompt": "You are an expert data extractor. Extract the structured data from this interview conversation per the JSON Schema. Focus on extracting accurate information discussed during the call. If information is unclear or not mentioned, use null values.",
                "structuredDataSchema": self._build_analysis_schema(structured_data_schema)
            }
        }

        # Note: knowledgeBase property has been removed from VAPI API.
        # Knowledge base content should be embedded in the system prompt instead.
        if knowledge_base_file_ids and len(knowledge_base_file_ids) > 0:
            logger.info(f"Knowledge base file IDs provided ({len(knowledge_base_file_ids)}) - content should be included in system prompt")

        # Add function calling if enabled
        if enable_functions:
            config["functions"] = self._build_functions()
            logger.info(f"✅ Added {len(config['functions'])} functions")

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

    def _build_functions(self) -> list:
        """
        Build VAPI function calling definitions.

        Returns:
            List of function definitions for VAPI
        """
        return [
            {
                "name": "end_call",
                "description": "End the interview call when the candidate indicates they are done (e.g., says thank you, goodbye, no more questions, etc.)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "reason": {
                            "type": "string",
                            "description": "Reason why the call is ending (e.g., candidate said goodbye, interview complete)"
                        }
                    },
                    "required": ["reason"]
                }
            },
            {
                "name": "flag_concern",
                "description": "Flag a concern or red flag during the interview (e.g., technical knowledge gap, communication issue)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "concern_type": {
                            "type": "string",
                            "enum": ["technical_gap", "communication_issue", "attitude_concern", "other"],
                            "description": "Type of concern"
                        },
                        "description": {
                            "type": "string",
                            "description": "Description of the concern"
                        }
                    },
                    "required": ["concern_type", "description"]
                }
            }
        ]
