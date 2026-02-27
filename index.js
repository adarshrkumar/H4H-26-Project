// ── Audio → Mood → Color pipeline ────────────────────────────────────────────

// Internal state across frames (onset detection + flux tracking)
const _state = {
    prevEnergy:   0,
    prevSpectrum: null, // Uint8Array copy of last frame, for flux calculation
    onsetTimes:   [],   // timestamps (ms) of recent detected onsets
};

// Extracts 8 normalized audio features from frequency and time-domain data.
//
//   energy:     0–1  overall volume/amplitude
//   brightness: 0–1  log-scale spectral centroid (0=bass, 1=treble)
//   tempo:      0–1  onset rate (0=no data or ≤40 BPM, 1=≥180 BPM)
//   flux:       0–1  spectral change from last frame (0=static drone, 1=maximal change)
//   spread:     0–1  width of frequency content around centroid (0=narrow tone, 1=full band)
//   flatness:   0–1  tonality ratio (0=pure tone/instrument, 1=white noise/full-band chaos)
//   bassRatio:  0–1  fraction of total energy in lowest 10% of bins (0=no bass, high=bass-heavy)
//   zcr:        0–1  zero crossing rate from waveform (0=smooth/tonal, 1=noisy/percussive)
//
// timeDomainArray is optional; flatness and bassRatio work without it,
// but zcr will be 0 if it is omitted.
function getAudioFeatures(dataArray, timeDomainArray) {
    let sum = 0;
    let weightedLogSum = 0;
    let totalAmplitude = 0;

    for (let i = 1; i < dataArray.length; i++) {
        sum += dataArray[i];
        weightedLogSum += Math.log2(i) * dataArray[i];
        totalAmplitude += dataArray[i];
    }

    const energy = (sum / dataArray.length) / 255;
    const logCentroid = totalAmplitude > 0 ? weightedLogSum / totalAmplitude : 0;
    const brightness = logCentroid / Math.log2(dataArray.length);

    // Spectral spread: std-dev of log-frequency around the centroid.
    // Low = narrow/focused sound (pure tone, bass drone).
    // High = full-band sound (dense mix, broadband noise).
    let spreadSum = 0;
    for (let i = 1; i < dataArray.length; i++) {
        const diff = Math.log2(i) - logCentroid;
        spreadSum += diff * diff * dataArray[i];
    }
    const spread = Math.min(1, totalAmplitude > 0
        ? Math.sqrt(spreadSum / totalAmplitude) / Math.log2(dataArray.length)
        : 0);

    // Spectral flux: sum of positive bin differences vs last frame (half-wave rectified),
    // normalized relative to the current frame's total amplitude so quiet and loud audio
    // are treated proportionally. Low = steady/sustained. High = rapidly changing.
    let flux = 0;
    if (_state.prevSpectrum && totalAmplitude > 0) {
        let rawFlux = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const diff = dataArray[i] - _state.prevSpectrum[i];
            if (diff > 0) rawFlux += diff;
        }
        flux = rawFlux / totalAmplitude; // relative flux: 0 = no change, >0.1 = dynamic
    }
    _state.prevSpectrum = new Uint8Array(dataArray);

    // Onset detection: a sudden energy spike marks a new sound event (beat, note, word).
    const now = performance.now();
    const delta = energy - _state.prevEnergy;
    if (delta > 0.12 && energy > 0.15) {
        _state.onsetTimes.push(now);
    }
    _state.prevEnergy = energy;

    // Discard onsets older than 3 seconds
    const cutoff = now - 3000;
    while (_state.onsetTimes.length > 0 && _state.onsetTimes[0] < cutoff) {
        _state.onsetTimes.shift();
    }

    // Tempo: average inter-onset interval → BPM → normalized 0–1
    // (0 = no data or ≤40 BPM,  1 = ≥180 BPM)
    let tempo = 0;
    if (_state.onsetTimes.length >= 2) {
        let totalInterval = 0;
        for (let i = 1; i < _state.onsetTimes.length; i++) {
            totalInterval += _state.onsetTimes[i] - _state.onsetTimes[i - 1];
        }
        const avgInterval = totalInterval / (_state.onsetTimes.length - 1);
        const bpm = 60000 / avgInterval;
        tempo = Math.min(1, Math.max(0, (bpm - 40) / 140));
    }

    // Spectral flatness: geometric mean / arithmetic mean of bin amplitudes.
    // Values near 0 = tonal (instruments, sustained notes).
    // Values near 1 = noise-like (cymbals, dense distortion, white noise).
    let flatness = 0;
    if (totalAmplitude > 0) {
        let logSum = 0;
        let nonZeroCount = 0;
        for (let i = 1; i < dataArray.length; i++) {
            if (dataArray[i] > 0) {
                logSum += Math.log(dataArray[i]);
                nonZeroCount++;
            }
        }
        if (nonZeroCount > 0) {
            const geometricMean = Math.exp(logSum / nonZeroCount);
            const arithmeticMean = totalAmplitude / dataArray.length;
            flatness = Math.min(1, arithmeticMean > 0 ? geometricMean / arithmeticMean : 0);
        }
    }

    // Bass ratio: proportion of total energy concentrated in the lowest 10% of bins.
    // Low = treble-heavy or balanced. High = bass-dominated (sub-bass, kick, rumble).
    const bassEnd = Math.max(1, Math.floor(dataArray.length * 0.10));
    let bassSum = 0;
    for (let i = 0; i < bassEnd; i++) {
        bassSum += dataArray[i];
    }
    const bassRatio = totalAmplitude > 0 ? Math.min(1, bassSum / totalAmplitude) : 0;

    // Zero crossing rate: how often the waveform crosses the zero line per sample.
    // Low ZCR = smooth, tonal (sine waves, bass notes).
    // High ZCR = noisy, percussive (snare hits, hi-hats, distortion).
    // Requires timeDomainArray (values 0–255 with 128 as silence centre).
    let zcr = 0;
    if (timeDomainArray && timeDomainArray.length > 1) {
        let crossings = 0;
        for (let i = 1; i < timeDomainArray.length; i++) {
            const prev = timeDomainArray[i - 1] - 128;
            const curr = timeDomainArray[i] - 128;
            if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) {
                crossings++;
            }
        }
        // Normalise: maximum possible crossings = length - 1 (fully alternating signal)
        zcr = crossings / (timeDomainArray.length - 1);
    }

    return { energy, brightness, tempo, flux, spread, flatness, bassRatio, zcr };
}

