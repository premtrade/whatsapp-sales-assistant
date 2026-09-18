#!/usr/bin/env python3
"""TEMP: check whether a Groq model will actually call the appointment tool."""
import json
import os
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
key = ""
for line in open(os.path.join(REPO, ".env"), encoding="utf-8"):
    if line.startswith("GROQ_API_KEY="):
        key = line.split("=", 1)[1].strip()

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "05_Appointment_Tool",
            "description": "Create an appointment / site visit for the customer.",
            "parameters": {
                "type": "object",
                "properties": {
                    "conversation_id": {"type": "string"},
                    "contact_id": {"type": "string"},
                    "business_id": {"type": "string"},
                    "appointment_type": {"type": "string"},
                    "title": {"type": "string"},
                    "location": {"type": "string"},
                    "preferred_date": {"type": "string", "description": "YYYY-MM-DD"},
                    "preferred_time": {"type": "string", "description": "HH:MM 24h"},
                    "duration_minutes": {"type": "number"},
                    "request_id": {"type": "string"},
                },
                "required": ["preferred_date", "preferred_time"],
            },
        },
    }
]

SYSTEM = (
    "You are a WhatsApp sales assistant for Garco Construction Services Limited.\n"
    "Today's date is 2026-09-15 (timezone America/Jamaica).\n"
    "Use the Appointment Tool only when the customer asks to book an appointment or site visit.\n"
    "Never claim an appointment was booked unless the tool returned success.\n"
    "Return only compact valid JSON."
)

TESTS = [
    "Can I get an appointment for tomorrow at 3pm?",
    "What are your services?",
]

for model in ["qwen/qwen3.8-27b", "openai/gpt-oss-120b"]:
    print(f"\n##### {model} #####")
    for q in TESTS:
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": q},
            ],
            "temperature": 0.2,
            "max_tokens": 700,
        }
        if "appointment" in q:
            body["tools"] = TOOLS
            body["tool_choice"] = "auto"
        req = urllib.request.Request(
            "https://api.groq.com/openai/v1/chat/completions",
            data=json.dumps(body).encode(),
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                out = json.loads(resp.read().decode())
            msg = out["choices"][0]["message"]
            tc = msg.get("tool_calls")
            if tc:
                print(f"  Q: {q}")
                print(f"    TOOL_CALL: {tc[0]['function']['name']} args={tc[0]['function']['arguments']}")
            else:
                print(f"  Q: {q}")
                print(f"    content: {str(msg.get('content'))[:220]}")
        except Exception as ex:
            print(f"  Q: {q} -> ERROR {ex}")
