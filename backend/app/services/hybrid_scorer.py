"""
Hybrid scoring system combining deterministic and LLM-based evaluation
for maximum consistency and accuracy.
"""
import re
from typing import Dict, List, Tuple
import logging

logger = logging.getLogger(__name__)


class HybridScorer:
    """
    Combines multiple scoring methods for consistent evaluation:
    1. Keyword/concept matching (deterministic)
    2. Code pattern detection (deterministic)
    3. LLM evaluation (semantic understanding)
    """

    def score_code_answer(
        self,
        question: str,
        correct_answer: str,
        candidate_answer: str,
        max_marks: float
    ) -> Dict[str, any]:
        """
        Score a coding question using hybrid approach.

        Args:
            question: The question text
            correct_answer: Expected answer
            candidate_answer: Candidate's answer
            max_marks: Maximum marks

        Returns:
            dict with deterministic_score, patterns_found, etc.
        """
        # Normalize answers for comparison
        correct_normalized = self._normalize_code(correct_answer)
        candidate_normalized = self._normalize_code(candidate_answer)

        # 1. Keyword/Concept Scoring (40% weight)
        keyword_score = self._score_keywords(
            question, correct_normalized, candidate_normalized, max_marks
        )

        # 2. Code Pattern Scoring (40% weight)
        pattern_score = self._score_code_patterns(
            correct_normalized, candidate_normalized, max_marks
        )

        # 3. Structure Scoring (20% weight)
        structure_score = self._score_structure(
            correct_normalized, candidate_normalized, max_marks
        )

        # Weighted average of deterministic scores
        deterministic_score = (
            keyword_score * 0.4 +
            pattern_score * 0.4 +
            structure_score * 0.2
        )

        return {
            "deterministic_score": round(deterministic_score, 2),
            "keyword_score": round(keyword_score, 2),
            "pattern_score": round(pattern_score, 2),
            "structure_score": round(structure_score, 2),
            "breakdown": {
                "keywords_matched": keyword_score / max_marks * 100,
                "patterns_matched": pattern_score / max_marks * 100,
                "structure_matched": structure_score / max_marks * 100
            }
        }

    def _normalize_code(self, code: str) -> str:
        """Normalize code for comparison (case-insensitive, whitespace-insensitive)."""
        if not code:
            return ""

        # Remove extra whitespace
        code = re.sub(r'\s+', ' ', code)
        # Convert to lowercase for case-insensitive comparison
        code = code.lower()
        # Remove comments (basic - Java/Python style)
        code = re.sub(r'//.*?$', '', code, flags=re.MULTILINE)
        code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
        code = re.sub(r'#.*?$', '', code, flags=re.MULTILINE)

        return code.strip()

    def _score_keywords(
        self, question: str, correct: str, candidate: str, max_marks: float
    ) -> float:
        """Score based on presence of key concepts/keywords."""
        # Extract keywords from question and correct answer
        keywords = self._extract_keywords(question, correct)

        if not keywords:
            return max_marks * 0.5  # Neutral score if no keywords

        # Check how many keywords are present in candidate answer
        matched_keywords = sum(1 for kw in keywords if kw in candidate)
        score_ratio = matched_keywords / len(keywords)

        return max_marks * score_ratio

    def _extract_keywords(self, question: str, correct: str) -> List[str]:
        """Extract key concepts from question and answer."""
        keywords = set()

        # Common programming concepts
        concepts = [
            'for', 'while', 'if', 'else', 'return', 'function',
            'class', 'array', 'list', 'loop', 'int', 'string',
            'public', 'static', 'void', 'main', 'print',
            'def', 'import', 'length', 'range', 'append'
        ]

        question_lower = question.lower()
        correct_lower = correct.lower()

        # Extract relevant concepts
        for concept in concepts:
            if concept in question_lower or concept in correct_lower:
                keywords.add(concept)

        # Extract specific patterns from question
        # e.g., "largest element" -> look for max/largest logic
        if 'largest' in question_lower or 'maximum' in question_lower:
            keywords.update(['max', 'largest', '>'])
        if 'smallest' in question_lower or 'minimum' in question_lower:
            keywords.update(['min', 'smallest', '<'])
        if 'palindrome' in question_lower:
            keywords.update(['reverse', 'equal', '=='])
        if 'fibonacci' in question_lower or 'series' in question_lower:
            keywords.update(['fibonacci', '+', 'sum'])
        if 'array' in question_lower:
            keywords.update(['array', '[', ']'])

        return list(keywords)

    def _score_code_patterns(self, correct: str, candidate: str, max_marks: float) -> float:
        """Score based on code pattern detection."""
        patterns_found = 0
        total_patterns = 0

        # Pattern 1: Loop structures
        loop_patterns = [r'for\s*\(', r'while\s*\(', r'for\s+\w+\s+in']
        if any(re.search(p, correct) for p in loop_patterns):
            total_patterns += 1
            if any(re.search(p, candidate) for p in loop_patterns):
                patterns_found += 1

        # Pattern 2: Conditional statements
        if_patterns = [r'if\s*\(', r'if\s+']
        if any(re.search(p, correct) for p in if_patterns):
            total_patterns += 1
            if any(re.search(p, candidate) for p in if_patterns):
                patterns_found += 1

        # Pattern 3: Return statements
        if 'return' in correct:
            total_patterns += 1
            if 'return' in candidate:
                patterns_found += 1

        # Pattern 4: Function/method declaration
        func_patterns = [
            r'def\s+\w+', r'function\s+\w+',
            r'(public|private|static)\s+\w+\s+\w+\s*\('
        ]
        if any(re.search(p, correct) for p in func_patterns):
            total_patterns += 1
            if any(re.search(p, candidate) for p in func_patterns):
                patterns_found += 1

        # Pattern 5: Array/list operations
        array_patterns = [r'\[\d+\]', r'\.length', r'len\(', r'\.append', r'\.push']
        if any(re.search(p, correct) for p in array_patterns):
            total_patterns += 1
            if any(re.search(p, candidate) for p in array_patterns):
                patterns_found += 1

        if total_patterns == 0:
            return max_marks * 0.5  # Neutral if no patterns

        score_ratio = patterns_found / total_patterns
        return max_marks * score_ratio

    def _score_structure(self, correct: str, candidate: str, max_marks: float) -> float:
        """Score based on overall code structure similarity."""
        if not correct or not candidate:
            return 0.0

        # Check for basic structural elements
        structure_score = 0.0
        checks = 0

        # Check 1: Similar length (within 50%)
        checks += 1
        length_ratio = min(len(candidate), len(correct)) / max(len(candidate), len(correct))
        if length_ratio > 0.5:
            structure_score += 1

        # Check 2: Presence of code blocks (curly braces or indentation)
        checks += 1
        correct_has_blocks = '{' in correct or '}' in correct
        candidate_has_blocks = '{' in candidate or '}' in candidate
        if correct_has_blocks == candidate_has_blocks:
            structure_score += 1

        # Check 3: Number of lines similarity
        checks += 1
        correct_lines = correct.count('\n')
        candidate_lines = candidate.count('\n')
        if abs(correct_lines - candidate_lines) <= 3:
            structure_score += 1

        score_ratio = structure_score / checks if checks > 0 else 0
        return max_marks * score_ratio

    def combine_with_llm_score(
        self,
        deterministic_score: float,
        llm_score: float,
        max_marks: float,
        weights: Tuple[float, float] = (0.4, 0.6)
    ) -> Dict[str, any]:
        """
        Combine deterministic and LLM scores with weighting.

        Args:
            deterministic_score: Score from pattern/keyword matching
            llm_score: Score from LLM evaluation
            max_marks: Maximum marks
            weights: Tuple of (deterministic_weight, llm_weight)

        Returns:
            dict with final_score and breakdown
        """
        det_weight, llm_weight = weights

        final_score = (
            deterministic_score * det_weight +
            llm_score * llm_weight
        )

        # Ensure score doesn't exceed max
        final_score = min(final_score, max_marks)

        return {
            "final_score": round(final_score, 2),
            "deterministic_score": round(deterministic_score, 2),
            "llm_score": round(llm_score, 2),
            "deterministic_percentage": round(deterministic_score / max_marks * 100, 1),
            "llm_percentage": round(llm_score / max_marks * 100, 1),
            "final_percentage": round(final_score / max_marks * 100, 1),
            "weights_used": {
                "deterministic": det_weight,
                "llm": llm_weight
            }
        }


# Singleton instance
_hybrid_scorer: HybridScorer = None


def get_hybrid_scorer() -> HybridScorer:
    """Get the hybrid scorer singleton."""
    global _hybrid_scorer
    if _hybrid_scorer is None:
        _hybrid_scorer = HybridScorer()
    return _hybrid_scorer
