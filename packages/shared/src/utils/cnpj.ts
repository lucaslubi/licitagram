export function cleanCNPJ(cnpj: string): string {
  return cnpj.replace(/\D/g, '')
}

export function validateCNPJ(cnpj: string): boolean {
  const clean = cleanCNPJ(cnpj)
  if (clean.length !== 14) return false
  if (/^(\d)\1+$/.test(clean)) return false

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

  const calcDigit = (digits: string, weights: number[]): number => {
    const sum = digits
      .split('')
      .reduce((acc, digit, i) => acc + parseInt(digit) * weights[i], 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }

  const digit1 = calcDigit(clean.slice(0, 12), weights1)
  const digit2 = calcDigit(clean.slice(0, 13), weights2)

  return parseInt(clean[12]) === digit1 && parseInt(clean[13]) === digit2
}
