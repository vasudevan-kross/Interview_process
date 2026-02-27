"""
Vapi Assistant Automated Setup Script
=====================================
Configures the Vapi assistant with:
  1. System prompt (adapts questions for fresher vs experienced)
  2. Structured data schema (24 screening fields)
  3. Webhook URL for end-of-call reports
  4. Recording + transcription enabled

Usage:
  python setup_vapi_assistant.py

Requires:
  pip install httpx python-dotenv
"""

import httpx
import json
import os
from dotenv import load_dotenv

load_dotenv()

# ============================================================================
# Configuration
# ============================================================================

VAPI_PRIVATE_KEY = os.getenv("VAPI_PRIVATE_KEY", "0bbbf1cc-4d30-42aa-ae3f-c6e4e2dddc8f")
ASSISTANT_ID = os.getenv("VAPI_ASSISTANT_ID", "6d80b69e-81f4-472d-a2d8-7bf7e5c6d96e")

# Your ngrok URL (same for frontend + backend via Next.js rewrite proxy)
WEBHOOK_URL = "https://misdictated-claudine-nontangentially.ngrok-free.dev/api/v1/voice-screening/webhook"

VAPI_API_BASE = "https://api.vapi.ai"

# ============================================================================
# System Prompt
# ============================================================================

SYSTEM_PROMPT = """You are a professional HR screening assistant conducting a voice interview.

## Your Behavior
- Be warm, professional, and conversational
- Ask one question at a time and wait for the response
- If the candidate's answer is unclear, politely ask for clarification
- If an email address or name sounds ambiguous, politely ask the candidate to spell it out for accuracy
- Keep the conversation natural and flowing
- Thank the candidate at the end

## Variables
- Candidate Name: {{candidate_name}}
- Is Fresher: {{is_fresher}}

## Interview Flow

### If the candidate is a FRESHER (is_fresher = "true"):
Only ask these questions:
1. Can you confirm your full name?
2. What is your gender?
3. What is your email address?
4. What is your phone number?
5. What is your current location?
6. What is your native place?

### If the candidate is EXPERIENCED (is_fresher = "false"):
Ask ALL of the following questions:
1. Can you confirm your full name?
2. What is your gender?
3. What is your email address?
4. What is your phone number?
5. What is your current work location?
6. What is your native place?
7. Who is your current employer?
8. What is your work type — do you commute daily, weekly 3 days, or work remote?
9. Are you working full time or part time with your current organisation?
10. What is your current role or designation?
11. What is your area of expertise?
12. What is your total experience in years?
13. Do you have any certifications?
14. How many projects have you handled?
15. What is your current CTC in LPA?
16. What is your expected CTC in LPA?
17. What is your notice period as per company norms?
18. Are you currently serving your notice period?
19. What is your tentative joining date?
20. Do you have any existing offers from other companies?
21. What time are you available for interviews?
22. What is the size of your current team?
23. What are your current shift timings?
24. Why are you looking to leave your current job?

## Closing
After all questions are answered, say:
"Thank you for your time, {{candidate_name}}. We have all the information we need. Our team will get back to you shortly. Have a great day!"
"""

# ============================================================================
# Structured Data Schema (24 fields — all optional)
# ============================================================================

STRUCTURED_DATA_SCHEMA = {
    "type": "object",
    "properties": {
        "candidate_name": {
            "type": "string",
            "description": "Full name of the candidate. Ensure correct spelling if provided."
        },
        "gender": {
            "type": "string",
            "description": "Gender of the candidate"
        },
        "email": {
            "type": "string",
            "description": "Email address. If spelled out, combine accurately. Convert 'at' to '@' and 'dot' to '.'."
        },
        "phone_number": {
            "type": "string",
            "description": "Phone number"
        },
        "current_work_location": {
            "type": "string",
            "description": "Current work location/city"
        },
        "native_location": {
            "type": "string",
            "description": "Native place/hometown"
        },
        "current_employer": {
            "type": "string",
            "description": "Current employer/company name"
        },
        "work_type": {
            "type": "string",
            "description": "Work type: Commute Daily / Weekly 3 days / Remote"
        },
        "employment_type": {
            "type": "string",
            "description": "Full Time or Part Time"
        },
        "current_role": {
            "type": "string",
            "description": "Current role/designation"
        },
        "expertise_in": {
            "type": "string",
            "description": "Area of expertise"
        },
        "total_experience": {
            "type": "string",
            "description": "Total experience in years"
        },
        "certifications": {
            "type": "string",
            "description": "Any certifications"
        },
        "projects_handled": {
            "type": "string",
            "description": "Number of projects handled"
        },
        "current_ctc": {
            "type": "string",
            "description": "Current CTC in LPA"
        },
        "expected_ctc": {
            "type": "string",
            "description": "Expected CTC in LPA"
        },
        "notice_period": {
            "type": "string",
            "description": "Notice period as per company norms"
        },
        "serving_notice_period": {
            "type": "string",
            "description": "Whether currently serving notice period (Yes/No)"
        },
        "tentative_joining_date": {
            "type": "string",
            "description": "Tentative joining date"
        },
        "existing_offers": {
            "type": "string",
            "description": "Any existing offers from other companies"
        },
        "available_interview_time": {
            "type": "string",
            "description": "Available time for interviews"
        },
        "current_team_size": {
            "type": "string",
            "description": "Size of current team"
        },
        "current_shift_timing": {
            "type": "string",
            "description": "Current shift timings"
        },
        "reason_for_leaving": {
            "type": "string",
            "description": "Reason for leaving current job"
        }
    }
}

