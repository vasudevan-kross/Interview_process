"""
Voice Interview Service — conversational agent for creating technical assessments via speech.

Flow:
1. Frontend sends micro-turns (user speech transcript + session_state)
2. This service passes them to Ollama with a structured system prompt
3. Ollama extracts field values one at a time and replies naturally
4. When all fields are collected, it auto-generates questions and creates the interview
"""

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.services.llm_orchestrator import get_llm_orchestrator
from app.services.coding_interview_service import get_coding_interview_service
from app.services.question_generator import get_question_generator

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Field ordering — controls which field the agent asks about next
# ---------------------------------------------------------------------------
FIELD_ORDER = [
    "title",
    "interview_type",
    "language",           # programming language / test framework / domain tool
    "scheduled_start_time",
    "scheduled_end_time",
    "grace_period_minutes",
    "resume_required",
    "require_signature",
    "bond_details",       # bond_years + bond_terms — only when require_signature=true
    "questions_prompt",   # job description + num_questions + difficulty
]

# Fields that are ALWAYS skipped in some conditions
FIELDS_NEEDING_LANGUAGE = {"coding", "fullstack", "data_science", "both", "testing", "devops", "sql"}

# Prompt for each field
FIELD_PROMPTS: Dict[str, str] = {
    "title": "What's the title of this technical assessment?",
    "interview_type": (
        "What type of interview is this? Choose from: "
        "coding, testing, devops, sql, system_design, fullstack, data_science, or both."
    ),
    "language": "What programming language or framework should candidates use?",
    "scheduled_start_time": "When should the interview start? Please say a date and time, for example: 'March 15th at 4 PM'.",
    "scheduled_end_time": "When should it end? Say a date and time.",
    "grace_period_minutes": "How many minutes of grace period should candidates get after the end time? (or say 'default' for 15 minutes)",
    "resume_required": "Should resume upload be mandatory, optional, or disabled?",
    "require_signature": "Do you require a bond or digital signature agreement from candidates? Say yes or no.",
    "bond_details": "How many years is the bond period, and briefly describe the bond terms.",
    "questions_prompt": (
        "Finally, describe the role and what topics to cover. "
        "Also tell me how many questions (1–10) and the difficulty: easy, medium, or hard."
    ),
}


# ---------------------------------------------------------------------------
# Main service
# ---------------------------------------------------------------------------

