import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import type { ProfileCompletenessResult } from '@/lib/profile-completeness'

/**
 * ProfileCompletenessAlert — banner técnico (sem cor de ressaca, sem emoji)
 * que avisa quando o perfil não tá completo o bastante pra extrair o melhor
 * do matching engine.
 *
 * Design: usa exclusivamente tokens do design system (border, muted-foreground,
 * brand). Nada de bg-emerald, bg-amber, bg-purple. Tipografia em Inter
 * (default do app). Hierarquia: ring de progresso à esquerda, lista de
 * gaps à direita, CTA discreto.
 */

type Props = {
  result: ProfileCompletenessResult
  variant?: 'banner' | 'card'
}

export function ProfileCompletenessAlert({ result, variant = 'banner' }: Props) {
  if (result.isComplete) return null

  const ringStroke = result.level === 'incompleto' ? 'hsl(var(--brand))' : 'hsl(var(--muted-foreground))'
  const offset = 100 - result.score
  // SVG circle: r=18, circ ≈ 113.1 → strokeDashoffset proporcional
  const dashoffset = (offset / 100) * 113.1

  const inner = (
    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
      {/* Ring de progresso à esquerda */}
      <div className="flex shrink-0 items-center gap-3">
        <svg width="44" height="44" viewBox="0 0 40 40" className="shrink-0">
          <circle
            cx="20"
            cy="20"
            r="18"
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth="2.5"
          />
          <circle
            cx="20"
            cy="20"
            r="18"
            fill="none"
            stroke={ringStroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="113.1"
            strokeDashoffset={dashoffset}
            transform="rotate(-90 20 20)"
            style={{ transition: 'stroke-dashoffset 600ms ease-out' }}
          />
          <text
            x="20"
            y="20"
            textAnchor="middle"
            dominantBaseline="central"
            fill="hsl(var(--foreground))"
            fontSize="11"
            fontWeight="600"
            fontFamily="inherit"
          >
            {result.score}
          </text>
        </svg>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Perfil {result.level === 'incompleto' ? 'incompleto' : 'parcial'}
          </p>
          <p className="text-xs text-muted-foreground">
            Complete pra receber matches de score mais alto
          </p>
        </div>
      </div>

      {/* Gaps + CTA */}
      <div className="flex flex-1 flex-col gap-2 border-t border-border pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
        <ul className="space-y-1.5">
          {result.gaps.map((gap) => (
            <li key={gap.field} className="flex items-start gap-2 text-xs">
              <span
                aria-hidden
                className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60"
              />
              <span>
                <span className="font-medium text-foreground">{gap.label}</span>
                <span className="text-muted-foreground"> — {gap.hint}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 pt-1">
          <Link
            href="/company"
            className="text-xs font-medium text-brand hover:text-brand-light transition-colors inline-flex items-center gap-1"
          >
            Completar perfil
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12h14m-7-7 7 7-7 7" />
            </svg>
          </Link>
          <span className="text-[10px] text-muted-foreground/70 font-mono uppercase tracking-wider">
            +{Math.max(0, 85 - result.score)} pontos pra completo
          </span>
        </div>
      </div>
    </CardContent>
  )

  if (variant === 'card') {
    return <Card className="border-border bg-card">{inner}</Card>
  }

  // banner: borderless top, integra com a página
  return (
    <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm">
      {inner}
    </div>
  )
}
