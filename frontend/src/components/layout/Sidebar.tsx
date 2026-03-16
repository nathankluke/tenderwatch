'use client'

import { useState, useRef, useEffect } from 'react'
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
    renameProfile,
    deleteProfile,
  } = useProfiles()

  const [showNewInput, setShowNewInput] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Rename state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const editRef = useRef<HTMLInputElement>(null)

  // Confirm delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const isSettings = pathname.includes('/settings')

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus()
      editRef.current.select()
    }
  }, [editingId])

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

  const handleRename = async (id: string) => {
    if (!editName.trim() || editName.trim() === profiles.find(p => p.id === id)?.name) {
      setEditingId(null)
      return
    }
    try {
      await renameProfile(id, editName.trim())
    } catch (err: any) {
      console.error('Rename failed:', err)
    }
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteProfile(id)
      setConfirmDeleteId(null)
    } catch (err: any) {
      console.error('Delete failed:', err)
    }
  }

  const startEditing = (id: string, currentName: string) => {
    setEditingId(id)
    setEditName(currentName)
    setConfirmDeleteId(null)
  }

  return (
    <aside
      className="w-56 flex-shrink-0 flex flex-col py-6 px-3"
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
            onClick={() => { setShowNewInput(prev => !prev); setConfirmDeleteId(null) }}
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
            {creating && (
              <p className="text-blue-300 text-[10px] mt-1 px-1">
                {locale === 'de' ? 'Erstelle...' : 'Creating...'}
              </p>
            )}
            {createError && (
              <p className="text-red-400 text-[10px] mt-1 px-1">{createError}</p>
            )}
          </form>
        )}

        <nav className="flex-1 overflow-y-auto space-y-0.5">
          {profiles.map(profile => (
            <div key={profile.id} className="group relative">
              {editingId === profile.id ? (
                /* Rename input */
                <form
                  onSubmit={e => { e.preventDefault(); handleRename(profile.id) }}
                  className="px-2 py-1"
                >
                  <input
                    ref={editRef}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onBlur={() => handleRename(profile.id)}
                    onKeyDown={e => { if (e.key === 'Escape') setEditingId(null) }}
                    className="w-full text-xs bg-white/20 text-white border border-white/30
                               rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-white/50"
                  />
                </form>
              ) : confirmDeleteId === profile.id ? (
                /* Delete confirmation */
                <div className="px-2 py-1.5">
                  <p className="text-[10px] text-red-300 mb-1.5 px-1">
                    {locale === 'de' ? 'Profil loeschen?' : 'Delete profile?'}
                  </p>
                  <div className="flex gap-1.5 px-1">
                    <button
                      onClick={() => handleDelete(profile.id)}
                      className="text-[10px] px-2.5 py-1 bg-red-500/80 text-white rounded font-medium hover:bg-red-500"
                    >
                      {locale === 'de' ? 'Ja, loeschen' : 'Yes, delete'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-[10px] px-2.5 py-1 bg-white/10 text-blue-200 rounded font-medium hover:bg-white/20"
                    >
                      {locale === 'de' ? 'Abbrechen' : 'Cancel'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Normal profile button */
                <button
                  onClick={() => {
                    setActiveProfileId(profile.id)
                    setConfirmDeleteId(null)
                    if (isSettings) {
                      window.location.href = `/${locale}/dashboard`
                    }
                  }}
                  onDoubleClick={() => startEditing(profile.id, profile.name)}
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
                  <span className="truncate flex-1">{profile.name}</span>
                  {profile.daily_email_enabled && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" title="Email active" />
                  )}

                  {/* Edit/Delete buttons on hover */}
                  <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); startEditing(profile.id, profile.name) }}
                      className="text-blue-300 hover:text-white p-0.5 rounded transition-colors"
                      title={locale === 'de' ? 'Umbenennen' : 'Rename'}
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M11.5 1.5l3 3L5 14H2v-3z" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmDeleteId(profile.id) }}
                      className="text-blue-300 hover:text-red-400 p-0.5 rounded transition-colors"
                      title={locale === 'de' ? 'Loeschen' : 'Delete'}
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                </button>
              )}
            </div>
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
