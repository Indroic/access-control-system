# Diagrama de Flujo de Datos (DFD) — Notación UML

Modela el sistema en términos de **procesos**, **almacenes de datos**, **entidades externas** y **flujos de datos**, siguiendo la metodología clásica de Yourdon/DeMarco adaptada a UML (estereotipos `<<process>>`, `<<datastore>>`, `<<external>>`).

Convenciones gráficas (Mermaid):

- `((nombre))` — proceso (círculo lógico)
- `[(nombre)]` — almacén de datos
- `[/nombre/]` — entidad externa
- Flechas etiquetadas — flujo de datos con el nombre del paquete que viaja

---

## DFD Nivel 0 (Contexto)

Vista de máxima abstracción: una sola caja "sistema" y todos los actores externos.

```mermaid
flowchart LR
    USR[/"<<external>><br/>Usuario / Empleado"/]
    ADM[/"<<external>><br/>Administrador"/]
    DOOR[/"<<external>><br/>Hardware Puerta<br/>(Relé GPIO)"/]
    INSF[/"<<external>><br/>Modelos InsightFace<br/>(huggingface mirror)"/]

    SYS((("<<system>><br/>Sistema de<br/>Control de Acceso<br/>Biométrico")))

    USR -->|"credenciales / rostro"| SYS
    SYS -->|"sesión / decisión de acceso"| USR

    ADM -->|"alta de usuario + fotos<br/>comandos de gestión"| SYS
    SYS -->|"reportes / listado de usuarios"| ADM

    SYS -->|"señal de apertura"| DOOR
    DOOR -->|"(no implementado: ACK)"| SYS

    INSF -->|"pesos del modelo .onnx<br/>(en warmup)"| SYS
```

---

## DFD Nivel 1 (Descomposición de subsistemas)

El sistema se desglosa en sus procesos macro. Almacenes de datos visibles.

```mermaid
flowchart TB
    USR[/"<<external>><br/>Usuario"/]
    ADM[/"<<external>><br/>Admin"/]
    DOOR[/"<<external>><br/>Puerta"/]

    P1((("1.0<br/><<process>><br/>Gestión de<br/>Identidad")))
    P2((("2.0<br/><<process>><br/>Captura y<br/>Render UI")))
    P3((("3.0<br/><<process>><br/>API tRPC")))
    P4((("4.0<br/><<process>><br/>Plugin<br/>Face-Biometrics")))
    P5((("5.0<br/><<process>><br/>Motor<br/>Biométrico")))
    P6((("6.0<br/><<process>><br/>Control de<br/>Hardware")))

    DS1[("D1<br/><<datastore>><br/>user / session /<br/>account")]
    DS2[("D2<br/><<datastore>><br/>user_faces<br/>(pgvector)")]
    DS3[("D3<br/><<datastore>><br/>verification<br/>(OTT)")]
    DS4[("D4<br/><<datastore>><br/>Modelos InsightFace<br/>en disco")]

    USR -->|"email + password"| P2
    USR -->|"rostro (frames)"| P2
    ADM -->|"acciones admin"| P2

    P2 -->|"signIn / signUp"| P1
    P2 -->|"tRPC calls"| P3
    P2 -->|"authenticateFace<br/>registerFace"| P4

    P1 -->|"R/W credenciales"| DS1
    P1 -->|"emite OTT"| DS3
    P3 -->|"R/W datos de usuario"| DS1
    P3 -->|"verifica sesión"| P1

    P4 -->|"valida sesión / crea sesión<br/>via internalAdapter"| P1
    P4 -->|"FormData (multipart)"| P5

    P5 -->|"INSERT / SELECT embeddings"| DS2
    P5 -->|"carga modelo"| DS4
    P5 -->|"verifica OTT"| P1
    P1 -.->|"valida OTT"| DS3

    P5 -->|"comando open-door"| P6
    P6 -->|"señal GPIO"| DOOR

    P1 -->|"sesión / cookie"| P2
    P3 -->|"respuesta tipada"| P2
    P4 -->|"resultado biométrico"| P2
    P2 -->|"UI rendered"| USR
    P2 -->|"UI rendered"| ADM
```

