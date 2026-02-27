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
const moodDisplay = document.getElementById('mood');

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

// Requests microphone access and begins visualization.
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

// Stops the microphone capture, disconnects nodes, and resets UI.
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
    moodDisplay.textContent = '';
    canvasCtx.fillStyle = '#fff';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
}

// The main visualization loop. Gets frequency data and updates the canvas color.
function drawVisualization() {
    if (!sourceNode || !analyser || !canvasCtx) {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        moodDisplay.textContent = '';
        canvasCtx.fillStyle = '#fff';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }

    animationFrameId = requestAnimationFrame(drawVisualization);

    analyser.getByteFrequencyData(dataArray);

    const { mood, color } = audioToColor(dataArray);
    moodDisplay.textContent = mood;

    canvasCtx.fillStyle = color;
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
}
