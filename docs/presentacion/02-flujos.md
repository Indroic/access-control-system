# Diagramas de Flujo

Procesos principales del sistema descritos paso a paso.

---

## Flujo 1 — Registro de un nuevo usuario

```mermaid
flowchart TD
    A([Inicio]) --> B[El usuario abre la pantalla<br/>de registro]
    B --> C[/Ingresa nombre, correo<br/>y contraseña/]
    C --> D{¿Los datos son<br/>válidos?}
    D -->|No| E[Mostrar mensaje de error]
    E --> C
    D -->|Sí| F{¿El correo ya<br/>está registrado?}
    F -->|Sí| G[Mostrar 'correo en uso']
    G --> C
    F -->|No| H[Crear cuenta en el sistema]
    H --> I[Iniciar sesión automáticamente]
    I --> Z([Fin: usuario dentro del panel])
```

---

## Flujo 2 — Inicio de sesión con correo y contraseña

```mermaid
flowchart TD
    A([Inicio]) --> B[/El usuario ingresa<br/>correo y contraseña/]
    B --> C[El sistema busca la cuenta]
    C --> D{¿Existe la cuenta?}
    D -->|No| E[Mostrar 'credenciales inválidas']
    E --> B
    D -->|Sí| F{¿Coincide la<br/>contraseña?}
    F -->|No| E
    F -->|Sí| G[Iniciar sesión]
    G --> H[Redirigir al panel principal]
    H --> Z([Fin])
```

---

## Flujo 3 — Registro biométrico de un empleado

Realizado por un administrador para enrolar el rostro de un nuevo empleado.

```mermaid
flowchart TD
    A([Inicio]) --> B[El administrador selecciona<br/>al empleado]
    B --> C[Activar cámara]
    C --> D{¿Cámara<br/>disponible?}
    D -->|No| D1[Mostrar error de cámara] --> Z1([Fin])
    D -->|Sí| E[Capturar fotografías del rostro]
    E --> F[Enviar imágenes al<br/>servicio de reconocimiento]
    F --> G{¿Se detecta un<br/>rostro en las imágenes?}
    G -->|No| G1[Solicitar nueva captura] --> E
    G -->|Sí| H[Extraer rasgos faciales]
    H --> I[Guardar los rasgos<br/>asociados al empleado]
    I --> J[Marcar al empleado como<br/>'biometría registrada']
    J --> K[Mostrar confirmación]
    K --> Z([Fin])
```

---

## Flujo 4 — Identificación facial y acceso (estación de kiosko)

Flujo principal del sistema: el empleado se para frente al kiosko y pide acceso.

```mermaid
flowchart TD
    A([Inicio: persona frente al kiosko]) --> B[Capturar imagen del rostro]
    B --> C[Enviar imagen al servicio<br/>de reconocimiento]
    C --> D{¿Se detecta<br/>un rostro?}
    D -->|No| D1[Mensaje 'acérquese a la cámara'] --> B
    D -->|Sí| E[Comparar contra los rostros<br/>registrados]
    E --> F{¿Coincide con<br/>algún empleado?}
    F -->|No| F1[Mensaje 'acceso denegado'] --> B
    F -->|Sí| G[Identificar al empleado]
    G --> H[Registrar el acceso]
    H --> I[Enviar señal de apertura<br/>a la puerta]
    I --> J[Mostrar 'bienvenido, ' + nombre]
    J --> Z([Fin: puerta abierta])
```

---

## Flujo 5 — Gestión de usuarios (administrador)

```mermaid
flowchart TD
    A([Inicio]) --> B[Administrador abre<br/>el panel de usuarios]
    B --> C[Listar usuarios registrados]
    C --> D{¿Qué desea hacer?}
    D -->|Ver detalles| E[Mostrar ficha del usuario]
    D -->|Eliminar| F[Confirmar eliminación]
    F --> G{¿Confirma?}
    G -->|No| C
    G -->|Sí| H[Eliminar usuario<br/>y todos sus datos]
    H --> I[Actualizar la lista]
    I --> Z([Fin])
    E --> Z
```
