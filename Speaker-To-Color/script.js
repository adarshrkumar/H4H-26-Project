// Global variables for Web Audio API and canvas
let audioContext = null;
let analyser = null;
let dataArray = null;
let timeDomainArray = null;
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

// Starts capturing system/tab audio via getDisplayMedia and begins visualization.
async function startCapture() {
    try {
        // Request display capture — video:true is required by most browsers to surface the "Share audio" checkbox in the picker dialog.
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: true,
        });

        const audioTracks = mediaStream.getAudioTracks();
        if (audioTracks.length === 0) {
            alert('No audio track found. Make sure to check "Share audio" (or "Share tab audio") in the browser prompt.');
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
            return;
        }

        // Stop the video track immediately — we only need audio
        mediaStream.getVideoTracks().forEach(track => track.stop());

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
        timeDomainArray = new Uint8Array(analyser.fftSize);

        // Connect the captured stream to the analyser.
        // Do NOT connect analyser -> destination: that would feed the audio back through the speakers and cause an echo/feedback loop.
        sourceNode = audioContext.createMediaStreamSource(mediaStream);
        sourceNode.connect(analyser);

        // When the user stops sharing from the browser UI, clean up
        audioTracks[0].onended = stopCapture;

        startBtn.disabled = true;
        stopBtn.disabled = false;

        if (!animationFrameId) {
            drawVisualization();
        }

    } catch (err) {
        if (err.name !== 'NotAllowedError') {
            // NotAllowedError just means the user cancelled — no need to alert
            console.error('Error starting capture:', err);
            alert('Could not start audio capture.');
        }
    }
}

// Stops the capture, disconnects nodes, and resets UI.
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
    // Stop the loop if capture has ended
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
    analyser.getByteTimeDomainData(timeDomainArray);

    const { mood, color } = audioToColor(dataArray, timeDomainArray);
    moodDisplay.textContent = mood;

    canvasCtx.fillStyle = color;
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
}
