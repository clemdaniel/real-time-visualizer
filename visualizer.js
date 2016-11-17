// initialize
let canvas = document.querySelector('.visualizer')
let vis = new Visualizer(canvas)
vis.start()

// GUI controls
let inputSel = document.querySelector('#input')
let timeTypeSel = document.querySelector('#timeType')
let freqTypeSel = document.querySelector('#freqType')
inputSel.onchange = function() {
	vis.input = this.value
	if (this.value == 'time') {
		timeTypeSel.style.display = ''
		vis.type = timeTypeSel.value
		freqTypeSel.style.display = 'none'
	} else if (this.value == 'frequency') {
		freqTypeSel.style.display = ''
		vis.type = freqTypeSel.value
		timeTypeSel.style.display = 'none'
	}
	if (this.value == 'off') {
		vis.stop()
	} else {
		vis.start()
	}
}

timeTypeSel.onchange = function() {
	vis.type = this.value
}

freqTypeSel.onchange = function() {
	vis.type = this.value
}

// Visualizer class
function Visualizer(canvas) {
	this.input = 'frequency'
	this.type = 'simple'
	let analyser, ctx, WIDTH, HEIGHT, activeFrame
	let status = 'stopped'
	let history = new MovingAverage(20)
	
	this.stop = function() {
		status = 'stopped'
		console.log('status: ' + status)
	}

	this.start = function() {
		status = 'running'
		this.visualize()
	}

	this.init = function(canvas) {
		// make sure getUserMedia calls the correct function for the client's browser
		navigator.getUserMedia = (navigator.getUserMedia ||
						  navigator.webkitGetUserMedia ||
						  navigator.mozGetUserMedia ||
						  navigator.msGetUserMedia)

		let audioCtx = new (window.AudioContext || window.webkitAudioContext)()
		//initalize analyser, set params TODO consider allowing these to be set externally
		analyser = audioCtx.createAnalyser()
		analyser.minDecibels = -90
		analyser.maxDecibels = -10
		analyser.smoothingTimeConstant = 0.85 //0.85

		// set up canvas context for visualizer
		ctx = canvas.getContext('2d')
		
		// make sure canvas is the correct width
		canvas.setAttribute('width', canvas.parentNode.clientWidth)

		// get user media and begin recording/visualizing
		navigator.getUserMedia(
			// audio only
			{
				audio: true
			},
			// Success callback
			stream => {
				source = audioCtx.createMediaStreamSource(stream)
				source.connect(analyser)
			},
			// Error callback
			err => {
				console.log('getUserMedia failed: ' + err)
			}
		)
	}

	// Visually represent the processed state
	this.visualize = function() {
		if (status === 'running') {
			let data = this.processAudio()
			// clear canvas between frames
			ctx.clearRect(0, 0, canvas.width, canvas.height)
			
			// execute current draw function
			this[this.type + 'Visual'](data)
			
			activeFrame = requestAnimationFrame(this.visualize.bind(this))
		}
	}
	
	// Process audio to determine how the visualization should be
	// adapted based on the current audio input
	const curFreq = document.querySelector('#curFreq')
	let recent = [];
	this.processAudio = function() {
		let data = new Uint8Array(analyser.frequencyBinCount)
		let result = {}
		if (this.input == 'time') {
			analyser.getByteTimeDomainData(data)
			// Estimate musical note
			result.note = this.estimateMusicalNote(data, history)
		} else if (this.input == 'frequency') {
			analyser.getByteFrequencyData(data)
		}
		result.raw = data
		return result
	}

	this.simpleVisual = function(data) {
		// simple wave form and frequency plots
		ctx.beginPath()
		let interval = canvas.width / data.raw.length
		ctx.strokeStyle = data.strokeStyle || 'black'
		data.raw.forEach((item, i) => {
			if (this.input === 'time') {
				// plot waveform
				if (i == 0) {
					ctx.moveTo(i*interval, item)
				} else {
					ctx.lineTo(i*interval, item)
				}
			} else if (this.input == 'frequency') {
				// plot frequency
				if (i == 0) {
					ctx.moveTo(i*interval, 256 - item)
				} else {
					ctx.lineTo(i*interval, 256 - item)	
				}
			}
		})
		ctx.stroke()
	}
	
	this.amplitudeVisual = function(data) {
		//pulsate more brightly when the amplitude of the input is greatest
		let gradient = ctx.createLinearGradient(0, 0, canvas.width, 0)
		let length = data.raw.length
		data.raw.forEach((item, i) => {
			let amp = item > 128 ? item - 128 : 128 - item
			amp *= 2
			// TODO consider doubling amp to use full color channels
			let color = 'rgb('
			if (data.multiColor) {
				if (data.note.freq > 1600) {
					color += '0, 0,' + amp + ')'
				} else if (data.note.freq > 700) {
					color += amp + ',0,' + amp + ')'
				} else {
						color += amp + ',0,0)'
				}
			} else {
				color += '0,' + amp + ',0)'
			}
			gradient.addColorStop(i/(length - 1), color)
		})
		ctx.fillStyle = gradient
		ctx.fillRect(0, 0, canvas.width, canvas.height)
	}

	this.simpleWithAmplitudeVisual = function(data) {
		this.amplitudeVisual(data)
		data.strokeStyle = 'white'
		this.simpleVisual(data)
	}
	
	this.simpleWithAmplitudeAndFrequencyVisual = function(data) {
		data.multiColor = true
		this.amplitudeVisual(data)
		data.strokeStyle = 'white'
		this.simpleVisual(data)
	}

	this.estimateMusicalNote = function(data, history) {
		let lastPos = 0
		let pitchSamples = []
		let lastItem = 0
		data.forEach((item, i) => {
			if (item > 128 &&  lastItem <= 128) {
				const elapsedSteps = i - lastPos
				lastPos = i

				const hertz = 1 / (elapsedSteps / 44100)
				pitchSamples.push(hertz)
			}

			lastItem = item
		})
		pitchSamples.shift() //remove first sample because it is often an huge outlier
		const estimatedFrequency = Util.average(pitchSamples)
		const estimatedNote = noteName(estimatedFrequency)
		history.push(estimatedNote)
		console.log('Est: ' + estimatedNote)
		const historicMode = history.mode()
		console.log('Mode of history: ' + historicMode)
		document.querySelector('#curFreq').innerHTML = 'Estimated note: ' + historicMode
		
		return {
			name: historicMode,
			freq: estimatedFrequency
		}
	}

	this.init(canvas)
}

// lifo moving average window
function MovingAverage(maxSize) {
	let array = []

	this.push = function(element) {
		if (array.length >= maxSize) {
			array.shift()
		}
		array.push(element)
	}

	this.average = function() {
		return Util.average(array)
	}

	this.mode = function() {
		return Util.mode(array)
	}	
}

// statistical utilitiy functions
let Util = {
	average: function(array) {
		let sum = 0
		for (let i=0; i<array.length; i++) {
			sum += array[i]
		}
		return sum / array.length
	},
	mode: function(array) {
		let counts = {}
		array.forEach((value) => {
			if (!counts[value]) {
				counts[value] = 0
			} else {
				counts[value]++
			}
		})
		return this.maxKey(counts)
	},
	modeFromFreqArray: function(array) {
		let noteArray = []
		array.forEach((value, index) => {
			noteArray.push(noteName(value))
		})
		return this.mode(noteArray)
	},
	maxKey: function(obj) {
		let max = Object.keys(obj)[0];
		for (let f in obj) {
			if (obj[f] > max) {
				max = f
			}
		}
		return max
	}
}
