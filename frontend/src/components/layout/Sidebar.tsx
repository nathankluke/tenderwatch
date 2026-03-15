'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useProfiles } from '@/context/ProfileContext'

export default function Sidebar() {
  const locale = useLocale()
  const t = useTranslations('nav')
  const tp = useTranslations('profiles')
  const pathname = usePathname()
  const {
    profiles,
    activeProfileId,
    setActiveProfileId,
    createProfile,
  } = useProfiles()

  const [showNewInput, setShowNewInput] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const isSettings = pathname.includes('/settings')

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || creating) return
    setCreating(true)
    setCreateError('')
    try {
      await createProfile(newName.trim())
      setNewName('')
      setShowNewInput(false)
    } catch (err: any) {
      setCreateError(err.message || 'Fehler beim Erstellen')
      console.error('Profile creation failed:', err)
    }
    setCreating(false)
  }

  return (
    <aside
      className="w-52 flex-shrink-0 flex flex-col py-6 px-3"
      style={{ background: 'var(--navy)' }}
    >
      {/* Logo */}
      <Link href={`/${locale}/dashboard`} className="flex items-center gap-2.5 px-3 mb-8">
        <div className="w-7 h-7 rounded-md bg-white/20 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-xs">TW</span>
        </div>
        <span className="text-white font-bold text-base tracking-tight">TenderWatch</span>
      </Link>

      {/* Profile list */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-3 mb-2">
          <span className="text-[11px] font-semibold text-blue-200 uppercase tracking-wider">
            {t('profiles')}
          </span>
          <button
            onClick={() => setShowNewInput(prev => !prev)}
            className="text-blue-200 hover:text-white text-lg leading-none transition-colors"
            title={tp('new')}
          >
            +
          </button>
        </div>

        {showNewInput && (
          <form onSubmit={handleCreate} className="px-2 mb-2">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={tp('name')}
              autoFocus
              className="w-full text-xs bg-white/10 text-white placeholder-blue-300 border border-white/20
                         rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-white/40"
              onKeyDown={e => { if (e.key === 'Escape') setShowNewInput(false) }}
            />
            {createError && (
              <p className="text-red-400 text-[10px] mt-1 px-1">{createError}</p>
            )}
          </form>
        )}

        <nav className="flex-1 overflow-y-auto space-y-0.5">
          {profiles.map(profile => (
            <button
              key={profile.id}
              onClick={() => {
                setActiveProfileId(profile.id)
                // Navigate to dashboard if not there
                if (isSettings) {
                  window.location.href = `/${locale}/dashboard`
                }
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left
                ${activeProfileId === profile.id
                  ? 'bg-white/15 text-white'
                  : 'text-blue-200 hover:bg-white/10 hover:text-white'
                }`}
            >
              <div className="w-5 h-5 rounded bg-white/10 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-blue-200">
                  {profile.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="truncate">{profile.name}</span>
              {profile.daily_email_enabled && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" title="Email active" />
              )}
            </button>
          ))}

          {profiles.length === 0 && (
            <p className="px-3 py-2 text-xs text-blue-300/60">{tp('noProfiles')}</p>
          )}
        </nav>

        {/* Settings link at bottom */}
        <div className="mt-auto pt-4 border-t border-white/10">
          <Link
            href={`/${locale}/settings`}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
              ${isSettings
                ? 'bg-white/15 text-white'
                : 'text-blue-200 hover:bg-white/10 hover:text-white'
              }`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.41 1.41M11.66 11.66l1.41 1.41M2.93 13.07l1.41-1.41M11.66 4.34l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span>{t('settings')}</span>
          </Link>
        </div>
      </div>
    </aside>
  )
}
