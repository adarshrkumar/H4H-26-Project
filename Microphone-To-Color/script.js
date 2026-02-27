// Global variables for Web Audio API and canvas
let audioContext = null;
let analyser = null;
let dataArray = null;
let mediaStream = null;
let sourceNode = null;
const canvas = document.getElementById('colorCanvas');
const canvasCtx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

// Variable to track the animation frame ID for stopping the loop
let animationFrameId = null;

// Set canvas size (these dimensions will be scaled by CSS)
canvas.width = 600;
canvas.height = 300;

// Initial state: Draw default white canvas
canvasCtx.fillStyle = '#fff';
canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

startBtn.addEventListener('click', startCapture);
stopBtn.addEventListener('click', stopCapture);

/**
 * Requests microphone access and begins visualization.
 */
async function startCapture() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Create AudioContext
        if (!audioContext || audioContext.state === 'closed') {
            audioContext = new AudioContext();
        }
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        // Set up analyser
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Connect mic stream to analyser.
        // Do NOT connect analyser -> destination: that would feed back through speakers.
        sourceNode = audioContext.createMediaStreamSource(mediaStream);
        sourceNode.connect(analyser);

        // Handle the user revoking mic access externally
        mediaStream.getAudioTracks()[0].onended = stopCapture;

        startBtn.disabled = true;
        stopBtn.disabled = false;

        if (!animationFrameId) {
            drawVisualization();
        }

    } catch (err) {
        if (err.name !== 'NotAllowedError') {
            console.error('Error starting microphone:', err);
            alert('Could not access the microphone.');
        }
    }
}

/**
 * Stops the microphone capture, disconnects nodes, and resets UI.
 */
function stopCapture() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    if (sourceNode) {
        sourceNode.disconnect();
        sourceNode = null;
    }
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    analyser = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    canvasCtx.fillStyle = '#fff';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
}

/**
 * The main visualization loop. Gets frequency data and updates the canvas color.
 */
function drawVisualization() {
    if (!sourceNode || !analyser || !canvasCtx) {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        canvasCtx.fillStyle = '#fff';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }

    animationFrameId = requestAnimationFrame(drawVisualization);

    analyser.getByteFrequencyData(dataArray);

    // --- Color Mapping Logic ---
    // Uses a log-scale spectral centroid for hue. Since human hearing is
    // logarithmic, this spreads all audio evenly across the full hue range
    // instead of clustering near red.

    let sum = 0;
    let weightedLogSum = 0;
    let totalAmplitude = 0;

    // Start at 1 to avoid log(0)
    for (let i = 1; i < dataArray.length; i++) {
        sum += dataArray[i];
        weightedLogSum += Math.log2(i) * dataArray[i];
        totalAmplitude += dataArray[i];
    }

    const averageAmplitude = sum / dataArray.length; // Value from 0-255

    // Spectral centroid on a log frequency scale -> Hue (0 to 360 degrees)
    const logCentroid = totalAmplitude > 0 ? weightedLogSum / totalAmplitude : 0;
    const hue = (logCentroid / Math.log2(dataArray.length)) * 360;

    // Map average amplitude (volume) to Lightness (10% to 90%)
    const lightness = 10 + (averageAmplitude / 255) * 80;

    const saturation = 70; // Percentage

    canvasCtx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
}
