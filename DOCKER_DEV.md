# Desarrollo con Docker Compose - Guía de Uso

Este proyecto incluye configuración para desplegar en **modo desarrollo** usando `docker-compose.override.yml`.

## 🚀 Inicio Rápido

### Prerequisitos
- Docker Desktop o Docker Engine
- Docker Compose 2.0+
- Ningún servicio escuchando en los puertos: 3000, 3001, 5432, 8000

### Ejecutar en Modo Desarrollo

```bash
# Desde la raíz del proyecto
docker-compose up
```

**Eso es todo.** Docker Compose automáticamente:
1. Lee `docker-compose.yml` (configuración base)
2. Lee `docker-compose.override.yml` (sobrescrituras de desarrollo)
3. Inicia todos los servicios con hot reload

---

## 📁 Archivos Creados

### 1. `docker-compose.override.yml`
- Sobrescribe `docker-compose.yml` automáticamente
- Monta código fuente como volúmenes
- Usa comandos de desarrollo (`pnpm dev`, `uvicorn --reload`)
- Expone puertos para desarrollo

### 2. Dockerfiles de Desarrollo
- `Dockerfile.dev.server` - Hono backend con Node.js 22
- `Dockerfile.dev.web` - Next.js frontend con Node.js 22
- `Dockerfile.dev.biometric` - Python API con Python 3.14

---

## 🔄 Hot Reload

Todos los servicios detectan cambios automáticamente:

| Servicio | Puerto | Tecnología | Auto-Reload |
|----------|--------|-----------|------------|
| **Server** | 3000 | Hono + pnpm | ✅ Yes |
| **Web** | 3001 | Next.js + pnpm | ✅ Yes |
| **Biometric** | 8000 | FastAPI + uvicorn | ✅ Yes |

---

## 📝 Ejemplos de Desarrollo

### Modificar Server (Hono)
```bash
# Edita: apps/server/src/
# Los cambios se aplican automáticamente
# Ver logs: docker logs acs-server
```

### Modificar Web (Next.js)
```bash
# Edita: apps/web/src/
# Next.js recompila automáticamente
# Ver logs: docker logs acs-web
```

### Modificar Python API
```bash
# Edita: apps/biometric-api/src/
# Uvicorn recarga automáticamente
# Ver logs: docker logs acs-biometric
```

---

## 🛑 Detener Todo

```bash
docker-compose down
```

### Limpiar volúmenes (borra datos)
```bash
docker-compose down -v
```

---

## 🔍 Monitoreo y Debugging

### Ver logs en tiempo real
```bash
# Todos los servicios
docker-compose logs -f

# Solo un servicio
docker-compose logs -f server
docker-compose logs -f web
docker-compose logs -f biometric-api

# Últimas 100 líneas
docker-compose logs --tail=100
```

### Acceder a un contenedor
```bash
# Shell del server
docker exec -it acs-server sh

# Shell del Python API
docker exec -it acs-biometric bash

# Base de datos PostgreSQL
docker exec -it acs-postgres psql -U postgres -d access-control-system
```

---

## 📊 Puertos Disponibles

| Servicio | Endpoint | Propósito |
|----------|----------|----------|
| **Server** | `http://localhost:3000` | Hono API + Auth |
| **Web** | `http://localhost:3001` | Next.js Frontend |
| **Biometric** | `http://localhost:8000` | Python Biometric API |
| **Biometric** | `http://localhost:8000/docs` | FastAPI Swagger Docs |
| **PostgreSQL** | `localhost:5432` | Database |

---

## 🚨 Solución de Problemas

### El servidor no inicia
```bash
# Verificar logs
docker-compose logs server

# Reconstruir imagen
docker-compose build --no-cache server
docker-compose up server
```

### Errores de permisos en volúmenes (Linux)
```bash
# Puede ocurrir si tienes SELinux activo
# Solución: cambiar propietario
sudo chown -R $USER:$USER apps/
```

### Puerto ya en uso
```bash
# Ver qué proceso usa el puerto (ejemplo: 3000)
lsof -i :3000

# O modificar en docker-compose.override.yml:
# ports:
#   - "3010:3000"  # Local:Container
```

### node_modules corrupto
```bash
# Limpiar y reinstalar
docker-compose down -v
docker-compose up  # Volverá a instalar
```

---

## 🔧 Configuración Avanzada

### Variables de Entorno
Edita `docker-compose.override.yml` en la sección `environment:` de cada servicio.

### Cambiar Puerto del Dev Server
```yaml
# En docker-compose.override.yml
ports:
  - "3010:3000"  # Ahora accesible en localhost:3010
```

### Desactivar Hot Reload Temporalmente
```bash
# Cambiar comando en override.yml, o usar:
docker-compose exec server pnpm --filter server build
docker-compose exec server node dist/index.mjs
```

---

## ✅ Checklist de Verificación

Después de `docker-compose up`:

- [ ] `http://localhost:3000` responde (Hono API)
- [ ] `http://localhost:3001` abre (Next.js)
- [ ] `http://localhost:8000/health` retorna 200 (Python API)
- [ ] `docker-compose logs` no muestra errores críticos
- [ ] Modificar un archivo de code refleja cambios sin rebuild

---

## 📚 Recursos Adicionales

- [Docker Compose Docs](https://docs.docker.com/compose/)
- [Docker Compose Override](https://docs.docker.com/compose/multiple-compose-files/merge/)
- [Hono Docs](https://hono.dev)
- [Next.js Dev Docs](https://nextjs.org/docs/getting-started/installation)
- [FastAPI Uvicorn](https://www.uvicorn.org/)

---

**Última actualización:** 2026-05-09
