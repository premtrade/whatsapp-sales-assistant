# Recovering the platform owner account

Use this only when the platform owner cannot sign in. It creates or restores the
owner account using credentials entered at the shell. It does not put a default
password in the SQL seed.

From the production project directory, run:

```bash
read -r -p 'Platform owner email: ' PLATFORM_OWNER_EMAIL
read -r -s -p 'New platform owner password: ' PLATFORM_OWNER_PASSWORD
printf '\n'
export PLATFORM_OWNER_EMAIL PLATFORM_OWNER_PASSWORD
docker compose exec \
  -e PLATFORM_OWNER_EMAIL \
  -e PLATFORM_OWNER_PASSWORD \
  backend npm run owner:recover
unset PLATFORM_OWNER_EMAIL PLATFORM_OWNER_PASSWORD
```

Use a unique password of at least eight characters. The recovery script
normalizes the email address, hashes the password, and activates the platform
owner account. Do not place the password in a command argument, source control,
or a shared log.
