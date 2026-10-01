import { InstanceBase, InstanceStatus, Regex } from '@companion-module/base'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { UpdateVariableDefinitions } from './variables.js'
import { PulseClient, variablesFromState, cueChoices, showItems } from './pulse.js'

export { UpgradeScripts }

/**
 * @typedef {import('@companion-module/base').CompanionOptionValues} OptionValues
 * @typedef {{
 *   config: { host: string, port: number },
 *   secrets: { token?: string },
 *   actions: Record<string, import('@companion-module/base').CompanionActionSchemaWithoutResult<OptionValues>>,
 *   feedbacks: Record<string, import('@companion-module/base').CompanionFeedbackSchema<OptionValues>>,
 *   variables: import('@companion-module/base').CompanionVariableValues,
 * }} PulseSchema
 */

/** @extends {InstanceBase<PulseSchema>} */
export default class PulseInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.state = null
		this.cues = []
		/** The show's stage layouts by name, for the layout switch. */
		this.stageLayouts = []
		this.client = null
		/** The timer and prop names last defined, to see when they change. */
		this.itemsKey = ''
	}

	async init(config, _isFirstInit, secrets) {
		this.config = config
		this.secrets = secrets ?? {}
		UpdateVariableDefinitions(this)
		this.updateDefinitions()
		this.start()
	}

	async destroy() {
		this.client?.close()
		this.client = null
	}

	async configUpdated(config, secrets) {
		this.config = config
		this.secrets = secrets ?? {}
		this.client?.close()
		this.client = null
		this.state = null
		this.start()
	}

	/** @returns {import('@companion-module/base').SomeCompanionConfigField[]} */
	getConfigFields() {
		return [
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Setting up',
				value:
					'In Pulse, open Settings → Control API and turn it on. Copy the port and token from there. ' +
					'Pulse makes a new token each time the API is turned on, so copy it again after that.',
			},
			{
				type: 'textinput',
				id: 'host',
				label: 'Engine address',
				width: 8,
				default: '127.0.0.1',
				regex: Regex.HOSTNAME,
			},
			{
				type: 'number',
				id: 'port',
				label: 'Port',
				width: 4,
				default: 7401,
				min: 1,
				max: 65535,
			},
			{
				type: 'secret-text',
				id: 'token',
				label: 'Token',
				width: 12,
				default: '',
			},
		]
	}

	start() {
		const host = (this.config.host ?? '').trim()
		const token = (this.secrets.token ?? '').trim()
		if (!host || !token) {
			this.updateStatus(InstanceStatus.BadConfig, !host ? 'No engine address' : 'No token')
			return
		}
		this.updateStatus(InstanceStatus.Connecting)
		const client = new PulseClient({ host, port: Number(this.config.port) || 7401, token })
		this.client = client
		// The first state on the feed fetches the cue list (see applyState).
		client.on('connected', () => this.updateStatus(InstanceStatus.Ok))
		client.on('state', (state) => this.applyState(state))
		client.on('disconnected', () => {
			this.updateStatus(InstanceStatus.Disconnected, 'Lost the engine; retrying')
			this.applyState(null)
		})
		client.on('unreachable', (reason) => {
			this.updateStatus(InstanceStatus.ConnectionFailure, `Can't reach Pulse (${reason})`)
		})
		client.on('unauthorized', () => {
			this.updateStatus(
				InstanceStatus.AuthenticationFailure,
				'Token rejected. Copy it again from Pulse Settings → Control API.',
			)
		})
		client.on('warning', (message) => this.log('warn', message))
		client.connect()
	}

	applyState(state) {
		const previous = this.state
		this.state = state
		this.setVariableValues(
			state
				? variablesFromState(state)
				: variablesFromState({ isLeader: false, missingAssetCount: 0, unresolvableAssetCount: 0 }),
		)
		// Timers and props come in every frame; when the set of them changes
		// (a show loaded or edited), their variables, choices and presets do.
		const items = JSON.stringify(showItems(state), ['timers', 'props', 'lists', 'targetSets', 'name'])
		if (items !== this.itemsKey) {
			this.itemsKey = items
			UpdateVariableDefinitions(this)
			this.updateDefinitions()
			this.setVariableValues(state ? variablesFromState(state) : {})
		}
		this.checkFeedbacks(
			'cue_live',
			'cue_next',
			'paused',
			'cue_type',
			'list_cue_live',
			'standby',
			'missing_media',
			'missing_devices',
			'cleared',
			'prop_visible',
			'look_active',
			'timer_running',
			'timer_over',
			'media_ending',
		)
		// The feed carries no cue list, and a show can be edited or swapped
		// under us. A cue that isn't in the list we know means it changed.
		if (!state) return
		const unknownCue = state.liveCueNumber && !this.cues.some((cue) => cue.number === state.liveCueNumber)
		if (previous?.showName !== state.showName || unknownCue) this.refreshCues()
	}

	async refreshCues() {
		const client = this.client
		if (!client) return
		try {
			// The stage layouts change with the show, like the cue list, and
			// aren't on the feed either.
			const [cues, stageLayouts] = await Promise.all([client.cues(), client.stageLayouts()])
			if (client !== this.client) return
			const changed =
				JSON.stringify(cues) !== JSON.stringify(this.cues) ||
				JSON.stringify(stageLayouts) !== JSON.stringify(this.stageLayouts)
			this.cues = cues
			this.stageLayouts = stageLayouts
			if (changed) this.updateDefinitions()
		} catch (e) {
			this.log('warn', `Couldn't read the cue list: ${e.message}`)
		}
	}

	updateDefinitions() {
		const choices = cueChoices(this.cues)
		const items = showItems(this.state)
		UpdateActions(this, choices, items, this.stageLayouts)
		UpdateFeedbacks(this, choices, items)
		UpdatePresets(this, this.cues, items, this.stageLayouts)
	}

	/** Sends a command, reporting a refusal in the log rather than throwing. */
	async send(method, path, body) {
		if (!this.client) {
			this.log('warn', 'Not connected to Pulse')
			return
		}
		try {
			await this.client.request(method, path, body)
		} catch (e) {
			this.log('warn', `Pulse refused ${method} ${path}: ${e.message}`)
			if (e.status === 401) {
				this.updateStatus(InstanceStatus.AuthenticationFailure, 'Token rejected. Copy it again from Pulse Settings.')
			}
		}
	}
}
