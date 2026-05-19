# Diccionario de Datos

Definición de cada dato que almacena o procesa el sistema, expresado en lenguaje del dominio (no técnico).

---

## Entidad: Usuario

| Atributo | Descripción |
|----------|-------------|
| Identificador | Código único e interno que el sistema asigna a cada persona al momento de registrarla. |
| Nombre | Nombre completo del usuario para mostrar en la interfaz. |
| Correo electrónico | Dirección que el usuario utiliza para iniciar sesión. Es única en todo el sistema. |
| Correo verificado | Indica si el correo fue confirmado por el usuario. |
| Foto de perfil | Imagen opcional para personalizar la cuenta. |
| Biometría registrada | Indicador (sí / no) que muestra si el usuario ya tiene su rostro enrolado. |
| Información biométrica adicional | Resumen del último registro biométrico (cuándo se hizo, cuántas fotos se usaron, etc.). |
| Fecha de alta | Día y hora en que se creó la cuenta. |
| Fecha de última modificación | Día y hora del último cambio en la cuenta. |

---

## Entidad: Cuenta

| Atributo | Descripción |
|----------|-------------|
| Identificador | Código interno único de la cuenta. |
| Tipo de cuenta | Indica cómo inicia sesión el usuario (por ejemplo, "correo y contraseña"). |
| Credencial | Contraseña del usuario, almacenada de forma cifrada (nunca en texto plano). |
| Fecha de creación | Cuándo se creó esta forma de acceso. |
| Usuario asociado | Persona a quien pertenece la cuenta. |

---

## Entidad: Sesión

| Atributo | Descripción |
|----------|-------------|
| Identificador | Código único de la sesión. |
| Token | Llave que el navegador presenta en cada acción para demostrar que ya inició sesión. |
| Fecha de inicio | Cuándo el usuario inició sesión. |
| Fecha de vencimiento | Hasta cuándo es válida esta sesión. |
| Dispositivo | Información del navegador / equipo desde el que se conectó. |
| Dirección IP | Dirección de red desde la que se conectó. |
| Usuario asociado | Persona dueña de la sesión. |

---

## Entidad: Rostro Registrado

| Atributo | Descripción |
|----------|-------------|
| Identificador | Código único de la captura. |
| Usuario asociado | Persona a quien pertenece el rostro. |
| Rasgos faciales | Conjunto de **512 valores numéricos** que describen matemáticamente el rostro. No es una foto y no se puede usar para reconstruirla. |
| Activo | Indica si esta captura sigue vigente o fue desactivada. |
| Fecha de registro | Cuándo se enroló este rostro. |
| Fecha de última modificación | Cuándo se actualizó el registro por última vez. |

---

## Entidad: Registro de Acceso *(propuesta)*

| Atributo | Descripción |
|----------|-------------|
| Identificador | Código único del intento de acceso. |
| Usuario | Persona identificada (si la hubo). |
| Puerta | Cuál puerta intentó abrir. |
| Fecha y hora | Momento exacto del intento. |
| Resultado | "Permitido" o "Denegado". |
| Método | Forma de identificación ("Facial" o "Credenciales"). |

---

## Datos en tránsito (no se almacenan)

Información que circula entre los componentes durante un proceso, pero que no queda guardada.

| Dato | Descripción |
|------|-------------|
| Imagen capturada | Fotografía tomada por la cámara del kiosko. Se procesa y se descarta de inmediato. |
| Resultado de identificación | Respuesta del módulo de reconocimiento: "coincide con el usuario X" o "no coincide". |
| Señal de apertura | Orden enviada al hardware de la puerta para abrirla. |

---

## Catálogos de valores

| Atributo | Valores permitidos |
|----------|-------------------|
| Tipo de cuenta | `correo` (otros como `google`, `microsoft` quedan abiertos para el futuro) |
| Resultado de acceso | `permitido` · `denegado` |
| Método de identificación | `facial` · `credenciales` |
