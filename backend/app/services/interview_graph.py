"""LangGraph state machine for video interviews."""

from __future__ import annotations

import json
import logging
from typing import TypedDict, List, Dict, Any, Optional

from langgraph.graph import StateGraph, END

from app.services.llm_orchestrator import get_llm_orchestrator

logger = logging.getLogger(__name__)

class InterviewState(TypedDict):
    """The state tracked across the LangGraph interview nodes."""
    # Session identifiers
    session_id: str
    org_id: str
    
    # Timing and progress
    elapsed_time_seconds: int
    target_duration_seconds: int
    current_index: int
    max_questions: int
    
    # Metadata and Identity
    candidate_name: str
    candidate_answer: str
    current_phase: str  # "introduction", "technical", "wrap_up"
    
    # Context
    topics_covered: List[str]


    current_topic: str
    weak_answer_count: int
    history: List[Dict[str, Any]]
    campaign: Dict[str, Any]
    resume_context: Optional[Dict[str, Any]]
    
    # Results
    last_ai_response: str
    should_route_to: str
    is_complete: bool
    qualification_relevant: bool


def _interview_model(state: InterviewState) -> str:
    campaign = state.get("campaign", {})
    return campaign.get("llm_model") or "llama3.1:8b"


def _safe_parse_json(raw: str) -> Dict[str, Any]:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        cleaned = cleaned.replace("json", "", 1).strip()
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass
    import re
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
    return {}


def _sanitize_name(name: str) -> Optional[str]:
    """Returns a clean display name or None if it looks like a system placeholder."""
    if not name or len(name) < 2:
        return None
    # Filter common placeholders/test IDs
    low = name.lower()
    if any(x in low for x in ["test", "candidate", "user", "davide", "dummy"]):
        # Specifically catch placeholder name hallucinations
        return None
    # Ensure it's not just non-alphabetic
    if not any(c.isalpha() for c in name):
        return None
    return name.strip()



async def analyze_turn_node(state: InterviewState) -> Dict[str, Any]:
    """Determine the next step based on candidate's answer and elapsed time."""
    llm = get_llm_orchestrator()
    answer = state.get("candidate_answer", "").strip()
    elapsed = state.get("elapsed_time_seconds", 0)
    target = state.get("target_duration_seconds", 1200)
    current_phase = state.get("current_phase", "technical")
    current_index = state.get("current_index", 0)
    
    # 1. Check time limit
    if elapsed >= (target - 30):  # 30 second buffer
        return {"should_route_to": "wrap_up"}

        
    # 2. Check for termination intent using LLM
    prompt = f"""Evaluate the candidate's response in a technical interview context.
Job Role: {state['campaign'].get('job_role')}
Candidate said: "{answer}"

Determine two things:
1. **termination_intent**: Does the candidate explicitly want to end the interview now? (e.g. "I'm done", "That's all for today", "Thanks for your time, goodbye"). 
2. **answer_quality**: Is the answer sufficient to move to a new topic, or is it too brief/vague and requires a follow-up probe on the SAME topic?

Return JSON: {{"termination_intent": bool, "is_sufficient": bool}}"""

    result = await llm.generate_completion(
        prompt=prompt,
        model=_interview_model(state),
        system_prompt="You are an interview analyst. Return valid JSON only.",
        temperature=0.1,
        max_tokens=100
    )
    analysis = _safe_parse_json(result.get("response", ""))
    
    if analysis.get("termination_intent"):
        return {"should_route_to": "wrap_up"}

    # 3. Phase-based routing
    if current_index == 1 or current_phase == "introduction":
        return {"should_route_to": "assess_qualification"}
        
    if not analysis.get("is_sufficient", True):
        weak_count = state.get("weak_answer_count", 0)
        if weak_count < 2:
            return {"should_route_to": "probe_deeper", "weak_answer_count": weak_count + 1}
        
    return {"should_route_to": "transition_topic", "weak_answer_count": 0}



async def assess_qualification_node(state: InterviewState) -> Dict[str, Any]:
    """Assess relevance of candidate background and transition to technicals."""
    llm = get_llm_orchestrator()
    job_role = state["campaign"].get("job_role", "the position")
    candidate_name = state.get("candidate_name", "Candidate")
    
    prompt = f"""A candidate has just introduced themselves for a **{job_role}** interview.
Candidate Name: {candidate_name}
Candidate said: "{state['candidate_answer']}"

Your task: acknowledge their background and transition into the first technical question.
Rules:
- 2-3 sentences max.
- Be encouraging and professional.
- Use the name '{candidate_name}' ONLY if it sounds like a real person.
- If the name looks like a test ID (e.g. 'test_1'), do NOT use it.

Return JSON: {{"response": "your response here", "relevant": bool}}"""


    result = await llm.generate_completion(
        prompt=prompt,
        model=_interview_model(state),
        system_prompt="You are a senior technical interviewer. Transition into technical topics. Return JSON.",
        temperature=0.2,
        max_tokens=300
    )
    parsed = _safe_parse_json(result.get("response", ""))
    
    return {
        "last_ai_response": parsed.get("response", "Thanks for sharing! Let's get started."),
        "current_phase": "technical",
        "qualification_relevant": parsed.get("relevant", True)
    }



