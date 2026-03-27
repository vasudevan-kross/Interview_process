"""Interview summary generation service using Ollama LLM."""

import logging
import json
import ollama
from typing import Dict, Any, List, Optional
from app.core.config import get_settings

logger = logging.getLogger(__name__)


class InterviewSummaryService:
    """
    Service for generating AI-powered interview summaries and technical assessments.

    Uses qwen2.5:7b for reasoning and analysis.
    """

    def __init__(self):
        self.settings = get_settings()
        self.model = "qwen2.5:7b"
        self.temperature = 0.3  # Lower temperature for more consistent analysis
        self.base_url = self.settings.OLLAMA_BASE_URL

    async def generate_summary(
        self,
        transcript: str,
        structured_data: Dict[str, Any],
        job_role: str = None,
        technical_requirements: str = None
    ) -> Dict[str, Any]:
        """
        Generate comprehensive interview summary with technical assessment.

        Args:
            transcript: Full interview transcript
            structured_data: Extracted structured data from VAPI
            job_role: Job role for context
            technical_requirements: Technical skills needed (optional)

        Returns:
            Dict containing:
            - interview_summary: 2-3 sentence overall assessment
            - key_points: List of key takeaways (5-7 points)
            - technical_assessment: Detailed skills evaluation
        """
        logger.info(f"Generating interview summary for role: {job_role}")

        # Quality gate: check if transcript has enough candidate responses
        candidate_word_count = self._count_candidate_words(transcript)
        logger.info(f"Candidate word count: {candidate_word_count}")

        if candidate_word_count < 30:
            logger.warning(
                f"⚠️ Insufficient transcript ({candidate_word_count} candidate words). "
                "Returning insufficient data result to prevent hallucination."
            )
            return self._get_insufficient_data_result(candidate_word_count)

        # Clean structured data: strip null/empty values to avoid LLM rationalizing them
        clean_data = self._clean_structured_data(structured_data)

        # Build prompt for LLM
        prompt = self._build_summary_prompt(
            transcript, clean_data, job_role, technical_requirements
        )

        try:
            # Call Ollama
            logger.debug(f"Calling Ollama model: {self.model}")
            response = ollama.chat(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert technical recruiter analyzing interview transcripts."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                options={
                    "temperature": self.temperature,
                    "seed": 42,
                    "num_predict": 1500
                }
            )

            # Extract and parse JSON response (handle both dict and Pydantic response)
            if hasattr(response, 'message'):
                response_text = response.message.content or ''
            else:
                response_text = response["message"]["content"]
            logger.debug(f"Ollama response length: {len(response_text)} characters")

            summary_data = self._extract_json_from_response(response_text)

            logger.info("✅ Successfully generated interview summary")
            return summary_data

        except Exception as e:
            logger.error(f"❌ Failed to generate summary with Ollama: {str(e)}")
            # Return fallback summary
            return self._get_fallback_summary(structured_data)

    def _count_candidate_words(self, transcript: str) -> int:
        """Count words spoken by the candidate (non-AI lines)."""
        if not transcript:
            return 0

        candidate_words = 0
        for line in transcript.strip().split("\n"):
            line = line.strip()
            # Skip AI/assistant lines
            if line.lower().startswith(("ai:", "assistant:", "bot:", "interviewer:")):
                continue
            # Count words from candidate lines (with or without "User:" prefix)
            if line.lower().startswith(("user:", "candidate:", "human:")):
                line = line.split(":", 1)[1].strip() if ":" in line else line
            candidate_words += len(line.split())
        return candidate_words

    def _clean_structured_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Strip null/empty values from structured data to prevent LLM rationalization."""
        if not data:
            return {}
        return {
            k: v for k, v in data.items()
            if v is not None and v != "" and v != [] and v != {}
        }

    def _get_insufficient_data_result(self, word_count: int) -> Dict[str, Any]:
        """Return result for interviews with insufficient candidate responses."""
        return {
            "interview_summary": (
                f"Interview incomplete — candidate provided only {word_count} words. "
                "Insufficient data to evaluate. Re-interview recommended."
            ),
            "key_points": [
                "⚠️ Interview was too short to assess the candidate",
                "⚠️ Candidate did not provide substantive responses",
                "🎯 Re-interview or alternative assessment recommended",
            ],
            "technical_assessment": {
                "skills_mentioned": [],
                "experience_level": "Unknown",
                "years_experience": "Unknown",
                "tech_stack_match_percentage": 0,
                "strengths": [],
                "gaps": ["Insufficient data to evaluate"],
                "recommendation": "No",
                "hiring_decision_confidence": "Low"
            }
        }

    def _build_summary_prompt(
        self,
        transcript: str,
        structured_data: Dict[str, Any],
        job_role: str = None,
        technical_requirements: str = None
    ) -> str:
        """Build prompt for summary generation."""

        job_context = ""
        if job_role:
            job_context = f"\n\nJOB ROLE: {job_role}"
        if technical_requirements:
            job_context += f"\nTECHNICAL REQUIREMENTS: {technical_requirements}"

        # Truncate transcript if too long (keep first 3000 chars)
        truncated_transcript = transcript[:3000] + "..." if len(transcript) > 3000 else transcript

        # Build structured data section (only if non-empty)
        structured_data_section = ""
        if structured_data:
            structured_data_section = f"\nEXTRACTED DATA:\n{json.dumps(structured_data, indent=2)}"

        return f"""Analyze this technical interview and provide a comprehensive assessment.

