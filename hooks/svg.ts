// The desktop band: two glowing pill bars, drawn as one SVG.
//
// All motion is SMIL inside the SVG (the fill growing, a light that flows
// through the fill, the shimmer while working, the 80% pulse), so the browser
// animates it and the mod never redraws per frame. The markup depends only on
// its inputs: a redraw for another reason doesn't restart the animations.
//
// The background is transparent, so the bars sit in the band itself, and the
// text and track colors follow the light or dark appearance.

import { gradientStops } from './bar'

export type SvgMeter = {
  label: string
  /** Percent now, and the percent the fill grows from (equal: no growth). */
  percent: number
  from: number
  /** "3h 27m", or "" when the window has no reset time. */
  reset: string
}

const PAD_Y = 4
const ROW = 24
const BAR_H = 8
const LABEL_W = 64 // px kept for "Session" / "Weekly"
const RIGHT_W = 128 // px kept for the percentage and the reset time
const RESET_W = 72 // px of RIGHT_W that the reset time takes
const FLOW_PERIOD = 40 // px between two bands of the flowing light
const HOT_PERCENT = 80
const FONT = '-apple-system, BlinkMacSystemFont, system-ui, sans-serif'

/** The drawing's height in pixels for this many rows. */
export const svgHeight = (rows: number) => PAD_Y * 2 + ROW * rows

// The fill eases from its last width with a soft deceleration.
const grow = (from: number, to: number) =>
  from === to
    ? ''
    : `<animate attributeName="width" from="${from}" to="${to}" dur="0.9s" ` +
      `calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1" fill="freeze"/>`

const row = (m: SvgMeter, i: number, width: number, color: string, isWorking: boolean) => {
  const barW = width - LABEL_W - RIGHT_W
  const fillOf = (p: number) => (p <= 0 ? 0 : Math.max(BAR_H, (barW * Math.min(100, p)) / 100))
  const w = fillOf(m.percent)
  const from = fillOf(m.from)
  const y = PAD_Y + ROW * i + ROW / 2
  const isHot = m.percent >= HOT_PERCENT
  const pill = (attrs: string, inner = '') =>
    `<rect x="${LABEL_W}" y="${-BAR_H / 2}" width="${w}" height="${BAR_H}" rx="${BAR_H / 2}" ${attrs}>` +
    `${grow(from, w)}${inner}</rect>`

  // The glow flares when a new value arrives, and breathes past 80%:
  // a few beats when idle, steadily while working.
  const glowBase = isHot ? 0.75 : 0.4
  const glowAnim = isHot
    ? `<animate attributeName="opacity" values="0.3;0.95;0.3" dur="1.2s" repeatCount="${isWorking ? 'indefinite' : 4}"/>`
    : from !== w
      ? `<animate attributeName="opacity" values="0.95;${glowBase}" dur="1.4s" fill="freeze"/>`
      : ''

  // Light flowing through the fill: slow when idle, quicker while working.
  const flow = `<rect x="${LABEL_W}" y="${-BAR_H / 2}" width="${barW}" height="${BAR_H}" fill="url(#flow${isWorking ? 'Fast' : ''})" clip-path="url(#fill${i})"/>`
  const shimmer = isWorking
    ? `<rect x="0" y="${-BAR_H / 2}" width="48" height="${BAR_H}" fill="url(#sheen)" clip-path="url(#fill${i})">` +
      `<animate attributeName="x" from="${LABEL_W - 48}" to="${LABEL_W + barW}" dur="1.6s" repeatCount="indefinite"/></rect>`
    : ''

  return (
    `<g transform="translate(0 ${y})">` +
    `<text x="0" class="label">${m.label}</text>` +
    `<rect x="${LABEL_W}" y="${-BAR_H / 2}" width="${barW}" height="${BAR_H}" rx="${BAR_H / 2}" class="track"/>` +
    (w > 0
      ? `<clipPath id="fill${i}">${pill('')}</clipPath>` +
        pill(`fill="url(#fill)" filter="url(#glow)" opacity="${glowBase}"`, glowAnim) +
        pill('fill="url(#fill)"') +
        flow +
        shimmer
      : '') +
    `<text x="${width - RESET_W - 10}" class="pct" fill="${color}" text-anchor="end">${Math.round(m.percent)}%</text>` +
    (m.reset === '' ? '' : `<text x="${width - RESET_W}" class="reset">↻ ${m.reset}</text>`) +
    `</g>`
  )
}

// A repeating band of light, slid one period along and around forever.
const flowGradient = (id: string, dur: string, peak: number) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" x2="${FLOW_PERIOD}" y1="0" y2="0" spreadMethod="repeat">` +
  `<stop offset="0" stop-color="#fff" stop-opacity="0"/>` +
  `<stop offset="0.5" stop-color="#fff" stop-opacity="${peak}"/>` +
  `<stop offset="1" stop-color="#fff" stop-opacity="0"/>` +
  `<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="${FLOW_PERIOD} 0" dur="${dur}" repeatCount="indefinite"/>` +
  `</linearGradient>`

/**
 * The drawing, `width` pixels wide, as SVG markup. `colorOf` maps a percent
 * to its text color.
 */
export function usageSvg(
  meters: readonly SvgMeter[],
  width: number,
  opts: { isWorking: boolean; isStale: boolean; colorOf: (percent: number) => string },
): string {
  const height = svgHeight(meters.length)
  const barW = width - LABEL_W - RIGHT_W
  const stops = gradientStops()
    .map(s => `<stop offset="${s.offset}" stop-color="${s.color}"/>`)
    .join('')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>` +
    `text{font-family:${FONT};dominant-baseline:central}` +
    `.label{font-size:12.5px;font-weight:500;fill:#5c6370}` +
    `.pct{font-size:13px;font-weight:650;font-variant-numeric:tabular-nums}` +
    `.reset{font-size:12px;fill:#7a828f;font-variant-numeric:tabular-nums}` +
    `.track{fill:#00000014}` +
    `@media (prefers-color-scheme: dark){.label{fill:#b4bccb}.reset{fill:#8b94a3}.track{fill:#ffffff1a}}` +
    `</style>` +
    `<defs>` +
    // userSpaceOnUse: a stretch of fill takes its color from where it sits on
    // the track, so a fuller bar reaches further into gold and red.
    `<linearGradient id="fill" gradientUnits="userSpaceOnUse" x1="${LABEL_W}" x2="${LABEL_W + barW}" y1="0" y2="0">${stops}</linearGradient>` +
    flowGradient('flow', '2.4s', 0.3) +
    flowGradient('flowFast', '0.9s', 0.4) +
    `<linearGradient id="sheen"><stop offset="0" stop-color="#fff" stop-opacity="0"/>` +
    `<stop offset="0.5" stop-color="#fff" stop-opacity="0.65"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<filter id="glow" x="-10%" y="-150%" width="120%" height="400%"><feGaussianBlur stdDeviation="3"/></filter>` +
    `</defs>` +
    meters.map((m, i) => row(m, i, width, opts.colorOf(m.percent), opts.isWorking)).join('') +
    (opts.isStale ? `<text x="${width}" y="${PAD_Y + 2}" class="reset" text-anchor="end">stale</text>` : '') +
    `</svg>`
  )
}
