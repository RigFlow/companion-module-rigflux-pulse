// Talks to a Pulse engine's control API: plain HTTP for commands, and a
// WebSocket that pushes the engine's whole state on connect and after
// every change. Nothing here knows about Companion, so it can be tested
// against a fake engine.

import { EventEmitter } from 'node:events'
import WebSocket from 'ws'

const API = '/api/v1'

/** A failed request, with the engine's own message when it sent one. */
export class PulseError extends Error {
	constructor(status, message) {
		super(message)
		this.status = status
	}
}

export class PulseClient extends EventEmitter {
	/**
	 * @param {{ host: string, port: number, token: string }} options
	 */
	constructor({ host, port, token }) {
		super()
		this.base = `http://${host}:${port}`
		this.wsURL = `ws://${host}:${port}${API}/events`
		this.token = token
		this.socket = null
		this.retryTimer = null
		this.retryDelay = 1000
		this.closed = false
	}

	/**
	 * Sends a command. Resolves with the parsed JSON body, or null for
	 * the engine's 204s; rejects with a PulseError.
	 */
	async request(method, path, body) {
		const headers = { Authorization: `Bearer ${this.token}` }
		let payload
		if (body !== undefined) {
			headers['Content-Type'] = 'application/json'
			payload = JSON.stringify(body)
		}
		let res
		try {
			res = await fetch(this.base + API + path, {
				method,
				headers,
				body: payload,
				signal: AbortSignal.timeout(5000),
			})
		} catch (e) {
			throw new PulseError(0, `can't reach Pulse at ${this.base} (${e.cause?.code ?? e.message})`)
		}
		const text = await res.text()
		let json = null
		if (text) {
			try {
				json = JSON.parse(text)
			} catch {
				json = null
			}
		}
		if (!res.ok) {
			throw new PulseError(res.status, json?.error ?? `HTTP ${res.status}`)
		}
		return json
	}

	/** Every playlist's cues, in show order. */
	async cues() {
		const body = await this.request('GET', '/playlists')
		return (body?.playlists ?? []).flatMap((playlist) =>
			(playlist.cues ?? []).map((cue) => ({ ...cue, playlist: playlist.name })),
		)
	}

	/**
	 * The show's stage layouts, by name. An engine from before stage
	 * layouts answers 404, which is no layouts rather than an error.
	 */
	async stageLayouts() {
		try {
			const body = await this.request('GET', '/stage/layouts')
			return (body?.layouts ?? []).map((layout) => layout.name).filter(Boolean)
		} catch (e) {
			if (e.status === 404) return []
			throw e
		}
	}

	/**
	 * Opens the state feed, reconnecting until `close()`. Emits `state`
	 * with each snapshot, `connected` / `disconnected`, and `unauthorized`
	 * when the engine turns the token away (it doesn't retry then — a
	 * token only changes when someone copies a new one in).
	 */
	connect() {
		this.closed = false
		// The engine accepts the token in the Authorization header; the
		// phone remote uses a subprotocol only because browsers can't set
		// headers on a WebSocket.
		const socket = new WebSocket(this.wsURL, {
			headers: { Authorization: `Bearer ${this.token}` },
			handshakeTimeout: 5000,
		})
		this.socket = socket
		let opened = false
		let unauthorized = false

		socket.on('open', () => {
			opened = true
			this.retryDelay = 1000
			this.emit('connected')
		})
		socket.on('message', (data) => {
			try {
				this.emit('state', JSON.parse(data.toString()))
			} catch (e) {
				this.emit('warning', `unreadable state from Pulse: ${e.message}`)
			}
		})
		socket.on('unexpected-response', (_req, res) => {
			unauthorized = res.statusCode === 401
			if (!unauthorized) this.emit('warning', `Pulse answered the state feed with HTTP ${res.statusCode}`)
			socket.terminate()
		})
		socket.on('error', (e) => {
			if (!opened && !unauthorized) this.emit('unreachable', e.code ?? e.message)
		})
		socket.on('close', () => {
			if (this.socket !== socket) return
			this.socket = null
			if (opened) this.emit('disconnected')
			if (this.closed) return
			if (unauthorized) {
				this.emit('unauthorized')
				return
			}
			this.retryTimer = setTimeout(() => this.connect(), this.retryDelay)
			this.retryDelay = Math.min(this.retryDelay * 2, 10000)
		})
	}

	close() {
		this.closed = true
		clearTimeout(this.retryTimer)
		const socket = this.socket
		this.socket = null
		socket?.terminate()
	}
}

/**
 * A variable-safe id from a show item's name: `Walk-in loop` → `walk_in_loop`.
 * Names that come out the same get a number, so every item keeps its own.
 */
export function slugs(names) {
	const used = new Map()
	return names.map((name) => {
		const base =
			String(name)
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '_')
				.replace(/^_+|_+$/g, '') || 'item'
		const count = (used.get(base) ?? 0) + 1
		used.set(base, count)
		return count === 1 ? base : `${base}_${count}`
	})
}

