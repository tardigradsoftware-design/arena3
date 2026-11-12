import React, { useEffect, useMemo, useState } from 'react'
import { api, money, tl, compact, pct, scoreColor, monthLabel } from '../api'
import { LineChart } from '../components/Charts'
import { IconHome } from '../components/Icons'

export default function DistrictView({
  district,
  setDistrict,
  meta,
  onOpenListing
}: {
  district: string
  setDistrict: (d: string) => void
  meta: any
  onOpenListing: (id: number) => void
}) {
  const [data, setData] = useState<any>(null)
  const [compare, setCompare] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState('opportunities')

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([api.district(district), api.compare()])
      .then(([d, c]) => {
        if (!alive) return
        setData(d)
        setCompare(c.rows || [])
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [district])

  const sortedCompare = useMemo(
    () => [...compare].sort((a: any, b: any) => (b[sortKey] || 0) - (a[sortKey] || 0)),
    [compare, sortKey]
  )

  const k = data?.kpis
  const idx = data?.index || []

  return (
    <>
      <div className="toolbar">
        <div className="field grow">
          <label>İlçe</label>
          <select value={district} onChange={(e) => setDistrict(e.target.value)}>
            {meta?.districts?.map((d: any) => (
              <option key={d.name} value={d.name}>{d.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Yaka</label>
          <div className="mono" style={{ padding: '7px 0' }}>{data?.district?.side || '—'}</div>
        </div>
        <div className="field">
          <label>Nüfus</label>
          <div className="mono" style={{ padding: '7px 0' }}>{compact(data?.district?.population)}</div>
        </div>
        <div className="field">
          <label>Yıllık satış (referans)</label>
          <div className="mono" style={{ padding: '7px 0' }}>{tl(data?.district?.sales_12m)}</div>
        </div>
        <div className="field" style={{ marginLeft: 'auto' }}>
          <label>Isı endeksi</label>
          <div className="row">
            <div className="bar-track" style={{ width: 120 }}>
              <i style={{ width: `${data?.district?.heat || 0}%`, background: 'linear-gradient(90deg,#f5a524,#f4506b)' }} />
            </div>
            <span className="mono tiny">{data?.district?.heat ?? '—'}/100</span>
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div className="panel"><div className="loading-block"><span className="spinner" /> Bölge analizi hazırlanıyor…</div></div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi accent">
              <div className="kpi-label">Medyan satış ₺/m²</div>
              <div className="kpi-value">{compact(k?.median_m2_sale)} ₺</div>
              <div className="kpi-foot">bölge referansı {compact(data?.district?.benchmark_sale_m2)} ₺</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Medyan kira ₺/m²</div>
              <div className="kpi-value">{compact(k?.median_m2_rent)} ₺</div>
              <div className="kpi-foot">aylık</div>
            </div>
            <div className="kpi violet">
              <div className="kpi-label">Brüt getiri</div>
              <div className="kpi-value">{k?.gross_yield != null ? `${k.gross_yield}%` : '—'}</div>
              <div className="kpi-foot">yıllık kira / satış fiyatı</div>
            </div>
            <div className="kpi amber">
              <div className="kpi-label">Fırsat sayısı</div>
              <div className="kpi-value">{k?.opportunities ?? 0}</div>
              <div className="kpi-foot">{k?.listings} ilan içinde</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Ort. pazarda kalma</div>
              <div className="kpi-value">{k?.avg_days ?? '—'}<span style={{ fontSize: 13, color: 'var(--dim)' }}> gün</span></div>
              <div className="kpi-foot">{k?.drops} ilanda fiyat düşüşü</div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <IconHome size={15} />
              <div>
                <div className="panel-title">{district} · fiyat endeksi</div>
                <div className="panel-sub">son 18 ay · ₺/m² ve aylık işlem hacmi</div>
              </div>
            </div>
            <div className="panel-body">
              <LineChart
                labels={idx.map((i: any) => monthLabel(i.month))}
                series={[
                  { name: 'Satış', color: '#2dd4bf', values: idx.map((i: any) => i.sale_m2) },
                  { name: 'Kira', color: '#a78bfa', values: idx.map((i: any) => i.rent_m2), area: false }
                ]}
                height={210}
                format={(v) => compact(v)}
              />
              <div className="chart-legend">
                <span><i style={{ background: '#2dd4bf' }} />satış ₺/m²</span>
                <span><i style={{ background: '#a78bfa' }} />kira ₺/m²</span>
                <span className="dim">
                  · son ay hacim {tl(idx[idx.length - 1]?.volume)} işlem ·
                  12 aylık değişim {idx.length > 13 && idx[idx.length - 13]?.sale_m2 ? pct(((idx[idx.length - 1].sale_m2 - idx[idx.length - 13].sale_m2) / idx[idx.length - 13].sale_m2) * 100) : '—'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <div className="panel-title">Oda tipine göre fiyat</div>
                  <div className="panel-sub">medyan ₺/m² ve medyan talep fiyatı</div>
                </div>
              </div>
              <div className="panel-body tight">
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr><th>Tip</th><th className="num">İlan</th><th className="num">Medyan ₺/m²</th><th className="num">Medyan fiyat</th></tr>
                    </thead>
                    <tbody>
                      {(data?.roomTable || []).map((r: any) => (
                        <tr key={r.rooms} style={{ cursor: 'default' }}>
                          <td><span className="tag slate">{r.rooms}</span></td>
                          <td className="num">{r.count}</td>
                          <td className="num">{tl(r.median_m2)}</td>
                          <td className="num">{compact(r.median_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <div>
                  <div className="panel-title">En yüksek fırsatlar</div>
                  <div className="panel-sub">{district} içinde skora göre</div>
                </div>
              </div>
              <div className="panel-body">
                <div className="feed">
                  {(data?.top || []).slice(0, 6).map((t: any) => (
                    <div className="feed-item" key={t.id} onClick={() => onOpenListing(t.id)}>
                      <span className="feed-dot" style={{ background: scoreColor(t.score) }} />
                      <div className="feed-main">
                        <b>{t.rooms} · {t.m2_net} m²</b>
                        <small>{money(t.price)} · {tl(t.price_per_m2)} ₺/m² · {pct(t.undervalue_pct)}</small>
                      </div>
                      <div className="feed-val" style={{ color: scoreColor(t.score), fontWeight: 700 }}>{t.score}</div>
                    </div>
                  ))}
                  {!data?.top?.length && <div className="empty">Kayıt yok</div>}
                </div>
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <div className="panel-title">Mahalle kırılımı</div>
                  <div className="panel-sub">{district} · takip edilen ilanlar</div>
                </div>
              </div>
              <div className="panel-body tight">
                <div className="tbl-wrap" style={{ maxHeight: 320 }}>
                  <table className="tbl">
                    <thead>
                      <tr><th>Mahalle</th><th className="num">İlan</th><th className="num">Medyan ₺/m²</th><th className="num">Fırsat</th></tr>
                    </thead>
                    <tbody>
                      {(data?.neighborhoods || []).map((n: any) => (
                        <tr key={n.neighborhood} style={{ cursor: 'default' }}>
                          <td>{n.neighborhood}</td>
                          <td className="num">{n.count}</td>
                          <td className="num">{tl(n.median_m2)}</td>
                          <td className="num">{n.opportunities}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <div>
                  <div className="panel-title">Bölge nitelikleri</div>
                  <div className="panel-sub">3 km içindeki odaklar</div>
                </div>
              </div>
              <div className="panel-body">
                <div className="pill-row">
                  {Object.entries(data?.poiCounts || {}).map(([k2, v]) => (
                    <span key={k2} className="tag slate">{k2}: {String(v)}</span>
                  ))}
                  {!Object.keys(data?.poiCounts || {}).length && <span className="dim tiny">Yakın odak verisi yok</span>}
                </div>
                <div className="notice mt12">
                  Nitelik verisi OpenStreetMap / İBB açık veri bağlayıcısı ile zenginleştirilir. Şu anda yerel referans
                  seti kullanılıyor.
                </div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <div className="panel-title">İlçe karşılaştırma tablosu</div>
                <div className="panel-sub">tüm İstanbul · sütuna göre sırala</div>
              </div>
            </div>
            <div className="panel-body tight">
              <div className="tbl-wrap" style={{ maxHeight: 460 }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      {[
                        ['district', 'İlçe'],
                        ['median_m2_sale', 'Satış ₺/m²'],
                        ['median_m2_rent', 'Kira ₺/m²'],
                        ['gross_yield', 'Brüt getiri'],
                        ['listings', 'İlan'],
                        ['opportunities', 'Fırsat'],
                        ['avg_days', 'Ort. gün'],
                        ['heat', 'Isı']
                      ].map(([k2, label]) => (
                        <th
                          key={k2}
                          className={`${k2 === 'district' ? '' : 'num'} sortable`}
                          onClick={() => setSortKey(k2)}
                          style={{ color: sortKey === k2 ? 'var(--accent)' : undefined }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCompare.map((r: any) => (
                      <tr
                        key={r.district}
                        onClick={() => setDistrict(r.district)}
                        className={r.district === district ? 'selected' : ''}
                      >
                        <td>{r.district}</td>
                        <td className="num">{tl(r.median_m2_sale)}</td>
                        <td className="num">{tl(r.median_m2_rent)}</td>
                        <td className="num">{r.gross_yield != null ? `${r.gross_yield}%` : '—'}</td>
                        <td className="num">{r.listings}</td>
                        <td className="num" style={{ color: r.opportunities ? 'var(--accent)' : undefined }}>{r.opportunities}</td>
                        <td className="num">{r.avg_days}</td>
                        <td className="num">{r.heat}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
