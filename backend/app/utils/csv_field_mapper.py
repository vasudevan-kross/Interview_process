"""Intelligent CSV field mapping for candidate imports."""

import re
from typing import Dict, List, Optional


class CSVFieldMapper:
    """Maps various CSV column names to standard fields."""

    # Field aliases for intelligent matching
    NAME_ALIASES = [
        'name', 'full name', 'candidate name', 'full_name',
        'candidate_name', 'applicant name', 'applicant'
    ]
    EMAIL_ALIASES = [
        'email', 'e-mail', 'email id', 'email_id', 'e_mail',
        'email address', 'mail', 'e mail'
    ]
    PHONE_ALIASES = [
        'phone', 'mobile', 'phone number', 'mobile number',
        'contact', 'contact number', 'cell', 'phone no', 'mobile no'
    ]

    @staticmethod
    def normalize_column_name(col: str) -> str:
        """Normalize column name: lowercase, strip, remove extra spaces."""
        return re.sub(r'\s+', ' ', col.strip().lower())

    @staticmethod
    def find_column_match(columns: List[str], aliases: List[str]) -> Optional[str]:
        """Find first matching column from aliases."""
        normalized_cols = {CSVFieldMapper.normalize_column_name(c): c for c in columns}
        for alias in aliases:
            if alias in normalized_cols:
                return normalized_cols[alias]
        return None

    @staticmethod
    def map_columns(df_columns: List[str]) -> Dict[str, Optional[str]]:
        """
        Map DataFrame columns to standard fields.

        Args:
            df_columns: List of column names from DataFrame

        Returns:
            Dict with 'name', 'email', 'phone' keys mapping to actual column names
        """
        return {
            'name': CSVFieldMapper.find_column_match(df_columns, CSVFieldMapper.NAME_ALIASES),
            'email': CSVFieldMapper.find_column_match(df_columns, CSVFieldMapper.EMAIL_ALIASES),
            'phone': CSVFieldMapper.find_column_match(df_columns, CSVFieldMapper.PHONE_ALIASES),
        }

    @staticmethod
    def format_phone_number(value) -> Optional[str]:
        """
        Format phone number to string, handling integers and None.

        Args:
            value: Phone number (can be int, float, str, or None)

        Returns:
            Formatted phone number string or None
        """
        import pandas as pd

        if pd.isna(value):
            return None

        # Convert to string and strip any decimals
        phone_str = str(int(value)) if isinstance(value, (int, float)) else str(value)

        # Remove non-digits
        phone_str = re.sub(r'\D', '', phone_str)

        # Return None if empty
        return phone_str if phone_str else None
