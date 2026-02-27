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
 * Starts capturing system/tab audio via getDisplayMedia and begins visualization.
 */
async function startCapture() {
    try {
        // Request display capture — video:true is required by most browsers to
        // surface the "Share audio" checkbox in the picker dialog.
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

        // Connect the captured stream to the analyser.
        // Do NOT connect analyser -> destination: that would feed the audio back
        // through the speakers and cause an echo/feedback loop.
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

/**
 * Stops the capture, disconnects nodes, and resets UI.
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
    // Stop the loop if capture has ended
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
    // logarithmic, this spreads all audio (including bass-heavy content) evenly
    // across the full hue range instead of clustering near red.

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
