import React, { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import Radar from './views/Radar'
import MapView from './views/MapView'
import DistrictView from './views/DistrictView'
import DataCenter from './views/DataCenter'
import Alerts from './views/Alerts'
import ListingDrawer from './components/ListingDrawer'
import {
  IconRadar,
  IconMap,
  IconChart,
  IconDatabase,
  IconBell,
  IconShield,
  IconDownload,
  IconMenu,
  IconPlay,
  IconTrend
} from './components/Icons'

type View = 'radar' | 'map' | 'district' | 'data' | 'alerts' | 'method'

const TITLES: Record<View, { title: string; sub: string }> = {
  radar: { title: 'Fırsat Radarı', sub: 'İstanbul · skorlanmış portföy ve fiyat anomalileri' },
  map: { title: 'Konum Haritası', sub: 'bölge yoğunluğu, fiyat seviyesi ve yarıçap analizi' },
  district: { title: 'Bölge Analizi', sub: 'ilçe bazında fiyat, getiri, likidite ve karşılaştırma' },
  data: { title: 'Veri Merkezi', sub: 'içe aktarma, açık veri bağlayıcıları ve KVKK kayıtları' },
  alerts: { title: 'Uyarı Kuralları', sub: 'kriter tutan ilanlar otomatik listelenir' },
  method: { title: 'Metodoloji & Uyum', sub: 'skor formülü, veri kaynakları ve yasal çerçeve' }
}

export default function App() {
  const [view, setView] = useState<View>('radar')
  const [district, setDistrict] = useState('Kadıköy')
  const [meta, setMeta] = useState<any>(null)
  const [drawer, setDrawer] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const loadMeta = useCallback(() => {
    api.meta().then(setMeta).catch(() => {})
  }, [])

  useEffect(() => {
    loadMeta()
  }, [loadMeta])

  const openListing = useCallback((id: number) => setDrawer(id), [])
  const goDistrict = useCallback((name: string) => {
    setDistrict(name)
    setView('district')
    setMenuOpen(false)
  }, [])

  const nav: { key: View; label: string; icon: any; count?: number }[] = [
    { key: 'radar', label: 'Fırsat Radarı', icon: IconRadar, count: meta?.counts?.active },
    { key: 'map', label: 'Konum Haritası', icon: IconMap },
    { key: 'district', label: 'Bölge Analizi', icon: IconChart },
    { key: 'alerts', label: 'Uyarı Kuralları', icon: IconBell, count: meta?.counts?.alerts },
    { key: 'data', label: 'Veri Merkezi', icon: IconDatabase },
    { key: 'method', label: 'Metodoloji & Uyum', icon: IconShield }
  ]

  return (
    <div className="app">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <div className="brand-name">BölgeRadar</div>
            <div className="brand-sub">emlak istihbarat</div>
          </div>
        </div>

        <nav className="nav">
          <div className="nav-label">Platform</div>
          {nav.map((n) => {
            const Icon = n.icon
            return (
              <button
                key={n.key}
                className={`nav-item ${view === n.key ? 'active' : ''}`}
                onClick={() => {
                  setView(n.key)
                  setMenuOpen(false)
                }}
              >
                <Icon />
                <span>{n.label}</span>
                {n.count != null && <span className="count">{n.count}</span>}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="status-card">
            <div className="status-row">
              <span className={`tag ${meta?.demo ? 'amber' : 'green'}`}>{meta?.demo ? 'DEMO VERİ' : 'CANLI'}</span>
            </div>
            <div className="status-row"><span>İlan</span><b style={{ marginLeft: 'auto' }}>{meta?.counts?.listings ?? '—'}</b></div>
            <div className="status-row"><span>İlçe</span><b style={{ marginLeft: 'auto' }}>{meta?.counts?.districts ?? '—'}</b></div>
            <div className="status-row"><span>Aday kaydı</span><b style={{ marginLeft: 'auto' }}>{meta?.counts?.leads ?? 0}</b></div>
          </div>
          <div className="tiny dim" style={{ padding: '0 4px' }}>
            v0.1 · KVKK uyumlu veri modeli
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="btn ghost sm menu-btn" onClick={() => setMenuOpen((v) => !v)}>
            <IconMenu size={16} />
          </button>
          <div>
            <h1>{TITLES[view].title}</h1>
            <div className="sub">{TITLES[view].sub}</div>
          </div>
          <div className="topbar-actions">
            <button className="btn ghost sm" onClick={loadMeta} title="Veriyi yenile">
              <IconTrend size={14} /> Yenile
            </button>
            <a className="btn sm" href="/api/export/listings.csv">
              <IconDownload size={14} /> CSV
            </a>
            <button className="btn primary sm" onClick={() => setView('data')}>
              <IconPlay size={13} /> Veri yükle
            </button>
          </div>
        </header>

        <div className="content">
          {view === 'radar' && <Radar onOpenListing={openListing} meta={meta} />}
          {view === 'map' && <MapView onOpenListing={openListing} onDistrict={goDistrict} />}
          {view === 'district' && (
            <DistrictView district={district} setDistrict={setDistrict} meta={meta} onOpenListing={openListing} />
          )}
          {view === 'alerts' && <Alerts meta={meta} onOpenListing={openListing} />}
          {view === 'data' && <DataCenter meta={meta} onDataChanged={loadMeta} />}
          {view === 'method' && <Methodology />}
        </div>
      </main>

      {drawer != null && (
        <ListingDrawer id={drawer} onClose={() => setDrawer(null)} onOpenListing={(id) => setDrawer(id)} />
      )}
    </div>
  )
}

function Methodology() {
  return (
    <>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Fırsat skoru nasıl hesaplanır?</div>
              <div className="panel-sub">açıklanabilir, ağırlıkları tek yerde tanımlı</div>
            </div>
          </div>
          <div className="panel-body">
            <p className="muted" style={{ lineHeight: 1.7, fontSize: 12.5 }}>
              Skor 50 taban puanla başlar; her faktör katkısını şeffaf biçimde ekler. İlan detayındaki
              <b> “Neden bu skor?”</b> panelinde katkılar tek tek görünür.
            </p>
            <div className="tbl-wrap mt12">
              <table className="tbl">
                <thead>
                  <tr><th>Faktör</th><th className="num">Ağırlık</th><th>Mantık</th></tr>
                </thead>
                <tbody>
                  {[
                    ['Piyasa m² fiyatına göre konum', '1,6 × örneklem güveni', 'İlçe + oda tipi medyan ₺/m² ile karşılaştırma; ±%35 sınırlı'],
                    ['Fiyat hareketi', '0,55', 'Fiyat düşüş sayısı ve toplam indirim oranı'],
                    ['Bölge likiditesi', '0,64', 'İlçe satış hacmi ve ısı endeksi'],
                    ['Pazarda kalma süresi', '0,35', '45 günü aşan ilanlarda satıcı esnekliği artışı'],
                    ['Ulaşım & yaşam yakınlığı', '0,70', 'En yakın metro/metrobüs + 2 km içindeki odaklar'],
                    ['Risk düzeltmesi', '−1,0 / puan', 'Bina yaşı, kat, aidat oranı, net/brüt verim'],
                    ['Yenilik avantajı', '+4', 'Son 7 günde yayına giren ilanlar']
                  ].map((r) => (
                    <tr key={r[0]} style={{ cursor: 'default' }}>
                      <td>{r[0]}</td>
                      <td className="num">{r[1]}</td>
                      <td className="dim tiny">{r[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="notice mt12">
              Eşikler: <b>≥80</b> yüksek fırsat · <b>65–79</b> iyi · <b>50–64</b> normal · <b>&lt;50</b> zayıf.
              Skor bir yatırım tavsiyesi değildir; yerinde ekspertiz ve tapu/kadastro kontrolü gereklidir.
            </div>
          </div>
        </div>

        <div className="col">
          <div className="panel">
            <div className="panel-head">
              <div>
                <div className="panel-title">Veri politikası</div>
                <div className="panel-sub">ne var, ne yok</div>
              </div>
            </div>
            <div className="panel-body">
              <div className="factor-row">
                <div className="factor-label">İlan verisi<span><small>fiyat, m², oda, konum, pazarda kalma</small></span></div>
                <div className="factor-delta pos">✓</div>
              </div>
              <div className="factor-row">
                <div className="factor-label">Bölge istatistikleri<span><small>İBB, TÜİK, OSM türevleri</small></span></div>
                <div className="factor-delta pos">✓</div>
              </div>
              <div className="factor-row">
                <div className="factor-label">Kişisel iletişim verisi toplu çekimi<span><small>portallardan telefon/adres kazıma</small></span></div>
                <div className="factor-delta neg">✕</div>
              </div>
              <div className="factor-row">
                <div className="factor-label">Kendi adaylarınız<span><small>hukuki dayanak + rıza kaydı ile</small></span></div>
                <div className="factor-delta pos">✓</div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <div className="panel-title">Yasal çerçeve</div>
                <div className="panel-sub">özet</div>
              </div>
            </div>
            <div className="panel-body">
              <ul className="muted tiny" style={{ lineHeight: 1.9, paddingLeft: 18, margin: 0 }}>
                <li>KVKK m.5 — işleme şartı; m.10 — aydınlatma; m.11 — ilgili kişi hakları.</li>
                <li>Portalların kullanım şartları botla veri toplamayı yasaklar; lisanslı feed kullanın.</li>
                <li>İlan fotoğrafları ve metinleri telif hakkına tabidir.</li>
                <li>OSM verisi ODbL lisansı altındadır, atıf gerektirir.</li>
                <li>Tapu kayıtları yalnızca malik veya yetkili tarafından sorgulanabilir.</li>
              </ul>
              <div className="notice warn mt12">
                Bu doküman teknik bir uyum özetidir, hukuki görüş değildir.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
