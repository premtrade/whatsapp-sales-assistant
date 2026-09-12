#!/usr/bin/env python3
"""Contact factory."""
import uuid


def make_contact(db_connection, **overrides):
    phone = overrides.get("phone", f"+1876{uuid.uuid4().int % 10000000000:010d}")
    name = overrides.get("display_name", f"Test Contact {uuid.uuid4().hex[:6]}")
    email = overrides.get("email", f"contact-{uuid.uuid4().hex[:8]}@example.com")
    company = overrides.get("company", "Garco Construction Services Limited")
    source = overrides.get("source", "whatsapp")
    status = overrides.get("status", "active")
    sql = f"""INSERT INTO contacts (phone, display_name, email, company, source, status)
              VALUES ('{phone}', '{name}', '{email}', '{company}', '{source}', '{status}')
              RETURNING id, phone, display_name, email, company, source, status;"""
    out, code, err = db_connection(sql)
    if code != 0:
        raise RuntimeError(f"make_contact failed: {err}")
    parts = out.split("|")
    return {
        "id": parts[0].strip(),
        "phone": parts[1].strip(),
        "display_name": parts[2].strip(),
        "email": parts[3].strip(),
        "company": parts[4].strip(),
        "source": parts[5].strip(),
        "status": parts[6].strip(),
    }
