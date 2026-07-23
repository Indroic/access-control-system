# Termografía — Style Reference
> a thermal-optics instrument that acquires a face and returns a verdict

**Theme:** dark "night instrument" by default + a light "daylight instrument" variant, toggleable. Built on HeroUI v3.

<!-- DIRECTION CONTRACT (seed 2d2c1f28 · re-rolled grounded #6 · mode operate)
THESIS: the system sees heat and presence — a thermal-optics instrument that acquires a face as
a target and returns a verdict. Refuses the zinc SaaS dashboard rut AND, deliberately, the
night-vision-green / neon-glow-everywhere cliché.
OWN-WORLD: deep warm-charcoal instrument ground; an IRONBOW thermal signal layer (amber = active
/scan/brand, green = granted, red = denied, yellow = pending); target-acquisition reticle framing
the live subject; monospace telemetry readouts. Glow is reserved to two authored moments — the
scan sweep and the target lock; everything else is matte with hairline borders. Type Saira +
Spline Sans Mono. Radius 6px.
CONSTRAINT: every structural UI element is a HeroUI v3 component (Card, Tabs, Table, Modal, Chip,
Avatar, Button, TextField, Select, Alert, Separator, ProgressBar, Meter, Spinner, Tooltip),
themed through HeroUI's oklch CSS variables. Only non-component visuals (marks, reticle overlay,
scan beam, thermal legend) are custom SVG/CSS.
STORY: operators watch access as a live instrument feed — a roster of acquired subjects and a
telemetry event log; at the door, one target reticle locks on the face and returns a verdict.
FIRST VIEWPORT: kiosk — the live camera under a thermal-scan overlay inside a target reticle,
telemetry readouts down the side, one dominant acquire control; verdict locks in as a target box.
FORM: thermal-optics instrument HUD (re-rolled grounded #6).
-->

Termografía renders a facial access-control system as a thermal-imaging instrument. The interface
is an instrument feed, not a document and not a generic dashboard: a warm-charcoal field, matte
panels (HeroUI Cards) framed by hairlines, and a single expressive layer — the **ironbow thermal
signal**. Heat means activity: amber is the instrument's live/acquiring/scanning color and the
brand accent; green is a granted/verified reading; red is a denied/cold reading; yellow is a
pending state. Monospace **telemetry** carries every real measurement (timestamps, latency ms, IP,
ids, coordinates, counts). The one place the instrument "lights up" is the acquisition itself:
a scan beam sweeps the subject and a target reticle locks — those two authored moments own all the
glow. Everywhere else stays calm and legible so operators can work.

## Component mandate (HeroUI v3)

Structural UI is always a HeroUI component, themed — never a hand-rolled div dressed as one:
Card (panels), Tabs (console views), Table (roster + event log), Modal (enrollment, confirm),
Chip (status/verdict tags), Avatar (subject initial), Button, TextField/Input, Select/ListBox,
Alert, Separator, ProgressBar (enrollment hold), Meter (audit ratios), Spinner, Tooltip, Toast.
Custom code is limited to non-component visuals: the target/face mark, the reticle frame overlay,
the scan beam, the thermal legend bar, and telemetry rows.

## Theme & Ground

Two themes, toggled by a HeroUI Button in each header (choice persisted; defaults to system, then
dark). **Dark "night instrument"** (default): deep warm-charcoal ground, matte panels a step
lighter, warm off-white text — a security instrument watched over long sessions / a lit kiosk
panel in a dim entryway. **Light "daylight instrument"**: warm off-white paper ground, dark
charcoal-blue text, same ironbow signal (accent/success/danger darkened for contrast). Not pure
black, not neon in either.

## Color strategy

Restrained neutral instrument + a functional ironbow signal family. Color states a reading, never
decorates. No gradients as fills, no glowing borders, no glass. The thermal gradient appears only
as a thin legend/telemetry accent and inside the scan effect.

## Tokens (HeroUI v3 semantic vars — set in styles.css)

| Role | Token | Value (dark) |
|------|-------|--------------|
| Ground | `--background` | `oklch(0.165 0.022 285)` |
| Panel surface | `--surface` | `oklch(0.215 0.02 285)` |
| Panel raised | `--surface-secondary` | `oklch(0.25 0.02 285)` |
| Text | `--foreground` | warm white `oklch(0.95 0.008 70)` |
| Muted | `--muted` | steel `oklch(0.66 0.02 280)` |
| Hairline | `--border` | warm-white @ 12% |
| Accent / active-heat (brand) | `--accent` | amber `oklch(0.73 0.16 55)` |
| Granted | `--success` | thermal green `oklch(0.80 0.18 145)` |
| Denied | `--danger` | thermal red `oklch(0.62 0.23 25)` |
| Pending | `--warning` | amber-yellow `oklch(0.82 0.14 82)` |
| Thermal hot (scan/legend) | `--thermal-hot` | `oklch(0.95 0.06 85)` |

- `--radius: 0.375rem` (6px). HeroUI-native shape, instrument-crisp.

## Typography

- **Saira** (`--font-sans` = `--font-display`) — one technical grotesk across the whole interface.
  400–500 UI/body; 600–800 headings, verdict words. Slightly condensed, instrument character.
- **Spline Sans Mono** (`--font-mono`) — ONLY real data: timestamps, `latency_ms`, IP, ids,
  coordinates, counts, telemetry labels. Never decorative.

## Signature elements

- **Target reticle** — four corner brackets + optional crosshair framing the live subject
  (kiosk camera, enrollment frame). Idle: a slow breathing pulse. The product's core gesture.
- **Scan beam** — a thermal-amber line sweeping the subject while matching (authored glow).
- **Target lock** — on a verdict, a bordered target box snaps to the subject and a Chip-style
  verdict stamps in the semantic color (green granted / red denied). The one loud moment.
- **Telemetry rows** — mono key→value readouts (STATUS, LAT, ID, IP…) beside the feed.
- **Thermal legend** — a thin cold→hot gradient bar used sparingly as a brand/telemetry accent.
- **Status Chips** — HeroUI Chip (color success/danger/warning/accent) for roster + log states.

## Do / Don't

**Do:** frame the live subject in a target reticle; keep color to the thermal signal layer; use
mono only for measured data; let HeroUI components carry structure, themed; reserve glow to the
scan and lock moments; matte panels with hairline borders.

**Don't:** hand-roll a div where a HeroUI component exists; glowing borders/edges on panels;
night-vision-green monochrome; gradient text; glass; decorative grid backgrounds; a big-number
stat-card row (use Meter/telemetry framing); a modal for anything not needing protected focus
(enrollment does — it holds the camera).

## Motion

One authored moment per surface, exponential ease-out from an already-visible default:
- Kiosk: scan beam sweep during matching → target box locks + verdict Chip stamps on decision.
- Elsewhere: rows settle on live SSE update; the reticle breathes when idle. No scattered hovers,
  no identical per-section entrances. Respect `prefers-reduced-motion` (snap, no sweep/strike).

## Truthfulness

Door relay is NOT implemented: a successful match shows a **verified** reading (not "door opened")
with a pending note. Never fabricate customers, metrics, logos, or a door-open the hardware can't
perform. Any sample data shown outside the running app is synthetic.
