// Talks to a Pulse engine's control API: plain HTTP for commands, and a
// WebSocket that pushes the engine's whole state on connect and after
// every change. Nothing here knows about Companion, so it can be tested
// against a fake engine.

const { EventEmitter } = require('node:events')
const WebSocket = require('ws')

const API = '/api/v1'

/** A failed request, with the engine's own message when it sent one. */
class PulseError extends Error {
	constructor(status, message) {
		super(message)
		this.status = status
	}
}

class PulseClient extends EventEmitter {
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

/** Companion variable values for a state snapshot. */
function variablesFromState(state) {
	return {
		show_name: state.showName ?? '',
		live_cue_number: state.liveCueNumber ?? '',
		live_cue_name: state.liveCueName ?? '',
		next_cue_number: state.nextCueNumber ?? '',
		next_cue_name: state.nextCueName ?? '',
		is_leader: state.isLeader === true,
		missing_assets: state.missingAssetCount ?? 0,
		unresolvable_assets: state.unresolvableAssetCount ?? 0,
	}
}

/** Dropdown choices for picking a cue, labelled as an operator reads them. */
function cueChoices(cues) {
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
function segment(value) {
	return encodeURIComponent(String(value).trim())
}

module.exports = { PulseClient, PulseError, variablesFromState, cueChoices, segment }
