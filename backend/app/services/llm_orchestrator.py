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

    async def list_available_models(self) -> List[Dict[str, Any]]:
        """
        List available Ollama models.

        Returns:
            List of model information
        """
        try:
            if ollama is None:
                raise RuntimeError("ollama package not installed")

            models = ollama.list()
            return models.get('models', []) if isinstance(models, dict) else []

        except Exception as e:
            logger.error(f"Error listing models: {e}")
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
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Evaluate a candidate's answer against the correct answer.

        Args:
            question: The question text
            correct_answer: Expected/correct answer
            candidate_answer: Candidate's answer
            max_marks: Maximum marks for this question
            model: Optional model override

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

            result = await self.generate_completion(
                prompt=user_prompt,
                model=model,
                system_prompt=system_prompt,
                temperature=0.2
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


# Singleton instance
_llm_orchestrator: Optional[LLMOrchestrator] = None


def get_llm_orchestrator() -> LLMOrchestrator:
    """Get the LLM orchestrator singleton."""
    global _llm_orchestrator
    if _llm_orchestrator is None:
        _llm_orchestrator = LLMOrchestrator()
    return _llm_orchestrator
