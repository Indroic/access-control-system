-- Habilita pgvector en la base por defecto (creada desde POSTGRES_DB).
-- Se ejecuta con psql por el entrypoint de Postgres (docker-entrypoint-initdb.d),
-- sin shebang, así que es inmune a terminaciones de línea CRLF de Windows.
CREATE EXTENSION IF NOT EXISTS vector;
