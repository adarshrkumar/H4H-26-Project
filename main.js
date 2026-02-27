// main.js — Audio → Mood → Color pipeline
// Shared by File-To-Color, Speaker-To-Color, and Microphone-To-Color.
// Loaded as a plain <script> tag; functions are exposed on window.*.

// Internal state across frames (onset detection + flux tracking)
const _state = {
    prevEnergy:   0,
    prevSpectrum: null, // Uint8Array copy of last frame, for flux calculation
    onsetTimes:   [],   // timestamps (ms) of recent detected onsets
};

// Extracts 5 normalized audio features from frequency data.
//
//   energy:     0–1  overall volume/amplitude
//   brightness: 0–1  log-scale spectral centroid (0=bass, 1=treble)
//   tempo:      0–1  onset rate (0=no data or ≤40 BPM, 1=≥180 BPM)
//   flux:       0–1  spectral change from last frame (0=static drone, 1=maximal change)
//   spread:     0–1  width of frequency content around centroid (0=narrow tone, 1=full band)
function getAudioFeatures(dataArray) {
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

    // Spectral flux: sum of positive bin differences vs last frame (half-wave rectified), normalized relative to the current frame's total amplitude so quiet and loud audio are treated proportionally. Low = steady/sustained. High = rapidly changing.
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

    return { energy, brightness, tempo, flux, spread };
}

// Maps all 5 features to a mood/emotion label.
//
// Base grid (energy × brightness):
//               bass-heavy    mid-range     bright/treble
//  high energy:   angry        powerful      excited
//  mid energy:    tense        focused       uplifting
//  low energy:    melancholic  peaceful      serene
//  near-silent:   silent
//
// Three modifiers applied in order:
//   1. Tempo  — fast (>0.65) → urgent variants; slow (0 < t < 0.25) → heavy variants
//   2. Flux   — very low (<0.02) with energy → sustained/droning variants
//   3. Spread — very wide (>0.65) with energy → fuller/bigger variants
function getMood(energy, brightness, tempo, flux, spread) {
    if (energy < 0.12) return 'silent';

    // Base mood from energy × brightness
    let mood;
    if (energy < 0.35) {
        if (brightness < 0.38) mood = 'melancholic';
        else if (brightness < 0.65) mood = 'peaceful';
        else mood = 'serene';
    } else if (energy < 0.60) {
        if (brightness < 0.38) mood = 'tense';
        else if (brightness < 0.65) mood = 'focused';
        else mood = 'uplifting';
    } else {
        if (brightness < 0.38) mood = 'angry';
        else if (brightness < 0.65) mood = 'powerful';
        else mood = 'excited';
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
    } else if (tempo > 0 && tempo < 0.25) {
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

// Convenience: runs the full audio → mood → color pipeline in one call.
// Returns { mood, color } where color is an HSL string.
function audioToColor(dataArray) {
    const { energy, brightness, tempo, flux, spread } = getAudioFeatures(dataArray);
    const mood = getMood(energy, brightness, tempo, flux, spread);
    const color = moodToColor(mood, energy);
    return { mood, color };
}

window.getAudioFeatures = getAudioFeatures;
window.getMood = getMood;
window.moodToColor = moodToColor;
window.audioToColor = audioToColor;
