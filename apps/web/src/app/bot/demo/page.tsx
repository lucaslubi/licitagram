/**
 * Página de demonstração do Robô de Lances — rota pública.
 * URL: /bot/demo
 *
 * Substitui vídeo gravado: mostra visualmente o fluxo completo
 * usando dados simulados. Cliente pode assistir e entender o produto
 * sem precisar conectar conta.
 */

import { DemoClient } from './demo-client'

export const metadata = { title: 'Demonstração — Robô de Lances' }

// Render dinâmico
export const dynamic = 'force-dynamic'

export default function DemoPage() {
  return <DemoClient />
}
