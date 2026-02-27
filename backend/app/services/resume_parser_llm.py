"""
LLM-based Resume Parser and Matcher.

Uses Ollama to parse resumes and match with job descriptions.
No PyTorch required - uses pdfplumber for PDF text extraction and LLM for parsing.
No OCR dependencies needed for resume matching.
"""

import logging
import io
import json
from typing import Dict, Any, List, Optional
from pathlib import Path
from app.services.llm_orchestrator import LLMOrchestrator

logger = logging.getLogger(__name__)

# Document processing libraries (pdfplumber only, no OCR)
try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    from docx import Document as DocxDocument
except ImportError:
    DocxDocument = None


class ResumeParserLLM:
    """Parse resumes and match with job descriptions using LLM."""

    def __init__(self):
        self.llm = LLMOrchestrator()

    def _extract_text(self, file_data: bytes, filename: str) -> str:
        """
        Extract text from a resume file using pdfplumber (PDF),
        python-docx (DOCX), or plain decode (TXT).

        No OCR is used — resumes are expected to be text-based documents.

        Args:
            file_data: File content as bytes
            filename: Original filename

        Returns:
            Extracted text string
        """
        ext = Path(filename).suffix.lower()

        if ext == '.pdf':
            return self._extract_from_pdf(file_data)
        elif ext in ('.docx', '.doc'):
            return self._extract_from_docx(file_data)
        elif ext == '.txt':
            return self._extract_from_text(file_data)
        else:
            raise ValueError(f"Unsupported resume format: {ext}. Supported: .pdf, .docx, .doc, .txt")

    def _extract_from_pdf(self, file_data: bytes) -> str:
        """Extract text from PDF using pdfplumber only (no OCR)."""
        if pdfplumber is None:
            raise RuntimeError("pdfplumber is not installed. Install with: pip install pdfplumber")

        text_content = []
        with pdfplumber.open(io.BytesIO(file_data)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_content.append(page_text)

        return "\n\n".join(text_content)

    def _extract_from_docx(self, file_data: bytes) -> str:
        """Extract text from DOCX using python-docx."""
        if DocxDocument is None:
            raise RuntimeError("python-docx is not installed. Install with: pip install python-docx")

        doc = DocxDocument(io.BytesIO(file_data))
        text_content = []

        for paragraph in doc.paragraphs:
            if paragraph.text.strip():
                text_content.append(paragraph.text)

        for table in doc.tables:
            for row in table.rows:
                row_text = ' | '.join(cell.text for cell in row.cells)
                if row_text.strip():
                    text_content.append(row_text)

        return "\n".join(text_content)

    def _extract_from_text(self, file_data: bytes) -> str:
        """Extract text from plain text file."""
        for encoding in ('utf-8', 'latin-1', 'cp1252'):
            try:
                return file_data.decode(encoding)
            except UnicodeDecodeError:
                continue
        raise ValueError("Could not decode text file with any supported encoding")

    async def parse_resume(self, file_data: bytes, filename: str) -> Dict[str, Any]:
        """
        Extract structured information from resume.

        Args:
            file_data: Resume file content
            filename: Resume filename

        Returns:
            dict with name, email, phone, skills, experience, education, summary
        """
        try:
            # Extract text from resume using pdfplumber (no OCR)
            resume_text = self._extract_text(file_data, filename)

            if not resume_text or len(resume_text.strip()) < 50:
                raise ValueError("Could not extract text from resume")

            logger.info(f"Extracted {len(resume_text)} chars from resume: {filename}")

            # Parse resume using LLM
            prompt = f"""Parse the following resume and extract structured information.

Resume Text:
{resume_text[:6000]}

Extract the following information and return as JSON:
{{
  "name": "Candidate's full name",
  "email": "Email address",
  "phone": "Phone number",
  "summary": "Brief professional summary (2-3 sentences)",
  "skills": ["skill1", "skill2", "skill3", ...],
  "experience": [
    {{
      "title": "Job title",
      "company": "Company name",
      "duration": "Duration (e.g., 2020-2022)",
      "description": "Brief description"
    }}
  ],
  "education": [
    {{
      "degree": "Degree name",
      "institution": "Institution name",
      "year": "Graduation year"
    }}
  ],
  "years_of_experience": 5
}}

Important:
- If information is not found, use null or empty array
- Extract ALL skills mentioned (technical, soft skills, tools, frameworks)
- Be thorough with experience and education

Return ONLY the JSON object, no additional text."""

            result = await self.llm.generate_completion(prompt)

            # Parse LLM response as JSON
            try:
                # Extract JSON from response (handle markdown code blocks)
                json_text = result['response'].strip()
                if json_text.startswith('```'):
                    json_text = json_text.split('```')[1]
                    if json_text.startswith('json'):
                        json_text = json_text[4:]
                json_text = json_text.strip()

                parsed_data = json.loads(json_text)

                logger.info(f"Successfully parsed resume: {parsed_data.get('name', 'Unknown')}")

                return {
                    'parsed_data': parsed_data,
                    'raw_text': resume_text,
                    'filename': filename
                }

            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse LLM response as JSON: {e}")
                logger.error(f"LLM Response: {result[:500]}")
                raise ValueError("Failed to parse resume structure from LLM response")

        except Exception as e:
            logger.error(f"Error parsing resume {filename}: {e}")
            raise

    async def match_with_job(
        self,
        resume_data: Dict[str, Any],
        job_description: str,
        job_title: str
    ) -> Dict[str, Any]:
        """
        Match resume with job description and generate score.

        Args:
            resume_data: Parsed resume data from parse_resume()
            job_description: Job description text
            job_title: Job title

        Returns:
            dict with match_score (0-100), strengths, weaknesses, recommendation
        """
        try:
            parsed = resume_data.get('parsed_data', {})
            candidate_name = parsed.get('name', 'Candidate')

            prompt = f"""Analyze how well this candidate matches the job requirements.

Job Title: {job_title}

Job Description:
{job_description[:2000]}

Candidate Information:
- Name: {parsed.get('name', 'N/A')}
- Experience: {parsed.get('years_of_experience', 0)} years
- Skills: {', '.join(parsed.get('skills', [])[:20])}
- Education: {json.dumps(parsed.get('education', [])[:3])}
- Recent Experience: {json.dumps(parsed.get('experience', [])[:3])}

Provide a detailed match analysis in JSON format:
{{
  "match_score": 85,
  "overall_assessment": "Strong match / Good match / Partial match / Weak match",
  "strengths": [
    "Has 5 years Python experience matching job requirement",
    "Strong background in cloud technologies (AWS, Docker)",
    "Relevant education in Computer Science"
  ],
  "weaknesses": [
    "No experience with Kubernetes mentioned",
    "Limited frontend development experience"
  ],
  "missing_skills": ["Kubernetes", "React"],
  "matching_skills": ["Python", "AWS", "Docker", "PostgreSQL"],
  "experience_match": "Exceeds requirements / Meets requirements / Below requirements",
  "education_match": "Strong match / Good match / Acceptable / Not relevant",
  "recommendation": "Strong recommend / Recommend / Consider / Not recommended",
  "reasoning": "Detailed explanation of the recommendation (2-3 sentences)"
}}

Important:
- match_score: 0-100 (0=no match, 100=perfect match)
- Be objective and specific
- Focus on job requirements vs candidate qualifications

Return ONLY the JSON object."""

            result = await self.llm.generate_completion(prompt)

            # Parse LLM response
            try:
                json_text = result['response'].strip()
                if json_text.startswith('```'):
                    json_text = json_text.split('```')[1]
                    if json_text.startswith('json'):
                        json_text = json_text[4:]
                json_text = json_text.strip()

                match_result = json.loads(json_text)

                logger.info(f"Match score for {candidate_name}: {match_result.get('match_score', 0)}/100")

                return match_result

            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse match result: {e}")
                logger.error(f"LLM Response: {result[:500]}")
                raise ValueError("Failed to parse match analysis from LLM response")

        except Exception as e:
            logger.error(f"Error matching resume with job: {e}")
            raise


# Singleton instance
_resume_parser_llm = None


def get_resume_parser_llm() -> ResumeParserLLM:
    """Get singleton instance of ResumeParserLLM."""
    global _resume_parser_llm
    if _resume_parser_llm is None:
        _resume_parser_llm = ResumeParserLLM()
    return _resume_parser_llm
