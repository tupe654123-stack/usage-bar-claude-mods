// usage-pulse: an animated usage band above the prompt.
//
// Data: `$.session.usage()` and the `session.measure` event, the same figures
// the status line reads: the 5-hour and 7-day windows from the last API
// response's rate-limit headers. Both are local reads: this mod makes no
// network calls of its own.
//
// Desktop draws one SVG card whose animations are SMIL, run by the browser.
// The terminal has no SVG, so it animates with one 10 fps ticker that runs
// only while something moves and cancels itself once everything is still.

import { atom, read, update } from 'claude-code'
import type { Register, SessionMeasureInput, Timer, TimerCall } from 'claude-code'

import type { UsagePulseSnapshot } from '../types'
import { barRuns, ease, formatReset, gradient, pulse, shimmerAt } from './bar'
import { svgHeight, usageSvg } from './svg'

const snapshot = atom({ plugin: 'usage-pulse', key: 'snapshot' } as const, null)

const REFRESH_MS = 45_000 // poll between responses, within the 30-60 s asked for
const FRAME_MS = 100 // 10 fps: under every surface's redraw cap
const GROW_MS = 900 // how long the desktop fill takes to grow to a new value
const PULSE_FRAMES = 30 // ~3 s of terminal pulse after a reading past the threshold
const HOT_PERCENT = 80
const PX_PER_COLUMN = 8.6 // desktop: one band column in CSS pixels, measured
const MIN_CARD_PX = 340
const MAX_CARD_PX = 680

type Meter = 'fiveHour' | 'sevenDay'
type Percents = Partial<Record<Meter, number>>

const METERS: readonly { id: Meter; label: string }[] = [
  { id: 'fiveHour', label: 'Session' },
  { id: 'sevenDay', label: 'Weekly' },
]

/** The figures the engine reports, reduced to what the band draws. */
export function toSnapshot(u: Pick<SessionMeasureInput, 'rateLimits'>): UsagePulseSnapshot {
  const window = (kind: string) => {
    const limit = u.rateLimits.find(r => r.kind === kind)
    return limit && { percent: limit.percentUsed, resetsAt: limit.resetsAt }
  }
  return { fiveHour: window('five_hour'), sevenDay: window('seven_day') }
}

const percentsOf = (s: UsagePulseSnapshot): Percents => ({
  fiveHour: s.fiveHour?.percent,
  sevenDay: s.sevenDay?.percent,
})

