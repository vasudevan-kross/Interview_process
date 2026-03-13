"""
VAPI Prompt Generator Service

Generates optimized VAPI system prompts using Ollama LLM.
"""

from typing import Dict, Any, List
import json
import logging
import ollama

from app.core.config import get_settings

logger = logging.getLogger(__name__)


class VAPIPromptGenerator:
    """
    Service for generating VAPI system prompts using Ollama LLM.

    Uses Llama3.1:8b for better quality prompt generation with temperature 0.7.
    """

    def __init__(self):
        self.settings = get_settings()
        self.model = "llama3.1:8b"  # Upgraded for better prompt quality
        self.temperature = 0.7  # Balanced creativity for prompt generation
        self.base_url = self.settings.OLLAMA_BASE_URL

    async def generate_system_prompt(
        self,
        job_role: str,
        custom_questions: List[str],
        required_fields: List[str],
        interview_persona: str,
        candidate_type: str,
        interview_style: str = "conversational",
        job_description_text: str = None,
        technical_requirements: str = None
    ) -> Dict[str, Any]:
        """
        Generate optimized VAPI system prompt using Ollama.

        Args:
            job_role: Job title/role for the interview
            custom_questions: List of custom questions to ask
            required_fields: List of fields to extract
            interview_persona: Tone/style (professional, casual, technical)
            candidate_type: Target candidate level (fresher, experienced, general)
            interview_style: structured/adaptive/conversational
            job_description_text: Full job description for context
            technical_requirements: Technical skills needed

        Returns:
            Dict containing:
            - system_prompt: Generated VAPI system prompt text
            - structured_data_schema: Field schema for extraction
            - expected_questions: List of questions the agent will ask
            - conversation_flow: Description of interview structure
        """
        logger.info(f"Generating VAPI prompt for role: {job_role}, persona: {interview_persona}, style: {interview_style}")

        # Build meta-prompt (system prompt for the LLM)
        system_prompt_for_llm = self._build_meta_prompt(interview_style)

        # Build user prompt with campaign details
        user_prompt_for_llm = self._build_user_prompt(
            job_role, custom_questions, required_fields,
            interview_persona, candidate_type, interview_style,
            job_description_text, technical_requirements
        )

        try:
            # Call Ollama
            logger.debug(f"Calling Ollama model: {self.model}")
            response = ollama.chat(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt_for_llm},
                    {"role": "user", "content": user_prompt_for_llm}
                ],
                options={
                    "temperature": self.temperature,
                    "seed": 42,
                    "num_predict": 2000  # Allow longer responses for detailed prompts
                }
            )

            # Extract and parse JSON response (handle both dict and Pydantic response)
            if hasattr(response, 'message'):
                response_text = response.message.content or ''
            else:
                response_text = response["message"]["content"]
            logger.debug(f"Ollama response length: {len(response_text)} characters")

            generated_config = self._extract_json_from_response(response_text)

            logger.info(f"Successfully generated prompt with {len(generated_config.get('expected_questions', []))} questions")
            return generated_config

        except Exception as e:
            logger.error(f"Failed to generate prompt with Ollama: {str(e)}")
            # Return fallback template
            return self._get_fallback_template(job_role, required_fields)

    def _build_meta_prompt(self, interview_style: str = "conversational") -> str:
        """
        System prompt for the LLM to generate VAPI interview prompts.

        This prompt instructs the LLM on how to create effective VAPI system prompts.
        """

        style_guidance = {
            "structured": "Follow a fixed list of questions in order. Be systematic and thorough.",
            "adaptive": "Start with core questions, then ask follow-up questions based on candidate responses. Be dynamic.",
            "conversational": "Have a natural, flowing conversation. Ask questions organically based on context. Be flexible and adaptive."
        }

        return f"""You are an expert prompt engineer specializing in voice AI interview systems.
Your task is to generate optimized system prompts for VAPI voice agents that conduct phone interviews.

CRITICAL: The system prompt you generate will be used by VAPI AI to act as the INTERVIEWER.
- VAPI AI = THE INTERVIEWER (asks questions)
- The person on the phone = THE CANDIDATE (answers questions)
- VAPI should NEVER introduce itself as a candidate or answer its own questions
- VAPI should ONLY ask questions and listen to responses

INTERVIEW STYLE: {interview_style}
Style Guidance: {style_guidance.get(interview_style, style_guidance["conversational"])}

VAPI SYSTEM PROMPT REQUIREMENTS:
1. **Clear Role Definition:** The prompt MUST start with "You are a technical interviewer for [job role]. Your role is to ask questions and evaluate the candidate's responses."
2. **Conversational Tone:** Natural, warm, professional voice conversation style
3. **Dynamic Questioning:** For adaptive/conversational styles, include instructions to ask follow-up questions based on candidate responses
4. **Clear Instructions:** Step-by-step interview flow with handling for edge cases
5. **Clarification Handling:** Instructions for what to do when candidates are unclear
6. **Data Extraction:** Specific fields to extract and how to ask for them
7. **Graceful Closings:** Thank candidates and explain next steps
8. **IMPORTANT FOR FRESHERS:** If the candidate type is "fresher", the system prompt MUST:
   - Start with self-introduction questions (name, college, degree, graduation year)
   - Ask "Which programming language or framework are you most comfortable with?"
   - Based on their answer, ask BASIC FUNDAMENTAL questions about that specific technology
   - Focus on THEORY and BASICS (e.g., "Can you explain what is OOPs?" not "How did you implement microservices?")
   - Ask about college projects and internships, not production systems
   - Use encouraging tone, they're just starting their career
   - Avoid advanced concepts, jargon, and production-level questions

STRUCTURED DATA SCHEMA REQUIREMENTS:
- Create a JSON schema with field names matching required information
- Each field must have: type (string), description, and example value
- Use snake_case naming (e.g., "phone_number", "total_experience")

EXPECTED QUESTIONS FOR FRESHERS:
- Start with: "Can you introduce yourself? Tell me your name, college, degree, and graduation year"
- Then ask: "Which programming language or technology are you most comfortable with?"
- Based on answer, generate 3-5 BASIC fundamental questions about that technology
- Example for Java: "What is OOPs?", "Can you explain inheritance?", "What is polymorphism?"
- Example for Python: "What are data types in Python?", "What is a function?", "Difference between list and tuple?"
- Example for React: "What is a component?", "What are props?", "What is state?"
- Questions should be BASIC FUNDAMENTALS, not advanced concepts
- Questions should flow naturally, not sound robotic

CONVERSATION FLOW:
- Describe the overall interview structure (greeting → questions → closing)

EXAMPLES OF CORRECT vs INCORRECT BEHAVIOR:

❌ WRONG (VAPI answering as candidate):
"Hello, I'm your interviewer. To begin, my name is John Smith, and I graduated from MIT..."

✅ CORRECT (VAPI asking as interviewer):
"Hello! Thank you for taking the time to interview with us today. Let's start with your introduction. Can you please tell me your name, which college you graduated from, your degree, and your graduation year?"

❌ WRONG (VAPI answering its own question):
"What technology are you most comfortable with? I would say it's JavaScript, particularly React..."

✅ CORRECT (VAPI asking and WAITING for response):
"Great! Now, which programming language or technology are you most comfortable with?" [WAIT FOR CANDIDATE TO RESPOND]

The system prompt should make it CRYSTAL CLEAR that VAPI is the interviewer who ONLY asks questions and listens.

Return ONLY a valid JSON object with this structure:
{{
  "system_prompt": "Full VAPI system prompt text (200-400 words)",
  "structured_data_schema": {{
    "field_name": {{
      "type": "string",
      "description": "What this field represents",
      "example": "Example value"
    }}
  }},
  "expected_questions": ["Question 1", "Question 2", ...],
  "conversation_flow": "Brief description of interview flow (50-100 words)"
}}

IMPORTANT: Return ONLY the JSON object, no other text."""

    def _build_user_prompt(
        self,
        job_role: str,
        custom_questions: List[str],
        required_fields: List[str],
        interview_persona: str,
        candidate_type: str,
        interview_style: str = "conversational",
        job_description_text: str = None,
        technical_requirements: str = None
    ) -> str:
        """
        User prompt with campaign-specific details.

        Provides the LLM with all context needed to generate a tailored prompt.
        """
        persona_guidance = {
            "professional": "Formal, respectful, corporate tone. Use complete sentences.",
            "casual": "Friendly, relaxed tone. Use contractions and informal language.",
            "technical": "Direct, technical tone. Focus on specifics and technical details."
        }

        candidate_guidance = {
            "fresher": """This is for FRESH GRADUATES (college completed, looking for first job, 0-1 year experience).

INTERVIEW FLOW FOR FRESHERS:
1. START WITH: Self-introduction (name, college, graduation year, degree)
2. ASK: Which programming language or framework are you most comfortable with?
3. BASED ON THEIR ANSWER: Ask basic fundamental questions about that technology
   - If they say Java: Ask about OOPs concepts (encapsulation, inheritance, polymorphism, abstraction), basic syntax, data types
   - If they say Python: Ask about data types, functions, OOP basics, list vs tuple, basic syntax
   - If they say JavaScript: Ask about variables (let/const/var), functions, arrays, objects, DOM basics
   - If they say React: Ask about components, props, state, hooks basics (useState, useEffect)
4. ASK ABOUT: College projects, internships (if any), what they learned
5. ASK ABOUT: Willingness to learn new technologies, career goals

QUESTION STYLE FOR FRESHERS:
- Ask BASIC fundamental questions, not advanced concepts
- Focus on THEORY and BASICS, not complex real-world scenarios
- Ask "Can you explain what is..." rather than "How did you implement..."
- Ask about academic projects, not production systems
- Be encouraging and supportive, they're just starting their career
- Avoid jargon like "microservices", "CI/CD pipelines", "production deployment"
- Ask simple yes/no questions like "Do you know what is OOPs?" before diving into details""",
            "experienced": "This is for experienced professionals (3+ years). Ask detailed questions about work history, projects, technical expertise, and leadership.",
            "general": "Adapt questions based on candidate responses. Be flexible and identify their experience level during the conversation."
        }

        style_instructions = {
            "structured": "Ask questions in a fixed order from the custom questions list. Be thorough and systematic.",
            "adaptive": "Start with core questions, then ask 2-3 follow-up questions based on their answers. Explore technical depth dynamically.",
            "conversational": "Have a natural conversation. When they mention a technology or project, ask follow-up questions to understand depth. Be dynamic and adaptive."
        }

        custom_q_section = ""
        if custom_questions:
            custom_q_section = f"\n\nCUSTOM QUESTIONS TO ASK:\n" + "\n".join(
                f"{i+1}. {q}" for i, q in enumerate(custom_questions)
            )

        job_context_section = ""
        if job_description_text:
            job_context_section += f"\n\nJOB DESCRIPTION:\n{job_description_text[:500]}"  # Truncate to 500 chars
        if technical_requirements:
            job_context_section += f"\n\nTECHNICAL REQUIREMENTS:\n{technical_requirements[:300]}"

        return f"""Generate a VAPI voice interview system prompt for the following role:

JOB ROLE: {job_role}
{job_context_section}

REQUIRED INFORMATION TO EXTRACT:
{json.dumps(required_fields, indent=2)}

INTERVIEW STYLE: {interview_style}
Style Instructions: {style_instructions.get(interview_style, style_instructions["conversational"])}

INTERVIEW PERSONA: {interview_persona}
Persona Guidance: {persona_guidance.get(interview_persona, persona_guidance["professional"])}

CANDIDATE TYPE: {candidate_type}
Candidate Guidance: {candidate_guidance.get(candidate_type, candidate_guidance["general"])}
{custom_q_section}

REQUIREMENTS FOR THE SYSTEM PROMPT:
1. **CRITICAL - Define Role Clearly:** The prompt MUST start with:
   "You are a technical interviewer conducting a phone interview for the [job role] position. Your role is to ask questions to the candidate and evaluate their responses. You are NOT the candidate. The person on the phone is the candidate who will answer your questions."

2. **Warm Greeting:** After defining the role, greet the candidate:
   "Hello! Thank you for taking the time to interview with us today. I'm going to ask you some questions to learn more about your background and skills."

3. **For FRESHERS specifically:**
   - Ask them to introduce themselves (name, college, degree, graduation year)
   - Ask which technology/language they are most comfortable with
   - Based on their answer, ask BASIC fundamental questions about that specific technology
   - Ask about college projects, internships, what they learned
   - Focus on THEORY and BASICS, not advanced real-world scenarios
   - Use encouraging, supportive tone - they're just starting their career
   - Avoid complex jargon and production-level questions

4. **For conversational/adaptive styles:** Ask follow-up questions when candidates mention specific technologies, projects, or experiences

5. **Extract all required information fields** during the conversation naturally

6. **Include the custom questions** in the flow (for structured style: in exact order; for adaptive/conversational: organically)

7. **Handle cases** where candidates don't understand or need clarification

8. **When candidate says they're done** or says goodbye, thank them and end the conversation gracefully

9. **Use the job context** to ask relevant technical questions APPROPRIATE FOR THE CANDIDATE LEVEL

10. **NEVER answer your own questions** - wait for the candidate to respond

IMPORTANT FOR FRESHERS:
- If candidate says "Java": Ask about OOPs concepts (what is encapsulation? inheritance? polymorphism? abstraction?), data types, basic syntax
- If candidate says "Python": Ask about data types, functions, OOP basics, difference between list and tuple
- If candidate says "JavaScript": Ask about variables (let vs const vs var), functions, arrays, objects, what is DOM
- If candidate says "React": Ask what is a component, what are props, what is state, basic hooks like useState
- If candidate says "HTML/CSS": Ask about basic tags, CSS selectors, box model, flexbox basics
- If candidate says "SQL": Ask what is a primary key, foreign key, joins basics, SELECT statement

Generate the complete configuration now. Return ONLY the JSON object."""

    def _extract_json_from_response(self, text: str) -> Dict[str, Any]:
        """
        Extract JSON from LLM response with robust parsing.

        Uses multi-strategy extraction pattern from test_evaluation.py.
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
        return self._get_empty_structure()

    def _get_empty_structure(self) -> Dict[str, Any]:
        """Fallback structure if JSON parsing fails."""
        return {
            "system_prompt": "You are a technical interviewer conducting a phone interview. Your role is to ask questions to the candidate and evaluate their responses. You are NOT the candidate. Ask relevant questions, listen to the candidate's answers, and gather required information. Never answer your own questions.",
            "structured_data_schema": {},
            "expected_questions": [],
            "conversation_flow": "Standard interview flow"
        }

    def _get_fallback_template(self, job_role: str, required_fields: List[str]) -> Dict[str, Any]:
        """
        Generate a simple template-based prompt if Ollama fails.
        """
        logger.info("Using fallback template for prompt generation")

        # Build simple structured data schema
        schema = {}
        for field in required_fields:
            schema[field] = {
                "type": "string",
                "description": f"{field.replace('_', ' ').title()}",
                "example": ""
            }

        system_prompt = f"""You are a technical interviewer conducting a phone interview for the {job_role} position. Your role is to ask questions to the candidate and evaluate their responses. You are NOT the candidate. The person on the phone is the candidate who will answer your questions.

Your task is to:
1. Greet the candidate warmly: "Hello! Thank you for taking the time to interview with us today."
2. Ask questions to gather the required information
3. Listen carefully to the candidate's answers
4. Ask for clarification if needed
5. NEVER answer your own questions - always wait for the candidate to respond
6. Thank the candidate at the end

Required information to collect: {', '.join(required_fields)}

Remember: You are the INTERVIEWER asking questions. The candidate is the person answering. Be professional, conversational, and friendly throughout the interview."""

        return {
            "system_prompt": system_prompt,
            "structured_data_schema": schema,
            "expected_questions": [
                "Can you please tell me your full name?",
                "What is your email address?",
                "What is your phone number?"
            ],
            "conversation_flow": "Greeting → Information gathering → Closing"
        }
