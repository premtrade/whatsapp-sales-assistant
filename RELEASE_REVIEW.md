# Focused owner login release

Base revision: `fcc21539655dc90f2d7472561d2ffd27e8d58d9f` (`main`).

## Included

- Normalize owner login email lookup and use `bcryptjs` to verify existing
  bcrypt password hashes without the native `bcrypt` dependency.
- Add an explicit environment-driven owner recovery command. The SQL bootstrap
  seed is unchanged, so it does not silently reset a deployed owner's password.
- Fix the backend config syntax and the three test files that failed lint in
  GitHub Actions.
- Add the missing contact inquiry input type required to build the current
  `main` revision.
- Keep production service ports bound to localhost with Compose `!override`;
  retain the existing named network configuration.

## Validation

- Backend TypeScript build: passed.
- Backend lint: passed with warnings only.
- Backend Jest: 10 suites, 107 tests passed.
- Production Compose config: parsed successfully. The isolated copy has no
  production `.env`, so Compose emitted missing-variable warnings.
- Docker image build and clean `npm ci` were not verified in this environment:
  Docker Engine access was denied and npm could not write its user cache. GitHub
  Actions must verify those steps before release.

## Release boundary

This is a local review copy only. It has not been pushed or deployed. The wider
billing, onboarding, workflow, and beta launch changes in the main workspace are
not included. Before deploy, reconcile the server's local production Compose
edits so the workflow's fast-forward pull can run without losing its port
bindings.
