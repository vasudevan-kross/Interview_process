"""Timezone helpers for coding-interview timestamps.

Legacy rows in coding_interviews / coding_submissions were stored as
TIMESTAMP WITHOUT TIME ZONE holding APP_TIMEZONE wall-clock time (Postgres
silently drops any offset on insert). Migration 049 converts them to
TIMESTAMPTZ. These helpers work with both shapes:

* ``now_app()`` returns an aware datetime in APP_TIMEZONE. Its ``isoformat()``
  carries the offset, so it stores correctly in TIMESTAMPTZ and degrades to the
  right wall-clock value in a legacy TIMESTAMP column.
* ``parse_db_ts()`` always returns an aware datetime; naive values are assumed
  to be APP_TIMEZONE wall-clock time.

Never compare these values against ``datetime.now()`` — the server clock is UTC
on Render.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional

from app.config import settings

try:
    from zoneinfo import ZoneInfo
    APP_TZ = ZoneInfo(settings.APP_TIMEZONE)
except Exception:  # tz database missing — fall back to IST fixed offset
    APP_TZ = timezone(timedelta(hours=5, minutes=30))


def now_app() -> datetime:
    """Current time as an aware datetime in APP_TIMEZONE."""
    return datetime.now(APP_TZ)


def parse_db_ts(value: Optional[str]) -> Optional[datetime]:
    """Parse a DB timestamp string into an aware datetime."""
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=APP_TZ)
    return dt


def to_aware(dt: Optional[datetime]) -> Optional[datetime]:
    """Make a datetime aware, assuming APP_TIMEZONE for naive values."""
    if dt is None or dt.tzinfo is not None:
        return dt
    return dt.replace(tzinfo=APP_TZ)
