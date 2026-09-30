-- Senhas dos papéis internos do Supabase (mesmo arquivo do self-hosting oficial).
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
-- supabase_functions_admin fica de fora: só existe com o script de webhooks,
-- que este stack mínimo não usa.
