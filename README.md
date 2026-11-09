# Notifications

**The keyboard-first notification center for Omarchy.**

![The notification panel open against the right edge of the screen](preview.png)

A bell on the Omarchy bar that opens a full-height side panel of your
notifications, against the right edge of the screen. You can do everything in
the panel from the keyboard: move with the arrows or `j`/`k`, open with Enter,
search with `/`, and toggle Do Not Disturb with `d`, without reaching for the
mouse. History goes back 30 days rather than Omarchy's 24 hours.

This is a fork of
[jgarza9788/notification](https://github.com/jgarza9788/notification),
ported to the notification store Omarchy 4.5 introduced (`live.json` and
`history.json` instead of a file per notification).

## Install

```bash
omarchy plugin add https://github.com/Wintereise/omarchy-notification-center.git --enable
```

`--enable` puts the bell on the right side of the bar. The plugin id is still
`jgarza.notification`, so remove the original first if you have it:
`omarchy plugin remove jgarza.notification`.

### Requirements

Omarchy 4.5 or later. `jq`, `inotify-tools` and `util-linux` (for `flock`),
all part of Omarchy's base install. Without `inotifywait`, new notifications still show
up, but only every 30 seconds.

### Remove

```bash
omarchy plugin remove jgarza.notification
rm -rf ~/.local/state/jgarza-notification   # optional: delete the archived history
```

Removing the plugin leaves Omarchy's own notifications and settings as they
were. The second command deletes the history this plugin kept.

## Keys

| Key | |
|---|---|
| `↑` `↓` / `k` `j` | select (wraps around) |
| `PgUp` `PgDn`, `Home`/`g`, `End`/`G` | jump |
| `Enter` / `Space` | open the selected notification ("click" it) |
| `/` | search; type to filter, `Enter` keeps the filter, `Esc` clears it |
| `d` | toggle Do Not Disturb |
| `Shift+C` `Shift+C` | clear everything (the first press asks, the second clears) |
| `x` / `Delete` | remove the selected notification |
| `Esc` | clear the search, or close the panel |
| `Tab` | next bar panel |
| `→` / `l`, `←` / `h` | open / close the selected app's stack |

In the panel, click an app's heading (the one with ▸ or ▾) to open or close its stack.
On the bar, left-click opens the panel and right-click toggles Do Not Disturb.
The bell changes to a crossed-out bell while DND is on, and a badge counts
what's new since you last opened the panel.

### What "open" does

1. **Still on screen as a toast**: runs the toast's own action, the same as
   clicking the toast.
2. **Pointed at a picture** (screenshots, camera): opens the picture.
3. **Otherwise**: focuses the app that sent it.

The panel never re-runs a command stored with an old notification, because
any program can send one.

## Open it from a key

```bash
omarchy-shell jgarza.notification toggle
```

For example, in `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + N", "Notifications", "omarchy-shell jgarza.notification toggle")
```

## History

Omarchy's notification service keeps 100 notifications for 24 hours, in
`~/.local/state/omarchy/notifications/live.json` and `history.json`.
`bin/notification-store` copies each one as it arrives into
`~/.local/state/jgarza-notification/` (mode `0700`) and keeps them for
`keepDays` days, up to a limit of `maxItems`. Omarchy doesn't store images,
so the archive has none either. Clearing the panel also dismisses the cards
on screen. Omarchy has no way to clear its own history from outside, so the
plugin hides what Omarchy still holds until it ages out.

```
bin/notification-store list 50 | jq -r '.[] | "\(.app): \(.summary)"'
```

### Privacy

The archive keeps the full text of every notification for `keepDays` days,
including message previews, and it stays there after Omarchy itself has
forgotten them. Omarchy redacts notifications that carry one-time codes before
it writes them down ("Verification notification" / "[redacted]"), so the
archive only ever sees the redacted text. Clearing from
Omarchy's own notification UI does not touch the archive. To get rid of
entries, press `x` on one, or `Shift+C` twice to clear everything. You can
also lower `keepDays`. The files are readable only by you.

## Settings

| Setting | Default | |
|---|---|---|
| `panelWidth` | 420 | panel width |
| `keepDays` | 30 | days to keep |
| `maxItems` | 500 | most to keep |
| `badge` | Count | `Count`, `Dot` or `None` |
| `showBody` | true | show message text |
| `animationMs` | 240 | slide-in duration; 0 turns it off |
| `iconScale` | 140 | bell size on the bar, % of a normal bar icon |
| `icon` / `iconDnd` | bell / bell-off | bar glyphs |

## Tests

```bash
node tests/model.test.js
bash tests/store.test.sh
```

The running panel can be driven over IPC, since synthetic key presses don't
reach the shell. That IPC can add fake entries and press keys, so it is off
unless a flag file exists when the shell starts:

```bash
touch ~/.local/state/jgarza-notification/test-ipc && omarchy-restart-shell
omarchy-shell jgarza.notification.test seed 20
omarchy-shell jgarza.notification.test key down      # up enter search dnd clear remove escape
omarchy-shell jgarza.notification.test state
```
