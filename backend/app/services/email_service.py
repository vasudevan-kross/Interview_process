"""
Email Service using Gmail SMTP.

Sends a "Submission Received" confirmation to the candidate when they submit an interview.

Configuration via environment variables:
    GMAIL_SENDER       — Gmail address to send FROM (default: vasudevan.r@krossark.com)
    GMAIL_APP_PASSWORD — 16-char App Password generated from Google Account
"""

import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# HTML template
# ──────────────────────────────────────────────────────────────────────────────

def _base_html(title: str, body: str) -> str:
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


def _submission_html(candidate_name: str, interview_title: str) -> str:
    body = f"""
<p>Dear <strong>{candidate_name}</strong>,</p>
<p>Thank you for completing the <strong>{interview_title}</strong> interview.</p>
<p>Your submission has been received and is currently being evaluated.
   You will hear back from us with the results shortly.</p>
<p>We appreciate the time and effort you put in. Best of luck!</p>"""
    return _base_html("Submission Received", body)


# ──────────────────────────────────────────────────────────────────────────────
# Core send function
# ──────────────────────────────────────────────────────────────────────────────

def send_email(to: str, subject: str, html: str, from_addr: Optional[str] = None) -> bool:
    """Send an HTML email via Gmail SMTP."""
    sender = from_addr or settings.GMAIL_SENDER
    app_password = settings.GMAIL_APP_PASSWORD

    if not sender or not app_password:
        logger.warning("GMAIL_SENDER or GMAIL_APP_PASSWORD not configured — email not sent")
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
# Public wrapper
# ──────────────────────────────────────────────────────────────────────────────

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


def _invite_html(candidate_name: str, interview_title: str, interview_link: str) -> str:
    body = f"""
<p>Dear <strong>{candidate_name}</strong>,</p>
<p>You have been invited to complete the <strong>{interview_title}</strong> technical assessment.</p>
<p>Please click the button below to access your interview:</p>
<p style="text-align:center; margin:28px 0;">
  <a href="{interview_link}"
     style="background:#4f46e5; color:#fff; padding:13px 32px;
            border-radius:6px; text-decoration:none; font-size:15px; font-weight:bold;">
    Start Assessment
  </a>
</p>
<p style="font-size:13px; color:#666;">Or copy and paste this link into your browser:<br>
  <a href="{interview_link}" style="color:#4f46e5;">{interview_link}</a>
</p>
<p>Good luck!</p>"""
    return _base_html(f"Interview Invitation: {interview_title}", body)


def send_interview_invite(
    candidate_email: str,
    candidate_name: str,
    interview_title: str,
    interview_link: str,
) -> bool:
    """Send an interview invitation with access link to a candidate."""
    return send_email(
        to=candidate_email,
        subject=f"Interview Invitation: {interview_title}",
        html=_invite_html(candidate_name, interview_title, interview_link),
    )


def _voice_interview_completion_html(candidate_name: str, campaign_name: str) -> str:
    body = f"""
<p>Dear <strong>{candidate_name}</strong>,</p>
<p>Thank you for completing the <strong>{campaign_name}</strong> voice screening interview.</p>
<p>Your interview has been recorded and is currently being reviewed by our team.
   We appreciate the time you took to speak with us about your experience and qualifications.</p>
<p>You will hear back from us with the next steps shortly.</p>
<p>Best of luck!</p>"""
    return _base_html("Voice Interview Completed", body)


def send_voice_interview_completion(
    candidate_email: str,
    candidate_name: str,
    campaign_name: str = "Voice Screening"
) -> bool:
    """Send a completion confirmation for voice interview to the candidate."""
    return send_email(
        to=candidate_email,
        subject=f"Interview Completed: {campaign_name}",
        html=_voice_interview_completion_html(candidate_name, campaign_name),
    )
