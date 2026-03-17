'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import TenderCard from '@/components/tenders/TenderCard'
import { api, type Tender, type Profile } from '@/lib/api'

const PLATFORMS = ['TED Europa', 'Mercell', 'evergabe-online', 'service.bund.de', 'DTVP', 'Subreport ELVIS', 'vergabe24']

export default function TendersPage() {
  const t = useTranslations('tenders')
  const [tenders, setTenders] = useState<Tender[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeProfile, setActiveProfile] = useState<string | undefined>()
  const [platform, setPlatform] = useState('')
  const [minScore, setMinScore] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.profiles.list().then(p => {
      setProfiles(p)
      if (p.length > 0) setActiveProfile(p[0].id)
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    api.tenders.list({
      profile_id: activeProfile,
      platform: platform || undefined,
      min_score: minScore,
      search: search || undefined,
      limit: 100,
    }).then(data => {
      // Deduplicate by id in case the same tender appears multiple times
      // (e.g. matched by several keywords producing duplicate rows)
      const seen = new Set<string>()
      const unique = data.filter(t => {
        if (seen.has(t.id)) return false
        seen.add(t.id)
        return true
      })
      setTenders(unique)
      setLoading(false)
    })
  }, [activeProfile, platform, minScore, search])

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex flex-wrap gap-3">
          {/* Profile */}
          {profiles.length > 0 && (
            <select
              value={activeProfile}
              onChange={e => setActiveProfile(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          {/* Platform */}
          <select
            value={platform}
            onChange={e => setPlatform(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t('allPlatforms')}</option>
            {PLATFORMS.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {/* Min Score */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap">
              {t('filterMinScore')}: <strong>{minScore}</strong>
            </label>
            <input
              type="range"
              min={0}
              max={10}
              value={minScore}
              onChange={e => setMinScore(Number(e.target.value))}
              className="w-24"
            />
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder={t('search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-40 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-gray-400 px-1">
        {loading ? t('loading') : `${tenders.length} Ausschreibungen`}
      </p>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-28 bg-white rounded-xl border border-gray-100 animate-pulse" />
          ))}
        </div>
      ) : tenders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <p className="text-gray-400 text-sm">{t('noResults')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tenders.map(tender => (
            <TenderCard
              key={tender.id}
              tender={tender}
              profileId={activeProfile}
            />
          ))}
        </div>
      )}
    </div>
  )
}
