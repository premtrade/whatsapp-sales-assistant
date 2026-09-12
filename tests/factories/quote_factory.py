#!/usr/bin/env python3
"""Quote factory."""
import uuid


def make_quote(db_connection, contact_id, conversation_id=None, **overrides):
    status = overrides.get("status", "draft")
    subtotal = overrides.get("subtotal", 15000)
    tax = overrides.get("tax", 2250)
    discount = overrides.get("discount", 0)
    total = overrides.get("total", 17250)
    currency = overrides.get("currency", "JMD")
    notes = overrides.get("notes", "Test quote")
    valid_days = overrides.get("valid_days", 30)
    sql = f"""INSERT INTO quotes (contact_id, conversation_id, status, subtotal, tax, discount, total, currency, notes, valid_until)
              VALUES ('{contact_id}', {'NULL' if conversation_id is None else f"'{conversation_id}'"}, '{status}', {subtotal}, {tax}, {discount}, {total}, '{currency}', '{notes}', NOW() + INTERVAL '{valid_days} days')
              RETURNING id, quote_number, contact_id, status, total, currency;"""
    out, code, err = db_connection(sql)
    if code != 0:
        raise RuntimeError(f"make_quote failed: {err}")
    parts = out.split("|")
    return {
        "id": parts[0].strip(),
        "quote_number": parts[1].strip(),
        "contact_id": parts[2].strip(),
        "status": parts[3].strip(),
        "total": parts[4].strip(),
        "currency": parts[5].strip(),
    }


def make_quote_item(db_connection, quote_id, **overrides):
    description = overrides.get("description", "General Construction Consultation")
    quantity = overrides.get("quantity", 1)
    unit = overrides.get("unit", "job")
    unit_price = overrides.get("unit_price", 15000)
    tax_rate = overrides.get("tax_rate", 15)
    discount = overrides.get("discount", 0)
    line_total = overrides.get("line_total", unit_price * quantity)
    sql = f"""INSERT INTO quote_items (quote_id, product_id, line_number, description, quantity, unit, unit_price, tax_rate, discount, line_total)
              VALUES ('{quote_id}', '{uuid.uuid4()}', 1, '{description}', {quantity}, '{unit}', {unit_price}, {tax_rate}, {discount}, {line_total})
              RETURNING id, quote_id, description, quantity, line_total;"""
    out, code, err = db_connection(sql)
    if code != 0:
        raise RuntimeError(f"make_quote_item failed: {err}")
    parts = out.split("|")
    return {
        "id": parts[0].strip(),
        "quote_id": parts[1].strip(),
        "description": parts[2].strip(),
        "quantity": parts[3].strip(),
        "line_total": parts[4].strip(),
    }
