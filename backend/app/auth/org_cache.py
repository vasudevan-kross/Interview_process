"""Redis-based organization context cache for fast auth resolution."""

import json
import logging
from typing import Optional
from app.config import settings

logger = logging.getLogger(__name__)

_redis_client = None
_cache_available = False
_initialized = False


def _get_redis():
    """Lazy-init Redis connection. Only attempts once."""
    global _redis_client, _cache_available, _initialized
    if _initialized:
        return _redis_client
    _initialized = True
    try:
        import redis
        _redis_client = redis.from_url(
            settings.REDIS_URL or "redis://localhost:6379",
            decode_responses=True
        )
        _redis_client.ping()
        _cache_available = True
        logger.info("Redis org cache connected")
    except Exception as e:
        logger.warning(f"Redis unavailable, org cache disabled: {e}")
        _redis_client = None
        _cache_available = False
    return _redis_client


class OrgCache:
    """Cache org context to avoid DB lookups on every request."""

    TTL = 300  # 5 minutes

    async def get_context(self, user_id: str) -> Optional["OrgContext"]:
        r = _get_redis()
        if not r:
            return None
        try:
            cached = r.get(f"org_ctx:{user_id}")
            if cached:
                from app.auth.dependencies import OrgContext
                data = json.loads(cached)
                return OrgContext(**data)
        except Exception as e:
            logger.debug(f"Cache get failed: {e}")
        return None

    async def set_context(self, user_id: str, ctx: "OrgContext"):
        r = _get_redis()
        if not r:
            return
        try:
            from dataclasses import asdict
            r.setex(f"org_ctx:{user_id}", self.TTL, json.dumps(asdict(ctx)))
        except Exception as e:
            logger.debug(f"Cache set failed: {e}")

    async def invalidate(self, user_id: str):
        r = _get_redis()
        if not r:
            return
        try:
            r.delete(f"org_ctx:{user_id}")
        except Exception as e:
            logger.debug(f"Cache invalidate failed: {e}")

    async def invalidate_org(self, org_id: str):
        """Invalidate cache for all members of an org."""
        from app.db.supabase_client import get_supabase
        try:
            client = get_supabase()
            members = client.table("organization_members").select("user_id").eq("org_id", org_id).execute()
            for m in (members.data or []):
                await self.invalidate(m["user_id"])
        except Exception as e:
            logger.debug(f"Cache org invalidate failed: {e}")


_instance = None


def get_org_cache() -> OrgCache:
    global _instance
    if _instance is None:
        _instance = OrgCache()
    return _instance
