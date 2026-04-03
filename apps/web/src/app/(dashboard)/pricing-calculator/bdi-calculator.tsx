'use client'

import { useState, useMemo, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

type Regime = 'presumido' | 'real' | 'simples'

/**
 * Presets baseados em referências oficiais:
 * - Obras: Acórdão TCU 2622/2013 (1ª e 2ª faixas)
 * - Serviços: SINAPI/IBGE + referências SEINFRA
 * - TI: IN SGD/ME 94/2022 (contratações de TIC)
 * - Limpeza/Conservação: Caderno Técnico SEGES
 * - Engenharia Consultiva: Tabela DNIT/SICRO
 */
const PRESETS: Record<string, { label: string; ac: number; seg: number; risco: number; df: number; lucro: number; desc: string }> = {
  obras_tcu: { label: 'Obras (TCU)', ac: 4.00, seg: 0.80, risco: 1.27, df: 0.59, lucro: 6.16, desc: 'Acórdão TCU 2622/2013 — BDI médio 22,12%' },
  obras_grande: { label: 'Obras Grande Porte', ac: 3.00, seg: 0.56, risco: 0.97, df: 0.59, lucro: 7.40, desc: 'Acórdão TCU 2622/2013 — 2ª faixa' },
  servicos: { label: 'Serviços Comuns', ac: 5.00, seg: 0.50, risco: 1.00, df: 0.50, lucro: 7.00, desc: 'Referência SEGES/ME — serviços contínuos' },
  ti: { label: 'TI / Software', ac: 6.00, seg: 0.30, risco: 0.80, df: 0.40, lucro: 8.00, desc: 'IN SGD/ME 94/2022 — contratações de TIC' },
  limpeza: { label: 'Limpeza / Conservação', ac: 3.00, seg: 0.50, risco: 0.80, df: 0.50, lucro: 5.00, desc: 'Caderno Técnico SEGES — mão de obra intensiva' },
  engenharia: { label: 'Engenharia Consultiva', ac: 8.00, seg: 0.50, risco: 1.50, df: 0.50, lucro: 10.00, desc: 'Referência DNIT/SICRO — consultoria' },
  fornecimento: { label: 'Fornecimento de Bens', ac: 2.50, seg: 0.30, risco: 0.50, df: 0.30, lucro: 5.00, desc: 'Material/equipamento — BDI reduzido' },
}

/**
 * Alíquotas tributárias vigentes (Brasil, 2026):
 *
 * Lucro Presumido:
 *   PIS: 0,65% (cumulativo — Lei 9.718/1998)
 *   COFINS: 3,00% (cumulativo — Lei 9.718/1998)
 *   IRPJ: 1,20% (presunção 8% × alíquota 15% para serviços)
 *   CSLL: 1,08% (presunção 12% × alíquota 9%)
 *   ISS: 2% a 5% (LC 116/2003 + legislação municipal)
 *
 * Lucro Real:
 *   PIS: 1,65% (não cumulativo — Lei 10.637/2002)
 *   COFINS: 7,60% (não cumulativo — Lei 10.833/2003)
 *   IRPJ: 1,20% (sobre lucro real)
 *   CSLL: 1,08% (sobre lucro real)
 *
 * Simples Nacional:
 *   Alíquota única por faixa de receita bruta (LC 123/2006)
 *   Anexo III (serviços): 6% a 33% (fator R dependente)
 *   Anexo IV (construção civil): 4,5% a 33%
 *
 * NOTA: A Reforma Tributária (EC 132/2023) introduziu IBS e CBS
 * em substituição gradual a PIS/COFINS/ISS, com transição de
 * 2026 a 2033. Os valores abaixo refletem o regime atual (2026).
 */
const REGIME_DEFAULTS: Record<Regime, { iss: number; pis: number; cofins: number; irpj: number; csll: number; desc: string }> = {
  presumido: { iss: 3.00, pis: 0.65, cofins: 3.00, irpj: 1.20, csll: 1.08, desc: 'Cumulativo — Lei 9.718/1998. ISS varia por município (2% a 5%).' },
  real: { iss: 3.00, pis: 1.65, cofins: 7.60, irpj: 1.20, csll: 1.08, desc: 'Não cumulativo — Leis 10.637/2002 e 10.833/2003. Permite créditos.' },
  simples: { iss: 0, pis: 0, cofins: 0, irpj: 0, csll: 0, desc: 'LC 123/2006 — Alíquota única. Para BDI, use a alíquota efetiva do DAS no campo ISS.' },
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function BDICalculator() {
  // Custos diretos
  const [custoMaterial, setCustoMaterial] = useState(0)
  const [custoMaoDeObra, setCustoMaoDeObra] = useState(0)
  const [encargos, setEncargos] = useState(78.16)

  // BDI components
  const [ac, setAc] = useState(4.0)
  const [seg, setSeg] = useState(0.80)
  const [risco, setRisco] = useState(1.27)
  const [df, setDf] = useState(0.59)
  const [lucro, setLucro] = useState(6.16)

  // Tributos
  const [regime, setRegime] = useState<Regime>('presumido')
  const [iss, setIss] = useState(3)
  const [pis, setPis] = useState(0.65)
  const [cofins, setCofins] = useState(3.0)
  const [irpj, setIrpj] = useState(1.2)
  const [csll, setCsll] = useState(1.08)

  // Cálculos
  const custoDirecto = useMemo(() => {
    const moComEncargos = custoMaoDeObra * (1 + encargos / 100)
    return custoMaterial + moComEncargos
  }, [custoMaterial, custoMaoDeObra, encargos])

  const tributos = useMemo(() => iss + pis + cofins + irpj + csll, [iss, pis, cofins, irpj, csll])

  const bdi = useMemo(() => {
    const acDec = ac / 100
    const segDec = seg / 100
    const riscoDec = risco / 100
    const dfDec = df / 100
    const lucroDec = lucro / 100
    const tDec = tributos / 100

    if (tDec >= 1) return 0
    const result = ((1 + acDec + segDec + riscoDec + dfDec) * (1 + lucroDec)) / (1 - tDec) - 1
    return result * 100
  }, [ac, seg, risco, df, lucro, tributos])

  const precoVenda = useMemo(() => custoDirecto * (1 + bdi / 100), [custoDirecto, bdi])

  function applyPreset(key: string) {
    const p = PRESETS[key]
    if (!p) return
    setAc(p.ac); setSeg(p.seg); setRisco(p.risco); setDf(p.df); setLucro(p.lucro)
  }

  function applyRegime(r: Regime) {
    setRegime(r)
    const d = REGIME_DEFAULTS[r]
    setIss(d.iss); setPis(d.pis); setCofins(d.cofins); setIrpj(d.irpj); setCsll(d.csll)
  }

  function NumberInput({ label, value, onChange, suffix, step }: { label: string; value: number; onChange: (v: number) => void; suffix?: string; step?: number }) {
    const [raw, setRaw] = useState(value ? String(value) : '')

    // Sync when value changes externally (presets, regime change)
    useEffect(() => { setRaw(value ? String(value) : '') }, [value])

    return (
      <div>
        <Label className="text-xs text-gray-400">{label}</Label>
        <div className="flex items-center gap-1 mt-1">
          <Input
            type="text"
            inputMode="decimal"
            step={step || 0.01}
            value={raw}
            onChange={e => {
              const v = e.target.value
              // Allow empty, digits, dots, commas
              if (v === '' || /^[\d.,]*$/.test(v)) {
                setRaw(v)
                const num = parseFloat(v.replace(',', '.'))
                onChange(isNaN(num) ? 0 : num)
              }
            }}
            onBlur={() => {
              // Format on blur
              const num = parseFloat(raw.replace(',', '.'))
              if (isNaN(num) || raw === '') {
                setRaw('')
                onChange(0)
              }
            }}
            className="text-right font-mono"
          />
          {suffix && <span className="text-xs text-gray-500 w-6">{suffix}</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Inputs */}
      <div className="lg:col-span-2 space-y-6">
        {/* Presets */}
        <div>
          <p className="text-xs text-gray-500 mb-2">Presets baseados em referências oficiais (TCU, SEGES, DNIT)</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(PRESETS).map(([key, p]) => (
              <button key={key} onClick={() => applyPreset(key)} title={p.desc} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#2d2f33] text-gray-400 hover:text-white hover:bg-[#3d3f43] transition-colors">
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custos Diretos */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Custos Diretos</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <NumberInput label="Material / Insumo (R$)" value={custoMaterial} onChange={setCustoMaterial} step={100} />
            <NumberInput label="Mão de Obra Direta (R$)" value={custoMaoDeObra} onChange={setCustoMaoDeObra} step={100} />
            <NumberInput label="Encargos Sociais" value={encargos} onChange={setEncargos} suffix="%" />
          </CardContent>
        </Card>

        {/* Despesas Indiretas (BDI) */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Despesas Indiretas (BDI)</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <NumberInput label="Administração Central" value={ac} onChange={setAc} suffix="%" />
            <NumberInput label="Seguros e Garantias" value={seg} onChange={setSeg} suffix="%" />
            <NumberInput label="Riscos" value={risco} onChange={setRisco} suffix="%" />
            <NumberInput label="Despesas Financeiras" value={df} onChange={setDf} suffix="%" />
            <NumberInput label="Lucro Bruto" value={lucro} onChange={setLucro} suffix="%" />
          </CardContent>
        </Card>

        {/* Tributos */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Tributos</CardTitle>
              <div className="flex gap-1.5">
                {(['presumido', 'real', 'simples'] as Regime[]).map(r => (
                  <button key={r} onClick={() => applyRegime(r)} className={`px-2.5 py-1 rounded text-[10px] font-medium ${regime === r ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30' : 'bg-[#2d2f33] text-gray-400'}`}>
                    {r === 'presumido' ? 'Lucro Presumido' : r === 'real' ? 'Lucro Real' : 'Simples Nacional'}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-[10px] text-gray-500">{REGIME_DEFAULTS[regime].desc}</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <NumberInput label="ISS (LC 116/2003)" value={iss} onChange={setIss} suffix="%" />
              <NumberInput label="PIS" value={pis} onChange={setPis} suffix="%" />
              <NumberInput label="COFINS" value={cofins} onChange={setCofins} suffix="%" />
              <NumberInput label="IRPJ" value={irpj} onChange={setIrpj} suffix="%" />
              <NumberInput label="CSLL" value={csll} onChange={setCsll} suffix="%" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right: Results */}
      <div className="space-y-4">
        <Card className="border-emerald-600/30">
          <CardHeader><CardTitle className="text-sm">Resultado</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-4">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">BDI Calculado</p>
              <p className="text-4xl font-bold text-emerald-400 font-[family-name:var(--font-geist-mono)]">{bdi.toFixed(2)}%</p>
            </div>

            <div className="h-px bg-[#2d2f33]" />

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Custo Direto</span>
                <span className="text-white font-mono">{formatBRL(custoDirecto)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">BDI ({bdi.toFixed(2)}%)</span>
                <span className="text-white font-mono">{formatBRL(custoDirecto * bdi / 100)}</span>
              </div>
              <div className="h-px bg-[#2d2f33]" />
              <div className="flex justify-between text-sm font-bold">
                <span className="text-white">Preço de Venda</span>
                <span className="text-emerald-400 font-mono text-lg">{formatBRL(precoVenda)}</span>
              </div>
            </div>

            <div className="h-px bg-[#2d2f33]" />

            {/* Breakdown */}
            <div className="space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Composição do BDI</p>
              {[
                { label: 'Adm. Central', value: ac },
                { label: 'Seguros', value: seg },
                { label: 'Riscos', value: risco },
                { label: 'Desp. Financeiras', value: df },
                { label: 'Lucro', value: lucro },
                { label: 'Tributos', value: tributos },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className="flex-1 bg-[#2d2f33] rounded-full h-2 overflow-hidden">
                    <div className="bg-emerald-500/60 h-full rounded-full" style={{ width: `${Math.min(100, (item.value / (bdi || 1)) * 100)}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-400 w-20 text-right">{item.label}</span>
                  <span className="text-[10px] text-white font-mono w-12 text-right">{item.value.toFixed(2)}%</span>
                </div>
              ))}
            </div>

            {/* Reference */}
            <div className="bg-[#111214] rounded-lg p-3 mt-4 space-y-2">
              <p className="text-[10px] text-gray-400 font-semibold">Referências oficiais:</p>
              <p className="text-[10px] text-gray-500">
                <strong>TCU (Acórdão 2622/2013):</strong><br />
                Obras: 20,34% a 25,00%<br />
                Serviços: 18,00% a 25,00%<br />
                Fornecimento: 11,00% a 15,00%
              </p>
              <p className="text-[10px] text-gray-500">
                <strong>Encargos sociais CLT:</strong><br />
                Grupo A (INSS, FGTS, etc.): ~36,80%<br />
                Grupo B (férias, 13º, etc.): ~35,20%<br />
                Grupo C (multa FGTS, etc.): ~6,16%<br />
                Total estimado: ~78,16%
              </p>
              <p className="text-[9px] text-amber-400/60 mt-2">
                ⚠️ Reforma Tributária (EC 132/2023): IBS e CBS substituirão PIS/COFINS/ISS gradualmente de 2026 a 2033. Alíquotas podem mudar.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
