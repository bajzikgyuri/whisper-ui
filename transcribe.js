async function transcribe() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'audio/*';
  fileInput.click();

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');

    try {
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`, // Replace with your actual API key or use a key input field
        },
        body: formData,
      });

      const data = await response.json();
      console.log(JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error:', error);
    }
  });
}


// Example usage: Call transcribe() when a button is clicked or on page load
// Add this to your HTML:
// &lt;button onclick="transcribe()"&gt;Transcribe Audio&lt;/button&gt;
