const apiKeyInput = document.getElementById('apiKey');
const audioFileInput = document.getElementById('audioFile');
const transcribeButton = document.getElementById('transcribeButton');
const originalOutputDiv = document.getElementById('original-output');
const formattedOutputDiv = document.getElementById('formatted-output');
const logTextarea = document.getElementById('log');
const progressBar = document.getElementById('progress-bar');
const fileSizeDisplay = document.getElementById('file-size');
const statusDisplay = document.getElementById('status');
const processedChunksDisplay = document.getElementById('processed-chunks');
const darkModeToggle = document.getElementById('darkModeToggle');
const reformulateToggle = document.getElementById('reformulateToggle');
const outputContainer = document.querySelector('.output-container');
const toastContainer = document.getElementById('toast-container');

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB for testing, change back to 24MB for production

// Load API key and dark mode preference from local storage on page load
window.addEventListener('load', () => {
    const savedApiKey = localStorage.getItem('apiKey');
    if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
    }
    const darkModeEnabled = localStorage.getItem('darkMode') === 'true';
    if (darkModeEnabled) {
        document.body.classList.add('dark-mode');
    }
    updateTranscribeButton();
    console.log("API key and dark mode preference loaded from local storage.");
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
        throw error;
    }
}

async function transcribeAudio(apiKey, audioFile) {
    if (!audioFile.type.startsWith('audio/')) {
        throw new Error('A kiválasztott fájl nem hangfájl.');
    }

    updateStatistics(audioFile.size, 'Előkészítés...', 0, 0);

    const chunkSize = MAX_FILE_SIZE;
    let currentChunkStart = 0;
    let currentChunk = 1;
    let combinedResult = { segments: [] };
    const totalChunks = Math.ceil(audioFile.size / chunkSize);

    updateStatistics(audioFile.size, 'Darabolás...', 0, totalChunks);

    let previousChunkText = '';

    while (currentChunkStart < audioFile.size) {
        const currentChunkEnd = Math.min(currentChunkStart + chunkSize, audioFile.size);
        const chunk = audioFile.slice(currentChunkStart, currentChunkEnd, audioFile.type);
        const chunkResult = await transcribeChunk(apiKey, chunk, audioFile.name, currentChunk, totalChunks);
        
        // Format and display the chunk result
        let formattedChunkOutput = '';
        for (const segment of chunkResult.segments) {
            const formattedSegmentText = segment.text.replace(/\.(\s|$)/g, '.$1\n');
            formattedChunkOutput += `<div class="segment"><span class="segment-text">${formattedSegmentText}</span><span class="segment-timestamp">${formatTime(segment.start)}-${formatTime(segment.end)}</span></div>`;
        }
        originalOutputDiv.innerHTML += formattedChunkOutput;

        // AI formatting for the chunk
        if (reformulateToggle.checked) {
            const chunkText = chunkResult.segments.map(segment => segment.text).join(' ');
            
            // Combine current chunk with the previous one for context
            const textToFormat = previousChunkText + ' ' + chunkText;
            
            try {
                const formattedChunkText = await reformulateOutput(apiKey, textToFormat);
                
                // Only display the formatted text for the current chunk
                const formattedCurrentChunk = formattedChunkText.slice(previousChunkText.length).trim();
                formattedOutputDiv.innerHTML += formattedCurrentChunk;
                formattedOutputDiv.style.display = 'block';
            } catch (error) {
                logMessage(`Hiba a formázott szöveg lekérése során: ${error.message}`);
                formattedOutputDiv.innerHTML += "Hiba a formázott szöveg lekérése során.";
                formattedOutputDiv.style.display = 'block';
            }
            
            // Update previousChunkText for the next iteration
            previousChunkText = chunkText;
        }

        combinedResult.segments.push(...chunkResult.segments);
        currentChunkStart = currentChunkEnd;
        currentChunk++;

        // Update progress
        updateProgress(((currentChunk - 1) / totalChunks) * 100, `Darab ${currentChunk - 1}/${totalChunks} kész`);
        updateStatistics(audioFile.size, 'Feldolgozás...', currentChunk - 1, totalChunks);
    }

    return combinedResult;
}

