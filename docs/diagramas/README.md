# Documentación de Diagramas — access-control-system

Conjunto de diagramas técnicos del sistema, generados siguiendo la metodología clásica de análisis y diseño estructurado / UML.

## Índice

| # | Artefacto | Archivo | Notación |
|---|-----------|---------|----------|
| 01 | Diagrama Morfológico | [`01-morfologico.md`](01-morfologico.md) | Árbol jerárquico (Mermaid) |
| 02 | Diagramas de Flujo (por caso de uso) | [`02-flujos.md`](02-flujos.md) | Flowchart (Mermaid) — 9 flujos |
| 03 | ER General (cross-DB) | [`03-er-general.dbml`](03-er-general.dbml) | DBML |
| 04 | ER Específico — `access-control-system` | [`04-er-acs.dbml`](04-er-acs.dbml) | DBML |
| 05 | ER Específico — `biometric_db` | [`05-er-biometric.dbml`](05-er-biometric.dbml) | DBML |
| 06 | Diccionario de Datos | [`06-diccionario-datos.md`](06-diccionario-datos.md) | Tabular |
| 07 | Mapa de Navegación | [`07-mapa-navegacion.md`](07-mapa-navegacion.md) | Flowchart + reglas (Mermaid) |
| 08 | DFD-UML (niveles 0, 1, 2) | [`08-dfd-uml.md`](08-dfd-uml.md) | Yourdon/DeMarco + UML |
| 09 | Diagrama de Despliegue | [`09-despliegue.md`](09-despliegue.md) | UML Deployment (Mermaid) |
| 10 | Diagrama de Clases | [`10-clases.md`](10-clases.md) | UML Class (Mermaid) |
| 11 | Diagrama de Componentes | [`11-componentes.md`](11-componentes.md) | UML Component (Mermaid) |
| 12 | Diagrama de Comunicación | [`12-comunicacion.md`](12-comunicacion.md) | UML Communication (Mermaid) |
| 13 | Diagrama de Casos de Uso | [`13-caso-de-uso.md`](13-caso-de-uso.md) | UML Use Case (Mermaid) |

## Cómo renderizar

- **Mermaid (.md)**: GitHub, VS Code (con extensión Markdown Preview Mermaid), o https://mermaid.live
- **DBML (.dbml)**: https://dbdiagram.io · CLI `dbml-cli` (`npx @dbml/cli render file.dbml`)

## Versionado

Última actualización: master @ `00cd845` + cambios working-tree de 2026-05-19.

Si modificas el esquema en [`packages/db/src/schema/auth.ts`](../../packages/db/src/schema/auth.ts) o las migraciones en [`apps/biometric-api/alembic/versions/`](../../apps/biometric-api/alembic/versions/), actualiza los archivos DBML y el diccionario de datos.
