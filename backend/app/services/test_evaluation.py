"""
Test evaluation service for Round 2 - written test evaluation.
Handles question paper parsing, answer sheet processing, and automated grading.
"""
from typing import List, Dict, Optional, Any, Tuple
import logging
from datetime import datetime
from uuid import uuid4
import re
import json

from app.services.storage_service import get_storage_service
from app.services.document_processor import get_document_processor
from app.services.llm_orchestrator import get_llm_orchestrator
from app.db.supabase_client import get_supabase
from app.config import settings

logger = logging.getLogger(__name__)


def repair_json(text: str) -> str:
    """
    Repair common JSON formatting errors.

    Enhanced to handle:
    - Trailing commas in all positions
    - Multiple consecutive commas
    - Commas before closing with any whitespace combination

    Args:
        text: Potentially malformed JSON text

    Returns:
        Repaired JSON text
    """
    # Remove any leading/trailing whitespace
    text = text.strip()

    # Remove markdown code blocks if present
    if text.startswith('```'):
        if text.startswith('```json'):
            text = text[7:]
        else:
            text = text[3:]
        end_marker = text.find('```')
        if end_marker != -1:
            text = text[:end_marker]
        text = text.strip()

    # Fix common issues
    # 1. Remove ALL trailing commas before closing brackets/braces
    # This handles commas with any amount/type of whitespace
    text = re.sub(r',\s*([}\]])', r'\1', text)

    # 2. Remove multiple consecutive commas
    text = re.sub(r',\s*,+', ',', text)

    # 3. Fix missing commas between array elements (when there's a newline)
    text = re.sub(r'"\s*\n\s*"', '",\n"', text)
    text = re.sub(r'}\s*\n\s*{', '},\n{', text)

    # 4. Remove trailing commas at end of objects/arrays (catch-all)
    # This catches edge cases where comma is right before bracket
    text = re.sub(r',\s*([\]}])', r'\1', text)

    # 5. Ensure proper quote escaping in strings (simplified approach)
    # This is a basic safety net for simple cases

    return text


def extract_json_from_text(text: str) -> Optional[Dict]:
    """
    Extract and parse JSON from text, with multiple fallback strategies.

    Args:
        text: Text potentially containing JSON

    Returns:
        Parsed JSON dict or None if all attempts fail
    """
    # Strategy 1: Direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strategy 2: Remove markdown code blocks and try again
    try:
        cleaned = repair_json(text)
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Strategy 3: Find JSON object boundaries
    # Look for the first { and last }
    try:
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1 and end > start:
            json_text = text[start:end+1]
            cleaned = repair_json(json_text)
            return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Strategy 4: Try to find JSON array boundaries
    try:
        start = text.find('[')
        end = text.rfind(']')
        if start != -1 and end != -1 and end > start:
            json_text = text[start:end+1]
            cleaned = repair_json(json_text)
            # Wrap in object if it's just an array
            if isinstance(json.loads(cleaned), list):
                return {"answers": json.loads(cleaned)}
    except json.JSONDecodeError:
        pass

    # Strategy 5: Look for "answers" key and extract from there
    try:
        # Find the "answers" array
        answers_match = re.search(r'"answers"\s*:\s*\[', text)
        if answers_match:
            start = answers_match.start()
            # Find the matching closing bracket
            bracket_count = 0
            array_start = text.find('[', answers_match.end() - 1)
            i = array_start
            while i < len(text):
                if text[i] == '[':
                    bracket_count += 1
                elif text[i] == ']':
                    bracket_count -= 1
                    if bracket_count == 0:
                        json_text = '{' + text[start:i+1] + '}'
                        cleaned = repair_json(json_text)
                        return json.loads(cleaned)
                i += 1
    except (json.JSONDecodeError, AttributeError):
        pass

    logger.error(f"All JSON extraction strategies failed. Text preview: {text[:500]}")
    return None


