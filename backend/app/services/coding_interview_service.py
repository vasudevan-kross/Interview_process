"""
Coding Interview Service - Core business logic for coding and testing/QA interviews.

Provides functionality for:
- Creating time-bound interviews with shareable links
- Managing questions (AI-generated or manual)
- Tracking candidate submissions with anti-cheating
- LLM-based code evaluation
- Resume upload integration
"""

import os
import uuid
import hashlib
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from collections import deque

from app.db.supabase_client import get_supabase
from app.services.llm_orchestrator import get_llm_orchestrator
from app.services.hybrid_scorer import HybridScorer

logger = logging.getLogger(__name__)


# Test framework starter code templates
TEST_FRAMEWORK_TEMPLATES = {
    'selenium-python': """from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

class TestAutomation:
    def setup_method(self):
        self.driver = webdriver.Chrome()

    def test_scenario(self):
        # Write your test code here
        pass

    def teardown_method(self):
        self.driver.quit()
""",
    'playwright-js': """const { test, expect } = require('@playwright/test');

test.describe('Test Suite', () => {
  test('test scenario', async ({ page }) => {
    // Write your test code here
  });
});
""",
    'cypress-js': """describe('Test Suite', () => {
  beforeEach(() => {
    cy.visit('https://example.com');
  });

  it('test scenario', () => {
    // Write your test code here
  });
});
""",
    'pytest': """import pytest

class TestSuite:
    def setup_method(self):
        # Setup code
        pass

    def test_scenario(self):
        # Write your test code here
        pass

    def teardown_method(self):
        # Cleanup code
        pass
""",
    'manual-test-cases': """# Test Case Template

**Test Case ID**: TC001
**Test Scenario**: [Describe the scenario]
**Pre-conditions**: [List prerequisites]

**Test Steps**:
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Result**: [Describe expected outcome]
**Actual Result**: [To be filled during execution]
**Status**: [Pass/Fail]
""",
    'python': """def solution():
    # Write your code here
    pass
""",
    'javascript': """function solution() {
    // Write your code here
}
""",
    'java': """public class Solution {
    public static void main(String[] args) {
        // Write your code here
    }
}
"""
}


