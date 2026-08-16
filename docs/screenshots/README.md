# Screenshots

Real captures of the running stack with seeded demo data — no mockups.

| File | Screen |
| --- | --- |
| `01-login.png` | Sign in |
| `02-dashboard.png` | Operations panel — counters, recent incidents, live event feed |
| `03-personal.png` | Personnel with role and biometric-enrolment status |
| `04-zonas.png` | Zones — risk level, restricted flag, day/time window |
| `05-incidentes.png` | Incidents by type and severity |
| `06-bitacora.png` | Audit log |
| `08-kiosk.png` | Door kiosk with viewfinder and sensor telemetry |
| `09-dark-mode.png` | Operations panel, dark theme |
| `10-biometric-docs.png` | Biometric API OpenAPI docs at `:8000/docs` |

## Two honest caveats

**The kiosk viewfinder shows a synthetic camera.** The capture host had no
webcam, so the browser was launched with Chromium's fake capture device — hence
the green test pattern with a rolling shape and timer. Everything around it is
real: camera permission, the live viewfinder element, sensor telemetry and the
capture control.

**"Con biometría: 0".** Nobody is enrolled in the demo data. Enrolment needs an
actual face in front of the camera, and no real person's face belongs in a
public repository screenshot. Seeding a fake embedding would have made the
counter look better while making the screenshot a lie.

If you want a populated enrolment and a Granted verdict, run the stack on a
machine with a webcam and enrol yourself from the admin console — or feed a
consented face video with
`--use-file-for-fake-video-capture=<file>.y4m`.

## Demo data

Fictional throughout. Eight accounts across the four roles, six security zones
(including a night-shift window that crosses midnight and one deactivated zone),
and six incidents covering every incident type. No real personal data appears in
any screenshot.

## Regenerating them

```bash
docker compose -f docker-compose.local.yml up -d --build
```

1. Complete the first-run administrator flow (guarded by `ADMIN_SETUP_SECRET`,
   which the local compose file sets).
2. Create staff accounts, zones and a few incidents.
3. Capture at 1440×900 with `deviceScaleFactor: 2`, devtools closed.

### Gotchas if you script this

- **tRPC is mounted at `/api/trpc`,** not `/trpc`. Calling the latter returns a
  bare `404 Not Found` with no hint.
- **`/admin` redirects to `/dashboard`.** The panel routes (`/dashboard`,
  `/personal`, `/zonas`, `/incidentes`, `/bitacora`) are the real screens.
- **The dev containers install dependencies at container start.** On Docker
  Desktop for Windows, pnpm's store lives inside the bind-mounted repo, and
  linking back out through the Windows filesystem bridge can fail with
  `ERR_PNPM_ENOMEM`, leaving the server restart-looping forever. Pointing pnpm at
  a container-local store (`--store-dir`) avoids the bridge entirely and fixes
  it.
- **Grant camera permission** in the browser context, or `/access` renders its
  permission-denied state instead of the viewfinder.
