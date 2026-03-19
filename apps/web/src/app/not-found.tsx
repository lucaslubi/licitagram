import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-6xl font-bold text-gray-300">404</h1>
      <p className="mt-4 text-lg text-gray-500">Página não encontrada</p>
      <Link href="/map" className="mt-6 rounded-md bg-orange-600 px-4 py-2 text-white hover:bg-orange-700">
        Voltar ao Mapa
      </Link>
    </div>
  )
}
