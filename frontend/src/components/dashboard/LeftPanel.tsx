'use client'

import { useLocale, useTranslations } from 'next-intl'
import TenderCard from '@/components/tenders/TenderCard'
import type { Tender } from '@/lib/api'

export default function LeftPanel({
  workingOn,
  interested,
  completed,
  profileId,
  loading,
  onStatusChange,
}: {
  workingOn: Tender[]
  interested: Tender[]
  completed?: Tender[]
  profileId?: string
  loading: boolean
  onStatusChange: (id: string, status: string | null) => void
}) {
  const t = useTranslations('dashboard')
  const locale = useLocale()

  const bidTenders = (completed ?? []).filter(t => t.status === 'bid')
  const noBidTenders = (completed ?? []).filter(t => t.status === 'no_bid')

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto pr-1">
      {/* Working On */}
      <section className="bg-white rounded-xl border border-gray-100">
        <div className="px-4 py-2.5 border-b border-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm">
            {locale === 'de' ? 'In Bearbeitung' : 'Working On'}
          </h2>
          {workingOn.length > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              {workingOn.length}
            </span>
          )}
        </div>
        <div className="p-3 space-y-2">
          {loading ? (
            <LoadingSkeleton />
          ) : workingOn.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">{t('noWorkingOn')}</p>
          ) : (
            workingOn.map(tender => (
              <TenderCard
                key={tender.id}
                tender={tender}
                profileId={profileId}
                onStatusChange={onStatusChange}
                compact
              />
            ))
          )}
        </div>
      </section>

      {/* Interested */}
      <section className="bg-white rounded-xl border border-gray-100">
        <div className="px-4 py-2.5 border-b border-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm">
            {locale === 'de' ? 'Interessant' : 'Interested'}
          </h2>
          {interested.length > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              {interested.length}
            </span>
          )}
        </div>
        <div className="p-3 space-y-2">
          {loading ? (
            <LoadingSkeleton />
          ) : interested.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">{t('noInterested')}</p>
          ) : (
            interested.map(tender => (
              <TenderCard
                key={tender.id}
                tender={tender}
                profileId={profileId}
                onStatusChange={onStatusChange}
                compact
              />
            ))
          )}
        </div>
      </section>

      {/* Completed - Bid / No Bid */}
      <section className="bg-white rounded-xl border border-gray-100">
        <div className="px-4 py-2.5 border-b border-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm">
            {locale === 'de' ? 'Abgeschlossen' : 'Completed'}
          </h2>
          {(completed ?? []).length > 0 && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              {(completed ?? []).length}
            </span>
          )}
        </div>
        <div className="p-3">
          {loading ? (
            <LoadingSkeleton />
          ) : (completed ?? []).length === 0 ? (
            <p className="text-xs text-gray-400 py-2">
              {locale === 'de' ? 'Keine abgeschlossenen Projekte' : 'No completed projects'}
            </p>
          ) : (
            <div className="space-y-3">
              {/* Bid */}
              {bidTenders.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                    <span className="text-[10px] font-semibold text-green-700 uppercase tracking-wider">
                      {locale === 'de' ? 'Angeboten' : 'Bid'}
                    </span>
                    <span className="text-[10px] text-gray-400">({bidTenders.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {bidTenders.map(tender => (
                      <TenderCard
                        key={tender.id}
                        tender={tender}
                        profileId={profileId}
                        onStatusChange={onStatusChange}
                        compact
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* No Bid */}
              {noBidTenders.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      {locale === 'de' ? 'Kein Angebot' : 'No Bid'}
                    </span>
                    <span className="text-[10px] text-gray-400">({noBidTenders.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {noBidTenders.map(tender => (
                      <TenderCard
                        key={tender.id}
                        tender={tender}
                        profileId={profileId}
                        onStatusChange={onStatusChange}
                        compact
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2].map(i => (
        <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
      ))}
    </div>
  )
}
