import { showItems } from './pulse.js'

/**
 * The fixed variables, plus one per timer and prop in the loaded show.
 * @param {import('./main.js').default} self
 */
export function UpdateVariableDefinitions(self) {
	/** @type {Record<string, { name: string }>} */
	const definitions = {
		show_name: { name: 'Show name' },
		live_cue_number: { name: 'Live cue number' },
		live_cue_name: { name: 'Live cue name' },
		next_cue_number: { name: 'Next cue number' },
		next_cue_name: { name: 'Next cue name' },
		is_leader: { name: 'Engine is leading (false on a standby)' },
		missing_assets: { name: 'Missing media files' },
		unresolvable_assets: { name: 'Media files that can’t be found at all' },
		missing_devices: { name: 'Devices the show needs that the engine doesn’t have' },
		stage_message: { name: 'Stage message' },
		active_look: { name: 'Active look (empty for the show’s own routing)' },
		announcement_cue: { name: 'Announcement cue number (empty when none)' },
		cleared: { name: 'Layers cleared until the next cue (slide, media, audio)' },
		live_cue_elapsed: { name: 'Time since the live cue fired (M:SS)' },
		live_cue_elapsed_seconds: { name: 'Seconds since the live cue fired' },
		media_remaining: { name: 'Time left on the live cue’s video (M:SS)' },
		media_remaining_seconds: { name: 'Seconds left on the live cue’s video' },
		media_position: { name: 'Position in the live cue’s video (M:SS)' },
		media_duration: { name: 'Length of the live cue’s video (M:SS)' },
	}
	const { timers, props } = showItems(self.state)
	for (const timer of timers) {
		definitions[`timer_${timer.id}`] = { name: `Timer: ${timer.name}` }
		definitions[`timer_${timer.id}_seconds`] = { name: `Timer: ${timer.name} (seconds)` }
	}
	for (const prop of props) definitions[`prop_${prop.id}`] = { name: `Prop is showing: ${prop.name}` }
	self.setVariableDefinitions(definitions)
}
