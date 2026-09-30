import { segment } from './pulse.js'

/**
 * A text field for a named item in the show (timer, prop, look, text layer).
 * @returns {import('@companion-module/base').CompanionInputFieldTextInput}
 */
function nameField(label, tooltip) {
	return { type: 'textinput', id: 'name', label, default: '', tooltip, useVariables: true }
}

/** @returns {import('@companion-module/base').CompanionInputFieldDropdown} */
function cueField(cueChoices) {
	return {
		type: 'dropdown',
		id: 'cue',
		label: 'Cue',
		choices: cueChoices,
		default: cueChoices[0]?.id ?? '',
		allowCustom: true,
		tooltip: 'Pick a cue, or type its number',
	}
}

/** An option's value as text. Companion resolves variables before the callback runs. */
function text(value) {
	return String(value ?? '').trim()
}

/** @param {import('./main.js').default} self */
export function UpdateActions(self, cueChoices) {
	self.setActionDefinitions({
		go: {
			name: 'GO (next cue)',
			description: 'Fires the cue after the live one, as the GO button in Pulse does.',
			options: [],
			callback: () => self.send('POST', '/transport/next'),
		},
		back: {
			name: 'Back (previous cue)',
			options: [],
			callback: () => self.send('POST', '/transport/previous'),
		},
		refire: {
			name: 'Fire the live cue again',
			options: [],
			callback: () => self.send('POST', '/transport/go'),
		},
		fire_cue: {
			name: 'Fire a cue',
			options: [cueField(cueChoices)],
			callback: async (action) => {
				const cue = text(action.options.cue)
				if (cue) await self.send('POST', `/cues/${segment(cue)}/go`)
			},
		},
		stage_message: {
			name: 'Stage message: show',
			description: 'Shows a message to the stage display. Leave it empty to clear.',
			options: [{ type: 'textinput', id: 'text', label: 'Message', default: '', useVariables: true }],
			callback: async (action) => {
				await self.send('POST', '/stage-message', { text: text(action.options.text) })
			},
		},
		stage_message_clear: {
			name: 'Stage message: clear',
			options: [],
			callback: () => self.send('POST', '/stage-message', { text: '' }),
		},
		text_set: {
			name: 'Text layer: set',
			options: [
				nameField('Text layer', 'The text layer’s name in the show'),
				{ type: 'textinput', id: 'text', label: 'Text', default: '', useVariables: true },
			],
			callback: async (action) => {
				const name = text(action.options.name)
				if (!name) return
				await self.send('POST', `/text/${segment(name)}`, { text: text(action.options.text) })
			},
		},
		text_revert: {
			name: 'Text layer: back to the show’s text',
			options: [nameField('Text layer', 'The text layer’s name in the show')],
			callback: async (action) => {
				const name = text(action.options.name)
				if (name) await self.send('DELETE', `/text/${segment(name)}`)
			},
		},
		timer: {
			name: 'Timer',
			options: [
				nameField('Timer', 'The timer’s name in the show'),
				{
					type: 'dropdown',
					id: 'command',
					label: 'Command',
					default: 'start',
					choices: [
						{ id: 'start', label: 'Start' },
						{ id: 'stop', label: 'Stop' },
						{ id: 'reset', label: 'Reset' },
						{ id: 'restart', label: 'Restart' },
					],
				},
			],
			callback: async (action) => {
				const name = text(action.options.name)
				if (name) await self.send('POST', `/timers/${segment(name)}/${action.options.command}`)
			},
		},
		prop: {
			name: 'Prop',
			options: [
				nameField('Prop', 'The prop’s name in the show'),
				{
					type: 'dropdown',
					id: 'command',
					label: 'Command',
					default: 'toggle',
					choices: [
						{ id: 'show', label: 'Show' },
						{ id: 'hide', label: 'Hide' },
						{ id: 'toggle', label: 'Toggle' },
					],
				},
			],
			callback: async (action) => {
				const name = text(action.options.name)
				if (name) await self.send('POST', `/props/${segment(name)}/${action.options.command}`)
			},
		},
		look: {
			name: 'Look: recall',
			options: [nameField('Look', 'The look’s name in the show')],
			callback: async (action) => {
				const name = text(action.options.name)
				if (name) await self.send('POST', `/looks/${segment(name)}`)
			},
		},
		look_clear: {
			name: 'Look: clear',
			options: [],
			callback: () => self.send('DELETE', '/looks'),
		},
		announcement: {
			name: 'Announcement: play',
			description:
				'Runs a second cue on the screens it targets, alongside the live cue: announcements in the foyer while the show carries on.',
			options: [cueField(cueChoices)],
			callback: async (action) => {
				const cue = text(action.options.cue)
				if (cue) await self.send('POST', `/announcement/${segment(cue)}`)
			},
		},
		clear: {
			name: 'Clear',
			description: 'Clears until the next cue, as the clear buttons in Pulse do. All is the panic button.',
			options: [
				{
					type: 'dropdown',
					id: 'what',
					label: 'Clear',
					default: 'all',
					choices: [
						{ id: 'all', label: 'Everything' },
						{ id: 'slide', label: 'Slide (text)' },
						{ id: 'media', label: 'Media (video, images, live inputs)' },
						{ id: 'audio', label: 'Audio' },
						{ id: 'props', label: 'Props' },
						{ id: 'announcement', label: 'Announcement' },
					],
				},
			],
			callback: async (action) => {
				const what = text(action.options.what) || 'all'
				await self.send('POST', what === 'all' ? '/clear' : `/clear/${segment(what)}`)
			},
		},
		announcement_clear: {
			name: 'Announcement: end',
			options: [],
			callback: () => self.send('DELETE', '/announcement'),
		},
	})
}
