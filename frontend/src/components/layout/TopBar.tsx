'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import LanguageToggle from './LanguageToggle'

export default function TopBar({
  locale,
  userEmail,
}: {
  locale: string
  userEmail: string
}) {
  const t = useTranslations('nav')
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push(`/${locale}/login`)
    router.refresh()
  }

  return (
    <header className="h-14 bg-white border-b border-gray-100 px-6 flex items-center justify-between flex-shrink-0">
      {/* Left: breadcrumb / title placeholder */}
      <div />

      {/* Right: language toggle + user */}
      <div className="flex items-center gap-4">
        <LanguageToggle locale={locale} />
        <span className="text-sm text-gray-500 hidden sm:block">{userEmail}</span>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          {t('logout')}
        </button>
      </div>
    </header>
  )
}
