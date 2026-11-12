const base = ''

async function request<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(base + url, {
    ...options,
    headers: {
      ...(options.body && typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  })
  const text = await res.text()
  let data: any = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { error: text }
  }
  if (!res.ok) {
    throw new Error(data?.error || `İstek başarısız (${res.status})`)
  }
  return data as T
}

const qs = (params: Record<string, any>) => {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export const api = {
  health: () => request('/api/health'),
  meta: () => request('/api/meta'),
  overview: (params: Record<string, any> = {}) => request(`/api/overview${qs(params)}`),
  listings: (params: Record<string, any> = {}) => request(`/api/listings${qs(params)}`),
  listing: (id: number | string) => request(`/api/listings/${id}`),
  geo: () => request('/api/geo'),
  district: (name: string) => request(`/api/districts/${encodeURIComponent(name)}`),
  compare: (districts: string[] = []) => request(`/api/compare${qs({ districts })}`),
  alerts: () => request('/api/alerts'),
  createAlert: (name: string, criteria: any) =>
    request('/api/alerts', { method: 'POST', body: JSON.stringify({ name, criteria }) }),
  updateAlert: (id: number, patch: any) =>
    request(`/api/alerts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteAlert: (id: number) => request(`/api/alerts/${id}`, { method: 'DELETE' }),
  matches: (id: number) => request(`/api/alerts/${id}/matches`),
  leads: () => request('/api/leads'),
  createLead: (lead: any) => request('/api/leads', { method: 'POST', body: JSON.stringify(lead) }),
  revealLead: (id: number, reason: string) => request(`/api/leads/${id}/reveal?reason=${encodeURIComponent(reason)}`),
  deleteLead: (id: number) => request(`/api/leads/${id}`, { method: 'DELETE' }),
  previewImport: (csv: string, delimiter?: string) =>
    request('/api/import/preview', { method: 'POST', body: JSON.stringify({ csv, delimiter }) }),
  importCsv: (csv: string, sourceKey = 'csv-import', fileName = 'ice-aktarma.csv', delimiter?: string) =>
    request('/api/import/csv', { method: 'POST', body: JSON.stringify({ csv, sourceKey, fileName, delimiter }) }),
  importXml: (xml: string, fileName = 'feed.xml') =>
    request('/api/import/xml', { method: 'POST', body: JSON.stringify({ xml, sourceKey: 'xml-feed', fileName }) }),
  sync: (key: string) => request(`/api/sources/${key}/sync`, { method: 'POST' }),
  audit: () => request('/api/audit'),
  sampleCsv: () => fetch('/api/sample-csv').then((r) => r.text())
}

/* ------------------------------ biçimlendirme ----------------------------- */

export const tl = (v?: number | null) =>
  v == null ? '—' : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(v)

export const money = (v?: number | null) => (v == null ? '—' : `${tl(v)} ₺`)

export const compact = (v?: number | null) => {
  if (v == null) return '—'
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1).replace('.', ',')} mr`
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')} mn`
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1000)} B`
  return String(v)
}

export const pct = (v?: number | null, digits = 1) =>
  v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(digits).replace('.', ',')}%`

export const dateShort = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '—'

export const dateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export const monthLabel = (m: string) => {
  const [y, mm] = m.split('-')
  const names = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  return `${names[Number(mm) - 1]} ${y.slice(2)}`
}

export const haversine = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export const ROOM_OPTIONS = ['1+1', '2+1', '3+1', '4+1', '5+1', '2+2']
export const scoreColor = (s: number) => (s >= 80 ? '#22c55e' : s >= 65 ? '#2dd4bf' : s >= 50 ? '#f59e0b' : '#f43f5e')
export const scoreLabel = (s: number) =>
  s >= 80 ? 'Yüksek fırsat' : s >= 65 ? 'İyi fırsat' : s >= 50 ? 'Normal' : 'Zayıf'
