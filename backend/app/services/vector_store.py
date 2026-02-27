"""
Vector store service using pgvector for similarity search.
Handles embedding generation and vector operations.
"""
from typing import List, Dict, Optional, Tuple
import logging
import numpy as np
try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False
import httpx
from app.db.supabase_client import get_supabase
from app.config import settings

logger = logging.getLogger(__name__)


class VectorStore:
    """Service for vector embeddings and similarity search using pgvector."""

    def __init__(self, model_name: str = "all-mpnet-base-v2"):
        """
        Initialize the vector store.

        Args:
            model_name: Name of the sentence-transformers model to use
                       (default: all-mpnet-base-v2 with 768 dimensions)
        """
        self.client = get_supabase()
        self.model_name = model_name
        self.embedding_model = None
        self.embedding_dim = 768  # Matches database schema

    def _load_embedding_model(self):
        """Lazy load the embedding model."""
        if self.embedding_model is None and SENTENCE_TRANSFORMERS_AVAILABLE:
            logger.info(f"Loading embedding model: {self.model_name}")
            self.embedding_model = SentenceTransformer(self.model_name)
            logger.info(f"Embedding model loaded. Dimension: {self.embedding_model.get_sentence_embedding_dimension()}")
        elif not SENTENCE_TRANSFORMERS_AVAILABLE:
            logger.info(f"SentenceTransformers not available. Will use Ollama for model: nomic-embed-text")

    async def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding vector for text.

        Args:
            text: Input text to embed

        Returns:
            Embedding vector as list of floats
        """
        try:
            self._load_embedding_model()

            # Clean and truncate text if too long
            text = text.strip()
            if not text:
                raise ValueError("Cannot generate embedding for empty text")

            # Convert to list
            if SENTENCE_TRANSFORMERS_AVAILABLE:
                embedding = self.embedding_model.encode(text, normalize_embeddings=True)
                return embedding.tolist()
            else:
                # Fallback to Ollama embedding API
                ollama_url = f"{settings.OLLAMA_BASE_URL}/api/embeddings"
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        ollama_url,
                        json={"model": "nomic-embed-text", "prompt": text},
                        timeout=30.0
                    )
                    response.raise_for_status()
                    data = response.json()
                    embedding = data.get("embedding")
                    
                    if not embedding:
                        raise ValueError("No embedding returned from Ollama")
                        
                    # Normalize the embedding
                    vec = np.array(embedding)
                    norm = np.linalg.norm(vec)
                    if norm > 0:
                        vec = vec / norm
                    return vec.tolist()

        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            raise

    async def generate_batch_embeddings(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts in batch.

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors
        """
        try:
            self._load_embedding_model()

            # Clean texts
            texts = [text.strip() for text in texts if text.strip()]
            if not texts:
                raise ValueError("Cannot generate embeddings for empty text list")

            # Generate embeddings in batch (more efficient)
            if SENTENCE_TRANSFORMERS_AVAILABLE:
                embeddings = self.embedding_model.encode(
                    texts,
                    normalize_embeddings=True,
                    show_progress_bar=len(texts) > 10
                )
                return embeddings.tolist()
            else:
                # Fallback sequence using Ollama (since Ollama API currently doesn't do batch embeddings in one call easily)
                results = []
                for t in texts:
                    emb = await self.generate_embedding(t)
                    results.append(emb)
                return results

        except Exception as e:
            logger.error(f"Error generating batch embeddings: {e}")
            raise

    async def store_job_description_embedding(
        self,
        job_id: str,
        text: str,
        metadata: Optional[Dict] = None
    ) -> bool:
        """
        Generate and store embedding for a job description.

        Args:
            job_id: UUID of the job description
            text: Job description text
            metadata: Optional metadata to store

        Returns:
            True if successful
        """
        try:
            # Generate embedding
            embedding = await self.generate_embedding(text)

            # Update the job_descriptions table with the embedding
            result = self.client.table("job_descriptions").update({
                "embedding": embedding
            }).eq("id", job_id).execute()

            logger.info(f"Stored embedding for job description: {job_id}")
            return True

        except Exception as e:
            logger.error(f"Error storing job description embedding: {e}")
            raise

    async def store_resume_embedding(
        self,
        resume_id: str,
        text: str,
        metadata: Optional[Dict] = None
    ) -> bool:
        """
        Generate and store embedding for a resume.

        Args:
            resume_id: UUID of the resume
            text: Resume text
            metadata: Optional metadata to store

        Returns:
            True if successful
        """
        try:
            # Generate embedding
            embedding = await self.generate_embedding(text)

            # Update the resumes table with the embedding
            result = self.client.table("resumes").update({
                "embedding": embedding
            }).eq("id", resume_id).execute()

            logger.info(f"Stored embedding for resume: {resume_id}")
            return True

        except Exception as e:
            logger.error(f"Error storing resume embedding: {e}")
            raise

    async def find_similar_resumes(
        self,
        job_id: str,
        limit: int = 10,
        threshold: float = 0.5
    ) -> List[Dict]:
        """
        Find resumes similar to a job description using cosine similarity.

        Args:
            job_id: UUID of the job description
            limit: Maximum number of results
            threshold: Minimum similarity score (0-1)

        Returns:
            List of matching resumes with similarity scores
        """
        try:
            # Get the job description embedding
            job_result = self.client.table("job_descriptions").select(
                "embedding"
            ).eq("id", job_id).single().execute()

            if not job_result.data or not job_result.data.get("embedding"):
                raise ValueError(f"Job description {job_id} has no embedding")

            job_embedding = job_result.data["embedding"]

            # Use pgvector's cosine similarity operator (<=>)
            # Note: This uses RPC call because Supabase client doesn't support vector operators directly
            result = self.client.rpc(
                "match_resumes_to_job",
                {
                    "query_embedding": job_embedding,
                    "match_threshold": threshold,
                    "match_count": limit
                }
            ).execute()

            return result.data if result.data else []

        except Exception as e:
            logger.error(f"Error finding similar resumes: {e}")
            raise

    async def find_similar_jobs(
        self,
        resume_id: str,
        limit: int = 10,
        threshold: float = 0.5
    ) -> List[Dict]:
        """
        Find job descriptions similar to a resume using cosine similarity.

        Args:
            resume_id: UUID of the resume
            limit: Maximum number of results
            threshold: Minimum similarity score (0-1)

        Returns:
            List of matching job descriptions with similarity scores
        """
        try:
            # Get the resume embedding
            resume_result = self.client.table("resumes").select(
                "embedding"
            ).eq("id", resume_id).single().execute()

            if not resume_result.data or not resume_result.data.get("embedding"):
                raise ValueError(f"Resume {resume_id} has no embedding")

            resume_embedding = resume_result.data["embedding"]

            # Use pgvector's cosine similarity operator
            result = self.client.rpc(
                "match_jobs_to_resume",
                {
                    "query_embedding": resume_embedding,
                    "match_threshold": threshold,
                    "match_count": limit
                }
            ).execute()

            return result.data if result.data else []

        except Exception as e:
            logger.error(f"Error finding similar jobs: {e}")
            raise

    async def calculate_similarity(
        self,
        text1: str,
        text2: str
    ) -> float:
        """
        Calculate cosine similarity between two texts.

        Args:
            text1: First text
            text2: Second text

        Returns:
            Similarity score (0-1)
        """
        try:
            # Generate embeddings
            embeddings = await self.generate_batch_embeddings([text1, text2])

            # Calculate cosine similarity
            vec1 = np.array(embeddings[0])
            vec2 = np.array(embeddings[1])

            similarity = np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))

            return float(similarity)

        except Exception as e:
            logger.error(f"Error calculating similarity: {e}")
            raise

    async def batch_process_resumes(
        self,
        resume_ids: List[str],
        resume_texts: List[str]
    ) -> Dict[str, bool]:
        """
        Process multiple resumes in batch for efficiency.

        Args:
            resume_ids: List of resume UUIDs
            resume_texts: List of resume texts

        Returns:
            Dictionary mapping resume_id to success status
        """
        try:
            if len(resume_ids) != len(resume_texts):
                raise ValueError("resume_ids and resume_texts must have same length")

            # Generate embeddings in batch
            embeddings = await self.generate_batch_embeddings(resume_texts)

            results = {}
            for resume_id, embedding in zip(resume_ids, embeddings):
                try:
                    self.client.table("resumes").update({
                        "embedding": embedding
                    }).eq("id", resume_id).execute()
                    results[resume_id] = True
                except Exception as e:
                    logger.error(f"Error updating resume {resume_id}: {e}")
                    results[resume_id] = False

            return results

        except Exception as e:
            logger.error(f"Error batch processing resumes: {e}")
            raise

    async def delete_resume_embedding(self, resume_id: str) -> bool:
        """
        Delete embedding for a resume by setting it to NULL.

        Args:
            resume_id: UUID of the resume

        Returns:
            True if successful
        """
        try:
            # Set embedding to NULL in the database
            result = self.client.table("resumes").update({
                "embedding": None
            }).eq("id", resume_id).execute()

            logger.info(f"Deleted embedding for resume: {resume_id}")
            return True

        except Exception as e:
            logger.error(f"Error deleting resume embedding: {e}")
            raise

    async def delete_job_description_embedding(self, job_id: str) -> bool:
        """
        Delete embedding for a job description by setting it to NULL.

        Args:
            job_id: UUID of the job description

        Returns:
            True if successful
        """
        try:
            # Set embedding to NULL in the database
            result = self.client.table("job_descriptions").update({
                "embedding": None
            }).eq("id", job_id).execute()

            logger.info(f"Deleted embedding for job description: {job_id}")
            return True

        except Exception as e:
            logger.error(f"Error deleting job description embedding: {e}")
            raise


# Singleton instance
_vector_store: Optional[VectorStore] = None


def get_vector_store() -> VectorStore:
    """Get the vector store singleton."""
    global _vector_store
    if _vector_store is None:
        _vector_store = VectorStore()
    return _vector_store
