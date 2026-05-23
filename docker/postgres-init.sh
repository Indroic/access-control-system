#!/usr/bin/env bash
set -e

# Enable pgvector in the main database (created automatically from POSTGRES_DB)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  CREATE EXTENSION IF NOT EXISTS vector;
SQL
