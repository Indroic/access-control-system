# Diagrama Morfológico

Descomposición del Sistema de Control de Acceso Biométrico en sus componentes principales.

```mermaid
graph TD
    SISTEMA["Sistema de Control de Acceso Biométrico"]

    SISTEMA --> M1["Módulo de<br/>Interfaz de Usuario"]
    SISTEMA --> M2["Módulo de<br/>Gestión de Usuarios"]
    SISTEMA --> M3["Módulo de<br/>Reconocimiento Facial"]
    SISTEMA --> M4["Módulo de<br/>Control de Acceso"]
    SISTEMA --> M5["Módulo de<br/>Almacenamiento"]

    M1 --> M1A["Pantalla de Inicio<br/>de Sesión"]
    M1 --> M1B["Panel de<br/>Administración"]
    M1 --> M1C["Estación de Acceso<br/>(Kiosko)"]

    M2 --> M2A["Registro de<br/>Usuarios"]
    M2 --> M2B["Autenticación<br/>por Credenciales"]
    M2 --> M2C["Gestión de<br/>Sesiones"]

    M3 --> M3A["Captura de Imagen"]
    M3 --> M3B["Extracción de<br/>Rasgos Faciales"]
    M3 --> M3C["Comparación e<br/>Identificación"]

    M4 --> M4A["Verificación de<br/>Identidad"]
    M4 --> M4B["Apertura de Puerta"]

    M5 --> M5A["Datos de Usuarios"]
    M5 --> M5B["Datos Biométricos"]
```

## Descripción

| Módulo | Función |
|--------|---------|
| **Interfaz de Usuario** | Pantallas que ve el usuario final: inicio de sesión, panel administrativo y estación de acceso. |
| **Gestión de Usuarios** | Crea cuentas, valida credenciales y mantiene la sesión activa. |
| **Reconocimiento Facial** | Procesa la imagen del rostro y la compara contra los rostros registrados. |
| **Control de Acceso** | Decide si la persona está autorizada y, en su caso, ordena abrir la puerta. |
| **Almacenamiento** | Guarda de forma persistente la información de usuarios y las huellas biométricas. |
