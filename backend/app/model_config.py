"""
Model configuration for task-based model selection.

This module defines which LLM models to use for different tasks
to optimize for speed, accuracy, or specialization.
"""

from typing import Dict, List, Optional


class ModelConfig:
    """Configuration for task-based model selection."""

    # Task-based model assignments
    TASK_MODELS: Dict[str, str] = {
        # Fast parsing tasks - upgraded to qwen2.5:7b for better quality
        "question_parsing": "qwen2.5:7b",
        "resume_parsing": "qwen2.5:7b",
        "jd_parsing": "qwen2.5:7b",
        "skill_extraction": "qwen2.5:7b",

        # Evaluation tasks
        "answer_evaluation": "qwen2.5:7b",
        "resume_matching": "qwen2.5:7b",

        # Specialized tasks
        "code_evaluation": "qwen2.5:7b",
        "code_parsing": "qwen2.5:7b",
    }

    # Domain-specific model overrides
    DOMAIN_MODELS: Dict[str, str] = {
        "coding": "qwen2.5:7b",
        "development": "qwen2.5:7b",
        "sql": "qwen2.5:7b",  # Can be changed to sqlcoder if available
        "general": "qwen2.5:7b",
        "testing": "qwen2.5:7b",
        "devops": "qwen2.5:7b",
    }

    # Fallback model if specified model is not available
    DEFAULT_MODEL = "qwen2.5:7b"

    # Vision model for handwritten answer sheet evaluation
    VISION_EVAL_MODELS: List[str] = [
        "llava:7b",
    ]

    @classmethod
    def get_model_for_task(cls, task: str, domain: Optional[str] = None) -> str:
        """
        Get the appropriate model for a specific task.

        Args:
            task: The task name (e.g., "answer_evaluation", "question_parsing")
            domain: Optional domain for domain-specific overrides (e.g., "coding", "sql")

        Returns:
            Model identifier string (e.g., "llama2:13b")
        """
        # If domain is provided and has code-related content, use code model for evaluation
        if domain and task == "answer_evaluation":
            domain_lower = domain.lower()
            if domain_lower in cls.DOMAIN_MODELS:
                return cls.DOMAIN_MODELS[domain_lower]

        # Return task-specific model or fallback to default
        return cls.TASK_MODELS.get(task, cls.DEFAULT_MODEL)

    @classmethod
    def get_model_for_domain(cls, domain: str) -> str:
        """
        Get the appropriate model for a specific domain.

        Args:
            domain: Domain name (e.g., "coding", "sql", "general")

        Returns:
            Model identifier string
        """
        return cls.DOMAIN_MODELS.get(domain.lower(), cls.DEFAULT_MODEL)

    @classmethod
    def is_code_domain(cls, domain: Optional[str]) -> bool:
        """
        Check if the domain is code-related.

        Args:
            domain: Domain name to check

        Returns:
            True if domain is code-related
        """
        if not domain:
            return False

        code_domains = ["coding", "development", "sql", "programming"]
        return domain.lower() in code_domains


# Singleton instance
model_config = ModelConfig()
