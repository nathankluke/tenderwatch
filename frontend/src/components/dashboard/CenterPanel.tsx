'use client'

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import TenderCard from '@/components/tenders/TenderCard'
import { api, type Tender } from '@/lib/api'

const PLATFORMS = [
  'TED Europa', 'Mercell', 'evergabe-online',
  'service.bund.de', 'DTVP', 'Subreport ELVIS', 'vergabe24',
]

export default function CenterPanel({
  profileId,
}: {
  profileId?: string
}) {
  const locale = useLocale()
  const tt = useTranslations('tenders')

  const [tenders, setTenders] = useState<Tender[]>([])
  const [platform, setPlatform] = useState('')
  const [minScore, setMinScore] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!profileId) return
    setLoading(true)
    api.tenders.list({
      profile_id: profileId,
      platform: platform || undefined,
      min_score: minScore,
      search: search || undefined,
      limit: 100,
    }).then(data => {
      setTenders(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [profileId, platform, minScore, search])

  const handleStatusChange = (id: string, status: string | null) => {
    setTenders(prev => prev.map(t =>
      t.id === id ? { ...t, status: status as any } : t
    ))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 mb-3 flex-shrink-0">
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={platform}
            onChange={e => setPlatform(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{tt('allPlatforms')}</option>
            {PLATFORMS.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 whitespace-nowrap">
              {tt('filterMinScore')}: <strong>{minScore}</strong>
            </label>
            <input
              type="range" min={0} max={10} value={minScore}
              onChange={e => setMinScore(Number(e.target.value))}
              className="w-20"
            />
          </div>

          <input
            type="text"
            placeholder={tt('search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-32 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-gray-400 px-1 mb-2 flex-shrink-0">
        {loading ? tt('loading') : `${tenders.length} ${locale === 'de' ? 'Ausschreibungen' : 'tenders'}`}
      </p>

      {/* Results */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-24 bg-white rounded-xl border border-gray-100 animate-pulse" />
            ))}
          </div>
        ) : tenders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
            <p className="text-gray-400 text-sm">{tt('noResults')}</p>
          </div>
        ) : (
          tenders.map(tender => (
            <TenderCard
              key={tender.id}
              tender={tender}
              profileId={profileId}
              onStatusChange={handleStatusChange}
            />
          ))
        )}
      </div>
    </div>
  )
}
