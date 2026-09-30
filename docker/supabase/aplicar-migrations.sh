#!/bin/sh
# Aplica, em ordem, as migrations de supabase/migrations que ainda não rodaram.
# Cada arquivo roda numa única transação junto com o seu registro de controle.
set -eu

PSQL="psql -h db -U postgres -d postgres -v ON_ERROR_STOP=1 -q"

$PSQL <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  name text not null,
  aplicada_em timestamptz not null default now()
);
SQL

aplicadas=0
for arquivo in /migrations/*.sql; do
  [ -e "$arquivo" ] || continue
  nome=$(basename "$arquivo" .sql)
  versao=${nome%%_*}
  if [ "$($PSQL -tAc "select 1 from supabase_migrations.schema_migrations where version = '$versao'")" = "1" ]; then
    continue
  fi
  echo "Aplicando $nome..."
  $PSQL -1 -f "$arquivo" \
    -c "insert into supabase_migrations.schema_migrations (version, name) values ('$versao', '$nome')"
  aplicadas=$((aplicadas + 1))
done

# Faz o PostgREST enxergar as tabelas e funções novas.
$PSQL -c "notify pgrst, 'reload schema'"
echo "Migrations aplicadas nesta execução: $aplicadas"