// Maps all 8 features to a mood/emotion label.
//
// Base grid (energy × brightness):
//               bass-heavy    mid-range     bright/treble
//  high energy:   angry        powerful      excited
//  mid energy:    tense        focused       uplifting
//  low energy:    melancholic  peaceful      serene
//  near-silent:   silent
//
// Eight modifiers applied in order (each can override the previous result):
//   1. Volume   — very loud (>0.80) → escalate intensity; very quiet (<0.22) → dampen
//   2. Tempo    — fast (>0.65) → urgent variants; slow (0 < t < 0.25) → heavy variants
//   3. Flux     — very low (<0.05) → sustained/droning variants
//   4. Spread   — wide (>0.55) with energy → fuller/bigger variants
//   5. Bass     — high ratio (>0.30) with energy → heavier/darker variants
//   6. Noise    — high flatness (>0.70) + high ZCR (>0.15) → more chaotic variants
function getMood(energy, brightness, tempo, flux, spread, flatness, bassRatio, zcr) {
    if (energy < 0.05)
        return 'silent';

    // Base mood from energy × brightness
    let mood;
    if (energy < 0.35) {
        if (brightness < 0.38)
            mood = 'melancholic';
        else if (brightness < 0.65)
            mood = 'peaceful';
        else
            mood = 'serene';
    }
    else if (energy < 0.60) {
        if (brightness < 0.38)
            mood = 'tense';
        else if (brightness < 0.65)
            mood = 'focused';
        else
            mood = 'uplifting';
    }
    else {
        if (brightness < 0.38)
            mood = 'angry';
        else if (brightness < 0.65)
            mood = 'powerful';
        else
            mood = 'excited';
    }

    // Volume modifier: very loud → escalate to peak intensity; very quiet → dampen
    if (energy > 0.80) {
        const loudMap = {
            peaceful:      'uplifting',
            serene:        'excited',
            focused:       'powerful',
            uplifting:     'excited',
            melancholic:   'tense',
            tranquil:      'peaceful',
            meditative:    'serene',
            hopeful:       'uplifting',
            somber:        'melancholic',
            contemplative: 'focused',
            brooding:      'tense',
            heavy:         'powerful',
            giddy:         'excited',
        };
        mood = loudMap[mood] ?? mood;
    }
    else if (energy < 0.22) {
        const quietMap = {
            angry:    'tense',
            powerful: 'focused',
            excited:  'uplifting',
            furious:  'angry',
            intense:  'powerful',
            frantic:  'tense',
            driven:   'focused',
            restless: 'melancholic',
            joyful:   'peaceful',
            playful:  'peaceful',
            euphoric: 'serene',
        };
        mood = quietMap[mood] ?? mood;
    }

    // Tempo modifier
    if (tempo > 0.65) {
        const fastMap = {
            melancholic: 'restless',
            peaceful:    'playful',
            serene:      'joyful',
            tense:       'frantic',
            focused:     'driven',
            uplifting:   'euphoric',
            angry:       'furious',
            powerful:    'intense',
            excited:     'euphoric',
        };
        mood = fastMap[mood] ?? mood;
    }
    else if (tempo > 0 && tempo < 0.25) {
        const slowMap = {
            melancholic: 'somber',
            peaceful:    'tranquil',
            serene:      'meditative',
            tense:       'brooding',
            focused:     'contemplative',
            uplifting:   'hopeful',
            angry:       'smoldering',
            powerful:    'heavy',
            excited:     'giddy',
        };
        mood = slowMap[mood] ?? mood;
    }

    // Flux modifier: very low flux = sustained/droning tone → pull toward stable moods
    // Threshold ~0.05 on the relative scale (0 = no change, >0.1 = dynamic audio)
    if (flux < 0.05 && energy > 0.12) {
        const droneMap = {
            melancholic:   'somber',
            peaceful:      'meditative',
            serene:        'meditative',
            tense:         'brooding',
            focused:       'contemplative',
            uplifting:     'hopeful',
            angry:         'smoldering',
            powerful:      'heavy',
            excited:       'giddy',
            restless:      'brooding',
            frantic:       'tense',
            driven:        'focused',
            euphoric:      'serene',
            furious:       'angry',
            intense:       'powerful',
        };
        mood = droneMap[mood] ?? mood;
    }

    // Spread modifier: wide spectrum + sufficient energy → bigger/fuller quality
    if (spread > 0.55 && energy > 0.40) {
        const wideMap = {
            focused:       'powerful',
            tense:         'frantic',
            uplifting:     'excited',
            peaceful:      'uplifting',
            melancholic:   'tense',
            contemplative: 'focused',
            tranquil:      'peaceful',
        };
        mood = wideMap[mood] ?? mood;
    }

    // Bass modifier: heavily bass-dominated audio → pull toward heavier, darker moods
    if (bassRatio > 0.30 && energy > 0.25) {
        const bassMap = {
            uplifting:   'focused',
            excited:     'powerful',
            joyful:      'driven',
            playful:     'restless',
            hopeful:     'contemplative',
            giddy:       'restless',
            euphoric:    'intense',
            serene:      'peaceful',
            tranquil:    'somber',
        };
        mood = bassMap[mood] ?? mood;
    }

    // Noise modifier: high flatness + high ZCR = percussive/chaotic audio → more active moods
    if (flatness > 0.70 && zcr > 0.15 && energy > 0.15) {
        const noisyMap = {
            peaceful:      'restless',
            serene:        'uplifting',
            tranquil:      'peaceful',
            meditative:    'contemplative',
            somber:        'brooding',
            hopeful:       'focused',
            contemplative: 'tense',
        };
        mood = noisyMap[mood] ?? mood;
    }

    return mood;
}

