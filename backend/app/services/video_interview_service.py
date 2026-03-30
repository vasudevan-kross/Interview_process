"""Service layer for video interview campaigns, candidates, and sessions."""

from __future__ import annotations

import json
import re
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, cast

from app.db.supabase_client import get_supabase
from app.services.llm_orchestrator import get_llm_orchestrator
from app.services.storage_service import get_storage_service
from app.services.audio_processing_service import get_audio_processing_service
from app.services.stt_service import get_stt_service
from app.services.tts_service import get_tts_service

logger = logging.getLogger(__name__)


class VideoInterviewService:
    def __init__(self) -> None:
        self.supabase = get_supabase()
        self.llm = get_llm_orchestrator()
        self.storage = get_storage_service()
        self.audio = get_audio_processing_service()
        self.stt = get_stt_service()
        self.tts = get_tts_service()

    # ------------------------------------------------------------------
    # Campaigns
    # ------------------------------------------------------------------

    async def create_campaign(
        self, org_id: str, user_id: str, payload: Dict[str, Any]
    ) -> Any:
        questions = payload.get("questions") or []
        if not questions:
            questions = await self._generate_questions(payload)

        data = {
            "org_id": org_id,
            "created_by": user_id,
            "name": payload["name"],
            "job_role": payload["job_role"],
            "description": payload.get("description"),
            "job_description_text": payload.get("job_description_text"),
            "interview_style": payload.get("interview_style", "structured"),
            "interview_duration_minutes": payload.get("interview_duration_minutes", 20),
            "scheduled_start_time": payload.get("scheduled_start_time"),
            "scheduled_end_time": payload.get("scheduled_end_time"),
            "grace_period_minutes": payload.get("grace_period_minutes", 15),
            "avatar_config": payload.get("avatar_config") or {},
            "questions": questions,
            "llm_model": payload.get("llm_model", "qwen2.5:7b"),
            "is_active": True,
        }

        result = self.supabase.table("video_interview_campaigns").insert(data).execute()
        result_data = cast(Any, result.data) or []
        if not result_data:
            raise ValueError("Failed to create campaign")
        return result_data[0]

    async def list_campaigns(
        self, org_id: str, is_active: Optional[bool] = None
    ) -> List[Any]:
        query = (
            self.supabase.table("video_interview_campaigns")
            .select("*, candidate_count:video_interview_candidates(count)")
            .eq("org_id", org_id)
            .is_("deleted_at", "null")
            .order("created_at", desc=True)
        )
        if is_active is not None:
            query = query.eq("is_active", is_active)
        result = query.execute()
        campaigns = cast(Any, result.data) or []
        
        # Flatten candidate_count from joined table count
        for c in campaigns:
            count_data = c.get("candidate_count")
            if isinstance(count_data, list) and len(count_data) > 0:
                c["candidate_count"] = count_data[0].get("count", 0)
            else:
                c["candidate_count"] = 0
                
        return campaigns

    async def get_campaign(self, org_id: str, campaign_id: str) -> Any:
        result = (
            self.supabase.table("video_interview_campaigns")
            .select("*, candidate_count:video_interview_candidates(count)")
            .eq("id", campaign_id)
            .eq("org_id", org_id)
            .single()
            .execute()
        )
        campaign = cast(Dict[str, Any], result.data) or {}
        if not campaign:
            raise ValueError("Campaign not found")
            
        # Flatten candidate_count
        count_data = campaign.get("candidate_count")
        if isinstance(count_data, list) and len(count_data) > 0:
            campaign["candidate_count"] = count_data[0].get("count", 0)
        else:
            campaign["candidate_count"] = 0
            
        return campaign

    async def update_campaign(
        self, org_id: str, campaign_id: str, updates: Dict[str, Any]
    ) -> Any:
        if "questions" in updates and updates["questions"] is None:
            updates.pop("questions")
        result = (
            self.supabase.table("video_interview_campaigns")
            .update(updates)
            .eq("id", campaign_id)
            .eq("org_id", org_id)
            .execute()
        )
        result_data = cast(Any, result.data) or []
        if not result_data:
            raise ValueError("Failed to update campaign")
        return result_data[0]

    async def delete_campaign(self, org_id: str, campaign_id: str) -> Dict[str, Any]:
        result = (
            self.supabase.table("video_interview_campaigns")
            .update(
                {
                    "deleted_at": datetime.now(timezone.utc).isoformat(),
                    "is_active": False,
                }
            )
            .eq("id", campaign_id)
            .eq("org_id", org_id)
            .execute()
        )
        result_data = cast(Any, result.data) or []
        if not result_data:
            raise ValueError("Failed to delete campaign")
        return result_data[0]

    # ------------------------------------------------------------------
    # Candidates
    # ------------------------------------------------------------------

    async def create_candidate(
        self, org_id: str, user_id: str, payload: Dict[str, Any]
    ) -> Any:
        token = secrets.token_urlsafe(16)
        data = {
            "org_id": org_id,
            "created_by": user_id,
            "campaign_id": payload["campaign_id"],
            "interview_token": token,
            "name": payload["name"],
            "email": payload.get("email"),
            "phone": payload.get("phone"),
            "status": "pending",
        }
        result = (
            self.supabase.table("video_interview_candidates").insert(data).execute()
        )
        result_data = cast(Any, result.data) or []
        if not result_data:
            raise ValueError("Failed to create candidate")
        return result_data[0]

    async def delete_candidate(self, org_id: str, candidate_id: str) -> Dict[str, Any]:
        sessions_result = (
            self.supabase.table("video_interview_sessions")
            .select("recording_path, recording_bucket")
            .eq("org_id", org_id)
            .eq("candidate_id", candidate_id)
            .execute()
        )
        sessions = cast(Any, sessions_result.data) or []
        for session in sessions:
            recording_path = session.get("recording_path")
            if recording_path:
                try:
                    await self.storage.delete_file(
                        "interview_recordings", recording_path
                    )
                except Exception as exc:
                    logger.warning(f"Failed to delete recording: {exc}")

        result = (
            self.supabase.table("video_interview_candidates")
            .delete()
            .eq("id", candidate_id)
            .eq("org_id", org_id)
            .execute()
        )
        result_data = cast(Any, result.data) or []
        if not result_data:
            raise ValueError("Failed to delete candidate")
        return result_data[0]

    async def list_candidates(
        self, org_id: str, campaign_id: Optional[str] = None
    ) -> List[Any]:
        query = (
            self.supabase.table("video_interview_candidates")
            .select("*")
            .eq("org_id", org_id)
            .order("created_at", desc=True)
        )
        if campaign_id:
            query = query.eq("campaign_id", campaign_id)
        result = query.execute()
        return cast(Any, result.data) or []

    async def bulk_import_candidates(
        self,
        org_id: str,
        user_id: str,
        campaign_id: str,
        rows: List[Dict[str, Any]],
    ) -> List[Any]:
        campaign = await self.get_campaign(org_id, campaign_id)
        if not campaign:
            raise ValueError("Campaign not found")

        records = []
        for row in rows:
            name = (row.get("name") or "").strip()
            if not name:
                continue
            email = (row.get("email") or "").strip() or None
            phone = (row.get("phone") or "").strip() or None
            records.append(
                {
                    "org_id": org_id,
                    "created_by": user_id,
                    "campaign_id": campaign_id,
                    "interview_token": secrets.token_urlsafe(16),
                    "name": name,
                    "email": email,
                    "phone": phone,
                    "status": "pending",
                }
            )

        if not records:
            return []

        result = (
            self.supabase.table("video_interview_candidates").insert(records).execute()
        )
        return cast(Any, result.data) or []

    async def get_candidate_by_token(self, token: str) -> Dict[str, Any]:
        candidate_result = (
            self.supabase.table("video_interview_candidates")
            .select("*")
            .eq("interview_token", token)
            .single()
            .execute()
        )
        candidate = cast(Dict[str, Any], candidate_result.data or {})
        if not candidate:
            raise ValueError("Candidate not found")
        if candidate.get("status") in ("completed", "failed") or candidate.get(
            "time_expired"
        ):
            raise ValueError("Interview link expired")

        campaign_id = candidate.get("campaign_id")
        if not campaign_id:
            raise ValueError("Candidate campaign missing")
        campaign_result = (
            self.supabase.table("video_interview_campaigns")
            .select("*")
            .eq("id", campaign_id)
            .single()
            .execute()
        )
        campaign = cast(Dict[str, Any], campaign_result.data or {})
        if not campaign:
            raise ValueError("Campaign not found")

        return {
            "candidate": candidate,
            "campaign": campaign,
        }

    # ------------------------------------------------------------------
    # Sessions
    # ------------------------------------------------------------------

    async def start_session(self, token: str) -> Dict[str, Any]:
        data = await self.get_candidate_by_token(token)
        candidate = cast(Dict[str, Any], data["candidate"])
        campaign = cast(Dict[str, Any], data["campaign"])

        if candidate.get("status") not in ("pending", "in_progress"):
            raise ValueError("Interview link expired")

        if not self._is_within_schedule(campaign):
            raise ValueError("Interview window is closed")

        max_questions = campaign.get("interview_style") or 5
        if isinstance(max_questions, str):
            try:
                max_questions = int(max_questions)
            except:
                max_questions = 5

        greeting, first_question = await self._generate_conversational_start(
            candidate.get("name", "Candidate"), campaign
        )

        session_state = {
            "current_index": 0,
            "max_questions": max_questions,
            "conversation_history": [],
            "greeting": greeting,
            "mode": "conversational",
        }

        session_payload = {
            "org_id": campaign["org_id"],
            "campaign_id": campaign["id"],
            "candidate_id": candidate["id"],
            "questions": [{"question_text": first_question, "topic": "introduction"}],
            "session_state": session_state,
            "status": "in_progress",
        }
        session_result = (
            self.supabase.table("video_interview_sessions")
            .insert(session_payload)
            .execute()
        )
        session_data = cast(Any, session_result.data) or []
        if not session_data:
            raise ValueError("Failed to start session")
        session = session_data[0]

        self.supabase.table("video_interview_candidates").update(
            {
                "status": "in_progress",
                "started_at": datetime.now(timezone.utc).isoformat(),
                "latest_session_id": session["id"],
            }
        ).eq("id", candidate["id"]).execute()

        return {
            "session": session,
            "campaign": campaign,
            "candidate": candidate,
        }

    async def process_turn(self, session_id: str, answer_text: str) -> Dict[str, Any]:
        session_result = (
            self.supabase.table("video_interview_sessions")
            .select("*")
            .eq("id", session_id)
            .single()
            .execute()
        )
        session = cast(Dict[str, Any], session_result.data or {})
        if not session:
            raise ValueError("Session not found")
        if session.get("status") != "in_progress":
            raise ValueError("Session already completed")

        questions = session.get("questions") or []
        transcript = session.get("transcript") or []
        session_state = session.get("session_state") or {}
        current_index = int(session_state.get("current_index", 0))
        max_questions = int(session_state.get("max_questions", 5))
        conversation_history = session_state.get("conversation_history", [])
        is_conversational = session_state.get("mode") == "conversational"

        if current_index >= max_questions:
            return await self._finalize_session(session)

        # Check for early termination phrases
        lower_answer = answer_text.strip().lower()
        termination_phrases = ["thank you", "thanks", "that is all", "that's all", "bye", "goodbye", "i am done", "i'm done"]
        # Basic check to see if the entire turn is just a termination phrase or heavily implies it
        if any(lower_answer == tp or lower_answer.startswith(tp + " ") for tp in termination_phrases):
             # Ensure we log the candidate's last message
             conversation_history.append({"role": "candidate", "content": answer_text})
             transcript.append({
                 "question_index": current_index,
                 "question": questions[current_index] if current_index < len(questions) else {},
                 "answer": answer_text,
                 "timestamp": datetime.now(timezone.utc).isoformat(),
             })
             # Force finalization
             update_payload = {
                 "transcript": transcript,
                 "session_state": session_state,
             }
             self.supabase.table("video_interview_sessions").update(update_payload).eq("id", session_id).execute()
             return await self._finalize_session(session, transcript=transcript)

        current_question = (
            questions[current_index] if current_index < len(questions) else {}
        )

        conversation_history.append(
            {
                "role": "candidate",
                "content": answer_text,
            }
        )

        transcript.append(
            {
                "question_index": current_index,
                "question": current_question,
                "answer": answer_text,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )

        current_index += 1
        session_state["current_index"] = current_index
        session_state["conversation_history"] = conversation_history

        update_payload = {
            "transcript": transcript,
            "session_state": session_state,
        }

        self.supabase.table("video_interview_sessions").update(update_payload).eq(
            "id", session_id
        ).execute()

        if current_index >= max_questions:
            return await self._finalize_session(session, transcript=transcript)

        next_question_text = None
        if is_conversational:
            campaign = None
            if session.get("campaign_id"):
                try:
                    campaign = await self.get_campaign(
                        session["org_id"], session["campaign_id"]
                    )
                except Exception:
                    campaign = None

            if campaign:
                next_question_text = await self._generate_conversational_question(
                    conversation_history, campaign
                )

        if not next_question_text:
            if current_index < len(questions):
                next_question_text = questions[current_index].get(
                    "question_text", "Can you tell me more?"
                )
            else:
                next_question_text = (
                    "Thank you for your answer. Do you have any questions for me?"
                )

        next_question = {
            "question_text": next_question_text,
            "topic": "conversation",
        }

        if current_index >= len(questions):
            questions.append(next_question)
            self.supabase.table("video_interview_sessions").update(
                {"questions": questions}
            ).eq("id", session_id).execute()

        return {
            "session": session,
            "next_question": next_question,
            "done": current_index >= max_questions,
        }

    async def process_audio_turn(
        self,
        session_id: str,
        audio_bytes: bytes,
        input_ext: str,
    ) -> Dict[str, Any]:
        session = await self.get_session(session_id)

        wav_bytes = self.audio.convert_to_wav16k(audio_bytes, input_ext)
        speech_detected = self.audio.has_speech(wav_bytes)
        if not speech_detected:
            audio_len = max(0, len(wav_bytes) - 44)
            duration_seconds = audio_len / (self.audio.sample_rate * 2)
            if duration_seconds >= 0.4:
                transcript = self.stt.transcribe(wav_bytes)
                if transcript:
                    speech_detected = True
            if not speech_detected:
                return {
                    "session": session,
                    "done": False,
                    "speech_detected": False,
                }

        transcript = self.stt.transcribe(wav_bytes)
        result = await self.process_turn(session_id, transcript)

        audio_base64 = None
        audio_content_type = None
        next_question = result.get("next_question")
        if next_question and next_question.get("question_text"):
            try:
                audio_bytes, audio_content_type = self.tts.synthesize(
                    next_question["question_text"]
                )
                import base64

                audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
            except Exception as exc:
                logger.warning(f"TTS failed: {exc}")

        return {
            "session": result.get("session", session),
            "next_question": next_question,
            "done": result.get("done", False),
            "summary": result.get("summary"),
            "evaluation": result.get("evaluation"),
            "transcript": transcript,
            "speech_detected": True,
            "audio_base64": audio_base64,
            "audio_content_type": audio_content_type,
        }

    async def upload_recording(
        self,
        session_id: str,
        file_data: bytes,
        filename: str,
        content_type: Optional[str] = None,
        duration_seconds: Optional[int] = None,
    ) -> Any:
        await self.storage.ensure_buckets_exist()
        session_result = (
            self.supabase.table("video_interview_sessions")
            .select("*")
            .eq("id", session_id)
            .single()
            .execute()
        )
        session = cast(Dict[str, Any], session_result.data or {})
        if not session:
            raise ValueError("Session not found")
        candidate_id = session.get("candidate_id")
        if not candidate_id:
            raise ValueError("Candidate not found for session")
        upload = await self.storage.upload_file(
            file_data=file_data,
            filename=filename,
            bucket_type="interview_recordings",
            user_id=candidate_id,
            content_type=content_type,
        )

        update_payload = {
            "recording_bucket": upload.get("bucket"),
            "recording_path": upload.get("file_path"),
            "recording_content_type": content_type,
            "recording_duration_seconds": duration_seconds,
        }

        updated = (
            self.supabase.table("video_interview_sessions")
            .update(update_payload)
            .eq("id", session_id)
            .execute()
        )
        updated_data = cast(Any, updated.data) or []
        return updated_data[0] if updated_data else update_payload

    async def get_session(self, session_id: str) -> Any:
        result = (
            self.supabase.table("video_interview_sessions")
            .select("*")
            .eq("id", session_id)
            .single()
            .execute()
        )
        session = cast(Dict[str, Any], result.data or {})
        if not session:
            raise ValueError("Session not found")
        if session.get("recording_path"):
            try:
                session["signed_recording_url"] = await self.storage.get_signed_url(
                    "interview_recordings", session["recording_path"], 3600
                )
            except Exception:
                session["signed_recording_url"] = None
        return session

    async def list_sessions(
        self,
        org_id: str,
        campaign_id: Optional[str] = None,
        candidate_id: Optional[str] = None,
    ) -> List[Any]:
        query = (
            self.supabase.table("video_interview_sessions")
            .select("*")
            .eq("org_id", org_id)
            .order("created_at", desc=True)
        )
        if campaign_id:
            query = query.eq("campaign_id", campaign_id)
        if candidate_id:
            query = query.eq("candidate_id", candidate_id)
        result = query.execute()
        return cast(Any, result.data) or []

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def _generate_questions(self, payload: Dict[str, Any]) -> List[Any]:
        job_role = payload.get("job_role", "")
        description = payload.get("job_description_text", "")
        count = int(payload.get("num_questions") or 5)
        count = max(1, min(20, count))
        difficulty = (payload.get("question_difficulty") or "medium").lower()
        basis = payload.get("question_basis") or ["job_description", "job_role"]
        basis_text = ", ".join(basis)
        prompt = (
            f"Generate {count} concise video interview questions as JSON array. "
            f"Difficulty level: {difficulty}. "
            f"Question basis: {basis_text}. "
            "Each item must include: question_text, topic, difficulty, expected_duration_minutes. "
            f"Job role: {job_role}. Job description: {description}"
        )
        try:
            result = await self.llm.generate_completion(
                prompt=prompt,
                system_prompt="Return valid JSON array only.",
                temperature=0.2,
                max_tokens=600,
            )
            raw = result.get("response", "[]")
            return cast(Any, self._safe_parse_json_array(raw))
        except Exception as exc:
            logger.warning(f"Question generation failed: {exc}")
            return []

    async def _finalize_session(
        self, session: Dict[str, Any], transcript: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        transcript_list = cast(
            List[Dict[str, Any]], transcript or session.get("transcript") or []
        )
        summary, evaluation = await self._generate_summary(transcript_list)
        now = datetime.now(timezone.utc)
        duration_seconds = None
        if session.get("started_at"):
            try:
                start_value = session["started_at"]
                if isinstance(start_value, str):
                    start = datetime.fromisoformat(start_value.replace("Z", "+00:00"))
                else:
                    start = start_value
                duration_seconds = int((now - start).total_seconds())
            except Exception:
                duration_seconds = None

        update_payload = {
            "status": "completed",
            "ended_at": now.isoformat(),
            "duration_seconds": duration_seconds,
            "interview_summary": summary,
            "evaluation": evaluation,
            "transcript": transcript_list,
        }

        updated = (
            self.supabase.table("video_interview_sessions")
            .update(update_payload)
            .eq("id", session.get("id"))
            .execute()
        )
        updated_data = cast(Any, updated.data) or []

        candidate_id = session.get("candidate_id")
        if candidate_id:
            self.supabase.table("video_interview_candidates").update(
                {"status": "completed", "ended_at": now.isoformat()}
            ).eq("id", candidate_id).execute()

        return {
            "session": updated_data[0] if updated_data else session,
            "next_question": None,
            "done": True,
            "summary": summary,
            "evaluation": evaluation,
        }

    async def _generate_summary(
        self, transcript: List[Dict[str, Any]]
    ) -> tuple[str, Dict[str, Any]]:
        prompt = (
            "You are an interviewer assistant. Summarize the candidate answers and provide JSON with keys: "
            "summary, strengths, weaknesses, recommendation (strong_hire|hire|maybe|no_hire). "
            f"Transcript: {json.dumps(transcript)}"
        )
        try:
            result = await self.llm.generate_completion(
                prompt=prompt,
                system_prompt="Return valid JSON only.",
                temperature=0.2,
                max_tokens=500,
            )
            raw = result.get("response", "{}")
            parsed = cast(Any, json.loads(raw))
            return parsed.get("summary", ""), parsed
        except Exception as exc:
            logger.warning(f"Summary generation failed: {exc}")
            return "", {}

    async def _generate_followup_question(
        self, transcript: List[Dict[str, Any]], campaign: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        prompt = (
            "Generate one concise follow-up interview question as JSON with keys: "
            "question_text, topic, difficulty, expected_duration_minutes. "
            f"Role: {campaign.get('job_role')}. Transcript: {json.dumps(transcript[-2:])}"
        )
        try:
            result = await self.llm.generate_completion(
                prompt=prompt,
                system_prompt="Return valid JSON only.",
                temperature=0.3,
                max_tokens=200,
            )
            raw = result.get("response", "{}")
            parsed = json.loads(raw)
            if isinstance(parsed, dict) and parsed.get("question_text"):
                return parsed
        except Exception as exc:
            logger.warning(f"Follow-up generation failed: {exc}")
        return None

    async def _generate_conversational_start(
        self, candidate_name: str, campaign: Dict[str, Any]
    ) -> tuple[str, str]:
        """Generate greeting and first question for conversational interview."""
        job_role = campaign.get("job_role", "the position")
        job_desc = campaign.get("job_description_text", "")[:500]
        tech_req = campaign.get("technical_requirements", "")[:300]

        prompt = f"""You are a professional interviewer. Generate:
1. A warm greeting (1-2 sentences)
2. One opening interview question

Greeting should introduce yourself and the interview.
Question should be about {job_role} and be conversational.

Return as JSON: {{"greeting": "...", "question": "..."}}"""

        try:
            result = await self.llm.generate_completion(
                prompt=prompt,
                system_prompt="You are a professional interviewer. Return valid JSON only.",
                temperature=0.5,
                max_tokens=300,
            )
            raw = result.get("response", "{}")
            parsed = json.loads(raw)
            greeting = parsed.get(
                "greeting", f"Hi {candidate_name}! Welcome to the interview."
            )
            question = parsed.get(
                "question",
                f"Can you tell me about yourself and your experience with {job_role}?",
            )
            return greeting, question
        except Exception as exc:
            logger.warning(f"Conversational start generation failed: {exc}")
            greeting = f"Hi {candidate_name}! I'm excited to speak with you today about the {job_role} position."
            question = f"Can you tell me about yourself and your relevant experience?"
            return greeting, question

    async def _generate_conversational_question(
        self, conversation_history: List[Dict[str, Any]], campaign: Dict[str, Any]
    ) -> Optional[str]:
        """Generate next conversational question based on history."""
        job_role = campaign.get("job_role", "the position")
        job_desc = campaign.get("job_description_text", "")[:500]

        history_text = "\n".join(
            [
                f"{h.get('role', 'unknown')}: {h.get('content', '')}"
                for h in conversation_history[-6:]
            ]
        )

        prompt = f"""You are a professional interviewer conducting a conversational interview for {job_role}.

Conversation so far:
{history_text}

Generate ONE follow-up question that:
- Is natural and conversational
- Builds on what the candidate just said
- Keeps the interview flowing smoothly
- Is different from previous questions
- *Crucially*: If this is early in the interview, and the candidate hasn't clearly stated their specific area of expertise or core skills within {job_role}, ask them to clarify it.

Return just the question as JSON: {{"question": "..."}}"""

        try:
            result = await self.llm.generate_completion(
                prompt=prompt,
                system_prompt="You are a professional interviewer. Return valid JSON only.",
                temperature=0.6,
                max_tokens=200,
            )
            raw = result.get("response", "{}")
            parsed = json.loads(raw)
            return parsed.get("question")
        except Exception as exc:
            logger.warning(f"Conversational question generation failed: {exc}")
            return None

    def _safe_parse_json_array(self, raw: str) -> List[Any]:
        """Parse JSON array from LLM output, stripping any extra text."""
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            cleaned = cleaned.replace("json", "", 1).strip()

        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, list):
                return self._normalize_questions(parsed)
            if isinstance(parsed, dict) and isinstance(parsed.get("questions"), list):
                return self._normalize_questions(
                    cast(Any, parsed.get("questions") or [])
                )
        except Exception:
            pass

        start = cleaned.find("[")
        end = cleaned.rfind("]")
        if start != -1 and end != -1 and end > start:
            snippet = cleaned[start : end + 1]
            try:
                parsed = json.loads(snippet)
                if isinstance(parsed, list):
                    return self._normalize_questions(parsed)
            except Exception:
                pass

        line_arrays = self._parse_line_json_arrays(cleaned)
        if line_arrays:
            return line_arrays

        fallback = self._parse_questions_from_text(cleaned)
        if fallback:
            return fallback

        logger.warning("Failed to parse questions JSON array")
        return []

    def _normalize_questions(self, items: List[Any]) -> List[Dict[str, Any]]:
        normalized: List[Dict[str, Any]] = []
        for item in items:
            if isinstance(item, dict) and item.get("question_text"):
                normalized.append(item)
                continue
            if isinstance(item, list) and item:
                question_text = str(item[0]).strip()
                if question_text:
                    normalized.append({"question_text": question_text})
                continue
            if isinstance(item, str) and item.strip():
                normalized.append({"question_text": item.strip()})
        return normalized

    def _parse_line_json_arrays(self, text: str) -> List[Dict[str, Any]]:
        questions: List[Dict[str, Any]] = []
        candidates = []
        for line in text.splitlines():
            line = line.strip().rstrip(",")
            if line.startswith("[") and line.endswith("]"):
                candidates.append(line)
        if not candidates:
            candidates = re.findall(r"\[[^\[\]]*\]", text)

        for item in candidates:
            try:
                parsed = json.loads(item)
            except Exception:
                continue
            if isinstance(parsed, list) and parsed:
                question_text = str(parsed[0]).strip()
                if question_text:
                    questions.append({"question_text": question_text})
        return questions

    def _parse_questions_from_text(self, text: str) -> List[Dict[str, Any]]:
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        questions: List[Dict[str, Any]] = []
        for line in lines:
            cleaned = line.lstrip("-•*")
            if cleaned[:2].isdigit() and "." in cleaned[:4]:
                cleaned = cleaned.split(".", 1)[1].strip()
            if cleaned.lower().startswith("question") and ":" in cleaned:
                cleaned = cleaned.split(":", 1)[1].strip()
            if len(cleaned) < 4:
                continue
            questions.append({"question_text": cleaned})
        return questions

    def _is_within_schedule(self, campaign: Dict[str, Any]) -> bool:
        start = campaign.get("scheduled_start_time")
        end = campaign.get("scheduled_end_time")
        grace = campaign.get("grace_period_minutes") or 0
        now = datetime.now(timezone.utc)
        if start:
            start_dt = datetime.fromisoformat(str(start).replace("Z", "+00:00"))
            if now < start_dt:
                return False
        if end:
            end_dt = datetime.fromisoformat(str(end).replace("Z", "+00:00"))
            if grace:
                end_dt = end_dt + timedelta(minutes=grace)
            if now > end_dt:
                return False
        return True


_video_interview_service: Optional[VideoInterviewService] = None


def get_video_interview_service() -> VideoInterviewService:
    global _video_interview_service
    if _video_interview_service is None:
        _video_interview_service = VideoInterviewService()
    return _video_interview_service
