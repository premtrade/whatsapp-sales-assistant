#!/usr/bin/env python3
"""TEMP: validate the Groq model name used by Workflow 2 and its tool-calling support."""
import json
import urllib.error
import urllib.request

KEY = [l.split("=", 1)[1].strip() for l in open(".env", encoding="utf-8")
       if l.startswith("GROQ_API_KEY=")][0]


def post(path, payload):
    req = urllib.request.Request(
        f"https://api.groq.com/openai/v1/{path}",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
            "User-Agent": "n8n/1.0 (+https://n8n.io)",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"__error__": e.code, "body": e.read().decode()[:400]}


for model in ["qwen/qwen3.8-27b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile"]:
    out = post("chat/completions", {
        "model": model,
        "messages": [{"role": "user", "content": "Reply with the single word: OK"}],
        "max_tokens": 20,
    })
    if "__error__" in out:
        print(f"[chat] {model}: ERROR {out['__error__']} {out.get('body','')[:160]}")
    else:
        print(f"[chat] {model}: OK -> {out['choices'][0]['message'].get('content')!r}")

# Tool-calling check against the configured model
tools = [{
    "type": "function",
    "function": {
        "name": "call_05_appointment_tool",
        "description": "Schedule a site visit or consultation when the customer requests an appointment.",
        "parameters": {
            "type": "object",
            "properties": {
                "preferred_date": {"type": "string"},
                "preferred_time": {"type": "string"},
            },
            "required": ["preferred_date"],
        },
    },
}]
out = post("chat/completions", {
    "model": "qwen/qwen3.8-27b",
    "messages": [
        {"role": "system", "content": "You are a WhatsApp sales assistant. Use tools when the user requests an appointment."},
        {"role": "user", "content": "Can I get an appointment for tomorrow at 3pm?"},
    ],
    "tools": tools,
    "max_tokens": 300,
})
if "__error__" in out:
    print("tool-call test ERROR:", out["__error__"], out.get("body", "")[:300])
else:
    msg = out["choices"][0]["message"]
    print("\ntool_calls:", json.dumps(msg.get("tool_calls"), indent=2)[:500])
    print("content:", str(msg.get("content"))[:200])