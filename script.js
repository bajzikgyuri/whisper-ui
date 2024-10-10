const apiKeyInput = document.getElementById('apiKey');
const audioFileInput = document.getElementById('audioFile');
const transcribeButton = document.getElementById('transcribeButton');
const resultTextarea = document.getElementById('result');
const logTextarea = document.getElementById('log');
const progressBar = document.getElementById('progress-bar');
const fileSizeDisplay = document.getElementById('file-size');
const statusDisplay = document.getElementById('status');
const processedChunksDisplay = document.getElementById('processed-chunks');

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// Load API key from local storage on page load
window.addEventListener('load', () => {
    const savedApiKey = localStorage.getItem('apiKey');
    if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
    }
    updateTranscribeButton();
    console.log("API key loaded from local storage.");
});

// Save API key to local storage when input changes
apiKeyInput.addEventListener('change', () => {
    localStorage.setItem('apiKey', apiKeyInput.value);
    updateTranscribeButton();
    console.log("API key saved to local storage.");
});

// Enable the transcribe button when both API key and audio file are provided
function updateTranscribeButton() {
    transcribeButton.disabled = !(apiKeyInput.value && audioFileInput.files.length > 0);
}

audioFileInput.addEventListener('change', () => {
    updateTranscribeButton();
    const file = audioFileInput.files[0];
    if (file) {
        fileSizeDisplay.textContent = formatFileSize(file.size);
    }
});

function formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
    }
    return bytes.toFixed(2) + ' ' + units[i];
}

function logMessage(message) {
    const timestamp = new Date().toLocaleTimeString();
    logTextarea.value += `[${timestamp}] ${message}\n`;
    console.log(`[${timestamp}] ${message}`);
}

function updateProgress(percentage, message) {
    progressBar.style.width = percentage + '%';
    progressBar.setAttribute('aria-valuenow', percentage);
    progressBar.textContent = message ? message : percentage + '%';
    console.log(`Progress updated: ${percentage}% - ${message}`);
}

function updateStatistics(fileSize, status, processedChunks, totalChunks) {
    fileSizeDisplay.textContent = formatFileSize(fileSize);
    statusDisplay.textContent = status;
    processedChunksDisplay.textContent = `${processedChunks} / ${totalChunks}`;
    console.log(`Statistics updated: File Size - ${fileSize}, Status - ${status}, Chunks - ${processedChunks}/${totalChunks}`);
}

async function transcribeChunk(apiKey, audioBlob, originalFilename, currentChunk, totalChunks) {
    logMessage(`Darab ${currentChunk}/${totalChunks} átírása... (${formatFileSize(audioBlob.size)})`);
    updateProgress(((currentChunk - 1) / totalChunks) * 100, `Darab ${currentChunk}/${totalChunks} átírása...`);
    updateStatistics(audioBlob.size, 'Átírás...', currentChunk, totalChunks);

    const formData = new FormData();
    formData.append('file', audioBlob, originalFilename);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');

    try {
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            const errorMessage = errorData.error ? errorData.error.message : `HTTP error! status: ${response.status}`;
            throw new Error(`OpenAI API hiba [${response.status}]: ${errorMessage}`);
        }

        const data = await response.json();
        logMessage(`Darab ${currentChunk}/${totalChunks} átírva.`);
        return data;
    } catch (error) {
        logMessage(`Hiba a darab ${currentChunk}/${totalChunks} átírása során: ${error.message}`);
        throw error; // Re-throw the error to be caught by the calling function
    }
}

async function transcribeAudio(apiKey, audioFile) {
    if (!audioFile.type.startsWith('audio/')) {
        throw new Error('A kiválasztott fájl nem hangfájl.');
    }

    updateStatistics(audioFile.size, 'Előkészítés...', 0, 0);

    if (audioFile.size <= MAX_FILE_SIZE) {
        logMessage(`Fájlméret: ${formatFileSize(audioFile.size)}. Közvetlen átírás...`);
        const result = await transcribeChunk(apiKey, audioFile, audioFile.name, 1, 1);
        return result;
    }

    logMessage(`Fájlméret: ${formatFileSize(audioFile.size)}. Túl nagy, darabolás és átírás...`);

    const chunkSize = MAX_FILE_SIZE;
    let currentChunkStart = 0;
    let currentChunk = 1;
    let combinedResult = { segments: [] };
    const totalChunks = Math.ceil(audioFile.size / chunkSize);

    updateStatistics(audioFile.size, 'Darabolás...', 0, totalChunks);

    while (currentChunkStart < audioFile.size) {
        const currentChunkEnd = Math.min(currentChunkStart + chunkSize, audioFile.size);
        const chunk = audioFile.slice(currentChunkStart, currentChunkEnd, audioFile.type);
        const chunkResult = await transcribeChunk(apiKey, chunk, audioFile.name, currentChunk, totalChunks);
        combinedResult.segments.push(...chunkResult.segments);
        currentChunkStart = currentChunkEnd;
        currentChunk++;
    }

    return combinedResult;
}

transcribeButton.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value;
    const audioFile = audioFileInput.files[0];

    if (!apiKey) {
        logMessage('Hiba: Kérem adja meg az OpenAI API kulcsát.');
        return;
    }

    if (!audioFile) {
        logMessage('Hiba: Kérem válasszon ki egy hangfájlt.');
        return;
    }

    // Switch to the Process tab
    switchTab('process');

    resultTextarea.innerHTML = "Átírás folyamatban...";
    logMessage('Átírás indul...');
    updateProgress(0, 'Átírás indul...');
    updateStatistics(0, 'Átírás indul...', 0, 0);

    try {
        const transcribedResult = await transcribeAudio(apiKey, audioFile);
        let formattedOutput = '';

        for (const segment of transcribedResult.segments) {
            formattedOutput += `<div class="segment"><span class="segment-text">${segment.text}</span><span class="segment-timestamp">[${segment.start.toFixed(2)}-${segment.end.toFixed(2)}]</span></div>`;
        }

        resultTextarea.innerHTML = formattedOutput; // Use innerHTML to render HTML

        logMessage('Átírás kész.');
        updateProgress(100, 'Átírás kész.');
        updateStatistics(audioFile.size, 'Kész', 0, 0);

        // Switch to the Output tab on success
        switchTab('output');

    } catch (error) {
        logMessage(`Hiba az átírás során: ${error.message}`);
        resultTextarea.innerHTML = "Hiba az átírás során.";
        updateProgress(0, 'Hiba');
        updateStatistics(audioFile.size, 'Hiba', 0, 0);

        // Stay on the Process tab on failure
        switchTab('process');
    }
});

// Tab switching functionality
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const tabId = tab.getAttribute('data-tab');
        switchTab(tabId);
    });
});

function switchTab(tabId) {
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');
}
