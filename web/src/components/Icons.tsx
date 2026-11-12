import React from 'react'

type P = { size?: number; className?: string }
const S = ({ size = 18, className, children }: P & { children: React.ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
)

export const IconRadar = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" opacity=".35" />
    <circle cx="12" cy="12" r="5" opacity=".55" />
    <path d="M12 12 19 6" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </S>
)
export const IconMap = (p: P) => (
  <S {...p}>
    <path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3Z" />
    <path d="M9 3v15M15 6v15" />
  </S>
)
export const IconChart = (p: P) => (
  <S {...p}>
    <path d="M4 20V4M4 20h16" />
    <path d="M8 16v-5M12.5 16V7M17 16v-8" />
  </S>
)
export const IconDatabase = (p: P) => (
  <S {...p}>
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
    <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
  </S>
)
export const IconBell = (p: P) => (
  <S {...p}>
    <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
    <path d="M10.5 20a2 2 0 0 0 3 0" />
  </S>
)
export const IconShield = (p: P) => (
  <S {...p}>
    <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </S>
)
export const IconSearch = (p: P) => (
  <S {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </S>
)
export const IconDownload = (p: P) => (
  <S {...p}>
    <path d="M12 3v12M7 11l5 5 5-5" />
    <path d="M4 20h16" />
  </S>
)
export const IconPlay = (p: P) => (
  <S {...p}>
    <path d="M7 4.5v15l13-7.5-13-7.5Z" />
  </S>
)
export const IconX = (p: P) => (
  <S {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </S>
)
export const IconPlus = (p: P) => (
  <S {...p}>
    <path d="M12 5v14M5 12h14" />
  </S>
)
export const IconArrow = (p: P) => (
  <S {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </S>
)
export const IconHome = (p: P) => (
  <S {...p}>
    <path d="m4 11 8-7 8 7" />
    <path d="M6 10v10h12V10" />
    <path d="M10 20v-6h4v6" />
  </S>
)
export const IconPin = (p: P) => (
  <S {...p}>
    <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
    <circle cx="12" cy="10" r="2.6" />
  </S>
)
export const IconTrend = (p: P) => (
  <S {...p}>
    <path d="m3 17 5-6 4 3 5-7" />
    <path d="M17 7h4v4" />
  </S>
)
export const IconMenu = (p: P) => (
  <S {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </S>
)
export const IconUsers = (p: P) => (
  <S {...p}>
    <circle cx="9" cy="8" r="3.4" />
    <path d="M3 20c0-3.3 2.7-5.4 6-5.4s6 2.1 6 5.4" />
    <path d="M16 11a3 3 0 1 0 0-6" />
    <path d="M18 20c0-2.4-.9-4-2.4-5" />
  </S>
)
