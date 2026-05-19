# Diagramas de Flujo — access-control-system

Un flujograma por cada caso de uso real del sistema. Notación: rombos = decisiones, rectángulos redondeados = inicio/fin, rectángulos = procesos, paralelogramos = E/S.

---

## F1. Registro de usuario (email + contraseña)

```mermaid
flowchart TD
    A([Inicio: usuario en /login]) --> B[/Captura email, password, name/]
    B --> C{¿Formulario válido<br/>en cliente?}
    C -->|No| B
    C -->|Sí| D[authClient.signUp.email]
    D --> E[POST /api/auth/sign-up/email-password]
    E --> F[Better-Auth valida payload]
    F --> G{¿Email único?}
    G -->|No| H[Respuesta 400]
    H --> I[Toast de error]
    I --> B
    G -->|Sí| J[INSERT user + account password]
    J --> K[INSERT session]
    K --> L[Set-Cookie httpOnly secure]
    L --> M[Redirect a /dashboard]
    M --> Z([Fin])
```

---

## F2. Login con email + contraseña

```mermaid
flowchart TD
    A([Inicio]) --> B[/Captura email, password/]
    B --> C[authClient.signIn.email]
    C --> D[POST /api/auth/sign-in/email-password]
    D --> E[Better-Auth lee account por email]
    E --> F{¿Hash de password<br/>coincide?}
    F -->|No| G[Respuesta 401]
    G --> H[Toast error] --> B
    F -->|Sí| I[INSERT session token único]
    I --> J[Set-Cookie sesión]
    J --> K[Redirect a /dashboard]
    K --> Z([Fin])
```

---

## F3. Consumo de tRPC autenticado (ej. `users.list`)

```mermaid
flowchart TD
    A([Inicio: render dashboard]) --> B[useQuery trpc.users.list]
    B --> C[POST /trpc/users.list<br/>credentials:include]
    C --> D[Hono recibe request]
    D --> E[createContext lee headers]
    E --> F[auth.api.getSession headers]
    F --> G{¿Sesión válida?}
    G -->|No| H[TRPCError UNAUTHORIZED]
    H --> I[QueryCache onError]
    I --> J[Toast error con retry]
    G -->|Sí| K[protectedProcedure inyecta ctx.session]
    K --> L[drizzle SELECT FROM user ORDER BY created_at]
    L --> M[Retorna lista]
    M --> N[React renderiza tabla]
    N --> Z([Fin])
```

---

## F4. Registro biométrico facial (admin)

```mermaid
flowchart TD
    A([Inicio: admin selecciona usuario]) --> B[/Encender cámara<br/>useCamera hook/]
    B --> C{¿Permiso<br/>concedido?}
    C -->|No| C1[Mostrar error de permisos]
    C1 --> Z1([Fin])
    C -->|Sí| D[Captura frame -> dataURL]
    D --> E[Convertir a base64]
    E --> F[authClient.registerFace<br/>imageBase64, userId]
    F --> G[POST /api/auth/face-biometrics/register-face]
    G --> H[faceBiometricsPlugin server]
    H --> I[base64 -> Buffer -> Blob -> FormData]
    I --> J[POST biometric-api/biometrics/register<br/>multipart]
    J --> K{¿Admin JWT<br/>presente?}
    K -->|No| K1[HTTP 401]
    K1 --> K2[APIError BAD_GATEWAY]
    K2 --> K3[Toast error] --> Z1
    K -->|Sí| L[ExtractEncodingUseCase<br/>por cada imagen]
    L --> M{¿Cara detectada?}
    M -->|No| M1[HTTP 400 sin rostro] --> K2
    M -->|Sí| N[normed_embedding 512-D]
    N --> O[UoW INSERT user_faces]
    O --> P[Commit transacción]
    P --> Q[Retorna count]
    Q --> R[internalAdapter.updateUser<br/>faceRegistered=true<br/>faceMeta]
    R --> S[Respuesta JSON al cliente]
    S --> T[Toast éxito]
    T --> Z([Fin])
```

---

## F5. Autenticación biométrica (kiosk)