/** `M:SS`, or `H:MM:SS` past an hour — as Pulse's own clocks read. */
export function clock(seconds) {
	const negative = seconds < 0
	const total = Math.trunc(Math.abs(seconds))
	const h = Math.floor(total / 3600)
	const m = Math.floor((total % 3600) / 60)
	const s = String(total % 60).padStart(2, '0')
	const sign = negative ? '-' : ''
	return h > 0 ? `${sign}${h}:${String(m).padStart(2, '0')}:${s}` : `${sign}${m}:${s}`
}

/**
 * The show's timers, props, independent lists and target sets, each with
 * the id its variables and presets use. Target sets come from the state's
 * `canvases` — Pulse's name for them underneath.
 */
export function showItems(state) {
	const timers = state?.timers ?? []
	const props = state?.props ?? []
	const lists = state?.independentLists ?? []
	const sets = state?.canvases ?? []
	const timerIDs = slugs(timers.map((t) => t.name))
	const propIDs = slugs(props.map((p) => p.name))
	const listIDs = slugs(lists.map((l) => l.name))
	const setIDs = slugs(sets)
	return {
		timers: timers.map((timer, i) => ({ ...timer, id: timerIDs[i] })),
		props: props.map((prop, i) => ({ ...prop, id: propIDs[i] })),
		lists: lists.map((list, i) => ({ ...list, id: listIDs[i] })),
		targetSets: sets.map((name, i) => ({ name, id: setIDs[i] })),
	}
}

/** A clear for one plane of one target set: `POST /targetsets/{name}/{plane}/clear`. */
export function planeClearPath(targetSet, plane) {
	return `/targetsets/${segment(targetSet)}/${plane === 'background' ? 'background' : 'foreground'}/clear`
}

/**
 * A stage layout switch: one stage screen by name, or every stage screen
 * when the name is empty.
 */
export function stageLayoutPath(screen, layout) {
	const name = String(screen ?? '').trim()
	return name ? `/stage/${segment(name)}/layout/${segment(layout)}` : `/stage/layout/${segment(layout)}`
}

/** Companion variable values for a state snapshot. */
export function variablesFromState(state) {
	const media = state.liveMedia ?? {}
	const values = {
		show_name: state.showName ?? '',
		live_cue_number: state.liveCueNumber ?? '',
		live_cue_name: state.liveCueName ?? '',
		next_cue_number: state.nextCueNumber ?? '',
		next_cue_name: state.nextCueName ?? '',
		is_leader: state.isLeader === true,
		missing_assets: state.missingAssetCount ?? 0,
		unresolvable_assets: state.unresolvableAssetCount ?? 0,
		missing_devices: state.missingDeviceCount ?? 0,
		live_cue_type: state.liveCueType ?? '',
		next_cue_type: state.nextCueType ?? '',
		stage_message: state.stageMessage ?? '',
		active_look: state.activeLook ?? '',
		announcement_cue: state.announcementCueNumber ?? '',
		cleared: (state.cleared ?? []).join(', '),
		live_cue_elapsed: clock(state.liveCueElapsed ?? 0),
		live_cue_elapsed_seconds: state.liveCueElapsed ?? 0,
		media_remaining: media.remainingDisplay ?? '0:00',
		media_remaining_seconds: media.remaining ?? 0,
		media_position: clock(media.position ?? 0),
		media_duration: clock(media.duration ?? 0),
		is_paused: state.isPaused === true,
		live_cue_notes: state.liveCueNotes ?? '',
		next_cue_notes: state.nextCueNotes ?? '',
	}
	const { timers, props, lists } = showItems(state)
	for (const list of lists) {
		values[`list_${list.id}_cue`] = list.liveCueNumber ?? ''
		values[`list_${list.id}_cue_name`] = list.liveCueName ?? ''
	}
	for (const timer of timers) {
		values[`timer_${timer.id}`] = timer.display
		values[`timer_${timer.id}_seconds`] = timer.seconds
	}
	for (const prop of props) values[`prop_${prop.id}`] = prop.isVisible === true
	return values
}

/** Dropdown choices for picking a cue, labelled as an operator reads them. */
export function cueChoices(cues) {
	const seen = new Set()
	const choices = []
	for (const cue of cues) {
		// Cue numbers are what the API fires by, so a number shared by two
		// playlists is one choice; the first one is what it fires.
		if (!cue.number || seen.has(cue.number)) continue
		seen.add(cue.number)
		choices.push({ id: cue.number, label: cue.name ? `${cue.number} · ${cue.name}` : cue.number })
	}
	return choices
}

/** A path segment, escaped: names can hold spaces and slashes. */
export function segment(value) {
	return encodeURIComponent(String(value).trim())
}
