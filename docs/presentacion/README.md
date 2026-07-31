# Diagramas para Presentación de Tesis

Versiones simplificadas de los diagramas técnicos del sistema, redactadas para una audiencia académica (tutores y jurado) que no necesita conocer la implementación.

Todos los diagramas están escritos en **Mermaid** y pueden:
- Visualizarse directamente en GitHub o en VSCode (con la extensión de previsualización de Markdown).
- Exportarse como imagen desde https://mermaid.live (pegando el código entre las marcas ` ```mermaid `).
- Insertarse en PowerPoint / Google Slides como imagen.

## Índice

| # | Diagrama | Archivo | Propósito en la presentación |
|---|----------|---------|------------------------------|
| 01 | Morfológico | [`01-morfologico.md`](01-morfologico.md) | Mostrar las "piezas" que componen el sistema. |
| 02 | Flujos | [`02-flujos.md`](02-flujos.md) | Describir paso a paso cada operación principal (5 flujos). |
| 03 | ER General | [`03-er-general.md`](03-er-general.md) | Modelo conceptual completo de datos. |
| 04 | ER Específico | [`04-er-especifico.md`](04-er-especifico.md) | Modelo por área funcional (Identidad / Biometría / Acceso). |
| 05 | Diccionario de Datos | [`05-diccionario-datos.md`](05-diccionario-datos.md) | Definición en lenguaje común de cada dato. |
| 06 | Mapa de Navegación | [`06-mapa-navegacion.md`](06-mapa-navegacion.md) | Recorrido entre pantallas del sistema. |
| 07 | DFD-UML | [`07-dfd-uml.md`](07-dfd-uml.md) | Diagrama de contexto + descomposición funcional. |

## Sugerencia de orden para la presentación

1. **Contexto del proyecto** (qué problema resuelve)
2. **DFD Nivel 0** ([`07`](07-dfd-uml.md)) — para que el jurado vea de qué se trata el sistema en una sola imagen.
3. **Morfológico** ([`01`](01-morfologico.md)) — para mostrar cómo se compone internamente.
4. **DFD Nivel 1** ([`07`](07-dfd-uml.md)) — para profundizar en las funciones.
5. **Flujos principales** ([`02`](02-flujos.md)) — especialmente F3 (registro biométrico) y F4 (identificación en Escaner Biometrico).
6. **Modelo de datos** ([`03`](03-er-general.md) + [`04`](04-er-especifico.md)) — para mostrar qué almacena el sistema.
7. **Diccionario de datos** ([`05`](05-diccionario-datos.md)) — como anexo.
8. **Mapa de navegación** ([`06`](06-mapa-navegacion.md)) — para mostrar la experiencia de uso.
