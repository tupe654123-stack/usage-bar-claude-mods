// Pure drawing helpers for usage-pulse. Nothing here touches `$`, so the
// tests call these directly and every frame is a plain function of its input.

/** One colored stretch of a terminal bar: consecutive cells of one color. */
export type Run = { text: string; color: string }

/** Per-frame effects layered over the gradient. */
export type BarFx = {
  /** Cell the shimmer's bright head is on; absent, no shimmer. */
  shimmer?: number
  /** 0..1, how far the filled cells are lifted toward white (the 80% pulse). */
  glow?: number
}

type Rgb = readonly [number, number, number]

// Calm blue while there's room, gold as it fills, red at the limit.
const STOPS: readonly { at: number; rgb: Rgb }[] = [
  { at: 0, rgb: [0x4d, 0xa3, 0xff] },
  { at: 0.65, rgb: [0xff, 0xd2, 0x7a] },
  { at: 1, rgb: [0xff, 0x6b, 0x5e] },
]
const WHITE: Rgb = [0xff, 0xff, 0xff]
const TRACK: Rgb = [0x33, 0x37, 0x3f]

// Heavy horizontal lines read as one continuous pill in a terminal.
const FULL = '━'
const HALF = '╸'

const SHIMMER_RADIUS = 2.5
const SHIMMER_LIFT = 0.55
const GLOW_LIFT = 0.45

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

const mix = (a: Rgb, b: Rgb, f: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * f),
  Math.round(a[1] + (b[1] - a[1]) * f),
  Math.round(a[2] + (b[2] - a[2]) * f),
]

const hex = (c: Rgb) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')

const gradientRgb = (t: number): Rgb => {
  const x = clamp(t, 0, 1)
  const i = STOPS.findIndex(s => s.at >= x)
  if (i <= 0) return STOPS[0]!.rgb
  const lo = STOPS[i - 1]!
  const hi = STOPS[i]!
  return mix(lo.rgb, hi.rgb, (x - lo.at) / (hi.at - lo.at))
}

/** Blue at 0, gold at 0.65, red at 1, as a `#rrggbb` color. */
export const gradient = (t: number): string => hex(gradientRgb(t))

/** The gradient's stops, for the desktop SVG's own linearGradient. */
export const gradientStops = () => STOPS.map(s => ({ offset: s.at, color: hex(s.rgb) }))

/**
 * The cells of one terminal bar, `width` wide, filled to `percent`.
 *
 * Each filled cell takes the gradient at its own position, so a fuller bar
 * reaches further into gold and red; a half line ends the fill between cells.
 */
export function barRuns(percent: number, width: number, fx: BarFx = {}): Run[] {
  const filled = (clamp(percent, 0, 100) / 100) * width
  const cells: Run[] = []

  for (let i = 0; i < width; i++) {
    const cover = clamp(filled - i, 0, 1)
    const shine = shimmerLift(fx.shimmer, i)
    const glowing = mix(gradientRgb((i + 0.5) / width), WHITE, (fx.glow ?? 0) * GLOW_LIFT)
    const fill = hex(mix(glowing, WHITE, shine))

    if (cover >= 0.75) cells.push({ text: FULL, color: fill })
    else if (cover >= 0.25) cells.push({ text: HALF, color: fill })
    else cells.push({ text: FULL, color: hex(mix(TRACK, WHITE, shine / 3)) })
  }

  return mergeRuns(cells)
}

const shimmerLift = (head: number | undefined, i: number) => {
  if (head === undefined) return 0
  const d = Math.abs(i - head)
  return d >= SHIMMER_RADIUS ? 0 : SHIMMER_LIFT * (1 - d / SHIMMER_RADIUS)
}

// Fewer elements per frame: neighbours of the same color become one run.
const mergeRuns = (cells: Run[]): Run[] =>
  cells.reduce<Run[]>((runs, cell) => {
    const last = runs[runs.length - 1]
    return last && last.color === cell.color
      ? [...runs.slice(0, -1), { ...last, text: last.text + cell.text }]
      : [...runs, cell]
  }, [])

/** One easing step toward `target`; snaps once close, so the animation ends. */
export function ease(shown: number, target: number, rate = 0.25): number {
  const next = shown + (target - shown) * rate
  return Math.abs(target - next) < 0.15 ? target : next
}

/** Where the shimmer's head is on `frame`: it sweeps left to right, off both ends. */
export const shimmerAt = (frame: number, width: number) => ((frame * 0.8) % (width + 6)) - 3

/** 0..1, a breathing wave of about one second at ten frames a second. */
export const pulse = (frame: number) => 0.5 + 0.5 * Math.sin(frame * 0.6)

/** "2h 14m", "3d 4h", "now", or "" when the time is missing or unreadable. */
export function formatReset(resetsAt: string | undefined, now: number): string {
  const at = resetsAt === undefined ? NaN : Date.parse(resetsAt)
  if (Number.isNaN(at)) return ''

  const minutes = Math.ceil((at - now) / 60_000)
  if (minutes <= 0) return 'now'

  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}
