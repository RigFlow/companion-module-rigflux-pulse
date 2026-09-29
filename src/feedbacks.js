import { combineRgb } from '@companion-module/base'

const RED = combineRgb(204, 0, 0)
const AMBER = combineRgb(230, 150, 0)
const GREEN = combineRgb(0, 153, 51)
const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)

/** @param {import('./main.js').default} self */
export function UpdateFeedbacks(self, cueChoices) {
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
	})
}
