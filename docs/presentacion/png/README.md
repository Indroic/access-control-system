# PNGs de los diagramas (fondo transparente)

Renderizados con [`@mermaid-js/mermaid-cli`](https://github.com/mermaid-js/mermaid-cli) (`mmdc -b transparent -s 2|3`). Todos los archivos están en formato PNG RGBA — el canal alpha guarda la transparencia.

## Inventario

| Archivo | Diagrama | Origen | Dimensiones |
|---------|----------|--------|-------------|
| `morfologico.png` | Morfológico (horizontal/banner) | `01-morfologico.md` | 2352 × 285 |
| `morfologico-vertical.png` | Morfológico (vertical, alternativo) | `01-morfologico.md` (LR) | 2352 × 4527 |
| `flujo-1-registro-usuario.png` | F1 – Registro de usuario | `02-flujos.md` | 1444 × 2340 |
| `flujo-2-inicio-sesion.png` | F2 – Inicio de sesión | `02-flujos.md` | 1298 × 2188 |
| `flujo-3-registro-biometrico.png` | F3 – Registro biométrico | `02-flujos.md` | 1440 × 3304 |
| `flujo-4-identificacion-kiosko.png` | F4 – Identificación en kiosko | `02-flujos.md` | 1492 × 3012 |
| `flujo-5-gestion-usuarios.png` | F5 – Gestión de usuarios | `02-flujos.md` | 996 × 2386 |
| `mapa-navegacion.png` | Mapa de navegación | `06-mapa-navegacion.md` | 2798 × 1356 |
| `dfd-nivel-0-contexto.png` | DFD Nivel 0 – Contexto | `07-dfd-uml.md` | 1784 × 484 |
| `dfd-nivel-1-descomposicion.png` | DFD Nivel 1 – Descomposición | `07-dfd-uml.md` | 1952 × 2892 |

> Los diagramas ER (`03-er-general.md`, `04-er-especifico.md`) no se renderizan aquí: se generan en dbdiagram.io de forma manual.

## Uso en PowerPoint / Google Slides

1. Insertar imagen → seleccionar el `.png` que corresponda.
2. Como tienen fondo transparente, se adaptan a cualquier color de slide.
3. **Para flujos altos** (3000+ px de alto): conviene insertarlos a 75% para que quepan completos, o partirlos en dos slides.
4. **Para el morfológico**: usa la versión horizontal como banner superior, o la vertical si quieres una slide tipo poster.

## Re-generar

Si modificas los archivos `.md` fuente, ejecuta:

```bash
cd docs/presentacion/png
python3 /tmp/extract_mermaid.py   # extrae los .mmd
for f in *.mmd; do
  npx -y -p @mermaid-js/mermaid-cli mmdc -i "$f" -o "${f%.mmd}.png" -b transparent -s 2
done
```

Flags relevantes de `mmdc`:

- `-b transparent` → fondo transparente.
- `-s N` → factor de escala (resolución × N). Usa 2 para web, 3 para impresión.
- `-w N` → ancho fijo. **No usar** salvo necesidad puntual; deforma layouts naturales.
- `-t dark` → tema oscuro (útil si el slide es oscuro).
