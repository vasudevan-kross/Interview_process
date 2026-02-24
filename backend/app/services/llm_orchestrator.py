"""
LLM Orchestrator service for managing Ollama models and prompt execution.
Handles model selection, prompt formatting, and response parsing.
"""
from typing import Dict, List, Optional, Any
import logging
import json
from datetime import datetime

try:
    import ollama
except ImportError:
    ollama = None

from app.config import settings
from app.model_config import model_config
from app.db.supabase_client import get_supabase

logger = logging.getLogger(__name__)


class LLMOrchestrator:
    """Service for orchestrating LLM operations with Ollama."""

    def __init__(self):
        """Initialize the LLM orchestrator."""
        self.client = get_supabase()
        self.ollama_base_url = settings.OLLAMA_BASE_URL
        self.default_model = settings.DEFAULT_OLLAMA_MODEL

        if ollama is None:
            logger.warning("ollama package not installed. LLM operations will fail.")

    def _format_size(self, size_bytes: int) -> str:
        """
        Format size in bytes to human-readable format.

        Args:
            size_bytes: Size in bytes

        Returns:
            Formatted size string (e.g., "3.8 GB")
        """
        if size_bytes < 1024:
            return f"{size_bytes} B"
        elif size_bytes < 1024 ** 2:
            return f"{size_bytes / 1024:.1f} KB"
        elif size_bytes < 1024 ** 3:
            return f"{size_bytes / (1024 ** 2):.1f} MB"
        else:
            return f"{size_bytes / (1024 ** 3):.1f} GB"

    async def list_available_models(self) -> List[Dict[str, Any]]:
        """
        List available Ollama models.

        Returns:
            List of model information with formatted sizes
        """
        try:
            if ollama is None:
                logger.error("ollama package not installed")
                raise RuntimeError("ollama package not installed")

            logger.info("Fetching models from Ollama...")
            models_response = ollama.list()
            logger.info(f"Raw Ollama response type: {type(models_response)}")
            logger.info(f"Raw Ollama response: {models_response}")

            models = models_response.get('models', []) if isinstance(models_response, dict) else []
            logger.info(f"Found {len(models)} models")

            # Format the models to match frontend expectations
            formatted_models = []
            for model in models:
                formatted_model = {
                    "name": model.get('name', 'Unknown'),
                    "size": self._format_size(model.get('size', 0)),
                    "modified_at": model.get('modified_at'),
                    "digest": model.get('digest', '')[:12] if model.get('digest') else 'N/A'
                }
                logger.info(f"Formatted model: {formatted_model}")
                formatted_models.append(formatted_model)

            logger.info(f"Returning {len(formatted_models)} formatted models")
            return formatted_models

        except Exception as e:
            logger.error(f"Error listing models: {e}")
            logger.exception(e)  # Log full traceback
            raise

    async def check_model_availability(self, model_name: str) -> bool:
        """
        Check if a model is available locally.

        Args:
            model_name: Name of the model (e.g., "mistral:7b")

        Returns:
            True if model is available
        """
        try:
            models = await self.list_available_models()
            return any(model.get('name') == model_name for model in models)

        except Exception as e:
            logger.error(f"Error checking model availability: {e}")
            return False

    async def generate_completion(
        self,
        prompt: str,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Generate a completion using Ollama.

        Args:
            prompt: User prompt
            model: Model name (uses default if not specified)
            system_prompt: Optional system prompt
            temperature: Sampling temperature (0-1)
            max_tokens: Maximum tokens to generate

        Returns:
            dict with response, model, tokens used, etc.
        """
        try:
            if ollama is None:
                raise RuntimeError("ollama package not installed")

            model = model or self.default_model

            # Check if model is available
            if not await self.check_model_availability(model):
                logger.warning(f"Model {model} not found locally. Attempting to use anyway...")

            # Prepare messages
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            # Generate completion
            options = {
                "temperature": temperature,
            }
            if max_tokens:
                options["num_predict"] = max_tokens

            response = ollama.chat(
                model=model,
                messages=messages,
                options=options
            )

            return {
                "response": response.get('message', {}).get('content', ''),
                "model": model,
                "total_duration": response.get('total_duration'),
                "load_duration": response.get('load_duration'),
                "prompt_eval_count": response.get('prompt_eval_count'),
                "eval_count": response.get('eval_count'),
            }

        except Exception as e:
            logger.error(f"Error generating completion: {e}")
            raise

    async def extract_skills_from_text(
        self,
        text: str,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Extract skills from job description or resume text.

        Args:
            text: Input text (JD or resume)
            model: Optional model override

        Returns:
            dict with extracted skills categorized by type
        """
        try:
            system_prompt = """You are an expert HR assistant that extracts skills from job descriptions and resumes.
Extract all relevant skills and categorize them as: technical_skills, soft_skills, tools, languages, certifications.
Return the result as a valid JSON object with these categories as keys, each containing an array of strings.
Only return the JSON object, no additional text."""

            user_prompt = f"""Extract and categorize all skills from the following text:

{text[:3000]}

Return only a JSON object with the structure:
{{
  "technical_skills": [],
  "soft_skills": [],
  "tools": [],
  "languages": [],
  "certifications": []
}}"""

            result = await self.generate_completion(
                prompt=user_prompt,
                model=model,
                system_prompt=system_prompt,
                temperature=0.3
            )

            # Parse JSON response
            response_text = result['response'].strip()

            # Try to extract JSON from markdown code blocks
            if '```json' in response_text:
                response_text = response_text.split('```json')[1].split('```')[0].strip()
            elif '```' in response_text:
                response_text = response_text.split('```')[1].split('```')[0].strip()

            skills = json.loads(response_text)

            return {
                "skills": skills,
                "model_used": result['model'],
                "extraction_metadata": {
                    "eval_count": result.get('eval_count'),
                    "total_duration": result.get('total_duration')
                }
            }

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse skills JSON: {e}")
            logger.error(f"Response was: {result.get('response', '')}")
            # Return empty structure on parse failure
            return {
                "skills": {
                    "technical_skills": [],
                    "soft_skills": [],
                    "tools": [],
                    "languages": [],
                    "certifications": []
                },
                "error": f"JSON parse error: {str(e)}"
            }
        except Exception as e:
            logger.error(f"Error extracting skills: {e}")
            raise

    async def extract_candidate_info(
        self,
        resume_text: str,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Extract candidate information from resume text.

        Args:
            resume_text: Resume text content
            model: Optional model override

        Returns:
            dict with candidate_name, candidate_email, candidate_phone
        """
        try:
            system_prompt = """You are an expert HR assistant that extracts candidate information from resumes.
Extract the candidate's name, email, and phone number from the resume.
Return the result as a valid JSON object.
If any field is not found, use null.
Only return the JSON object, no additional text."""

            user_prompt = f"""Extract the candidate information from this resume:

{resume_text[:2000]}

Return only a JSON object with this structure:
{{
  "candidate_name": "<full name or null>",
  "candidate_email": "<email or null>",
  "candidate_phone": "<phone or null>"
}}"""

            result = await self.generate_completion(
                prompt=user_prompt,
                model=model,
                system_prompt=system_prompt,
                temperature=0.1
            )

            # Parse JSON response
            response_text = result['response'].strip()

            # Try to extract JSON from markdown code blocks
            if '```json' in response_text:
                response_text = response_text.split('```json')[1].split('```')[0].strip()
            elif '```' in response_text:
                response_text = response_text.split('```')[1].split('```')[0].strip()

            candidate_info = json.loads(response_text)

            return {
                "candidate_name": candidate_info.get("candidate_name"),
                "candidate_email": candidate_info.get("candidate_email"),
                "candidate_phone": candidate_info.get("candidate_phone"),
                "model_used": result['model'],
                "extraction_metadata": {
                    "eval_count": result.get('eval_count'),
                    "total_duration": result.get('total_duration')
                }
            }

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse candidate info JSON: {e}")
            logger.error(f"Response was: {result.get('response', '')}")
            # Return null values on parse failure
            return {
                "candidate_name": None,
                "candidate_email": None,
                "candidate_phone": None,
                "error": f"JSON parse error: {str(e)}"
            }
        except Exception as e:
            logger.error(f"Error extracting candidate info: {e}")
            raise

    async def calculate_match_score(
        self,
        job_description: str,
        resume: str,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Calculate match score between a job description and resume.

        Args:
            job_description: Job description text
            resume: Resume text
            model: Optional model override

        Returns:
            dict with match_score, reasoning, and key_matches
        """
        try:
            system_prompt = """You are an expert HR assistant that evaluates candidate-job fit.
Analyze the job description and resume, then provide:
1. A match score (0-100) indicating how well the candidate matches the job
2. Key matching points
3. Missing requirements
4. Brief reasoning

Return the result as a valid JSON object with this structure:
{
  "match_score": <number 0-100>,
  "key_matches": [<list of matching skills/qualifications>],
  "missing_requirements": [<list of missing requirements>],
  "reasoning": "<brief explanation>"
}
Only return the JSON object, no additional text."""

            user_prompt = f"""Evaluate the match between this job description and resume:

JOB DESCRIPTION:
{job_description[:2000]}

RESUME:
{resume[:2000]}

Provide a detailed match analysis as JSON."""

            result = await self.generate_completion(
                prompt=user_prompt,
                model=model,
                system_prompt=system_prompt,
                temperature=0.3
            )

            # Parse JSON response
            response_text = result['response'].strip()

            # Try to extract JSON from markdown code blocks
            if '```json' in response_text:
                response_text = response_text.split('```json')[1].split('```')[0].strip()
            elif '```' in response_text:
                response_text = response_text.split('```')[1].split('```')[0].strip()

            match_data = json.loads(response_text)

            return {
                **match_data,
                "model_used": result['model'],
                "evaluation_metadata": {
                    "eval_count": result.get('eval_count'),
                    "total_duration": result.get('total_duration')
                }
            }

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse match score JSON: {e}")
            logger.error(f"Response was: {result.get('response', '')}")
            # Return default structure on parse failure
            return {
                "match_score": 0,
                "key_matches": [],
                "missing_requirements": [],
                "reasoning": "Error parsing LLM response",
                "error": f"JSON parse error: {str(e)}"
            }
        except Exception as e:
            logger.error(f"Error calculating match score: {e}")
            raise

    async def evaluate_answer(
        self,
        question: str,
        correct_answer: str,
        candidate_answer: str,
        max_marks: float,
        model: Optional[str] = None,
        domain: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Evaluate a candidate's answer against the correct answer.
        Uses more capable models (llama2:13b, codellama:7b) for better reasoning.

        Args:
            question: The question text
            correct_answer: Expected/correct answer
            candidate_answer: Candidate's answer
            max_marks: Maximum marks for this question
            model: Optional model override
            domain: Optional domain (coding, sql, general) for model selection

        Returns:
            dict with marks_awarded, feedback, and key_points
        """
        try:
            system_prompt = """You are an expert evaluator for technical interviews and written tests.
Evaluate the candidate's answer by comparing it with the correct answer.
Award partial credit for partially correct answers.
Provide constructive feedback.

Return the result as a valid JSON object with this structure:
{
  "marks_awarded": <number between 0 and max_marks>,
  "feedback": "<constructive feedback>",
  "key_points_covered": [<list of correct points>],
  "key_points_missed": [<list of missed points>],
  "reasoning": "<brief explanation of the marking>"
}
Only return the JSON object, no additional text."""

            user_prompt = f"""Evaluate this answer (max marks: {max_marks}):

QUESTION:
{question}

CORRECT ANSWER:
{correct_answer[:1000]}

CANDIDATE'S ANSWER:
{candidate_answer[:1000]}

Provide evaluation as JSON."""

            # Use capable model for evaluation (llama2:13b or codellama:7b for code)
            result = await self.evaluate_with_capable_model(
                prompt=user_prompt,
                domain=domain,
                system_prompt=system_prompt,
                override_model=model  # Allow user override
            )

            # Parse JSON response
            response_text = result['response'].strip()

            # Try to extract JSON from markdown code blocks
            if '```json' in response_text:
                response_text = response_text.split('```json')[1].split('```')[0].strip()
            elif '```' in response_text:
                response_text = response_text.split('```')[1].split('```')[0].strip()

            evaluation = json.loads(response_text)

            # Ensure marks don't exceed max_marks
            if evaluation.get('marks_awarded', 0) > max_marks:
                evaluation['marks_awarded'] = max_marks

            return {
                **evaluation,
                "model_used": result['model'],
                "evaluation_metadata": {
                    "eval_count": result.get('eval_count'),
                    "total_duration": result.get('total_duration')
                }
            }

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse evaluation JSON: {e}")
            logger.error(f"Response was: {result.get('response', '')}")
            # Return safe default on parse failure
            return {
                "marks_awarded": 0,
                "feedback": "Error parsing evaluation response",
                "key_points_covered": [],
                "key_points_missed": [],
                "reasoning": "Evaluation failed",
                "error": f"JSON parse error: {str(e)}"
            }
        except Exception as e:
            logger.error(f"Error evaluating answer: {e}")
            raise

    def get_model_for_task(self, task: str, domain: Optional[str] = None, override: Optional[str] = None) -> str:
        """
        Get the appropriate model for a specific task with optional override.

        Args:
            task: Task name (e.g., "answer_evaluation", "question_parsing")
            domain: Optional domain for context-aware model selection
            override: Optional model override (takes precedence)

        Returns:
            Model identifier to use
        """
        # User override takes precedence
        if override:
            logger.info(f"Using override model '{override}' for task '{task}'")
            return override

        # Get task-appropriate model from configuration
        model = model_config.get_model_for_task(task, domain)
        logger.info(f"Selected model '{model}' for task '{task}' (domain: {domain})")
        return model

    async def parse_with_fast_model(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        override_model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Use a fast model for parsing tasks (question parsing, resume parsing, etc.).

        Args:
            prompt: The prompt to send
            system_prompt: Optional system prompt
            override_model: Optional model override

        Returns:
            Parsed result dictionary
        """
        model = self.get_model_for_task("question_parsing", override=override_model)
        return await self.generate_completion(
            prompt=prompt,
            model=model,
            system_prompt=system_prompt,
            temperature=0.3  # Lower temperature for consistent parsing
        )

    async def evaluate_with_capable_model(
        self,
        prompt: str,
        domain: Optional[str] = None,
        system_prompt: Optional[str] = None,
        override_model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Use a more capable model for evaluation tasks requiring reasoning.

        Args:
            prompt: The prompt to send
            domain: Optional domain (coding, sql, general, etc.)
            system_prompt: Optional system prompt
            override_model: Optional model override

        Returns:
            Evaluation result dictionary
        """
        model = self.get_model_for_task("answer_evaluation", domain=domain, override=override_model)
        return await self.generate_completion(
            prompt=prompt,
            model=model,
            system_prompt=system_prompt,
            temperature=0.2  # Lower temperature for consistent evaluation
        )


# Singleton instance
_llm_orchestrator: Optional[LLMOrchestrator] = None


def get_llm_orchestrator() -> LLMOrchestrator:
    """Get the LLM orchestrator singleton."""
    global _llm_orchestrator
    if _llm_orchestrator is None:
        _llm_orchestrator = LLMOrchestrator()
    return _llm_orchestrator
