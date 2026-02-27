"""
Test script to verify Daily.co API connection
"""
import os
import requests
import time
from dotenv import load_dotenv

load_dotenv()

DAILY_API_KEY = os.getenv('DAILY_API_KEY')

if not DAILY_API_KEY:
    print("[ERROR] DAILY_API_KEY not found in .env file")
    print("\nPlease add to backend/.env:")
    print("DAILY_API_KEY=your_api_key_here")
    print("\nGet your API key from: https://dashboard.daily.co/developers")
    exit(1)

print(f"[OK] API Key found: {DAILY_API_KEY[:20]}...")

# Test API connection
url = "https://api.daily.co/v1/rooms"
headers = {
    "Authorization": f"Bearer {DAILY_API_KEY}",
    "Content-Type": "application/json"
}

print("\n[TEST] Testing Daily.co API connection...")

# Try to list rooms (GET request - simpler than creating)
response = requests.get(url, headers=headers)

if response.ok:
    print("[OK] Daily.co API connection successful!")
    rooms = response.json()
    print(f"     Found {len(rooms.get('data', []))} existing rooms")
else:
    print(f"[ERROR] Daily.co API error: {response.status_code}")
    print(f"        Response: {response.text}")
    print("\n[HELP] Common issues:")
    print("  1. Invalid API key - check your key at https://dashboard.daily.co/developers")
    print("  2. API key doesn't have room creation permissions")
    print("  3. Network/firewall blocking the request")
    exit(1)

# Try creating a test room
print("\n[TEST] Testing room creation...")
test_room_name = f"test-room-{int(time.time())}"
payload = {
    "name": test_room_name,
    "privacy": "private",
    "properties": {
        "enable_recording": "cloud"
    }
}

response = requests.post(url, json=payload, headers=headers)

if response.ok:
    print("[OK] Room creation successful!")
    room = response.json()
    print(f"     Room URL: {room.get('url')}")
    print(f"     Room name: {room.get('name')}")

    # Clean up - delete test room
    delete_url = f"{url}/{test_room_name}"
    requests.delete(delete_url, headers=headers)
    print("     (Test room deleted)")
else:
    print(f"[ERROR] Room creation failed: {response.status_code}")
    print(f"        Response: {response.text}")
    print("\n[HELP] Possible reasons:")
    print("  1. Invalid room name format (use lowercase, hyphens, alphanumeric)")
    print("  2. Room already exists with this name")
    print("  3. Invalid properties in request")
    exit(1)

print("\n" + "="*50)
print("[SUCCESS] All tests passed! Daily.co is configured correctly.")
print("="*50)