INTERVIEW TRANSCRIPT:
{truncated_transcript}
{structured_data_section}
{job_context}

Provide your analysis in the following JSON format:

{{
  "interview_summary": "2-3 sentence overall assessment of the candidate (strengths, experience level, suitability)",
  "key_points": [
    "✅ Technical strength or positive observation",
    "✅ Another strength or notable experience",
    "⚠️ Gap or area for improvement",
    "⚠️ Another concern or limitation",
    "🎯 Logistical detail (availability, notice period, etc.)",
    "💰 Compensation expectation",
    "📍 Location/relocation preference"
  ],
  "technical_assessment": {{
    "skills_mentioned": ["React", "Python", "AWS"],
    "experience_level": "Mid",
    "years_experience": "3-5 years",
    "tech_stack_match_percentage": 75,
    "strengths": ["Frontend Development", "Team Leadership"],
    "gaps": ["Cloud Infrastructure", "System Design"],
    "recommendation": "Yes",
    "hiring_decision_confidence": "High"
  }}
}}

CRITICAL RULES — READ CAREFULLY:
1. ONLY include information the candidate EXPLICITLY stated in the transcript. Do NOT invent, guess, or infer.
2. If the candidate did not mention a skill, do NOT put it in skills_mentioned.
3. If the candidate did not discuss experience, set experience_level to "Unknown" and years_experience to "Unknown".
4. If the interview was cut short or the candidate gave very few responses, recommendation MUST be "No" or "Pending Review" and hiring_decision_confidence MUST be "Low".
5. tech_stack_match_percentage must be 0 if no technical skills were discussed.
6. Be objective and data-driven — every claim must have evidence from the transcript.
7. Use emojis (✅ ⚠️ 🎯 💰 📍) to categorize key points.
8. Include 5-7 key_points covering technical skills, soft skills, concerns, and logistics.

IMPORTANT - Field Values:
- experience_level: Choose ONE value from: "Junior", "Mid", "Senior", "Unknown"
- recommendation: Choose ONE value from: "Strong Yes", "Yes", "Maybe", "No", "Pending Review"
- hiring_decision_confidence: Choose ONE value from: "High", "Medium", "Low"

Return ONLY the JSON object, no other text."""

    def _extract_json_from_response(self, text: str) -> Dict[str, Any]:
        """
        Extract JSON from LLM response with robust parsing.
        """
        # Remove markdown code blocks
        if text.startswith("```"):
            if text.startswith("```json"):
                text = text[7:]
            else:
                text = text[3:]
            end_marker = text.find("```")
            if end_marker != -1:
                text = text[:end_marker].strip()

        # Try direct parse
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Try finding JSON boundaries
        start_idx = text.find("{")
        end_idx = text.rfind("}")
        if start_idx != -1 and end_idx != -1:
            json_text = text[start_idx:end_idx+1]
            try:
                return json.loads(json_text)
            except json.JSONDecodeError:
                pass

        # Fallback: log error and return empty structure
        logger.warning("Failed to parse JSON from Ollama response, using fallback")
        return self._get_empty_summary()

    def _get_empty_summary(self) -> Dict[str, Any]:
        """Return empty structure if parsing fails."""
        return {
            "interview_summary": "Interview analysis unavailable.",
            "key_points": [],
            "technical_assessment": {
                "skills_mentioned": [],
                "experience_level": "Unknown",
                "years_experience": "Unknown",
                "tech_stack_match_percentage": 0,
                "strengths": [],
                "gaps": [],
                "recommendation": "Pending Review",
                "hiring_decision_confidence": "Low"
            }
        }

    def _get_fallback_summary(self, structured_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate basic summary from structured data if LLM fails.
        """
        logger.info("Using fallback summary generation")

        # Extract basic info from structured data
        skills = structured_data.get("technical_skills", [])
        if isinstance(skills, str):
            skills = [s.strip() for s in skills.split(",")]

        experience = structured_data.get("total_experience", "Unknown")

        summary = f"Candidate with {experience} of experience. Interview completed successfully."

        key_points = []
        if skills:
            key_points.append(f"✅ Skills: {', '.join(skills[:3])}")
        if structured_data.get("current_ctc"):
            key_points.append(f"💰 Current CTC: {structured_data['current_ctc']}")
        if structured_data.get("expected_ctc"):
            key_points.append(f"💰 Expected CTC: {structured_data['expected_ctc']}")
        if structured_data.get("notice_period"):
            key_points.append(f"🎯 Notice Period: {structured_data['notice_period']}")

        return {
            "interview_summary": summary,
            "key_points": key_points,
            "technical_assessment": {
                "skills_mentioned": skills[:10] if skills else [],
                "experience_level": "Mid" if "3" in str(experience) or "4" in str(experience) else "Unknown",
                "years_experience": experience,
                "tech_stack_match_percentage": 50,
                "strengths": skills[:3] if skills else [],
                "gaps": [],
                "recommendation": "Pending Review",
                "hiring_decision_confidence": "Medium"
            }
        }


# Singleton instance
_interview_summary_service: Optional[InterviewSummaryService] = None


def get_interview_summary_service() -> InterviewSummaryService:
    """Get or create InterviewSummaryService singleton."""
    global _interview_summary_service
    if _interview_summary_service is None:
        _interview_summary_service = InterviewSummaryService()
    return _interview_summary_service