---

## DFD Nivel 2 — Expansión del proceso 4.0 (Plugin Face-Biometrics)

Desglose del subsistema más complejo: el puente entre Better-Auth (TS) y el servicio Python.

```mermaid
flowchart TB
    EXT[/"<<external>><br/>Cliente Web<br/>(authClient)"/]

    P4_1((("4.1<br/>Validar payload<br/>(Zod)")))
    P4_2((("4.2<br/>Decodificar base64<br/>→ Blob")))
    P4_3((("4.3<br/>Construir FormData")))
    P4_4((("4.4<br/>Llamar biometric-api")))
    P4_5((("4.5<br/>Interpretar respuesta")))
    P4_6((("4.6<br/>Actualizar usuario<br/>(internalAdapter)")))
    P4_7((("4.7<br/>Crear sesión<br/>+ Set-Cookie *")))

    DS1[("D1<br/>user / session")]
    P5[/"<<external>><br/>biometric-api<br/>(servicio 5.0)"/]

    EXT -->|"{ imageBase64, mimeType, userId? }"| P4_1
    P4_1 -->|"DTO validado"| P4_2
    P4_2 -->|"Blob + mime"| P4_3
    P4_3 -->|"FormData"| P4_4
    P4_4 -->|"POST multipart"| P5
    P5 -->|"JSON: match / count"| P4_5

    P4_5 -->|"register-face<br/>(BiometricRegisterResponse)"| P4_6
    P4_6 -->|"UPDATE user.face_meta"| DS1
    P4_6 -->|"respuesta JSON"| EXT

    P4_5 -->|"authenticate-face<br/>(BiometricIdentifyResponse)"| P4_7
    P4_7 -->|"INSERT session"| DS1
    P4_7 -->|"{ token, session, user }<br/>** falta Set-Cookie **"| EXT

    P4_5 -->|"search-user-by-face<br/>(sin crear sesión)"| EXT
```

\* El proceso 4.7 actualmente NO emite la cabecera `Set-Cookie` — ver hallazgo #1 de `ARCHITECTURE.md`. Está representado como debería estar.

---

## DFD Nivel 2 — Expansión del proceso 5.0 (Motor Biométrico)

Detalle de la arquitectura hexagonal del `apps/biometric-api`.

```mermaid
flowchart TB
    EXT_TRPC[/"<<external>><br/>Hono (proceso 4.0)"/]
    EXT_OTT[/"<<external>><br/>Hono (One-Time-Token)"/]
    EXT_DOOR[/"<<external>><br/>Relé GPIO (6.0)"/]

    P5_1((("5.1<br/>FastAPI Router<br/>/biometrics/*")))
    P5_2((("5.2<br/>Auth dependency<br/>(JWKS / OTT)")))
    P5_3((("5.3<br/>ExtractEncoding<br/>UseCase")))
    P5_4((("5.4<br/>RegisterBiometrics<br/>UseCase")))
    P5_5((("5.5<br/>IdentifyUser<br/>UseCase")))
    P5_6((("5.6<br/>OpenDoor<br/>UseCase")))
    P5_7((("5.7<br/>FaceEngine<br/>(InsightFace)")))
    P5_8((("5.8<br/>UserFaceRepository<br/>(SQLAlchemy + UoW)")))

    DS_PG[("D2<br/>user_faces<br/>(pgvector)")]
    DS_MODEL[("D4<br/>buffalo_l .onnx<br/>(~400MB)")]

    EXT_TRPC -->|"multipart files"| P5_1
    P5_1 -->|"verifica JWT (register)"| P5_2
    P5_2 -->|"401 si falta"| EXT_TRPC
    EXT_OTT -->|"X-Better-Auth-OTT"| P5_1
    P5_1 -->|"verifica OTT (open-door)"| P5_2

    P5_1 -->|"image_bytes"| P5_4
    P5_1 -->|"image_bytes"| P5_5
    P5_1 -->|"command"| P5_6

    P5_4 -->|"delega"| P5_3
    P5_5 -->|"delega"| P5_3
    P5_3 -->|"inferencia ArcFace"| P5_7
    P5_7 -->|"carga modelo (1ª vez)"| DS_MODEL
    P5_7 -->|"512-D normed_embedding"| P5_3

    P5_4 -->|"FaceBiometric entity"| P5_8
    P5_5 -->|"vector query"| P5_8
    P5_8 -->|"INSERT (en UoW)"| DS_PG
    P5_8 -->|"SELECT order by L2"| DS_PG
    DS_PG -->|"rows"| P5_8
    P5_8 -->|"entidad / not-found"| P5_5

    P5_6 -->|"comando open-door"| EXT_DOOR
```

