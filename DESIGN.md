# DESIGN.md — YL Blog

## Design Direction: Editorial Tech-Literary

A cross between a Chinese literary magazine and a modern tech publication.
Clean, airy, typography-driven. The reading experience should feel premium and considered.

## Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg` | `#FCFCFB` | Page background |
| `--color-surface` | `#FFFFFF` | Card/container surfaces |
| `--color-text` | `#18181B` | Body text |
| `--color-text-secondary` | `#52525B` | Secondary text |
| `--color-text-muted` | `#A1A1AA` | Captions, footnotes |
| `--color-accent` | `#1D4ED8` | Links, CTAs, strong emphasis |
| `--color-accent-soft` | `#EEF2FF` | Blockquote bg, tag bg |
| `--color-accent-dark` | `#1E3A8A` | Hover states |
| `--color-border` | `#E4E4E7` | Dividers, card borders |
| `--color-border-light` | `#F4F4F5` | Subtle separators |
| `--color-code-bg` | `#F8F8FA` | Inline code background |

## Typography Scale

| Level | Font | Size | Weight | Line Height |
|-------|------|------|--------|-------------|
| H1 (post title) | Noto Serif SC | 2.5rem | 700 | 1.3 |
| H2 (section) | Noto Serif SC | 1.6rem | 600 | 1.35 |
| H3 (sub-section) | Noto Sans SC | 1.2rem | 600 | 1.4 |
| Body | Noto Sans SC | 1.05rem | 400 | 1.85 |
| Code | JetBrains Mono | 0.88rem | 400 | 1.65 |
| Caption | Noto Sans SC | 0.82rem | 400 | 1.5 |

## Spacing Rhythm

- 4px base grid
- Section margins: 48px (3rem) between major sections
- Paragraph bottom: 1.25rem
- Card padding: 1.5rem
- Content max-width: 680px

## Design Rules

- NO gradient backgrounds
- NO rounded card badges with colored borders
- Links always underlined with offset
- Inline code gets pink accent (#CE3A6E) for scannability
- Blockquotes: left blue border, soft blue bg
- Tables: blue header row, zebra striping
- H2: bottom border separator, generous top margin
- One accent color used sparingly — only on interactive elements
- Ample whitespace — the content breathes
