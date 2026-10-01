// The client against a fake engine that follows Pulse's control API
// contract: bearer token on every route but /health, 401 with an
// {"error"} body otherwise, and a WebSocket at /api/v1/events that sends
// the whole state on connect and after each change.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { once } from 'node:events'
import { WebSocketServer } from 'ws'
import {
	PulseClient,
	variablesFromState,
	cueChoices,
	segment,
	slugs,
	clock,
	showItems,
	planeClearPath,
	stageLayoutPath,
} from '../src/pulse.js'

const TOKEN = 'a'.repeat(64)

function fakeEngine() {
	const requests = []
	const state = {
		showName: 'Sunday',
		liveCueID: '',
		liveCueNumber: '1',
		liveCueName: 'Walk-in',
		nextCueNumber: '2',
		nextCueName: 'Countdown',
		isLeader: true,
		mediaRoot: '',
		missingAssetCount: 0,
		unresolvableAssetCount: 0,
	}
	const server = http.createServer((req, res) => {
		let body = ''
		req.on('data', (chunk) => (body += chunk))
		req.on('end', () => {
			requests.push({ method: req.method, url: req.url, auth: req.headers.authorization, body })
			res.setHeader('Content-Type', 'application/json')
			if (req.headers.authorization !== `Bearer ${TOKEN}`) {
				res.writeHead(401).end(JSON.stringify({ error: 'missing or invalid bearer token' }))
			} else if (req.url === '/api/v1/playlists') {
				res.end(
					JSON.stringify({
						playlists: [
							{
								name: 'Service',
								cues: [
									{ id: 'x', number: '1', name: 'Walk-in', isLive: true },
									{ id: 'y', number: '2', name: 'Countdown', isLive: false },
								],
							},
							{
								name: 'Lobby',
								cues: [
									{ id: 'z', number: '2', name: 'Duplicate', isLive: false },
									{ id: 'w', number: '10', name: '', isLive: false },
								],
							},
						],
					}),
				)
			} else if (req.url === '/api/v1/transport/next') {
				Object.assign(state, { liveCueNumber: '2', liveCueName: 'Countdown', nextCueNumber: '', nextCueName: '' })
				for (const client of wss.clients) client.send(JSON.stringify(state))
				res.end(JSON.stringify(state))
			} else if (req.url === '/api/v1/stage/layouts') {
				res.end(
					JSON.stringify({
						layouts: [
							{ name: 'Band', width: 1920, height: 1080 },
							{ name: 'Speaker', width: 1920, height: 1080 },
						],
					}),
				)
			} else if (req.url === '/api/v1/cues/99/go') {
				res.writeHead(404).end(JSON.stringify({ error: 'no cue numbered 99' }))
			} else {
				res.writeHead(204).end()
			}
		})
	})
	const wss = new WebSocketServer({ noServer: true })
	server.on('upgrade', (req, socket, head) => {
		if (req.url !== '/api/v1/events' || req.headers.authorization !== `Bearer ${TOKEN}`) {
			socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n')
			return
		}
		wss.handleUpgrade(req, socket, head, (ws) => ws.send(JSON.stringify(state)))
	})
	return { server, wss, requests, state }
}

async function start() {
	const engine = fakeEngine()
	engine.server.listen(0, '127.0.0.1')
	await once(engine.server, 'listening')
	engine.port = engine.server.address().port
	engine.stop = () => {
		for (const client of engine.wss.clients) client.terminate()
		engine.server.closeAllConnections()
		engine.server.close()
	}
	return engine
}

test('commands carry the bearer token and the engine’s refusals come back as its message', async () => {
	const engine = await start()
	const client = new PulseClient({ host: '127.0.0.1', port: engine.port, token: TOKEN })
	try {
		assert.equal(await client.request('POST', '/stage-message', { text: 'Five minutes' }), null)
		const sent = engine.requests.at(-1)
		assert.equal(sent.auth, `Bearer ${TOKEN}`)
		assert.deepEqual(JSON.parse(sent.body), { text: 'Five minutes' })

		await assert.rejects(client.request('POST', '/cues/99/go'), { status: 404, message: 'no cue numbered 99' })
	} finally {
		engine.stop()
	}
})

test('a wrong token is a 401, not a crash', async () => {
	const engine = await start()
	const client = new PulseClient({ host: '127.0.0.1', port: engine.port, token: 'wrong' })
	try {
		await assert.rejects(client.request('POST', '/transport/next'), { status: 401 })
	} finally {
		engine.stop()
	}
})

test('an engine that isn’t there is a status-0 error naming the address', async () => {
	const client = new PulseClient({ host: '127.0.0.1', port: 1, token: TOKEN })
	await assert.rejects(client.request('GET', '/state'), (e) => e.status === 0 && e.message.includes('127.0.0.1:1'))
})

