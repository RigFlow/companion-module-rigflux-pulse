import { combineRgb } from '@companion-module/base'

const BLACK = combineRgb(0, 0, 0)
const WHITE = combineRgb(255, 255, 255)
const GREEN = combineRgb(0, 153, 51)
const RED = combineRgb(204, 0, 0)
const AMBER = combineRgb(230, 150, 0)
const GREY = combineRgb(51, 51, 51)

/** @returns {import('@companion-module/base').CompanionSimplePresetDefinition<import('./main.js').PulseSchema>} */
function button(name, text, actionId, options = {}, extra = {}) {
	return {
		type: 'simple',
		name,
		style: { text, size: 'auto', color: WHITE, bgcolor: extra.bgcolor ?? BLACK },
		steps: [{ down: actionId ? [{ actionId, options }] : [], up: [] }],
		feedbacks: extra.feedbacks ?? [],
	}
}

/** @param {import('./main.js').default} self */
export function UpdatePresets(self, cues) {
	const v = (name) => `$(${self.label}:${name})`
	/** @type {import('@companion-module/base').CompanionPresetDefinitions<import('./main.js').PulseSchema>} */
	const presets = {
		go: button('GO', `GO\n${v('next_cue_number')}`, 'go', {}, { bgcolor: GREEN }),
		back: button('Back', 'BACK', 'back', {}, { bgcolor: GREY }),
		refire: button('Fire the live cue again', `AGAIN\n${v('live_cue_number')}`, 'refire'),
		// Displays: pressing one does nothing, so a status button can't fire a cue.
		live: button(
			'Live cue',
			`LIVE\n${v('live_cue_number')}\n${v('live_cue_name')}`,
			null,
			{},
			{
				feedbacks: [{ feedbackId: 'standby', options: {}, style: { bgcolor: AMBER, color: BLACK } }],
			},
		),
		next: button('Next cue', `NEXT\n${v('next_cue_number')}\n${v('next_cue_name')}`, null),
		stage_clear: button('Clear stage message', 'CLEAR\nMSG', 'stage_message_clear'),
		look_clear: button('Clear look', 'CLEAR\nLOOK', 'look_clear'),
		announcement_clear: button('End announcement', 'END\nANNOUNCE', 'announcement_clear'),
	}

	// A button per cue in the loaded show, red while it's live and green
	// while it's next, grouped by playlist.
	const playlists = new Map()
	const seen = new Set()
	for (const cue of cues) {
		if (!cue.number || seen.has(cue.number)) continue
		seen.add(cue.number)
		const id = `cue_${cue.number}`
		presets[id] = button(
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
		const playlist = cue.playlist || 'Show'
		if (!playlists.has(playlist)) playlists.set(playlist, [])
		playlists.get(playlist).push(id)
	}

	/** @type {import('@companion-module/base').CompanionPresetSection<import('./main.js').PulseSchema>[]} */
	const structure = [
		{
			id: 'transport',
			name: 'Transport',
			definitions: [
				{ id: 'transport', type: 'simple', name: 'Transport', presets: ['go', 'back', 'refire'] },
				{
					id: 'status',
					type: 'simple',
					name: 'Status',
					description: 'Displays; pressing them does nothing.',
					presets: ['live', 'next'],
				},
				{ id: 'clear', type: 'simple', name: 'Clear', presets: ['stage_clear', 'look_clear', 'announcement_clear'] },
			],
		},
		// A section with nothing in it until a show is loaded would only be noise.
		...(playlists.size === 0
			? []
			: [
					{
						id: 'cues',
						name: 'Cues',
						description: 'A button for every cue in the loaded show. Load another show and these change with it.',
						definitions: [...playlists].map(
							([name, ids], index) =>
								/** @type {const} */ ({
									id: `playlist_${index}`,
									type: 'simple',
									name,
									presets: ids,
								}),
						),
					},
				]),
	]

	self.setPresetDefinitions(structure, presets)
}
