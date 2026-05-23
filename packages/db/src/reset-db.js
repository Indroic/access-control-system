import pg from 'pg';

const client = new pg.Client({
  connectionString: "postgresql://postgres:password@localhost:5432/access-control-system"
});

async function main() {
  console.log("Conectando a la base de datos para reinicio completo...");
  await client.connect();
  
  console.log("Limpiando base de datos (public schema cascade)...");
  await client.query("DROP SCHEMA public CASCADE;");
  await client.query("CREATE SCHEMA public;");
  await client.query("GRANT ALL ON SCHEMA public TO postgres;");
  await client.query("GRANT ALL ON SCHEMA public TO public;");
  
  console.log("Base de datos limpia y restablecida a cero exitosamente.");
  await client.end();
}

main().catch(err => {
  console.error("Error al reiniciar la base de datos:", err);
  process.exit(1);
});
