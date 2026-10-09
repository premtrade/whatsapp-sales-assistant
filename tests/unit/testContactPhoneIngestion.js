/**
 * Regression tests for the "WhatsApp phone numbers missing from Inbox /
 * Customers pages" incident.
 *
 * Root cause: n8n workflow 01 extracted the customer phone only from
 * `payload.from`. When WAHA changed its webhook shape, an empty string was
 * silently upserted into contacts.phone, so every page rendered blank
 * phones. These tests lock in the fixed extraction expressions and the
 * fail-fast guard so the bug cannot regress.
 */
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");

const WORKFLOW_FILES = [
  "workflows/01 - Incoming WhatsApp Message.json",
  "workflows/01 - Incoming WhatsApp Message (FIXED).json",
  "import-01-incoming-whatsapp-fixed.json",
];

function loadWorkflow(relPath) {
  const content = fs
    .readFileSync(path.join(REPO, relPath), "utf-8")
    .replace(/^\uFEFF/, "");
  return JSON.parse(content);
}

function getAssignment(node, name) {
  const assignments =
    node.parameters?.assignments?.assignments?.find((a) => a.name === name) ||
    null;
  return assignments ? assignments.value : undefined;
}

describe.each(WORKFLOW_FILES)("WAHA phone ingestion (%s)", (relPath) => {
  let wf;
  beforeAll(() => {
    wf = loadWorkflow(relPath);
  });

  test("Normalize Payload extracts phone with chatId / _data fallbacks", () => {
    const node = wf.nodes.find((n) => n.name === "Normalize Payload");
    expect(node).toBeDefined();
    const phone = getAssignment(node, "phone");
    expect(phone).toContain("$json.body.payload.from");
    expect(phone).toContain("$json.body.payload.chatId");
    expect(phone).toContain("_data?.remote?.id?._serialized");
    // must strip the @s.whatsapp.net suffix and leading +
    expect(phone).toContain("split('@')[0]");
    expect(phone).toMatch(/replace\(\/\^\\\+\//);
  });

  test("customer_name no longer masks identity with 'Unknown'", () => {
    const node = wf.nodes.find((n) => n.name === "Normalize Payload");
    const name = getAssignment(node, "customer_name");
    expect(name).toBeDefined();
    expect(name).not.toContain("Unknown");
  });

  test("Sanitize Inputs throws on empty phone (fail fast, never write blanks)", () => {
    const node = wf.nodes.find((n) => n.name === "Sanitize Inputs");
    expect(node).toBeDefined();
    const code = node.parameters.jsCode;
    expect(code).toMatch(/String\(item\.phone \|\| ''\)\.trim\(\)/);
    expect(code).toMatch(/if \(!phone\)/);
    expect(code).toMatch(/throw new Error/);
    expect(code).toMatch(/missing customer phone/i);
  });

  test("guard logic rejects empty phones and passes valid ones", () => {
    const node = wf.nodes.find((n) => n.name === "Sanitize Inputs");
    const code = node.parameters.jsCode;
    // Execute the guard portion in isolation against representative inputs.
    const runGuard = (itemJson) => {
      // Only pass $input; the workflow code declares its own `item`.
      const fn = new Function("$input", code);
      return fn({ first: () => ({ json: itemJson }) });
    };

    // Valid WAHA payload phone -> passes through trimmed.
    const ok = runGuard({
      phone: "18765551234",
      message: "hi",
      customer_name: "John",
      message_id: "ABC123",
    });
    expect(ok[0].json.phone).toBe("18765551234");

    // Empty phone (the bug that blanked the UI) -> hard failure.
    expect(() => runGuard({ phone: "", message: "hi" })).toThrow(
      /missing customer phone/i
    );
    expect(() => runGuard({ phone: "   ", message: "hi" })).toThrow(
      /missing customer phone/i
    );
    expect(() => runGuard({ message: "hi" })).toThrow(
      /missing customer phone/i
    );
  });

  test("Upsert Contact still uses tenant-matched parameterized query", () => {
    const node = wf.nodes.find((n) => n.name === "Upsert Contact");
    expect(node).toBeDefined();
    const query = node.parameters.query;
    expect(query).toContain("INSERT INTO contacts");
    expect(query).toContain("ON CONFLICT (business_id, phone)");
    expect(query).toContain("waha_session_name");
    expect(query).toMatch(/\$1.*\$2.*\$3/s);
  });
});

describe("Migration 068 (contact phone repair)", () => {
  const sql = fs.readFileSync(
    path.join(REPO, "database/migrations/068_repair_contact_phone_ingestion.sql"),
    "utf-8"
  );

  test("deletes blank-phone contacts and their dependent rows", () => {
    expect(sql).toMatch(/bad_contacts/);
    expect(sql).toMatch(/DELETE FROM contacts/);
    expect(sql).toMatch(/DELETE FROM conversations/);
    expect(sql).toMatch(/DELETE FROM messages/);
  });

  test("detaches RESTRICT-referencing quotes/appointments before delete", () => {
    expect(sql).toMatch(/UPDATE quotes[\s\S]*SET contact_id = NULL/);
    expect(sql).toMatch(/UPDATE appointments[\s\S]*SET contact_id = NULL/);
  });

  test("backfills NULL business_id for tenant-scoped reads", () => {
    expect(sql).toMatch(/SET business_id = src\.business_id/);
  });

  test("adds NOT-BLANK check constraint to prevent future blank phones", () => {
    expect(sql).toMatch(/contacts_phone_not_blank/);
    expect(sql).toMatch(/CHECK \(btrim\(coalesce\(phone, ''\)\) <> ''\)/);
  });
});
