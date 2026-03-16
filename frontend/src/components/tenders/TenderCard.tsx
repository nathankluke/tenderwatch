'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import ScoreBadge from '@/components/ui/ScoreBadge'
import { api, type Tender } from '@/lib/api'

const PLATFORM_COLORS: Record<string, string> = {
  'TED Europa':     '#dbeafe',
  'Mercell':        '#ede9fe',
  'evergabe-online':'#dcfce7',
  'service.bund.de':'#fef9c3',
  'DTVP':           '#fee2e2',
  'Subreport ELVIS':'#fce7f3',
  'vergabe24':      '#e0f2fe',
}

const STATUS_LABELS: Record<string, { de: string; en: string }> = {
  interested: { de: 'Interessant', en: 'Interested' },
  working_on: { de: 'In Bearbeitung', en: 'Working On' },
  bid: { de: 'Angeboten', en: 'Bid' },
  no_bid: { de: 'Kein Angebot', en: 'No Bid' },
}

export default function TenderCard({
  tender,
  profileId,
  onStatusChange,
  compact = false,
}: {
  tender: Tender
  profileId?: string
  onStatusChange?: (id: string, status: string | null) => void
  compact?: boolean
}) {
  const t = useTranslations('tenders')
  const locale = useLocale()
  const [status, setStatus] = useState<string | null>(tender.status ?? null)
  const [loading, setLoading] = useState(false)
  const [showCompleteMenu, setShowCompleteMenu] = useState(false)

  const handleStatus = async (newStatus: string) => {
    setLoading(true)
    try {
      if (status === newStatus) {
        await api.tenders.removeStatus(tender.id)
        setStatus(null)
        onStatusChange?.(tender.id, null)
      } else {
        await api.tenders.setStatus(tender.id, { status: newStatus, profile_id: profileId })
        setStatus(newStatus)
        onStatusChange?.(tender.id, newStatus)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setShowCompleteMenu(false)
    }
  }

  const platformColor = PLATFORM_COLORS[tender.platform] ?? '#f1f5f9'
  const deadline = tender.deadline
    ? new Date(tender.deadline).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB')
    : null

  const statusLabel = status ? STATUS_LABELS[status] : null

  // Compact mode for sidebar panels
  if (compact) {
    return (
      <div className={`rounded-lg border p-2.5 transition-shadow hover:shadow-sm
        ${status === 'working_on' ? 'border-blue-200 bg-blue-50/30' :
          status === 'interested' ? 'border-amber-200 bg-amber-50/30' :
          status === 'bid' ? 'border-green-200 bg-green-50/30' :
          status === 'no_bid' ? 'border-gray-200 bg-gray-50/30' :
          'border-gray-100 bg-white'}`}>
        <Link
          href={`/${locale}/tenders/${tender.id}`}
          className="font-medium text-gray-900 hover:text-blue-600 transition-colors line-clamp-1 text-xs"
        >
          {tender.title}
        </Link>
        <div className="flex items-center gap-2 mt-1">
          <span
            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={{ background: platformColor, color: '#374151' }}
          >
            {tender.platform}
          </span>
          {deadline && (
            <span className="text-[10px] text-gray-400">{deadline}</span>
          )}
          {tender.score !== undefined && tender.score !== null && (
            <span className="ml-auto">
              <ScoreBadge score={tender.score} small />
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-white rounded-xl border p-4 transition-shadow hover:shadow-sm
      ${status === 'working_on' ? 'border-blue-300' :
        status === 'interested' ? 'border-amber-300' :
        status === 'bid' ? 'border-green-300' :
        status === 'no_bid' ? 'border-gray-300' :
        'border-gray-100'}`}>

      <div className="flex gap-4">
        {tender.score !== undefined && tender.score !== null && (
          <div className="flex-shrink-0 pt-0.5">
            <ScoreBadge score={tender.score} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className="inline-block px-2 py-0.5 rounded text-xs font-medium"
              style={{ background: platformColor, color: '#374151' }}
            >
              {tender.platform}
            </span>
            {deadline && (
              <span className="text-xs text-gray-500">
                {t('deadline')}: <strong>{deadline}</strong>
              </span>
            )}
            {statusLabel && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                ${status === 'interested' ? 'bg-amber-100 text-amber-700' :
                  status === 'working_on' ? 'bg-blue-100 text-blue-700' :
                  status === 'bid' ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-600'}`}>
                {locale === 'de' ? statusLabel.de : statusLabel.en}
              </span>
            )}
          </div>

          <Link
            href={`/${locale}/tenders/${tender.id}`}
            className="font-semibold text-gray-900 hover:text-blue-600 transition-colors line-clamp-2 text-sm"
          >
            {tender.title}
          </Link>

          {tender.client && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{tender.client}</p>
          )}

          {tender.summary && (
            <p className="text-xs text-gray-600 mt-1.5 line-clamp-2 italic">{tender.summary}</p>
          )}

          {tender.matched_keywords && tender.matched_keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tender.matched_keywords.slice(0, 5).map(kw => (
                <span
                  key={kw}
                  className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {tender.url && (
              <a href={tender.url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline">
                Details &rarr;
              </a>
            )}
            {tender.pdf_url && (
              <a href={tender.pdf_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline">
                PDF &rarr;
              </a>
            )}
            <div className="ml-auto flex items-center gap-1.5 relative">
              <button
                onClick={() => handleStatus('interested')}
                disabled={loading}
                className={`text-xs px-2.5 py-1 rounded-lg transition-colors font-medium
                  ${status === 'interested'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-amber-50 hover:text-amber-600'}`}
              >
                {locale === 'de' ? 'Interessant' : 'Interested'}
              </button>
              <button
                onClick={() => handleStatus('working_on')}
                disabled={loading}
                className={`text-xs px-2.5 py-1 rounded-lg transition-colors font-medium
                  ${status === 'working_on'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600'}`}
              >
                {locale === 'de' ? 'Bearbeiten' : 'Work On'}
              </button>

              {/* Complete dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowCompleteMenu(prev => !prev)}
                  disabled={loading}
                  className={`text-xs px-2 py-1 rounded-lg transition-colors font-medium
                    ${(status === 'bid' || status === 'no_bid')
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-600'}`}
                >
                  {locale === 'de' ? 'Abschl.' : 'Done'}
                </button>
                {showCompleteMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[120px]">
                    <button
                      onClick={() => handleStatus('bid')}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-green-50 text-gray-700"
                    >
                      {locale === 'de' ? 'Angeboten' : 'Bid'}
                    </button>
                    <button
                      onClick={() => handleStatus('no_bid')}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 text-gray-700"
                    >
                      {locale === 'de' ? 'Kein Angebot' : 'No Bid'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