---

## Tabla de flujos de datos (referencia)

Catálogo formal de cada flujo etiquetado en los diagramas.

| ID | Nombre | Origen | Destino | Estructura |
|----|--------|--------|---------|------------|
| F01 | Credenciales | Usuario | 1.0 Gestión Identidad | `{ email, password }` |
| F02 | Sesión + cookie | 1.0 | 2.0 UI | Set-Cookie httpOnly secure |
| F03 | tRPC request | 2.0 UI | 3.0 API tRPC | `{ procedure, input }` + cookie |
| F04 | tRPC response | 3.0 | 2.0 UI | JSON tipado vía `AppRouter` |
| F05 | imageBase64 (auth) | 2.0 UI | 4.0 Plugin | `{ imageBase64, mimeType? }` |
| F06 | imageBase64 (reg) | 2.0 UI | 4.0 Plugin | `{ imageBase64, mimeType?, userId }` |
| F07 | FormData multipart | 4.0 | 5.0 biometric-api | `multipart/form-data: file/files, user_id?` |
| F08 | IdentificationResponse | 5.0 | 4.0 | `{ match, user_id?, message }` |
| F09 | RegisterResponse | 5.0 | 4.0 | `{ status, count, message }` |
| F10 | UPDATE face_meta | 4.0 | D1 user | `{ faceRegistered, faceMeta }` |
| F11 | INSERT session | 4.0 / 1.0 | D1 session | `{ id, token, userId, expiresAt }` |
| F12 | embedding 512-D | 5.3 Extract | 5.4 / 5.5 | `Sequence[float]` |
| F13 | INSERT user_faces | 5.8 Repo | D2 user_faces | `FaceBiometric` mapeado a `UserFaceModel` |
| F14 | nearest neighbor query | 5.8 Repo | D2 user_faces | `SELECT … ORDER BY embedding <-> $1 LIMIT 1` |
| F15 | OTT | 1.0 | 5.2 Auth dep | Header `X-Better-Auth-One-Time-Token` |
| F16 | OTT verify | 5.2 | 1.0 | `POST /one-time-token/verify` |
| F17 | open-door signal | 5.6 | Relé | GPIO (no implementado) |
| F18 | warmup load | 5.7 | D4 modelos | Lectura de pesos `.onnx` |

---

## Trazabilidad: requisito → proceso → almacén

| Requisito funcional | Procesos involucrados | Almacenes tocados |
|---------------------|------------------------|--------------------|
| RF1: Registrar usuario con email/password | 1.0, 2.0 | D1 (user, account) |
| RF2: Iniciar sesión con email/password | 1.0, 2.0 | D1 (session) |
| RF3: Listar usuarios (admin) | 2.0, 3.0 | D1 (user) |
| RF4: Eliminar usuario (admin) | 2.0, 3.0 | D1 (user → CASCADE) |
| RF5: Registrar biometría de un usuario | 2.0, 4.0, 5.0 | D2 (user_faces), D1 (user.face_*) |
| RF6: Identificar usuario por rostro | 2.0, 4.0, 5.0 | D2, D1 (session) |
| RF7: Búsqueda de usuario por rostro (sin login) | 2.0, 4.0, 5.0 | D2, D1 (user) |
| RF8: Abrir puerta tras identificación | 1.0, 5.0, 6.0 | D3 (verification/OTT) |
| RF9: Verificar estado del API | 2.0, 3.0 | — |
