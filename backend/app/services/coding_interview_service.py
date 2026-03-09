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
from app.config import settings

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
        total_marks: Optional[int] = None,
        bond_terms: Optional[str] = None,
        bond_document_url: Optional[str] = None,
        require_signature: bool = False,
        bond_years: int = 2,
        bond_timing: str = 'before_submission'
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
            # Note: duration_minutes is calculated dynamically from scheduled times (not stored)
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
                'bond_terms': bond_terms,
                'bond_document_url': bond_document_url,
                'require_signature': require_signature,
                'bond_years': bond_years,
                'bond_timing': bond_timing,
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

            # Generate full shareable link using FRONTEND_URL
            shareable_link = f"{settings.FRONTEND_URL}/interview/{access_token}"

            return {
                'interview_id': interview_id,
                'access_token': access_token,
                'link_expires_at': link_expires_at.isoformat(),
                'shareable_link': shareable_link,
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

            # Calculate duration_minutes dynamically from scheduled times
            try:
                start_time = datetime.fromisoformat(interview['scheduled_start_time'].replace('Z', '+00:00'))
                end_time = datetime.fromisoformat(interview['scheduled_end_time'].replace('Z', '+00:00'))
                interview['duration_minutes'] = int((end_time - start_time).total_seconds() / 60)
            except (ValueError, KeyError, TypeError):
                interview['duration_minutes'] = None

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
        auto_submit: bool = False,
        signature_data: Optional[str] = None,
        terms_accepted: bool = False,
        client_ip: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Finalize submission and trigger evaluation.

        Args:
            submission_id: Submission ID
            auto_submit: Whether this is auto-submit (grace period expired)
            signature_data: Base64 encoded signature image (optional)
            terms_accepted: Whether candidate accepted bond terms
            client_ip: IP address of the client (for audit trail)

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

            # Get interview to check grace period and bond requirement
            interview_result = self.client.table('coding_interviews').select(
                'link_expires_at, require_signature'
            ).eq('id', submission['interview_id']).execute()

            interview = interview_result.data[0]
            expires_str = interview['link_expires_at'].replace('Z', '').replace('+00:00', '')
            link_expires_at = datetime.fromisoformat(expires_str)
            late_submission = submitted_at > link_expires_at

            # Validate signature if required
            if interview.get('require_signature') and not auto_submit:
                if not signature_data or not terms_accepted:
                    raise ValueError("Signature and terms acceptance are required for this interview")

            # Update submission
            update_data = {
                'submitted_at': submitted_at.isoformat(),
                'status': 'auto_submitted' if auto_submit else 'submitted',
                'session_duration_seconds': duration_seconds,
                'late_submission': late_submission
            }

            # Add signature data if provided
            if signature_data:
                update_data['signature_data'] = signature_data
                update_data['signature_accepted_at'] = submitted_at.isoformat()
                update_data['terms_ip_address'] = client_ip

            self.client.table('coding_submissions').update(update_data).eq(
                'id', submission_id
            ).execute()

            logger.info(f"Submitted interview {submission_id} ({'auto' if auto_submit else 'manual'}) with signature: {bool(signature_data)}")

            # NOTE: Evaluation is NOT triggered during submission.
            # Trigger it later from the dashboard via the re-evaluate endpoint.

            return {
                'submission_id': submission_id,
                'status': 'submitted',
                'duration_seconds': duration_seconds,
                'late_submission': late_submission,
                'signature_accepted': bool(signature_data)
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
                    submitted_code = answer['submitted_code']

                    # Detect programming language from submitted code
                    detected_language = await self._detect_programming_language(submitted_code)

                    # Use LLM evaluation WITHOUT solution code
                    # AI will evaluate based on question requirements and code quality
                    llm_result = await llm.evaluate_code_answer(
                        question=question['question_text'],
                        candidate_answer=submitted_code,
                        detected_language=detected_language,
                        max_marks=question['marks']
                    )

                    marks_awarded = llm_result.get('marks_awarded', 0)
                    is_correct = llm_result.get('is_correct', False)
                    similarity_score = llm_result.get('similarity_score', 0)

                    evaluation_data = {
                        'marks_awarded': marks_awarded,
                        'is_correct': is_correct,
                        'similarity_score': similarity_score,
                        'programming_language': detected_language,  # Store detected language
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

    async def get_submission_risk_score(self, submission_id: str) -> Dict[str, Any]:
        """
        Calculate comprehensive risk score for a submission based on all activities.

        Returns:
            dict with:
            - total_risk_score (int): Sum of all risk points
            - risk_level (str): 'low', 'medium', 'high', 'critical'
            - activity_counts (dict): Count of each activity type
            - high_risk_activities (list): List of concerning activities
            - flagged_events (list): Specific flagged events with details
        """
        # Risk score per activity type
        ACTIVITY_RISK_SCORES = {
            'tab_switch': 5,
            'window_blur': 3,
            'window_focus': 1,  # Low risk, normal behavior
            'copy': 10,
            'paste': 10,
            'code_change': 0,  # Normal activity
            'device_fingerprint': 0,  # Informational only
            'devtools': 50,  # High risk - developer tools opened
            'vm_detected': 100,  # Critical - virtual machine/automation
            'fullscreen_change': 10,  # Exiting fullscreen is suspicious
            'screenshot_attempt': 25,  # Trying to capture questions
            'ai_typing_detected': 75,  # Very suspicious - bot typing
            'right_click_attempt': 5,  # Trying to inspect element
            'multiple_tabs_detected': 50,  # Opening same interview in multiple tabs
        }

        try:
            # Get all activities for this submission
            activities_result = self.client.table('session_activities').select(
                '*'
            ).eq('submission_id', submission_id).execute()

            activities = activities_result.data or []

            # Count activities by type
            activity_counts = {}
            total_risk = 0
            high_risk_activities = []
            flagged_events = []

            for activity in activities:
                activity_type = activity['activity_type']
                activity_counts[activity_type] = activity_counts.get(activity_type, 0) + 1

                # Add risk score
                risk_points = ACTIVITY_RISK_SCORES.get(activity_type, 0)
                total_risk += risk_points

                # Track high-risk activities
                if risk_points >= 50:
                    high_risk_activities.append({
                        'type': activity_type,
                        'timestamp': activity.get('timestamp'),
                        'metadata': activity.get('metadata', {}),
                        'risk_points': risk_points
                    })

                # Special handling for specific activities
                if activity_type == 'fullscreen_change':
                    metadata = activity.get('metadata', {})
                    if not metadata.get('is_fullscreen'):
                        # Exiting fullscreen is more suspicious
                        flagged_events.append({
                            'type': 'exited_fullscreen',
                            'timestamp': activity.get('timestamp'),
                            'severity': 'medium'
                        })

                if activity_type == 'devtools':
                    metadata = activity.get('metadata', {})
                    if metadata.get('is_open'):
                        flagged_events.append({
                            'type': 'opened_devtools',
                            'timestamp': activity.get('timestamp'),
                            'severity': 'high'
                        })

            # Determine risk level
            if total_risk >= 150:
                risk_level = 'critical'
            elif total_risk >= 100:
                risk_level = 'high'
            elif total_risk >= 50:
                risk_level = 'medium'
            else:
                risk_level = 'low'

            # Additional pattern-based flags
            if activity_counts.get('tab_switch', 0) > 15:
                flagged_events.append({
                    'type': 'excessive_tab_switching',
                    'count': activity_counts['tab_switch'],
                    'severity': 'high'
                })

            if activity_counts.get('paste', 0) > 10:
                flagged_events.append({
                    'type': 'excessive_pasting',
                    'count': activity_counts['paste'],
                    'severity': 'medium'
                })

            return {
                'total_risk_score': total_risk,
                'risk_level': risk_level,
                'activity_counts': activity_counts,
                'high_risk_activities': high_risk_activities,
                'flagged_events': flagged_events,
                'total_activities': len(activities)
            }

        except Exception as e:
            logger.error(f"Error calculating risk score: {e}")
            return {
                'total_risk_score': 0,
                'risk_level': 'unknown',
                'activity_counts': {},
                'high_risk_activities': [],
                'flagged_events': [],
                'error': str(e)
            }

    async def _detect_programming_language(self, code: str) -> str:
        """
        Detect programming language from code using AI.

        Args:
            code: Code snippet to analyze

        Returns:
            Detected language name (e.g., 'python', 'java', 'javascript')
        """
        try:
            llm = get_llm_orchestrator()

            prompt = f"""Analyze this code and identify the programming language.
Return ONLY the language name in lowercase (e.g., python, java, javascript, cpp, c, csharp, go, rust, typescript, ruby, php, swift, kotlin, etc.).

Code:
```
{code[:500]}  # First 500 chars should be enough
```

Language:"""

            response = await llm.generate(
                prompt=prompt,
                task_type='code_generation',  # Uses CodeLlama
                temperature=0.1
            )

            detected = response.strip().lower()

            # Map common variations
            language_map = {
                'c++': 'cpp',
                'c#': 'csharp',
                'js': 'javascript',
                'ts': 'typescript',
                'py': 'python',
                'rb': 'ruby',
                'rs': 'rust',
            }

            detected = language_map.get(detected, detected)

            logger.info(f"Detected language: {detected}")
            return detected

        except Exception as e:
            logger.error(f"Error detecting language: {e}")
            # Fallback: try simple heuristics
            code_lower = code.lower()
            if 'def ' in code or 'import ' in code or 'print(' in code:
                return 'python'
            elif 'function ' in code or 'const ' in code or 'let ' in code or 'var ' in code:
                return 'javascript'
            elif 'public class' in code or 'public static void' in code:
                return 'java'
            elif '#include' in code:
                return 'cpp'
            else:
                return 'unknown'


# Singleton instance
_coding_interview_service: Optional[CodingInterviewService] = None


def get_coding_interview_service() -> CodingInterviewService:
    """Get the coding interview service singleton."""
    global _coding_interview_service
    if _coding_interview_service is None:
        _coding_interview_service = CodingInterviewService()
    return _coding_interview_service
