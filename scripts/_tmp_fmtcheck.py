"""TEMP: check if json.dumps(indent=2, ensure_ascii=False) round-trips workflow files."""
import json
import sys

for path in sys.argv[1:]:
    raw = open(path, encoding="utf-8").read()
    j = json.loads(raw)
    found = False
    for kwargs in (
        dict(indent=2, ensure_ascii=False),
        dict(indent=4, ensure_ascii=False),
        dict(indent=2, ensure_ascii=True),
    ):
        out = json.dumps(j, **kwargs)
        if out == raw:
            print(path, ": EXACT MATCH", kwargs)
            found = True
            break
        if out + "\n" == raw or out + "\r\n" == raw:
            print(path, ": MATCH + trailing newline", kwargs)
            found = True
            break
    if not found:
        print(path, ": no exact match; crlf=", "\r\n" in raw, "starts=", repr(raw[:14]),
              "len=", len(raw))