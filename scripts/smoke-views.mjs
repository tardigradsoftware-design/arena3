/**
 * Tüm görünümleri gezen duman testi (harita hariç — jsdom'da layout yok).
 * Kullanım: node scripts/smoke-views.mjs
 */
import { JSDOM, VirtualConsole } from 'jsdom'
import { build } from 'esbuild'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:3000'
const root = path.resolve(import.meta.dirname, '..')

const result = await build({
  stdin: {
    contents: `import React from 'react'
      import { createRoot } from 'react-dom/client'
      import App from './web/src/App'
      createRoot(document.getElementById('root')).render(React.createElement(App))`,
    resolveDir: root,
    loader: 'tsx'
  },
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'silent'
})

const errors = []
const vc = new VirtualConsole()
vc.on('jsdomError', (e) => errors.push(String(e.message || e)))
vc.on('error', (...a) => errors.push(a.map(String).join(' ')))

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: BASE + '/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc
})
const w = dom.window
w.fetch = (input, init) => fetch(typeof input === 'string' ? new URL(input, BASE).toString() : input, init)
w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
w.eval(result.outputFiles[0].text)

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
await wait(2500)

const clickNav = (label) => {
  const btn = [...w.document.querySelectorAll('.nav-item')].find((b) => b.textContent.includes(label))
  if (!btn) throw new Error(`nav bulunamadı: ${label}`)
  btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
}

const views = [
  ['Bölge Analizi', ['Medyan satış ₺/m²', 'İlçe karşılaştırma tablosu']],
  ['Portföy Yetkileri', ['Münhasır payı', 'Portföy yetkileri', 'Neden bu modül yasal']],
  ['Uyarı Kuralları', ['Uyarı kuralları', 'Eşleşmeler']],
  ['Veri Merkezi', ['İlan verisi yükle', 'Son yüklemeler']],
  ['Metodoloji', ['Fırsat skoru nasıl hesaplanır?', 'Veri politikası']]
]

let failed = 0
for (const [label, needles] of views) {
  try {
    clickNav(label)
  } catch (e) {
    console.log(`✕ ${label}: ${e.message}`)
    failed++
    continue
  }
  await wait(1400)
  const text = w.document.body.textContent || ''
  const missing = needles.filter((n) => !text.includes(n))
  console.log(`${missing.length ? '✕' : '✓'} ${label}${missing.length ? ' — eksik: ' + missing.join(', ') : ''}`)
  if (missing.length) failed++
}

// Veri merkezi sekmeleri
try {
  const tabs = [...w.document.querySelectorAll('.seg button')]
  for (const name of ['Kaynaklar & Bağlayıcılar', 'KVKK & Adaylar', 'Denetim Kaydı']) {
    const t = tabs.find((b) => b.textContent.includes(name))
    if (t) {
      t.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
      await wait(900)
      const txt = w.document.body.textContent || ''
      const ok = name.includes('Kaynaklar')
        ? txt.includes('Yasal veri yolu')
        : name.includes('KVKK')
        ? txt.includes('Uyum kontrol listesi')
        : txt.includes('Denetim kaydı')
      console.log(`${ok ? '✓' : '✕'} sekme: ${name}`)
      if (!ok) failed++
    }
  }
} catch (e) {
  console.log('✕ sekmeler:', e.message)
  failed++
}

if (errors.length) {
  console.log('\nJS hataları:')
  for (const e of errors.slice(0, 8)) console.log('  -', e.slice(0, 300))
  failed++
}

process.exit(failed ? 1 : 0)
