/**
 * Duman testi: React ağını jsdom içinde çalıştırır.
 * Amaç: arayüzün hatasız render olduğunu ve ana blokların geldiğini doğrulamak.
 * Kullanım: node scripts/smoke.mjs   (sunucu 3000 portunda çalışıyor olmalı)
 */
import { JSDOM, VirtualConsole } from 'jsdom'
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:3000'
const root = path.resolve(import.meta.dirname, '..')

const result = await build({
  stdin: {
    contents: `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import App from './web/src/App'
      createRoot(document.getElementById('root')).render(React.createElement(App))
    `,
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
const code = result.outputFiles[0].text

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
w.fetch = (input, init) => {
  const url = typeof input === 'string' ? new URL(input, BASE).toString() : input
  return fetch(url, init)
}
w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })

try {
  w.eval(code)
} catch (e) {
  errors.push(String(e.stack || e))
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
await wait(3000)

const text = w.document.body.textContent || ''
const checks = [
  ['marka', 'BölgeRadar'],
  ['radar başlığı', 'Fırsat Radarı'],
  ['KPI', 'Medyan m² fiyatı'],
  ['tablo', 'Fırsat radarı'],
  ['ilçe sıralaması', 'İlçe fırsat sıralaması'],
  ['grafik', 'Bölge fiyat endeksi'],
  ['demo uyarısı', 'Demo modu']
]

let failed = 0
for (const [name, needle] of checks) {
  const ok = text.includes(needle)
  console.log(`${ok ? '✓' : '✕'} ${name}`)
  if (!ok) failed++
}

const rows = w.document.querySelectorAll('table.tbl tbody tr').length
console.log(`• render edilen tablo satırı: ${rows}`)
if (rows < 5) failed++

const kpi = w.document.querySelectorAll('.kpi').length
console.log(`• KPI kartı: ${kpi}`)
if (kpi < 5) failed++

if (errors.length) {
  console.log('\nJS hataları:')
  for (const e of errors.slice(0, 8)) console.log('  -', e.slice(0, 400))
  failed++
}

fs.writeFileSync(path.join(root, '.smoke-dom.html'), w.document.body.innerHTML)
process.exit(failed ? 1 : 0)
