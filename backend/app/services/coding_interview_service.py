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

import pandas as pd
import io
from app.db.supabase_client import get_supabase
from app.services.llm_orchestrator import get_llm_orchestrator
from app.services.hybrid_scorer import HybridScorer
from app.services.user_service import get_user_service
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
        self.user_service = get_user_service()
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
        bond_timing: str = 'before_submission',
        job_id: Optional[str] = None,
        org_id: str = None
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
            # Resolve raw user ID to internal UUID
            user_id = self.user_service.resolve_user_id(user_id)
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
                'created_by': user_id,
                'job_id': job_id,
                **({'org_id': org_id} if org_id else {})
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
        user_agent: str = '',
        preferred_language: Optional[str] = None,
        device_info: Optional[Dict[str, Any]] = None
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
                start_fmt = scheduled_start.strftime('%Y-%m-%d %I:%M %p')
                raise ValueError(f"Interview has not started yet. Starts at {start_fmt}")

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
                'preferred_language': preferred_language,
                'metadata': {'device_info': device_info} if device_info else {}
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
        client_ip: Optional[str] = None,
        submission_trigger: Optional[str] = None,
        device_info: Optional[Dict[str, Any]] = None
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

            # Get interview to check grace period, bond requirement, and title
            interview_result = self.client.table('coding_interviews').select(
                'link_expires_at, require_signature, title'
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

            # Update metadata
            metadata = submission.get('metadata') or {}
            if submission_trigger:
                metadata['trigger'] = submission_trigger
            elif auto_submit:
                metadata['trigger'] = 'timer'
            
            if device_info:
                metadata['device_info'] = device_info
            
            if metadata:
                update_data['metadata'] = metadata

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

            # Send confirmation email to candidate (fire-and-forget)
            try:
                from app.services.email_service import send_submission_confirmation
                candidate_email = submission.get('candidate_email')
                candidate_name = submission.get('candidate_name', 'Candidate')
                interview_title = interview.get('title', 'Technical Interview')
                if candidate_email:
                    send_submission_confirmation(
                        candidate_email=candidate_email,
                        candidate_name=candidate_name,
                        interview_title=interview_title
                    )
            except Exception as email_err:
                logger.warning(f"Submission confirmation email failed (non-fatal): {email_err}")

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

                    if answer:
                        # Row exists — just update it
                        self.client.table('coding_answers').update(evaluation_data).eq(
                            'id', answer['id']
                        ).execute()
                    else:
                        # No row at all — insert one
                        self.client.table('coding_answers').insert(evaluation_data).execute()

                    evaluations.append(evaluation_data)
                    continue

                # Evaluate using hybrid approach
                try:
                    submitted_code = answer['submitted_code']

                    # Check if candidate submitted unchanged starter/template code
                    starter_code = (question.get('starter_code') or '').strip()
                    submitted_stripped = submitted_code.strip()

                    # Also check against known global templates
                    known_templates = [t.strip() for t in TEST_FRAMEWORK_TEMPLATES.values()]

                    import re
                    def strip_comments(c, lang='python'):
                        if lang == 'python':
                            return re.sub(r'#.*', '', c).strip()
                        return re.sub(r'//.*|/\*[\s\S]*?\*/', '', c).strip()

                    submitted_no_comments = strip_comments(submitted_stripped)
                    starter_no_comments = strip_comments(starter_code)

                    is_starter_code = (
                        (starter_code and submitted_stripped == starter_code) or
                        (starter_code and submitted_no_comments == starter_no_comments) or
                        submitted_stripped in known_templates
                    )

                    if is_starter_code:
                        logger.info(
                            f"Q{question['question_number']}: Submitted code matches starter template — 0 marks"
                        )
                        evaluation_data = {
                            'marks_awarded': 0,
                            'is_correct': False,
                            'similarity_score': 0.0,
                            'programming_language': answer.get('programming_language', 'unknown'),
                            'feedback': 'No attempt made. Starter/template code was submitted unchanged.',
                            'key_points_covered': [],
                            'key_points_missed': ['All requirements — no attempt made'],
                            'code_quality_score': 0,
                            'evaluated_at': datetime.now().isoformat(),
                            'evaluated_by_model': 'system'
                        }
                        self.client.table('coding_answers').update(evaluation_data).eq(
                            'id', answer['id']
                        ).execute()
                        evaluations.append({**evaluation_data, 'question_id': question['id']})
                        continue

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

            # Update submission with final scores and set status to 'evaluated'
            self.client.table('coding_submissions').update({
                'status': 'evaluated',
                'total_marks_obtained': total_marks_obtained,
                'percentage': round(percentage, 2)
            }).eq('id', submission_id).execute()

            # Run suspicious activity check
            await self.check_suspicious_activity(submission_id)

            logger.info(
                f"Evaluation complete for {submission_id}: "
                f"{total_marks_obtained}/{total_marks} ({percentage:.2f}%)"
            )

            # Sync to pipeline if candidate exists there
            try:
                from app.services.pipeline_service import get_pipeline_service
                pipeline = get_pipeline_service()
                candidate_email = submission.get('candidate_email', '')
                if candidate_email:
                    pipeline.sync_coding_results(
                        submission_id, candidate_email,
                        total_marks_obtained, round(percentage, 2)
                    )
            except Exception as pe:
                logger.debug(f"Pipeline sync skipped: {pe}")

            # ── Batch Integration: Sync coding results to batch_candidates ──
            try:
                candidate_email = submission.get('candidate_email', '')
                if candidate_email:
                    # Find batch_candidate by email
                    batch_result = self.client.table('batch_candidates').select(
                        'id, batch_id, candidates!inner(email)'
                    ).eq('candidates.email', candidate_email.lower()).execute()

                    if batch_result.data:
                        for batch_candidate in batch_result.data:
                            batch_candidate_id = batch_candidate['id']

                            # Get current module_results
                            current_result = self.client.table('batch_candidates').select(
                                'module_results'
                            ).eq('id', batch_candidate_id).single().execute()

                            if current_result.data:
                                module_results = current_result.data.get('module_results', {})

                                # Update technical_assessment module
                                module_results['technical_assessment'] = {
                                    'status': 'completed',
                                    'score': round(percentage, 2),
                                    'marks_obtained': total_marks_obtained,
                                    'total_marks': total_marks,
                                    'submission_id': submission_id,
                                    'completed_at': datetime.now().isoformat()
                                }

                                # Update batch_candidate
                                self.client.table('batch_candidates').update({
                                    'module_results': module_results,
                                    'current_stage': 'voice_screening'  # Auto-advance to next stage
                                }).eq('id', batch_candidate_id).execute()

                                logger.info(
                                    f"Synced coding results to batch_candidate {batch_candidate_id}: {percentage:.2f}%"
                                )
            except Exception as be:
                logger.debug(f"Batch sync skipped: {be}")

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

    async def track_activity_bulk(
        self,
        submission_id: str,
        activities: List[Dict[str, Any]]
    ):
        """
        Log multiple anti-cheating events at once.
        """
        try:
            timestamp = datetime.now().isoformat()
            
            for act in activities:
                # Validate question_id
                q_id = act.get('question_id')
                valid_q_id = q_id
                if q_id:
                    try:
                        uuid.UUID(q_id)
                    except ValueError:
                        valid_q_id = None

                self.activity_buffer.append({
                    'submission_id': submission_id,
                    'activity_type': act.get('activity_type'),
                    'question_id': valid_q_id,
                    'metadata': act.get('metadata', {}),
                    'timestamp': timestamp
                })

            # Flush if buffer is getting large
            if len(self.activity_buffer) >= 10:
                await self._flush_activity_buffer()

        except Exception as e:
            logger.error(f"Error bulk tracking activity: {e}")

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
            'mouse_leave': 4,        # Cursor moved outside browser window
            'idle_detected': 15,     # No interaction for 60+ seconds
            'question_time': 0,      # Informational — time spent per question
            'split_screen': 40,      # Mobile split-screen (ChatGPT alongside)
            'network_offline': 20,   # Went offline (airplane mode trick)
            'network_online': 0,     # Returned online — informational
            'text_selection': 8,     # Selected question text to share/copy
            'orientation_change': 5, # Screen rotation mid-exam
            'navigation_attempt': 30, # Tried to close/leave the tab
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

            result = await llm.generate_completion(
                prompt=prompt,
                model=llm.get_model_for_task('answer_evaluation', domain='coding'),
                temperature=0.1
            )

            detected = result.get('response', '').strip().lower()

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


    async def bulk_import_candidates(
        self,
        interview_id: str,
        candidates: List[Dict[str, Any]],
        user_id: str,
        org_id: str = None
    ) -> Dict[str, Any]:
        """Import a list of pre-registered candidates for an interview."""
        # Resolve raw user ID to internal UUID
        user_id = self.user_service.resolve_user_id(user_id)
        
        client = get_supabase()

        # Verify interview ownership
        query = client.table('coding_interviews').select('id').eq('id', interview_id)
        if org_id:
            query = query.eq('org_id', org_id)
        else:
            query = query.eq('created_by', user_id)
        interview_result = query.execute()

        if not interview_result.data:
            raise ValueError("Interview not found or access denied")

        imported = 0
        duplicates = 0
        inserted_rows = []

        for candidate in candidates:
            name = (candidate.get('name') or '').strip()
            if not name:
                continue

            email = (candidate.get('email') or '').strip() or None
            phone = (candidate.get('phone') or '').strip() or None

            row = {
                'interview_id': interview_id,
                'name': name,
                'email': email,
                'phone': phone,
            }

            try:
                result = client.table('interview_candidates').insert(row).execute()
                if result.data:
                    imported += 1
                    inserted_rows.append(result.data[0])
            except Exception as e:
                err_str = str(e).lower()
                if 'duplicate' in err_str or 'unique' in err_str or '23505' in err_str:
                    duplicates += 1
                else:
                    logger.warning(f"Failed to insert candidate {name}: {e}")
                    duplicates += 1

        logger.info(
            f"Bulk import for interview {interview_id}: "
            f"{imported} imported, {duplicates} duplicates"
        )
        return {
            'imported': imported,
            'duplicates': duplicates,
            'candidates': inserted_rows,
        }

    async def get_interview_candidates(
        self,
        interview_id: str
    ) -> List[Dict[str, Any]]:
        """
        Return a unified candidate list: imported (not yet submitted) + submitted.
        Merges by email when possible.
        """
        client = get_supabase()

        # Fetch pre-registered candidates
        imported_result = client.table('interview_candidates').select('*').eq(
            'interview_id', interview_id
        ).order('name').execute()
        imported = imported_result.data or []

        # Fetch all submissions for this interview
        subs_result = client.table('coding_submissions').select(
            'id, candidate_name, candidate_email, candidate_phone, total_marks_obtained, '
            'percentage, candidate_decision, status'
        ).eq('interview_id', interview_id).execute()
        submissions = subs_result.data or []

        # Build email → submission map (skip null emails)
        sub_by_email: Dict[str, Dict] = {}
        sub_by_name: Dict[str, Dict] = {}  # fallback: normalize name → submission
        for s in submissions:
            email = (s.get('candidate_email') or '').strip().lower()
            if email:
                sub_by_email[email] = s
            # Always index by name as fallback
            name_key = (s.get('candidate_name') or '').strip().lower()
            if name_key:
                sub_by_name[name_key] = s

        # Track which submission IDs are already matched
        matched_sub_ids: set = set()

        unified: List[Dict[str, Any]] = []

        for cand in imported:
            cand_email = (cand.get('email') or '').strip().lower()
            cand_name_key = (cand.get('name') or '').strip().lower()

            # Match by email first, then fall back to name
            sub = sub_by_email.get(cand_email) if cand_email else None
            if sub is None:
                sub = sub_by_name.get(cand_name_key) if cand_name_key else None

            submitted = sub is not None

            if sub:
                matched_sub_ids.add(sub['id'])

            # Show submission email/phone if the pre-registered row is missing them
            display_email = cand.get('email') or (sub.get('candidate_email') if sub else None)
            display_phone = cand.get('phone') or (sub.get('candidate_phone') if sub else None)

            unified.append({
                'id': cand['id'],
                'candidate_id': cand['id'],  # interview_candidates.id — present = editable/deletable
                'name': cand['name'],
                'email': display_email,
                'phone': display_phone,
                'submitted': submitted,
                'submission_id': sub['id'] if sub else None,
                'score': sub.get('total_marks_obtained') if sub else None,
                'percentage': sub.get('percentage') if sub else None,
                'decision': sub.get('candidate_decision', 'pending') if sub else 'pending',
            })

        # Walk-in submissions not in the import list
        for s in submissions:
            if s['id'] not in matched_sub_ids:
                unified.append({
                    'id': s['id'],
                    'candidate_id': None,  # no interview_candidates record — not editable
                    'name': s.get('candidate_name', 'Unknown'),
                    'email': s.get('candidate_email'),
                    'phone': s.get('candidate_phone'),  # pull from submission
                    'submitted': True,
                    'submission_id': s['id'],
                    'score': s.get('total_marks_obtained'),
                    'percentage': s.get('percentage'),
                    'decision': s.get('candidate_decision', 'pending'),
                })

        # Sort: submitted first, then not-started alphabetically
        unified.sort(key=lambda x: (0 if x['submitted'] else 1, x['name'].lower()))
        return unified

    async def update_interview_candidate(
        self,
        interview_id: str,
        candidate_id: str,
        name: str,
        email: Optional[str],
        phone: Optional[str],
        user_id: str,
        org_id: str = None
    ) -> Dict[str, Any]:
        """Update a pre-registered candidate's details."""
        # Resolve raw user ID to internal UUID
        user_id = self.user_service.resolve_user_id(user_id)
        
        client = get_supabase()

        # Verify interview ownership
        query = client.table('coding_interviews').select('id').eq('id', interview_id)
        if org_id:
            query = query.eq('org_id', org_id)
        else:
            query = query.eq('created_by', user_id)
        interview_result = query.execute()
        if not interview_result.data:
            raise ValueError("Interview not found or access denied")

        result = client.table('interview_candidates').update({
            'name': name.strip(),
            'email': email.strip() if email else None,
            'phone': phone.strip() if phone else None,
        }).eq('id', candidate_id).eq('interview_id', interview_id).execute()

        if not result.data:
            raise ValueError("Candidate not found")

        return result.data[0]

    async def delete_interview_candidate(
        self,
        interview_id: str,
        candidate_id: str,
        user_id: str,
        org_id: str = None
    ) -> None:
        """Delete a pre-registered candidate from the interview."""
        # Resolve raw user ID to internal UUID
        user_id = self.user_service.resolve_user_id(user_id)
        
        client = get_supabase()

        # Verify interview ownership
        query = client.table('coding_interviews').select('id').eq('id', interview_id)
        if org_id:
            query = query.eq('org_id', org_id)
        else:
            query = query.eq('created_by', user_id)
        interview_result = query.execute()
        if not interview_result.data:
            raise ValueError("Interview not found or access denied")

        result = client.table('interview_candidates').delete().eq(
            'id', candidate_id
        ).eq('interview_id', interview_id).execute()

        if not result.data:
            raise ValueError("Candidate not found")

    async def delete_submission(
        self,
        submission_id: str,
        user_id: str,
        org_id: str = None
    ) -> None:
        """Delete a candidate submission (any status). Requires interview ownership."""
        # Resolve raw user ID to internal UUID
        user_id = self.user_service.resolve_user_id(user_id)
        
        client = get_supabase()

        # Fetch submission to get interview_id
        sub_result = client.table('coding_submissions').select('id, interview_id').eq(
            'id', submission_id
        ).execute()
        if not sub_result.data:
            raise ValueError("Submission not found")

        interview_id = sub_result.data[0]['interview_id']

        # Verify interview ownership
        query = client.table('coding_interviews').select('id').eq('id', interview_id)
        if org_id:
            query = query.eq('org_id', org_id)
        else:
            query = query.eq('created_by', user_id)
        interview_result = query.execute()
        if not interview_result.data:
            raise ValueError("Interview not found or access denied")

        # Delete submission (CASCADE removes coding_answers + session_activities)
        client.table('coding_submissions').delete().eq('id', submission_id).execute()

    async def delete_multiple_submissions(
        self,
        submission_ids: List[str],
        user_id: str,
        org_id: str = None
    ) -> None:
        """Delete multiple candidate submissions (any status)."""
        if not submission_ids:
            return
            
        # Resolve raw user ID to internal UUID
        user_id = self.user_service.resolve_user_id(user_id)
        client = get_supabase()

        # Fetch submissions to get interview_ids to verify ownership
        subs_result = client.table('coding_submissions').select('interview_id').in_(
            'id', submission_ids
        ).execute()
        
        if not subs_result.data:
            return
            
        interview_ids = list(set([sub['interview_id'] for sub in subs_result.data]))

        # Verify interview ownership for all involved interviews
        query = client.table('coding_interviews').select('id').in_('id', interview_ids)
        if org_id:
            query = query.eq('org_id', org_id)
        else:
            query = query.eq('created_by', user_id)
            
        interviews_result = query.execute()
        valid_interview_ids = {i['id'] for i in (interviews_result.data or [])}

        # Filter submissions to only those belonging to valid interviews
        valid_submission_ids = []
        for sub_id in submission_ids:
            # We need to map back which sub_id belongs to which interview_id
            # Reusing the existing fetched data is safer
            pass
            
        # Alternatively, since the user must have ownership of the interview,
        # we can just query the submissions that belong to the valid interviews.
        if not valid_interview_ids:
            raise ValueError("No valid interviews found or access denied")
            
        valid_subs_query = client.table('coding_submissions').select('id').in_('id', submission_ids).in_('interview_id', list(valid_interview_ids)).execute()
        ids_to_delete = [s['id'] for s in (valid_subs_query.data or [])]
        
        if ids_to_delete:
            client.table('coding_submissions').delete().in_('id', ids_to_delete).execute()

    async def set_submission_decision(
        self,
        submission_id: str,
        decision: str,
        notes: Optional[str],
        decided_by: str
    ) -> Dict[str, Any]:
        """Update the decision on a coding submission."""
        # Resolve raw user ID to internal UUID
        decided_by = self.user_service.resolve_user_id(decided_by)
        
        client = get_supabase()
        from datetime import datetime, timezone

        update_data = {
            'candidate_decision': decision,
            'decision_notes': notes,
            'decided_at': datetime.now(timezone.utc).isoformat(),
            'decided_by': decided_by,
        }

        result = client.table('coding_submissions').update(update_data).eq(
            'id', submission_id
        ).execute()

        if not result.data:
            raise ValueError("Submission not found")

        return result.data[0]

    # ── Evaluator Notes & Score Override ─────────────────────────────────────

    async def save_evaluator_notes(
        self,
        submission_id: str,
        answer_id: str,
        notes: Optional[str],
        marks_override: Optional[float],
        evaluator_id: str
    ) -> Dict[str, Any]:
        """Save evaluator notes and optionally override the AI-assigned marks."""
        # Note: evaluator_id is already an internal users.id UUID resolved at the API/Auth level
        client = get_supabase()

        # Verify answer belongs to this submission
        answer_result = client.table('coding_answers').select(
            'id, question_id, marks_awarded'
        ).eq('id', answer_id).eq('submission_id', submission_id).execute()

        if not answer_result.data:
            raise ValueError("Answer not found")

        # Double check evaluator exists in users table to avoid FK violation
        user_check = client.table('users').select('id').eq('id', evaluator_id).execute()
        if not user_check.data:
            logger.error(f"Evaluator ID {evaluator_id} not found in users table. Notes cannot be saved.")
            raise ValueError("Internal user record missing. Please contact support.")

        update_data: Dict[str, Any] = {
            'evaluator_notes': notes,
            'evaluator_id': evaluator_id,
        }

        if marks_override is not None:
            question_id = answer_result.data[0]['question_id']
            q_result = client.table('coding_questions').select('marks').eq(
                'id', question_id
            ).execute()
            max_marks = float(q_result.data[0]['marks']) if q_result.data else float('inf')
            update_data['marks_awarded'] = max(0.0, min(float(marks_override), max_marks))

        result = client.table('coding_answers').update(update_data).eq(
            'id', answer_id
        ).execute()

        if not result.data:
            raise ValueError("Answer not found")

        # Recalculate submission totals if marks changed
        if marks_override is not None:
            await self._recalculate_submission_score(submission_id)

        return result.data[0]

    async def _recalculate_submission_score(self, submission_id: str) -> None:
        """Recalculate total marks + percentage for a submission after score override."""
        client = get_supabase()

        answers_result = client.table('coding_answers').select(
            'marks_awarded'
        ).eq('submission_id', submission_id).execute()

        total_obtained = sum(
            float(a.get('marks_awarded') or 0) for a in (answers_result.data or [])
        )

        sub_result = client.table('coding_submissions').select(
            'interview_id'
        ).eq('id', submission_id).execute()
        if not sub_result.data:
            return

        interview_result = client.table('coding_interviews').select(
            'total_marks'
        ).eq('id', sub_result.data[0]['interview_id']).execute()
        total_marks = float(interview_result.data[0]['total_marks']) if interview_result.data else 1.0
        percentage = round((total_obtained / total_marks * 100) if total_marks > 0 else 0.0, 2)

        client.table('coding_submissions').update({
            'total_marks_obtained': total_obtained,
            'percentage': percentage,
        }).eq('id', submission_id).execute()

    # ── Clone Interview ───────────────────────────────────────────────────────

    async def clone_interview(
        self,
        interview_id: str,
        user_id: str,
        org_id: str = None
    ) -> Dict[str, Any]:
        """Copy an interview (+ all questions) with a fresh access token."""
        # Resolve raw user ID to internal UUID
        user_id = self.user_service.resolve_user_id(user_id)
        
        client = get_supabase()

        query = client.table('coding_interviews').select('*').eq('id', interview_id)
        if org_id:
            query = query.eq('org_id', org_id)
        else:
            query = query.eq('created_by', user_id)
        interview_result = query.execute()

        if not interview_result.data:
            raise ValueError("Interview not found or access denied")

        src = interview_result.data[0]

        questions_result = client.table('coding_questions').select('*').eq(
            'interview_id', interview_id
        ).order('question_number').execute()
        questions = questions_result.data or []

        new_token = str(uuid.uuid4())
        clone_data = {
            'title': f"Copy of {src['title']}",
            'description': src.get('description'),
            'scheduled_start_time': src['scheduled_start_time'],
            'scheduled_end_time': src['scheduled_end_time'],
            'grace_period_minutes': src.get('grace_period_minutes', 15),
            'status': 'scheduled',
            'access_token': new_token,
            'link_expires_at': src['link_expires_at'],
            'interview_type': src['interview_type'],
            'programming_language': src['programming_language'],
            'allowed_languages': src.get('allowed_languages'),
            'total_marks': src['total_marks'],
            'resume_required': src.get('resume_required', 'mandatory'),
            'bond_terms': src.get('bond_terms'),
            'bond_document_url': src.get('bond_document_url'),
            'require_signature': src.get('require_signature', False),
            'bond_years': src.get('bond_years', 2),
            'bond_timing': src.get('bond_timing', 'before_submission'),
            'created_by': user_id,
            **({'org_id': org_id} if org_id else {}),
        }

        clone_result = client.table('coding_interviews').insert(clone_data).execute()
        if not clone_result.data:
            raise RuntimeError("Failed to clone interview")

        new_interview_id = clone_result.data[0]['id']

        for q in questions:
            client.table('coding_questions').insert({
                'interview_id': new_interview_id,
                'question_number': q['question_number'],
                'question_text': q['question_text'],
                'difficulty': q['difficulty'],
                'marks': q['marks'],
                'starter_code': q.get('starter_code'),
                'solution_code': q.get('solution_code'),
                'test_cases': q.get('test_cases'),
                'topics': q.get('topics', []),
                'time_estimate_minutes': q.get('time_estimate_minutes'),
            }).execute()

        shareable_link = f"{settings.FRONTEND_URL}/interview/{new_token}"
        return {
            'interview_id': new_interview_id,
            'access_token': new_token,
            'shareable_link': shareable_link,
            'title': clone_data['title'],
        }

    # ── Send Invites ──────────────────────────────────────────────────────────

    async def send_interview_invites(
        self,
        interview_id: str,
        user_id: str,
        org_id: str = None
    ) -> Dict[str, Any]:
        """Email the interview link to all pre-registered candidates who haven't submitted."""
        # Resolve raw user ID to internal UUID
        user_id = self.user_service.resolve_user_id(user_id)
        
        client = get_supabase()

        query = client.table('coding_interviews').select(
            'id, title, access_token'
        ).eq('id', interview_id)
        if org_id:
            query = query.eq('org_id', org_id)
        else:
            query = query.eq('created_by', user_id)
        interview_result = query.execute()

        if not interview_result.data:
            raise ValueError("Interview not found or access denied")

        interview = interview_result.data[0]
        interview_link = f"{settings.FRONTEND_URL}/interview/{interview['access_token']}"

        candidates_result = client.table('interview_candidates').select('*').eq(
            'interview_id', interview_id
        ).execute()
        candidates = candidates_result.data or []

        subs_result = client.table('coding_submissions').select('candidate_email').eq(
            'interview_id', interview_id
        ).execute()
        submitted_emails = {
            (s.get('candidate_email') or '').strip().lower()
            for s in (subs_result.data or [])
        }

        from app.services.email_service import send_interview_invite

        sent = skipped = no_email = 0
        for cand in candidates:
            email = (cand.get('email') or '').strip()
            if not email:
                no_email += 1
                continue
            if email.lower() in submitted_emails:
                skipped += 1
                continue
            success = send_interview_invite(
                candidate_email=email,
                candidate_name=cand.get('name', 'Candidate'),
                interview_title=interview['title'],
                interview_link=interview_link,
            )
            if success:
                sent += 1
            else:
                skipped += 1

        return {'sent': sent, 'skipped': skipped, 'no_email': no_email, 'total': len(candidates)}

    # ── Bulk Decision ─────────────────────────────────────────────────────────

    async def bulk_submission_decision(
        self,
        interview_id: str,
        submission_ids: List[str],
        decision: str,
        decided_by: str,
        org_id: str = None
    ) -> Dict[str, Any]:
        """Set the same decision on multiple submissions at once."""
        # Resolve raw user ID to internal UUID
        decided_by = self.user_service.resolve_user_id(decided_by)
        
        client = get_supabase()

        query = client.table('coding_interviews').select('id').eq('id', interview_id)
        if org_id:
            query = query.eq('org_id', org_id)
        else:
            query = query.eq('created_by', decided_by)
        interview_result = query.execute()
        if not interview_result.data:
            raise ValueError("Interview not found or access denied")

        from datetime import datetime, timezone
        update_data = {
            'candidate_decision': decision,
            'decided_at': datetime.now(timezone.utc).isoformat(),
            'decided_by': decided_by,
        }

        updated = 0
        for sub_id in submission_ids:
            result = client.table('coding_submissions').update(update_data).eq(
                'id', sub_id
            ).eq('interview_id', interview_id).execute()
            if result.data:
                updated += 1

        return {'updated': updated, 'decision': decision}

    # ── Bulk Delete Candidates ────────────────────────────────────────────────

    async def bulk_delete_candidates(
        self,
        interview_id: str,
        candidate_ids: List[str],
        user_id: str,
        org_id: str = None
    ) -> Dict[str, Any]:
        """Delete multiple pre-registered candidates."""
        # Resolve raw user ID to internal UUID
        user_id = self.user_service.resolve_user_id(user_id)
        
        client = get_supabase()

        query = client.table('coding_interviews').select('id').eq('id', interview_id)
        if org_id:
            query = query.eq('org_id', org_id)
        else:
            query = query.eq('created_by', user_id)
        interview_result = query.execute()
        if not interview_result.data:
            raise ValueError("Interview not found or access denied")

        deleted = 0
        for cand_id in candidate_ids:
            result = client.table('interview_candidates').delete().eq(
                'id', cand_id
            ).eq('interview_id', interview_id).execute()
            if result.data:
                deleted += 1

        return {'deleted': deleted}

    async def get_interview(self, interview_id: str) -> Dict[str, Any]:
        """Get basic interview details."""
        client = get_supabase()
        result = client.table('coding_interviews').select('*').eq('id', interview_id).execute()
        if not result.data:
            raise ValueError("Interview not found")
        return result.data[0]

    # ── Edit Interview ────────────────────────────────────────────────────────

    async def export_submissions_csv(
        self,
        interview_id: str,
        user_id: str,
        org_id: str = None
    ) -> str:
        """
        Export candidate submissions (details + scores per question) to CSV.
        Returns the CSV content as a string.
        """
        # Resolve user ID
        user_id = self.user_service.resolve_user_id(user_id)
        client = get_supabase()

        # 1. Fetch interview and questions
        iv_result = client.table('coding_interviews').select('title, total_marks').eq('id', interview_id).execute()
        if not iv_result.data:
            raise ValueError("Interview not found")
        interview = iv_result.data[0]

        q_result = client.table('coding_questions').select(
            'id, question_number, question_text, marks'
        ).eq('interview_id', interview_id).order('question_number').execute()
        questions = q_result.data or []

        # 2. Fetch all submissions (only submitted/evaluated ones)
        sub_query = client.table('coding_submissions').select(
            'id, candidate_name, candidate_email, candidate_phone, total_marks_obtained, percentage, started_at, submitted_at, status, user_agent'
        ).eq('interview_id', interview_id).in_('status', ['submitted', 'auto_submitted', 'evaluated'])
        
        subs_result = sub_query.execute()
        submissions = subs_result.data or []

        if not submissions:
            # Return CSV with just headers if no submissions
            headers = ["Candidate Name", "Email", "Phone", "Status", "Started At", "Submitted At", "Device Type", "Total Score", "Percentage (%)"]
            for q in questions:
                headers.append(f"Q{q['question_number']} Score (max {q['marks']})")
            df = pd.DataFrame(columns=headers)
            return df.to_csv(index=False)

        # Helper for device detection
        def get_device_type(ua: str) -> str:
            if not ua: return "Unknown"
            ua = ua.lower()
            mobile_keywords = ['mobile', 'android', 'iphone', 'ipad', 'windows phone']
            if any(k in ua for k in mobile_keywords):
                return "Mobile"
            return "Laptop/Desktop"

        # 3. For each submission, fetch answers to get question scores
        rows = []
        for sub in submissions:
            # Fetch answers for this submission
            ans_result = client.table('coding_answers').select(
                'question_id, marks_awarded'
            ).eq('submission_id', sub['id']).execute()
            answers = {a['question_id']: a['marks_awarded'] for a in (ans_result.data or [])}

            row = {
                "Candidate Name": sub.get('candidate_name'),
                "Email": sub.get('candidate_email'),
                "Phone": sub.get('candidate_phone'),
                "Status": sub.get('status', '').upper(),
                "Started At": sub.get('started_at'),
                "Submitted At": sub.get('submitted_at'),
                "Device Type": get_device_type(sub.get('user_agent', '')),
                "Total Score": sub.get('total_marks_obtained'),
                "Percentage (%)": sub.get('percentage'),
            }

            # Add question scores
            for q in questions:
                score = answers.get(q['id'])
                row[f"Q{q['question_number']} Score (max {q['marks']})"] = score if score is not None else 0

            rows.append(row)

        df = pd.DataFrame(rows)
        return df.to_csv(index=False)

    async def update_interview(
        self,
        interview_id: str,
        update_data: Dict[str, Any],
        user_id: str,
        org_id: str = None
    ) -> Dict[str, Any]:
        """Update interview fields including bond settings and questions."""
        # Resolve raw user ID to internal UUID
        user_id = self.user_service.resolve_user_id(user_id)
        
        client = get_supabase()

        query = client.table('coding_interviews').select('*').eq('id', interview_id)
        if org_id:
            query = query.eq('org_id', org_id)
        else:
            query = query.eq('created_by', user_id)
        interview_result = query.execute()
        if not interview_result.data:
            raise ValueError("Interview not found or access denied")

        src = interview_result.data[0]
        patch: Dict[str, Any] = {}

        if update_data.get('title'):
            patch['title'] = update_data['title']
        if 'description' in update_data:
            patch['description'] = update_data['description']

        new_end = update_data.get('scheduled_end_time')
        new_grace = update_data.get('grace_period_minutes')

        if update_data.get('scheduled_start_time'):
            patch['scheduled_start_time'] = update_data['scheduled_start_time'].isoformat()
        if new_end:
            patch['scheduled_end_time'] = new_end.isoformat()
        if new_grace is not None:
            patch['grace_period_minutes'] = new_grace

        # Recalculate link_expires_at if end time or grace changed
        if new_end or new_grace is not None:
            end_time = new_end
            if end_time is None:
                end_str = src['scheduled_end_time'].replace('Z', '').replace('+00:00', '')
                end_time = datetime.fromisoformat(end_str)
            grace = new_grace if new_grace is not None else src.get('grace_period_minutes', 15)
            patch['link_expires_at'] = (end_time + timedelta(minutes=grace)).isoformat()

        # Recalculate status if start or end time changed
        if update_data.get('scheduled_start_time') or new_end:
            # Get the new start and end times (ensure all are naive UTC for comparison)
            start_time = update_data.get('scheduled_start_time')
            if start_time is None:
                start_str = src['scheduled_start_time'].replace('Z', '').replace('+00:00', '')
                start_time = datetime.fromisoformat(start_str)
            else:
                # Strip timezone info if present to make it naive UTC
                if hasattr(start_time, 'tzinfo') and start_time.tzinfo is not None:
                    start_time = start_time.replace(tzinfo=None)

            end_time = new_end
            if end_time is None:
                end_str = src['scheduled_end_time'].replace('Z', '').replace('+00:00', '')
                end_time = datetime.fromisoformat(end_str)
            else:
                # Strip timezone info if present to make it naive UTC
                if hasattr(end_time, 'tzinfo') and end_time.tzinfo is not None:
                    end_time = end_time.replace(tzinfo=None)

            now = datetime.utcnow()

            # Determine new status based on times
            if now < start_time:
                patch['status'] = 'scheduled'
            elif start_time <= now <= end_time:
                patch['status'] = 'active'
            else:
                # Check if there are any submissions
                subs = client.table('coding_submissions').select('id').eq(
                    'interview_id', interview_id
                ).limit(1).execute()
                patch['status'] = 'completed' if subs.data else 'expired'

        # Bond fields
        if update_data.get('require_signature') is not None:
            patch['require_signature'] = update_data['require_signature']
        if 'bond_terms' in update_data:
            patch['bond_terms'] = update_data['bond_terms']
        if update_data.get('bond_years') is not None:
            patch['bond_years'] = update_data['bond_years']
        if update_data.get('bond_timing'):
            patch['bond_timing'] = update_data['bond_timing']
        if 'bond_document_url' in update_data:
            patch['bond_document_url'] = update_data['bond_document_url']

        # Questions
        questions = update_data.get('questions')
        if questions is not None:
            # Fetch existing question IDs to detect deletions
            existing_q = client.table('coding_questions').select('id').eq(
                'interview_id', interview_id
            ).execute()
            existing_ids = {r['id'] for r in (existing_q.data or [])}
            incoming_ids = {q.get('id') for q in questions if q.get('id')}

            # Handle questions removed by the editor
            ids_to_delete = existing_ids - incoming_ids
            import random
            for qid in ids_to_delete:
                has_answers = client.table('coding_answers').select('id').eq(
                    'question_id', qid
                ).limit(1).execute()
                if not (has_answers.data):
                    client.table('coding_questions').delete().eq('id', qid).execute()
                else:
                    # Cannot delete question with answers. Move its question_number to a safe negative range
                    # so it doesn't collide with active questions.
                    zombie_num = -1000000 - random.randint(1, 100000)
                    client.table('coding_questions').update({'question_number': zombie_num}).eq('id', qid).execute()

            # Temporarily shift active existing questions to negative indexes 
            # to prevent unique constraint (interview_id, question_number) violations during sequential updates
            temp_number = -1000
            for qid in (existing_ids & incoming_ids):
                client.table('coding_questions').update({'question_number': temp_number}).eq('id', qid).execute()
                temp_number -= 1

            # Upsert questions sequentially into positive space
            total_marks = 0
            for idx, q in enumerate(questions):
                q_marks = q.get('marks', 0) if isinstance(q, dict) else getattr(q, 'marks', 0)
                total_marks += q_marks
                q_data = {
                    'interview_id': interview_id,
                    'question_number': idx + 1,
                    'question_text': q.get('question_text', '') if isinstance(q, dict) else getattr(q, 'question_text', ''),
                    'difficulty': q.get('difficulty', 'medium') if isinstance(q, dict) else getattr(q, 'difficulty', 'medium'),
                    'marks': q_marks,
                    'time_estimate_minutes': q.get('time_estimate_minutes') if isinstance(q, dict) else getattr(q, 'time_estimate_minutes', None),
                    'starter_code': q.get('starter_code') if isinstance(q, dict) else getattr(q, 'starter_code', None),
                    'topics': q.get('topics') if isinstance(q, dict) else getattr(q, 'topics', None),
                }
                q_id = q.get('id') if isinstance(q, dict) else getattr(q, 'id', None)
                if q_id and q_id in existing_ids:
                    client.table('coding_questions').update(q_data).eq('id', q_id).execute()
                else:
                    client.table('coding_questions').insert(q_data).execute()

            patch['total_marks'] = total_marks

        if not patch:
            return src

        result = client.table('coding_interviews').update(patch).eq('id', interview_id).execute()
        if not result.data:
            raise ValueError("Update failed")
        return result.data[0]


# Singleton instance
_coding_interview_service: Optional[CodingInterviewService] = None


def get_coding_interview_service() -> CodingInterviewService:
    """Get the coding interview service singleton."""
    global _coding_interview_service
    if _coding_interview_service is None:
        _coding_interview_service = CodingInterviewService()
    return _coding_interview_service
