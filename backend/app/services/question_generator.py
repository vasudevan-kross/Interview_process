"""
Question Generator Service - AI-powered question generation for coding and testing interviews.

Uses LLM Orchestrator (Ollama) to generate:
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

    async def _generate_with_llm(self, prompt: str, temperature: float = 0.8) -> str:
        """
        Call the LLM orchestrator and return the text response.
        Uses higher temperature for diverse question generation.
        """
        result = await self.llm.generate_completion(
            prompt=prompt,
            model=self.model,
            system_prompt="You are an expert technical interviewer. Generate diverse, unique interview questions. Always return valid JSON arrays.",
            temperature=temperature,
            max_tokens=4000
        )
        return result.get("response", "")

    async def generate_coding_questions(
        self,
        job_description: str,
        difficulty: str,
        num_questions: int,
        programming_language: str
    ) -> List[Dict[str, Any]]:
        """
        Generate coding interview questions using LLM.

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

            prompt = f"""Generate exactly {num_questions} UNIQUE and DIFFERENT {difficulty} coding interview questions for a {programming_language} developer role.

Job Description: {job_description}

CRITICAL REQUIREMENTS:
- Each question MUST be completely different from the others
- Cover DIFFERENT topics (e.g., arrays, strings, trees, sorting, OOP, recursion, etc.)
- Generate realistic, practical coding problems
- Include starter code template in {programming_language}
- Include reference solution in {programming_language}
- Include test cases with input/output examples
- Cover relevant topics from the job description
- Vary the complexity within the {difficulty} level

Return ONLY a valid JSON array with this exact structure:
[
  {{
    "question_text": "Unique problem description here",
    "difficulty": "{difficulty}",
    "marks": 20,
    "starter_code": "# Starter code template in {programming_language}",
    "solution_code": "# Complete solution in {programming_language}",
    "test_cases": [
      {{"input": "test input", "expected_output": "expected result"}}
    ],
    "topics": ["topic1", "topic2"],
    "time_estimate_minutes": 30
  }}
]

Generate exactly {num_questions} UNIQUE questions now. Each must test a DIFFERENT concept. Return ONLY the JSON array, no other text."""

            response = await self._generate_with_llm(prompt)
            questions = self._extract_json_from_response(response)

            if not isinstance(questions, list) or len(questions) == 0:
                raise ValueError("Failed to generate valid questions")

            logger.info(f"Generated {len(questions)} questions successfully")
            return questions[:num_questions]

        except Exception as e:
            logger.error(f"Error generating coding questions: {e}")
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
                prompt = f"""Generate exactly {num_questions} UNIQUE and DIFFERENT {difficulty} test case design questions for a QA engineer role.

Job Description: {job_description}

CRITICAL REQUIREMENTS:
- Each question MUST be completely different from the others
- Cover DIFFERENT testing scenarios (e.g., login flow, payment, search, registration, API testing, etc.)
- Generate realistic testing scenarios based on the job description
- Include expected test case structure
- Cover positive, negative, boundary, and edge cases
- No coding required - questions should be about test case design and writing

Return ONLY a valid JSON array:
[
  {{
    "question_text": "Design test cases for [unique scenario]...",
    "difficulty": "{difficulty}",
    "marks": 20,
    "starter_code": "## Test Case Template\\n\\n**Test Case ID**: TC001\\n**Test Scenario**: \\n**Preconditions**: \\n**Test Steps**:\\n1. \\n2. \\n**Test Data**: \\n**Expected Result**: \\n**Actual Result**: \\n**Status**: Pass/Fail",
    "solution_code": "",
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
]

Generate exactly {num_questions} UNIQUE questions. Each must cover a DIFFERENT feature/scenario to test. Return ONLY the JSON array."""
            else:
                prompt = f"""Generate exactly {num_questions} UNIQUE and DIFFERENT {difficulty} test automation questions using {test_framework}.

Job Description: {job_description}

CRITICAL REQUIREMENTS:
- Each question MUST be completely different from the others
- Cover DIFFERENT testing scenarios (e.g., login, form validation, navigation, API, data-driven, etc.)
- Generate realistic test automation scenarios
- Include starter code template with proper {test_framework} framework syntax
- Include reference solution
- Cover test setup, execution, assertions, teardown

Return ONLY a valid JSON array:
[
  {{
    "question_text": "Write {test_framework} code to test [unique scenario]...",
    "difficulty": "{difficulty}",
    "marks": 20,
    "starter_code": "# {test_framework} starter code",
    "solution_code": "# Complete {test_framework} solution",
    "test_scenarios": [
      "Valid scenario",
      "Invalid scenario",
      "Edge case"
    ],
    "topics": ["test automation", "assertions"],
    "time_estimate_minutes": 30
  }}
]

Generate exactly {num_questions} UNIQUE questions. Each must test a DIFFERENT scenario. Return ONLY the JSON array."""

            response = await self._generate_with_llm(prompt)
            questions = self._extract_json_from_response(response)

            if not isinstance(questions, list) or len(questions) == 0:
                raise ValueError("Failed to generate valid questions")

            logger.info(f"Generated {len(questions)} test questions successfully")
            return questions[:num_questions]

        except Exception as e:
            logger.error(f"Error generating testing questions: {e}")
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
        """Return diverse fallback coding questions if AI generation fails."""
        all_questions = [
            {
                'question_text': 'Write a function to find the two numbers in an array that add up to a target sum. Return their indices.',
                'difficulty': difficulty,
                'marks': 20,
                'starter_code': f'# Write your solution in {language}\n\ndef two_sum(nums, target):\n    # Your code here\n    pass',
                'solution_code': 'def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        complement = target - n\n        if complement in seen:\n            return [seen[complement], i]\n        seen[n] = i\n    return []',
                'test_cases': [
                    {'input': 'nums=[2,7,11,15], target=9', 'expected_output': '[0, 1]'},
                    {'input': 'nums=[3,2,4], target=6', 'expected_output': '[1, 2]'}
                ],
                'topics': ['arrays', 'hash maps'],
                'time_estimate_minutes': 20
            },
            {
                'question_text': 'Write a function to check if a given string is a valid palindrome, considering only alphanumeric characters and ignoring case.',
                'difficulty': difficulty,
                'marks': 20,
                'starter_code': f'# Write your solution in {language}\n\ndef is_palindrome(s):\n    # Your code here\n    pass',
                'solution_code': 'def is_palindrome(s):\n    cleaned = "".join(c.lower() for c in s if c.isalnum())\n    return cleaned == cleaned[::-1]',
                'test_cases': [
                    {'input': '"A man, a plan, a canal: Panama"', 'expected_output': 'True'},
                    {'input': '"race a car"', 'expected_output': 'False'}
                ],
                'topics': ['strings', 'two pointers'],
                'time_estimate_minutes': 15
            },
            {
                'question_text': 'Write a function to find the maximum subarray sum in a given integer array (Kadane\'s Algorithm).',
                'difficulty': difficulty,
                'marks': 20,
                'starter_code': f'# Write your solution in {language}\n\ndef max_subarray_sum(nums):\n    # Your code here\n    pass',
                'solution_code': 'def max_subarray_sum(nums):\n    max_sum = current = nums[0]\n    for n in nums[1:]:\n        current = max(n, current + n)\n        max_sum = max(max_sum, current)\n    return max_sum',
                'test_cases': [
                    {'input': '[-2,1,-3,4,-1,2,1,-5,4]', 'expected_output': '6'},
                    {'input': '[1]', 'expected_output': '1'}
                ],
                'topics': ['arrays', 'dynamic programming'],
                'time_estimate_minutes': 25
            },
            {
                'question_text': 'Implement a function to reverse a singly linked list iteratively.',
                'difficulty': difficulty,
                'marks': 20,
                'starter_code': f'# Write your solution in {language}\n\nclass ListNode:\n    def __init__(self, val=0, next=None):\n        self.val = val\n        self.next = next\n\ndef reverse_list(head):\n    # Your code here\n    pass',
                'solution_code': 'def reverse_list(head):\n    prev = None\n    current = head\n    while current:\n        next_node = current.next\n        current.next = prev\n        prev = current\n        current = next_node\n    return prev',
                'test_cases': [
                    {'input': '[1,2,3,4,5]', 'expected_output': '[5,4,3,2,1]'},
                    {'input': '[1,2]', 'expected_output': '[2,1]'}
                ],
                'topics': ['linked lists', 'pointers'],
                'time_estimate_minutes': 20
            },
            {
                'question_text': 'Write a function to determine if two strings are anagrams of each other.',
                'difficulty': difficulty,
                'marks': 20,
                'starter_code': f'# Write your solution in {language}\n\ndef is_anagram(s, t):\n    # Your code here\n    pass',
                'solution_code': 'def is_anagram(s, t):\n    if len(s) != len(t):\n        return False\n    from collections import Counter\n    return Counter(s) == Counter(t)',
                'test_cases': [
                    {'input': 's="anagram", t="nagaram"', 'expected_output': 'True'},
                    {'input': 's="rat", t="car"', 'expected_output': 'False'}
                ],
                'topics': ['strings', 'sorting', 'hash maps'],
                'time_estimate_minutes': 15
            },
            {
                'question_text': 'Implement a stack using two queues. Support push, pop, top, and empty operations.',
                'difficulty': difficulty,
                'marks': 20,
                'starter_code': f'# Write your solution in {language}\n\nclass MyStack:\n    def __init__(self):\n        pass\n\n    def push(self, x):\n        pass\n\n    def pop(self):\n        pass\n\n    def top(self):\n        pass\n\n    def empty(self):\n        pass',
                'solution_code': 'from collections import deque\n\nclass MyStack:\n    def __init__(self):\n        self.q1 = deque()\n        self.q2 = deque()\n\n    def push(self, x):\n        self.q2.append(x)\n        while self.q1:\n            self.q2.append(self.q1.popleft())\n        self.q1, self.q2 = self.q2, self.q1\n\n    def pop(self):\n        return self.q1.popleft()\n\n    def top(self):\n        return self.q1[0]\n\n    def empty(self):\n        return len(self.q1) == 0',
                'test_cases': [
                    {'input': 'push(1), push(2), top(), pop(), empty()', 'expected_output': '2, 2, False'}
                ],
                'topics': ['stacks', 'queues', 'data structures'],
                'time_estimate_minutes': 25
            },
        ]

        return all_questions[:num]

    def _get_fallback_testing_questions(
        self,
        framework: str,
        difficulty: str,
        num: int
    ) -> List[Dict[str, Any]]:
        """Return diverse fallback testing questions if AI generation fails."""
        all_questions = [
            {
                'question_text': 'Design comprehensive test cases for a user login page. Cover valid credentials, invalid credentials, empty fields, SQL injection, and session management.',
                'difficulty': difficulty,
                'marks': 20,
                'starter_code': '## Test Case Template\n\n**Test Case ID**: TC001\n**Test Scenario**: \n**Preconditions**: \n**Test Steps**:\n1. \n2. \n**Test Data**: \n**Expected Result**: \n**Actual Result**: \n**Status**: Pass/Fail',
                'solution_code': '',
                'topics': ['authentication', 'security testing'],
                'time_estimate_minutes': 25
            },
            {
                'question_text': 'Design test cases for a shopping cart feature. Include adding items, removing items, updating quantities, applying coupons, and calculating totals with taxes.',
                'difficulty': difficulty,
                'marks': 20,
                'starter_code': '## Test Case Template\n\n**Test Case ID**: TC001\n**Test Scenario**: \n**Preconditions**: \n**Test Steps**:\n1. \n2. \n**Test Data**: \n**Expected Result**: \n**Actual Result**: \n**Status**: Pass/Fail',
                'solution_code': '',
                'topics': ['e-commerce', 'functional testing'],
                'time_estimate_minutes': 25
            },
            {
                'question_text': 'Design test cases for a user registration form. Include field validations (email format, password strength, phone number), duplicate account checks, and confirmation email flow.',
                'difficulty': difficulty,
                'marks': 20,
                'starter_code': '## Test Case Template\n\n**Test Case ID**: TC001\n**Test Scenario**: \n**Preconditions**: \n**Test Steps**:\n1. \n2. \n**Test Data**: \n**Expected Result**: \n**Actual Result**: \n**Status**: Pass/Fail',
                'solution_code': '',
                'topics': ['form validation', 'boundary testing'],
                'time_estimate_minutes': 25
            },
            {
                'question_text': 'Design test cases for a search functionality with filters. Include keyword search, filter combinations, pagination, sorting, and handling no-results scenarios.',
                'difficulty': difficulty,
                'marks': 20,
                'starter_code': '## Test Case Template\n\n**Test Case ID**: TC001\n**Test Scenario**: \n**Preconditions**: \n**Test Steps**:\n1. \n2. \n**Test Data**: \n**Expected Result**: \n**Actual Result**: \n**Status**: Pass/Fail',
                'solution_code': '',
                'topics': ['search', 'usability testing'],
                'time_estimate_minutes': 25
            },
            {
                'question_text': 'Design test cases for a file upload feature. Include valid file types, file size limits, multiple file uploads, drag-and-drop, progress indicators, and error handling for corrupt files.',
                'difficulty': difficulty,
                'marks': 20,
                'starter_code': '## Test Case Template\n\n**Test Case ID**: TC001\n**Test Scenario**: \n**Preconditions**: \n**Test Steps**:\n1. \n2. \n**Test Data**: \n**Expected Result**: \n**Actual Result**: \n**Status**: Pass/Fail',
                'solution_code': '',
                'topics': ['file handling', 'integration testing'],
                'time_estimate_minutes': 25
            },
            {
                'question_text': 'Design test cases for a payment checkout flow. Include credit card validation, payment gateway integration, order confirmation, refund processing, and timeout scenarios.',
                'difficulty': difficulty,
                'marks': 20,
                'starter_code': '## Test Case Template\n\n**Test Case ID**: TC001\n**Test Scenario**: \n**Preconditions**: \n**Test Steps**:\n1. \n2. \n**Test Data**: \n**Expected Result**: \n**Actual Result**: \n**Status**: Pass/Fail',
                'solution_code': '',
                'topics': ['payment', 'end-to-end testing'],
                'time_estimate_minutes': 25
            },
        ]

        return all_questions[:num]


# Singleton instance
_question_generator: Optional[QuestionGenerator] = None


def get_question_generator() -> QuestionGenerator:
    """Get the question generator singleton."""
    global _question_generator
    if _question_generator is None:
        _question_generator = QuestionGenerator()
    return _question_generator
