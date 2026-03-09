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
        Uses more capable models (mistral-nemo:12b, codellama:7b) for better reasoning.

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

EVALUATION SCORING RULES (BE CONSISTENT):
1. If the core logic is CORRECT and solves the problem: Award 90-100% of marks
2. If the approach is correct but has minor syntax errors: Award 70-85% of marks
3. If the approach is partially correct: Award 50-65% of marks
4. If only the concept is understood but implementation is wrong: Award 30-45% of marks
5. If completely incorrect or no answer: Award 0-20% of marks

IMPORTANT CRITERIA:
- Focus ONLY on whether the core logic/solution is correct
- DO NOT penalize for missing usage examples, explanations, comments, or edge case handling
- Syntax errors (typos, case sensitivity) should result in minimal deduction (5-10%)
- Award marks based ONLY on correctness of the algorithm/logic

CRITICAL JSON FORMATTING:
- NO code snippets or code blocks in feedback
- NO newlines within JSON string values
- Keep feedback brief and text-only
- Use simple descriptions only

CONSISTENCY REQUIREMENT:
- Always use the same scoring for the same type of answer
- Be deterministic - same answer must always get same score

Return ONLY this JSON structure:
{
  "marks_awarded": <exact number>,
  "feedback": "<brief one-line text feedback>",
  "key_points_covered": ["point1", "point2"],
  "key_points_missed": ["point1"],
  "reasoning": "<single line scoring explanation>"
}"""

            user_prompt = f"""Evaluate this answer (max marks: {max_marks}):

QUESTION:
{question}

CORRECT ANSWER:
{correct_answer[:1000]}

CANDIDATE'S ANSWER:
{candidate_answer[:1000]}

