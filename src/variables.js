module.exports = function (self) {
	self.setVariableDefinitions([
		{ variableId: 'show_name', name: 'Show name' },
		{ variableId: 'live_cue_number', name: 'Live cue number' },
		{ variableId: 'live_cue_name', name: 'Live cue name' },
		{ variableId: 'next_cue_number', name: 'Next cue number' },
		{ variableId: 'next_cue_name', name: 'Next cue name' },
		{ variableId: 'is_leader', name: 'Engine is leading (false on a standby)' },
		{ variableId: 'missing_assets', name: 'Missing media files' },
		{ variableId: 'unresolvable_assets', name: 'Media files that can’t be found at all' },
	])
}
