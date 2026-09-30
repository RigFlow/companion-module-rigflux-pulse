import { combineRgb } from '@companion-module/base'

const RED = combineRgb(204, 0, 0)
const AMBER = combineRgb(230, 150, 0)
const GREEN = combineRgb(0, 153, 51)
const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)

/**
 * @param {import('./main.js').default} self
 * @param {{ timers: { name: string }[], props: { name: string }[] }} items
 */
export function UpdateFeedbacks(self, cueChoices, items = { timers: [], props: [] }) {
	/** @returns {import('@companion-module/base').CompanionInputFieldDropdown} */
	const nameOption = (id, label, names) => ({
		type: 'dropdown',
		id,
		label,
		choices: names.map((name) => ({ id: name, label: name })),
		default: names[0] ?? '',
		allowCustom: true,
		tooltip: 'Pick one, or type its name',
	})
	const timerNamed = (name) => self.state?.timers?.find((t) => t.name === String(name))

	/** @type {import('@companion-module/base').CompanionInputFieldDropdown} */
	const cueOption = {
		type: 'dropdown',
		id: 'cue',
		label: 'Cue',
		choices: cueChoices,
		default: cueChoices[0]?.id ?? '',
		allowCustom: true,
	}

	self.setFeedbackDefinitions({
		cue_live: {
			name: 'Cue is live',
			type: 'boolean',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [cueOption],
			callback: (feedback) => !!self.state?.liveCueNumber && self.state.liveCueNumber === String(feedback.options.cue),
		},
		cue_next: {
			name: 'Cue is next',
			type: 'boolean',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [cueOption],
			callback: (feedback) => !!self.state?.nextCueNumber && self.state.nextCueNumber === String(feedback.options.cue),
		},
		standby: {
			name: 'Engine is a standby',
			description:
				'On when this engine is the backup of a redundant pair. A standby follows its leader and turns commands away.',
			type: 'boolean',
			defaultStyle: { bgcolor: AMBER, color: BLACK },
			options: [],
			callback: () => self.state != null && self.state.isLeader === false,
		},
		missing_media: {
			name: 'Show has missing media',
			type: 'boolean',
			defaultStyle: { bgcolor: AMBER, color: BLACK },
			options: [],
			callback: () => (self.state?.missingAssetCount ?? 0) + (self.state?.unresolvableAssetCount ?? 0) > 0,
		},
		missing_devices: {
			name: 'Engine is missing devices',
			description: 'A camera, NDI source, display, DeckLink output or MIDI port the show uses isn’t there.',
			type: 'boolean',
			defaultStyle: { bgcolor: AMBER, color: BLACK },
			options: [],
			callback: () => (self.state?.missingDeviceCount ?? 0) > 0,
		},
		cleared: {
			name: 'Layers are cleared',
			description: 'On while a clear holds, until the next cue.',
			type: 'boolean',
			defaultStyle: { bgcolor: AMBER, color: BLACK },
			options: [
				{
					type: 'dropdown',
					id: 'what',
					label: 'Cleared',
					default: 'any',
					choices: [
						{ id: 'any', label: 'Anything' },
						{ id: 'slide', label: 'Slide' },
						{ id: 'media', label: 'Media' },
						{ id: 'audio', label: 'Audio' },
					],
				},
			],
			callback: (feedback) => {
				const cleared = self.state?.cleared ?? []
				return feedback.options.what === 'any' ? cleared.length > 0 : cleared.includes(String(feedback.options.what))
			},
		},
		prop_visible: {
			name: 'Prop is showing',
			type: 'boolean',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [
				nameOption(
					'prop',
					'Prop',
					items.props.map((p) => p.name),
				),
			],
			callback: (feedback) =>
				(self.state?.props ?? []).some((p) => p.name === String(feedback.options.prop) && p.isVisible),
		},
		look_active: {
			name: 'Look is active',
			type: 'boolean',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [{ type: 'textinput', id: 'look', label: 'Look', default: '' }],
			callback: (feedback) =>
				!!self.state?.activeLook && self.state.activeLook === String(feedback.options.look).trim(),
		},
		timer_running: {
			name: 'Timer is running',
			type: 'boolean',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [
				nameOption(
					'timer',
					'Timer',
					items.timers.map((t) => t.name),
				),
			],
			callback: (feedback) => timerNamed(feedback.options.timer)?.isRunning === true,
		},
		timer_over: {
			name: 'Countdown is nearly out, or over',
			description: 'On when a countdown has this many seconds or fewer left; it goes negative once it runs out.',
			type: 'boolean',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [
				nameOption(
					'timer',
					'Timer',
					items.timers.map((t) => t.name),
				),
				{ type: 'number', id: 'seconds', label: 'Seconds left or fewer', default: 0, min: -86400, max: 86400 },
			],
			callback: (feedback) => {
				const timer = timerNamed(feedback.options.timer)
				return !!timer && timer.kind !== 'countUp' && timer.seconds <= Number(feedback.options.seconds)
			},
		},
		media_ending: {
			name: 'Live video is ending',
			type: 'boolean',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [{ type: 'number', id: 'seconds', label: 'Seconds left or fewer', default: 10, min: 0, max: 3600 }],
			callback: (feedback) => {
				const media = self.state?.liveMedia
				return !!media && media.duration > 0 && media.remaining <= Number(feedback.options.seconds)
			},
		},
	})
}