export const register: Register = (on, options) => {
  const canAnimate = options.animate !== false

  // Animation state is throwaway, so it lives in module variables: a reload
  // restarts it from the snapshot kept in `$.state`.
  let target: Percents = {}
  let shown: Percents = {} // terminal: where each bar is mid-ease
  let grownFrom: Percents = {} // desktop: what the SVG fill grows from
  let changedAt = 0
  let frame = 0
  let pulseLeft = 0
  let isWorking = false
  let hasTerminal = false
  let ticker: Timer | undefined

  const isHot = () => Object.values(target).some(p => (p ?? 0) >= HOT_PERCENT)
  const isMoving = () => METERS.some(({ id }) => shown[id] !== target[id])
  const isBusy = () => isWorking || pulseLeft > 0 || isMoving()

  // One terminal frame: ease each bar, count the pulse down.
  const advance = () => {
    frame += 1
    pulseLeft = Math.max(0, pulseLeft - 1)
    shown = Object.fromEntries(
      METERS.map(({ id }) => [id, target[id] === undefined ? undefined : ease(shown[id] ?? 0, target[id])]),
    )
  }

  // Starts the terminal ticker if something should move and it isn't running.
  // Desktop needs none: its SVG animates itself. The engine's calls come in
  // as callbacks because a hook must spell `$` at the call site.
  const wake = (every: TimerCall, redraw: () => void) => {
    if (!canAnimate || !hasTerminal || ticker !== undefined || !isBusy()) return
    ticker = every(FRAME_MS, () => {
      advance()
      redraw()
      if (!isBusy()) {
        ticker?.cancel()
        ticker = undefined
      }
    })
  }

  // The `update` change for a new reading: records the targets and returns
  // the snapshot, or, when the read failed, keeps the last one marked stale.
  const reading = (usage: Pick<SessionMeasureInput, 'rateLimits'> | undefined) =>
    (last: UsagePulseSnapshot | null): UsagePulseSnapshot | null => {
      if (usage === undefined) return last === null ? null : { ...last, isStale: true }
      const next = toSnapshot(usage)
      const percents = percentsOf(next)
      if (METERS.some(({ id }) => percents[id] !== target[id])) {
        grownFrom = target
        changedAt = Date.now()
      }
      target = percents
      if (!canAnimate) shown = target
      if (isHot()) pulseLeft = PULSE_FRAMES
      return next
    }

  on('session.start', async ($, e, next) => {
    hasTerminal = (await $.session.surfaces()).includes('terminal')
    const usage = await $.session.usage().catch(() => undefined)
    await update($, snapshot, reading(usage))

    // Poll between responses: rate-limit figures can move from other sessions.
    $.clock.every(REFRESH_MS, async () => {
      const later = await $.session.usage().catch(() => undefined)
      await update($, snapshot, reading(later))
      wake((ms, fn) => $.clock.every(ms, fn), () => $.ui.invalidate('ui.render'))
    })
    wake((ms, fn) => $.clock.every(ms, fn), () => $.ui.invalidate('ui.render'))
    return next(e)
  })

  // Pushed by the engine after each turn and whenever a window moves a point.
  on('session.measure', async ($, e, next) => {
    await update($, snapshot, reading(e))
    wake((ms, fn) => $.clock.every(ms, fn), () => $.ui.invalidate('ui.render'))
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      isWorking = true
      hasTerminal = (await $.session.surfaces()).includes('terminal')
      $.ui.invalidate('ui.render') // desktop: start the shimmer
      wake((ms, fn) => $.clock.every(ms, fn), () => $.ui.invalidate('ui.render'))
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      isWorking = false
      const usage = await $.session.usage().catch(() => undefined)
      await update($, snapshot, reading(usage))
      $.ui.invalidate('ui.render') // desktop: stop the shimmer
      wake((ms, fn) => $.clock.every(ms, fn), () => $.ui.invalidate('ui.render'))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const snap = await read($, snapshot)
    if (e.props.hasSurvey || snap === null) return next(e)

    const meters = METERS.filter(m => snap[m.id] !== undefined)
    if (meters.length === 0) return next(e)

    const now = await $.clock.now()
    const working = canAnimate && (isWorking || e.props.isWorking)
    const percentOf = (id: Meter) => snap[id]?.percent ?? 0
    const resetOf = (id: Meter) => formatReset(snap[id]?.resetsAt, now)

    if (e.surface === 'desktop') {
      const { Box, Svg } = $.ui.resolve(e)
      // Grow from the last value only just after it changed, so a later
      // redraw draws the same markup and doesn't replay the growth.
      const isGrowing = canAnimate && Date.now() - changedAt < GROW_MS
      // An interactive SVG draws in a frame that is 300x150 unless sized, so
      // size it: the band's width (its columns at the app's cell width) and
      // the drawing's own height; the drawing lays itself out to that width.
      const width = Math.round(Math.min(MAX_CARD_PX, Math.max(MIN_CARD_PX, e.props.bodyColumns * PX_PER_COLUMN)))
      const source = usageSvg(
        meters.map(m => ({
          label: m.label,
          percent: percentOf(m.id),
          from: isGrowing ? (grownFrom[m.id] ?? 0) : percentOf(m.id),
          reset: resetOf(m.id),
        })),
        width,
        { isWorking: working, isStale: snap.isStale === true, colorOf: p => gradient(p / 100) },
      )
      const alt = meters.map(m => `${m.label} ${Math.round(percentOf(m.id))}%, resets in ${resetOf(m.id)}`).join('; ')
      return (
        <Box>
          <Svg source={source} alt={alt} isInteractive={canAnimate} width={width} height={svgHeight(meters.length)} />
        </Box>
      )
    }

    const { Box, Text } = $.ui.resolve(e)
    const glow = canAnimate && (working || pulseLeft > 0) ? pulse(frame) : 0
    const width = Math.max(10, Math.min(32, e.props.bodyColumns - 26))

    return (
      <Box flexDirection="column">
        {meters.map((m, i) => {
          const percent = percentOf(m.id)
          const isMeterHot = percent >= HOT_PERCENT
          const runs = barRuns(shown[m.id] ?? percent, width, {
            shimmer: working ? shimmerAt(frame, width) : undefined,
            glow: isMeterHot ? glow : 0,
          })
          return (
            <Box flexDirection="row" gap={1}>
              <Text dimColor>{m.label.padEnd(7)}</Text>
              <Text>
                {runs.map(r => (
                  <Text color={r.color}>{r.text}</Text>
                ))}
              </Text>
              {/* Past 80% the number blinks on the pulse, and stays bold when still. */}
              <Text bold={isMeterHot} inverse={isMeterHot && glow > 0.5} color={gradient(percent / 100)}>
                {`${Math.round(percent)}%`.padStart(4)}
              </Text>
              <Text dimColor>{resetOf(m.id) === '' ? '' : `↻ ${resetOf(m.id)}`}</Text>
              {i === 0 && snap.isStale ? <Text dimColor>(stale)</Text> : null}
            </Box>
          )
        })}
      </Box>
    )
  })
}
