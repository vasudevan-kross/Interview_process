"""
Email Service using Gmail SMTP.

Sends transactional emails for interview events:
- Interview invite (link + scheduled time)
- Submission confirmation (candidate)
- Evaluation complete (HR/interviewer)

Configuration via environment variables:
    GMAIL_SENDER       — Gmail address to send FROM (default: vasudevan.r@krossark.com)
    GMAIL_APP_PASSWORD — 16-char App Password generated from Google Account
    GMAIL_RECIPIENT    — Default TO address when no specific recipient is passed
"""

import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# HTML email templates
# ──────────────────────────────────────────────────────────────────────────────

def _base_html(title: str, body: str) -> str:
    """Wrap content in a minimal, clean HTML email shell."""
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {{ font-family: Arial, sans-serif; background:#f4f4f4; margin:0; padding:0; }}
    .container {{ max-width:600px; margin:30px auto; background:#fff;
                  border-radius:8px; overflow:hidden;
                  box-shadow:0 2px 8px rgba(0,0,0,0.1); }}
    .header {{ background:#1a1a2e; color:#fff; padding:24px 32px; }}
    .header h1 {{ margin:0; font-size:20px; }}
    .body {{ padding:28px 32px; color:#333; line-height:1.6; }}
    .btn {{ display:inline-block; margin-top:20px; padding:12px 24px;
            background:#4f46e5; color:#fff; text-decoration:none;
            border-radius:6px; font-weight:bold; }}
    .footer {{ background:#f9f9f9; padding:16px 32px;
               font-size:12px; color:#888; text-align:center; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>{title}</h1></div>
    <div class="body">{body}</div>
    <div class="footer">This is an automated message. Please do not reply to this email.</div>
  </div>
</body>
</html>"""


def _invite_html(candidate_name: str, interview_title: str,
                 join_link: str, scheduled_time: str) -> str:
    body = f"""
<p>Dear <strong>{candidate_name}</strong>,</p>
<p>You have been invited to participate in the following technical interview:</p>
<table cellpadding="6">
  <tr><td><strong>Interview</strong></td><td>{interview_title}</td></tr>
  <tr><td><strong>Scheduled At</strong></td><td>{scheduled_time}</td></tr>
</table>
<p>Click the button below to join when it's time:</p>
<a href="{join_link}" class="btn">Join Interview</a>
<p style="margin-top:20px;">If the button doesn't work, copy and paste this link into your browser:<br>
<a href="{join_link}">{join_link}</a></p>
<p>Best of luck!</p>"""
    return _base_html("Interview Invitation", body)


def _submission_html(candidate_name: str, interview_title: str) -> str:
    body = f"""
<p>Dear <strong>{candidate_name}</strong>,</p>
<p>Thank you for completing the <strong>{interview_title}</strong> interview.</p>
<p>Your submission has been received and is currently being evaluated. 
   You will hear back from us with the results shortly.</p>
<p>We appreciate the time and effort you put in. Best of luck!</p>"""
    return _base_html("Submission Received", body)


def _evaluation_html(candidate_name: str, interview_title: str,
                     score: float, total: float, percentage: float) -> str:
    body = f"""
<p>The evaluation for <strong>{candidate_name}</strong> is complete.</p>
<table cellpadding="6">
  <tr><td><strong>Interview</strong></td><td>{interview_title}</td></tr>
  <tr><td><strong>Score</strong></td><td>{score} / {total}</td></tr>
  <tr><td><strong>Percentage</strong></td><td>{percentage:.1f}%</td></tr>
</table>
<p>Please log in to the dashboard to review the full submission and make a decision.</p>"""
    return _base_html("Evaluation Complete", body)


# ──────────────────────────────────────────────────────────────────────────────
# Core send function
# ──────────────────────────────────────────────────────────────────────────────

def send_email(
    to: str,
    subject: str,
    html: str,
    from_addr: Optional[str] = None
) -> bool:
    """
    Send an HTML email via Gmail SMTP.

    Args:
        to: Recipient email address
        subject: Email subject line
        html: HTML body content
        from_addr: Override sender (defaults to settings.GMAIL_SENDER)

    Returns:
        True if sent successfully, False otherwise
    """
    sender = from_addr or getattr(settings, 'GMAIL_SENDER', 'vasudevan.r@krossark.com')
    app_password = getattr(settings, 'GMAIL_APP_PASSWORD', None)

    if not app_password:
        logger.warning("GMAIL_APP_PASSWORD not configured — email not sent")
        return False

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = sender
        msg['To'] = to
        msg.attach(MIMEText(html, 'html'))

        with smtplib.SMTP('smtp.gmail.com', 587) as server:
            server.ehlo()
            server.starttls()
            server.login(sender, app_password)
            server.sendmail(sender, to, msg.as_string())

        logger.info(f"Email sent → {to}: {subject}")
        return True

    except Exception as e:
        logger.error(f"Failed to send email to {to}: {e}")
        return False


# ──────────────────────────────────────────────────────────────────────────────
# Convenience wrappers
# ──────────────────────────────────────────────────────────────────────────────

def send_interview_invite(
    candidate_email: str,
    candidate_name: str,
    interview_title: str,
    join_link: str,
    scheduled_time: str
) -> bool:
    """Send an interview invite to a candidate."""
    return send_email(
        to=candidate_email,
        subject=f"Interview Invitation: {interview_title}",
        html=_invite_html(candidate_name, interview_title, join_link, scheduled_time),
    )


def send_submission_confirmation(
    candidate_email: str,
    candidate_name: str,
    interview_title: str
) -> bool:
    """Send a submission confirmation to the candidate."""
    return send_email(
        to=candidate_email,
        subject=f"Submission Received: {interview_title}",
        html=_submission_html(candidate_name, interview_title),
    )


def send_evaluation_complete(
    hr_email: str,
    candidate_name: str,
    interview_title: str,
    score: float,
    total: float,
    percentage: float
) -> bool:
    """Notify HR/interviewer that evaluation is complete."""
    return send_email(
        to=hr_email,
        subject=f"Evaluation Complete: {candidate_name} — {interview_title}",
        html=_evaluation_html(candidate_name, interview_title, score, total, percentage),
    )
