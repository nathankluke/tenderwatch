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

export default function TenderCard({
  tender,
  profileId,
  onStatusChange,
}: {
  tender: Tender
  profileId?: string
  onStatusChange?: (id: string, status: string | null) => void
}) {
  const t = useTranslations('tenders')
  const locale = useLocale()
  const [status, setStatus] = useState<string | null>(tender.status ?? null)
  const [loading, setLoading] = useState(false)

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
    }
  }

  const platformColor = PLATFORM_COLORS[tender.platform] ?? '#f1f5f9'
  const deadline = tender.deadline
    ? new Date(tender.deadline).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-GB')
    : null

  return (
    <div className={`bg-white rounded-xl border p-4 transition-shadow hover:shadow-sm
      ${status === 'working_on' ? 'border-blue-300' :
        status === 'interested' ? 'border-amber-300' : 'border-gray-100'}`}>

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
            {status === 'interested' && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                {locale === 'de' ? 'Interessant' : 'Interested'}
              </span>
            )}
            {status === 'working_on' && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                {locale === 'de' ? 'In Bearbeitung' : 'Working On'}
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
                {locale === 'de' ? 'Details' : 'Details'} &rarr;
              </a>
            )}
            {tender.pdf_url && (
              <a href={tender.pdf_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline">
                PDF &rarr;
              </a>
            )}
            <div className="ml-auto flex items-center gap-2">
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
                {locale === 'de' ? 'In Bearbeitung' : 'Working On'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