async function reformulateOutput(apiKey, text) {
    const systemPrompt = "Act like a professional Hungarian-language transcription editor with over 10 years of experience. Your primary role is to correct spelling, grammar, and formatting errors without altering the meaning or style. Follow these guidelines: 1. Correct all spelling errors based on standard Hungarian orthography. 2. Ensure proper grammar and punctuation (periods, commas, quotation marks, etc.). 3. Fix capitalization errors (proper nouns, sentence beginnings). 4. Correct formatting issues like dialogue or list layout. 5. Keep the output language the same as the input (Hungarian). 6. Do not rephrase or change the style or meaning. Focus only on technical corrections. Objective: Return an edited transcription with corrected errors while preserving the original meaning, style, and flow. Take a deep breath and work on this problem step-by-step.";
    const requestBody = {
        model: "gpt-4",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
        ],
        temperature: 0 // Set temperature to 0 for deterministic output
    };

    try {
        logMessage('Reformuláció indítása...');
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            const errorMessage = errorData.error ? errorData.error.message : `HTTP error! status: ${response.status}`;
            throw new Error(`OpenAI API hiba [${response.status}]: ${errorMessage}`);
        }

        const data = await response.json();
        logMessage('Reformuláció sikeres.');
        return data.choices[0].message.content;
    } catch (error) {
        logMessage(`Hiba a reformuláció során: ${error.message}`);
        throw error;
    }
}

transcribeButton.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value;
    const audioFile = audioFileInput.files[0];

    if (!apiKey) {
        logMessage('Hiba: Kérem adja meg az OpenAI API kulcsát.');
        showToast('Hiba: Kérem adja meg az OpenAI API kulcsát.', 'error');
        return;
    }

    if (!audioFile) {
        logMessage('Hiba: Kérem válasszon ki egy hangfájlt.');
        showToast('Hiba: Kérem válasszon ki egy hangfájlt.', 'error');
        return;
    }

    // Switch to the Process tab
    switchTab('process');

    originalOutputDiv.innerHTML = "";
    formattedOutputDiv.innerHTML = "";
    logMessage('Átírás indul...');
    updateProgress(0, 'Átírás indul...');
    updateStatistics(0, 'Átírás indul...', 0, 0);

    try {
        await transcribeAudio(apiKey, audioFile);

        logMessage('Átírás kész.');
        updateProgress(100, 'Átírás kész.');
        updateStatistics(audioFile.size, 'Kész', 0, 0);
        showToast('Átírás sikeresen befejezve!', 'success');

        // Switch to the Output tab on success
        switchTab('output');

        //Added code to make the output container full width
        outputContainer.style.width = '100%';

        // Add buttons to the "Eredeti Szöveg" and "Formázott Szöveg" boxes
        addButtonsToOutputBoxes();

    } catch (error) {
        logMessage(`Hiba az átírás során: ${error.message}`);
        originalOutputDiv.innerHTML = "Hiba az átírás során.";
        formattedOutputDiv.innerHTML = "";
        updateProgress(0, 'Hiba');
        updateStatistics(audioFile.size, 'Hiba', 0, 0);
        showToast(`Hiba az átírás során: ${error.message}`, 'error');

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
    if (tabId === 'output') {
        outputContainer.style.width = '100%';
    }
}

// Dark mode toggle functionality
darkModeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
});


function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
}

function addButtonsToOutputBoxes() {
    const originalBox = document.querySelector('#original-output').closest('.output-box');
    const formattedBox = document.querySelector('#formatted-output').closest('.output-box');

    addButtonsToBox(originalBox, 'original-output');
    addButtonsToBox(formattedBox, 'formatted-output');
}

function addButtonsToBox(box, outputId) {
    const buttonGroup = box.querySelector('.button-group');
    if (buttonGroup) {
        buttonGroup.innerHTML = ''; // Clear existing buttons
        const copyButton = createButton('📋', () => copyText(document.getElementById(outputId).innerHTML));
        const fullscreenButton = createButton('🔍', () => openModal(document.getElementById(outputId).innerHTML));
        buttonGroup.appendChild(copyButton);
        buttonGroup.appendChild(fullscreenButton);
    }
}

function createButton(icon, onClick) {
    const button = document.createElement('button');
    button.innerHTML = icon;
    button.classList.add('icon-button');
    button.onclick = onClick;
    return button;
}

function copyText(text) {
    const cleanText = text.replace(/<[^>]*>/g, ''); // Remove HTML tags
    navigator.clipboard.writeText(cleanText).then(() => {
        showToast('Szöveg másolva!', 'success');
    }, () => {
        showToast('Hiba a másolás során!', 'error');
    });
}

function openModal(htmlContent) {
    const modal = document.createElement('div');
    modal.classList.add('modal');
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close-button" onclick="closeModal(this)">×</span>
            <div class="modal-text">${htmlContent}</div>
        </div>`;
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal(modal);
        }
    });
    document.body.appendChild(modal);
}

function closeModal(element) {
    const modal = element.closest('.modal');
    modal.remove();
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.classList.add('toast', `toast-${type}`);
    toast.textContent = message;

    toastContainer.appendChild(toast);

    // Trigger a reflow
    toast.offsetHeight;

    // Add the 'show' class to start the transition
    toast.classList.add('show');

    // Remove the toast after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toastContainer.removeChild(toast);
        }, 300); // Wait for the fade out transition to complete
    }, 3000);
}
