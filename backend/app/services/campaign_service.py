"""
Service for managing hiring campaigns
"""
import logging
from typing import List, Dict, Any, Optional
from uuid import UUID
from datetime import datetime
from supabase import Client
from app.db.supabase_client import get_supabase

logger = logging.getLogger(__name__)


class CampaignService:
    """Service for campaign CRUD operations"""

    def __init__(self):
        self.client: Client = get_supabase()

    def create_campaign(
        self,
        org_id: str,
        user_id: str,
        name: str,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Create a new hiring campaign.

        Args:
            org_id: Organization ID
            user_id: User ID creating the campaign
            name: Campaign name
            description: Campaign description
            metadata: Campaign metadata (slots, target_roles, settings)

        Returns:
            Created campaign data
        """
        try:
            campaign_data = {
                'org_id': org_id,
                'created_by': user_id,
                'name': name,
                'status': 'active'
            }

            if description:
                campaign_data['description'] = description

            if metadata:
                campaign_data['metadata'] = metadata

            result = self.client.table('hiring_campaigns').insert(campaign_data).execute()

            if not result.data:
                raise ValueError("Failed to create campaign")

            logger.info(f"Created campaign: {result.data[0]['id']} - {name}")
            return result.data[0]

        except Exception as e:
            logger.error(f"Error creating campaign: {e}")
            raise

    def get_campaign(self, campaign_id: str, org_id: str) -> Dict[str, Any]:
        """
        Get campaign by ID.

        Args:
            campaign_id: Campaign ID
            org_id: Organization ID (for security)

        Returns:
            Campaign data
        """
        try:
            result = (
                self.client.table('hiring_campaigns')
                .select('*')
                .eq('id', campaign_id)
                .eq('org_id', org_id)
                .execute()
            )

            if not result.data:
                raise ValueError(f"Campaign not found: {campaign_id}")

            return result.data[0]

        except Exception as e:
            logger.error(f"Error fetching campaign {campaign_id}: {e}")
            raise

    def list_campaigns(
        self,
        org_id: str,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        List campaigns for an organization.

        Args:
            org_id: Organization ID
            status: Filter by status (active, completed, archived)
            limit: Maximum number of results
            offset: Offset for pagination

        Returns:
            List of campaigns
        """
        try:
            query = (
                self.client.table('hiring_campaigns')
                .select('*')
                .eq('org_id', org_id)
                .order('created_at', desc=True)
                .limit(limit)
                .offset(offset)
            )

            if status:
                query = query.eq('status', status)

            result = query.execute()
            return result.data or []

        except Exception as e:
            logger.error(f"Error listing campaigns: {e}")
            raise

    def update_campaign(
        self,
        campaign_id: str,
        org_id: str,
        update_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Update campaign.

        Args:
            campaign_id: Campaign ID
            org_id: Organization ID (for security)
            update_data: Fields to update

        Returns:
            Updated campaign data
        """
        try:
            # Only allow updating specific fields
            allowed_fields = {'name', 'description', 'status', 'metadata'}
            filtered_data = {k: v for k, v in update_data.items() if k in allowed_fields}

            if not filtered_data:
                raise ValueError("No valid fields to update")

            result = (
                self.client.table('hiring_campaigns')
                .update(filtered_data)
                .eq('id', campaign_id)
                .eq('org_id', org_id)
                .execute()
            )

            if not result.data:
                raise ValueError(f"Campaign not found: {campaign_id}")

            logger.info(f"Updated campaign: {campaign_id}")
            return result.data[0]

        except Exception as e:
            logger.error(f"Error updating campaign {campaign_id}: {e}")
            raise

    def delete_campaign(self, campaign_id: str, org_id: str) -> bool:
        """
        Delete (archive) a campaign.

        Args:
            campaign_id: Campaign ID
            org_id: Organization ID (for security)

        Returns:
            True if successful
        """
        try:
            # Soft delete by setting status to archived
            result = (
                self.client.table('hiring_campaigns')
                .update({'status': 'archived'})
                .eq('id', campaign_id)
                .eq('org_id', org_id)
                .execute()
            )

            if not result.data:
                raise ValueError(f"Campaign not found: {campaign_id}")

            logger.info(f"Archived campaign: {campaign_id}")
            return True

        except Exception as e:
            logger.error(f"Error archiving campaign {campaign_id}: {e}")
            raise

    def get_campaign_statistics(self, campaign_id: str) -> Dict[str, Any]:
        """
        Get campaign statistics using database function.

        Args:
            campaign_id: Campaign ID

        Returns:
            Campaign statistics
        """
        try:
            result = self.client.rpc('get_campaign_statistics', {'p_campaign_id': campaign_id}).execute()
            return result.data or {}

        except Exception as e:
            logger.error(f"Error fetching campaign statistics: {e}")
            raise

    def get_campaign_candidates_summary(self, campaign_id: str) -> List[Dict[str, Any]]:
        """
        Get summary of candidates by job.

        Args:
            campaign_id: Campaign ID

        Returns:
            List of job summaries
        """
        try:
            result = self.client.rpc('get_campaign_candidates_summary', {'p_campaign_id': campaign_id}).execute()
            return result.data or []

        except Exception as e:
            logger.error(f"Error fetching campaign candidates summary: {e}")
            raise

    def get_campaign_candidates(
        self,
        campaign_id: str,
        org_id: str,
        job_id: Optional[str] = None,
        stage: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Get candidates for a campaign with optional filters.

        Args:
            campaign_id: Campaign ID
            org_id: Organization ID
            job_id: Filter by job description ID
            stage: Filter by current stage
            limit: Maximum results
            offset: Offset for pagination

        Returns:
            List of pipeline candidates
        """
        try:
            query = (
                self.client.table('pipeline_candidates')
                .select('*')
                .eq('campaign_id', campaign_id)
                .eq('org_id', org_id)
                .is_('deleted_at', 'null')  # Exclude soft-deleted candidates
                .order('created_at', desc=True)
                .limit(limit)
                .offset(offset)
            )

            if job_id:
                query = query.eq('job_id', job_id)

            if stage:
                query = query.eq('current_stage', stage)

            result = query.execute()
            return result.data or []

        except Exception as e:
            logger.error(f"Error fetching campaign candidates: {e}")
            raise

    def add_candidate_to_campaign(
        self,
        campaign_id: str,
        org_id: str,
        job_id: str,
        candidate_name: str,
        candidate_email: str,
        candidate_phone: Optional[str] = None,
        interview_slot: Optional[Dict[str, Any]] = None,
        created_by: str = None
    ) -> Dict[str, Any]:
        """
        Add a candidate to a campaign.

        Args:
            campaign_id: Campaign ID
            org_id: Organization ID
            job_id: Job description ID
            candidate_name: Candidate name
            candidate_email: Candidate email
            candidate_phone: Candidate phone
            interview_slot: Interview slot assignment
            created_by: User ID creating the candidate

        Returns:
            Created pipeline candidate
        """
        try:
            candidate_data = {
                'campaign_id': campaign_id,
                'org_id': org_id,
                'job_id': job_id,
                'candidate_name': candidate_name,
                'candidate_email': candidate_email,
                'current_stage': 'resume_screening',
                'recommendation': 'pending',
                'final_decision': 'pending',
                'skipped_stages': []
            }

            if candidate_phone:
                candidate_data['candidate_phone'] = candidate_phone

            if interview_slot:
                candidate_data['interview_slot'] = interview_slot

            if created_by:
                candidate_data['created_by'] = created_by

            result = self.client.table('pipeline_candidates').insert(candidate_data).execute()

            if not result.data:
                raise ValueError("Failed to add candidate to campaign")

            logger.info(f"Added candidate to campaign {campaign_id}: {candidate_email}")
            return result.data[0]

        except Exception as e:
            logger.error(f"Error adding candidate to campaign: {e}")
            raise

    def bulk_add_candidates(
        self,
        campaign_id: str,
        org_id: str,
        candidates: List[Dict[str, Any]],
        created_by: str
    ) -> Dict[str, Any]:
        """
        Bulk add candidates to a campaign.

        Args:
            campaign_id: Campaign ID
            org_id: Organization ID
            candidates: List of candidate data dicts
            created_by: User ID creating the candidates

        Returns:
            Result with success count and errors
        """
        try:
            candidate_records = []

            for candidate in candidates:
                record = {
                    'campaign_id': campaign_id,
                    'org_id': org_id,
                    'job_id': candidate['job_id'],
                    'candidate_name': candidate['name'],
                    'candidate_email': candidate['email'],
                    'current_stage': 'resume_screening',
                    'recommendation': 'pending',
                    'final_decision': 'pending',
                    'skipped_stages': [],
                    'created_by': created_by
                }

                if candidate.get('phone'):
                    record['candidate_phone'] = candidate['phone']

                if candidate.get('interview_slot'):
                    record['interview_slot'] = candidate['interview_slot']

                candidate_records.append(record)

            # Bulk insert
            result = self.client.table('pipeline_candidates').insert(candidate_records).execute()

            imported_count = len(result.data) if result.data else 0
            logger.info(f"Bulk added {imported_count} candidates to campaign {campaign_id}")

            return {
                'success': True,
                'imported_count': imported_count,
                'skipped_count': len(candidates) - imported_count,
                'errors': []
            }

        except Exception as e:
            logger.error(f"Error bulk adding candidates: {e}")
            return {
                'success': False,
                'imported_count': 0,
                'skipped_count': len(candidates),
                'errors': [str(e)]
            }


def get_campaign_service() -> CampaignService:
    """Get campaign service instance"""
    return CampaignService()

