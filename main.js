// main.js — Audio → Mood → Color pipeline
// Shared by File-To-Color, Speaker-To-Color, and Microphone-To-Color.
// Loaded as a plain <script> tag; functions are exposed on window.*.

// Extracts normalized audio features from frequency data.
// Returns energy (0–1, overall volume) and brightness (0–1, spectral centroid on log scale).
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

    return { energy, brightness };
}

// Maps energy (0–1) × brightness (0–1) to a mood/emotion label.
//
// Mood grid:
//               bass-heavy   mid-range    bright/treble
//  high energy:   angry       powerful     excited
//  mid energy:    tense       focused      uplifting
//  low energy:    melancholic peaceful     serene
//  near-silent:   silent
function getMood(energy, brightness) {
    if (energy < 0.12) return 'silent';

    if (energy < 0.35) {
        if (brightness < 0.38) return 'melancholic';
        if (brightness < 0.65) return 'peaceful';
        return 'serene';
    }

    if (energy < 0.60) {
        if (brightness < 0.38) return 'tense';
        if (brightness < 0.65) return 'focused';
        return 'uplifting';
    }

    if (brightness < 0.38) return 'angry';
    if (brightness < 0.65) return 'powerful';
    return 'excited';
}

// Mood → HSL color palette.
// baseLightness is nudged ±15 points by energy so the canvas pulses with volume.
const MOOD_PALETTE = {
    silent:      { hue: 0,   saturation: 0,  baseLightness: 93 },
    melancholic: { hue: 248, saturation: 55, baseLightness: 28 },
    peaceful:    { hue: 205, saturation: 52, baseLightness: 50 },
    serene:      { hue: 175, saturation: 58, baseLightness: 58 },
    tense:       { hue: 22,  saturation: 78, baseLightness: 36 },
    focused:     { hue: 128, saturation: 45, baseLightness: 38 },
    uplifting:   { hue: 72,  saturation: 78, baseLightness: 52 },
    angry:       { hue: 348, saturation: 85, baseLightness: 40 },
    powerful:    { hue: 25,  saturation: 88, baseLightness: 44 },
    excited:     { hue: 48,  saturation: 95, baseLightness: 56 },
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
    const { energy, brightness } = getAudioFeatures(dataArray);
    const mood = getMood(energy, brightness);
    const color = moodToColor(mood, energy);
    return { mood, color };
}

window.getAudioFeatures = getAudioFeatures;
window.getMood = getMood;
window.moodToColor = moodToColor;
window.audioToColor = audioToColor;
