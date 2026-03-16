'use client'

import { useEffect, useState, useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import TenderCard from '@/components/tenders/TenderCard'
import { api, type Tender } from '@/lib/api'

const PLATFORMS = [
  'TED Europa', 'Mercell', 'evergabe-online',
  'service.bund.de', 'DTVP', 'Subreport ELVIS', 'vergabe24',
]

const PAGE_SIZE = 25 // Limit results per page to control token usage

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
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [totalShown, setTotalShown] = useState(0)

  // Debounce search to avoid excessive API calls
  const [searchDebounce, setSearchDebounce] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounce(search), 400)
    return () => clearTimeout(timer)
  }, [search])

  // Reset page when filters change
  useEffect(() => {
    setPage(0)
    setTenders([])
  }, [profileId, platform, minScore, searchDebounce])

  // Fetch tenders
  useEffect(() => {
    if (!profileId) return
    setLoading(true)
    api.tenders.list({
      profile_id: profileId,
      platform: platform || undefined,
      min_score: minScore,
      search: searchDebounce || undefined,
      limit: PAGE_SIZE + 1, // Fetch one extra to check if more exist
      offset: page * PAGE_SIZE,
    }).then(data => {
      if (data.length > PAGE_SIZE) {
        setHasMore(true)
        data = data.slice(0, PAGE_SIZE)
      } else {
        setHasMore(false)
      }
      if (page === 0) {
        setTenders(data)
      } else {
        setTenders(prev => [...prev, ...data])
      }
      setTotalShown((page * PAGE_SIZE) + data.length)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [profileId, platform, minScore, searchDebounce, page])

  const handleStatusChange = (id: string, status: string | null) => {
    setTenders(prev => prev.map(t =>
      t.id === id ? { ...t, status: status as any } : t
    ))
  }

  const loadMore = () => {
    setPage(prev => prev + 1)
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

      {/* Count + token info */}
      <div className="flex items-center justify-between px-1 mb-2 flex-shrink-0">
        <p className="text-xs text-gray-400">
          {loading && page === 0
            ? tt('loading')
            : `${totalShown} ${locale === 'de' ? 'Ausschreibungen' : 'tenders'}${hasMore ? '+' : ''}`}
        </p>
        <p className="text-[10px] text-gray-300">
          {locale === 'de' ? `Seite ${page + 1}` : `Page ${page + 1}`}
        </p>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {loading && page === 0 ? (
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
          <>
            {tenders.map(tender => (
              <TenderCard
                key={tender.id}
                tender={tender}
                profileId={profileId}
                onStatusChange={handleStatusChange}
              />
            ))}

            {/* Load More / Pagination */}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loading}
                className="w-full py-2.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-xl border border-blue-100 hover:bg-blue-100 transition-colors"
              >
                {loading
                  ? (locale === 'de' ? 'Lade...' : 'Loading...')
                  : (locale === 'de' ? 'Weitere laden' : 'Load more')}
              </button>
            )}

            {!hasMore && tenders.length > 0 && (
              <p className="text-center text-[10px] text-gray-300 py-2">
                {locale === 'de' ? 'Alle Ergebnisse geladen' : 'All results loaded'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
