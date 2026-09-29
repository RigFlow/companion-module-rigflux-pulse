// The client against a fake engine that follows Pulse's control API
// contract: bearer token on every route but /health, 401 with an
// {"error"} body otherwise, and a WebSocket at /api/v1/events that sends
// the whole state on connect and after each change.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { once } = require('node:events')
const { WebSocketServer } = require('ws')
const { PulseClient, variablesFromState, cueChoices, segment } = require('../src/pulse')

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
	assert.deepEqual(
		variablesFromState({
			showName: 'Sunday',
			liveCueNumber: '',
			liveCueName: '',
			nextCueNumber: '1',
			nextCueName: 'Walk-in',
			isLeader: false,
			missingAssetCount: 2,
			unresolvableAssetCount: 0,
		}),
		{
			show_name: 'Sunday',
			live_cue_number: '',
			live_cue_name: '',
			next_cue_number: '1',
			next_cue_name: 'Walk-in',
			is_leader: false,
			missing_assets: 2,
			unresolvable_assets: 0,
		},
	)
})

test('names with spaces and slashes are one path segment', () => {
	assert.equal(segment(' Pre show / loop '), 'Pre%20show%20%2F%20loop')
})
