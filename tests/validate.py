#!/usr/bin/env python3
"""
tests/validate.py - One-command validation that runs all checks.
"""
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.abspath(__file__))


def run(cmd, label):
    print(f"\n{'='*70}")
    print(f"  {label}")
    print(f"{'='*70}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=REPO)
    print(result.stdout)
    if result.stderr:
        print(result.stderr)
    if result.returncode != 0:
        print(f"\nFAILED: {label}")
        return False
    print(f"\nPASSED: {label}")
    return True


def main():
    results = []
    results.append(run("python -m pytest tests/unit/ -v --tb=short", "Unit Tests"))
    results.append(run("python -m pytest tests/integration/ -v --tb=short", "Integration Tests"))
    results.append(run("python -m pytest tests/e2e/ -v --tb=short", "End-to-End Tests"))
    results.append(run("python -m pytest tests/security/ -v --tb=short", "Security Tests"))
    results.append(run("cd tests && npm run test:unit", "Node.js Workflow Validation"))

    print(f"\n{'='*70}")
    print("  VALIDATION SUMMARY")
    print(f"{'='*70}")
    passed = sum(results)
    total = len(results)
    print(f"  Passed: {passed}/{total}")
    if all(results):
        print("  ALL CHECKS PASSED")
        return 0
    else:
        print("  SOME CHECKS FAILED")
        return 1


if __name__ == "__main__":
    sys.exit(main())
