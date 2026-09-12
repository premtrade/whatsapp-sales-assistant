const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const WORKFLOW_DIR = path.join(REPO, "workflows");

function loadWorkflows() {
  const files = fs.readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const content = fs.readFileSync(path.join(WORKFLOW_DIR, f), "utf-8");
    return { name: f, data: JSON.parse(content) };
  });
}

describe("Workflow JSON Validation", () => {
  let workflows;

  beforeAll(() => {
    workflows = loadWorkflows();
  });

  test("all workflow files are valid JSON", () => {
    for (const wf of workflows) {
      expect(() => JSON.parse(fs.readFileSync(path.join(WORKFLOW_DIR, wf.name), "utf-8"))).not.toThrow();
    }
  });

  test("all workflows have required top-level fields", () => {
    for (const wf of workflows) {
      expect(wf.data).toHaveProperty("name");
      expect(wf.data).toHaveProperty("nodes");
      expect(wf.data).toHaveProperty("connections");
      expect(Array.isArray(wf.data.nodes)).toBe(true);
      expect(typeof wf.data.connections === "object").toBe(true);
    }
  });

  test("all nodes have required fields", () => {
    for (const wf of workflows) {
      for (const node of wf.data.nodes) {
        expect(node).toHaveProperty("id");
        expect(node).toHaveProperty("name");
        expect(node).toHaveProperty("type");
        expect(node).toHaveProperty("typeVersion");
        expect(node).toHaveProperty("position");
      }
    }
  });

  test("all node IDs are unique within each workflow", () => {
    for (const wf of workflows) {
      const ids = wf.data.nodes.map((n) => n.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    }
  });

  test("all node names are unique within each workflow", () => {
    for (const wf of workflows) {
      const names = wf.data.nodes.map((n) => n.name);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    }
  });

  test("all connection references exist in nodes", () => {
    for (const wf of workflows) {
      const nodeIds = new Set(wf.data.nodes.map((n) => n.id));
      const nodeNames = new Set(wf.data.nodes.map((n) => n.name));
      for (const [source, targets] of Object.entries(wf.data.connections)) {
        expect(nodeNames.has(source) || nodeIds.has(source)).toBe(true);
        for (const arr of targets.main || []) {
          for (const conn of arr) {
            expect(nodeNames.has(conn.node) || nodeIds.has(conn.node)).toBe(true);
          }
        }
      }
    }
  });

  test("no broken connection references", () => {
    for (const wf of workflows) {
      const nodeNames = new Set(wf.data.nodes.map((n) => n.name));
      const nodeIds = new Set(wf.data.nodes.map((n) => n.id));
      for (const [source, targets] of Object.entries(wf.data.connections)) {
        expect(nodeNames.has(source) || nodeIds.has(source)).toBe(true);
      }
    }
  });

  test("postgres nodes use parameterized queries ($1, $2, etc.)", () => {
    for (const wf of workflows) {
      for (const node of wf.data.nodes) {
        if (node.type === "n8n-nodes-base.postgres") {
          const query = node.parameters?.query || "";
          if (query.includes("executeQuery")) {
            const queryStr = typeof query === "string" ? query : "";
            const hasParams = /\$\d+/.test(queryStr);
            expect(hasParams).toBe(true);
          }
        }
      }
    }
  });

  test("workflow names are non-empty strings", () => {
    for (const wf of workflows) {
      expect(typeof wf.data.name).toBe("string");
      expect(wf.data.name.length).toBeGreaterThan(0);
    }
  });

  test("positions are arrays of two numbers", () => {
    for (const wf of workflows) {
      for (const node of wf.data.nodes) {
        expect(Array.isArray(node.position)).toBe(true);
        expect(node.position.length).toBe(2);
        expect(typeof node.position[0]).toBe("number");
        expect(typeof node.position[1]).toBe("number");
      }
    }
  });

  test("active field is boolean", () => {
    for (const wf of workflows) {
      expect(typeof wf.data.active).toBe("boolean");
    }
  });
});
