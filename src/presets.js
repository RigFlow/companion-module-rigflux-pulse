const { combineRgb } = require('@companion-module/base')

const BLACK = combineRgb(0, 0, 0)
const WHITE = combineRgb(255, 255, 255)
const GREEN = combineRgb(0, 153, 51)
const RED = combineRgb(204, 0, 0)
const GREY = combineRgb(51, 51, 51)

function button(category, name, text, actionId, options = {}, extra = {}) {
	return {
		type: 'button',
		category,
		name,
		style: { text, size: 'auto', color: WHITE, bgcolor: extra.bgcolor ?? BLACK },
		steps: [{ down: actionId ? [{ actionId, options }] : [], up: [] }],
		feedbacks: extra.feedbacks ?? [],
	}
}

module.exports = function (self, cues) {
	const v = (name) => `$(${self.label}:${name})`
	const presets = {
		go: button('Transport', 'GO', `GO\n${v('next_cue_number')}`, 'go', {}, { bgcolor: GREEN }),
		back: button('Transport', 'Back', 'BACK', 'back', {}, { bgcolor: GREY }),
		refire: button('Transport', 'Fire the live cue again', `AGAIN\n${v('live_cue_number')}`, 'refire'),
		// Displays: pressing one does nothing, so a status button can't fire a cue.
		live: button(
			'Status',
			'Live cue',
			`LIVE\n${v('live_cue_number')}\n${v('live_cue_name')}`,
			null,
			{},
			{
				feedbacks: [{ feedbackId: 'standby', options: {} }],
			},
		),
		next: button('Status', 'Next cue', `NEXT\n${v('next_cue_number')}\n${v('next_cue_name')}`, null),
		stage_clear: button('Stage message', 'Clear stage message', 'CLEAR\nMSG', 'stage_message_clear'),
		look_clear: button('Looks', 'Clear look', 'CLEAR\nLOOK', 'look_clear'),
		announcement_clear: button('Announcements', 'End announcement', 'END\nANNOUNCE', 'announcement_clear'),
	}

	// A button per cue in the loaded show, red while it's live and green
	// while it's next.
	const seen = new Set()
	for (const cue of cues) {
		if (!cue.number || seen.has(cue.number)) continue
		seen.add(cue.number)
		presets[`cue_${cue.number}`] = button(
			`Cues: ${cue.playlist || 'Show'}`,
			`${cue.number} ${cue.name}`.trim(),
			`${cue.number}\n${cue.name}`.trim(),
			'fire_cue',
			{ cue: cue.number },
			{
				feedbacks: [
					{ feedbackId: 'cue_next', options: { cue: cue.number }, style: { bgcolor: GREEN, color: WHITE } },
					{ feedbackId: 'cue_live', options: { cue: cue.number }, style: { bgcolor: RED, color: WHITE } },
				],
			},
		)
	}

	self.setPresetDefinitions(presets)
}
