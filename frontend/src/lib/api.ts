/**
 * Typed fetch wrapper for the FastAPI backend.
 * Automatically attaches the Supabase auth token.
 */

import { createClient } from './supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

async function getToken(): Promise<string | null> {
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken()
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`API ${res.status}: ${err}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// ── Profiles ──────────────────────────────────────────────────────────────
export const api = {
  profiles: {
    list: ()                           => request<Profile[]>('/profiles'),
    create: (body: { name: string; description?: string }) =>
      request<Profile>('/profiles', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<Profile>) =>
      request<Profile>(`/profiles/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string)               => request<void>(`/profiles/${id}`, { method: 'DELETE' }),
    toggleEmail: (id: string)          => request<{ daily_email_enabled: boolean }>(`/profiles/${id}/email-toggle`, { method: 'PUT' }),
  },

  keywords: {
    list: (profileId: string)          => request<Keyword[]>(`/profiles/${profileId}/keywords`),
    add: (profileId: string, body: { keyword: string; category: string }) =>
      request<Keyword>(`/profiles/${profileId}/keywords`, { method: 'POST', body: JSON.stringify(body) }),
    delete: (profileId: string, keywordId: string) =>
      request<void>(`/profiles/${profileId}/keywords/${keywordId}`, { method: 'DELETE' }),
    approve: (profileId: string, keywords: { keyword: string; category: string }[]) =>
      request<{ inserted: number }>(`/profiles/${profileId}/keywords/approve`, {
        method: 'POST', body: JSON.stringify({ keywords }),
      }),
  },

  tenders: {
    list: (params: TenderListParams)   => request<Tender[]>(`/tenders?${new URLSearchParams(params as any)}`),
    get: (id: string)                  => request<TenderDetail>(`/tenders/${id}`),
    setStatus: (id: string, body: { status: string; profile_id?: string; notes?: string }) =>
      request<{ status: string }>(`/tenders/${id}/status`, { method: 'POST', body: JSON.stringify(body) }),
    removeStatus: (id: string)         => request<void>(`/tenders/${id}/status`, { method: 'DELETE' }),
    extractKeywords: (id: string, profileId: string) =>
      request<{ extracted_keywords: ExtractedKeyword[] }>(`/tenders/${id}/extract-keywords?profile_id=${profileId}`, { method: 'POST' }),
  },

  dashboard: {
    get: (profileId?: string)          => request<DashboardData>(`/dashboard${profileId ? `?profile_id=${profileId}` : ''}`),
    scan: (profileId?: string)          => request<{ status: string }>(`/dashboard/scan${profileId ? `?profile_id=${profileId}` : ''}`, { method: 'POST' }),
  },

  uploads: {
    list: (profileId: string)          => request<PdfUpload[]>(`/profiles/${profileId}/uploads`),
    approve: (profileId: string, uploadId: string, keywords: ExtractedKeyword[]) =>
      request<{ saved: number }>(`/profiles/${profileId}/upload-pdf/${uploadId}/approve`, {
        method: 'POST', body: JSON.stringify({ keywords }),
      }),
    delete: (profileId: string, uploadId: string) =>
      request<void>(`/profiles/${profileId}/uploads/${uploadId}`, { method: 'DELETE' }),
  },

  emailRecipients: {
    list: (profileId: string) =>
      request<EmailRecipient[]>(`/profiles/${profileId}/email-recipients`),
    add: (profileId: string, body: { email: string; name?: string }) =>
      request<EmailRecipient>(`/profiles/${profileId}/email-recipients`, {
        method: 'POST', body: JSON.stringify(body),
      }),
    delete: (profileId: string, recipientId: string) =>
      request<void>(`/profiles/${profileId}/email-recipients/${recipientId}`, {
        method: 'DELETE',
      }),
  },
}

// ── Types ──────────────────────────────────────────────────────────────────
export interface Profile {
  id: string
  user_id: string
  name: string
  description?: string
  daily_email_enabled: boolean
  created_at: string
}

export interface Keyword {
  id: string
  profile_id: string
  keyword: string
  category: 'leistung' | 'allgemein' | 'firma'
  source: string
  approved: boolean
  created_at: string
}

export interface Tender {
  id: string
  external_id: string
  platform: string
  title: string
  client?: string
  deadline?: string
  publication_date?: string
  summary?: string
  url?: string
  pdf_url?: string
  score?: number
  matched_keywords?: string[]
  status?: 'interested' | 'working_on' | 'dismissed' | 'bid' | 'no_bid'
  created_at: string
}

export interface TenderDetail extends Tender {
  description?: string
  notes?: string
}

export interface TenderListParams {
  profile_id?: string
  min_score?: number
  platform?: string
  search?: string
  limit?: number
  offset?: number
}

export interface ExtractedKeyword {
  keyword: string
  category: string
}

export interface DashboardData {
  working_on: Tender[]
  interested: Tender[]
  completed: Tender[]
  recent_tenders: Tender[]
  last_scrape_at?: string
  last_scrape_status?: string
}

export interface PdfUpload {
  id: string
  filename: string
  project_name?: string
  storage_path?: string
  status: string
  created_at: string
  extracted_keywords?: ExtractedKeyword[]
}

export interface EmailRecipient {
  id: string
  profile_id: string
  email: string
  name?: string
  created_at: string
}
