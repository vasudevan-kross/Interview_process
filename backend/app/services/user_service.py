
import logging
from typing import Optional
from app.db.supabase_client import get_supabase

logger = logging.getLogger(__name__)

class UserService:
    """Service to handle user ID resolution and management."""

    def __init__(self):
        self.client = get_supabase()
        self._cache: dict[str, str] = {}

    def resolve_user_id(self, auth_user_id: str) -> str:
        """
        Resolve a Supabase Auth ID (or raw Auth ID) to the database users table UUID.
        
        Args:
            auth_user_id: The ID provided by the auth provider (e.g., Clerk ID, Supabase Auth UUID)
            
        Returns:
            The internal users table UUID
        """
        if not auth_user_id:
            return auth_user_id

        # Return from cache if already resolved in this instance
        if auth_user_id in self._cache:
            return self._cache[auth_user_id]

        try:
            # 1. Try direct match in ID column
            result = self.client.table("users").select("id").eq("id", auth_user_id).execute()
            if result.data:
                resolved_id = result.data[0]["id"]
                self._cache[auth_user_id] = resolved_id
                return resolved_id

            # 2. Try match via auth_user_id column
            result = self.client.table("users").select("id").eq("auth_user_id", auth_user_id).execute()
            if result.data:
                resolved_id = result.data[0]["id"]
                self._cache[auth_user_id] = resolved_id
                return resolved_id

            # 3. Not found — auto-create the users row from Supabase Auth data
            try:
                auth_response = self.client.auth.admin.get_user_by_id(auth_user_id)
                auth_user = auth_response.user if auth_response else None
                email = (auth_user.email or "") if auth_user else ""
                full_name = ((auth_user.user_metadata or {}).get("full_name") or "") if auth_user else ""
            except Exception:
                email = ""
                full_name = ""

            insert_result = self.client.table("users").insert({
                "email": email,
                "full_name": full_name,
                "auth_user_id": auth_user_id,
            }).execute()

            if insert_result.data:
                resolved_id = insert_result.data[0]["id"]
                self._cache[auth_user_id] = resolved_id
                logger.info(f"Auto-created users row {resolved_id} for auth user {auth_user_id}")
                return resolved_id

            logger.warning(f"Could not create users row for auth user: {auth_user_id}. Using raw ID.")
            return auth_user_id

        except Exception as e:
            logger.error(f"Error resolving user ID {auth_user_id}: {e}")
            return auth_user_id

# Singleton instance
_instance = None

def get_user_service() -> UserService:
    global _instance
    if _instance is None:
        _instance = UserService()
    return _instance
