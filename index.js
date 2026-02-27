// ── Metric definitions ──────────────────────────────────────────────────────
const METRICS = [
    { key: 'energy',     label: 'Energy' },
    { key: 'brightness', label: 'Brightness' },
    { key: 'tempo',      label: 'Tempo' },
    { key: 'flux',       label: 'Flux' },
    { key: 'spread',     label: 'Spread' },
    { key: 'flatness',   label: 'Flatness' },
    { key: 'bassRatio',  label: 'Bass Ratio' },
    { key: 'zcr',        label: 'ZCR' },
];

// Build metrics DOM rows dynamically
const metricsPanel = document.getElementById('metrics');
for (const { key, label } of METRICS) {
    metricsPanel.insertAdjacentHTML('beforeend', `
        <div class="metric-row">
            <span class="metric-label">${label}</span>
            <div class="metric-track">
                <div class="metric-bar" id="bar-${key}"></div>
            </div>
            <span class="metric-value" id="val-${key}">0.00</span>
        </div>
    `);
}

// ── DOM references ──────────────────────────────────────────────────────────
const canvas          = document.getElementById('colorCanvas');
const canvasCtx       = canvas.getContext('2d');
const moodDisplay     = document.getElementById('mood');
const audioFileInput  = document.getElementById('audioFile');
const speakerStartBtn = document.getElementById('speakerStartBtn');
const speakerStopBtn  = document.getElementById('speakerStopBtn');
const micStartBtn     = document.getElementById('micStartBtn');
const micStopBtn      = document.getElementById('micStopBtn');

// White canvas on load
canvasCtx.fillStyle = '#fff';
canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

// ── Audio state ─────────────────────────────────────────────────────────────
let audioContext     = null;
let analyser         = null;
let dataArray        = null;
let timeDomainArray  = null;
let animationFrameId = null;

// At most one of these is active at a time
let sourceNode   = null;  // MediaStreamAudioSourceNode (speaker / mic)
let bufferSource = null;  // AudioBufferSourceNode (file)
let silentGain   = null;  // GainNode(0) keeping mic AudioContext alive
let mediaStream  = null;  // MediaStream (speaker / mic)

// ── Helpers ─────────────────────────────────────────────────────────────────
async function ensureAudioContext() {
    if (!audioContext || audioContext.state === 'closed') {
        audioContext = new AudioContext();
    }
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }
}

function setupAnalyser() {
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    dataArray       = new Uint8Array(analyser.frequencyBinCount);
    timeDomainArray = new Uint8Array(analyser.fftSize);
}

function resetCanvas() {
    canvasCtx.fillStyle = '#fff';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
}

function resetMetricBars() {
    for (const { key } of METRICS) {
        document.getElementById(`bar-${key}`).style.width = '0%';
        document.getElementById(`val-${key}`).textContent  = '0.00';
    }
}

function updateMetricBars(features) {
    for (const { key } of METRICS) {
        const v   = features[key] ?? 0;
        const pct = Math.min(100, Math.round(v * 100));
        document.getElementById(`bar-${key}`).style.width = `${pct}%`;
        document.getElementById(`val-${key}`).textContent  = v.toFixed(2);
    }
}

// ── Stop / reset ─────────────────────────────────────────────────────────────
function stopCapture() {
    if (bufferSource) {
        try { bufferSource.stop(); } catch (_) {}
        bufferSource.disconnect();
        bufferSource = null;
    }
    if (sourceNode)  { sourceNode.disconnect();  sourceNode  = null; }
    if (silentGain)  { silentGain.disconnect();  silentGain  = null; }
    if (analyser)    { analyser.disconnect();    analyser    = null; }
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    if (audioContext) audioContext.onstatechange = null;
    if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }

    dataArray       = null;
    timeDomainArray = null;

    speakerStartBtn.disabled = false;
    speakerStopBtn.disabled  = true;
    micStartBtn.disabled     = false;
    micStopBtn.disabled      = true;

    moodDisplay.textContent = '';
    resetCanvas();
    resetMetricBars();
}

// ── Mode switching ────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const mode = tab.dataset.mode;
        if (tab.classList.contains('active')) return;
        stopCapture();
        document.querySelectorAll('.tab').forEach(t =>
            t.classList.toggle('active', t === tab));
        document.querySelectorAll('.ctrl-panel').forEach(p =>
            p.classList.toggle('active', p.id === `ctrl-${mode}`));
        // Clear file input so re-selecting the same file fires change again
        audioFileInput.value = '';
    });
});