class CodingInterviewService:
    """Service for managing coding and testing interviews."""

    def __init__(self):
        self.client = get_supabase()
        self.hybrid_scorer = HybridScorer()
        # Activity buffer for batch inserts (optimization)
        self.activity_buffer = deque(maxlen=10)

    async def create_interview(
        self,
        title: str,
        description: str,
        scheduled_start_time: datetime,
        scheduled_end_time: datetime,
        programming_language: str,
        interview_type: str,
        questions_data: List[Dict[str, Any]],
        user_id: str,
        grace_period_minutes: int = 15,
        resume_required: str = 'mandatory',
        allowed_languages: Optional[List[str]] = None,
        total_marks: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Create a new coding interview with questions.

        Args:
            title: Interview title
            description: Interview description
            scheduled_start_time: When interview starts
            scheduled_end_time: When interview ends
            programming_language: Language/framework (deprecated, for backward compatibility)
            interview_type: 'coding', 'testing', or 'both'
            questions_data: List of question dicts with question_text, marks, etc.
            user_id: Creator's user ID
            grace_period_minutes: Grace period after end time (default: 15 min)
            resume_required: Resume upload setting ('mandatory', 'optional', 'disabled')
            allowed_languages: List of languages candidates can choose from (default: [programming_language])
            total_marks: Total marks (auto-calculated if not provided)

        Returns:
            dict with interview_id, access_token, link_expires_at, questions
        """
        try:
            # Generate unique access token
            access_token = str(uuid.uuid4())

            # Calculate link expiration
            link_expires_at = scheduled_end_time + timedelta(minutes=grace_period_minutes)

            # Calculate total marks if not provided
            if total_marks is None:
                total_marks = sum(q.get('marks', 0) for q in questions_data)

            # Set default allowed_languages if not provided
            # Note: None means not specified (default to programming_language)
            #       Empty list [] means ANY language allowed (no restrictions)
            if allowed_languages is None:
                allowed_languages = [programming_language]

            logger.info(f"Creating interview: {title} ({interview_type})")

            # Create interview record
            interview_data = {
                'title': title,
                'description': description,
                'scheduled_start_time': scheduled_start_time.isoformat(),
                'scheduled_end_time': scheduled_end_time.isoformat(),
                'grace_period_minutes': grace_period_minutes,
                'status': 'scheduled',
                'access_token': access_token,
                'link_expires_at': link_expires_at.isoformat(),
                'interview_type': interview_type,
                'programming_language': programming_language,
                'allowed_languages': allowed_languages,
                'total_marks': total_marks,
                'resume_required': resume_required,
                'created_by': user_id
            }

            interview_result = self.client.table('coding_interviews').insert(interview_data).execute()

            if not interview_result.data or len(interview_result.data) == 0:
                raise RuntimeError("Failed to create interview")

            interview_id = interview_result.data[0]['id']
            logger.info(f"Created interview {interview_id}")

            # Create questions
            created_questions = []
            for idx, question in enumerate(questions_data):
                question_data = {
                    'interview_id': interview_id,
                    'question_number': idx + 1,
                    'question_text': question['question_text'],
                    'difficulty': question.get('difficulty', 'medium'),
                    'marks': question['marks'],
                    'starter_code': question.get('starter_code', TEST_FRAMEWORK_TEMPLATES.get(programming_language, '')),
                    'solution_code': question.get('solution_code'),
                    'test_cases': question.get('test_cases'),
                    'topics': question.get('topics', []),
                    'time_estimate_minutes': question.get('time_estimate_minutes')
                }

                question_result = self.client.table('coding_questions').insert(question_data).execute()

                if question_result.data and len(question_result.data) > 0:
                    created_questions.append(question_result.data[0])

            logger.info(f"Created {len(created_questions)} questions for interview {interview_id}")

            return {
                'interview_id': interview_id,
                'access_token': access_token,
                'link_expires_at': link_expires_at.isoformat(),
                'shareable_link': f"/interview/{access_token}",
                'questions': created_questions,
                'total_marks': total_marks
            }

        except Exception as e:
            logger.error(f"Error creating interview: {e}")
            raise

    async def get_interview_by_token(self, access_token: str) -> Dict[str, Any]:
        """
        Get interview details for candidate join link.

        Args:
            access_token: Unique access token from shareable link

        Returns:
            dict with interview details and questions (without solutions)

        Raises:
            ValueError: If token is invalid or expired
        """
        try:
            # Get interview
            interview_result = self.client.table('coding_interviews').select(
                '*'
            ).eq('access_token', access_token).execute()

            if not interview_result.data or len(interview_result.data) == 0:
                raise ValueError("Invalid interview link")

            interview = interview_result.data[0]

            # Check if expired
            link_expires_at = datetime.fromisoformat(interview['link_expires_at'].replace('Z', '+00:00'))
            if datetime.now(link_expires_at.tzinfo) > link_expires_at:
                raise ValueError("Interview link has expired")

            # Get questions (without solution_code)
            questions_result = self.client.table('coding_questions').select(
                'id', 'question_number', 'question_text', 'difficulty', 'marks',
                'starter_code', 'topics', 'time_estimate_minutes'
            ).eq('interview_id', interview['id']).order('question_number').execute()

            interview['questions'] = questions_result.data if questions_result.data else []

            # Don't expose access_token in response
            del interview['access_token']

            return interview

        except ValueError:
            raise
        except Exception as e:
            logger.error(f"Error getting interview by token: {e}")
            raise

    async def start_submission(
        self,
        interview_id: str,
        candidate_name: str,
        candidate_email: str,
        candidate_phone: Optional[str],
        ip_address: str,
        user_agent: str,
        preferred_language: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Initialize candidate session.

        Args:
            interview_id: Interview ID
            candidate_name: Candidate's name
            candidate_email: Candidate's email
            candidate_phone: Candidate's phone (optional)
            ip_address: Client IP address
            user_agent: Client user agent
            preferred_language: Programming language chosen by candidate

        Returns:
            dict with submission_id and interview details

        Raises:
            ValueError: If time window validation fails or duplicate submission or invalid language
        """
        try:
            # Get interview
            interview_result = self.client.table('coding_interviews').select('*').eq(
                'id', interview_id
            ).execute()

            if not interview_result.data or len(interview_result.data) == 0:
                raise ValueError("Interview not found")

            interview = interview_result.data[0]

            # Validate time window
            # Note: Times are stored as local time (frontend sends without timezone)
            now = datetime.now()
            
            # Parse timestamps - strip any timezone suffix since we compare as local time
            start_str = interview['scheduled_start_time'].replace('Z', '').replace('+00:00', '')
            expires_str = interview['link_expires_at'].replace('Z', '').replace('+00:00', '')
            scheduled_start = datetime.fromisoformat(start_str)
            link_expires_at = datetime.fromisoformat(expires_str)

            logger.info(f"Time check: now={now}, start={scheduled_start}, expires={link_expires_at}")

            if now < scheduled_start:
                raise ValueError(f"Interview has not started yet. Starts at {scheduled_start}")

            if now > link_expires_at:
                raise ValueError("Interview time window has expired")

            # Validate preferred language
            allowed_languages = interview.get('allowed_languages', [interview.get('programming_language', 'python')])

            # If no languages specified, allow ANY language (unrestricted)
            if not allowed_languages or len(allowed_languages) == 0:
                # No restrictions - candidate can use any language
                if not preferred_language:
                    preferred_language = 'python'  # Default fallback
            else:
                # Languages are restricted - validate candidate's choice
                if not preferred_language:
                    # Default to first allowed language
                    preferred_language = allowed_languages[0]
                elif preferred_language not in allowed_languages:
                    raise ValueError(f"Language '{preferred_language}' is not allowed for this interview. Allowed: {', '.join(allowed_languages)}")

            # Check for duplicate submission
            existing_result = self.client.table('coding_submissions').select('id').eq(
                'interview_id', interview_id
            ).eq('candidate_email', candidate_email).execute()

            if existing_result.data and len(existing_result.data) > 0:
                raise ValueError("You have already started this interview")

            # Create submission
            submission_data = {
                'interview_id': interview_id,
                'candidate_name': candidate_name,
                'candidate_email': candidate_email,
                'candidate_phone': candidate_phone,
                'started_at': now.isoformat(),
                'status': 'in_progress',
                'ip_address': ip_address,
                'user_agent': user_agent,
                'preferred_language': preferred_language
            }

            submission_result = self.client.table('coding_submissions').insert(submission_data).execute()

            if not submission_result.data or len(submission_result.data) == 0:
                raise RuntimeError("Failed to create submission")

            submission_id = submission_result.data[0]['id']
            logger.info(f"Started submission {submission_id} for {candidate_name}")

            # Update interview status to in_progress if not already
            if interview['status'] == 'scheduled':
                self.client.table('coding_interviews').update({
                    'status': 'in_progress',
                    'started_at': now.isoformat()
                }).eq('id', interview_id).execute()

            return {
                'submission_id': submission_id,
                'interview': interview,
                'time_remaining_seconds': int((link_expires_at - now).total_seconds())
            }

        except ValueError:
            raise
        except Exception as e:
            logger.error(f"Error starting submission: {e}")
            raise

    async def save_code(
        self,
        submission_id: str,
        question_id: str,
        code: str,
        programming_language: str
    ) -> Dict[str, Any]:
        """
        Auto-save code periodically (every 30 seconds).
        Uses hash-based change detection to avoid unnecessary DB writes.

        Args:
            submission_id: Submission ID
            question_id: Question ID
            code: Code to save
            programming_language: Language/framework

        Returns:
            dict with status ('saved' or 'unchanged')
        """
        try:
            # Calculate code hash
            code_hash = hashlib.sha256(code.encode()).hexdigest()

            # Check if code changed (get existing answer)
            existing_result = self.client.table('coding_answers').select(
                'id', 'submitted_code'
            ).eq('submission_id', submission_id).eq('question_id', question_id).execute()

            if existing_result.data and len(existing_result.data) > 0:
                existing_code = existing_result.data[0]['submitted_code'] or ''
                existing_hash = hashlib.sha256(existing_code.encode()).hexdigest()

                if code_hash == existing_hash:
                    return {'status': 'unchanged'}

            # Upsert answer
            answer_data = {
                'submission_id': submission_id,
                'question_id': question_id,
                'submitted_code': code,
                'programming_language': programming_language
            }

            # Try insert first, update on conflict
            self.client.table('coding_answers').upsert(
                answer_data,
                on_conflict='submission_id,question_id'
            ).execute()

            logger.debug(f"Saved code for submission {submission_id}, question {question_id}")

            return {'status': 'saved', 'code_length': len(code)}

        except Exception as e:
            logger.error(f"Error saving code: {e}")
            raise

    async def submit_interview(
        self,
        submission_id: str,
        auto_submit: bool = False
    ) -> Dict[str, Any]:
        """
        Finalize submission and trigger evaluation.

        Args:
            submission_id: Submission ID
            auto_submit: Whether this is auto-submit (grace period expired)

        Returns:
            dict with submission details and evaluation status
        """
        try:
            # Get submission
            submission_result = self.client.table('coding_submissions').select(
                '*'
            ).eq('id', submission_id).execute()

            if not submission_result.data or len(submission_result.data) == 0:
                raise ValueError("Submission not found")

            submission = submission_result.data[0]

            # Calculate duration
            started_str = submission['started_at'].replace('Z', '').replace('+00:00', '')
            started_at = datetime.fromisoformat(started_str)
            submitted_at = datetime.now()
            duration_seconds = int((submitted_at - started_at).total_seconds())

            # Get interview to check grace period
            interview_result = self.client.table('coding_interviews').select(
                'link_expires_at'
            ).eq('id', submission['interview_id']).execute()

            expires_str = interview_result.data[0]['link_expires_at'].replace('Z', '').replace('+00:00', '')
            link_expires_at = datetime.fromisoformat(expires_str)
            late_submission = submitted_at > link_expires_at

            # Update submission
            update_data = {
                'submitted_at': submitted_at.isoformat(),
                'status': 'auto_submitted' if auto_submit else 'submitted',
                'session_duration_seconds': duration_seconds,
                'late_submission': late_submission
            }

            self.client.table('coding_submissions').update(update_data).eq(
                'id', submission_id
            ).execute()

            logger.info(f"Submitted interview {submission_id} ({'auto' if auto_submit else 'manual'})")

            # Trigger evaluation (async, don't wait)
            # Note: In production, use background task queue (Celery/Redis)
            try:
                await self.evaluate_submission(submission_id)
            except Exception as eval_error:
                logger.error(f"Evaluation failed for {submission_id}: {eval_error}")

            # Check for suspicious activity
            await self.check_suspicious_activity(submission_id)

            return {
                'submission_id': submission_id,
                'status': 'submitted',
                'duration_seconds': duration_seconds,
                'late_submission': late_submission
            }

        except ValueError:
            raise
        except Exception as e:
            logger.error(f"Error submitting interview: {e}")
            raise

    async def evaluate_submission(self, submission_id: str) -> Dict[str, Any]:
        """
        Evaluate all coding answers using LLM.

        Uses hybrid scoring:
        - Deterministic code analysis (HybridScorer)
        - LLM semantic evaluation (llm_orchestrator)
        - Combined weighted score

        Args:
            submission_id: Submission ID

        Returns:
            dict with total_marks_obtained, percentage, evaluations
        """
        try:
            logger.info(f"Evaluating submission {submission_id}")

            # Get submission
            submission_result = self.client.table('coding_submissions').select(
                '*'
            ).eq('id', submission_id).execute()

            if not submission_result.data:
                raise ValueError("Submission not found")

            submission = submission_result.data[0]

            # Get interview to get total marks
            interview_result = self.client.table('coding_interviews').select(
                'total_marks'
            ).eq('id', submission['interview_id']).execute()

            total_marks = interview_result.data[0]['total_marks']

            # Get all questions
            questions_result = self.client.table('coding_questions').select(
                '*'
            ).eq('interview_id', submission['interview_id']).order('question_number').execute()

            questions = questions_result.data

            # Get all answers
            answers_result = self.client.table('coding_answers').select(
                '*'
            ).eq('submission_id', submission_id).execute()

            answers_dict = {a['question_id']: a for a in (answers_result.data or [])}

            total_marks_obtained = 0
            evaluations = []

            llm = get_llm_orchestrator()

            for question in questions:
                answer = answers_dict.get(question['id'])

                if not answer or not answer.get('submitted_code'):
                    # No answer submitted - 0 marks
                    evaluation_data = {
                        'submission_id': submission_id,
                        'question_id': question['id'],
                        'submitted_code': '',
                        'programming_language': question.get('programming_language', 'python'),
                        'marks_awarded': 0,
                        'is_correct': False,
                        'similarity_score': 0,
                        'feedback': 'No answer submitted',
                        'key_points_covered': [],
                        'key_points_missed': [],
                        'code_quality_score': 0,
                        'evaluated_at': datetime.now().isoformat(),
                        'evaluated_by_model': 'system'
                    }

                    self.client.table('coding_answers').update(evaluation_data).eq(
                        'id', answer['id'] if answer else None
                    ).execute()

                    evaluations.append(evaluation_data)
                    continue

                # Evaluate using hybrid approach
                try:
                    # Use LLM evaluation
                    llm_result = await llm.evaluate_answer_hybrid(
                        question=question['question_text'],
                        correct_answer=question.get('solution_code', ''),
                        candidate_answer=answer['submitted_code'],
                        max_marks=question['marks'],
                        num_runs=1  # Single run for speed
                    )

                    marks_awarded = llm_result.get('marks_awarded', 0)
                    is_correct = llm_result.get('is_correct', False)
                    similarity_score = llm_result.get('similarity_score', 0)

                    evaluation_data = {
                        'marks_awarded': marks_awarded,
                        'is_correct': is_correct,
                        'similarity_score': similarity_score,
                        'feedback': llm_result.get('feedback', ''),
                        'key_points_covered': llm_result.get('key_points_covered', []),
                        'key_points_missed': llm_result.get('key_points_missed', []),
                        'code_quality_score': llm_result.get('code_quality_score', 0),
                        'evaluated_at': datetime.now().isoformat(),
                        'evaluated_by_model': llm_result.get('model_used', 'codellama:7b')
                    }

                    self.client.table('coding_answers').update(evaluation_data).eq(
                        'id', answer['id']
                    ).execute()

                    total_marks_obtained += marks_awarded
                    evaluations.append({**evaluation_data, 'question_id': question['id']})

                    logger.info(
                        f"Evaluated Q{question['question_number']}: "
                        f"{marks_awarded}/{question['marks']} marks"
                    )

                except Exception as eval_error:
                    logger.error(f"Error evaluating question {question['id']}: {eval_error}")
                    continue

            # Calculate percentage
            percentage = (total_marks_obtained / total_marks * 100) if total_marks > 0 else 0

            # Update submission with final scores
            self.client.table('coding_submissions').update({
                'total_marks_obtained': total_marks_obtained,
                'percentage': round(percentage, 2)
            }).eq('id', submission_id).execute()

            logger.info(
                f"Evaluation complete for {submission_id}: "
                f"{total_marks_obtained}/{total_marks} ({percentage:.2f}%)"
            )

            return {
                'submission_id': submission_id,
                'total_marks_obtained': total_marks_obtained,
                'total_marks': total_marks,
                'percentage': round(percentage, 2),
                'evaluations': evaluations
            }

        except Exception as e:
            logger.error(f"Error evaluating submission: {e}")
            raise

    async def track_activity(
        self,
        submission_id: str,
        activity_type: str,
        question_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Log anti-cheating events.
        Uses batch insert for optimization.

        Args:
            submission_id: Submission ID
            activity_type: Activity type (tab_switch, copy, paste, etc.)
            question_id: Question ID (optional)
            metadata: Additional metadata
        """
        try:
            # Validate question_id is a proper UUID (frontend may send index numbers as fallback)
            valid_question_id = question_id
            if question_id:
                try:
                    uuid.UUID(question_id)
                except ValueError:
                    valid_question_id = None

            activity_data = {
                'submission_id': submission_id,
                'activity_type': activity_type,
                'question_id': valid_question_id,
                'metadata': metadata or {},
                'timestamp': datetime.now().isoformat()
            }

            # Add to buffer
            self.activity_buffer.append(activity_data)

            # Batch insert when buffer is full
            if len(self.activity_buffer) >= 10:
                await self._flush_activity_buffer()

        except Exception as e:
            logger.error(f"Error tracking activity: {e}")

    async def _flush_activity_buffer(self):
        """Flush activity buffer to database."""
        if not self.activity_buffer:
            return

        try:
            activities = list(self.activity_buffer)
            self.client.table('session_activities').insert(activities).execute()
            self.activity_buffer.clear()
            logger.debug(f"Flushed {len(activities)} activities to database")
        except Exception as e:
            logger.error(f"Error flushing activity buffer: {e}")

    async def check_suspicious_activity(self, submission_id: str):
        """
        Analyze session_activities for suspicious patterns.

        Flags:
        - More than 10 tab switches
        - More than 5 paste events with >50 chars each
        - Total paste length > 500 chars
        """
        try:
            # Get all activities
            activities_result = self.client.table('session_activities').select(
                '*'
            ).eq('submission_id', submission_id).execute()

            activities = activities_result.data or []

            tab_switches = [a for a in activities if a['activity_type'] == 'tab_switch']
            pastes = [a for a in activities if a['activity_type'] == 'paste']

            suspicious = False
            flags = []

            # Check tab switches
            if len(tab_switches) > 10:
                suspicious = True
                flags.append(f"Excessive tab switching ({len(tab_switches)} times)")
                logger.warning(f"Submission {submission_id}: Excessive tab switching")

            # Check paste events
            if len(pastes) > 5:
                total_paste_length = sum(
                    p.get('metadata', {}).get('paste_length', 0) for p in pastes
                )
                if total_paste_length > 500:
                    suspicious = True
                    flags.append(f"Large paste volume ({total_paste_length} chars)")
                    logger.warning(f"Submission {submission_id}: Large paste volume")

            # Update submission if suspicious
            if suspicious:
                self.client.table('coding_submissions').update({
                    'suspicious_activity': True,
                    'metadata': {'flags': flags}
                }).eq('id', submission_id).execute()

                logger.warning(f"Flagged submission {submission_id} as suspicious: {flags}")

        except Exception as e:
            logger.error(f"Error checking suspicious activity: {e}")


# Singleton instance
_coding_interview_service: Optional[CodingInterviewService] = None


def get_coding_interview_service() -> CodingInterviewService:
    """Get the coding interview service singleton."""
    global _coding_interview_service
    if _coding_interview_service is None:
        _coding_interview_service = CodingInterviewService()
    return _coding_interview_service