class VoiceInterviewService:
    """Conversational agent that collects interview details via voice turns."""

    def __init__(self):
        self.llm = get_llm_orchestrator()
        self.coding_service = get_coding_interview_service()
        self.question_generator = get_question_generator()

    # ------------------------------------------------------------------
    # Public API: called per voice turn
    # ------------------------------------------------------------------

    async def process_turn(
        self,
        message: str,
        session_state: Dict[str, Any],
        user_id: str,
        user_timezone_offset: int = 330,  # minutes ahead of UTC, default IST (+5:30)
    ) -> Dict[str, Any]:
        """
        Process one conversation turn.

        Args:
            message: The user's latest speech transcript
            session_state: All previously collected fields + conversation history
            user_id: Auth user ID (for interview creation)
            user_timezone_offset: Browser UTC offset in minutes (positive = ahead of UTC)

        Returns:
            { reply, session_state, done, interview_id?, access_token?, shareable_link? }
        """
        try:
            # Init state if fresh session
            if "collected" not in session_state:
                session_state["collected"] = {}
            if "history" not in session_state:
                session_state["history"] = []
            if "current_field" not in session_state:
                session_state["current_field"] = FIELD_ORDER[0]

            current_field = session_state["current_field"]
            collected = session_state["collected"]
            history = session_state["history"]

            # Append user turn to history
            history.append({"role": "user", "content": message})

            # Ask Ollama to extract the current field from the user's message
            extracted, reply = await self._extract_field(
                current_field=current_field,
                user_message=message,
                collected=collected,
                history=history,
                user_timezone_offset=user_timezone_offset,
            )

            # If extraction succeeded, save the field and advance
            if extracted is not None:
                collected.update(extracted)
                next_field = self._next_field(current_field, collected)
                session_state["current_field"] = next_field
                session_state["collected"] = collected

                if next_field is None:
                    # All fields collected → generate questions + create interview
                    history.append({"role": "assistant", "content": reply})
                    session_state["history"] = history
                    return await self._finalize(
                        collected=collected,
                        session_state=session_state,
                        user_id=user_id,
                        user_timezone_offset=user_timezone_offset,
                    )
                else:
                    # Ask next field
                    next_prompt = FIELD_PROMPTS[next_field]
                    full_reply = f"{reply} {next_prompt}".strip()
                    history.append({"role": "assistant", "content": full_reply})
                    session_state["history"] = history
                    return {
                        "reply": full_reply,
                        "session_state": session_state,
                        "done": False,
                    }
            else:
                # Could not extract — ask again
                fallback = reply or f"Sorry, I didn't catch that. {FIELD_PROMPTS[current_field]}"
                history.append({"role": "assistant", "content": fallback})
                session_state["history"] = history
                return {
                    "reply": fallback,
                    "session_state": session_state,
                    "done": False,
                }

        except Exception as e:
            logger.error(f"VoiceInterviewService.process_turn error: {e}")
            raise

    def get_opening_message(self) -> Dict[str, Any]:
        """Return the first message shown when the voice modal opens."""
        first_prompt = FIELD_PROMPTS[FIELD_ORDER[0]]
        reply = f"Hi! Let's create a technical assessment together. {first_prompt}"
        return {
            "reply": reply,
            "session_state": {"collected": {}, "history": [], "current_field": FIELD_ORDER[0]},
            "done": False,
        }

    # ------------------------------------------------------------------
    # Field extraction via Ollama
    # ------------------------------------------------------------------

    async def _extract_field(
        self,
        current_field: str,
        user_message: str,
        collected: Dict[str, Any],
        history: List[Dict[str, str]],
        user_timezone_offset: int = 330,
    ) -> Tuple[Optional[Dict[str, Any]], str]:
        """
        Ask Ollama to extract the target field from the user message.
        Returns (extracted_dict_or_None, reply_text).
        """
        system_prompt = self._build_system_prompt(current_field, collected, user_timezone_offset)
        recent_history = history[-6:]  # Last 3 turns for context
        history_text = "\n".join(
            f"{h['role'].upper()}: {h['content']}" for h in recent_history[:-1]
        )

        prompt = f"""Conversation so far:
{history_text}

USER just said: "{user_message}"

Task: Extract the value for field "{current_field}" from the USER's message.
Return ONLY a valid JSON object with exactly these keys:
- "extracted": the extracted value (null if you cannot extract a clear value)
- "reply": a brief friendly confirmation (if extracted) or a clarifying question (if not)

Examples for field "{current_field}":
{self._get_field_examples(current_field, collected, user_timezone_offset)}

JSON:"""

        try:
            result = await self.llm.generate_completion(
                prompt=prompt,
                system_prompt=system_prompt,
                temperature=0.2,
                max_tokens=300,
            )
            raw = result.get("response", "")
            parsed = self._parse_json_response(raw)

            if parsed and parsed.get("extracted") is not None:
                value = parsed["extracted"]
                field_dict = self._map_extracted_to_fields(current_field, value, collected)
                return field_dict, parsed.get("reply", "Got it!")
            else:
                return None, parsed.get("reply", "") if parsed else ""

        except Exception as e:
            logger.warning(f"Ollama extraction failed for field {current_field}: {e}")
            return None, ""

    def _build_system_prompt(self, current_field: str, collected: Dict[str, Any], user_timezone_offset: int = 330) -> str:
        already = json.dumps(collected, ensure_ascii=False, default=str)
        user_tz = timezone(timedelta(minutes=user_timezone_offset))
        now_local = datetime.now(timezone.utc).astimezone(user_tz)
        now_str = now_local.strftime("%Y-%m-%d %H:%M")
        return f"""You are a friendly voice assistant that helps interviewers create technical assessments.
You are currently collecting the field: "{current_field}".
Fields already collected: {already}
Current date and time (user's local time): {now_str}
Always respond with valid JSON only. No markdown, no code blocks, just JSON.
Be concise and friendly in your replies."""

    def _get_field_examples(self, field: str, collected: Dict[str, Any] = {}, user_timezone_offset: int = 330) -> str:
        user_tz = timezone(timedelta(minutes=user_timezone_offset))
        now_local = datetime.now(timezone.utc).astimezone(user_tz)
        today = now_local.strftime("%Y-%m-%d")
        tomorrow = (now_local + timedelta(days=1)).strftime("%Y-%m-%d")

        # Build start-time context for end_time examples
        start_iso = collected.get("scheduled_start_time", "")
        if start_iso and re.match(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}", str(start_iso)):
            try:
                start_dt = datetime.strptime(str(start_iso), "%Y-%m-%d %H:%M")
                end_example = (start_dt + timedelta(hours=1)).strftime("%Y-%m-%d %H:%M")
                end_hint = f'If user says "one hour after start" → {{"extracted": "{end_example}", "reply": "End time set to {end_example}."}} '
            except ValueError:
                end_hint = ""
        else:
            end_hint = ""

        examples = {
            "title": 'If user says "Python fresher developer" → {{"extracted": "Python Fresher Developer", "reply": "Great! The title is Python Fresher Developer."}}',
            "interview_type": 'If user says "coding" → {{"extracted": "coding", "reply": "Got it, coding interview."}}',
            "language": 'If user says "python" → {{"extracted": "python", "reply": "Python it is!"}}',
            "scheduled_start_time": (
                f'Always return extracted as "YYYY-MM-DD HH:MM" in 24-hour format using the provided current date/time as reference. '
                f'If user says "5 PM" or "5 PM today" → {{"extracted": "{today} 17:00", "reply": "Start time set to 5 PM today."}} '
                f'If user says "tomorrow at 4 PM" → {{"extracted": "{tomorrow} 16:00", "reply": "Start time set to 4 PM tomorrow."}} '
                f'If user says "10 AM" → {{"extracted": "{today} 10:00", "reply": "Start time set to 10 AM today."}}'
            ),
            "scheduled_end_time": (
                f'Always return extracted as "YYYY-MM-DD HH:MM" in 24-hour format. '
                f'Use the start time from already collected fields to resolve relative expressions. '
                f'{end_hint}'
                f'If user says "6 PM" → {{"extracted": "{today} 18:00", "reply": "End time set to 6 PM."}} '
                f'If user says "two hours after start" → add 2 hours to the collected start time.'
            ),
            "grace_period_minutes": 'If user says "15 minutes" → {{"extracted": 15, "reply": "15-minute grace period."}} If user says "default" → {{"extracted": 15, "reply": "I\'ll use the default 15 minutes."}}',
            "resume_required": 'If user says "mandatory" → {{"extracted": "mandatory", "reply": "Resume will be mandatory."}}',
            "require_signature": 'If user says "yes" → {{"extracted": true, "reply": "Bond agreement enabled."}} If user says "no" → {{"extracted": false, "reply": "No bond required."}}',
            "bond_details": 'If user says "2 years, return original certificates" → {{"extracted": {{"years": 2, "terms": "Candidates must serve a 2-year bond. Original certificates collected and returned after completion."}}, "reply": "Bond details saved."}}',
            "questions_prompt": 'If user says "5 medium Python backend questions about OOP and APIs" → {{"extracted": {{"job_description": "Python backend developer role requiring OOP and REST API knowledge", "num_questions": 5, "difficulty": "medium"}}, "reply": "I\'ll generate 5 medium questions on Python OOP and APIs."}}',
        }
        return examples.get(field, "")

    def _map_extracted_to_fields(
        self, current_field: str, value: Any, collected: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Convert extracted raw value into the correct field dict."""
        if current_field == "bond_details":
            if isinstance(value, dict):
                return {
                    "bond_years": int(value.get("years", 2)),
                    "bond_terms": str(value.get("terms", "")),
                }
            return {"bond_years": 2, "bond_terms": str(value)}

        if current_field == "questions_prompt":
            if isinstance(value, dict):
                return {
                    "job_description": str(value.get("job_description", "")),
                    "num_questions": int(value.get("num_questions", 3)),
                    "difficulty": str(value.get("difficulty", "medium")),
                }
            return {"job_description": str(value), "num_questions": 3, "difficulty": "medium"}

        if current_field == "require_signature":
            return {"require_signature": bool(value)}

        if current_field == "grace_period_minutes":
            return {"grace_period_minutes": int(value) if str(value).isdigit() else 15}

        if current_field == "language":
            interview_type = collected.get("interview_type", "coding")
            if interview_type == "testing":
                return {"test_framework": str(value), "programming_language": str(value)}
            elif interview_type in ("devops", "sql"):
                return {"domain_tool": str(value), "programming_language": str(value)}
            else:
                return {"programming_language": str(value)}

        return {current_field: value}

    # ------------------------------------------------------------------
    # Field ordering / skipping
    # ------------------------------------------------------------------

    def _next_field(self, current_field: str, collected: Dict[str, Any]) -> Optional[str]:
        """Return the next field that needs to be collected, or None if done."""
        idx = FIELD_ORDER.index(current_field)
        for field in FIELD_ORDER[idx + 1:]:
            if self._should_skip_field(field, collected):
                continue
            if field not in collected or collected.get(field) is None:
                return field
        return None  # All done

    def _should_skip_field(self, field: str, collected: Dict[str, Any]) -> bool:
        """Return True if this field should be skipped given what we already know."""
        if field == "language":
            interview_type = collected.get("interview_type", "coding")
            return interview_type not in FIELDS_NEEDING_LANGUAGE or interview_type == "system_design"
        if field == "bond_details":
            return not collected.get("require_signature", False)
        return False

    # ------------------------------------------------------------------
    # Date/time parsing
    # ------------------------------------------------------------------

    def _parse_datetime_from_text(
        self, text: str, user_timezone_offset: int, reference_dt: Optional[datetime] = None
    ) -> Optional[datetime]:
        """
        Best-effort parse of natural language date/time strings.
        user_timezone_offset: minutes ahead of UTC (e.g. 330 for IST +5:30).
        Returns a timezone-aware datetime.
        """
        now_utc = datetime.now(timezone.utc)
        user_tz = timezone(timedelta(minutes=user_timezone_offset))
        now_local = now_utc.astimezone(user_tz)
        ref = reference_dt or now_local

        text = text.lower().strip()

        # Priority 1: ISO "YYYY-MM-DD HH:MM" — the LLM is instructed to return this format
        m = re.search(r"(\d{4})-(\d{2})-(\d{2})[t ](\d{2}):(\d{2})", text)
        if m:
            try:
                year, month, day, hour, minute = (int(x) for x in m.groups())
                return datetime(year, month, day, hour, minute, tzinfo=user_tz)
            except ValueError:
                pass

        # Fallback: natural language patterns "10th march at 4 pm", "march 15 2pm"
        patterns = [
            r"(\d{1,2})[a-z]* (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* (?:at )?(\d{1,2})(?::(\d{2}))? *(am|pm)?",
            r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* (\d{1,2}),? (?:at )?(\d{1,2})(?::(\d{2}))? *(am|pm)?",
        ]

        month_map = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
                     "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}

        for p in patterns:
            m = re.search(p, text)
            if m:
                try:
                    groups = m.groups()
                    if groups[0] and groups[0].isdigit():
                        day = int(groups[0])
                        month = month_map.get(groups[1][:3], now_local.month)
                        hour = int(groups[2])
                        minute = int(groups[3] or 0)
                        ampm = groups[4]
                        year = now_local.year
                        if ampm == "pm" and hour != 12:
                            hour += 12
                        elif ampm == "am" and hour == 12:
                            hour = 0
                    else:
                        month = month_map.get(groups[0][:3], now_local.month)
                        day = int(groups[1])
                        hour = int(groups[2])
                        minute = int(groups[3] or 0)
                        ampm = groups[4]
                        year = now_local.year
                        if ampm == "pm" and hour != 12:
                            hour += 12
                        elif ampm == "am" and hour == 12:
                            hour = 0
                    dt = datetime(year, month, day, hour, minute, tzinfo=user_tz)
                    return dt
                except (ValueError, TypeError):
                    continue

        # Relative patterns
        base = ref.replace(second=0, microsecond=0)

        # "today at 4 pm"
        m = re.search(r"today (?:at )?(\d{1,2})(?::(\d{2}))? *(am|pm)?", text)
        if m:
            hour, minute, ampm = m.groups()
            hour = int(hour)
            minute = int(minute or 0)
            if ampm == "pm" and hour != 12:
                hour += 12
            elif ampm == "am" and hour == 12:
                hour = 0
            return base.replace(hour=hour, minute=minute)

        # "tomorrow at 4 pm"
        m = re.search(r"tomorrow (?:at )?(\d{1,2})(?::(\d{2}))? *(am|pm)?", text)
        if m:
            hour, minute, ampm = m.groups()
            hour = int(hour)
            minute = int(minute or 0)
            if ampm == "pm" and hour != 12:
                hour += 12
            elif ampm == "am" and hour == 12:
                hour = 0
            return (base + timedelta(days=1)).replace(hour=hour, minute=minute)

        # Just a time like "4 pm" or "16:30" — relative to reference
        m = re.search(r"^(\d{1,2})(?::(\d{2}))? *(am|pm)?$", text.strip())
        if m:
            hour, minute, ampm = m.groups()
            hour = int(hour)
            minute = int(minute or 0)
            if ampm == "pm" and hour != 12:
                hour += 12
            elif ampm == "am" and hour == 12:
                hour = 0
            return ref.replace(hour=hour, minute=minute)

        return None

    def _resolve_datetimes(
        self, collected: Dict[str, Any], user_timezone_offset: int
    ) -> Tuple[Optional[datetime], Optional[datetime]]:
        """Convert raw time strings to datetime objects."""
        start_text = str(collected.get("scheduled_start_time", ""))
        end_text = str(collected.get("scheduled_end_time", ""))

        start_dt = self._parse_datetime_from_text(start_text, user_timezone_offset)
        end_dt = self._parse_datetime_from_text(end_text, user_timezone_offset, reference_dt=start_dt)

        # Ensure end_dt is after start_dt
        if start_dt and end_dt and end_dt <= start_dt:
            end_dt = start_dt + timedelta(hours=2)

        return start_dt, end_dt

    # ------------------------------------------------------------------
    # Final creation step
    # ------------------------------------------------------------------

    async def _finalize(
        self,
        collected: Dict[str, Any],
        session_state: Dict[str, Any],
        user_id: str,
        user_timezone_offset: int,
    ) -> Dict[str, Any]:
        """Generate questions and create the interview."""
        try:
            interview_type = collected.get("interview_type", "coding")
            programming_language = collected.get("programming_language", "python")
            job_description = collected.get("job_description", "General technical interview")
            num_questions = int(collected.get("num_questions", 3))
            difficulty = collected.get("difficulty", "medium")

            # Step 1: Generate questions
            questions = await self.question_generator.generate_questions_for_domain(
                domain=interview_type,
                job_description=job_description,
                difficulty=difficulty,
                num_questions=num_questions,
                domain_tool=collected.get("domain_tool"),
                programming_language=programming_language if interview_type not in ("testing",) else None,
                test_framework=collected.get("test_framework") if interview_type == "testing" else None,
            )

            # Distribute marks evenly
            total_marks = 100
            marks_per_q = total_marks // len(questions) if questions else 10
            remainder = total_marks - marks_per_q * len(questions)
            for i, q in enumerate(questions):
                q["marks"] = marks_per_q + (1 if i < remainder else 0)

            # Step 2: Parse datetimes
            start_dt, end_dt = self._resolve_datetimes(collected, user_timezone_offset)
            if not start_dt or not end_dt:
                # Fallback: start in 1 hour, end in 3 hours
                user_tz = timezone(timedelta(minutes=user_timezone_offset))
                now_local = datetime.now(timezone.utc).astimezone(user_tz)
                start_dt = now_local + timedelta(hours=1)
                end_dt = start_dt + timedelta(hours=2)

            # Step 3: Create interview via existing service
            result = await self.coding_service.create_interview(
                title=str(collected.get("title", "Technical Assessment")),
                description=collected.get("description", ""),
                scheduled_start_time=start_dt,
                scheduled_end_time=end_dt,
                programming_language=programming_language,
                interview_type=interview_type,
                questions_data=questions,
                user_id=user_id,
                grace_period_minutes=int(collected.get("grace_period_minutes", 15)),
                resume_required=str(collected.get("resume_required", "mandatory")),
                bond_terms=collected.get("bond_terms"),
                require_signature=bool(collected.get("require_signature", False)),
                bond_years=int(collected.get("bond_years", 2)),
                bond_timing="before_submission",
            )

            return {
                "reply": (
                    f"Your assessment '{collected.get('title')}' is ready! "
                    f"I generated {len(questions)} {difficulty} questions. "
                    "You can now share the link with candidates."
                ),
                "session_state": session_state,
                "done": True,
                "interview_id": result.get("interview_id"),
                "access_token": result.get("access_token"),
                "shareable_link": result.get("shareable_link", ""),
            }

        except Exception as e:
            logger.error(f"VoiceInterviewService._finalize error: {e}")
            raise

    # ------------------------------------------------------------------
    # JSON parsing helper
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_json_response(raw: str) -> Optional[Dict[str, Any]]:
        """Extract JSON from Ollama response, stripping markdown code fences."""
        raw = raw.strip()
        # Strip ```json ... ```
        raw = re.sub(r"```json\s*", "", raw)
        raw = re.sub(r"```\s*", "", raw)
        raw = raw.strip()
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            # Try to find first { ... } block
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            if m:
                try:
                    return json.loads(m.group())
                except json.JSONDecodeError:
                    pass
        return None


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

_voice_service: Optional[VoiceInterviewService] = None


def get_voice_interview_service() -> VoiceInterviewService:
    global _voice_service
    if _voice_service is None:
        _voice_service = VoiceInterviewService()
    return _voice_service