test('the state feed sends the state on connect and again after a GO', async () => {
	const engine = await start()
	const client = new PulseClient({ host: '127.0.0.1', port: engine.port, token: TOKEN })
	try {
		client.connect()
		const [first] = await once(client, 'state')
		assert.equal(first.liveCueNumber, '1')
		const next = once(client, 'state')
		await client.request('POST', '/transport/next')
		const [second] = await next
		assert.equal(second.liveCueNumber, '2')
	} finally {
		client.close()
		engine.stop()
	}
})

test('the state feed stops retrying when the token is turned away', async () => {
	const engine = await start()
	const client = new PulseClient({ host: '127.0.0.1', port: engine.port, token: 'wrong' })
	try {
		client.connect()
		await once(client, 'unauthorized')
		assert.equal(client.retryTimer, null)
	} finally {
		client.close()
		engine.stop()
	}
})

test('the state feed reconnects when the engine comes back', async () => {
	const engine = await start()
	const port = engine.port
	const client = new PulseClient({ host: '127.0.0.1', port, token: TOKEN })
	try {
		client.connect()
		await once(client, 'state')
		const lost = once(client, 'disconnected')
		engine.stop()
		await lost

		const back = fakeEngine()
		back.server.listen(port, '127.0.0.1')
		await once(back.server, 'listening')
		try {
			const [state] = await once(client, 'state')
			assert.equal(state.showName, 'Sunday')
		} finally {
			for (const c of back.wss.clients) c.terminate()
			back.server.closeAllConnections()
			back.server.close()
		}
	} finally {
		client.close()
	}
})

test('cues come from every playlist, and a number shared by two is one choice', async () => {
	const engine = await start()
	const client = new PulseClient({ host: '127.0.0.1', port: engine.port, token: TOKEN })
	try {
		const cues = await client.cues()
		assert.equal(cues.length, 4)
		assert.equal(cues[2].playlist, 'Lobby')
		assert.deepEqual(cueChoices(cues), [
			{ id: '1', label: '1 · Walk-in' },
			{ id: '2', label: '2 · Countdown' },
			{ id: '10', label: '10' },
		])
	} finally {
		engine.stop()
	}
})

test('variables fill from a state snapshot, with blanks when idle', () => {
	const values = variablesFromState({
		showName: 'Sunday',
		liveCueNumber: '',
		liveCueName: '',
		nextCueNumber: '1',
		nextCueName: 'Walk-in',
		isLeader: false,
		missingAssetCount: 2,
		unresolvableAssetCount: 0,
	})
	assert.deepEqual(values, {
		show_name: 'Sunday',
		live_cue_number: '',
		live_cue_name: '',
		next_cue_number: '1',
		next_cue_name: 'Walk-in',
		is_leader: false,
		missing_assets: 2,
		unresolvable_assets: 0,
		stage_message: '',
		active_look: '',
		announcement_cue: '',
		cleared: '',
		live_cue_elapsed: '0:00',
		live_cue_elapsed_seconds: 0,
		media_remaining: '0:00',
		media_remaining_seconds: 0,
		media_position: '0:00',
		media_duration: '0:00',
		missing_devices: 0,
		live_cue_type: '',
		next_cue_type: '',
		is_paused: false,
		live_cue_notes: '',
		next_cue_notes: '',
	})
})

test('timers, props, clears and clip time become variables', () => {
	const values = variablesFromState({
		stageMessage: 'Five minutes',
		activeLook: 'House only',
		announcementCueNumber: '90',
		cleared: ['media', 'slide'],
		liveCueElapsed: 3725,
		liveMedia: { position: 30, duration: 120, remaining: 90, remainingDisplay: '1:30' },
		timers: [
			{ name: 'Sermon', kind: 'countdown', isRunning: true, seconds: -14, display: '-0:14' },
			{ name: 'Walk-in', kind: 'countUp', isRunning: false, seconds: 0, display: '0:00' },
		],
		props: [
			{ name: 'Lower third', isVisible: true },
			{ name: 'Logo', isVisible: false },
		],
	})
	assert.equal(values.stage_message, 'Five minutes')
	assert.equal(values.active_look, 'House only')
	assert.equal(values.announcement_cue, '90')
	assert.equal(values.cleared, 'media, slide')
	assert.equal(values.live_cue_elapsed, '1:02:05')
	assert.equal(values.media_remaining, '1:30')
	assert.equal(values.media_position, '0:30')
	assert.equal(values.timer_sermon, '-0:14')
	assert.equal(values.timer_sermon_seconds, -14)
	assert.equal(values.timer_walk_in, '0:00')
	assert.equal(values.prop_lower_third, true)
	assert.equal(values.prop_logo, false)
})

