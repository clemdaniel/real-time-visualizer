// initialize
const canvas = document.querySelector('.visualizer')
const toolbar = document.querySelector('#toolbar')
const vis = new Visualizer(canvas)

// run intro animation
const introDiv = document.querySelector('#introAnimation')

introDiv.querySelector('#GO').onclick = () => {
	// show canvas and controls
	canvas.style.display = 'block'
	toolbar.style.display = 'block'
	// hide intro overlay
	introDiv.style.display = 'none'
	// initialize visualizer
	vis.start()
}
introAnimation(introDiv)




// GUI controls --------------------------------------------------------
const inputSel = document.querySelector('#input')
const timeTypeSel = document.querySelector('#timeType')
const freqTypeSel = document.querySelector('#freqType')
const calcNote = document.querySelector('#calculateNote')
calcNote.checked = false // initially uncheck this option
const curFreq = document.querySelector('#curFreq')
const toggleMenu = document.querySelector('#toggleMenu')
const upperThreshInput = document.querySelector('#upperFreqThresh')
const lowerThreshInput = document.querySelector('#lowerFreqThresh')

// set default selected values
// FIX for Firefox only because of bizarre select option behavior
inputSel.value = 'time'
timeTypeSel.value = 'triRadial'

inputSel.onchange = function() {
	vis.input = this.value
	if (this.value == 'time') {
		timeTypeSel.style.display = ''
		vis.type = timeTypeSel.value
		freqTypeSel.style.display = 'none'
		if (calcNote.checked) curFreq.style.display = 'block'
		calcNote.disabled = false
	} else if (this.value == 'frequency') {
		freqTypeSel.style.display = ''
		vis.type = freqTypeSel.value
		timeTypeSel.style.display = 'none'
		curFreq.style.display = 'none'
		calcNote.disabled = true
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

calcNote.onchange = function() {
	vis.doEstimateNote = this.checked
	if (!this.checked) {
		curFreq.style.display = 'none'
	} else {
		curFreq.style.display = 'block'
	}
}

upperThreshInput.onchange = function() {
	let result = vis.setThreshold(vis.lowerThreshold, this.value)
	lowerThreshInput.value = result.lower
}

lowerThreshInput.onchange = function() {
	let result = vis.setThreshold(this.value, vis.upperThreshold)
	this.value = result.lower
}

let menuExpanded = true
toggleMenu.onclick = function() {
	menuExpanded = !menuExpanded
	if (menuExpanded) {
		toggleMenu.querySelector('i').innerHTML = 'keyboard_arrow_left'
		toolbar.querySelector('.wrapper').style.display = 'block'
	} else {
		toggleMenu.querySelector('i').innerHTML = 'keyboard_arrow_right'
		toolbar.querySelector('.wrapper').style.display = 'none'
	}
}
// ---------------------------------------------------------------------

//handle resize
window.addEventListener('resize', function() {
	vis.setDimensions(window.innerWidth, window.innerHeight)
})

// Visualizer function
function Visualizer(canvas) {
	this.input = 'time'
	this.type = 'triRadial'
	this.upperThreshold = '1600'
	this.lowerThreshold = '700'
	let analyser, ctx, activeFrame, dimensionResetTimeout
	let status = 'stopped'
	let history = new MovingAverage(20)
	
	this.stop = function() {
		status = 'stopped'
	}

	this.start = function() {
		status = 'running'
		this.visualize()
	}
	
	this.setThreshold = function(lower, upper) {
		if (upper <= lower) {
			this.upperThreshold = upper
			this.lowerThreshold = upper
		} else {
			this.lowerThreshold = lower
			this.upperThreshold = upper
		}
		return {
			lower: this.lowerThreshold,
			upper: this.upperThreshold
		}
	}

	// uses timeout to prevent rapid dimensional reset
	this.setDimensions = function(width, height) {
		clearTimeout(dimensionResetTimeout)
		dimensionResetTimeout = setTimeout(function() {
			this.width = width
			canvas.width = width
			if (height) {
				this.height = height
				canvas.height = height
			}
		}, 100)
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
		analyser.smoothingTimeConstant = 0.85

		// set up canvas context for visualizer
		ctx = canvas.getContext('2d')
		
		this.width = window.innerWidth
		this.height = window.innerHeight
		
		// make sure canvas is the correct width and height
		canvas.setAttribute('width', this.width)
		canvas.setAttribute('height', this.height)

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
	this.processAudio = function() {
		let data = new Uint8Array(analyser.frequencyBinCount)
		let result = {}
		if (this.input == 'time') {
			analyser.getByteTimeDomainData(data)
			// Calculate frequency and estimate musical note, if this.doEstimateNote is specified
			result.note = this.analyzeFrequency(data, history)
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
		let hScale = canvas.height / 256
		ctx.strokeStyle = data.strokeStyle || 'black'
		data.raw.forEach((item, i) => {
			if (this.input === 'time') {
				// plot waveform
				if (i == 0) {
					ctx.moveTo(i*interval, item * hScale)
				} else {
					ctx.lineTo(i*interval, item * hScale)
				}
			} else if (this.input == 'frequency') {
				// plot frequency
				if (i == 0) {
					ctx.moveTo(i*interval, (256 - item) * hScale)
				} else {
					ctx.lineTo(i*interval, (256 - item) * hScale)	
				}
			}
		})
		ctx.stroke()
	}
	
	this.amplitudeVisual = function(data) {
		//pulsate more brightly when the amplitude of the input is greatest
		let gradient
		if (data.diagonals) {
			if (data.note.freq > this.upperThreshold) {
				gradient = ctx.createLinearGradient(canvas.width, 0, 0, canvas.height)
			} else if (data.note.freq > this.lowerThreshold) {
				gradient = ctx.createLinearGradient(0, 0, canvas.width, 0)
			} else {
				gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
			}
		} else if (data.radial) {
			if (data.triRadial) {
				let y = canvas.height / 2
				let r = Math.min(canvas.height, canvas.width) / 2
				if (data.note.freq > this.upperThreshold) {
					let x = 3 / 4 * canvas.width
					gradient = ctx.createRadialGradient(x, y, 10, x, y, r)
				} else if (data.note.freq > this.lowerThreshold) {
					let x = 1 / 2 * canvas.width
					gradient = ctx.createRadialGradient(x, y, 10, x, y, r)
				} else {
					let x = 1 / 4 * canvas.width
					gradient = ctx.createRadialGradient(x, y, 10, x, y, r)
				}
			} else {
				let x = canvas.width / 2
				let y = canvas.height / 2
				let r = Math.max(canvas.height, canvas.width) / 2
				gradient = ctx.createRadialGradient(x, y, 10, x, y, r)
			}
		} else if (data.triVertical) {
			if (data.note.freq > this.upperThreshold) {
				let x = 2 / 3 * canvas.width
				gradient = ctx.createLinearGradient(x, 0, canvas.width, 0)
			} else if (data.note.freq > this.lowerThreshold) {
				let x = 1 / 3 * canvas.width
				gradient = ctx.createLinearGradient(x, 0, 2 * x, 0)
			} else {
				let x = 1 / 3 * canvas.width
				gradient = ctx.createLinearGradient(0, 0, x, 0)
			}
		} else {
			gradient = ctx.createLinearGradient(0, 0, canvas.width, 0)
		}
		let length = data.raw.length
		data.raw.forEach((item, i) => {
			let amp = item > 128 ? item - 128 : 128 - item
			amp *= 2 //double amplitude to use full 256 bit color channeld
			let color = 'rgb('
			if (data.multiColor) {
				if (data.note.freq > this.upperThreshold) {
					color += '0, 0,' + amp + ')'
				} else if (data.note.freq > this.lowerThreshold) {
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

	this.triVerticalVisual = function(data) {
		data.multiColor = true
		data.triVertical = true
		this.amplitudeVisual(data)
	}
	
	this.diagonalAmplitudeGradientVisual = function(data) {
		data.diagonals = true
		data.multiColor = true
		this.amplitudeVisual(data)
	}
	
	this.radialAmplitudeGradientVisual = function(data) {
		data.radial = true
		data.multiColor = true
		this.amplitudeVisual(data)
	}
	
	this.triRadialVisual = function(data) {
		data.radial = true
		data.triRadial = true
		data.multiColor = true
		this.amplitudeVisual(data)
	}
	
	this.analyzeFrequency = function(data, history) {
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
		if (this.doEstimateNote) { //estimate musical note of frequency if specified
			const estimatedNote = noteName(estimatedFrequency)
			history.push(estimatedNote)
			//console.log('Est: ' + estimatedNote)
			const historicMode = history.mode()
			//console.log('Mode of history: ' + historicMode)
			document.querySelector('#curFreq').innerHTML = 'Estimated note: ' + historicMode
			return {
				name: historicMode,
				freq: estimatedFrequency
			}
		} else {
			return {
				freq: estimatedFrequency
			}
		}
	}

	this.init(canvas)
}

// Utilities -----------------------------------------------------------


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

function introAnimation(div) {
	let span = div.querySelector('span')
	let go = div.querySelector('#GO')
	setTimeout(() => {
		span.style.color = '#111'
		setTimeout(() => {
			span.style.color = '#f0f0f0'
			span.innerHTML = 'See the sound and hear the colors.'
			//show button
			setTimeout(() => {
				go.style.display = 'block'
			}, 1500)
		}, 1500)
	}, 9000)
}