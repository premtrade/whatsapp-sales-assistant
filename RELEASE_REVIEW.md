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
- Reconcile the legacy migration baseline where pgvector columns and
  tenant-owned row assignments were marked applied despite missing from the
  existing database, before dependent migrations run.
- Repair the single remaining unassigned knowledge document only when
  migration 046 is pending, Garco is the sole live business, and all other
  tenant-owned tables have no unassigned rows.
- Keep `super_admin` accounts global during login and request authentication;
  do not attach a platform owner to the first tenant (Garco). Tenant access is
  explicit through the existing `X-Tenant-ID` mechanism.
- Clear legacy `business_id` assignments from platform-owner accounts in
  migration 062, and ensure owner recovery clears the assignment as well.
- Correct platform business-list/detail calls to pass the authenticated user
  role and tenant scope expected by the business service.

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

## Production follow-up required

The latest production migration attempt applied the pgvector reconciliation
and dummy knowledge chunk migrations, then stopped at migration 046. The
read-only production inventory now shows Garco is the only business and there
is exactly one unassigned row in `knowledge_documents`; all other checked
tenant-owned tables have zero unassigned rows. Migration
`045_reconcile_null_knowledge_business_id.sql` encodes those exact preconditions
and fails closed if production has changed before it runs. Once deployed, the
runner should apply that repair before retrying migration 046 and the remaining
chain.

The existing public signup flow is the current tenant onboarding path: it
creates a business, an admin user with that business's own credentials, trial
subscription, and settings. Use it for Rolin IO after production migrations are
complete and the dedicated WhatsApp number, owner name, and tenant login email
are known. Keep the platform-owner login separate from the Rolin IO tenant
admin login. No production tenant has been created by this review branch.
