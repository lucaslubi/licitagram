import React from 'react'
import { Document, Page, Text, View } from '@react-pdf/renderer'
import { styles, COLORS } from './styles'

// ── Types ───────────────────────────────────────────────────────────────────

export interface ReportSection {
  heading: string
  content: string
  type: 'text' | 'table' | 'score' | 'bullet'
  /** For table type: array of objects with column values */
  rows?: Array<Record<string, string>>
  /** For table type: column definitions */
  columns?: Array<{ key: string; label: string; width?: string }>
  /** For score type: numeric score 0-100 */
  score?: number
  /** For score type: label for the score */
  scoreLabel?: string
  /** For bullet type: array of bullet items */
  items?: string[]
}

export interface ReportMetadata {
  company?: string
  date?: string
  author?: string
}

export interface ReportProps {
  title: string
  subtitle?: string
  sections: ReportSection[]
  metadata?: ReportMetadata
}

// ── Score Color Helper ──────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 80) return COLORS.scoreGreen
  if (score >= 60) return COLORS.scoreBlue
  if (score >= 40) return COLORS.scoreAmber
  return COLORS.scoreRed
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excelente'
  if (score >= 60) return 'Bom'
  if (score >= 40) return 'Regular'
  return 'Baixo'
}

// ── Section Components ──────────────────────────────────────────────────────

function TextSection({ heading, content }: { heading: string; content: string }) {
  const paragraphs = content.split('\n').filter((p) => p.trim())
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>{heading}</Text>
      {paragraphs.map((paragraph, i) => (
        <Text key={i} style={styles.paragraph}>
          {paragraph.trim()}
        </Text>
      ))}
    </View>
  )
}

function BulletSection({ heading, items }: { heading: string; items: string[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>{heading}</Text>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  )
}

function TableSection({
  heading,
  rows,
  columns,
}: {
  heading: string
  rows: Array<Record<string, string>>
  columns: Array<{ key: string; label: string; width?: string }>
}) {
  if (!rows || rows.length === 0 || !columns || columns.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionHeading}>{heading}</Text>
        <Text style={styles.paragraph}>Sem dados disponíveis.</Text>
      </View>
    )
  }

  // Calculate default column widths
  const defaultWidth = `${Math.floor(100 / columns.length)}%`

  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>{heading}</Text>
      {/* Header */}
      <View style={styles.tableHeader}>
        {columns.map((col, i) => (
          <Text
            key={i}
            style={[
              styles.tableHeaderCell,
              { width: col.width || defaultWidth },
            ]}
          >
            {col.label}
          </Text>
        ))}
      </View>
      {/* Rows */}
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={rowIdx % 2 === 1 ? styles.tableRowAlt : styles.tableRow}>
          {columns.map((col, colIdx) => (
            <Text
              key={colIdx}
              style={[
                styles.tableCell,
                { width: col.width || defaultWidth },
              ]}
            >
              {row[col.key] || '—'}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

function ScoreSection({
  heading,
  score,
  scoreLabel,
  content,
}: {
  heading: string
  score: number
  scoreLabel?: string
  content?: string
}) {
  const color = getScoreColor(score)
  const label = scoreLabel || getScoreLabel(score)
  const clampedScore = Math.max(0, Math.min(100, score))

  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>{heading}</Text>
      <View style={styles.scoreContainer}>
        <Text style={[styles.scoreValue, { color }]}>{clampedScore}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.scoreLabel}>{label}</Text>
          <View style={styles.scoreBarTrack}>
            <View
              style={[
                styles.scoreBarFill,
                {
                  width: `${clampedScore}%`,
                  backgroundColor: color,
                },
              ]}
            />
          </View>
        </View>
      </View>
      {content && (
        <Text style={styles.paragraph}>{content}</Text>
      )}
    </View>
  )
}

// ── Header & Footer ─────────────────────────────────────────────────────────

function ReportHeader({
  title,
  subtitle,
  date,
}: {
  title: string
  subtitle?: string
  date?: string
}) {
  return (
    <View fixed>
      <View style={styles.header}>
        <Text style={styles.headerBrand}>LICITAGRAM</Text>
        <View style={styles.headerRight}>
          <Text style={styles.headerTitle}>{title}</Text>
          {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
          {date && <Text style={styles.headerDate}>{date}</Text>}
        </View>
      </View>
      <View style={styles.headerLine} />
    </View>
  )
}

function ReportFooter() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>
        Gerado por Licitagram AI — licitagram.com.br
      </Text>
      <Text
        style={styles.footerPage}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  )
}

// ── Main Document ───────────────────────────────────────────────────────────

function renderSection(section: ReportSection, index: number) {
  switch (section.type) {
    case 'table':
      return (
        <TableSection
          key={index}
          heading={section.heading}
          rows={section.rows || []}
          columns={
            section.columns ||
            (section.rows && section.rows.length > 0
              ? Object.keys(section.rows[0]).map((k) => ({ key: k, label: k }))
              : [])
          }
        />
      )
    case 'score':
      return (
        <ScoreSection
          key={index}
          heading={section.heading}
          score={section.score ?? 0}
          scoreLabel={section.scoreLabel}
          content={section.content}
        />
      )
    case 'bullet':
      return (
        <BulletSection
          key={index}
          heading={section.heading}
          items={section.items || section.content.split('\n').filter((l) => l.trim())}
        />
      )
    case 'text':
    default:
      return (
        <TextSection
          key={index}
          heading={section.heading}
          content={section.content}
        />
      )
  }
}

export function LicitagramReport({ title, subtitle, sections, metadata }: ReportProps) {
  const date = metadata?.date || new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return (
    <Document
      title={title}
      author="Licitagram AI"
      subject={subtitle || title}
      creator="Licitagram"
    >
      <Page size="A4" style={styles.page}>
        <ReportHeader
          title={title}
          subtitle={subtitle || metadata?.company}
          date={date}
        />

        {sections.map((section, i) => renderSection(section, i))}

        <ReportFooter />
      </Page>
    </Document>
  )
}
