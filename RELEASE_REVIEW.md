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
- Keep the WAHA health check authenticated with the configured API key, matching
  the currently healthy server container.
- Deploy the exact GitHub Actions commit from a clean archive directory rather
  than pulling into the server's modified checkout. Validate the two-file
  production Compose model and create a compressed PostgreSQL cluster backup
  before rebuilding containers or running migrations.
- Resolve database credentials and backend port from the server's production
  Compose model, and prevent GitHub Actions environment variables from
  overriding values in the server `.env` during deployment.

## Validation

- Backend TypeScript build: passed.
- Backend lint: passed with 0 errors and 218 existing warnings.
- Backend Jest: 11 suites, 108 tests passed, including mixed-case login and
  existing bcrypt-hash coverage.
- Production Compose config: parsed successfully. The isolated copy has no
  production `.env`, so Compose emitted missing-variable warnings.
- Deployment workflow YAML parsed and its remote Bash script passed `bash -n`.
- Docker image build and clean `npm ci` were not verified in this environment:
  Docker Engine access was denied and npm could not write its user cache. GitHub
  Actions must verify those steps before release.

## Release boundary

This is a local review copy only. It has not been pushed or deployed. The wider
billing, onboarding, workflow, and beta launch changes in the main workspace are
not included. The deployment workflow leaves the server's existing checkout and
untracked project copy intact; it uses the checkout only to fetch the exact
commit and places release files in a sibling `waflo-releases` directory. It
expects the existing production `.env` to be readable from `DEPLOY_PATH`.
It runs the migration runner against the existing database; SQL init mounts are
not used to reset the platform owner's account or alter an existing volume.
