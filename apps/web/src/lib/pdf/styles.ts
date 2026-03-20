import { StyleSheet } from '@react-pdf/renderer'

// ── Brand Colors ────────────────────────────────────────────────────────────
export const COLORS = {
  primary: '#F97316',       // Orange
  primaryLight: '#FED7AA',  // Light orange
  dark: '#1F2937',          // Dark gray
  text: '#374151',          // Body text
  textLight: '#6B7280',     // Secondary text
  lightGray: '#F3F4F6',     // Background
  border: '#E5E7EB',        // Borders
  white: '#FFFFFF',
  // Score colors
  scoreGreen: '#16A34A',
  scoreBlue: '#2563EB',
  scoreAmber: '#D97706',
  scoreRed: '#DC2626',
} as const

// ── Shared Styles ───────────────────────────────────────────────────────────
export const styles = StyleSheet.create({
  // Page
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: COLORS.text,
    paddingTop: 50,
    paddingBottom: 60,
    paddingHorizontal: 40,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  headerBrand: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
    color: COLORS.primary,
    letterSpacing: 2,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    color: COLORS.dark,
    maxWidth: 300,
    textAlign: 'right',
  },
  headerSubtitle: {
    fontSize: 9,
    color: COLORS.textLight,
    marginTop: 2,
    textAlign: 'right',
  },
  headerDate: {
    fontSize: 8,
    color: COLORS.textLight,
    marginTop: 4,
    textAlign: 'right',
  },
  headerLine: {
    height: 2,
    backgroundColor: COLORS.primary,
    marginBottom: 20,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 25,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7,
    color: COLORS.textLight,
  },
  footerPage: {
    fontSize: 7,
    color: COLORS.textLight,
  },

  // Section
  section: {
    marginBottom: 16,
  },
  sectionHeading: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    color: COLORS.dark,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primaryLight,
  },

  // Text section
  paragraph: {
    fontSize: 10,
    lineHeight: 1.5,
    color: COLORS.text,
    marginBottom: 6,
    textAlign: 'justify',
  },

  // Bullet section
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingLeft: 8,
  },
  bulletDot: {
    width: 12,
    fontSize: 10,
    color: COLORS.primary,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.4,
    color: COLORS.text,
  },

  // Table section
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.dark,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableHeaderCell: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: COLORS.white,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  tableRowAlt: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: COLORS.lightGray,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  tableCell: {
    fontSize: 9,
    color: COLORS.text,
  },

  // Score section
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    padding: 12,
    backgroundColor: COLORS.lightGray,
    borderRadius: 4,
  },
  scoreValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 28,
    marginRight: 12,
  },
  scoreLabel: {
    fontSize: 10,
    color: COLORS.textLight,
  },
  scoreBar: {
    height: 6,
    borderRadius: 3,
    marginTop: 4,
    width: '100%',
  },
  scoreBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.border,
    width: '100%',
  },
  scoreBarFill: {
    height: 6,
    borderRadius: 3,
    position: 'absolute',
    top: 0,
    left: 0,
  },
})