// Mood → HSL color palette.
// baseLightness is nudged ±15 points by energy so the canvas pulses with volume.
const MOOD_PALETTE = {
    // base moods
    silent:        { hue: 0,   saturation: 0,   baseLightness: 93 },
    melancholic:   { hue: 248, saturation: 55,  baseLightness: 28 },
    peaceful:      { hue: 205, saturation: 52,  baseLightness: 50 },
    serene:        { hue: 175, saturation: 58,  baseLightness: 58 },
    tense:         { hue: 22,  saturation: 78,  baseLightness: 36 },
    focused:       { hue: 128, saturation: 45,  baseLightness: 38 },
    uplifting:     { hue: 72,  saturation: 78,  baseLightness: 52 },
    angry:         { hue: 348, saturation: 85,  baseLightness: 40 },
    powerful:      { hue: 25,  saturation: 88,  baseLightness: 44 },
    excited:       { hue: 48,  saturation: 95,  baseLightness: 56 },
    // fast-tempo variants
    restless:      { hue: 35,  saturation: 82,  baseLightness: 45 },
    playful:       { hue: 80,  saturation: 85,  baseLightness: 58 },
    joyful:        { hue: 55,  saturation: 90,  baseLightness: 62 },
    frantic:       { hue: 10,  saturation: 92,  baseLightness: 42 },
    driven:        { hue: 150, saturation: 65,  baseLightness: 42 },
    euphoric:      { hue: 300, saturation: 90,  baseLightness: 58 },
    furious:       { hue: 0,   saturation: 100, baseLightness: 30 },
    intense:       { hue: 20,  saturation: 95,  baseLightness: 38 },
    // slow-tempo variants
    somber:        { hue: 230, saturation: 60,  baseLightness: 20 },
    tranquil:      { hue: 200, saturation: 35,  baseLightness: 65 },
    meditative:    { hue: 185, saturation: 40,  baseLightness: 45 },
    brooding:      { hue: 270, saturation: 50,  baseLightness: 25 },
    contemplative: { hue: 250, saturation: 40,  baseLightness: 40 },
    hopeful:       { hue: 45,  saturation: 65,  baseLightness: 55 },
    smoldering:    { hue: 10,  saturation: 70,  baseLightness: 25 },
    heavy:         { hue: 30,  saturation: 60,  baseLightness: 28 },
    giddy:         { hue: 320, saturation: 75,  baseLightness: 60 },
};

// Converts a mood label + energy level to an HSL color string.
function moodToColor(mood, energy) {
    const base = MOOD_PALETTE[mood] ?? MOOD_PALETTE.focused;
    const lightness = Math.min(85, Math.max(10, base.baseLightness + (energy - 0.5) * 30));
    return `hsl(${base.hue}, ${base.saturation}%, ${Math.round(lightness)}%)`;
}

// ── Metric definitions ────────────────────────────────────────────────────────
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

// ── DOM references ────────────────────────────────────────────────────────────
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

// ── Audio state ───────────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Stop / reset ──────────────────────────────────────────────────────────────
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