class TestEvaluationService:
    """Service for automated test evaluation."""

    def __init__(self):
        """Initialize the test evaluation service."""
        self.storage = get_storage_service()
        self.doc_processor = get_document_processor()
        self.llm = get_llm_orchestrator()
        self.client = get_supabase()

    async def process_question_paper(
        self,
        file_data: bytes,
        filename: str,
        user_id: str,
        test_title: str,
        test_type: str,
        total_marks: float,
        duration_minutes: Optional[int] = None,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process a question paper and extract questions.

        Args:
            file_data: File content as bytes
            filename: Original filename
            user_id: User ID who uploaded the file
            test_title: Title of the test
            test_type: Type (development, testing, devops, etc.)
            total_marks: Total marks for the test
            duration_minutes: Test duration in minutes
            model: Optional LLM model override

        Returns:
            dict with test_id, questions, and metadata
        """
        try:
            # Validate file
            validation = await self.doc_processor.validate_file(
                file_data,
                filename,
                max_size=settings.MAX_UPLOAD_SIZE
            )

            if not validation['is_valid']:
                raise ValueError(f"File validation failed: {validation['errors']}")

            # Extract text from document
            extraction = await self.doc_processor.extract_text(
                file_data,
                filename,
                validation['file_type']
            )

            extracted_text = extraction['extracted_text']

            if not extracted_text or len(extracted_text.strip()) < 50:
                raise ValueError("Insufficient text content in question paper")

            # Upload file to storage
            storage_result = await self.storage.upload_file(
                file_data=file_data,
                filename=filename,
                bucket_type="test_papers",
                user_id=user_id,
                content_type=f"application/{validation['file_type']}"
            )

            # Parse questions using LLM (uses fast model - mistral:7b)
            questions_result = await self._parse_questions(
                extracted_text,
                total_marks,
                test_type=test_type,
                model=model
            )

            # Create test record
            test_data = {
                "id": str(uuid4()),
                "title": test_title,
                "test_type": test_type,
                "total_marks": total_marks,
                "duration_minutes": duration_minutes,
                "question_paper_path": storage_result['file_path'],
                "question_paper_name": filename,
                "created_by": user_id,
                "metadata": {
                    "file_type": validation['file_type'],
                    "file_size": validation['file_size'],
                    "extraction_metadata": extraction,
                    "total_questions": len(questions_result['questions']),
                    "model_used": questions_result.get('model_used')
                }
            }

            # Insert test into database
            self.client.table("tests").insert(test_data).execute()

            test_id = test_data['id']

            # Insert questions into database
            for idx, question in enumerate(questions_result['questions'], 1):
                question_data = {
                    "id": str(uuid4()),
                    "test_id": test_id,
                    "question_number": idx,
                    "question_text": question['question'],
                    "correct_answer": question.get('answer', ''),
                    "marks": question.get('marks', 0),
                    "question_type": question.get('type', 'descriptive'),
                    "metadata": {
                        "difficulty": question.get('difficulty', 'medium'),
                        "topics": question.get('topics', [])
                    }
                }
                self.client.table("questions").insert(question_data).execute()

            logger.info(f"Processed question paper: {test_id} with {len(questions_result['questions'])} questions")

            return {
                "test_id": test_id,
                "title": test_title,
                "extracted_text": extracted_text,
                "questions": questions_result['questions'],
                "total_questions": len(questions_result['questions']),
                "total_marks": total_marks,
                "file_info": storage_result,
                "metadata": test_data['metadata']
            }

        except Exception as e:
            logger.error(f"Error processing question paper: {e}")
            raise

    async def _parse_questions(
        self,
        text: str,
        total_marks: float,
        test_type: Optional[str] = None,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Parse questions from extracted text using LLM.

        Args:
            text: Extracted question paper text
            total_marks: Total marks for the test
            model: Optional LLM model override

        Returns:
            dict with parsed questions and metadata
        """
        try:
            system_prompt = """You are an expert at parsing test question papers.
Extract all questions from the given text and format them as a structured JSON array.
For each question, identify:
- question: The question text
- answer: Expected answer or answer key (if provided)
- marks: Marks allocated (if mentioned, otherwise estimate based on total marks)
- type: Question type (mcq, short_answer, descriptive, coding, etc.)
- difficulty: Estimated difficulty (easy, medium, hard)
- topics: Relevant topics/skills being tested

IMPORTANT: Return ONLY valid JSON. No additional text, no explanations.

Required JSON structure:
{
  "questions": [
    {
      "question": "question text here",
      "answer": "expected answer or key points",
      "marks": 10,
      "type": "descriptive",
      "difficulty": "medium",
      "topics": ["topic1", "topic2"]
    }
  ]
}

Rules:
1. Use double quotes for all strings
2. Escape any quotes in the text with backslash
3. No trailing commas
4. Return pure JSON only - no markdown, no code blocks, no extra text"""

            user_prompt = f"""Parse all questions from this test paper (Total marks: {total_marks}):

{text[:10000]}

Extract each question with its answer key, marks, type, and other details.
If marks are not specified, distribute the {total_marks} marks proportionally across questions.
Return ONLY the JSON object, nothing else."""

            # Use fast model for parsing (mistral:7b or llama2:7b)
            result = await self.llm.parse_with_fast_model(
                prompt=user_prompt,
                system_prompt=system_prompt,
                override_model=model  # Allow user override
            )

            # Parse JSON response with robust error handling
            response_text = result['response'].strip()

            # Log the raw response for debugging
            logger.info(f"LLM response for question parsing (first 500 chars): {response_text[:500]}")

            # Use robust JSON extraction
            parsed_data = extract_json_from_text(response_text)

            if parsed_data is None:
                raise ValueError("Failed to extract valid JSON from LLM response")

            questions = parsed_data.get('questions', [])

            # Validate question format
            for question in questions:
                if not isinstance(question, dict):
                    raise ValueError(f"Invalid question format: {question}")
                if 'question' not in question:
                    raise ValueError(f"Missing 'question' field in: {question}")

            # Validate and adjust marks if needed
            total_assigned_marks = sum(q.get('marks', 0) for q in questions)
            if total_assigned_marks != total_marks and questions:
                # Proportionally adjust marks
                scale_factor = total_marks / total_assigned_marks if total_assigned_marks > 0 else 1
                for q in questions:
                    q['marks'] = round(q.get('marks', 0) * scale_factor, 2)

            logger.info(f"Successfully parsed {len(questions)} questions")

            return {
                "questions": questions,
                "model_used": result['model'],
                "parsing_metadata": {
                    "total_questions": len(questions),
                    "total_marks": sum(q.get('marks', 0) for q in questions)
                }
            }

        except Exception as e:
            logger.error(f"Error parsing questions: {e}")
            logger.error(f"Response text that failed: {response_text if 'response_text' in locals() else 'N/A'}")
            # Return empty structure on error
            return {
                "questions": [],
                "error": f"Failed to parse questions: {str(e)}"
            }

    async def process_answer_sheet(
        self,
        file_data: bytes,
        filename: str,
        test_id: str,
        candidate_name: str,
        candidate_email: Optional[str] = None,
        user_id: Optional[str] = None,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process an answer sheet and evaluate answers.

        Args:
            file_data: File content as bytes
            filename: Original filename
            test_id: Test ID
            candidate_name: Candidate name
            candidate_email: Candidate email
            user_id: User ID who uploaded the file
            model: Optional LLM model override

        Returns:
            dict with answer_sheet_id, evaluations, and scores
        """
        try:
            # Validate file
            validation = await self.doc_processor.validate_file(
                file_data,
                filename,
                max_size=settings.MAX_UPLOAD_SIZE
            )

            if not validation['is_valid']:
                raise ValueError(f"File validation failed: {validation['errors']}")

            # Extract text from document
            extraction = await self.doc_processor.extract_text(
                file_data,
                filename,
                validation['file_type']
            )

            extracted_text = extraction['extracted_text']

            # Log extraction details for debugging
            logger.info(f"Extracted text length: {len(extracted_text) if extracted_text else 0} chars")
            logger.info(f"File type: {validation['file_type']}, OCR used: {extraction.get('ocr_used', False)}")
            if extracted_text:
                logger.info(f"First 200 chars: {extracted_text[:200]}")

            if not extracted_text or len(extracted_text.strip()) < 20:
                error_msg = f"Insufficient text content in answer sheet. "
                error_msg += f"Extracted {len(extracted_text.strip()) if extracted_text else 0} characters. "
                error_msg += f"File type: {validation['file_type']}. "
                if validation['file_type'] in ['jpg', 'jpeg', 'png']:
                    error_msg += "For image files, ensure they are clear and readable for OCR processing."
                raise ValueError(error_msg)

            # Upload file to storage
            storage_result = await self.storage.upload_file(
                file_data=file_data,
                filename=filename,
                bucket_type="answer_sheets",
                user_id=user_id or "system",
                content_type=f"application/{validation['file_type']}"
            )

            # Get test details (including test_type for model selection)
            test_result = self.client.table("tests").select("test_type").eq("id", test_id).single().execute()
            test_type = test_result.data.get('test_type') if test_result.data else None

            # Get test questions
            questions_result = self.client.table("questions").select(
                "*"
            ).eq("test_id", test_id).order("question_number").execute()

            if not questions_result.data:
                raise ValueError(f"No questions found for test {test_id}")

            questions = questions_result.data

            # Parse candidate answers
            parsed_answers = await self._parse_candidate_answers(
                extracted_text,
                questions,
                model=model
            )

            # Create answer sheet record
            answer_sheet_data = {
                "id": str(uuid4()),
                "test_id": test_id,
                "candidate_name": candidate_name,
                "candidate_email": candidate_email,
                "answer_sheet_path": storage_result['file_path'],
                "answer_sheet_name": filename,
                "submitted_by": user_id,
                "status": "evaluated",
                "metadata": {
                    "file_type": validation['file_type'],
                    "file_size": validation['file_size'],
                    "extraction_metadata": extraction
                }
            }

            self.client.table("answer_sheets").insert(answer_sheet_data).execute()

            answer_sheet_id = answer_sheet_data['id']

            # Evaluate each answer
            evaluations = []
            total_marks_obtained = 0

            for question, candidate_answer in zip(questions, parsed_answers['answers']):
                # Use HYBRID evaluation for maximum consistency:
                # - Deterministic scoring (keyword/pattern matching)
                # - Multi-run LLM evaluation (3 runs averaged)
                # - Weighted combination (30% deterministic + 70% LLM)
                evaluation = await self.llm.evaluate_answer_hybrid(
                    question=question['question_text'],
                    correct_answer=question['correct_answer'],
                    candidate_answer=candidate_answer['answer'],
                    max_marks=question['marks'],
                    model=model,
                    domain=test_type,  # Pass test_type to select appropriate model
                    num_runs=3  # Run LLM evaluation 3 times and average
                )

                marks_awarded = evaluation.get('marks_awarded', 0)
                total_marks_obtained += marks_awarded

                # Calculate is_correct and similarity_score
                max_marks = question['marks']
                percentage = (marks_awarded / max_marks * 100) if max_marks > 0 else 0
                is_correct = percentage >= 80  # Consider 80%+ as correct
                similarity_score = marks_awarded / max_marks if max_marks > 0 else 0

                # Store evaluation
                evaluation_data = {
                    "id": str(uuid4()),
                    "answer_sheet_id": answer_sheet_id,
                    "question_id": question['id'],
                    "candidate_answer": candidate_answer['answer'],
                    "marks_awarded": marks_awarded,
                    "is_correct": is_correct,
                    "similarity_score": similarity_score,
                    "feedback": evaluation.get('feedback', ''),
                    "key_points_covered": evaluation.get('key_points_covered', []),
                    "key_points_missed": evaluation.get('key_points_missed', []),
                    "evaluated_by_model": evaluation.get('model_used'),
                    "metadata": {
                        "max_marks": question['marks'],
                        "question_number": question['question_number'],
                        "reasoning": evaluation.get('reasoning', '')
                    }
                }

                self.client.table("answer_evaluations").insert(evaluation_data).execute()

                evaluations.append({
                    "question_number": question['question_number'],
                    "question": question['question_text'],
                    "candidate_answer": candidate_answer['answer'],
                    "marks_awarded": marks_awarded,
                    "max_marks": question['marks'],
                    "feedback": evaluation.get('feedback', ''),
                    "percentage": (marks_awarded / question['marks'] * 100) if question['marks'] > 0 else 0
                })

            # Get test total marks
            test_result = self.client.table("tests").select(
                "total_marks"
            ).eq("id", test_id).single().execute()

            total_marks = test_result.data['total_marks'] if test_result.data else 100

            # Update answer sheet with scores
            self.client.table("answer_sheets").update({
                "total_marks_obtained": total_marks_obtained,
                "percentage": (total_marks_obtained / total_marks * 100) if total_marks > 0 else 0
            }).eq("id", answer_sheet_id).execute()

            logger.info(f"Evaluated answer sheet: {answer_sheet_id} - Score: {total_marks_obtained}/{total_marks}")

            return {
                "answer_sheet_id": answer_sheet_id,
                "candidate_name": candidate_name,
                "test_id": test_id,
                "total_marks_obtained": total_marks_obtained,
                "total_marks": total_marks,
                "percentage": (total_marks_obtained / total_marks * 100) if total_marks > 0 else 0,
                "evaluations": evaluations,
                "file_info": storage_result,
                "summary": {
                    "questions_attempted": len([e for e in evaluations if e['candidate_answer'].strip()]),
                    "questions_total": len(evaluations),
                    "average_score_per_question": total_marks_obtained / len(evaluations) if evaluations else 0
                }
            }

        except Exception as e:
            logger.error(f"Error processing answer sheet: {e}")
            raise

    async def _parse_candidate_answers(
        self,
        text: str,
        questions: List[Dict],
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Parse candidate answers from answer sheet text.

        Args:
            text: Extracted answer sheet text
            questions: List of question objects
            model: Optional LLM model override

        Returns:
            dict with parsed answers
        """
        try:
            # Format questions for the prompt
            questions_text = "\n".join([
                f"Q{q['question_number']}: {q['question_text'][:200]}"
                for q in questions
            ])

            system_prompt = """You are an expert at parsing student answer sheets.
Extract the candidate's answers for each question from the given answer sheet text.
Match each answer to its corresponding question number.

IMPORTANT: Return ONLY valid JSON. No additional text, no explanations.

Required JSON structure:
{
  "answers": [
    {
      "question_number": 1,
      "answer": "candidate's answer text here"
    },
    {
      "question_number": 2,
      "answer": "candidate's answer text here"
    }
  ]
}

Rules:
1. Use double quotes for all strings
2. Escape any quotes in the answer text with backslash
3. No trailing commas
4. If an answer is not found, use empty string ""
5. Return pure JSON only - no markdown, no code blocks, no extra text"""

            user_prompt = f"""Parse candidate answers from this answer sheet:

QUESTIONS (for reference):
{questions_text}

ANSWER SHEET TEXT:
{text[:10000]}

Extract the candidate's answer for each question number.
Return ONLY the JSON object, nothing else."""

            result = await self.llm.generate_completion(
                prompt=user_prompt,
                model=model,
                system_prompt=system_prompt,
                temperature=0.1
            )

            # Parse JSON response with robust error handling
            response_text = result['response'].strip()

            # Log the raw response for debugging
            logger.info(f"LLM response for answer parsing (first 500 chars): {response_text[:500]}")

            # Use robust JSON extraction
            parsed_data = extract_json_from_text(response_text)

            if parsed_data is None:
                raise ValueError("Failed to extract valid JSON from LLM response")

            answers = parsed_data.get('answers', [])

            # Validate answer format
            for answer in answers:
                if not isinstance(answer, dict):
                    raise ValueError(f"Invalid answer format: {answer}")
                if 'question_number' not in answer or 'answer' not in answer:
                    raise ValueError(f"Missing required fields in answer: {answer}")

            # Ensure we have an answer for each question (even if empty)
            answer_dict = {a['question_number']: a['answer'] for a in answers}
            complete_answers = []

            for q in questions:
                complete_answers.append({
                    "question_number": q['question_number'],
                    "answer": answer_dict.get(q['question_number'], '')
                })

            logger.info(f"Successfully parsed {len(complete_answers)} answers")

            return {
                "answers": complete_answers,
                "model_used": result['model']
            }

        except Exception as e:
            logger.error(f"Error parsing candidate answers: {e}")
            logger.error(f"Response text that failed: {response_text if 'response_text' in locals() else 'N/A'}")

            # Return empty answers on error
            return {
                "answers": [
                    {"question_number": q['question_number'], "answer": ""}
                    for q in questions
                ],
                "error": f"Failed to parse answers: {str(e)}"
            }

    async def get_test_results(
        self,
        test_id: str,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get all results for a test, ranked by score.

        Args:
            test_id: Test ID
            limit: Maximum number of results

        Returns:
            List of answer sheets with scores
        """
        try:
            result = self.client.table("answer_sheets").select(
                "id, candidate_name, candidate_email, total_marks_obtained, percentage, status, submitted_at"
            ).eq("test_id", test_id).order(
                "percentage", desc=True
            ).limit(limit).execute()

            return result.data if result.data else []

        except Exception as e:
            logger.error(f"Error getting test results: {e}")
            raise

    async def get_test_statistics(self, test_id: str) -> Dict[str, Any]:
        """
        Get statistics for a test.

        Args:
            test_id: Test ID

        Returns:
            dict with statistics
        """
        try:
            # Get all answer sheets
            results = await self.get_test_results(test_id, limit=1000)

            if not results:
                return {
                    "total_submissions": 0,
                    "average_percentage": 0,
                    "highest_score": 0,
                    "lowest_score": 0,
                    "pass_rate": 0,
                    "passed_count": 0,
                    "failed_count": 0
                }

            percentages = [r['percentage'] for r in results if r.get('percentage') is not None]

            # Calculate pass rate (assuming 40% is passing)
            passing_threshold = 40
            passed = len([p for p in percentages if p >= passing_threshold])

            return {
                "total_submissions": len(results),
                "average_percentage": sum(percentages) / len(percentages) if percentages else 0,
                "highest_score": max(percentages) if percentages else 0,
                "lowest_score": min(percentages) if percentages else 0,
                "pass_rate": (passed / len(results) * 100) if results else 0,
                "passed_count": passed,
                "failed_count": len(results) - passed
            }

        except Exception as e:
            logger.error(f"Error getting test statistics: {e}")
            raise

    async def delete_answer_sheets(self, answer_sheet_ids: List[str]) -> Dict[str, Any]:
        """
        Delete multiple answer sheets by their IDs.

        Args:
            answer_sheet_ids: List of answer sheet IDs to delete

        Returns:
            dict with deleted_count and failed_ids
        """
        try:
            logger.info(f"Attempting to delete {len(answer_sheet_ids)} answer sheet(s): {answer_sheet_ids}")
            deleted_count = 0
            failed_ids = []

            for answer_sheet_id in answer_sheet_ids:
                try:
                    logger.info(f"Processing deletion for answer sheet: {answer_sheet_id}")

                    # Get answer sheet data before deletion
                    answer_sheet_result = self.client.table("answer_sheets").select(
                        "answer_sheet_path"
                    ).eq("id", answer_sheet_id).execute()

                    if answer_sheet_result.data and len(answer_sheet_result.data) > 0:
                        file_path = answer_sheet_result.data[0].get('answer_sheet_path')
                        logger.info(f"Found answer sheet {answer_sheet_id}, file_path: {file_path}")

                        # Delete evaluations first (foreign key constraint)
                        eval_result = self.client.table("answer_evaluations").delete().eq(
                            "answer_sheet_id", answer_sheet_id
                        ).execute()
                        logger.info(f"Deleted evaluations for answer sheet {answer_sheet_id}")

                        # Delete answer sheet from database
                        delete_result = self.client.table("answer_sheets").delete().eq(
                            "id", answer_sheet_id
                        ).execute()
                        logger.info(f"Deleted answer sheet from database: {answer_sheet_id}")

                        # Delete file from storage
                        if file_path:
                            try:
                                await self.storage.delete_file("answer_sheets", file_path)
                                logger.info(f"Deleted file: {file_path}")
                            except Exception as e:
                                logger.warning(f"Failed to delete file for answer sheet {answer_sheet_id}: {e}")

                        deleted_count += 1
                        logger.info(f"Successfully deleted answer sheet: {answer_sheet_id}")
                    else:
                        logger.warning(f"Answer sheet not found in database: {answer_sheet_id}")
                        failed_ids.append(answer_sheet_id)

                except Exception as e:
                    logger.error(f"Error deleting answer sheet {answer_sheet_id}: {e}", exc_info=True)
                    failed_ids.append(answer_sheet_id)

            logger.info(f"Delete operation completed. Deleted: {deleted_count}, Failed: {len(failed_ids)}")
            return {
                "deleted_count": deleted_count,
                "failed_ids": failed_ids
            }

        except Exception as e:
            logger.error(f"Error in delete_answer_sheets: {e}", exc_info=True)
            raise


# Singleton instance
_test_evaluation_service: Optional[TestEvaluationService] = None


def get_test_evaluation_service() -> TestEvaluationService:
    """Get the test evaluation service singleton."""
    global _test_evaluation_service
    if _test_evaluation_service is None:
        _test_evaluation_service = TestEvaluationService()
    return _test_evaluation_service
