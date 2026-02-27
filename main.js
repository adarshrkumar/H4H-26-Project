// main.js — Audio → Mood → Color pipeline
// Shared by File-To-Color, Speaker-To-Color, and Microphone-To-Color.
// Loaded as a plain <script> tag; functions are exposed on window.*.

// Internal state for onset/tempo detection across frames
const _onset = {
    prevEnergy: 0,
    times: [], // timestamps (ms) of recent detected onsets
};

// Extracts normalized audio features from frequency data.
//   energy:     0–1  overall volume/amplitude
//   brightness: 0–1  log-scale spectral centroid (0=bass-heavy, 1=treble-heavy)
//   tempo:      0–1  onset rate (0=no data or ≤40 BPM, 1=≥180 BPM)
function getAudioFeatures(dataArray) {
    let sum = 0;
    let weightedLogSum = 0;
    let totalAmplitude = 0;

    // Start at 1 to avoid log(0)
    for (let i = 1; i < dataArray.length; i++) {
        sum += dataArray[i];
        weightedLogSum += Math.log2(i) * dataArray[i];
        totalAmplitude += dataArray[i];
    }

    const energy = (sum / dataArray.length) / 255;
    const logCentroid = totalAmplitude > 0 ? weightedLogSum / totalAmplitude : 0;
    const brightness = logCentroid / Math.log2(dataArray.length);

    // Onset detection: a sudden energy jump marks a new sound event (beat/note/word)
    const now = performance.now();
    const delta = energy - _onset.prevEnergy;
    if (delta > 0.12 && energy > 0.15) {
        _onset.times.push(now);
    }
    _onset.prevEnergy = energy;

    // Discard onsets older than 3 seconds
    const cutoff = now - 3000;
    while (_onset.times.length > 0 && _onset.times[0] < cutoff) {
        _onset.times.shift();
    }

    // Estimate tempo from average inter-onset interval, normalized to 0–1
    // (0 = no data or ≤40 BPM,  1 = ≥180 BPM)
    let tempo = 0;
    if (_onset.times.length >= 2) {
        let totalInterval = 0;
        for (let i = 1; i < _onset.times.length; i++) {
            totalInterval += _onset.times[i] - _onset.times[i - 1];
        }
        const avgInterval = totalInterval / (_onset.times.length - 1);
        const bpm = 60000 / avgInterval;
        tempo = Math.min(1, Math.max(0, (bpm - 40) / 140));
    }

    return { energy, brightness, tempo };
}

// Maps energy × brightness × tempo to a mood/emotion label.
//
// Base grid (energy × brightness):
//               bass-heavy    mid-range     bright/treble
//  high energy:   angry        powerful      excited
//  mid energy:    tense        focused       uplifting
//  low energy:    melancholic  peaceful      serene
//  near-silent:   silent
//
// Tempo modifier applied on top:
//  fast (>0.65)         → urgent/intense variant of the base mood
//  slow (0 < t < 0.25)  → calm/heavy variant of the base mood
//  no data (tempo=0)    → base mood unchanged
function getMood(energy, brightness, tempo) {
    if (energy < 0.12) return 'silent';

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
    const { energy, brightness, tempo } = getAudioFeatures(dataArray);
    const mood = getMood(energy, brightness, tempo);
    const color = moodToColor(mood, energy);
    return { mood, color };
}

window.getAudioFeatures = getAudioFeatures;
window.getMood = getMood;
window.moodToColor = moodToColor;
window.audioToColor = audioToColor;
