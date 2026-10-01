import { combineRgb } from '@companion-module/base'
import { slugs } from './pulse.js'

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

/** A clear for one layer class, amber while the clear holds. */
function clearButton(what, label) {
	return button(
		`Clear ${what}`,
		`CLEAR\n${label}`,
		'clear',
		{ what },
		{
			feedbacks: [{ feedbackId: 'cleared', options: { what }, style: { bgcolor: AMBER, color: BLACK } }],
		},
	)
}

/**
 * @param {import('./main.js').default} self
 * @param {{ timers: { id: string, name: string }[], props: { id: string, name: string }[], lists?: { id: string, name: string }[], targetSets?: { id: string, name: string }[] }} items
 * @param {string[]} stageLayouts
 */
export function UpdatePresets(self, cues, items = { timers: [], props: [], lists: [] }, stageLayouts = []) {
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
		pause_all: button('Pause everything', 'PAUSE\nALL', 'pause', { cue: '' }, { bgcolor: AMBER }),
		resume_all: button('Resume everything', 'RESUME\nALL', 'resume', { cue: '' }, { bgcolor: GREEN }),
		stop_all: button('Stop everything', 'STOP\nALL', 'stop', { cue: '' }, { bgcolor: RED }),
		clear_all: button('Clear everything (panic)', 'CLEAR\nALL', 'clear', { what: 'all' }, { bgcolor: RED }),
		clear_slide: clearButton('slide', 'SLIDE'),
		clear_media: clearButton('media', 'MEDIA'),
		clear_audio: clearButton('audio', 'AUDIO'),
		time_left: button(
			'Time left on the live video',
			`LEFT\n${v('media_remaining')}`,
			null,
			{},
			{
				feedbacks: [{ feedbackId: 'media_ending', options: { seconds: 10 }, style: { bgcolor: RED, color: WHITE } }],
			},
		),
		elapsed: button('Time since the live cue fired', `CUE\n${v('live_cue_elapsed')}`, null),
		// The show-state page: a Stream Deck that mirrors the show with no
		// setup — what's up, what's next, whether anything's wrong.
		state_live: button(
			'On screen',
			`LIVE\n${v('live_cue_number')}\n${v('live_cue_name')}`,
			null,
			{},
			{
				bgcolor: RED,
				feedbacks: [
					{
						feedbackId: 'paused',
						options: {},
						style: { bgcolor: AMBER, color: BLACK, text: `PAUSED\n${v('live_cue_number')}` },
					},
					{ feedbackId: 'standby', options: {}, style: { bgcolor: AMBER, color: BLACK, text: 'STANDBY\nnot leading' } },
				],
			},
		),
		state_next: button(
			'Up next',
			`NEXT\n${v('next_cue_number')}\n${v('next_cue_name')}`,
			null,
			{},
			{
				feedbacks: [
					{ feedbackId: 'cue_type', options: { which: 'next', type: 'stop' }, style: { bgcolor: AMBER, color: BLACK } },
				],
			},
		),
		state_go: button(
			'GO',
			`GO\n${v('next_cue_number')}`,
			'go',
			{},
			{
				bgcolor: GREEN,
				feedbacks: [
					{ feedbackId: 'standby', options: {}, style: { bgcolor: GREY, color: WHITE, text: 'GO\n(standby)' } },
				],
			},
		),
		state_pause: button(
			'Pause / resume',
			'PAUSE',
			'pause_toggle',
			{},
			{
				feedbacks: [{ feedbackId: 'paused', options: {}, style: { bgcolor: AMBER, color: BLACK, text: 'RESUME' } }],
			},
		),
		state_media: button(
			'Media problems',
			'MEDIA\nOK',
			null,
			{},
			{
				bgcolor: GREEN,
				feedbacks: [
					{
						feedbackId: 'missing_media',
						options: {},
						style: { bgcolor: RED, color: WHITE, text: `MISSING\n${v('missing_assets')}` },
					},
				],
			},
		),
	}

	// A GO and a display per list that runs on its own.
	for (const list of items.lists ?? []) {
		presets[`list_go_${list.id}`] = button(
			`GO ${list.name}`,
			`GO\n${list.name}`,
			'go_list',
			{ list: list.name },
			{ bgcolor: GREEN },
		)
		presets[`list_live_${list.id}`] = button(
			`${list.name}: on screen`,
			`${list.name}\n${v(`list_${list.id}_cue`)}\n${v(`list_${list.id}_cue_name`)}`,
			null,
			{},
			{
				feedbacks: [
					{ feedbackId: 'list_cue_live', options: { list: list.name, cue: '' }, style: { bgcolor: RED, color: WHITE } },
				],
			},
		)
	}

	// A display per timer — red once a countdown runs out — and a toggle per
	// prop, green while it's showing.
	for (const timer of items.timers) {
		presets[`timer_${timer.id}`] = button(
			timer.name,
			`${timer.name}\n${v(`timer_${timer.id}`)}`,
			null,
			{},
			{
				feedbacks: [
					{
						feedbackId: 'timer_over',
						options: { timer: timer.name, seconds: 0 },
						style: { bgcolor: RED, color: WHITE },
					},
				],
			},
		)
	}
	for (const prop of items.props) {
		presets[`prop_${prop.id}`] = button(
			prop.name,
			prop.name,
			'prop',
			{ name: prop.name, command: 'toggle' },
			{
				feedbacks: [
					{ feedbackId: 'prop_visible', options: { prop: prop.name }, style: { bgcolor: GREEN, color: WHITE } },
				],
			},
		)
	}

	// A clear for each target set's slide and media — its foreground and
	// background — green while there's something to clear and amber once
	// it's cleared; and a button per stage layout, switching every stage
	// screen to it, green while a stage screen shows it.
	const sets = items.targetSets ?? []
	/** A clear for one plane, lit by what's on it. */
	const planeClear = (set, plane, label) =>
		button(
			`Clear ${set.name}'s ${label.toLowerCase()}`,
			`CLEAR\n${set.name}\n${label}`,
			'clear_plane',
			{ set: set.name, plane },
			{
				feedbacks: [
					{ feedbackId: 'plane_showing', options: { set: set.name, plane }, style: { bgcolor: GREEN, color: WHITE } },
					{ feedbackId: 'plane_cleared', options: { set: set.name, plane }, style: { bgcolor: AMBER, color: BLACK } },
				],
			},
		)
	for (const set of sets) {
		presets[`clear_fg_${set.id}`] = planeClear(set, 'foreground', 'SLIDE')
		presets[`clear_bg_${set.id}`] = planeClear(set, 'background', 'MEDIA')
	}
	const layoutIDs = slugs(stageLayouts)
	stageLayouts.forEach((layout, i) => {
		presets[`stage_layout_${layoutIDs[i]}`] = button(
			`Stage: ${layout}`,
			`STAGE\n${layout}`,
			'stage_layout',
			{ screen: '', layout },
			{
				bgcolor: GREY,
				feedbacks: [
					{
						feedbackId: 'stage_layout_showing',
						options: { screen: '', layout },
						style: { bgcolor: GREEN, color: WHITE },
					},
				],
			},
		)
	})

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
			id: 'show_state',
			name: 'Show state',
			definitions: [
				{
					id: 'state',
					type: 'simple',
					name: 'Show state',
					description:
						'A page that mirrors the show: on screen (amber when paused or on a standby), up next (amber before a Stop), GO, pause/resume, and media problems.',
					presets: ['state_live', 'state_next', 'state_go', 'state_pause', 'time_left', 'state_media'],
				},
				...((items.lists ?? []).length
					? [
							{
								id: 'lists',
								type: /** @type {const} */ ('simple'),
								name: 'Lists that run on their own',
								presets: (items.lists ?? []).flatMap((l) => [`list_go_${l.id}`, `list_live_${l.id}`]),
							},
						]
					: []),
			],
		},
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
					presets: ['live', 'next', 'time_left', 'elapsed'],
				},
				{
					id: 'clear',
					type: 'simple',
					name: 'Clear',
					description: 'Layer clears hold until the next cue, and light while they do.',
					presets: [
						'clear_all',
						'clear_slide',
						'clear_media',
						'clear_audio',
						'stage_clear',
						'look_clear',
						'announcement_clear',
						'stop_all',
						'pause_all',
						'resume_all',
					],
				},
			],
		},
		...(items.timers.length + items.props.length === 0
			? []
			: [
					{
						id: 'show_items',
						name: 'Timers and props',
						definitions: [
							...(items.timers.length
								? [
										{
											id: 'timers',
											type: /** @type {const} */ ('simple'),
											name: 'Timers',
											presets: items.timers.map((t) => `timer_${t.id}`),
										},
									]
								: []),
							...(items.props.length
								? [
										{
											id: 'props',
											type: /** @type {const} */ ('simple'),
											name: 'Props',
											presets: items.props.map((p) => `prop_${p.id}`),
										},
									]
								: []),
						],
					},
				]),
		...(sets.length + stageLayouts.length === 0
			? []
			: [
					{
						id: 'sets_and_stage',
						name: 'Target sets and stage',
						definitions: [
							...(sets.length
								? [
										{
											id: 'plane_clears',
											type: /** @type {const} */ ('simple'),
											name: 'Clear one target set',
											description:
												'Each target set’s slide (foreground) or media (background), until a cue puts something back.',
											presets: sets.flatMap((s) => [`clear_fg_${s.id}`, `clear_bg_${s.id}`]),
										},
									]
								: []),
							...(stageLayouts.length
								? [
										{
											id: 'stage_layouts',
											type: /** @type {const} */ ('simple'),
											name: 'Stage layouts',
											description:
												'Switches every stage screen to a layout. To switch one, name its stage screen in the action.',
											presets: layoutIDs.map((id) => `stage_layout_${id}`),
										},
									]
								: []),
						],
					},
				]),
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
