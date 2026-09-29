/** @param {import('./main.js').default} self */
export function UpdateVariableDefinitions(self) {
	self.setVariableDefinitions({
		show_name: { name: 'Show name' },
		live_cue_number: { name: 'Live cue number' },
		live_cue_name: { name: 'Live cue name' },
		next_cue_number: { name: 'Next cue number' },
		next_cue_name: { name: 'Next cue name' },
		is_leader: { name: 'Engine is leading (false on a standby)' },
		missing_assets: { name: 'Missing media files' },
		unresolvable_assets: { name: 'Media files that can’t be found at all' },
	})
}
