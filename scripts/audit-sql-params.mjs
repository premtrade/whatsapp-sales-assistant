/**
 * Finds Postgres parameters used without a type context.
 *
 * A parameter inside jsonb_build_object, jsonb_build_array or a bare
 * comparison cannot be typed by Postgres, so the query fails with "could not
 * determine data type of parameter $n" at runtime - the kind of failure that
 * only shows up when the code path is actually taken.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'backend', 'src');

const findings = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      walk(path);
      continue;
    }
    if (!['.ts', '.js'].includes(extname(path))) continue;

    const source = readFileSync(path, 'utf8');
    // Every template literal that looks like SQL.
    for (const match of source.matchAll(/`([^`]*\$\d+[^`]*)`/g)) {
      const sql = match[1];
      if (!/\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql)) continue;

      // A parameter with no cast and no other use to infer its type from.
      const bare = [...sql.matchAll(/\$(\d+)(?!::)/g)].map((m) => m[1]);
      if (!bare.length) continue;

      // A parameter is only a problem when it is used exclusively in a place
      // that cannot type it. If it appears anywhere else - a column
      // assignment, a cast, an array literal - Postgres infers the type from
      // that usage and the query is fine.
      for (const n of new Set(bare)) {
        const uses = [...sql.matchAll(new RegExp(`\\$${n}\\b`, 'g'))];
        if (uses.length === 0) continue;
        if (new RegExp(`\\$${n}\\s*::`).test(sql)) continue;

        // Every occurrence must be inside a jsonb_ call to be untyped.
        const allInJsonb = uses.every((u) => {
          const before = sql.slice(Math.max(0, u.index - 90), u.index);
          const open = before.lastIndexOf('(');
          const fn = before.slice(Math.max(0, before.lastIndexOf(',', open) + 1)).trim();
          return /jsonb_(build_object|build_array|set|agg|strip_nulls)$/i.test(fn);
        });
        if (!allInJsonb) continue;

        findings.push({
          file: path.replace(root, 'backend/src'),
          param: n,
          sql: sql.replace(/\s+/g, ' ').slice(0, 150),
        });
      }
    }
  }
}

walk(root);

if (!findings.length) {
  console.log('no untyped parameters found');
} else {
  for (const f of findings) {
    console.log(`\n  ${f.file}  $${f.param}`);
    console.log(`    ${f.sql}`);
  }
  console.log(`\n${findings.length} parameters with no type context`);
}
