#!/usr/bin/env bash
# Local preview backend: starts Supabase Postgres, Auth (GoTrue) and the REST API (PostgREST)
# in Docker, applies the migration and loads demo data. Throwaway: every run starts fresh.
# Then run `npm run dev:local` and open http://localhost:5173 (demo password: demo1234).
set -euo pipefail
cd "$(dirname "$0")/.."

# Well-known local-only secret (same as the Supabase CLI default). Not used anywhere real.
SECRET=super-secret-jwt-token-with-at-least-32-characters-long
export PGPASSWORD=postgres
PG=public.ecr.aws/supabase/postgres:15.8.1.060
AUTH=public.ecr.aws/supabase/gotrue:v2.170.0
REST=public.ecr.aws/supabase/postgrest:v12.2.3

if ! docker info >/dev/null 2>&1; then
  (dockerd >/tmp/dockerd.log 2>&1 &)
  for _ in $(seq 1 20); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi

docker rm -f fb-db fb-auth fb-rest >/dev/null 2>&1 || true
docker network create fb >/dev/null 2>&1 || true

echo "Starting database…"
docker run -d --name fb-db --network fb -p 54322:5432 -e POSTGRES_PASSWORD=postgres -e JWT_SECRET=$SECRET $PG >/dev/null
for _ in $(seq 1 60); do psql -h localhost -p 54322 -U supabase_admin -d postgres -c "select 1" >/dev/null 2>&1 && break; sleep 2; done
sleep 6  # the image restarts once after its init scripts
psql -h localhost -p 54322 -U supabase_admin -d postgres -qc \
  "alter user supabase_auth_admin with password 'postgres'; alter user authenticator with password 'postgres';"

echo "Starting auth and API…"
docker run -d --name fb-auth --network fb -p 9999:9999 \
  -e GOTRUE_API_HOST=0.0.0.0 -e PORT=9999 -e API_EXTERNAL_URL=http://localhost:5173/auth/v1 \
  -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:postgres@fb-db:5432/postgres \
  -e GOTRUE_SITE_URL=http://localhost:5173 -e "GOTRUE_URI_ALLOW_LIST=**" \
  -e GOTRUE_JWT_SECRET=$SECRET -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated \
  -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role \
  -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=true -e GOTRUE_PASSWORD_MIN_LENGTH=8 \
  $AUTH >/dev/null
docker run -d --name fb-rest --network fb -p 3000:3000 \
  -e PGRST_DB_URI=postgres://authenticator:postgres@fb-db:5432/postgres -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET=$SECRET $REST >/dev/null
for _ in $(seq 1 30); do curl -sf localhost:9999/health >/dev/null && break; sleep 1; done

echo "Applying migrations…"
for f in supabase/migrations/*.sql; do psql -h localhost -p 54322 -U postgres -v ON_ERROR_STOP=1 -q -f "$f"; done
psql -h localhost -p 54322 -U postgres -qc "notify pgrst, 'reload schema'"

echo "Loading demo data…"
ANON=$(node scripts/local-anon-key.mjs)
while IFS='|' read -r email name role; do
  curl -sf localhost:9999/signup -H "apikey: $ANON" -H "content-type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"demo1234\",\"data\":{\"full_name\":\"$name\",\"role\":\"$role\"}}" >/dev/null
done <<'USERS'
admin@demo.com|Platform Admin|investor
investor@demo.com|Nadia Rahman|investor
karim@demo.com|Karim Hossain|investor
business@demo.com|Farhan Ahmed|business
solar@demo.com|Sumaiya Islam|business
textile@demo.com|Tanvir Chowdhury|business
newbiz@demo.com|Rafi Uddin|business
USERS
psql -h localhost -p 54322 -U postgres -v ON_ERROR_STOP=1 -q -f supabase/seed.sql >/dev/null

echo "Local Supabase ready. Now run: npm run dev:local"
