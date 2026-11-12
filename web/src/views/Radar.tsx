import React, { useEffect, useMemo, useState } from 'react'
import { api, money, compact, tl, pct, scoreColor, scoreLabel, ROOM_OPTIONS, monthLabel } from '../api'
import { Histogram, LineChart } from '../components/Charts'
import { IconDownload, IconSearch, IconTrend, IconRadar } from '../components/Icons'

type Props = { onOpenListing: (id: number) => void; meta: any }

export default function Radar({ onOpenListing, meta }: Props) {
  const [filters, setFilters] = useState<any>({ dealType: 'satilik', district: '', minScore: 0, rooms: [], sort: 'score' })
  const [ov, setOv] = useState<any>(null)
  const [rows, setRows] = useState<any>({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  const query = useMemo(
    () => ({
      dealType: filters.dealType,
      district: filters.district || undefined,
      rooms: filters.rooms,
      minScore: filters.minScore || undefined,
      onlyDrops: filters.onlyDrops ? 1 : undefined,
      sort: filters.sort,
      dir: filters.sort === 'days' ? 'desc' : 'desc',
      q: q || undefined,
      pageSize: 40
    }),
    [filters, q]
  )

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([api.overview({ dealType: filters.dealType, district: filters.district || undefined }), api.listings(query)])
      .then(([o, l]) => {
        if (!alive) return
        setOv(o)
        setRows(l)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [query, filters.dealType, filters.district])

  const k = ov?.kpis
  const trend = ov?.trend || []

  const toggleRoom = (r: string) =>
    setFilters((f: any) => ({
      ...f,
      rooms: f.rooms.includes(r) ? f.rooms.filter((x: string) => x !== r) : [...f.rooms, r]
    }))

  return (
    <>
      {meta?.demo && (
        <div className="demo-banner">
          <IconRadar size={15} />
          <span>
            <b>Demo modu:</b> {meta?.counts?.listings} kurgusal ilan ile çalışıyorsunuz. Gerçek veri için Veri Merkezi →
            İçe Aktarma'dan CSV/XML yükleyin veya lisanslı portal feed'inizi bağlayın.
          </span>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi accent">
          <div className="kpi-label">Takip edilen ilan</div>
          <div className="kpi-value">{compact(k?.listings)}</div>
          <div className="kpi-foot">{k?.new_7d ? `son 7 günde ${k.new_7d} yeni` : '—'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Medyan m² fiyatı</div>
          <div className="kpi-value">{k?.median_m2 ? `${compact(k.median_m2)} ₺` : '—'}</div>
          <div className="kpi-foot">aktif portföy · {filters.dealType === 'satilik' ? 'satılık' : 'kiralık'}</div>
        </div>
        <div className="kpi amber">
          <div className="kpi-label">Fırsat (skor ≥ 70)</div>
          <div className="kpi-value">{k?.opportunities ?? '—'}</div>
          <div className="kpi-foot">portföyün %{k?.opportunity_rate ?? 0}'i</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Ortalama pazarda kalma</div>
          <div className="kpi-value">{k?.avg_days_on_market ?? '—'} <span style={{ fontSize: 13, color: 'var(--dim)' }}>gün</span></div>
          <div className="kpi-foot">uzun süre = pazarlık payı</div>
        </div>
        <div className="kpi violet">
          <div className="kpi-label">Fiyat düşen (7 gün)</div>
          <div className="kpi-value">{k?.drops_7d ?? '—'}</div>
          <div className="kpi-foot">satıcı esnekliği sinyali</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Portföy değeri</div>
          <div className="kpi-value">{compact(k?.total_value)} ₺</div>
          <div className="kpi-foot">satılık ilanlar toplamı</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="field">
          <label>Arama</label>
          <div className="row" style={{ gap: 6 }}>
            <IconSearch size={14} className="dim" />
            <input
              placeholder="İlçe, mahalle, başlık…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 190 }}
            />
          </div>
        </div>
        <div className="field">
          <label>İşlem</label>
          <select value={filters.dealType} onChange={(e) => setFilters({ ...filters, dealType: e.target.value })}>
            <option value="satilik">Satılık</option>
            <option value="kiralik">Kiralık</option>
          </select>
        </div>
        <div className="field">
          <label>İlçe</label>
          <select value={filters.district} onChange={(e) => setFilters({ ...filters, district: e.target.value })}>
            <option value="">Tüm İstanbul</option>
            {meta?.districts?.map((d: any) => (
              <option key={d.name} value={d.name}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Oda</label>
          <div className="chip-row">
            {ROOM_OPTIONS.map((r) => (
              <button
                key={r}
                className={`chip ${filters.rooms.includes(r) ? 'on' : ''}`}
                onClick={() => toggleRoom(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Min skor · {filters.minScore}</label>
          <input
            type="range"
            min={0}
            max={90}
            step={5}
            value={filters.minScore}
            onChange={(e) => setFilters({ ...filters, minScore: Number(e.target.value) })}
            style={{ width: 130, accentColor: '#2dd4bf' }}
          />
        </div>
        <div className="field">
          <label>Filtre</label>
          <button
            className={`chip ${filters.onlyDrops ? 'on' : ''}`}
            onClick={() => setFilters({ ...filters, onlyDrops: !filters.onlyDrops })}
          >
            sadece fiyatı düşenler
          </button>
        </div>
        <div className="field" style={{ marginLeft: 'auto' }}>
          <label>Dışa aktar</label>
          <a className="btn" href="/api/export/listings.csv">
            <IconDownload size={14} /> CSV
          </a>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <IconRadar size={15} />
            <div>
              <div className="panel-title">Fırsat radarı</div>
              <div className="panel-sub">{rows.total} ilan · skora göre sıralı</div>
            </div>
            <div className="panel-actions">
              <div className="seg">
                {[
                  ['score', 'Skor'],
                  ['undervalue', 'İskonto'],
                  ['days', 'Süre'],
                  ['ppm2', '₺/m²']
                ].map(([v, l]) => (
                  <button
                    key={v}
                    className={filters.sort === v ? 'on' : ''}
                    onClick={() => setFilters({ ...filters, sort: v })}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="panel-body tight">
            <div className="tbl-wrap" style={{ maxHeight: 560 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>İlan</th>
                    <th className="num">Fiyat</th>
                    <th className="num">₺/m²</th>
                    <th className="num">Fark</th>
                    <th className="num">Gün</th>
                    <th>Skor</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && !rows.items.length && (
                    <tr>
                      <td colSpan={6}>
                        <div className="loading-block"><span className="spinner" /> Veri yükleniyor…</div>
                      </td>
                    </tr>
                  )}
                  {rows.items.map((r: any) => (
                    <tr key={r.id} onClick={() => onOpenListing(r.id)}>
                      <td>
                        <div className="title-cell">
                          <span>{r.district} · {r.rooms}</span>
                          <small>
                            {r.m2_net} m² · {r.neighborhood || '—'} · {r.days_on_market} gün
                            {r.price_drops > 0 ? ` · ${r.price_drops} düşüş` : ''}
                          </small>
                        </div>
                      </td>
                      <td className="num">{compact(r.price)}</td>
                      <td className="num">{compact(r.price_per_m2)}</td>
                      <td className="num" style={{ color: r.undervalue_pct >= 0 ? 'var(--green)' : 'var(--danger)' }}>
                        {pct(r.undervalue_pct)}
                      </td>
                      <td className="num">{r.days_on_market}</td>
                      <td>
                        <div className="score">
                          <span style={{ color: scoreColor(r.score) }}>{r.score}</span>
                          <span className="score-bar">
                            <i style={{ width: `${r.score}%`, background: scoreColor(r.score) }} />
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && !rows.items.length && (
                    <tr>
                      <td colSpan={6}><div className="empty">Bu kriterlere uyan ilan yok. Filtreleri gevşetin.</div></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col">
          <div className="panel">
            <div className="panel-head">
              <IconTrend size={15} />
              <div>
                <div className="panel-title">İlçe fırsat sıralaması</div>
                <div className="panel-sub">skor ≥ 70 ilan sayısı</div>
              </div>
            </div>
            <div className="panel-body">
              <div className="bar-list">
                {(ov?.districtTable || []).slice(0, 8).map((d: any) => {
                  const max = Math.max(...(ov?.districtTable || []).map((x: any) => x.opportunities), 1)
                  return (
                    <div className="bar-row" key={d.district} onClick={() => setFilters({ ...filters, district: d.district })} style={{ cursor: 'pointer' }}>
                      <span className="name">{d.district}</span>
                      <span className="bar-track">
                        <i style={{ width: `${Math.max(4, (d.opportunities / max) * 100)}%` }} />
                      </span>
                      <span className="val">{d.opportunities}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <div className="panel-title">Fiyat düşüşleri</div>
                <div className="panel-sub">son gözlemlenen indirimler</div>
              </div>
            </div>
            <div className="panel-body">
              <div className="feed">
                {(ov?.recentDrops || []).slice(0, 6).map((d: any) => (
                  <div className="feed-item" key={d.id} onClick={() => onOpenListing(d.id)}>
                    <span className="feed-dot" style={{ background: scoreColor(d.score) }} />
                    <div className="feed-main">
                      <b>{d.district} · {d.title?.replace(/^[^ ]+ /, '')}</b>
                      <small>{tl(d.price)} ₺ · {d.days_on_market} gün · {d.price_drops} güncelleme</small>
                    </div>
                    <div className="feed-val neg">{pct(d.price_delta_pct)}</div>
                  </div>
                ))}
                {!ov?.recentDrops?.length && <div className="empty">Kayıt yok</div>}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <div className="panel-title">Skor dağılımı</div>
                <div className="panel-sub">portföy kalitesi</div>
              </div>
            </div>
            <div className="panel-body">
              <Histogram buckets={ov?.distribution || []} />
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="panel-title">Bölge fiyat endeksi · 13 ay</div>
            <div className="panel-sub">m² satış fiyatı (₺) ve aylık işlem hacmi</div>
          </div>
        </div>
        <div className="panel-body">
          <LineChart
            labels={trend.map((t: any) => monthLabel(t.month))}
            series={[
              { name: 'Satış m²', color: '#2dd4bf', values: trend.map((t: any) => t.sale_m2) },
              { name: 'Kira m²', color: '#a78bfa', values: trend.map((t: any) => t.rent_m2), area: false }
            ]}
            height={200}
            format={(v) => compact(v)}
          />
          <div className="chart-legend">
            <span><i style={{ background: '#2dd4bf' }} />satış ₺/m²</span>
            <span><i style={{ background: '#a78bfa' }} />kira ₺/m²</span>
            <span className="dim">· toplam hacim: {compact(trend.reduce((s: number, t: any) => s + (t.volume || 0), 0))} işlem/ay</span>
          </div>
        </div>
      </div>
    </>
  )
}