```mermaid
flowchart TD
    A([Inicio: kiosko encendido]) --> B[/Capturar rostro<br/>cada N segundos/]
    B --> C[authClient.authenticateFace<br/>imageBase64]
    C --> D[POST /api/auth/face-biometrics/authenticate-face]
    D --> E[base64 -> FormData]
    E --> F[POST biometric-api/biometrics/identify]
    F --> G[ExtractEncodingUseCase]
    G --> H{¿Rostro detectado?}
    H -->|No| H1[HTTP 400] --> X[Mostrar 'reintente']
    H -->|Sí| I[Embedding 512-D]
    I --> J[UserFaceRepository.get_by_vector]
    J --> K[SELECT ORDER BY embedding<br/>L2-distance LIMIT 1]
    K --> L{¿Hay resultado?}
    L -->|No| L1[FaceBiometricNotFound]
    L1 --> L2[HTTP 404] --> X
    L -->|Sí| M[IdentificationResponse<br/>user_id, match=true]
    M --> N[internalAdapter.findUserById]
    N --> O{¿Usuario existe?}
    O -->|No| O1[APIError NOT_FOUND] --> X
    O -->|Sí| P[internalAdapter.createSession]
    P --> Q[Devuelve token + session]
    Q --> R{¿Set-Cookie aplicado?}
    R -->|No - BUG actual| R1[Cliente sigue anónimo] --> X
    R -->|Sí - estado deseado| S[Cliente con sesión]
    S --> T[Redirect / refresco kiosk]
    T --> Z([Fin: acceso concedido])
    X --> B
```

---

## F6. Apertura de puerta (relé) protegida por OTT

```mermaid
flowchart TD
    A([Inicio: usuario identificado]) --> B[Hono solicita OTT<br/>Better-Auth one-time-token]
    B --> C[Envía POST<br/>biometric-api/biometrics/hardware/open-door]
    C --> D[Header X-Better-Auth-One-Time-Token]
    D --> E[verify_one_time_token]
    E --> F[POST server/one-time-token/verify]
    F --> G{¿Token válido?}
    G -->|No| G1[HTTP 401] --> Z1([Fin: denegado])
    G -->|Sí| H[Extrae user_id de sesión]
    H --> I[OpenDoorUseCase.execute]
    I --> J{¿_open_door_relay<br/>implementado?}
    J -->|No - estado actual| J1[NotImplementedError]
    J1 --> J2[HTTP 501] --> Z1
    J -->|Sí| K[Activar GPIO del relé]
    K --> L[Retornar status, message,<br/>authorized_user_id]
    L --> Z([Fin: acceso concedido])
```

---

## F7. Listado y eliminación de usuarios (admin)

```mermaid
flowchart TD
    A([Inicio: /admin]) --> B[useQuery trpc.users.list]
    B --> C[Render tabla]
    C --> D{¿Acción?}
    D -->|Ver| E[Detalle usuario]
    D -->|Eliminar| F[Confirmación modal]
    F --> G{¿Confirma?}
    G -->|No| C
    G -->|Sí| H[useMutation<br/>trpc.users.delete]
    H --> I[POST /trpc/users.delete<br/>input: userId]
    I --> J[protectedProcedure]
    J --> K[db.delete user WHERE id=userId]
    K --> L[CASCADE elimina session, account]
    L --> M[Invalidate users.list query]
    M --> N[Re-render sin el registro]
    N --> Z([Fin])
```

---

## F8. Búsqueda de usuario por rostro (sin login)

Variante de F5 que no crea sesión — útil para pantallas de información.

```mermaid
flowchart TD
    A([Inicio]) --> B[Capturar frame]
    B --> C[authClient.searchUserByFace]
    C --> D[POST /face-biometrics/search-user-by-face]
    D --> E[Idéntico a F5 hasta findUserById]
    E --> F{¿Usuario encontrado?}
    F -->|No| F1[HTTP 404] --> X[UI: 'desconocido']
    F -->|Sí| G[Retornar user + biometric]
    G --> H[UI muestra ficha del usuario]
    H --> Z([Fin])
    X --> Z
```

---

## F9. Inicialización del motor de IA (startup)

```mermaid
flowchart TD
    A([FastAPI lifespan startup]) --> B[WarmupBiometricsUseCase.execute]
    B --> C[FaceEngine.get_instance]
    C --> D{¿Modelos en cache<br/>~/.insightface?}
    D -->|No| E[Descargar buffalo_l ONNX ~400MB]
    D -->|Sí| F[Cargar desde disco]
    E --> F
    F --> G[prepare ctx_id=0 det_size=640x640]
    G --> H[Motor en RAM]
    H --> I[yield - FastAPI acepta requests]
    I --> Z([Servicio listo])
```
