#!/usr/bin/env bash
set -e

# Enable pgvector in the main database (created by POSTGRES_DB env var)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  CREATE EXTENSION IF NOT EXISTS vector;
SQL

# Create the biometric database
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-SQL
  CREATE DATABASE biometric_db;
SQL

# Enable pgvector in the biometric database
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "biometric_db" <<-SQL
  CREATE EXTENSION IF NOT EXISTS vector;
SQL