Provide evaluation as JSON."""

            # Use capable model for evaluation (mistral-nemo:12b or codellama:7b for code)
            result = await self.evaluate_with_capable_model(
                prompt=user_prompt,
                domain=domain,
                system_prompt=system_prompt,
                override_model=model  # Allow user override
            )

            # Parse JSON response
            response_text = result['response'].strip()

            # Try to extract JSON from markdown code blocks
            # Only extract if the ENTIRE response is wrapped in code blocks (starts with ```)
            if response_text.startswith('```'):
                # Find the first code block
                if response_text.startswith('```json'):
                    response_text = response_text[7:]  # Remove ```json
                else:
                    response_text = response_text[3:]  # Remove ```
                # Find the closing ```
                end_marker = response_text.find('```')
                if end_marker != -1:
                    response_text = response_text[:end_marker].strip()

            # Try to parse JSON
            try:
                evaluation = json.loads(response_text)
            except json.JSONDecodeError:
                # Try cleaning common issues: escape newlines and other control characters
                import re
                # Replace literal newlines with escaped newlines in JSON strings
                cleaned_text = response_text.replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t')
                try:
                    evaluation = json.loads(cleaned_text)
                    logger.warning("JSON parsing succeeded after cleaning control characters")
                except json.JSONDecodeError:
                    # Still failed, re-raise original error
                    raise

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

    async def evaluate_answer_hybrid(
        self,
        question: str,
        correct_answer: str,
        candidate_answer: str,
        max_marks: float,
        model: Optional[str] = None,
        domain: Optional[str] = None,
        num_runs: int = 3
    ) -> Dict[str, Any]:
        """
        Evaluate answer using HYBRID approach for maximum consistency:
        1. Deterministic scoring (keyword + pattern matching)
        2. Multi-run LLM evaluation (run N times, average)
        3. Combine both with weighting

        Args:
            question: The question text
            correct_answer: Expected answer
            candidate_answer: Candidate's answer
            max_marks: Maximum marks
            model: Optional model override
            domain: Optional domain
            num_runs: Number of LLM runs to average (default: 3)

        Returns:
            dict with final_score, deterministic_score, llm_scores, etc.
        """
        try:
            # CRITICAL: Validate answer quality first
            # Award 0 marks for empty or invalid answers
            if self._is_answer_invalid(candidate_answer):
                logger.warning(f"Invalid/empty answer detected: '{candidate_answer[:50]}'")
                return {
                    "marks_awarded": 0.0,
                    "final_percentage": 0.0,
                    "deterministic_score": 0.0,
                    "deterministic_breakdown": {},
                    "llm_scores": [0.0],
                    "llm_average": 0.0,
                    "llm_std_dev": 0.0,
                    "consistency_score": 100.0,
                    "feedback": "No valid answer provided. Answer is empty or contains only gibberish/OCR errors.",
                    "key_points_covered": [],
                    "key_points_missed": ["All key points - no valid answer provided"],
                    "reasoning": "Automatic 0 marks - answer is empty or invalid",
                    "model_used": "validation_check"
                }

            from app.services.hybrid_scorer import get_hybrid_scorer

            hybrid_scorer = get_hybrid_scorer()

            # Step 1: Deterministic scoring (always same result)
            logger.info("Running deterministic scoring...")
            det_result = hybrid_scorer.score_code_answer(
                question, correct_answer, candidate_answer, max_marks
            )
            deterministic_score = det_result['deterministic_score']

            # Step 2: Multi-run LLM evaluation
            logger.info(f"Running LLM evaluation {num_runs} times...")
            llm_scores = []
            llm_results = []

            for run in range(num_runs):
                logger.info(f"  LLM run {run + 1}/{num_runs}")
                result = await self.evaluate_answer(
                    question, correct_answer, candidate_answer,
                    max_marks, model, domain
                )
                llm_scores.append(result.get('marks_awarded', 0))
                llm_results.append(result)

            # Calculate average LLM score
            avg_llm_score = sum(llm_scores) / len(llm_scores) if llm_scores else 0
            logger.info(f"LLM scores: {llm_scores}, Average: {avg_llm_score:.2f}")

            # Step 3: Combine deterministic and LLM scores
            final_result = hybrid_scorer.combine_with_llm_score(
                deterministic_score=deterministic_score,
                llm_score=avg_llm_score,
                max_marks=max_marks,
                weights=(0.3, 0.7)  # 30% deterministic, 70% LLM
            )

            # Return comprehensive result
            return {
                "marks_awarded": final_result['final_score'],
                "final_percentage": final_result['final_percentage'],
                "deterministic_score": deterministic_score,
                "deterministic_breakdown": det_result['breakdown'],
                "llm_scores": llm_scores,
                "llm_average": round(avg_llm_score, 2),
                "llm_std_dev": round(self._calculate_std_dev(llm_scores), 2),
                "consistency_score": round(100 - self._calculate_std_dev(llm_scores) / max_marks * 100, 1),
                "feedback": llm_results[0].get('feedback', ''),
                "key_points_covered": llm_results[0].get('key_points_covered', []),
                "key_points_missed": llm_results[0].get('key_points_missed', []),
                "reasoning": f"Hybrid: {final_result['deterministic_percentage']:.1f}% deterministic + {final_result['llm_percentage']:.1f}% LLM (avg of {num_runs} runs)",
                "model_used": llm_results[0].get('model_used', 'unknown'),
                "method": "hybrid_multi_run"
            }

        except Exception as e:
            logger.error(f"Error in hybrid evaluation: {e}")
            # Fallback to single LLM evaluation
            logger.warning("Falling back to single LLM evaluation")
            return await self.evaluate_answer(
                question, correct_answer, candidate_answer,
                max_marks, model, domain
            )

    def _is_answer_invalid(self, answer: str) -> bool:
        """
        Check if candidate answer is invalid (empty, gibberish, or OCR error).

        Returns True if answer should automatically get 0 marks.
        """
        if not answer or not answer.strip():
            return True

        answer_clean = answer.strip()

        # Check for explicit "EMPTY" marker
        if answer_clean.upper() == "EMPTY":
            return True

        # Check if answer is too short (likely gibberish or OCR error)
        if len(answer_clean) < 10:
            return True

        # Check for high ratio of non-alphanumeric characters (gibberish)
        alphanumeric_chars = sum(c.isalnum() or c.isspace() for c in answer_clean)
        total_chars = len(answer_clean)
        alphanumeric_ratio = alphanumeric_chars / total_chars if total_chars > 0 else 0

        # If less than 40% alphanumeric (excluding spaces), likely gibberish
        if alphanumeric_ratio < 0.4:
            return True

        # Check for OCR garbage patterns (random special characters)
        # e.g., "--erS :::-. [ 4 s ) 2...s f, I, !--"
        special_char_count = sum(not c.isalnum() and not c.isspace() for c in answer_clean)
        if special_char_count > len(answer_clean) * 0.5:  # More than 50% special chars
            return True

        return False

    def _calculate_std_dev(self, numbers: List[float]) -> float:
        """Calculate standard deviation of a list of numbers."""
        if len(numbers) < 2:
            return 0.0

        mean = sum(numbers) / len(numbers)
        variance = sum((x - mean) ** 2 for x in numbers) / len(numbers)
        return variance ** 0.5

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
            temperature=0.0  # Zero temperature for maximum consistency
        )

    async def extract_text_from_image_with_ocr(
        self,
        image_data: bytes,
        model: str = "glm-ocr:latest",
        num_runs: int = 3
    ) -> str:
        """
        Extract text from image using GLM-OCR with multi-run for consistency.
        Runs OCR multiple times and selects the best (longest) result.

        Args:
            image_data: Image data as bytes
            model: OCR model to use (default: glm-ocr:latest)
            num_runs: Number of OCR runs (default: 3 for consistency)

        Returns:
            Extracted text string (best result from multiple runs)
        """
        try:
            import base64

            if ollama is None:
                raise RuntimeError("ollama package not installed")

            # Encode image to base64
            image_base64 = base64.b64encode(image_data).decode('utf-8')

            logger.info(f"Extracting text from image using {model} ({num_runs} runs)...")

            # Run OCR multiple times
            all_results = []
            for run in range(num_runs):
                try:
                    # Use Ollama's vision model for OCR
                    response = ollama.generate(
                        model=model,
                        prompt="Extract all text from this image. Return only the extracted text, without any additional commentary or formatting.",
                        images=[image_base64],
                        options={
                            "temperature": 0.1,  # Low temperature for accurate OCR
                            "seed": 42 + run,  # Different seed for each run to get variations
                        }
                    )

                    extracted_text = response.get('response', '').strip()
                    if extracted_text:
                        all_results.append(extracted_text)
                        logger.info(f"  Run {run + 1}/{num_runs}: Extracted {len(extracted_text)} characters")
                    else:
                        logger.warning(f"  Run {run + 1}/{num_runs}: No text extracted")

                except Exception as e:
                    logger.warning(f"  Run {run + 1}/{num_runs}: Error - {e}")
                    continue

            if not all_results:
                logger.warning(f"No text extracted from image after {num_runs} attempts")
                return ""

            # Select the best result (longest text = most complete)
            best_result = max(all_results, key=len)

            # Log comparison
            lengths = [len(r) for r in all_results]
            logger.info(f"OCR results - Lengths: {lengths}, Best: {len(best_result)} chars")

            # Calculate consistency
            if len(all_results) > 1:
                avg_len = sum(lengths) / len(lengths)
                std_dev = (sum((l - avg_len) ** 2 for l in lengths) / len(lengths)) ** 0.5
                consistency = 100 - (std_dev / avg_len * 100) if avg_len > 0 else 0
                logger.info(f"OCR consistency: {consistency:.1f}% (std dev: {std_dev:.1f})")

            return best_result

        except Exception as e:
            logger.error(f"Error extracting text with GLM-OCR: {e}")
            raise RuntimeError(
                f"Failed to extract text using GLM-OCR. "
                f"Ensure the model is installed: ollama pull {model}\n"
                f"Error: {str(e)}"
            )

    async def extract_text_with_paddleocr_vl(
        self,
        image_data: bytes,
        model: str = None
    ) -> str:
        """
        Extract text from image using PaddleOCR-VL via Ollama.
        This is Layer 2 fallback after direct PaddleOCR library fails.

        Args:
            image_data: Image data as bytes
            model: OCR model to use (default: from config OLLAMA_OCR_MODEL)

        Returns:
            Extracted text string
        """
        try:
            import base64
            from app.config import settings

            if ollama is None:
                raise RuntimeError("ollama package not installed")

            # Use configured model or default
            if model is None:
                model = settings.OLLAMA_OCR_MODEL

            # Encode image to base64
            image_base64 = base64.b64encode(image_data).decode('utf-8')

            logger.info(f"🔄 Layer 2: Extracting text using {model}...")

            # Use Ollama's PaddleOCR-VL model for OCR
            response = ollama.generate(
                model=model,
                prompt="Extract all text from this image. Return only the extracted text, without any additional commentary or formatting.",
                images=[image_base64],
                options={
                    "temperature": 0.1,  # Low temperature for accurate OCR
                }
            )

            extracted_text = response.get('response', '').strip()

            if extracted_text:
                logger.info(f"✅ Layer 2: PaddleOCR-VL extracted {len(extracted_text)} characters")
            else:
                logger.warning("⚠️ Layer 2: PaddleOCR-VL extracted no text")

            return extracted_text

        except Exception as e:
            logger.error(f"❌ Layer 2 failed (PaddleOCR-VL): {e}")
            raise RuntimeError(
                f"Failed to extract text using PaddleOCR-VL. "
                f"Ensure the model is installed: ollama pull {model if model else 'MedAIBase/PaddleOCR-VL:0.9b'}\n"
                f"Error: {str(e)}"
            )
    async def evaluate_code_answer(
        self,
        question: str,
        candidate_answer: str,
        detected_language: str,
        max_marks: float,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Evaluate code answer WITHOUT a solution reference.
        AI evaluates based on:
        1. Question requirements
        2. Code correctness and logic
        3. Code quality and best practices
        4. Language detection accuracy

        Args:
            question: The question/problem statement
            candidate_answer: Candidate's code submission
            detected_language: Detected programming language
            max_marks: Maximum marks
            model: Optional model override

        Returns:
            dict with marks_awarded, feedback, etc.
        """
        try:
            # Validate answer
            if self._is_answer_invalid(candidate_answer):
                return {
                    "marks_awarded": 0.0,
                    "is_correct": False,
                    "similarity_score": 0.0,
                    "feedback": "No valid code provided.",
                    "key_points_covered": [],
                    "key_points_missed": ["All requirements - no valid code submitted"],
                    "code_quality_score": 0,
                    "model_used": "validation_check"
                }

            # Select model (CodeLlama for code evaluation)
            selected_model = model or self.get_model_for_task(
                task='answer_evaluation',
                domain='coding'
            )

            prompt = f"""You are an expert programming evaluator. Evaluate the following code submission.

**Question/Problem:**
{question}

**Candidate's Code (Language: {detected_language}):**
```{detected_language}
{candidate_answer}
```

**Evaluation Criteria:**
1. **Correctness** (40%): Does the code solve the problem correctly?
2. **Logic & Algorithm** (30%): Is the approach sound and efficient?
3. **Code Quality** (20%): Clean code, good variable names, readable?
4. **Best Practices** (10%): Follows language conventions and best practices?

**Instructions:**
- Award marks out of {max_marks} based on the above criteria
- Provide constructive feedback
- List what the code does well
- List what could be improved
- Give a code quality score (0-100)

**Response Format (JSON):**
{{
    "marks_awarded": <number out of {max_marks}>,
    "is_correct": <true/false>,
    "feedback": "<detailed feedback>",
    "key_points_covered": ["<strength 1>", "<strength 2>", ...],
    "key_points_missed": ["<issue 1>", "<issue 2>", ...],
    "code_quality_score": <0-100>,
    "reasoning": "<explanation of scoring>"
}}

Return ONLY valid JSON."""

            logger.info(f"Evaluating code with {selected_model} (language: {detected_language})")

            result_raw = await self.generate_completion(
                prompt=prompt,
                model=selected_model,
                temperature=0.2,
                max_tokens=1000
            )
            response = result_raw.get('response', '')

            # Parse JSON response
            import json
            import re

            # Try to extract JSON from response
            json_match = re.search(r'\{.*\}', response, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
            else:
                # Fallback if no JSON found - award 0, flag for manual review
                logger.warning("No JSON in response, awarding 0 marks for manual review")
                result = {
                    "marks_awarded": 0,
                    "is_correct": False,
                    "feedback": "Code submitted but evaluation parsing failed. Manual review required.",
                    "key_points_covered": [],
                    "key_points_missed": ["Evaluation incomplete - manual review required"],
                    "code_quality_score": 0,
                    "reasoning": "Evaluation parsing failed - 0 marks awarded pending manual review"
                }

            # Add model info
            result['model_used'] = selected_model
            result['similarity_score'] = result.get('code_quality_score', 50) / 100.0

            logger.info(f"Evaluation complete: {result['marks_awarded']}/{max_marks} marks")

            return result

        except Exception as e:
            logger.error(f"Error evaluating code: {e}")
            # Return 0 marks on error - do not award partial credit for unverified code
            return {
                "marks_awarded": 0,
                "is_correct": False,
                "similarity_score": 0.0,
                "feedback": f"Evaluation error: {str(e)}. Manual review required.",
                "key_points_covered": [],
                "key_points_missed": ["Full evaluation incomplete - manual review required"],
                "code_quality_score": 0,
                "model_used": model or "error"
            }


# Singleton instance
_llm_orchestrator: Optional[LLMOrchestrator] = None


def get_llm_orchestrator() -> LLMOrchestrator:
    """Get the LLM orchestrator singleton."""
    global _llm_orchestrator
    if _llm_orchestrator is None:
        _llm_orchestrator = LLMOrchestrator()
    return _llm_orchestrator
