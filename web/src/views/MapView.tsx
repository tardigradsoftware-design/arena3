import React, { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { api, compact, tl, scoreColor, haversine } from '../api'

const PRICE_STOPS = [
  { max: 40000, color: '#22c55e', label: '< 40 B ₺/m²' },
  { max: 55000, color: '#84cc16', label: '40–55 B' },
  { max: 75000, color: '#f5a524', label: '55–75 B' },
  { max: 100000, color: '#f97316', label: '75–100 B' },
  { max: Infinity, color: '#f4506b', label: '> 100 B' }
]
const priceColor = (v: number) => PRICE_STOPS.find((s) => v < s.max)?.color || '#f4506b'

export default function MapView({
  onOpenListing,
  onDistrict
}: {
  onOpenListing: (id: number) => void
  onDistrict: (name: string) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layers = useRef<{ districts: L.LayerGroup; listings: L.LayerGroup; pois: L.LayerGroup; radius: L.LayerGroup } | null>(null)
  const dataRef = useRef<any>(null)
  const [data, setData] = useState<any>(null)
  const [dealType, setDealType] = useState<'satilik' | 'kiralik'>('satilik')
  const [minScore, setMinScore] = useState(0)
  const [showPois, setShowPois] = useState(true)
  const [radiusMode, setRadiusMode] = useState(false)
  const [radiusKm, setRadiusKm] = useState(2)
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    api.geo().then(setData).catch(() => setData({ districts: [], listings: [], pois: [] }))
  }, [])

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, {
      center: [41.02, 28.97],
      zoom: 11,
      zoomControl: true,
      preferCanvas: true,
      attributionControl: true
    })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap katkıcıları &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(m)
    layers.current = {
      districts: L.layerGroup().addTo(m),
      listings: L.layerGroup().addTo(m),
      pois: L.layerGroup().addTo(m),
      radius: L.layerGroup().addTo(m)
    }
    m.on('click', (e: L.LeafletMouseEvent) => {
      setCenter({ lat: e.latlng.lat, lng: e.latlng.lng })
      setRadiusMode(false)
    })
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    if (!data || !layers.current) return
    const L2 = layers.current

    L2.districts.clearLayers()
    L2.listings.clearLayers()
    L2.pois.clearLayers()

    for (const d of data.districts) {
      if (d.lat == null) continue
      const color = priceColor(d.median_m2 || 0)
      const circle = L.circleMarker([d.lat, d.lng], {
        radius: 6 + Math.min(20, d.count / 1.4),
        color,
        weight: 1.4,
        fillColor: color,
        fillOpacity: 0.22
      })
      circle.bindTooltip(
        `<div class="map-tip"><b>${d.district}</b><br/>${d.count} ilan · ${tl(d.median_m2)} ₺/m²<br/>fırsat: ${d.opportunities} · ısı ${d.heat}</div>`,
        { direction: 'top' }
      )
      circle.on('click', (e) => {
        L.DomEvent.stopPropagation(e as any)
        onDistrict(d.district)
      })
      circle.addTo(L2.districts)
    }

    const inRadius = (l: any) => !center || haversine(center, l) <= radiusKm
    for (const l of data.listings) {
      if (l.deal_type !== dealType) continue
      if ((l.score || 0) < minScore) continue
      if (!inRadius(l)) continue
      const mk = L.circleMarker([l.lat, l.lng], {
        radius: 4.6,
        color: scoreColor(l.score),
        weight: 1,
        fillColor: scoreColor(l.score),
        fillOpacity: 0.85
      })
      mk.bindTooltip(
        `<div class="map-tip"><b>${l.title}</b><br/>${tl(l.price)} ₺ · ${tl(l.price_per_m2)} ₺/m²<br/>skor ${l.score}</div>`,
        { direction: 'top' }
      )
      mk.on('click', (e) => {
        L.DomEvent.stopPropagation(e as any)
        onOpenListing(l.id)
      })
      mk.addTo(L2.listings)
    }

    if (showPois) {
      for (const p of data.pois) {
        L.circleMarker([p.lat, p.lng], {
          radius: 3.4,
          color: '#8ea4bf',
          weight: 1,
          fillColor: '#8ea4bf',
          fillOpacity: 0.5
        })
          .bindTooltip(`${p.name}${p.line ? ' · ' + p.line : ''} (${p.kind})`, { direction: 'top' })
          .addTo(L2.pois)
      }
    }
  }, [data, dealType, minScore, showPois, center, radiusKm, onDistrict, onOpenListing])

  useEffect(() => {
    if (!layers.current) return
    layers.current.radius.clearLayers()
    if (center) {
      L.circleMarker([center.lat, center.lng], { radius: 4, color: '#2dd4bf', fillColor: '#2dd4bf', fillOpacity: 1 }).addTo(
        layers.current.radius
      )
      L.circle([center.lat, center.lng], {
        radius: radiusKm * 1000,
        color: '#2dd4bf',
        weight: 1.2,
        dashArray: '5 5',
        fillColor: '#2dd4bf',
        fillOpacity: 0.06
      }).addTo(layers.current.radius)
    }
  }, [center, radiusKm])

  const visible = (data?.listings || []).filter(
    (l: any) =>
      l.deal_type === dealType &&
      (l.score || 0) >= minScore &&
      (!center || haversine(center, l) <= radiusKm)
  )
  const median =
    visible.length > 0
      ? [...visible].sort((a: any, b: any) => a.price_per_m2 - b.price_per_m2)[Math.floor(visible.length / 2)].price_per_m2
      : null

  return (
    <>
      <div className="toolbar">
        <div className="field">
          <label>İşlem tipi</label>
          <div className="seg">
            <button className={dealType === 'satilik' ? 'on' : ''} onClick={() => setDealType('satilik')}>Satılık</button>
            <button className={dealType === 'kiralik' ? 'on' : ''} onClick={() => setDealType('kiralik')}>Kiralık</button>
          </div>
        </div>
        <div className="field">
          <label>Min skor · {minScore}</label>
          <input type="range" min={0} max={90} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} style={{ width: 130, accentColor: '#2dd4bf' }} />
        </div>
        <div className="field">
          <label>Yarıçap analizi</label>
          <div className="row">
            <button className={`chip ${radiusMode ? 'on' : ''}`} onClick={() => setRadiusMode((v) => !v)}>
              {radiusMode ? 'Haritaya tıklayın…' : 'Merkez seç'}
            </button>
            <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))}>
              {[0.5, 1, 2, 3, 5, 8].map((r) => (
                <option key={r} value={r}>{r} km</option>
              ))}
            </select>
            {center && (
              <button className="btn sm ghost" onClick={() => setCenter(null)}>temizle</button>
            )}
          </div>
        </div>
        <div className="field">
          <label>Katman</label>
          <button className={`chip ${showPois ? 'on' : ''}`} onClick={() => setShowPois((v) => !v)}>
            ulaşım & yaşam noktaları
          </button>
        </div>
        <div className="field" style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <label>Görünür portföy</label>
          <div className="mono" style={{ fontSize: 13 }}>
            {visible.length} ilan · medyan {median ? compact(median) : '—'} ₺/m²
          </div>
        </div>
      </div>

      <div className="map-shell">
        <div ref={el} className="map-canvas" />
        <div className="map-legend">
          <div className="legend-row"><b style={{ color: 'var(--text)' }}>Daire = ilçe</b></div>
          <div className="legend-row">boyut: ilan sayısı · renk: medyan ₺/m²</div>
          {PRICE_STOPS.map((s) => (
            <div className="legend-row" key={s.label}>
              <span className="legend-swatch" style={{ background: s.color }} /> {s.label}
            </div>
          ))}
          <div className="legend-row" style={{ marginTop: 4 }}>
            <span className="legend-swatch" style={{ background: '#22c55e' }} /> ilan noktası rengi = fırsat skoru
          </div>
        </div>
      </div>
    </>
  )
}
