'use strict'

const http = require('http')

const stack = []

const throttle = (func, limit) => {
	let inThrottle
	return function() {
		let ons = {}

		if (!inThrottle) {
			func.apply(this, arguments)
			inThrottle = true

			const throttleFunc = ()=>{
				if (stack.length > 0) {
					const dt = stack.shift()
					const httpClient = func.apply(null, dt.arguments)
					Object.getOwnPropertyNames(dt.ons).forEach(code=>httpClient.on(code, dt.ons[code]))

					setTimeout(throttleFunc, limit)
				}
				inThrottle = false
			}

			setTimeout(throttleFunc, limit)
		} else {
			stack.push({ons, arguments})
		}

		return {on: (title, cb) => (ons[title] = cb)}
	}
}

const get = throttle(http.get, 1000)

module.exports = function(config, callback) {
	let options = {
		host: config.host,
		path: config.path,
		port: config.port,
		headers: {
			'user-agent': config.userAgent
		},
		json: true
	}

	// If you are looking to debug, this would be a great place to put:
	// console.log(options.path);

	// Make the request
	get(options, res => {
		// Server did not like our request because ...

		// Not authorized
		if (res.statusCode === 401) {
			const err = new Error('Authorization required')
			err.statusCode = res.statusCode
			return callback(err)
		}

		// A generic server error
		else if (res.statusCode === 500) {
			const err = new Error('Server side issue')
			err.statusCode = res.statusCode
			return callback(err)
		}

		// We are being rate limited
		else if (res.statusCode === 503) {
			const err = new Error('Rate limited')
			err.statusCode = res.statusCode
			return callback(err)
		}

		// It wasn't found
		else if (res.statusCode === 404) {
			const err = new Error('Not Found')
			err.statusCode = res.statusCode
			return callback(err)
		}

		// Some other reason
		else if (res.statusCode !== 200 && res.statusCode !== 400) {
			const err = new Error("Well that didn't work...")
			err.statusCode = res.statusCode
			return callback(err)
		}

		// Output data
		let data = ''

		// Gather up all the data chunks
		res.on('data', chunk => {
			data += chunk
		})

		// ... When they are all gathered
		res.on('end', () => {
			// ... try to
			try {
				// ... parse the data as JSON
				data = JSON.parse(data)

				// ... catching any errors
			} catch (e) {
				return callback(new Error('Could not parse response as JSON'))
			}

			// 400 errors contain useful information
			if (res.statusCode === 400) {
				const err = new Error('Bad request')
				err.statusCode = res.statusCode
				err.data = data
				return callback(err)
			}

			// Should be good, call the callback
			callback(null, data)
		})

		// Error on request
	}).on('error', e => callback(e))
}
