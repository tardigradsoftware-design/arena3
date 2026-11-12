/**
 * Skorlama motoru.
 *
 * Her skor açıklanabilir: UI'da "Neden bu skor?" panelinde faktör katkıları gösterilir.
 * Hiçbir faktör kara kutu değildir; katsayılar burada tek yerde durur.
 */

export const WEIGHTS = {
  undervalue: 1.6, // piyasa m² fiyatının altında olma
  momentum: 0.55, // fiyat düşüşü / pazarlık payı
  liquidity: 0.16, // bölgenin satış hızı
  staleness: 0.35, // uzun süredir satılmıyorsa satıcı esnekliği
  location: 0.35, // ulaşım/yaşam yakınlığı
  risk: 1.0 // yaş, kat, aidat, deprem
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

export function haversineKm(a, b) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function daysBetween(a, b) {
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000))
}

/** Bölgeye en yakın ulaşım/yaşam odaklarını hesaplar. */
export function locationProfile(listing, pois) {
  const metroKinds = new Set(['metro', 'marmaray', 'metrobus'])
  let nearestTransport = null
  let nearestAny = null
  const counts = { hastane: 0, universite: 0, avm: 0, park: 0 }

  for (const p of pois) {
    if (listing.lat == null || p.lat == null) continue
    const d = haversineKm(listing, p)
    if (metroKinds.has(p.kind) && (!nearestTransport || d < nearestTransport.km)) {
      nearestTransport = { name: p.name, kind: p.kind, line: p.line, km: round2(d) }
    }
    if (!nearestAny || d < nearestAny.km) {
      nearestAny = { name: p.name, kind: p.kind, km: round2(d) }
    }
    if (counts[p.kind] !== undefined && d <= 2) counts[p.kind] += 1
  }
  const transportKm = nearestTransport?.km ?? 3
  const transportScore = clamp(100 - transportKm * 22, 0, 100)
  const amenityScore = clamp(
    counts.hastane * 8 + counts.universite * 7 + counts.avm * 6 + counts.park * 4,
    0,
    100
  )
  return {
    nearestTransport,
    nearestAny,
    counts,
    transportScore: Math.round(transportScore),
    amenityScore: Math.round(amenityScore),
    locationScore: Math.round(transportScore * 0.65 + amenityScore * 0.35)
  }
}

/**
 * Fırsat skoru (0-100) + faktör dökümü.
 * @param {object} listing
 * @param {{median_m2:number, sample_size:number}|null} benchmark
 * @param {object|null} district
 * @param {object|null} loc locationProfile
 */
