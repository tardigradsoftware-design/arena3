import React, { useEffect, useState } from 'react'
import { api, tl, compact, pct, scoreColor, dateTime, ROOM_OPTIONS } from '../api'
import { IconBell, IconPlus, IconPlay } from '../components/Icons'

const describe = (c: any) => {
  const parts: string[] = []
  if (c.district) parts.push(`ilçe: ${c.district}`)
  if (c.districts?.length) parts.push(`ilçeler: ${c.districts.join(', ')}`)
  if (c.dealType) parts.push(c.dealType === 'satilik' ? 'satılık' : 'kiralık')
  if (c.rooms?.length) parts.push(c.rooms.join(', '))
  if (c.minScore) parts.push(`skor ≥ ${c.minScore}`)
  if (c.maxPricePerM2Ratio) parts.push(`medyanın ≤ %${Math.round(c.maxPricePerM2Ratio * 100)}'i`)
  if (c.maxPrice) parts.push(`≤ ${compact(c.maxPrice)} ₺`)
  if (c.maxDaysOnMarket) parts.push(`≤ ${c.maxDaysOnMarket} gün`)
  return parts
}

export default function Alerts({ meta, onOpenListing }: { meta: any; onOpenListing: (id: number) => void }) {
  const [alerts, setAlerts] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [matches, setMatches] = useState<any[]>([])
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<any>({
    name: '',
    district: '',
    dealType: 'satilik',
    minScore: 70,
    maxPricePerM2Ratio: 0.92,
    rooms: []
  })

  const load = () => api.alerts().then(setAlerts).catch(() => {})
  useEffect(() => {
    load()
  }, [])

  const openMatches = async (a: any) => {
    setSelected(a)
    const r = await api.matches(a.id)
    setMatches(r.matches || [])
    load()
  }

  const create = async () => {
    if (!form.name) return
    const criteria: any = {
      district: form.district || undefined,
      dealType: form.dealType,
      minScore: form.minScore || undefined,
      maxPricePerM2Ratio: form.maxPricePerM2Ratio || undefined,
      rooms: form.rooms.length ? form.rooms : undefined
    }
    await api.createAlert(form.name, criteria)
    setCreating(false)
    setForm({ name: '', district: '', dealType: 'satilik', minScore: 70, maxPricePerM2Ratio: 0.92, rooms: [] })
    load()
  }

  return (
    <>
      <div className="toolbar">
        <div className="field">
          <label>Uyarı kuralları</label>
          <div className="mono" style={{ padding: '7px 0' }}>{alerts.length} aktif kural</div>
        </div>
        <div className="field" style={{ marginLeft: 'auto' }}>
          <label>Yeni</label>
          <button className="btn primary" onClick={() => setCreating((v) => !v)}>
            <IconPlus size={14} /> Kural oluştur
          </button>
        </div>
      </div>

      <div className="notice">
        Kural motoru her çalıştırmada portföyü tarar ve kriterlere uyan ilanları listeler. E-posta/Telegram kanalı
        bağlamak için kural motorunu bir zamanlanmış göreve (cron) bağlayın — altyapı hazır, kanal adaptörü eklenebilir.
      </div>

      {creating && (
        <div className="panel">
          <div className="panel-head">
            <IconPlus size={15} />
            <div className="panel-title">Yeni uyarı kuralı</div>
          </div>
          <div className="panel-body">
            <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
              <div className="field grow">
                <label>Kural adı</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Örn. Kadıköy 2+1 kelepir" />
              </div>
              <div className="field">
                <label>İlçe</label>
                <select value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })}>
                  <option value="">Tümü</option>
                  {meta?.districts?.map((d: any) => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>İşlem</label>
                <select value={form.dealType} onChange={(e) => setForm({ ...form, dealType: e.target.value })}>
                  <option value="satilik">Satılık</option>
                  <option value="kiralik">Kiralık</option>
                </select>
              </div>
              <div className="field">
                <label>Min skor</label>
                <input type="number" value={form.minScore} onChange={(e) => setForm({ ...form, minScore: Number(e.target.value) })} style={{ width: 84 }} />
              </div>
              <div className="field">
                <label>Medyan oranı ≤</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.maxPricePerM2Ratio}
                  onChange={(e) => setForm({ ...form, maxPricePerM2Ratio: Number(e.target.value) })}
                  style={{ width: 84 }}
                />
              </div>
              <div className="field">
                <label>Oda</label>
                <div className="chip-row">
                  {ROOM_OPTIONS.map((r) => (
                    <button
                      key={r}
                      className={`chip ${form.rooms.includes(r) ? 'on' : ''}`}
                      onClick={() =>
                        setForm({
                          ...form,
                          rooms: form.rooms.includes(r) ? form.rooms.filter((x: string) => x !== r) : [...form.rooms, r]
                        })
                      }
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <button className="btn primary" onClick={create} disabled={!form.name}>Kaydet</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <IconBell size={15} />
            <div>
              <div className="panel-title">Kurallar</div>
              <div className="panel-sub">eşleşme sayıları canlı hesaplanır</div>
            </div>
          </div>
          <div className="panel-body">
            <div className="col" style={{ gap: 9 }}>
              {alerts.map((a) => (
                <div
                  key={a.id}
                  className="src-card"
                  style={{ borderColor: selected?.id === a.id ? 'rgba(45,212,191,.5)' : undefined, cursor: 'pointer' }}
                  onClick={() => openMatches(a)}
                >
                  <div className="src-head">
                    <span className={`tag ${a.active ? 'green' : 'slate'}`}>{a.active ? 'aktif' : 'pasif'}</span>
                    <b>{a.name}</b>
                    <span className="tag amber" style={{ marginLeft: 'auto' }}>{a.match_count} eşleşme</span>
                  </div>
                  <div className="pill-row">
                    {describe(a.criteria).map((p) => <span key={p} className="tag slate">{p}</span>)}
                  </div>
                  <div className="src-foot">
                    <span>son çalışma: {a.last_run ? dateTime(a.last_run) : '—'}</span>
                    <div className="row" style={{ gap: 6, marginLeft: 'auto' }}>
                      <button
                        className="btn sm ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          api.updateAlert(a.id, { active: !a.active }).then(load)
                        }}
                      >
                        {a.active ? 'Durdur' : 'Başlat'}
                      </button>
                      <button
                        className="btn sm ghost danger"
                        onClick={(e) => {
                          e.stopPropagation()
                          api.deleteAlert(a.id).then(load)
                        }}
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {!alerts.length && <div className="empty">Kural yok</div>}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <IconPlay size={15} />
            <div>
              <div className="panel-title">{selected ? selected.name : 'Eşleşmeler'}</div>
              <div className="panel-sub">{selected ? `${matches.length} ilan kriterlere uyuyor` : 'soldan bir kural seçin'}</div>
            </div>
          </div>
          <div className="panel-body tight">
            <div className="tbl-wrap" style={{ maxHeight: 520 }}>
              <table className="tbl">
                <thead>
                  <tr><th>İlan</th><th className="num">Fiyat</th><th className="num">Fark</th><th className="num">Skor</th></tr>
                </thead>
                <tbody>
                  {matches.map((m) => (
                    <tr key={m.id} onClick={() => onOpenListing(m.id)}>
                      <td>
                        <div className="title-cell">
                          <span>{m.district} · {m.rooms}</span>
                          <small>{m.m2_net} m² · {m.days_on_market} gün</small>
                        </div>
                      </td>
                      <td className="num">{compact(m.price)}</td>
                      <td className="num" style={{ color: 'var(--green)' }}>{pct(m.undervalue_pct)}</td>
                      <td className="num" style={{ color: scoreColor(m.score) }}>{m.score}</td>
                    </tr>
                  ))}
                  {selected && !matches.length && (
                    <tr><td colSpan={4}><div className="empty">Eşleşme yok — kriterleri gevşetin.</div></td></tr>
                  )}
                  {!selected && (
                    <tr><td colSpan={4}><div className="empty">Kural seçilmedi</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
