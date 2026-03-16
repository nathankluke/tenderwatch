import { useTranslations } from 'next-intl'

function getScoreStyle(score: number): { bg: string; text: string; label: string } {
  if (score >= 8) return { bg: '#dcfce7', text: '#15803d', label: 'veryRelevant' }
  if (score >= 5) return { bg: '#fef9c3', text: '#a16207', label: 'interesting' }
  if (score >= 3) return { bg: '#f1f5f9', text: '#475569', label: 'noteworthy' }
  return       { bg: '#f8fafc', text: '#94a3b8', label: 'lowRelevance' }
}

export default function ScoreBadge({ score, small = false }: { score: number; small?: boolean }) {
  const t = useTranslations('scores')
  const { bg, text, label } = getScoreStyle(score)

  if (small) {
    return (
      <span
        className="inline-flex items-center justify-center w-7 h-5 rounded-full text-[10px] font-bold"
        style={{ background: bg, color: text }}
      >
        {score}
      </span>
    )
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className="inline-flex items-center justify-center w-12 h-7 rounded-full text-sm font-bold"
        style={{ background: bg, color: text }}
      >
        {score}
      </span>
      <span className="text-[10px] font-medium" style={{ color: text }}>
        {t(label as any)}
      </span>
    </div>
  )
}
