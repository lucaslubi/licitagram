# Robô de Lances — Design Contract

This document is the visual contract for all files under `app/(dashboard)/bot/`.
Logic, data, and behavior are owned by the existing TSX files — this is purely
about how the feature looks and feels, so it stays consistent with the rest of
the dashboard (Stripe / Revolut feel) instead of the older "terminal" aesthetic.

## Principles

1. **One accent color**: brand orange (`text-brand`, `bg-brand`). Used at most
   once per visible region as the primary CTA or critical highlight.
2. **Numbers in mono, words in sans**: only the `<span>` containing a number
   gets `font-mono tabular-nums`. Never wrap whole sections in mono.
3. **Status uses semantic palette**:
   - success → `bg-emerald-500/10 text-emerald-400 border-emerald-500/20`
   - warning → `bg-amber-500/10 text-amber-400 border-amber-500/20`
   - critical → `bg-red-500/10 text-red-400 border-red-500/20`
   - neutral → `bg-white/[0.04] text-muted-foreground border-white/[0.06]`
4. **Card surfaces**: always `<Card>` from `@/components/ui/card`. Hero cards
   may add the `card-refined` class for the inset border gradient.
5. **No inline styles**: every visual property goes through Tailwind classes.
   Hex values, `style={{ color: '#...' }}`, and `style={{ fontFamily: '...' }}`
   are forbidden in this folder.
6. **No custom keyframes inline**: only `transition-colors`, `animate-pulse`
   (for the live dot), and the existing `animate-fade-in` utility.

## Tokens

| Purpose | Class |
|--------|-------|
| Page background | inherit (already `bg-background`) |
| Card surface | `bg-card` (set by `<Card>`) |
| Subtle hover surface | `hover:bg-white/[0.02]` |
| Section divider | `border-white/[0.06]` |
| Body text | `text-foreground` |
| Secondary text | `text-muted-foreground` |
| Tertiary text | `text-foreground/40` |
| Overline label | `text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium` |
| Big number | `text-3xl font-medium font-mono tabular-nums tracking-tight` |
| Inline number | `font-mono tabular-nums` |

## Components in scope

Reuse these from `@/components/ui`:

- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`
- `Button` (variants: `default`, `outline`, `ghost`, `destructive`)
- `Badge` (variants: `default`, `outline`, `success`, `warning`, `destructive`)
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- `Input`, `Label`
- `Table`
- `ScoreRing` (for circular progress / difficulty / position)
- `Switch` (added in this commit)
- `Progress` (added in this commit)

## Status indicator pattern

For the "robot active" / "live" indicator, use:

```tsx
<span className="inline-flex items-center gap-1.5">
  <span className="relative flex h-1.5 w-1.5">
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
  </span>
  <span className="text-[11px] uppercase tracking-[0.14em] text-emerald-400">Ativo</span>
</span>
```

## Forbidden in this folder

- `style={{ ... }}` (any inline style attribute)
- Hex colors in className/JSX (`#f97316`, `#eab308`, `#ef4444`, etc.)
- `IBM Plex Mono`, `JetBrains Mono` typed by name (use `font-mono` class)
- Custom `@keyframes` declarations
- Bright saturated backgrounds (`bg-orange-500`, `bg-red-600`) — use `/10`
  opacity tints with matching `/20` border instead
