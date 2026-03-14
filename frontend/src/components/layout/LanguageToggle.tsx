'use client'

import { usePathname, useRouter } from 'next/navigation'

export default function LanguageToggle({ locale }: { locale: string }) {
  const pathname = usePathname()
  const router = useRouter()

  const switchTo = (newLocale: string) => {
    const newPath = pathname.replace(`/${locale}/`, `/${newLocale}/`)
    router.push(newPath)
  }

  return (
    <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
      {['de', 'en'].map(lang => (
        <button
          key={lang}
          onClick={() => switchTo(lang)}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all
            ${locale === lang
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
            }`}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
