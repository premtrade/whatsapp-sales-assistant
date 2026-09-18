import re
import subprocess
import sys

ids = sys.argv[1:]
for i in ids:
    sql = 'SELECT data FROM execution_data WHERE "executionId" = %s;' % i
    p = subprocess.run(
        ["docker", "exec", "-i", "-e", "PGPASSWORD=WafloProd2026!Secure",
         "postgres", "psql", "-U", "waflo", "-d", "n8n", "-t", "-A"],
        input=sql, capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    s = p.stdout or ""
    is_broadcast = "broadcast" in s
    is_status = "status@broadcast" in s
    ev = re.search(r'"(message\.any|message)"', s)
    me = re.search(r'"(18767998637@c\.us)"', s)
    print(f"exec {i}: broadcast={is_broadcast} status@broadcast={is_status} me={bool(me)} any_event={bool(ev)}")