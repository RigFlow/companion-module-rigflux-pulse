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

### Feedbacks

- **Cue is live** and **Cue is next**, for a cue you pick.
- **Engine is a standby**: on when this engine is the backup of a redundant pair. A standby turns commands away until it takes over.
- **Show has missing media**.

### Variables

`show_name`, `live_cue_number`, `live_cue_name`, `next_cue_number`, `next_cue_name`, `is_leader`, `missing_assets`, `unresolvable_assets`.

### Presets

GO, Back, live and next cue displays, clear buttons, and a button for every cue in the loaded show, red while it's live and green while it's next. The cue buttons follow the show: load another show and they change with it.

### Notes

- The control API is plain HTTP on your show network. Keep it on a network you trust.
- Pulse has no stop-everything command over the API yet, so this module has none either.
