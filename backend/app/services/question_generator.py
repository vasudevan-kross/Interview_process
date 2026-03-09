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

# Domain registry — add a new domain by inserting one entry here.
DOMAIN_REGISTRY = {
    'coding': {
        'label': 'Coding',
        'generator': 'generate_coding_questions',
        'tool_param': 'programming_language',
        'tool_options': [
            {'value': 'any', 'label': 'Any Language'},
            {'value': 'python', 'label': 'Python'},
            {'value': 'javascript', 'label': 'JavaScript'},
            {'value': 'java', 'label': 'Java'},
            {'value': 'cpp', 'label': 'C++'},
            {'value': 'go', 'label': 'Go'},
            {'value': 'rust', 'label': 'Rust'},
            {'value': 'typescript', 'label': 'TypeScript'},
            {'value': 'csharp', 'label': 'C#'},
        ],
    },
    'testing': {
        'label': 'Testing/QA',
        'generator': 'generate_testing_questions',
        'tool_param': 'test_framework',
        'tool_options': [
            {'value': 'selenium-python', 'label': 'Selenium (Python)'},
            {'value': 'selenium-java', 'label': 'Selenium (Java)'},
            {'value': 'playwright-js', 'label': 'Playwright (JavaScript)'},
            {'value': 'cypress-js', 'label': 'Cypress (JavaScript)'},
            {'value': 'pytest', 'label': 'Pytest (Python)'},
            {'value': 'junit', 'label': 'JUnit (Java)'},
            {'value': 'manual-test-cases', 'label': 'Manual Test Case Design'},
        ],
    },
    'devops': {
        'label': 'DevOps',
        'generator': 'generate_devops_questions',
        'tool_param': 'devops_tool',
        'tool_options': [
            {'value': 'general', 'label': 'General DevOps'},
            {'value': 'docker', 'label': 'Docker'},
            {'value': 'kubernetes', 'label': 'Kubernetes'},
            {'value': 'terraform', 'label': 'Terraform'},
            {'value': 'ansible', 'label': 'Ansible'},
            {'value': 'bash', 'label': 'Bash/Shell Scripting'},
            {'value': 'ci-cd', 'label': 'CI/CD (GitHub Actions / Jenkins)'},
        ],
    },
    'sql': {
        'label': 'SQL/Database',
        'generator': 'generate_sql_questions',
        'tool_param': 'sql_dialect',
        'tool_options': [
            {'value': 'general', 'label': 'General SQL'},
            {'value': 'postgresql', 'label': 'PostgreSQL'},
            {'value': 'mysql', 'label': 'MySQL'},
            {'value': 'sqlite', 'label': 'SQLite'},
            {'value': 'oracle', 'label': 'Oracle SQL'},
            {'value': 'sqlserver', 'label': 'SQL Server (T-SQL)'},
        ],
    },
    'system_design': {
        'label': 'System Design',
        'generator': 'generate_system_design_questions',
        'tool_param': None,
        'tool_options': [],
    },
    'fullstack': {
        'label': 'Fullstack',
        'generator': 'generate_fullstack_questions',
        'tool_param': 'programming_language',
        'tool_options': [
            {'value': 'python', 'label': 'Python (Django/FastAPI)'},
            {'value': 'javascript', 'label': 'JavaScript (Node + React)'},
            {'value': 'typescript', 'label': 'TypeScript'},
            {'value': 'java', 'label': 'Java (Spring)'},
        ],
    },
    'data_science': {
        'label': 'Data Science/ML',
        'generator': 'generate_data_science_questions',
        'tool_param': 'programming_language',
        'tool_options': [
            {'value': 'python', 'label': 'Python (pandas/sklearn)'},
        ],
    },
}


