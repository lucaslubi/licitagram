import type { Page, Browser } from 'puppeteer-core'

export interface BotState {
  fase: string
  ativo: boolean
  encerrado: boolean
  melhor_lance: number | null
  nosso_lance: number | null
  nossa_posicao: number | null
}

export abstract class BasePortal {
  protected page: Page | null = null
  protected browser: Browser | null = null

  constructor(public config: { username: string; portal: string }) {}

  abstract login(cookies: unknown[]): Promise<boolean>
  abstract navigateToPregao(pregaoId: string): Promise<boolean>
  abstract getState(): Promise<BotState>
  abstract submitLance(valor: number): Promise<boolean>
  abstract close(): Promise<void>
}
