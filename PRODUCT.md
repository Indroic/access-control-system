# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two distinct audiences of the same system, both Spanish-speaking:

- **Administradores / personal de seguridad** — operate the admin console from a workstation. They register employees, enroll each person's face biometrics, monitor a real-time audit log of every access attempt, and receive security alerts. Roles form a hierarchy: `admin`, `gerente`, `jefe` (these three can receive push alerts), and `user` (empleado).
- **Empleados at the door** — stand in front of a camera at a physical entry point and look into it to be granted passage. They do not log in; the machine identifies them.

## Product Purpose

Grant or deny physical passage through a door based on facial biometric identity. The system replaces keys/badges with the face itself: an employee is enrolled once (multi-pose capture), and thereafter a single glance at the kiosk camera identifies them and triggers the door. Success = a fast, legible, trustworthy verdict (granted/denied) at the door, and a complete, real-time audit trail for the people responsible for the space.

## Positioning

Identity *is* the credential — no card, no PIN, no phone. A live camera reads the face, a pgvector similarity search matches it against enrolled biometric embeddings, and a verified match actuates the door. The distinguishing mechanism is the closed loop the operator can watch happen in real time: capture → biometric match → grant/deny → audited.

## Operating Context

- **Login / first-run setup** (`/`): email+password sign-in for staff; on a fresh system with no admin, a guarded first-run flow creates the root administrator using an installation secret (`ADMIN_SETUP_SECRET`).
- **Access kiosk** (`/access`): a full-screen station running on a device mounted at the door. Requests camera permission, shows a live viewfinder, and on "scan" captures a frame, POSTs it to the biometric auth endpoint, and shows Granted (with the identified person's name) or Denied, then auto-resets after a countdown. Runs unattended, repeatedly, in a public/entryway setting. [INFERRED: exact device/orientation not confirmed — design must work full-screen in both portrait wall-tablet and landscape.]
- **Admin console** (`/admin`): two tabs — **Empleados** (register personnel with a role, list them with biometric-enrollment status, launch face enrollment, delete non-admins) and **Registro de Auditoría** (summary counts + a live table of every event). A live SSE connection (`/api/sse/live-updates`) invalidates queries so the tables stay current without refresh. Alert-eligible roles can toggle Web Push security alerts.
- **Face enrollment** (modal in admin): a guided multi-pose capture — **front, right, left** — with on-device pose detection (MediaPipe) that auto-captures when the pose is correct, then uploads frames to `register-face`.

## Capabilities and Constraints

- Stack: TanStack Start/Router + React 19, HeroUI v3 (`@heroui/react`) on Tailwind v4, TanStack Query, Better-Auth client. Backend is Hono + tRPC; biometrics are a Python FastAPI service (InsightFace + ONNX + pgvector) bridged through a Better-Auth plugin.
- Audit event types in use: `biometric_match_success`, `biometric_match_failed`, `biometrics_registered`, `door_opened`, `door_open_failed`. Audit rows carry timestamp, action, related user, IP/origin, and details (e.g. `latency_ms`, `samples_count`).
- **Door hardware is not yet implemented.** On a successful match the kiosk currently shows "Identidad Verificada" with an explicit notice that the physical door relay is pending. The design must tell this truth, not fake a door-open it cannot perform.
- UI language is Spanish throughout; all copy stays Spanish.
- Admins cannot be deleted; only `admin`/`gerente`/`jefe` receive push alerts.

## Brand Commitments

No external corporate brand, logo, or palette was supplied. Working product name in the current UI: **"Control de Acceso Facial"**. [INFERRED: free to establish a self-standing product identity; not tied to a specific company's brand.]

## Evidence on Hand

Real, working functionality (auth, employee CRUD, multi-pose enrollment with pose detection, live audit via SSE, push alerts). No real customer names, logos, testimonials, metrics, or deployment references exist — none may be fabricated. Employee/audit data shown in any mock is synthetic and must be labeled as such.

## Product Principles

1. **The verdict is the product.** Granted/denied must be instantaneous to read and impossible to misinterpret at a glance, from across a room.
2. **Show the machine thinking.** The pipeline (capture → match → decide → audit) is the trust story; make its states visible rather than hidden behind a spinner.
3. **Tell hardware truth.** Never imply a door opened when the relay is unimplemented; distinguish "identity verified" from "door opened".
4. **Operators live in the audit log.** Real-time, scannable, legible event history is the console's spine, not a secondary tab.
5. **Spanish, precise, security-register copy.** Name actions and name failures with their recovery.

## Accessibility & Inclusion

Kiosk is used standing, possibly at arm's length and in variable entryway light — verdict states must meet contrast and read at distance, not rely on color alone. Camera-permission-denied and no-match are expected, first-class states, not errors to hide.
