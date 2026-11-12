import React, { useEffect, useState } from 'react'
import { api, money, tl, compact, dateShort, tl as fmt } from '../api'
import { IconPlus, IconShield, IconHome, IconUsers } from '../components/Icons'

const TYPE_LABEL: Record<string, string> = {
  munhasir: 'Münhasır',
  yari_munhasir: 'Yarı münhasır',
  acik: 'Açık'
}
const TYPE_TAG: Record<string, string> = { munhasir: 'green', yari_munhasir: 'teal', acik: 'slate' }

export default function Mandates({ meta, onDataChanged }: { meta: any; onDataChanged: () => void }) {
  const [rows, setRows] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [status, setStatus] = useState('aktif')
  const [expiring, setExpiring] = useState(false)
  const [q, setQ] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Record<number, string>>({})
  const [form, setForm] = useState<any>({
    owner_name: '',
    phone: '',
    district: '',
    neighborhood: '',
    mandate_type: 'munhasir',
    commission_pct: 2,
    starts_at: new Date().toISOString().slice(0, 10),
    ends_at: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
    doc_ref: '',
    notes: ''
  })

  const load = () => {
    api.mandates({ status: status || undefined, expiring: expiring ? 30 : undefined, q: q || undefined }).then(setRows).catch(() => {})
    api.mandateSummary().then(setSummary).catch(() => {})
  }
  useEffect(load, [status, expiring, q])

  const save = async () => {
    setMsg(null)
    try {
      await api.createMandate({
        ...form,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        commission_pct: Number(form.commission_pct)
      })
      setMsg('Yetki kaydı oluşturuldu.')
      setFormOpen(false)
      setForm({ ...form, owner_name: '', phone: '', doc_ref: '', notes: '' })
      load()
      onDataChanged()
    } catch (e: any) {
      setMsg(`Hata: ${e.message}`)
    }
  }

  const reveal = async (id: number) => {
    const reason = window.prompt('Görüntüleme gerekçesi (denetim kaydına yazılır):', 'Satıcı ile yetki görüşmesi')
    if (!reason) return
    try {
      const r = await api.revealMandate(id, reason)
      setRevealed((s) => ({ ...s, [id]: r.phone || r.email || '—' }))
    } catch (e: any) {
      window.alert(e.message)
    }
  }

  const close = async (id: number) => {
    await api.updateMandate(id, { status: 'doldu' })
    load()
    onDataChanged()
  }

  const erase = async (id: number) => {
    if (!window.confirm('KVKK silme talebi: kişisel alanlar anonimleştirilecek. Onaylıyor musunuz?')) return
    await api.deleteMandate(id)
    load()
    onDataChanged()
  }

  return (
    <>
      <div className="kpi-grid">
        <div className="kpi accent">
          <div className="kpi-label">Aktif yetki</div>
          <div className="kpi-value">{summary?.active ?? '—'}</div>
          <div className="kpi-foot">toplam {summary?.total ?? 0} kayıt</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Münhasır payı</div>
          <div className="kpi-value">{summary?.exclusive_share ?? 0}%</div>
          <div className="kpi-foot">{summary?.exclusive ?? 0} münhasır portföy</div>
        </div>
        <div className="kpi amber">
          <div className="kpi-label">30 günde bitecek</div>
          <div className="kpi-value">{summary?.expiring_30 ?? 0}</div>
          <div className="kpi-foot">{summary?.expired ? `${summary.expired} süresi geçmiş` : 'yenileme fırsatı'}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Ortalama komisyon</div>
          <div className="kpi-value">{summary?.avg_commission != null ? `${summary.avg_commission}%` : '—'}</div>
          <div className="kpi-foot">satış bedeli üzerinden</div>
        </div>
        <div className="kpi violet">
          <div className="kpi-label">Aktif portföy değeri</div>
          <div className="kpi-value">{compact(summary?.portfolio_value)} ₺</div>
          <div className="kpi-foot">ilana bağlı yetkiler</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="field">
          <label>Durum</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="aktif">Aktif</option>
            <option value="doldu">Tamamlandı</option>
            <option value="">Tümü</option>
          </select>
        </div>
        <div className="field">
          <label>Filtre</label>
          <button className={`chip ${expiring ? 'on' : ''}`} onClick={() => setExpiring((v) => !v)}>
            süresi 30 gün içinde bitecekler
          </button>
        </div>
        <div className="field grow">
          <label>Ara</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Satıcı adı, ilçe…" />
        </div>
        <div className="field" style={{ marginLeft: 'auto' }}>
          <label>Yeni kayıt</label>
          <button className="btn primary" onClick={() => setFormOpen((v) => !v)}>
            <IconPlus size={14} /> Yetki ekle
          </button>
        </div>
      </div>

      {msg && <div className={`notice ${msg.startsWith('Hata') ? 'err' : 'ok'}`}>{msg}</div>}

      {formOpen && (
        <div className="panel">
          <div className="panel-head">
            <IconHome size={15} />
            <div>
              <div className="panel-title">Yeni portföy yetkisi</div>
              <div className="panel-sub">sözleşme dayanağı zorunlu · KVKK m.5/2-c</div>
            </div>
          </div>
          <div className="panel-body">
            <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
              <div className="field grow"><label>Satıcı ad soyad *</label><input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} /></div>
              <div className="field"><label>Telefon</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="05xx…" /></div>
              <div className="field">
                <label>İlçe</label>
                <select value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })}>
                  <option value="">Seçiniz</option>
                  {meta?.districts?.map((d: any) => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Mahalle</label><input value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} /></div>
              <div className="field">
                <label>Yetki tipi *</label>
                <select value={form.mandate_type} onChange={(e) => setForm({ ...form, mandate_type: e.target.value })}>
                  <option value="munhasir">Münhasır</option>
                  <option value="yari_munhasir">Yarı münhasır</option>
                  <option value="acik">Açık</option>
                </select>
              </div>
              <div className="field"><label>Komisyon %</label><input type="number" step="0.5" style={{ width: 90 }} value={form.commission_pct} onChange={(e) => setForm({ ...form, commission_pct: e.target.value })} /></div>
              <div className="field"><label>Başlangıç *</label><input type="date" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></div>
              <div className="field"><label>Bitiş *</label><input type="date" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></div>
              <div className="field"><label>Sözleşme no{form.mandate_type === 'munhasir' ? ' *' : ''}</label><input value={form.doc_ref} onChange={(e) => setForm({ ...form, doc_ref: e.target.value })} placeholder="YTK-2026-001" /></div>
              <button className="btn primary" onClick={save} disabled={!form.owner_name}>Kaydet</button>
            </div>
            <div className="notice mt12">
              Kayıt, satıcı ile imzalanan yetki sözleşmesine dayanır. Telefon maskeli saklanır, açma işlemi denetim
              kaydına yazılır. <b>Portallardan toplanan kişisel veriler bu modüle aktarılamaz.</b>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <IconUsers size={15} />
          <div>
            <div className="panel-title">Portföy yetkileri</div>
            <div className="panel-sub">{rows.length} kayıt · bitişe göre sıralı</div>
          </div>
        </div>
        <div className="panel-body tight">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Satıcı</th>
                  <th>Bölge</th>
                  <th>Yetki</th>
                  <th className="num">Komisyon</th>
                  <th className="num">Fiyat</th>
                  <th>Süre</th>
                  <th>Telefon</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const dl = r.days_left
                  const color = dl == null ? 'var(--dim)' : dl < 0 ? 'var(--danger)' : dl <= 30 ? 'var(--amber)' : 'var(--muted)'
                  return (
                    <tr key={r.id} style={{ cursor: 'default' }}>
                      <td>
                        <div className="title-cell">
                          <span>{r.owner_name}{r.demo ? <span className="tag amber" style={{ marginLeft: 6 }}>demo</span> : null}</span>
                          <small>{r.doc_ref || 'belge no yok'}</small>
                        </div>
                      </td>
                      <td>{r.district || '—'}{r.neighborhood ? <div className="tiny dim">{r.neighborhood}</div> : null}</td>
                      <td><span className={`tag ${TYPE_TAG[r.mandate_type] || 'slate'}`}>{TYPE_LABEL[r.mandate_type] || r.mandate_type}</span></td>
                      <td className="num">{r.commission_pct != null ? `${r.commission_pct}%` : '—'}</td>
                      <td className="num">{r.price ? compact(r.price) : '—'}</td>
                      <td>
                        <div style={{ color }}>
                          {dateShort(r.ends_at)}
                          <div className="tiny" style={{ color }}>
                            {dl == null ? '—' : dl < 0 ? `${Math.abs(dl)} gün geçti` : `${dl} gün kaldı`}
                          </div>
                        </div>
                      </td>
                      <td className="mono tiny">{revealed[r.id] || r.phone || '—'}</td>
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                          <button className="btn sm ghost" onClick={() => reveal(r.id)}>Göster</button>
                          <button className="btn sm ghost" onClick={() => close(r.id)}>Kapat</button>
                          <button className="btn sm ghost danger" onClick={() => erase(r.id)}>Sil</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!rows.length && (
                  <tr><td colSpan={8}><div className="empty">Bu filtrede kayıt yok. “Yetki ekle” ile başlayın.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <IconShield size={15} />
            <div>
              <div className="panel-title">Neden bu modül yasal, telefon listesi değil?</div>
              <div className="panel-sub">ticari ve hukuki gerekçe</div>
            </div>
          </div>
          <div className="panel-body">
            <div className="factor-row">
              <div className="factor-label">Dayanak: imzalı yetki sözleşmesi<small>KVKK m.5/2-c — sözleşmenin kurulması/ifası için zorunlu veri</small></div>
              <div className="factor-delta pos">✓</div>
            </div>
            <div className="factor-row">
              <div className="factor-label">Veri minimizasyonu<small>yalnızca ad, telefon, bölge — TCK no/adres defteri yok</small></div>
              <div className="factor-delta pos">✓</div>
            </div>
            <div className="factor-row">
              <div className="factor-label">Ticari karşılığı<small>münhasır yetki = komisyon hakkı + rakip dışlama</small></div>
              <div className="factor-delta pos">✓</div>
            </div>
            <div className="factor-row">
              <div className="factor-label">Portaldan kopyalanan veri<small>kaynak sözleşmesine aykırı, bu modüle kabul edilmez</small></div>
              <div className="factor-delta neg">✕</div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Süre bitiş takvimi</div>
              <div className="panel-sub">yenileme görüşmesi planlamak için</div>
            </div>
          </div>
          <div className="panel-body">
            <div className="bar-list">
              {rows
                .filter((r) => r.status === 'aktif')
                .sort((a, b) => (a.days_left ?? 999) - (b.days_left ?? 999))
                .slice(0, 8)
                .map((r) => {
                  const dl = r.days_left ?? 0
                  const pctv = Math.max(3, Math.min(100, ((dl + 30) / 210) * 100))
                  const c = dl < 0 ? '#f4506b' : dl <= 30 ? '#f5a524' : '#2dd4bf'
                  return (
                    <div className="bar-row" key={r.id} style={{ gridTemplateColumns: '120px 1fr 62px' }}>
                      <span className="name">{r.owner_name}</span>
                      <span className="bar-track"><i style={{ width: `${pctv}%`, background: c }} /></span>
                      <span className="val" style={{ color: c }}>{dl < 0 ? `${Math.abs(dl)}g geçti` : `${dl} gün`}</span>
                    </div>
                  )
                })}
              {!rows.filter((r) => r.status === 'aktif').length && <div className="empty">Aktif yetki yok</div>}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
