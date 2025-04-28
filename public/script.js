const form = document.getElementById('uploadForm');
const statusDiv = document.getElementById('status');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData(form);

  try {
    statusDiv.textContent = "Processing... ⏳";
    
    const response = await fetch('/upload', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error("Upload failed.");
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'pronounced_debtors.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();

    statusDiv.textContent = "✅ Completed! Download should start automatically.";
  } catch (error) {
    console.error(error);
    statusDiv.textContent = "❌ Error: Upload failed. Please try again.";
  }
});

