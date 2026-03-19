import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950">
      <h1 className="text-6xl font-bold text-orange-500">404</h1>
      <p className="mt-4 text-xl text-gray-600 dark:text-gray-400">Página não encontrada</p>
      <Link href="/map" className="mt-6 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition">
        Voltar ao Mapa
      </Link>
    </div>
  )
}
