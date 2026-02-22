
## Remove hardcoded credentials from cron migration

### Problem
The pending cron migration would embed the Supabase anon key directly in source control, which is a security concern. Since `verify_jwt = false` is set for the `check-price-alerts` function, no Authorization header is needed when calling it from within the same Supabase project via `pg_net`.

### Plan

**1. Remove the cron migration file**
Delete or empty the migration file `supabase/migrations/20260222172228_0e45efef-aee9-4152-8f01-489c78640757.sql`. It currently only enables `pg_cron` and `pg_net` extensions, which can be enabled manually instead of via a committed migration.

**2. Set up cron via Lovable Cloud SQL runner**
Use the database insert tool (not a migration) to run the following SQL, which avoids committing secrets to source control:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'check-price-alerts-every-5-min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://xgtfvxbimkrgucwxdluh.supabase.co/functions/v1/check-price-alerts',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

Since `verify_jwt = false`, no Authorization header is needed -- the function is callable without a bearer token from within the project's own network.

**3. Clean up the migration file**
The migration file will be emptied to a no-op comment so it doesn't re-run the extension creation on future deployments.

### Technical details
- The edge function already authenticates to Supabase internally using `SUPABASE_SERVICE_ROLE_KEY` (line 18 of `index.ts`), so it has full admin access to read alerts and update rows regardless of who calls it.
- `verify_jwt = false` means the HTTP endpoint accepts unauthenticated requests, which is fine since the function itself doesn't expose sensitive data -- it only processes internal alert logic.
- No code changes needed to the edge function itself.
