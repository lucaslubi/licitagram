/**
 * Brazilian phone normalizer for WhatsApp outbound.
 *
 * Returns digits-only with 55 country prefix:
 *   - "+55 (11) 99999-8888" → "5511999998888"
 *   - "11 9999-8888"        → "5511999998888"  (9 inserted for mobile)
 *   - "(11) 3456-7890"      → "551134567890"   (landline kept as-is)
 *
 * Returns null if the input is too malformed to be a usable BR number.
 */
export function normalizeBrPhone(input: string | null | undefined): string | null {
  if (!input) return null
  let n = String(input).replace(/\D/g, '')
  if (!n) return null

  // Strip leading 0 (carrier select code in Brazil)
  if (n.startsWith('0')) n = n.replace(/^0+/, '')

  // 8 digits = number with no DDD — too ambiguous
  if (n.length < 10) return null

  // 10 digits: DDD + 8-digit subscriber. If 1st subscriber digit is 6/7/8/9 → mobile, prepend 9
  if (n.length === 10) {
    const ddd = n.slice(0, 2)
    const sub = n.slice(2)
    if (/^[6-9]/.test(sub)) {
      n = ddd + '9' + sub
    }
  }

  // 11 digits → BR national without country code, prepend 55
  if (n.length === 11) n = '55' + n

  // 12 digits starting with 55 (= 55 + DDD + 8-digit) → mobile missing 9
  if (n.length === 12 && n.startsWith('55')) {
    const ddd = n.slice(2, 4)
    const sub = n.slice(4)
    if (/^[6-9]/.test(sub)) {
      n = '55' + ddd + '9' + sub
    }
  }

  // Final shape: 12 (landline) or 13 (mobile) digits, both starting with 55
  if (!(n.length === 12 || n.length === 13) || !n.startsWith('55')) return null

  // DDD sanity check (BR DDDs run 11-99)
  const ddd = parseInt(n.slice(2, 4), 10)
  if (ddd < 11 || ddd > 99) return null

  return n
}
