import React, { useEffect, useMemo, useState } from 'react'
import { api, dateTime, tl } from '../api'
import { IconDatabase, IconDownload, IconPlay, IconShield, IconUsers, IconPlus } from '../components/Icons'

const STATUS_STYLE: Record<string, string> = {
  aktif: 'green',
  hazir: 'teal',
  beklemede: 'slate',
  yapilandirilmadi: 'amber',
  manuel: 'violet',
  hata: 'rose',
  cevrimdisi: 'slate'
}

export default function DataCenter({ meta, onDataChanged }: { meta: any; onDataChanged: () => void }) {
  const [tab, setTab] = useState<'import' | 'sources' | 'compliance' | 'audit'>('import')
  const [csv, setCsv] = useState('')
  const [fileName, setFileName] = useState('ice-aktarma.csv')
  const [preview, setPreview] = useState<any>(null)
  const [result, setResult] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [syncMsg, setSyncMsg] = useState<Record<string, string>>({})
  const [leads, setLeads] = useState<any[]>([])
  const [audit, setAudit] = useState<any[]>([])
  const [revealed, setRevealed] = useState<Record<number, string>>({})

  useEffect(() => {
    if (tab === 'compliance') api.leads().then(setLeads).catch(() => {})
    if (tab === 'audit') api.audit().then(setAudit).catch(() => {})
  }, [tab, result])

  const readFile = (f: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setCsv(String(reader.result || ''))
      setFileName(f.name)
      setPreview(null)
      setResult(null)
    }
    reader.readAsText(f, 'utf-8')
  }

  const doPreview = async () => {
    setBusy(true)
    setResult(null)
    try {
      setPreview(await api.previewImport(csv))
    } catch (e: any) {
      setResult({ ok: false, error: e.message })
    } finally {
      setBusy(false)
    }
  }

  const doImport = async () => {
    setBusy(true)
    setResult(null)
    try {
      const r = await api.importCsv(csv, 'csv-import', fileName)
      setResult(r)
      onDataChanged()
    } catch (e: any) {
      setResult({ ok: false, error: e.message })
    } finally {
      setBusy(false)
    }
  }

  const doXml = async (xml: string, name: string) => {
    setBusy(true)
    setResult(null)
    try {
      const r = await api.importXml(xml, name)
      setResult(r)
      onDataChanged()
    } catch (e: any) {
      setResult({ ok: false, error: e.message })
    } finally {
      setBusy(false)
    }
  }

  const sync = async (key: string) => {
    setSyncMsg((m) => ({ ...m, [key]: '…' }))
    try {
      const r = await api.sync(key)
      setSyncMsg((m) => ({ ...m, [key]: r.ok ? `✓ ${r.message || 'Tamam'}` : `✕ ${r.error}` }))
      onDataChanged()
    } catch (e: any) {
      setSyncMsg((m) => ({ ...m, [key]: `✕ ${e.message}` }))
    }
  }

  const reveal = async (id: number) => {
    const reason = window.prompt('Görüntüleme gerekçesi (denetim kaydına yazılır):', 'Müşteri aradı, portföy görüşmesi')
    if (!reason) return
    try {
      const r = await api.revealLead(id, reason)
      setRevealed((s) => ({ ...s, [id]: r.phone || r.email || '—' }))
      if (tab === 'audit') api.audit().then(setAudit)
    } catch (e: any) {
      window.alert(e.message)
    }
  }

  const erase = async (id: number) => {
    if (!window.confirm('KVKK silme talebi uygulanacak. Kişisel alanlar anonimleştirilecek. Onaylıyor musunuz?')) return
    await api.deleteLead(id)
    setLeads(await api.leads())
  }

  const sample = async () => {
    const text = await api.sampleCsv()
    setCsv(text)
    setFileName('ornek-sablon.csv')
    setPreview(null)
    setResult(null)
  }

  const fieldChips = useMemo(() => {
    if (!preview) return []
    return (preview.header as string[]).map((h, i) => ({ header: h, field: preview.fields?.[i] }))
  }, [preview])

  return (
    <>
      <div className="toolbar">
        <div className="seg">
          {[
            ['import', 'İçe Aktarma'],
            ['sources', 'Kaynaklar & Bağlayıcılar'],
            ['compliance', 'KVKK & Adaylar'],
            ['audit', 'Denetim Kaydı']
          ].map(([v, l]) => (
            <button key={v} className={tab === v ? 'on' : ''} onClick={() => setTab(v as any)}>
              {l}
            </button>
          ))}
        </div>
        <div className="field" style={{ marginLeft: 'auto' }}>
          <label>Portföy</label>
          <div className="mono tiny" style={{ padding: '7px 0' }}>
            {meta?.counts?.listings} ilan · {meta?.counts?.active} aktif · {meta?.counts?.pois} nokta
          </div>
        </div>
      </div>

      {tab === 'import' && (
        <div className="grid-2">
          <div className="panel">
            <div className="panel-head">
              <IconDatabase size={15} />
              <div>
                <div className="panel-title">İlan verisi yükle</div>
                <div className="panel-sub">CSV / TSV / Excel kopyala-yapıştır · noktalı virgül, virgül veya sekme</div>
              </div>
            </div>
            <div className="panel-body">
              <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
                <label className="btn">
                  Dosya seç
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt"
                    style={{ display: 'none' }}
                    onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
                  />
                </label>
                <button className="btn ghost" onClick={sample}>
                  <IconDownload size={14} /> Örnek şablon
                </button>
                <span className="tiny dim">{fileName}</span>
              </div>
              <div className="field">
                <label>CSV içeriği</label>
                <textarea
                  value={csv}
                  onChange={(e) => {
                    setCsv(e.target.value)
                    setPreview(null)
                  }}
                  rows={9}
                  placeholder="ilan_no;ilce;mahalle;islem_tipi;oda;net_m2;fiyat;lat;lng"
                  style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 11.5 }}
                />
              </div>
              <div className="row mt12" style={{ gap: 8 }}>
                <button className="btn" onClick={doPreview} disabled={!csv || busy}>
                  Önizle & eşle
                </button>
                <button className="btn primary" onClick={doImport} disabled={!csv || busy}>
                  <IconPlay size={14} /> İçe aktar
                </button>
                {busy && <span className="spinner" />}
              </div>

              <div className="notice mt12">
                <b>Veri kaynağı politikası:</b> Portal feed'leriniz (lisanslı), kendi CRM export'larınız veya elle
                tuttuğunuz liste. Kişisel iletişim alanları bu yüklemede <i>kabul edilmez</i>; adaylar KVKK sekmesinde
                hukuki dayanakla ayrı kaydedilir.
              </div>

              <div className="mt12">
                <div className="section-title">XML feed (lisanslı portal)</div>
                <label className="btn">
                  XML dosyası yükle
                  <input
                    type="file"
                    accept=".xml"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      const r = new FileReader()
                      r.onload = () => doXml(String(r.result || ''), f.name)
                      r.readAsText(f, 'utf-8')
                    }}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="col">
            {preview && (
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <div className="panel-title">Kolon eşlemesi</div>
                    <div className="panel-sub">{preview.total} satır · ayırıcı “{preview.delimiter === '\t' ? 'sekme' : preview.delimiter}”</div>
                  </div>
                </div>
                <div className="panel-body">
                  <div className="pill-row">
                    {fieldChips.map((c: any, i: number) => (
                      <span key={i} className={`tag ${c.field ? 'teal' : 'slate'}`}>
                        {c.header} → {c.field || 'eşlenmedi'}
                      </span>
                    ))}
                  </div>
                  <div className="tbl-wrap mt12" style={{ maxHeight: 200 }}>
                    <table className="tbl">
                      <thead>
                        <tr>{preview.header.map((h: string) => <th key={h}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((r: string[], i: number) => (
                          <tr key={i} style={{ cursor: 'default' }}>
                            {r.map((c, j) => <td key={j}>{c}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {result && (
              <div className={`notice ${result.ok ? 'ok' : 'err'}`}>
                {result.ok ? (
                  <>
                    <b>İçe aktarma tamam.</b> {result.imported} yeni, {result.updated} güncelleme, {result.skipped} atlandı.
                    {result.unknownColumns?.length ? (
                      <div className="tiny mt8">Tanınmayan kolonlar: {result.unknownColumns.join(', ')}</div>
                    ) : null}
                    {result.errors?.length ? <div className="tiny mt8">Hatalar: {result.errors.join(' · ')}</div> : null}
                  </>
                ) : (
                  <>{result.error}</>
                )}
              </div>
            )}

            <div className="panel">
              <div className="panel-head">
                <div>
                  <div className="panel-title">Son yüklemeler</div>
                  <div className="panel-sub">denetlenebilir içe aktarma geçmişi</div>
                </div>
              </div>
              <div className="panel-body tight">
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr><th>Dosya</th><th>Kaynak</th><th className="num">Satır</th><th>Tarih</th></tr>
                    </thead>
                    <tbody>
                      {(meta?.imports || []).map((i: any) => (
                        <tr key={i.id} style={{ cursor: 'default' }}>
                          <td>{i.file_name}</td>
                          <td><span className="tag slate">{i.source_key}</span></td>
                          <td className="num">{i.rows_imported}/{i.rows_total}</td>
                          <td className="dim tiny">{dateTime(i.created_at)}</td>
                        </tr>
                      ))}
                      {!meta?.imports?.length && (
                        <tr><td colSpan={4}><div className="empty">Henüz içe aktarma yok</div></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <IconDownload size={15} />
                <div>
                  <div className="panel-title">Dışa aktarma</div>
                  <div className="panel-sub">skorlar ve benchmark dahil</div>
                </div>
              </div>
              <div className="panel-body">
                <a className="btn" href="/api/export/listings.csv">
                  <IconDownload size={14} /> Tüm portföyü CSV indir
                </a>
                <p className="tiny dim mt8">
                  Çıktı: ilçe, oda, m², fiyat, ₺/m², bölge medyanı, iskonto, skor, pazarda kalma süresi.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'sources' && (
        <>
          <div className="notice warn">
            Canlı bağlayıcılar dış internet erişimi gerektirir. Bu ortamda kapalıysa nazik hata döner; uygulama demo
            veriyle çalışmaya devam eder. Kendi sunucunuzda bağlayıcılar gerçek veriyi çeker.
          </div>
          <div className="grid-3">
            {(meta?.sources || []).map((s: any) => (
              <div className="src-card" key={s.key}>
                <div className="src-head">
                  <span className={`tag ${STATUS_STYLE[s.status] || 'slate'}`}>{s.status}</span>
                  <b>{s.name}</b>
                </div>
                <div className="src-note">{s.note}</div>
                <div className="src-foot">
                  <span className="mono">{s.record_count ?? 0} kayıt</span>
                  {s.last_sync && <span>· {dateTime(s.last_sync)}</span>}
                  <div style={{ marginLeft: 'auto' }}>
                    {['ibb-open-data', 'osm', 'tuik'].includes(s.key) && (
                      <button className="btn sm" onClick={() => sync(s.key)}>Senkronize et</button>
                    )}
                  </div>
                </div>
                {syncMsg[s.key] && <div className="tiny" style={{ color: syncMsg[s.key].startsWith('✓') ? 'var(--green)' : 'var(--danger)' }}>{syncMsg[s.key]}</div>}
              </div>
            ))}
          </div>
          <div className="panel">
            <div className="panel-head">
              <div>
                <div className="panel-title">Yasal veri yolu</div>
                <div className="panel-sub">hangi veri nereden gelir</div>
              </div>
            </div>
            <div className="panel-body tight">
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>Veri</th><th>Kaynak</th><th>Yöntem</th><th>Not</th></tr>
                  </thead>
                  <tbody>
                    {[
                      ['İlanlar (fiyat, m², konum)', 'Portal XML/API feed', 'Lisanslı kurumsal hesap', 'Portalların resmî veri transferi'],
                      ['Kendi portföyünüz', 'CRM / Excel', 'CSV içe aktarma', 'En yüksek veri kalitesi'],
                      ['Bölge nüfusu, satış hacmi', 'İBB Açık Veri / TÜİK', 'CKAN API + manuel', 'Kamuya açık istatistik'],
                      ['Ulaşım, okul, hastane', 'OpenStreetMap', 'Overpass API', 'ODbL lisansı, atıf gerekir'],
                      ['Aday iletişim bilgisi', 'Kendi form/CRM', 'Açık rıza / sözleşme', 'KVKK m.5 dayanak zorunlu']
                    ].map((r) => (
                      <tr key={r[0]} style={{ cursor: 'default' }}>
                        <td>{r[0]}</td>
                        <td>{r[1]}</td>
                        <td><span className="tag slate">{r[2]}</span></td>
                        <td className="dim tiny">{r[3]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'compliance' && (
        <div className="grid-2">
          <div className="panel">
            <div className="panel-head">
              <IconUsers size={15} />
              <div>
                <div className="panel-title">Adaylar / portföy kişileri</div>
                <div className="panel-sub">telefon maskeli · görüntüleme denetim kaydına yazılır</div>
              </div>
            </div>
            <div className="panel-body tight">
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>Ad</th><th>Rol</th><th>Dayanak</th><th>Telefon</th><th></th></tr>
                  </thead>
                  <tbody>
                    {leads.map((l: any) => (
                      <tr key={l.id} style={{ cursor: 'default' }}>
                        <td>
                          <div className="title-cell">
                            <span>{l.full_name}</span>
                            <small>{l.district || '—'} · {l.created_at ? dateTime(l.created_at) : ''}</small>
                          </div>
                        </td>
                        <td><span className="tag slate">{l.role}</span></td>
                        <td>
                          <span className={`tag ${l.lawful_basis === 'acik_riza' ? 'teal' : 'slate'}`}>{l.lawful_basis}</span>
                          {l.consent_ref && <div className="tiny dim mono">{l.consent_ref}</div>}
                        </td>
                        <td className="mono tiny">{revealed[l.id] || l.phone || '—'}</td>
                        <td>
                          <div className="row" style={{ gap: 4 }}>
                            <button className="btn sm ghost" onClick={() => reveal(l.id)}>Göster</button>
                            <button className="btn sm ghost danger" onClick={() => erase(l.id)}>Sil</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!leads.length && (
                      <tr><td colSpan={5}><div className="empty">Kayıtlı aday yok. İlan detayından “Aday ekle” ile başlayın.</div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="col">
            <div className="panel">
              <div className="panel-head">
                <IconShield size={15} />
                <div>
                  <div className="panel-title">Uyum kontrol listesi</div>
                  <div className="panel-sub">KVKK 6698 · emlak verisi</div>
                </div>
              </div>
              <div className="panel-body">
                {[
                  ['Veri sorumlusu kaydı (VERBİS) kontrol edildi', 'Şirket unvanı ve iletişim bilgisi aydınlatma metninde yer almalı.'],
                  ['Her aday için hukuki dayanak kayıtlı', 'Platform, dayanak olmadan kayıt kabul etmez (m.5).'],
                  ['Açık rızada rıza kaydı referansı', 'Rıza metni sürümü, tarih ve kanal saklanır.'],
                  ['Saklama süresi tanımlı', 'Varsayılan 24 ay; süre sonunda silinir/anonimleştirilir.'],
                  ['Silme hakkı uygulanabilir', 'Sil işlemi kişisel alanları anonimleştirir ve denetim kaydına yazar.'],
                  ['Portallardan toplu kişisel veri çekilmez', 'Yalnızca ilan verisi; iletişim bilgisi kendi kanalınızdan.']
                ].map(([t, d]) => (
                  <div key={t} className="factor-row">
                    <div className="factor-label">
                      <span style={{ color: 'var(--green)' }}>✓</span> {t}
                      <small>{d}</small>
                    </div>
                    <div className="factor-delta neu">otomatik</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="notice">
              <b>Önemli:</b> Kişisel verilerin işlenmesine ilişkin nihai hukuki değerlendirme için bir KVKK
              danışmanından görüş alın. Bu ekran, teknik kontrolleri görünür kılar; hukuki görüş yerine geçmez.
            </div>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Denetim kaydı</div>
              <div className="panel-sub">son 100 işlem · kim, ne, ne zaman</div>
            </div>
            <div className="panel-actions">
              <button className="btn sm ghost" onClick={() => api.audit().then(setAudit)}>Yenile</button>
            </div>
          </div>
          <div className="panel-body tight">
            <div className="tbl-wrap" style={{ maxHeight: 560 }}>
              <table className="tbl">
                <thead>
                  <tr><th>Tarih</th><th>Aktör</th><th>İşlem</th><th>Varlık</th><th>Detay</th></tr>
                </thead>
                <tbody>
                  {audit.map((a: any) => (
                    <tr key={a.id} style={{ cursor: 'default' }}>
                      <td className="dim tiny">{dateTime(a.created_at)}</td>
                      <td>{a.actor}</td>
                      <td><span className={`tag ${a.action === 'erase' ? 'rose' : a.action === 'reveal' ? 'amber' : 'slate'}`}>{a.action}</span></td>
                      <td className="mono tiny">{a.entity}{a.entity_id ? `#${a.entity_id}` : ''}</td>
                      <td className="dim tiny" style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.meta}</td>
                    </tr>
                  ))}
                  {!audit.length && <tr><td colSpan={5}><div className="empty">Kayıt yok</div></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
