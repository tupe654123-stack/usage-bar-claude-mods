# usage-pulse

An animated usage band above the Claude Code prompt, in the terminal and the
desktop app's Code tab:

- **Session**: the 5-hour rate-limit window, with time to reset
- **Weekly**: the 7-day rate-limit window, with time to reset

On desktop it draws a dark card of glowing pill bars (an SVG animated by the
browser). In the terminal it draws two aligned rows of line bars. Colors run
blue, gold, red as usage grows; the fill eases to new values, a shimmer sweeps
the bars while Claude works, and anything past 80% pulses.

## Data

Figures come from Claude Code's own `$.session.usage()` and `session.measure`
(the numbers the status line reads). The mod makes no network calls. The
5h/7d windows appear only on a Claude subscription, after the first response.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install usage-pulse --marketplace tupe654123-stack/usage-bar-claude-mods
```

Answer `y` to add the marketplace, then pick a scope (user is first).

From a shell:

```
claude plugin install usage-pulse --marketplace tupe654123-stack/usage-bar-claude-mods
```

In the desktop app, where `/plugin` does not run: click + next to the prompt
box, then Plugins, Add marketplace with `tupe654123-stack/usage-bar-claude-mods`,
then Add plugin. A mod installed at the user scope from a terminal also loads
in the desktop app's Code tab.

## Options

`animate` (default `true`): set it to `false` in `/config` for static colored bars.

## Test

```
claude plugin validate /path/to/usage-pulse
claude plugin test /path/to/usage-pulse
```
