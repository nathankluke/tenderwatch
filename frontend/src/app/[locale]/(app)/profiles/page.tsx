'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import Link from 'next/link'
import { api, type Profile } from '@/lib/api'

export default function ProfilesPage() {
  const t = useTranslations('profiles')
  const locale = useLocale()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.profiles.list().then(setProfiles).catch(e => setError(e.message))
  }, [])

  const createProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setLoading(true)
    setError('')
    try {
      const p = await api.profiles.create({ name: newName.trim() })
      setProfiles(prev => [...prev, p])
      setNewName('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleEmail = async (profile: Profile) => {
    try {
      const res = await api.profiles.toggleEmail(profile.id)
      setProfiles(prev => prev.map(p =>
        p.id === profile.id ? { ...p, daily_email_enabled: res.daily_email_enabled } : p
      ))
    } catch (e: any) {
      setError(e.message)
    }
  }

  const deleteProfile = async (id: string) => {
    if (!confirm(locale === 'de' ? 'Profil wirklich löschen?' : 'Delete profile?')) return
    try {
      await api.profiles.delete(id)
      setProfiles(prev => prev.filter(p => p.id !== id))
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          ⚠ {error}
        </div>
      )}

      {/* Create profile */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('new')}</h2>
        <form onSubmit={createProfile} className="flex gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder={t('name')}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ background: 'var(--navy)' }}
          >
            {loading ? '...' : `+ ${t('new')}`}
          </button>
        </form>
      </div>

      {/* Profile list */}
      {profiles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <p className="text-sm text-gray-400">{t('noProfiles')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map(profile => (
            <div key={profile.id}
              className="bg-white rounded-2xl border border-gray-100 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-gray-900">{profile.name}</h3>
                  {profile.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{profile.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {locale === 'de'
                      ? '📄 Klicke auf "Keywords →" um PDFs hochzuladen und Keywords zu verwalten'
                      : '📄 Click "Keywords →" to upload PDFs and manage keywords'}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {/* Email toggle */}
                  <button
                    onClick={() => toggleEmail(profile)}
                    title={t('emailDigest')}
                    className={`text-lg transition-opacity ${profile.daily_email_enabled ? 'opacity-100' : 'opacity-30'}`}
                  >
                    📧
                  </button>
                  {/* Keywords link */}
                  <Link
                    href={`/${locale}/profiles/${profile.id}`}
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium"
                  >
                    {t('keywords')} →
                  </Link>
                  {/* Delete */}
                  <button
                    onClick={() => deleteProfile(profile.id)}
                    className="text-gray-300 hover:text-red-400 text-sm"
                  >
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
