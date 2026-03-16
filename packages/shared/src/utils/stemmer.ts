/**
 * Simple Portuguese stemmer for keyword matching.
 * Strips common suffixes to match word variants:
 *   tecnológicas → tecnolog
 *   tecnologia   → tecnolog
 *   informática  → informat
 *   soluções     → soluc
 *   desenvolvimento → desenvolv
 *
 * Not a full linguistic stemmer — optimized for matching licitação terms.
 */

// Ordered by length (longest first) so we strip the most specific suffix
const SUFFIXES = [
  // Verb forms
  'amento', 'imentos', 'imento',
  // Augmentatives/diminutives
  'issimo', 'issima',
  // Noun/adjective suffixes
  'idades', 'acoes', 'icoes', 'mente',
  'idade', 'acao', 'icao', 'ncia', 'ncias',
  'veis', 'avel', 'ivel',
  'ores', 'oras', 'ador', 'adora',
  'icos', 'icas', 'ico', 'ica',
  'ais', 'eis', 'ois',
  'osos', 'osas', 'oso', 'osa',
  'ivos', 'ivas', 'ivo', 'iva',
  'oes', 'aos',
  'ias', 'ios',
  'ais',
  'al', 'el', 'il',
  'os', 'as', 'es',
  'or', 'ar', 'er', 'ir',
  'ia', 'io',
  'a', 'o', 'e',
]

const MIN_STEM_LENGTH = 4

/**
 * Stem a single normalized Portuguese word.
 * Input should already be lowercase, accent-stripped.
 */
export function stemWord(word: string): string {
  if (word.length <= MIN_STEM_LENGTH) return word

  for (const suffix of SUFFIXES) {
    if (word.endsWith(suffix) && (word.length - suffix.length) >= MIN_STEM_LENGTH) {
      return word.slice(0, -suffix.length)
    }
  }

  return word
}