export function scoreListing(listing, benchmark, district, loc) {
  const factors = []
  let score = 50

  const ppm2 = listing.price_per_m2 || (listing.m2_net ? listing.price / listing.m2_net : null)
  const median = benchmark?.median_m2 || null
  const undervaluePct = median && ppm2 ? ((median - ppm2) / median) * 100 : 0
  const benchmarkConfidence = clamp((benchmark?.sample_size || 0) / 12, 0.25, 1)

  if (median && ppm2) {
    const delta = clamp(undervaluePct, -35, 35) * WEIGHTS.undervalue * benchmarkConfidence
    score += delta
    factors.push({
      key: 'undervalue',
      label: 'Piyasa m² fiyatına göre konum',
      value: round1(undervaluePct),
      unit: '%',
      delta: round1(delta),
      hint:
        undervaluePct >= 0
          ? `Bölge medyanının %${round1(Math.abs(undervaluePct))} altında`
          : `Bölge medyanının %${round1(Math.abs(undervaluePct))} üstünde`,
      confidence: round1(benchmarkConfidence * 100)
    })
  }

  const dom = listing.days_on_market ?? 0
  const drops = listing.price_drops || 0
  const priceDelta = listing.price_delta_pct || 0
  const momentum = clamp(drops * 5 + Math.abs(priceDelta) * 0.9, 0, 26) * WEIGHTS.momentum
  if (drops > 0 || priceDelta < 0) {
    score += momentum
    factors.push({
      key: 'momentum',
      label: 'Fiyat hareketi',
      value: round1(priceDelta),
      unit: '%',
      delta: round1(momentum),
      hint: drops > 0 ? `${drops} kez fiyat güncellendi` : 'Fiyat düşüşü var'
    })
  }

  const heat = district?.heat ?? 50
  const liquidity = ((heat - 50) / 50) * 8 * WEIGHTS.liquidity * 4
  score += liquidity
  factors.push({
    key: 'liquidity',
    label: 'Bölge likiditesi',
    value: heat,
    unit: 'ısı',
    delta: round1(liquidity),
    hint: `Yıllık ${district?.sales_12m?.toLocaleString('tr-TR') || '—'} satış, ısı ${heat}/100`
  })

  const stale = dom > 45 ? clamp((dom - 45) / 3, 0, 22) * WEIGHTS.staleness : 0
  if (stale > 0) {
    score += stale
    factors.push({
      key: 'staleness',
      label: 'Pazarda bekleme süresi',
      value: dom,
      unit: 'gün',
      delta: round1(stale),
      hint: `${dom} gündür ilanda — satıcı esnekliği artıyor`
    })
  }

  if (loc) {
    const delta = ((loc.locationScore - 50) / 50) * 9 * WEIGHTS.location * 2
    score += delta
    factors.push({
      key: 'location',
      label: 'Ulaşım & yaşam yakınlığı',
      value: loc.locationScore,
      unit: '/100',
      delta: round1(delta),
      hint: loc.nearestTransport
        ? `En yakın ulaşım: ${loc.nearestTransport.name} (${loc.nearestTransport.km} km)`
        : 'Yakın ulaşım verisi yok'
    })
  }

  let riskPoints = 0
  const riskNotes = []
  if ((listing.building_age ?? 0) >= 40) {
    riskPoints += 9
    riskNotes.push('bina yaşı ≥ 40')
  } else if ((listing.building_age ?? 0) >= 25) {
    riskPoints += 4
    riskNotes.push('bina yaşı ≥ 25')
  }
  if (listing.floor === 0) {
    riskPoints += 6
    riskNotes.push('zemin/bodrum kat')
  }
  if (listing.dues && listing.price && listing.dues * 12 > listing.price * 0.012) {
    riskPoints += 5
    riskNotes.push('aidat/gelir oranı yüksek')
  }
  if (listing.m2_net && listing.m2_gross && listing.m2_net / listing.m2_gross < 0.78) {
    riskPoints += 3
    riskNotes.push('net/brüt verim düşük')
  }
  if (district && ['Çatalca', 'Silivri', 'Şile', 'Arnavutköy'].includes(district.name)) {
    riskPoints += 2
    riskNotes.push('çeper bölge likidite riski')
  }
  const riskDelta = -riskPoints * WEIGHTS.risk
  score += riskDelta
  factors.push({
    key: 'risk',
    label: 'Risk düzeltmesi',
    value: riskPoints,
    unit: 'puan',
    delta: round1(riskDelta),
    hint: riskNotes.length ? riskNotes.join(', ') : 'Belirgin risk faktörü yok'
  })

  const freshness = dom <= 7 ? 4 : dom <= 21 ? 2 : 0
  if (freshness) {
    score += freshness
    factors.push({
      key: 'freshness',
      label: 'Yeni ilan avantajı',
      value: dom,
      unit: 'gün',
      delta: freshness,
      hint: 'Portala yeni düştü, rekabet henüz düşük'
    })
  }

  const finalScore = Math.round(clamp(score, 1, 99))
  return {
    score: finalScore,
    tier: finalScore >= 80 ? 'yuksek' : finalScore >= 65 ? 'iyi' : finalScore >= 50 ? 'normal' : 'zayif',
    undervalue_pct: round1(undervaluePct),
    factors
  }
}

export function riskProfile(listing) {
  const flags = []
  if ((listing.building_age ?? 0) >= 40) flags.push({ level: 'yuksek', text: 'Bina yaşı 40+ — deprem performansı ve yenileme maliyeti' })
  else if ((listing.building_age ?? 0) >= 25) flags.push({ level: 'orta', text: 'Bina yaşı 25+ — teknik inceleme önerilir' })
  if (listing.floor === 0) flags.push({ level: 'orta', text: 'Zemin/bodrum kat — yeniden satış likiditesi düşük' })
  if (listing.dues && listing.price && listing.dues * 12 > listing.price * 0.012)
    flags.push({ level: 'orta', text: 'Aidatın fiyata oranı yüksek — kiralama getirisini baskılar' })
  if (listing.m2_net && listing.m2_gross && listing.m2_net / listing.m2_gross < 0.78)
    flags.push({ level: 'dusuk', text: 'Net/brüt alan verimi düşük' })
  return flags
}

export function round1(v) {
  return Math.round(v * 10) / 10
}
export function round2(v) {
  return Math.round(v * 100) / 100
}
