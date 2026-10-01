## RigFlux Pulse

Controls a Pulse media server over its control API, and shows its live and next cues on your buttons.

### Setting up

1. In Pulse, open **Settings → Control API** and click **Turn on**.
2. Copy the **port** and **token** shown there into this connection. Leave the address as `127.0.0.1` when Companion and Pulse are on the same Mac; otherwise use the engine Mac's address.

The token is kept in Companion's secret store, so it doesn't appear in exported configs. Pulse makes a new token each time the API is turned on. If the connection shows **Authentication failure**, copy the token again.

This module needs Companion 4.3 or later.

### Actions

- **GO (next cue)** and **Back (previous cue)**, as the buttons in Pulse do. **Fire the live cue again** restarts the live cue.
- **Fire a cue**: pick from the loaded show, or type a cue number.
- **Stage message**: show or clear a message on the stage display. Variables work.
- **Text layer**: set a live text layer by name, or put it back to the show's text.
- **Timer**: start, stop, reset or restart a timer by name.
- **Prop**: show, hide or toggle a prop by name.
- **Look**: recall a look by name, or clear it.
- **Announcement**: run a second cue on the screens it targets, alongside the live cue, and end it.
- **Stop**, **Pause** and **Resume**: a cue, or everything on screen. Pause freezes video and sound too.
- **Pause / resume**: one button — pauses everything, or resumes if something is paused.
- **GO a list that runs on its own**: fires the next cue of an independent list (a foyer loop, stings) without moving the show's playhead.
- **Take over as leader**: on a backup engine, become the leader — for a pair, whose backup never takes over by itself.
- **Clear**: everything (the panic button), or just slide, media, audio, props or the announcement. Layer clears hold until the next cue, as the clear buttons in Pulse do.
- **Clear a target set's background or foreground**: one plane of one target set — the side wall's slide, say — until a cue puts something on it again. The main screen is left alone, and props stay.
- **Stage layout: switch**: puts a stage screen on another stage layout live, as ProPresenter's Screens menu does. Name the stage screen, or leave it empty to switch every stage screen. Pick the layout from the show's, or type its name.

### Feedbacks

- **Cue is live** and **Cue is next**, for a cue you pick.
- **Something is paused**: while a Pause has frozen anything on screen.
- **Live or next cue is a kind**: for example, amber on GO when the next cue is a Stop.
- **List's cue is live**: for a list that runs on its own — on a cue you name, or any.
- **Engine is a standby**: on when this engine is the backup of a redundant pair. A standby turns commands away until it takes over.
- **Show has missing media**, and **Engine is missing devices** (a camera, NDI source, display, DeckLink output or MIDI port the show uses).
- **Layers are cleared**: while a clear holds.
- **Prop is showing**, **Look is active** and **Timer is running**.
- **Countdown is nearly out, or over**: at a number of seconds you pick.
- **Live video is ending**: when the live cue's video has that many seconds or fewer left.
- **Target set plane has something on it**, **is cleared**, and **is partly hidden**: for one target set's foreground (slides) or background (media). Partly hidden means another set's solid cue covers some of its slices, so Pulse has cleared those.
- **Stage screen is showing a layout**: for one stage screen, or any.

### Variables

- The show and cues: `show_name`, `live_cue_number`, `live_cue_name`, `next_cue_number`, `next_cue_name`, `live_cue_elapsed`.
- The live cue's video: `media_remaining`, `media_position`, `media_duration`, and `media_remaining_seconds` for expressions.
- `stage_message`, `active_look`, `announcement_cue`, `cleared`.
- One per timer, as the stage display shows it: `timer_<name>` (for example `timer_sermon`), plus `timer_<name>_seconds`.
- One per prop: `prop_<name>`, true while it's showing.
- `is_leader`, `missing_assets`, `unresolvable_assets`, `missing_devices`.
- `live_cue_type` and `next_cue_type`: look, timeline, fade, group, wait, memo, stop, pause, resume, goto or start — so a GO button can say what's coming.
- `live_cue_notes` and `next_cue_notes`: what the operator wrote on the cue. `is_paused`.
- One pair per list that runs on its own: `list_<name>_cue` and `list_<name>_cue_name`.
- One pair per target set: `set_<name>_fg_cue` and `set_<name>_bg_cue`, the cue on its foreground and background.
- One per stage screen: `stage_<screen>_layout`, the layout it's showing.

Timer, prop, target set and stage screen variables follow the loaded show. Names are lower-cased with spaces and punctuation turned into `_`.

### Presets

A **Show state** page that mirrors the show with no setup: on screen (amber while paused, or on a standby), up next (amber before a Stop), GO, pause/resume, time left, and media problems — plus a GO and a display for each list that runs on its own. Then GO and Back; live cue, next cue, time-left and elapsed displays; a red **CLEAR ALL** panic button and clears that light while they hold; a display for every timer (red once a countdown runs out) and a toggle for every prop; and a button for every cue in the loaded show, red while it's live and green while it's next. The cue buttons follow the show: load another show and they change with it.

**Target sets and stage**: a slide (foreground) and media (background) clear for every target set — green while there's something to clear, amber once it's cleared — and a button per stage layout that switches every stage screen to it, green while a stage screen shows it. These follow the show too.

### Stage view in a browser

Pulse also shows any stage layout full screen in a browser, at `http://<engine>:<port>/stage` on the same port as the control API. That's a page, not a Companion feature: open it on a tablet or laptop, or scan the Stage view code in Pulse Settings.

### Notes

- The control API is plain HTTP on your show network. Keep it on a network you trust.
- Clear, and the timer, prop, look and clip-time feedback, need a Pulse engine with those in its control API. On an older engine those buttons and variables stay empty.
- Clearing one target set's plane and switching stage layouts need a Pulse engine with target sets and stage layouts, and their feedback and variables need one that reports them in its state. On an older engine the layout list is empty, those actions are refused (which shows in the log), and their feedback stays off.