// ── File mode ─────────────────────────────────────────────────────────────────
audioFileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    stopCapture();
    try {
        await ensureAudioContext();
        setupAnalyser();
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const audioBuffer = await audioContext.decodeAudioData(e.target.result);
                bufferSource = audioContext.createBufferSource();
                bufferSource.buffer = audioBuffer;
                bufferSource.connect(analyser);
                analyser.connect(audioContext.destination);
                bufferSource.start(0);
                bufferSource.onended = () => {
                    if (bufferSource) { bufferSource.disconnect(); bufferSource = null; }
                };
                if (!animationFrameId) drawVisualization();
            } catch (err) {
                console.error('Audio decode error:', err);
                alert('Could not decode this audio file. Try MP3, WAV, or OGG.');
            }
        };
        reader.onerror = () => alert('Could not read the selected file.');
        reader.readAsArrayBuffer(file);
    } catch (err) {
        console.error('Audio setup error:', err);
    }
});

// ── Speaker / Tab mode ────────────────────────────────────────────────────────
speakerStartBtn.addEventListener('click', async () => {
    stopCapture();
    try {
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: true,
        });
        const audioTracks = mediaStream.getAudioTracks();
        if (audioTracks.length === 0) {
            alert('No audio track found. Make sure to check "Share audio" in the browser prompt.');
            mediaStream.getTracks().forEach(t => t.stop());
            mediaStream = null;
            return;
        }
        // Immediately drop the video track — we only need audio
        mediaStream.getVideoTracks().forEach(t => t.stop());

        await ensureAudioContext();
        setupAnalyser();

        // Do NOT connect analyser → destination: that would cause feedback echo
        sourceNode = audioContext.createMediaStreamSource(mediaStream);
        sourceNode.connect(analyser);

        audioTracks[0].onended = stopCapture;
        speakerStartBtn.disabled = true;
        speakerStopBtn.disabled  = false;

        if (!animationFrameId) drawVisualization();
    } catch (err) {
        if (err.name !== 'NotAllowedError') {
            console.error('Speaker capture error:', err);
            alert('Could not start audio capture.');
        }
    }
});

speakerStopBtn.addEventListener('click', stopCapture);

// ── Microphone mode ───────────────────────────────────────────────────────────
micStartBtn.addEventListener('click', async () => {
    stopCapture();
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        await ensureAudioContext();
        setupAnalyser();

        sourceNode = audioContext.createMediaStreamSource(mediaStream);
        // Route through a zero-gain node to destination so the browser
        // doesn't auto-suspend the AudioContext after a few seconds.
        silentGain = audioContext.createGain();
        silentGain.gain.value = 0;
        sourceNode.connect(analyser);
        analyser.connect(silentGain);
        silentGain.connect(audioContext.destination);

        audioContext.onstatechange = () => {
            if (audioContext && audioContext.state === 'suspended') audioContext.resume();
        };
        mediaStream.getAudioTracks()[0].onended = stopCapture;

        micStartBtn.disabled = true;
        micStopBtn.disabled  = false;

        if (!animationFrameId) drawVisualization();
    } catch (err) {
        if (err.name !== 'NotAllowedError') {
            console.error('Microphone error:', err);
            alert('Could not access the microphone.');
        }
    }
});

micStopBtn.addEventListener('click', stopCapture);

// ── Draw loop ─────────────────────────────────────────────────────────────────
function drawVisualization() {
    // Stop when no active audio source remains
    if (!analyser || (!bufferSource && !sourceNode)) {
        if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
        resetCanvas();
        moodDisplay.textContent = '';
        resetMetricBars();
        return;
    }

    animationFrameId = requestAnimationFrame(drawVisualization);

    analyser.getByteFrequencyData(dataArray);
    analyser.getByteTimeDomainData(timeDomainArray);

    const features = getAudioFeatures(dataArray, timeDomainArray);
    const mood = getMood(
        features.energy,    features.brightness, features.tempo,
        features.flux,      features.spread,     features.flatness,
        features.bassRatio, features.zcr
    );
    const color = moodToColor(mood, features.energy);

    canvasCtx.fillStyle = color;
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    moodDisplay.textContent = mood;
    updateMetricBars(features);
}