test('pause, notes and independent lists become variables', () => {
	const values = variablesFromState({
		isPaused: true,
		liveCueNotes: 'Wait for the band',
		nextCueNotes: 'Pastor to lectern',
		independentLists: [{ name: 'Foyer loop', liveCueNumber: 'F2', liveCueName: 'Coffee' }],
	})
	assert.equal(values.is_paused, true)
	assert.equal(values.live_cue_notes, 'Wait for the band')
	assert.equal(values.next_cue_notes, 'Pastor to lectern')
	assert.equal(values.list_foyer_loop_cue, 'F2')
	assert.equal(values.list_foyer_loop_cue_name, 'Coffee')
	assert.deepEqual(
		showItems({ independentLists: [{ name: 'Foyer loop' }] }).lists.map((l) => l.id),
		['foyer_loop'],
	)
})

test('names become variable ids, and a clash gets a number', () => {
	assert.deepEqual(slugs(['Walk-in loop', 'walk in loop', 'Logo!', '***']), [
		'walk_in_loop',
		'walk_in_loop_2',
		'logo',
		'item',
	])
})

test('clocks read as Pulse’s do, keeping a countdown’s sign', () => {
	assert.equal(clock(0), '0:00')
	assert.equal(clock(59.9), '0:59')
	assert.equal(clock(3725), '1:02:05')
	assert.equal(clock(-14), '-0:14')
})

test('an older engine without the new fields still gives every variable', () => {
	const values = variablesFromState({ showName: 'Old' })
	assert.equal(values.media_remaining, '0:00')
	assert.equal(values.cleared, '')
	assert.deepEqual(showItems({ showName: 'Old' }), { timers: [], props: [], lists: [], targetSets: [] })
	assert.equal(values.is_paused, false)
	assert.equal(values.live_cue_notes, '')
})

test('names with spaces and slashes are one path segment', () => {
	assert.equal(segment(' Pre show / loop '), 'Pre%20show%20%2F%20loop')
})

test('stage layouts come from the engine, and an engine without them has none', async () => {
	const engine = await start()
	const client = new PulseClient({ host: '127.0.0.1', port: engine.port, token: TOKEN })
	try {
		assert.deepEqual(await client.stageLayouts(), ['Band', 'Speaker'])
	} finally {
		engine.stop()
	}
	const older = http.createServer((_req, res) => res.writeHead(404).end(JSON.stringify({ error: 'not found' })))
	older.listen(0, '127.0.0.1')
	await once(older, 'listening')
	try {
		const client = new PulseClient({ host: '127.0.0.1', port: older.address().port, token: TOKEN })
		assert.deepEqual(await client.stageLayouts(), [])
	} finally {
		older.close()
	}
})

test('target sets come from the state, with ids for presets', () => {
	const { targetSets } = showItems({ canvases: ['Main', 'Side wall', 'Main'] })
	assert.deepEqual(targetSets, [
		{ name: 'Main', id: 'main' },
		{ name: 'Side wall', id: 'side_wall' },
		{ name: 'Main', id: 'main_2' },
	])
	assert.deepEqual(showItems(null).targetSets, [])
})

test('a plane clear and a layout switch go to the engine’s routes', () => {
	assert.equal(planeClearPath('Side wall', 'foreground'), '/targetsets/Side%20wall/foreground/clear')
	assert.equal(planeClearPath('Main', 'background'), '/targetsets/Main/background/clear')
	assert.equal(planeClearPath('Main', 'anything else'), '/targetsets/Main/foreground/clear')
	assert.equal(stageLayoutPath('Wedge L', 'Speaker'), '/stage/Wedge%20L/layout/Speaker')
	assert.equal(
		stageLayoutPath('  ', 'Band / keys'),
		'/stage/layout/Band%20%2F%20keys',
		'empty switches every stage screen',
	)
})

test('the plane clear and layout switch actions send what they say', async () => {
	const { UpdateActions } = await import('../src/actions.js')
	const sent = []
	const self = {
		setActionDefinitions(definitions) {
			this.actions = definitions
		},
		send: async (method, path) => sent.push(`${method} ${path}`),
	}
	UpdateActions(self, [], showItems({ canvases: ['Main'] }), ['Band', 'Speaker'])
	assert.deepEqual(
		self.actions.clear_plane.options[0].choices.map((c) => c.id),
		['Main'],
	)
	assert.equal(self.actions.stage_layout.options[1].default, 'Band')
	await self.actions.clear_plane.callback({ options: { set: 'Main', plane: 'background' } })
	await self.actions.stage_layout.callback({ options: { screen: '', layout: 'Speaker' } })
	await self.actions.stage_layout.callback({ options: { screen: 'Wedge', layout: 'Band' } })
	await self.actions.stage_layout.callback({ options: { screen: 'Wedge', layout: '' } })
	assert.deepEqual(sent, [
		'POST /targetsets/Main/background/clear',
		'POST /stage/layout/Speaker',
		'POST /stage/Wedge/layout/Band',
	])
})