class QuestionGenerator:
    """Service for generating interview questions using AI."""

    def __init__(self):
        self.llm = get_llm_orchestrator()
        from app.model_config import ModelConfig
        self.model = os.getenv('QUESTION_GENERATION_MODEL', ModelConfig.DEFAULT_MODEL)

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

    async def generate_devops_questions(
        self,
        job_description: str,
        difficulty: str,
        num_questions: int,
        devops_tool: str = 'general'
    ) -> List[Dict[str, Any]]:
        """Generate DevOps interview questions."""
        try:
            logger.info(f"Generating {num_questions} {difficulty} devops questions (tool: {devops_tool})")
            tool_label = devops_tool if devops_tool != 'general' else 'Docker, Kubernetes, CI/CD, Bash, Infrastructure'
            prompt = f"""Generate exactly {num_questions} UNIQUE and DIFFERENT {difficulty} DevOps interview questions focused on {tool_label}.

Job Description: {job_description}

CRITICAL REQUIREMENTS:
- Each question MUST be completely different from the others
- Cover DIFFERENT topics (e.g., containerization, orchestration, CI/CD pipelines, IaC, monitoring, networking)
- Include practical scenario-based questions
- Include configuration/script starter templates where relevant
- Reference solution or expected approach

Return ONLY a valid JSON array:
[
  {{
    "question_text": "Unique DevOps problem description here",
    "difficulty": "{difficulty}",
    "marks": 20,
    "starter_code": "# Starter config / script",
    "solution_code": "# Reference solution / approach",
    "test_cases": [],
    "topics": ["topic1", "topic2"],
    "time_estimate_minutes": 30
  }}
]

Generate exactly {num_questions} UNIQUE questions. Return ONLY the JSON array."""

            response = await self._generate_with_llm(prompt)
            questions = self._extract_json_from_response(response)
            if not isinstance(questions, list) or len(questions) == 0:
                raise ValueError("Failed to generate valid questions")
            return questions[:num_questions]
        except Exception as e:
            logger.error(f"Error generating devops questions: {e}")
            return self._get_fallback_devops_questions(devops_tool, difficulty, num_questions)

    async def generate_sql_questions(
        self,
        job_description: str,
        difficulty: str,
        num_questions: int,
        sql_dialect: str = 'general'
    ) -> List[Dict[str, Any]]:
        """Generate SQL/Database interview questions."""
        try:
            logger.info(f"Generating {num_questions} {difficulty} SQL questions (dialect: {sql_dialect})")
            dialect_label = sql_dialect if sql_dialect != 'general' else 'standard SQL'
            prompt = f"""Generate exactly {num_questions} UNIQUE and DIFFERENT {difficulty} SQL/database interview questions using {dialect_label}.

Job Description: {job_description}

CRITICAL REQUIREMENTS:
- Each question MUST be completely different from the others
- Cover DIFFERENT topics (e.g., SELECT queries, JOINs, aggregations, subqueries, indexes, schema design, transactions, optimization)
- Include a sample schema or table definition in the starter code
- Include the reference SQL solution

Return ONLY a valid JSON array:
[
  {{
    "question_text": "Unique SQL/database problem description here",
    "difficulty": "{difficulty}",
    "marks": 20,
    "starter_code": "-- Sample schema:\\nCREATE TABLE ...",
    "solution_code": "-- Reference solution:\\nSELECT ...",
    "test_cases": [
      {{"input": "sample data description", "expected_output": "expected query result"}}
    ],
    "topics": ["JOINs", "aggregation"],
    "time_estimate_minutes": 25
  }}
]

Generate exactly {num_questions} UNIQUE questions. Return ONLY the JSON array."""

            response = await self._generate_with_llm(prompt)
            questions = self._extract_json_from_response(response)
            if not isinstance(questions, list) or len(questions) == 0:
                raise ValueError("Failed to generate valid questions")
            return questions[:num_questions]
        except Exception as e:
            logger.error(f"Error generating SQL questions: {e}")
            return self._get_fallback_sql_questions(sql_dialect, difficulty, num_questions)

    async def generate_system_design_questions(
        self,
        job_description: str,
        difficulty: str,
        num_questions: int,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """Generate System Design interview questions (text/markdown answers)."""
        try:
            logger.info(f"Generating {num_questions} {difficulty} system design questions")
            prompt = f"""Generate exactly {num_questions} UNIQUE and DIFFERENT {difficulty} system design interview questions.

Job Description: {job_description}

CRITICAL REQUIREMENTS:
- Each question MUST be completely different from the others
- Cover DIFFERENT topics (e.g., URL shortener, chat system, news feed, rate limiter, distributed cache, CDN, payment system)
- Questions should ask candidates to design a system end-to-end
- Starter code should be a structured Markdown template for their answer (no executable code)
- No solution code needed — provide key points to cover instead

Return ONLY a valid JSON array:
[
  {{
    "question_text": "Design a [unique system] that can handle [requirements]...",
    "difficulty": "{difficulty}",
    "marks": 30,
    "starter_code": "## System Design: [System Name]\\n\\n### Requirements\\n- Functional: \\n- Non-functional: \\n\\n### High-Level Architecture\\n\\n### Components\\n\\n### Data Model\\n\\n### API Design\\n\\n### Scalability Considerations\\n",
    "solution_code": "Key points: scalability, availability, consistency trade-offs, caching, load balancing, database choice...",
    "test_cases": [],
    "topics": ["scalability", "distributed systems"],
    "time_estimate_minutes": 45
  }}
]

Generate exactly {num_questions} UNIQUE questions. Return ONLY the JSON array."""

            response = await self._generate_with_llm(prompt)
            questions = self._extract_json_from_response(response)
            if not isinstance(questions, list) or len(questions) == 0:
                raise ValueError("Failed to generate valid questions")
            return questions[:num_questions]
        except Exception as e:
            logger.error(f"Error generating system design questions: {e}")
            return self._get_fallback_system_design_questions(difficulty, num_questions)

    async def generate_fullstack_questions(
        self,
        job_description: str,
        difficulty: str,
        num_questions: int,
        programming_language: str = 'javascript'
    ) -> List[Dict[str, Any]]:
        """Generate Fullstack development interview questions."""
        try:
            logger.info(f"Generating {num_questions} {difficulty} fullstack questions (lang: {programming_language})")
            prompt = f"""Generate exactly {num_questions} UNIQUE and DIFFERENT {difficulty} fullstack development interview questions using {programming_language}.

Job Description: {job_description}

CRITICAL REQUIREMENTS:
- Each question MUST be completely different from the others
- Cover DIFFERENT topics (e.g., REST API design, database integration, authentication, frontend state management, performance, deployment)
- Mix backend and frontend concerns
- Include starter code templates

Return ONLY a valid JSON array:
[
  {{
    "question_text": "Unique fullstack problem description here",
    "difficulty": "{difficulty}",
    "marks": 20,
    "starter_code": "# Starter code in {programming_language}",
    "solution_code": "# Reference solution",
    "test_cases": [],
    "topics": ["REST API", "authentication"],
    "time_estimate_minutes": 35
  }}
]

Generate exactly {num_questions} UNIQUE questions. Return ONLY the JSON array."""

            response = await self._generate_with_llm(prompt)
            questions = self._extract_json_from_response(response)
            if not isinstance(questions, list) or len(questions) == 0:
                raise ValueError("Failed to generate valid questions")
            return questions[:num_questions]
        except Exception as e:
            logger.error(f"Error generating fullstack questions: {e}")
            return self._get_fallback_coding_questions(programming_language, difficulty, num_questions)

    async def generate_data_science_questions(
        self,
        job_description: str,
        difficulty: str,
        num_questions: int,
        programming_language: str = 'python'
    ) -> List[Dict[str, Any]]:
        """Generate Data Science / ML interview questions."""
        try:
            logger.info(f"Generating {num_questions} {difficulty} data science questions")
            prompt = f"""Generate exactly {num_questions} UNIQUE and DIFFERENT {difficulty} data science and machine learning interview questions using Python (pandas, numpy, scikit-learn).

Job Description: {job_description}

CRITICAL REQUIREMENTS:
- Each question MUST be completely different from the others
- Cover DIFFERENT topics (e.g., data cleaning, EDA, feature engineering, model training, evaluation metrics, hyperparameter tuning, deep learning basics)
- Include starter code with sample data or imports
- Include reference solution

Return ONLY a valid JSON array:
[
  {{
    "question_text": "Unique data science problem description here",
    "difficulty": "{difficulty}",
    "marks": 20,
    "starter_code": "import pandas as pd\\nimport numpy as np\\n# Your code here",
    "solution_code": "# Reference solution",
    "test_cases": [
      {{"input": "sample dataset description", "expected_output": "expected result"}}
    ],
    "topics": ["pandas", "feature engineering"],
    "time_estimate_minutes": 30
  }}
]

Generate exactly {num_questions} UNIQUE questions. Return ONLY the JSON array."""

            response = await self._generate_with_llm(prompt)
            questions = self._extract_json_from_response(response)
            if not isinstance(questions, list) or len(questions) == 0:
                raise ValueError("Failed to generate valid questions")
            return questions[:num_questions]
        except Exception as e:
            logger.error(f"Error generating data science questions: {e}")
            return self._get_fallback_coding_questions('python', difficulty, num_questions)

    async def generate_questions_for_domain(
        self,
        domain: str,
        job_description: str,
        difficulty: str,
        num_questions: int,
        domain_tool: Optional[str] = None,
        programming_language: Optional[str] = None,
        test_framework: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Dispatch question generation by domain using the registry."""
        config = DOMAIN_REGISTRY.get(domain)
        if not config:
            logger.warning(f"Unknown domain '{domain}', falling back to coding")
            config = DOMAIN_REGISTRY['coding']
            domain = 'coding'

        generator_name = config['generator']
        tool_param = config['tool_param']

        # Resolve tool value from generic domain_tool or legacy fields
        tool_value = domain_tool
        if tool_value is None:
            if domain == 'coding' or domain == 'fullstack' or domain == 'data_science':
                tool_value = programming_language or 'python'
            elif domain == 'testing':
                tool_value = test_framework or 'manual-test-cases'
            elif domain == 'devops':
                tool_value = 'general'
            elif domain == 'sql':
                tool_value = 'general'

        generator_method = getattr(self, generator_name)

        kwargs = {
            'job_description': job_description,
            'difficulty': difficulty,
            'num_questions': num_questions,
        }
        if tool_param:
            kwargs[tool_param] = tool_value or 'general'

        return await generator_method(**kwargs)

    def _get_fallback_devops_questions(self, tool: str, difficulty: str, num: int) -> List[Dict[str, Any]]:
        """Fallback DevOps questions."""
        questions = [
            {
                'question_text': 'Write a Dockerfile to containerize a Python Flask application. Include best practices like using a non-root user, multi-stage builds, and proper layer caching.',
                'difficulty': difficulty,
                'marks': 20,
                'starter_code': '# Dockerfile\nFROM python:3.11-slim\n\n# Your configuration here\n',
                'solution_code': 'FROM python:3.11-slim AS base\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nRUN adduser --disabled-password appuser && chown -R appuser /app\nUSER appuser\nEXPOSE 5000\nCMD ["python", "app.py"]',
                'test_cases': [],
                'topics': ['docker', 'containerization', 'best practices'],
                'time_estimate_minutes': 25,
            },
            {
                'question_text': 'Write a GitHub Actions CI/CD workflow that: (1) runs tests on every push, (2) builds a Docker image, (3) pushes to Docker Hub on merge to main.',
                'difficulty': difficulty,
                'marks': 25,
                'starter_code': '# .github/workflows/ci.yml\nname: CI/CD Pipeline\n\non:\n  push:\n    branches: [main, develop]\n\njobs:\n  # Your jobs here\n',
                'solution_code': 'on:\n  push:\n    branches: [main]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v3\n      - run: pip install -r requirements.txt && pytest\n  build:\n    needs: test\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v3\n      - uses: docker/login-action@v2\n        with:\n          username: ${{ secrets.DOCKER_USER }}\n          password: ${{ secrets.DOCKER_PASS }}\n      - run: docker build -t myapp:${{ github.sha }} . && docker push myapp:${{ github.sha }}',
                'test_cases': [],
                'topics': ['ci/cd', 'github actions', 'docker'],
                'time_estimate_minutes': 35,
            },
            {
                'question_text': 'Write a Kubernetes Deployment manifest for a web application with: 3 replicas, resource limits, liveness/readiness probes, and a ConfigMap for environment variables.',
                'difficulty': difficulty,
                'marks': 25,
                'starter_code': '# deployment.yaml\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web-app\n# Complete the manifest\n',
                'solution_code': 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web-app\nspec:\n  replicas: 3\n  selector:\n    matchLabels:\n      app: web-app\n  template:\n    metadata:\n      labels:\n        app: web-app\n    spec:\n      containers:\n      - name: web\n        image: myapp:latest\n        resources:\n          requests:\n            cpu: 100m\n            memory: 128Mi\n          limits:\n            cpu: 500m\n            memory: 512Mi\n        livenessProbe:\n          httpGet:\n            path: /health\n            port: 8080\n          initialDelaySeconds: 30\n        readinessProbe:\n          httpGet:\n            path: /ready\n            port: 8080',
                'test_cases': [],
                'topics': ['kubernetes', 'deployments', 'resource management'],
                'time_estimate_minutes': 35,
            },
        ]
        return questions[:num]

    def _get_fallback_sql_questions(self, dialect: str, difficulty: str, num: int) -> List[Dict[str, Any]]:
        """Fallback SQL questions."""
        questions = [
            {
                'question_text': 'Given an Orders table (order_id, customer_id, amount, order_date) and Customers table (customer_id, name, country), write a query to find the top 5 customers by total order value, showing their name, country, and total amount.',
                'difficulty': difficulty,
                'marks': 20,
                'starter_code': '-- Schema:\n-- Customers(customer_id, name, country)\n-- Orders(order_id, customer_id, amount, order_date)\n\nSELECT -- your query here\n',
                'solution_code': 'SELECT c.name, c.country, SUM(o.amount) AS total_amount\nFROM customers c\nJOIN orders o ON c.customer_id = o.customer_id\nGROUP BY c.customer_id, c.name, c.country\nORDER BY total_amount DESC\nLIMIT 5;',
                'test_cases': [{'input': 'customers and orders tables', 'expected_output': 'Top 5 customers with total amounts'}],
                'topics': ['JOINs', 'aggregation', 'GROUP BY'],
                'time_estimate_minutes': 20,
            },
            {
                'question_text': 'Write a SQL query to find all employees who earn more than the average salary of their department. Use the Employees table (employee_id, name, department_id, salary).',
                'difficulty': difficulty,
                'marks': 20,
                'starter_code': '-- Employees(employee_id, name, department_id, salary)\n\nSELECT -- your query here\n',
                'solution_code': 'SELECT e.name, e.department_id, e.salary\nFROM employees e\nWHERE e.salary > (\n    SELECT AVG(salary)\n    FROM employees\n    WHERE department_id = e.department_id\n)\nORDER BY e.department_id, e.salary DESC;',
                'test_cases': [{'input': 'employees table', 'expected_output': 'Employees above department average'}],
                'topics': ['subqueries', 'correlated subquery', 'aggregation'],
                'time_estimate_minutes': 25,
            },
            {
                'question_text': 'Design a normalized database schema for a library management system. Include tables for books, authors, members, and loans. Write the CREATE TABLE statements with appropriate constraints.',
                'difficulty': difficulty,
                'marks': 25,
                'starter_code': '-- Design the schema for a library management system\n-- Tables needed: books, authors, members, loans\n\nCREATE TABLE -- your schema here\n',
                'solution_code': 'CREATE TABLE authors (author_id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL);\nCREATE TABLE books (book_id SERIAL PRIMARY KEY, title VARCHAR(200) NOT NULL, author_id INT REFERENCES authors, isbn VARCHAR(20) UNIQUE, available BOOLEAN DEFAULT TRUE);\nCREATE TABLE members (member_id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(100) UNIQUE, joined_date DATE DEFAULT CURRENT_DATE);\nCREATE TABLE loans (loan_id SERIAL PRIMARY KEY, book_id INT REFERENCES books, member_id INT REFERENCES members, loan_date DATE DEFAULT CURRENT_DATE, return_date DATE, CONSTRAINT one_active_loan UNIQUE (book_id, return_date));',
                'test_cases': [],
                'topics': ['schema design', 'normalization', 'constraints'],
                'time_estimate_minutes': 30,
            },
        ]
        return questions[:num]

    def _get_fallback_system_design_questions(self, difficulty: str, num: int) -> List[Dict[str, Any]]:
        """Fallback system design questions."""
        questions = [
            {
                'question_text': 'Design a URL shortening service (like bit.ly). The system should: generate short URLs, redirect users to original URLs, handle 100M URLs and 10B redirects/day, provide analytics (click counts), and support custom aliases.',
                'difficulty': difficulty,
                'marks': 30,
                'starter_code': '## System Design: URL Shortener\n\n### Requirements\n**Functional:**\n- \n\n**Non-functional:**\n- \n\n### High-Level Architecture\n\n### Components\n\n### Data Model\n\n### API Design\n\n### Scalability Considerations\n',
                'solution_code': 'Key points: hash function for URL generation (Base62), read-heavy design (cache aggressively), DB: SQL for metadata, Redis for caching, CDN for redirection, consistent hashing for horizontal scaling, analytics via event streaming (Kafka).',
                'test_cases': [],
                'topics': ['distributed systems', 'caching', 'scalability'],
                'time_estimate_minutes': 45,
            },
            {
                'question_text': 'Design a real-time messaging application (like WhatsApp). Support: 1-1 and group chats, message delivery receipts, online/offline status, message history, and 1B users with 100M concurrent connections.',
                'difficulty': difficulty,
                'marks': 35,
                'starter_code': '## System Design: Messaging App\n\n### Requirements\n**Functional:**\n- \n\n**Non-functional:**\n- \n\n### High-Level Architecture\n\n### Components\n\n### Data Model\n\n### Message Delivery Flow\n\n### Scalability Considerations\n',
                'solution_code': 'Key points: WebSockets for real-time, message queue (Kafka) for reliability, Cassandra for message storage (write-heavy), Redis for presence/online status, consistent hashing for connection routing, fan-out service for group messages.',
                'test_cases': [],
                'topics': ['websockets', 'message queues', 'distributed systems'],
                'time_estimate_minutes': 50,
            },
        ]
        return questions[:num]

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
