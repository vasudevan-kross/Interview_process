"""
Question Generator Service - AI-powered question generation for coding and testing interviews.

Uses Ollama codellama:7b to generate:
- Coding interview questions (algorithms, data structures, development)
- Testing/QA interview questions (test cases, automation code)
"""

import os
import json
import logging
from typing import List, Dict, Any, Optional

from app.services.llm_orchestrator import get_llm_orchestrator

logger = logging.getLogger(__name__)


class QuestionGenerator:
    """Service for generating interview questions using AI."""

    def __init__(self):
        self.llm = get_llm_orchestrator()
        self.model = os.getenv('QUESTION_GENERATION_MODEL', 'codellama:7b')

    async def generate_coding_questions(
        self,
        job_description: str,
        difficulty: str,
        num_questions: int,
        programming_language: str
    ) -> List[Dict[str, Any]]:
        """
        Generate coding interview questions using Ollama.

        Args:
            job_description: Job description or required skills
            difficulty: 'easy', 'medium', or 'hard'
            num_questions: Number of questions to generate
            programming_language: Target language (python, javascript, java, etc.)

        Returns:
            List of question dicts with question_text, starter_code, solution_code, etc.
        """
        try:
            logger.info(
                f"Generating {num_questions} {difficulty} {programming_language} questions"
            )

            prompt = f"""Generate {num_questions} {difficulty} coding interview questions for a {programming_language} developer role.

Job Description: {job_description}

Requirements:
- Generate realistic, practical coding problems
- Include starter code template
- Include reference solution
- Include test cases with input/output examples
- Cover relevant topics from job description

Return ONLY a valid JSON array with this exact structure:
[
  {{
    "question_text": "Problem description here",
    "difficulty": "{difficulty}",
    "marks": 20,
    "starter_code": "# Starter code template",
    "solution_code": "# Complete solution",
    "test_cases": [
      {{"input": "test input", "expected_output": "expected result"}}
    ],
    "topics": ["arrays", "sorting"],
    "time_estimate_minutes": 30
  }}
]

Generate {num_questions} questions now. Return ONLY the JSON array, no other text."""

            # Call Ollama
            response = await self.llm._call_ollama(
                model=self.model,
                prompt=prompt,
                temperature=0.7,
                max_tokens=4000
            )

            # Extract and parse JSON
            questions = self._extract_json_from_response(response)

            if not isinstance(questions, list) or len(questions) == 0:
                raise ValueError("Failed to generate valid questions")

            logger.info(f"Generated {len(questions)} questions successfully")
            return questions[:num_questions]  # Limit to requested number

        except Exception as e:
            logger.error(f"Error generating coding questions: {e}")
            # Return fallback questions
            return self._get_fallback_coding_questions(
                programming_language, difficulty, num_questions
            )

    async def generate_testing_questions(
        self,
        job_description: str,
        difficulty: str,
        num_questions: int,
        test_framework: str
    ) -> List[Dict[str, Any]]:
        """
        Generate testing/QA interview questions.

        Args:
            job_description: Job description or required skills
            difficulty: 'easy', 'medium', or 'hard'
            num_questions: Number of questions to generate
            test_framework: Framework (selenium-python, playwright-js, pytest, manual-test-cases)

        Returns:
            List of question dicts
        """
        try:
            logger.info(
                f"Generating {num_questions} {difficulty} {test_framework} test questions"
            )

            if test_framework == 'manual-test-cases':
                prompt = f"""Generate {num_questions} {difficulty} test case design questions for a QA engineer role.

Job Description: {job_description}

Requirements:
- Generate realistic testing scenarios
- Include expected test case structure
- Cover positive, negative, and edge cases

Return ONLY a valid JSON array:
[
  {{
    "question_text": "Design test cases for...",
    "difficulty": "{difficulty}",
    "marks": 20,
    "starter_code": "# Test Case Template\\n\\n**Test Case ID**: TC001\\n...",
    "expected_test_cases": [
      {{
        "test_case_id": "TC001",
        "description": "Valid scenario",
        "steps": ["Step 1", "Step 2"],
        "expected_result": "Expected outcome"
      }}
    ],
    "topics": ["test design", "functional testing"],
    "time_estimate_minutes": 30
  }}
]"""
            else:
                # Test automation code
                prompt = f"""Generate {num_questions} {difficulty} test automation questions using {test_framework}.

Job Description: {job_description}

Requirements:
- Generate realistic test automation scenarios
- Include starter code template with proper framework syntax
- Include reference solution
- Cover test setup, execution, assertions, teardown

Return ONLY a valid JSON array:
[
  {{
    "question_text": "Write {test_framework} code to test...",
    "difficulty": "{difficulty}",
    "marks": 20,
    "starter_code": "# Framework starter code",
    "solution_code": "# Complete solution",
    "test_scenarios": [
      "Valid scenario",
      "Invalid scenario",
      "Edge case"
    ],
    "topics": ["web automation", "assertions"],
    "time_estimate_minutes": 30
  }}
]"""

            # Call Ollama
            response = await self.llm._call_ollama(
                model=self.model,
                prompt=prompt,
                temperature=0.7,
                max_tokens=4000
            )

            # Extract and parse JSON
            questions = self._extract_json_from_response(response)

            if not isinstance(questions, list) or len(questions) == 0:
                raise ValueError("Failed to generate valid questions")

            logger.info(f"Generated {len(questions)} test questions successfully")
            return questions[:num_questions]

        except Exception as e:
            logger.error(f"Error generating testing questions: {e}")
            # Return fallback
            return self._get_fallback_testing_questions(
                test_framework, difficulty, num_questions
            )

    def _extract_json_from_response(self, response: str) -> List[Dict[str, Any]]:
        """Extract JSON array from LLM response."""
        try:
            # Try direct parse
            return json.loads(response)
        except json.JSONDecodeError:
            # Try to find JSON array in text
            start = response.find('[')
            end = response.rfind(']') + 1
            if start != -1 and end > start:
                try:
                    return json.loads(response[start:end])
                except:
                    pass

            # Try line by line
            for line in response.split('\n'):
                if line.strip().startswith('['):
                    try:
                        return json.loads(line.strip())
                    except:
                        continue

            raise ValueError("No valid JSON found in response")

    def _get_fallback_coding_questions(
        self,
        language: str,
        difficulty: str,
        num: int
    ) -> List[Dict[str, Any]]:
        """Return fallback coding questions if AI generation fails."""
        templates = {
            'python': {
                'easy': {
                    'question_text': 'Write a function to find the sum of all even numbers in a list.',
                    'starter_code': 'def sum_even_numbers(numbers):\n    # Write your code here\n    pass',
                    'solution_code': 'def sum_even_numbers(numbers):\n    return sum(n for n in numbers if n % 2 == 0)',
                    'test_cases': [
                        {'input': '[1, 2, 3, 4, 5, 6]', 'expected_output': '12'},
                        {'input': '[1, 3, 5]', 'expected_output': '0'}
                    ]
                },
                'medium': {
                    'question_text': 'Implement a function to reverse a linked list.',
                    'starter_code': 'class ListNode:\n    def __init__(self, val=0, next=None):\n        self.val = val\n        self.next = next\n\ndef reverse_list(head):\n    # Write your code here\n    pass',
                    'solution_code': 'def reverse_list(head):\n    prev = None\n    current = head\n    while current:\n        next_node = current.next\n        current.next = prev\n        prev = current\n        current = next_node\n    return prev',
                    'test_cases': [
                        {'input': '[1,2,3,4,5]', 'expected_output': '[5,4,3,2,1]'}
                    ]
                }
            },
            'javascript': {
                'easy': {
                    'question_text': 'Write a function to check if a string is a palindrome.',
                    'starter_code': 'function isPalindrome(str) {\n    // Write your code here\n}',
                    'solution_code': 'function isPalindrome(str) {\n    const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, \'\');\n    return cleaned === cleaned.split(\'\').reverse().join(\'\');\n}',
                    'test_cases': [
                        {'input': '"racecar"', 'expected_output': 'true'},
                        {'input': '"hello"', 'expected_output': 'false'}
                    ]
                }
            }
        }

        base = templates.get(language, templates['python']).get(difficulty, templates['python']['easy'])

        questions = []
        for i in range(num):
            questions.append({
                'question_text': base['question_text'],
                'difficulty': difficulty,
                'marks': 20,
                'starter_code': base['starter_code'],
                'solution_code': base['solution_code'],
                'test_cases': base.get('test_cases', []),
                'topics': ['algorithms', 'problem-solving'],
                'time_estimate_minutes': 30
            })

        return questions

    def _get_fallback_testing_questions(
        self,
        framework: str,
        difficulty: str,
        num: int
    ) -> List[Dict[str, Any]]:
        """Return fallback testing questions if AI generation fails."""
        question = {
            'question_text': f'Write {framework} code to test a login page with username and password fields.',
            'difficulty': difficulty,
            'marks': 20,
            'starter_code': '# Write your test code here',
            'solution_code': '# Reference solution',
            'test_scenarios': ['Valid login', 'Invalid credentials', 'Empty fields'],
            'topics': ['web testing', 'automation'],
            'time_estimate_minutes': 30
        }

        return [question] * num


# Singleton instance
_question_generator: Optional[QuestionGenerator] = None


def get_question_generator() -> QuestionGenerator:
    """Get the question generator singleton."""
    global _question_generator
    if _question_generator is None:
        _question_generator = QuestionGenerator()
    return _question_generator
