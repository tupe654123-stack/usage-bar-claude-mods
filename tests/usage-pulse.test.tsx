import { describe, expect, mock, test } from 'claude-code/testing'

import { barRuns, ease, formatReset, gradient } from '../hooks/bar'

const NOW = Date.parse('2026-11-03T12:00:00Z')

// What `$.session.usage()` answers in these tests: synthetic figures.
const USAGE = {
  startedAt: NOW,
  context: { tokens: 60_000, window: 200_000, percent: 30 }, // drawn nowhere
  rateLimits: [
    { kind: 'five_hour', percentUsed: 42, resetsAt: '2026-11-03T14:00:00Z' },
    { kind: 'seven_day', percentUsed: 85, resetsAt: '2026-11-06T12:00:00Z' },
  ],
}

const BAND = {
  plugin: 'usage-pulse',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

describe('bar helpers', () => {
  test('the gradient runs blue to gold to red', () => {
    expect(gradient(0)).toBe('#4da3ff')
    expect(gradient(1)).toBe('#ff6b5e')
  })

  test('a bar is always exactly its width', () => {
    for (const percent of [0, 3, 50, 99.5, 100, 140]) {
      const cells = barRuns(percent, 12).map(r => r.text).join('')
      expect([...cells]).toHaveLength(12)
    }
  })

  test('easing reaches the target and stops', () => {
    let shown = 0
    for (let i = 0; i < 60; i++) shown = ease(shown, 42)
    expect(shown).toBe(42)
  })

  test('reset times read as a countdown', () => {
    expect(formatReset('2026-11-03T14:15:00Z', NOW)).toBe('2h 15m')
    expect(formatReset('2026-11-06T13:00:00Z', NOW)).toBe('3d 1h')
    expect(formatReset('2026-11-03T11:00:00Z', NOW)).toBe('now')
    expect(formatReset(undefined, NOW)).toBe('')
  })
})

test('the band shows both windows without context, on terminal and desktop', async ($, on) => {
  // Nothing sits beneath the plugin: these hooks stand for the engine.
  mock.clock(on, { now: NOW })
  on('session.usage', () => ({ value: USAGE }))
  on('session.surfaces', () => ({ value: ['terminal', 'desktop'] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  // Terminal: aligned text rows with countdowns.
  const term = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: /42%/ }))?.text).toContain('42%')
  expect((await term.find({ type: 'Text', text: /↻ 2h/ }))?.text).toBe('↻ 2h 0m')
  expect(await term.find({ type: 'Text', text: /tokens|ctx|context/ })).toBeUndefined()
  await term.unmount()

  // Desktop: one SVG card, its alt text naming both windows and no context.
  const desk = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const drawn = JSON.stringify(await desk.drawn())
  expect(drawn).toContain('Session 42%, resets in 2h 0m')
  expect(drawn).toContain('Weekly 85%')
  expect(drawn).not.toContain('context')
  await desk.unmount()
})

test('with no readings yet the band stays out of the way', async ($, on) => {
  on('state.get', () => ({ value: { value: null, version: 1 } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
})