# ============================================================================
# Assistant Update Payload
# ============================================================================

ASSISTANT_UPDATE = {
    # System prompt
    "firstMessage": "Hello {{candidate_name}}! I'm an AI assistant from the HR team. I'll be conducting a brief screening interview with you today. Shall we get started?",

    "model": {
        "provider": "openai",
        "model": "gpt-4o-mini",
        "messages": [
            {
                "role": "system",
                "content": SYSTEM_PROMPT
            }
        ],
        "temperature": 0.4,
    },

    # Voice config
    "voice": {
        "provider": "11labs",
        "voiceId": "nPczCjzI2devNBz1zQrb",  # Default 11Labs Brian (Male)
        "fallbackPlan": {
            "voices": [
                {
                    "provider": "11labs",
                    "voiceId": "21m00Tcm4TlvDq8ikWAM",  # Fallback to 11Labs Rachel (Female)
                }
            ]
        }
    },

    # Transcription
    "transcriber": {
        "provider": "deepgram",
        "model": "nova-2",
        "language": "en",
        "fallbackPlan": {
            "transcribers": [
                {
                    "provider": "talkscriber",
                    "language": "en",
                }
            ]
        }
    },

    # Analysis plan — structured data extraction
    "analysisPlan": {
        "structuredDataPrompt": "Extract the following candidate screening information from the conversation. Only include fields that were actually discussed. Leave fields empty if not mentioned. For names and email addresses, extract exactly what was said. For emails, explicitly convert words like 'at' or 'dot' into their symbol equivalents (@ and .) and remove unnecessary spaces.",
        "structuredDataSchema": STRUCTURED_DATA_SCHEMA,
        "summaryPrompt": "Provide a brief 2-3 sentence summary of this candidate screening call, including the candidate's name, experience level, and key highlights.",
    },

    # Webhook for end-of-call reports
    "server": {
        "url": WEBHOOK_URL,
    },

    # Server messages to receive
    "serverMessages": [
        "end-of-call-report",
        "status-update",
    ],

    # Call settings
    "maxDurationSeconds": 900,  # 15 minutes max
    "recordingEnabled": True,
}


# ============================================================================
# Main
# ============================================================================

def main():
    print("=" * 60)
    print("  Vapi Assistant Setup Script")
    print("=" * 60)
    print(f"\n  Assistant ID : {ASSISTANT_ID}")
    print(f"  Webhook URL  : {WEBHOOK_URL}")
    print(f"  Schema fields: {len(STRUCTURED_DATA_SCHEMA['properties'])}")
    print()

    # Update assistant
    print("[1/2] Updating assistant configuration...")
    headers = {
        "Authorization": f"Bearer {VAPI_PRIVATE_KEY}",
        "Content-Type": "application/json",
    }

    response = httpx.patch(
        f"{VAPI_API_BASE}/assistant/{ASSISTANT_ID}",
        headers=headers,
        json=ASSISTANT_UPDATE,
        timeout=120.0,
    )

    if response.status_code == 200:
        data = response.json()
        print(f"  ✅ Assistant updated successfully!")
        print(f"     Name: {data.get('name', 'N/A')}")
        print(f"     ID:   {data.get('id')}")
    else:
        print(f"  ❌ Failed to update assistant!")
        print(f"     Status: {response.status_code}")
        print(f"     Response: {response.text[:500]}")
        return

    # Verify
    print("\n[2/2] Verifying configuration...")
    verify = httpx.get(
        f"{VAPI_API_BASE}/assistant/{ASSISTANT_ID}",
        headers=headers,
        timeout=15,
    )

    if verify.status_code == 200:
        assistant = verify.json()
        checks = {
            "System Prompt": bool(assistant.get("model", {}).get("messages")),
            "Webhook URL": assistant.get("server", {}).get("url") == WEBHOOK_URL,
            "Structured Schema": bool(assistant.get("analysisPlan", {}).get("structuredDataSchema")),
            "Recording Enabled": assistant.get("recordingEnabled", False),
            "Voice Configured": bool(assistant.get("voice")),
            "Transcriber Set": bool(assistant.get("transcriber")),
        }

        all_ok = True
        for check, passed in checks.items():
            status = "✅" if passed else "❌"
            print(f"     {status} {check}")
            if not passed:
                all_ok = False

        if all_ok:
            print(f"\n  🎉 Setup complete! Your assistant is ready.")
            print(f"\n  Next steps:")
            print(f"  1. Run the SQL migration in Supabase")
            print(f"  2. Start backend:  python -m uvicorn app.main:app --reload")
            print(f"  3. Start frontend: npm run dev")
            print(f"  4. Go to /dashboard/voice-screening")
        else:
            print(f"\n  ⚠️  Some checks failed. Review the output above.")
    else:
        print(f"  ⚠️  Could not verify (status {verify.status_code})")

    print()


if __name__ == "__main__":
    main()