async def probe_deeper_node(state: InterviewState) -> Dict[str, Any]:
    """Generate a highly specific follow-up question on the current topic."""
    llm = get_llm_orchestrator()
    role = state["campaign"].get("job_role", "position")
    topic = state.get("current_topic", "their experience")
    candidate_name = state.get("candidate_name", "Candidate")
    
    prompt = f"""You are a technical interviewer for a {role} role.
Candidate Name: {candidate_name}
The candidate's last answer was brief. 
Current Topic: {topic}
Candidate said: "{state['candidate_answer']}"

Ask ONE highly specific follow-up question to draw out more technical depth on this exactly same topic.
- Use '{candidate_name}' naturally ONLY if it sounds like a real name.
- If the name looks like a test ID (e.g. 'test_1'), do NOT use it.
- Keep to 1 sentence, conversational.

Return JSON: {{"question": "..."}}"""


    result = await llm.generate_completion(
        prompt=prompt,
        model=_interview_model(state),
        system_prompt="You are a senior technical interviewer. Return JSON.",
        temperature=0.2,
        max_tokens=200,
    )
    parsed = _safe_parse_json(result.get("response", ""))
    question = parsed.get("question", "Could you elaborate a bit more on that?")
    
    return {"last_ai_response": question}



async def transition_topic_node(state: InterviewState) -> Dict[str, Any]:
    """Transition to a new topic from the campaign."""
    llm = get_llm_orchestrator()
    campaign = state["campaign"]
    covered = state.get("topics_covered", [])
    candidate_name = state.get("candidate_name", "Candidate")
    
    topics = [
        q.get("question_text", "") for q in (campaign.get("questions") or [])
    ]
    
    prompt = f"""You are a senior technical interviewer for {campaign.get('job_role', 'role')}.
Candidate Name: {candidate_name}
Already discussed: {', '.join(covered)}
Job topics available: {json.dumps(topics)}

The candidate just answered: "{state['candidate_answer']}"

Select ONE new topic from the available job topics that hasn't been discussed. 
Transition naturally from their last answer into a question about the new topic.
- Use '{candidate_name}' naturally ONLY if it sounds like a real name.
- If it looks like a test ID, do NOT use it.
- Keep it to 1-2 sentences max. 

Return JSON: {{"new_topic": "short topic name", "question": "your full response"}}"""


    result = await llm.generate_completion(
        prompt=prompt,
        model=_interview_model(state),
        system_prompt="You are a senior technical interviewer. Return valid JSON only.",
        temperature=0.3,
        max_tokens=400,
    )
    
    parsed = _safe_parse_json(result.get("response", ""))
    question = parsed.get("question", "Let's move on. Next topic please.")
    new_topic = parsed.get("new_topic", "General")
    
    new_covered = covered.copy()
    if new_topic not in new_covered:
        new_covered.append(new_topic)
        
    return {
        "last_ai_response": question,
        "current_topic": new_topic,
        "topics_covered": new_covered
    }



async def wrap_up_node(state: InterviewState) -> Dict[str, Any]:
    """Conclude the interview gracefully."""
    llm = get_llm_orchestrator()
    role = state["campaign"].get("job_role", "position")
    
    prompt = f"The time limit for the {role} interview has been reached. Generate a polite 1-sentence wrap-up statement thanking them for their time."
    result = await llm.generate_completion(
        prompt=prompt,
        model=_interview_model(state),
        system_prompt="You are a professional HR representative.",
        temperature=0.2,
        max_tokens=100,
    )
    # Just grab text directly for wrap up
    text = result.get("response", "Thank you, that concludes our interview today.").strip()
    return {"last_ai_response": text, "is_complete": True}


def build_interview_graph() -> Any:
    """Build and compile the LangGraph for the video interview with checkpointing."""
    workflow = StateGraph(InterviewState)
    
    workflow.add_node("analyze", analyze_turn_node)
    workflow.add_node("assess_qualification", assess_qualification_node)
    workflow.add_node("probe_deeper", probe_deeper_node)
    workflow.add_node("transition_topic", transition_topic_node)
    workflow.add_node("wrap_up", wrap_up_node)
    
    workflow.set_entry_point("analyze")
    
    def router(state: InterviewState) -> str:
        return state.get("should_route_to", "transition_topic")

    workflow.add_conditional_edges(
        "analyze", 
        router,
        {
            "assess_qualification": "assess_qualification",
            "probe_deeper": "probe_deeper",
            "transition_topic": "transition_topic",
            "wrap_up": "wrap_up"
        }
    )
    
    workflow.add_edge("assess_qualification", END)
    workflow.add_edge("probe_deeper", END)
    workflow.add_edge("transition_topic", END)
    workflow.add_edge("wrap_up", END)


    
    # Use SqliteSaver for persistent checkpointing across turns
    from langgraph.checkpoint.sqlite import SqliteSaver
    import sqlite3
    
    conn = sqlite3.connect("interview_checkpoints.db", check_same_thread=False)
    memory = SqliteSaver(conn)
    
    return workflow.compile(checkpointer=memory)
