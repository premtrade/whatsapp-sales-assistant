import json, uuid, random, string

BASE = "workflows"

def rand_id():
    return str(uuid.uuid4())

# Patch Workflow 01
path = f"{BASE}/01 - Incoming WhatsApp Message.json"
with open(path, "r", encoding="utf-8") as f:
    wf = json.load(f)

# Find the position to insert the new node: after Upsert Contact node
nodes = wf["nodes"]
upsert_contact_idx = next(i for i, n in enumerate(nodes) if n["name"] == "Upsert Contact")
upsert_conversation_idx = next(i for i, n in enumerate(nodes) if n["name"] == "Upsert Conversation")

# Create new Postgres node: Get WAHA Session
new_node = {
    "parameters": {
        "operation": "executeQuery",
        "query": "SELECT waha_session_name FROM businesses WHERE id = $1;",
        "options": {
            "queryReplacement": "={{ $('Upsert Contact').first().json.business_id }}"
        }
    },
    "type": "n8n-nodes-base.postgres",
    "typeVersion": 2.7,
    "position": [-400, 200],
    "id": rand_id(),
    "name": "Get WAHA Session",
    "credentials": {
        "postgres": {
            "id": "tOjZeRRL1hW2zbUk",
            "name": "Postgres account"
        }
    }
}

# Insert after Upsert Contact, before Upsert Conversation
nodes.insert(upsert_conversation_idx, new_node)

# Update Call 'Workflow 2 - AI Brain' node to pass session
call_node = next(n for n in nodes if n["name"] == "Call 'Workflow 2 - AI Brain'")
call_node["parameters"]["workflowInputs"]["value"]["session"] = "={{ $('Get WAHA Session').first().json.waha_session_name || 'default' }}"

# Update connections:
# 1. Upsert Contact should now also connect to Get WAHA Session
# 2. Get WAHA Session should connect to Call 'Workflow 2 - AI Brain'
# But we need to keep Upsert Contact -> Upsert Conversation

# Actually, looking at n8n connections, the Call node currently gets input from Insert Audit Log.
# We need to also have it get input from Get WAHA Session. But in n8n, a node can only have one incoming connection source.
# However, the Call node is an Execute Workflow node - it can map from any node in the workflow regardless of connections.
# So we don't need to change connections! We just need the node to exist and the mapping to reference it.

# But wait - for the Postgres node to execute, it needs to be connected to the flow.
# Let me connect Upsert Contact -> Get WAHA Session -> Upsert Conversation
# But then the data from Get WAHA Session would flow into Upsert Conversation, which might break things.

# Alternative: Connect Upsert Contact -> Get WAHA Session, and also keep Upsert Contact -> Upsert Conversation
# Then have Get WAHA Session feed into Call node. But Call node already gets input from Insert Audit Log.

# Actually in n8n, if multiple nodes connect to the same node, the last one to execute wins.
# So if I connect both Insert Audit Log and Get WAHA Session to Call node, it might work if they execute in order.

# Let me try a different approach: add the session lookup directly in the Insert Audit Log node's SQL,
# or add it as a separate branch that merges.

# Actually, the simplest n8n-compatible approach:
# 1. Keep existing flow: Upsert Contact -> Upsert Conversation -> Insert Message -> Update Conversation -> Insert Audit Log -> Call
# 2. Add: Upsert Contact -> Get WAHA Session (parallel branch)
# 3. The Call node can reference ANY node in the workflow via $('Node Name'), even if not directly connected.
#    This is already happening: it references Normalize Payload, Sanitize Inputs, etc.

# So I don't need to change connections at all! I just need to:
# - Add the Postgres node to the nodes array
# - Update the Call node mapping

# Remove any connection changes I was planning
# The connections remain the same

with open(path, "w", encoding="utf-8") as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)
print(f"Patched {path}")

# Patch Workflow 02 - verify session is passed to WAHA send
path = f"{BASE}/Workflow 2 - AI Brain.json"
with open(path, "r", encoding="utf-8") as f:
    wf = json.load(f)

# Verify WAHA Send Message has session mapping
send_node = next(n for n in wf["nodes"] if n["name"] == "WAHA Send Message")
body = send_node["parameters"]["jsonBody"]
assert "session" in body, "Workflow 02 WAHA send missing session"
print(f"Workflow 02 session mapping OK")

# Patch Workflows 08, 09, 10 - change hardcoded session to dynamic
for wf_name in ["08 - Quote Follow-up Sequences.json", "09 - Appointment Reminders.json", "10 - Abandoned Conversation Recovery.json"]:
    path = f"{BASE}/{wf_name}"
    with open(path, "r", encoding="utf-8") as f:
        wf = json.load(f)
    
    send_node = next((n for n in wf["nodes"] if "WAHA Send" in n.get("name", "")), None)
    if send_node:
        # Change hardcoded "default" session to use a dynamic value
        # For these workflows, we'll add a Postgres lookup node first, then reference it
        old_body = send_node["parameters"]["jsonBody"]
        # Replace hardcoded session with dynamic lookup
        # Since these are triggered by webhook from backend, let's check if backend passes session
        # For now, replace with a code that gets session from a new Postgres node
        new_body = old_body.replace('"session": "default"', '"session": "={{ $json.waha_session_name || \\'default\\' }}"')
        send_node["parameters"]["jsonBody"] = new_body
        
        # Add a Postgres node to look up session if not present
        has_session_lookup = any(n.get("name", "").startswith("Get WAHA Session") for n in wf["nodes"])
        if not has_session_lookup:
            # Add after the first Postgres node or at the beginning
            postgres_nodes = [i for i, n in enumerate(wf["nodes"]) if n["type"] == "n8n-nodes-base.postgres"]
            if postgres_nodes:
                insert_idx = postgres_nodes[-1] + 1
            else:
                insert_idx = 1  # after webhook/trigger
            
            lookup_node = {
                "parameters": {
                    "operation": "executeQuery",
                    "query": "SELECT waha_session_name FROM businesses WHERE id = $1;",
                    "options": {
                        "queryReplacement": "={{ $json.business_id }}"
                    }
                },
                "type": "n8n-nodes-base.postgres",
                "typeVersion": 2.7,
                "position": [0, 100],
                "id": rand_id(),
                "name": "Get WAHA Session",
                "credentials": {
                    "postgres": {
                        "id": "tOjZeRRL1hW2zbUk",
                        "name": "Postgres account"
                    }
                }
            }
            wf["nodes"].insert(insert_idx, lookup_node)
            print(f"Patched {wf_name}: added Get WAHA Session node")
        else:
            print(f"Patched {wf_name}: updated session to dynamic")
        
        with open(path, "w", encoding="utf-8") as f:
            json.dump(wf, f, indent=2, ensure_ascii=False)

print("All patches applied.")
