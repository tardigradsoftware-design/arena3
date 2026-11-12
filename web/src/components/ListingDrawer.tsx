import React, { useEffect, useState } from 'react'
import { api, money, tl, compact, pct, dateShort, dateTime, scoreColor, scoreLabel } from '../api'
import { LineChart } from './Charts'
import { IconX, IconPin, IconTrend, IconShield, IconUsers } from './Icons'

const LAWFUL = [
  { v: 'acik_riza', l: 'Açık rıza (rıza kaydı zorunlu)' },
  { v: 'sozlesme', l: 'Sözleşmenin kurulması/ifası' },
  { v: 'mesru_menfaat', l: 'Meşru menfaat' },
  { v: 'kanuni_yukumluluk', l: 'Kanuni yükümlülük' },
  { v: 'aleni_edilmis', l: 'Kişinin alenileştirdiği veri' }
]

export default function ListingDrawer({
  id,
  onClose,
  onOpenListing
}: {
  id: number
  onClose: () => void
  onOpenListing: (id: number) => void
}) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [leadOpen, setLeadOpen] = useState(false)
  const [lead, setLead] = useState<any>({ lawful_basis: 'sozlesme', role: 'satici', source: 'ilan-takibi' })
  const [leadMsg, setLeadMsg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setData(null)
    setError(null)
    api
      .listing(id)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [id])

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const saveLead = async () => {
    setLeadMsg(null)
    try {
      await api.createLead({ ...lead, listing_id: id, district: data?.listing?.district })
      setLeadMsg('Aday kaydedildi. İletişim bilgisi maskeli saklanır, görüntüleme denetim kaydına yazılır.')
      setLeadOpen(false)
    } catch (e: any) {
      setLeadMsg(`Hata: ${e.message}`)
    }
  }

  const l = data?.listing

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="İlan detayı">
        <div className="drawer-head">
          <div className="grow">
            {l ? (
              <>
                <div className="row" style={{ gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span className={`tag ${l.deal_type === 'satilik' ? 'teal' : 'violet'}`}>
                    {l.deal_type === 'satilik' ? 'Satılık' : 'Kiralık'}
                  </span>
                  <span className="tag slate">{l.rooms || '—'}</span>
                  <span className="tag slate">{l.m2_net ? `${l.m2_net} m² net` : '—'}</span>
                  {l.source === 'demo' && <span className="tag amber">demo kayıt</span>}
                </div>
                <h2 style={{ fontSize: 17 }}>{l.title}</h2>
                <div className="tiny dim" style={{ marginTop: 4 }}>
                  {l.district} · {l.neighborhood || '—'} · #{l.id} · ilk görülme {dateShort(l.first_seen)}
                </div>
              </>
            ) : (
              <h2 style={{ fontSize: 16 }}>İlan detayı</h2>
            )}
          </div>
          <button className="btn ghost sm" onClick={onClose} aria-label="Kapat">
            <IconX size={16} />
          </button>
        </div>

        <div className="drawer-body">
          {error && <div className="notice err">{error}</div>}
          {!l && !error && (
            <div className="loading-block">
              <span className="spinner" /> Yükleniyor…
            </div>
          )}

          {l && (
            <>
              <div className="panel" style={{ background: 'rgba(13,23,39,.6)' }}>
                <div className="panel-body" style={{ paddingTop: 14 }}>
                  <div className="row between" style={{ alignItems: 'flex-end' }}>
                    <div>
                      <div className="section-title" style={{ marginBottom: 3 }}>Talep fiyatı</div>
                      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em' }}>{money(l.price)}</div>
                      <div className="tiny dim">
                        {tl(l.price_per_m2)} ₺/m² · bölge medyanı {tl(l.benchmark_m2)} ₺/m²
                        {l.benchmark_sample ? ` (${l.benchmark_sample} örnek)` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="section-title" style={{ marginBottom: 3 }}>Fırsat skoru</div>
                      <div style={{ fontSize: 30, fontWeight: 750, color: scoreColor(l.score), fontFamily: 'var(--mono)' }}>
                        {l.score}
                      </div>
                      <div className="tiny" style={{ color: scoreColor(l.score) }}>{scoreLabel(l.score)}</div>
                    </div>
                  </div>
                  <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
                    <span className={`tag ${l.undervalue_pct >= 0 ? 'green' : 'rose'}`}>
                      piyasa farkı {pct(l.undervalue_pct)}
                    </span>
                    <span className="tag slate">{l.days_on_market} gündür ilanda</span>
                    {l.price_drops > 0 && <span className="tag amber">{l.price_drops} fiyat güncellemesi ({pct(l.price_delta_pct)})</span>}
                    {l.seller_type && (
                      <span className="tag slate">
                        {l.seller_type === 'emlak_ofisi' ? 'Emlak ofisi' : l.seller_type === 'sahibinden' ? 'Sahibinden' : 'İnşaat firması'}
                        {l.office_name ? ` · ${l.office_name}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="section-title">Skor kırılımı — neden bu skor?</div>
                <div className="panel">
                  <div className="panel-body" style={{ paddingTop: 8 }}>
                    {(l.factors || []).map((f: any) => (
                      <div className="factor-row" key={f.key}>
                        <div className="factor-label">
                          {f.label}
                          <small>{f.hint}</small>
                        </div>
                        <div className={`factor-delta ${f.delta > 0 ? 'pos' : f.delta < 0 ? 'neg' : 'neu'}`}>
                          {f.delta > 0 ? '+' : ''}
                          {f.delta}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="kv">
                <div><span>Brüt alan</span><b>{l.m2_gross ? `${l.m2_gross} m²` : '—'}</b></div>
                <div><span>Net/brüt verim</span><b>{l.m2_net && l.m2_gross ? `${Math.round((l.m2_net / l.m2_gross) * 100)}%` : '—'}</b></div>
                <div><span>Kat</span><b>{l.floor ?? '—'} / {l.total_floors ?? '—'}</b></div>
                <div><span>Bina yaşı</span><b>{l.building_age != null ? `${l.building_age} yıl` : '—'}</b></div>
                <div><span>Isıtma</span><b>{l.heating || '—'}</b></div>
                <div><span>Aidat</span><b>{l.dues ? `${tl(l.dues)} ₺` : '—'}</b></div>
                <div><span>Konum</span><b>{l.lat ? `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}` : '—'}</b></div>
                <div><span>Kaynak</span><b>{l.source}</b></div>
              </div>

              {l.location?.nearestTransport && (
                <div className="notice">
                  <IconPin size={13} /> <b>En yakın ulaşım:</b> {l.location.nearestTransport.name} (
                  {l.location.nearestTransport.km} km{l.location.nearestTransport.line ? `, ${l.location.nearestTransport.line}` : ''}) ·
                  Ulaşım skoru {l.location.transportScore ?? '—'}/100 · Yaşam skoru {l.location.amenityScore ?? '—'}/100
                </div>
              )}

              {data?.history?.length > 1 && (
                <div>
                  <div className="section-title">Fiyat geçmişi (gözlemler)</div>
                  <div className="panel">
                    <div className="panel-body" style={{ paddingTop: 10 }}>
                      <LineChart
                        labels={data.history.map((h: any) => dateShort(h.observed_at))}
                        series={[{ name: 'Fiyat', color: '#2dd4bf', values: data.history.map((h: any) => h.price) }]}
                        height={150}
                        format={(v) => compact(v)}
                      />
                      <div className="tiny dim">
                        {data.history.length} fiyat gözlemi · toplam değişim {pct(l.price_delta_pct)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {data?.risk?.length > 0 && (
                <div>
                  <div className="section-title">Risk notları</div>
                  <div className="col" style={{ gap: 6 }}>
                    {data.risk.map((r: any, i: number) => (
                      <div key={i} className={`notice ${r.level === 'yuksek' ? 'err' : r.level === 'orta' ? 'warn' : ''}`}>
                        <IconShield size={13} /> {r.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data?.comparables?.length > 0 && (
                <div>
                  <div className="section-title">Karşılaştırılabilir ilanlar (aynı bölge & oda)</div>
                  <div className="panel">
                    <div className="tbl-wrap">
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th>İlan</th>
                            <th className="num">m²</th>
                            <th className="num">Fiyat</th>
                            <th className="num">₺/m²</th>
                            <th className="num">Skor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.comparables.map((c: any) => (
                            <tr key={c.id} onClick={() => onOpenListing(c.id)}>
                              <td>
                                <div className="title-cell">
                                  <span>{c.district} {c.rooms}</span>
                                  <small>{c.days_on_market} gün</small>
                                </div>
                              </td>
                              <td className="num">{c.m2_net}</td>
                              <td className="num">{compact(c.price)}</td>
                              <td className="num">{tl(c.price_per_m2)}</td>
                              <td className="num" style={{ color: scoreColor(c.score) }}>{c.score}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              <div className="panel">
                <div className="panel-head">
                  <IconUsers size={15} />
                  <span className="panel-title">Portföy / aday kaydı</span>
                  <div className="panel-actions">
                    <button className="btn sm" onClick={() => setLeadOpen((v) => !v)}>
                      {leadOpen ? 'Kapat' : 'Aday ekle'}
                    </button>
                  </div>
                </div>
                <div className="panel-body">
                  <div className="tiny dim">
                    KVKK: kişisel iletişim verisi yalnızca hukuki dayanak + kaynak bilgisiyle kaydedilir. Telefon maskeli
                    saklanır; açma işlemi denetim kaydına yazılır.
                  </div>
                  {leadMsg && <div className="notice ok mt8">{leadMsg}</div>}
                  {leadOpen && (
                    <div className="col mt12" style={{ gap: 9 }}>
                      <div className="field">
                        <label>Ad soyad *</label>
                        <input value={lead.full_name || ''} onChange={(e) => setLead({ ...lead, full_name: e.target.value })} />
                      </div>
                      <div className="field">
                        <label>Telefon</label>
                        <input
                          value={lead.phone || ''}
                          placeholder="05xx xxx xx xx"
                          onChange={(e) => setLead({ ...lead, phone: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>Hukuki dayanak (KVKK m.5) *</label>
                        <select value={lead.lawful_basis} onChange={(e) => setLead({ ...lead, lawful_basis: e.target.value })}>
                          {LAWFUL.map((o) => (
                            <option key={o.v} value={o.v}>{o.l}</option>
                          ))}
                        </select>
                      </div>
                      {lead.lawful_basis === 'acik_riza' && (
                        <div className="field">
                          <label>Rıza kaydı referansı *</label>
                          <input
                            value={lead.consent_ref || ''}
                            placeholder="Örn. RIZA-2026-0114"
                            onChange={(e) => setLead({ ...lead, consent_ref: e.target.value })}
                          />
                        </div>
                      )}
                      <div className="row">
                        <button className="btn primary" onClick={saveLead} disabled={!lead.full_name}>
                          Kaydet
                        </button>
                        <span className="tiny dim">Kaynak: {lead.source}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="tiny dim">
                Kayıt son güncelleme: {dateTime(l.last_seen)} · parmak izi <span className="mono">{String(l.fingerprint).slice(0, 26)}…</span>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  )
}
