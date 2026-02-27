// Global variables for Web Audio API and canvas
let audioContext = null;
let analyser = null;
let dataArray = null;
let bufferSource = null; // Source node for the audio buffer
const canvas = document.getElementById('colorCanvas');
const canvasCtx = canvas.getContext('2d');
const fileInput = document.getElementById('audioFile'); // Get the file input element

// Variable to track the animation frame ID for stopping the loop
let animationFrameId = null;

// Set canvas size (these dimensions will be scaled by CSS)
canvas.width = 600;
canvas.height = 300;

// Initial state: Draw default white canvas
canvasCtx.fillStyle = '#fff';
canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

// Add event listener to the file input
fileInput.addEventListener('change', handleFileSelect);

/**
 * Handles the selection of an audio file by the user.
 * Reads the file, decodes audio data, and sets up playback and visualization.
 * @param {Event} event - The file change event.
 */
async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) {
        // No file selected, or selection was cancelled
        console.log("No file selected.");
        return;
    }

    // Stop any currently playing audio source
    if (bufferSource) {
        bufferSource.stop();
        // Disconnect and nullify the old source node to prevent memory leaks
        bufferSource.disconnect();
        bufferSource = null;
        console.log('Previous audio stopped and source cleaned.');
    }

    try {
        // Ensure audio context is created or resumed.
        // The context must be created in response to a user gesture for security reasons.
        if (!audioContext || audioContext.state === 'closed') {
             audioContext = new (window.AudioContext || window.webkitAudioContext)();
             console.log('Audio context created.');
        }

         if (audioContext.state === 'suspended') {
            // Attempt to resume context if it was suspended (e.g., browser tab inactive)
            await audioContext.resume();
            console.log('Audio context resumed.');
        }

        // Ensure analyser node is created
        if (!analyser) {
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048; // Defines the window size for FFT
            // The number of data points is half the FFT size
            dataArray = new Uint8Array(analyser.frequencyBinCount);
             console.log('Analyser created.');
        }

        // Use FileReader to read the file content as an ArrayBuffer
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                 // Decode the audio data from the ArrayBuffer
                const audioBuffer = await audioContext.decodeAudioData(e.target.result);
                console.log('Audio data decoded successfully.');

                // Create an AudioBufferSourceNode to play the decoded audio
                bufferSource = audioContext.createBufferSource();
                bufferSource.buffer = audioBuffer; // Assign the decoded buffer

                // Connect nodes: source -> analyser -> destination (speakers)
                bufferSource.connect(analyser);
                analyser.connect(audioContext.destination); // Connect to hear the sound
                console.log('Nodes connected: source -> analyser -> destination.');

                // Start playback of the audio buffer immediately
                bufferSource.start(0);
                console.log('Playback started.');

                 // Add an event listener for when the audio finishes playing
                 bufferSource.onended = () => {
                    console.log('Playback finished.');
                    // Disconnect and nullify the source node when done
                    // Check if it still exists (might be replaced by a new file selection)
                    if(bufferSource) {
                        bufferSource.disconnect();
                        bufferSource = null;
                        console.log('Source disconnected on end.');
                    }
                    // The drawVisualization loop will detect bufferSource is null
                    // and stop itself in the next frame.
                 };

                // Start the visualization loop if it's not already running
                // This prevents multiple rAF loops running simultaneously
                if (!animationFrameId) {
                    console.log("Starting animation loop.");
                    drawVisualization();
                }


            } catch (decodeErr) {
                console.error('Error decoding audio data:', decodeErr);
                alert('Could not decode audio data. Please try a different file or format (e.g., MP3, WAV, OGG).');
                // Clear the file input selection visually in case of decoding error
                event.target.value = '';
                // Ensure animation stops if decoding failed after initial setup
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }
            }
        };

        // Handle errors during file reading
        reader.onerror = (e) => {
            console.error('Error reading file:', e);
            alert('Could not read the selected file.');
            // Clear the file input selection visually
            event.target.value = '';
        };

        // Start reading the file content
        reader.readAsArrayBuffer(file);

    } catch (err) {
        console.error('Error setting up audio playback:', err);
        alert('An error occurred while setting up audio playback.');
        // Clear the file input selection visually
        event.target.value = '';
    }
}

/**
 * The main visualization loop. Gets frequency data and updates the canvas color.
 */
function drawVisualization() {
     // Stop the loop if there's no active audio source or setup is incomplete
     if (!bufferSource || !analyser || !canvasCtx) {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null; // Clear the ID
            console.log("Animation loop stopped.");
        }
        // Optionally draw a default state (e.g., white canvas) when idle
        canvasCtx.fillStyle = '#fff';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        return; // Exit the function
    }

    // Request the next frame only if the audio is playing
    animationFrameId = requestAnimationFrame(drawVisualization);

    // Get the frequency data into the dataArray
    analyser.getByteFrequencyData(dataArray);

    // --- Color Mapping Logic ---
    // This logic maps audio frequency data to HSL color properties.
    // It finds the dominant frequency and calculates the average amplitude.

    let sum = 0;
    let maxAmplitude = 0;
    let maxAmplitudeIndex = 0;

    // Iterate through the frequency data array
    for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i]; // Sum for average amplitude
        // Find the bin with the maximum amplitude (dominant frequency)
        if (dataArray[i] > maxAmplitude) {
            maxAmplitude = dataArray[i];
            maxAmplitudeIndex = i;
        }
    }

    // Calculate the average amplitude
    const averageAmplitude = sum / dataArray.length; // Value from 0-255

    // Map the index of the dominant frequency bin to Hue (0 to 360 degrees)
    // Lower frequencies (smaller indices) -> lower hues (red, orange, yellow)
    // Higher frequencies (larger indices) -> higher hues (green, blue, violet)
    // dataArray.length is equal to analyser.frequencyBinCount
    const hue = (maxAmplitudeIndex / dataArray.length) * 360;

    // Map the average amplitude (volume) to Lightness (e.g., 10% to 90%)
    // A base lightness (10%) ensures visibility even when quiet.
    // Max lightness (90%) prevents over-saturation/whiteout at max volume.
    const lightness = 10 + (averageAmplitude / 255) * 80; // Map 0-255 to 10-90

    // Keep saturation relatively high for vibrant colors
    const saturation = 70; // Percentage

    // Create the HSL color string
    const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

    // Fill the entire canvas with the calculated color
    canvasCtx.fillStyle = color;
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
}

// The animation loop is started only when a file is successfully loaded and played.