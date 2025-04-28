// server.js

const express = require('express');
const multer = require('multer');
const csv = require('fast-csv');
const fs = require('fs');
const fetch = require('node-fetch');
const { OpenAI } = require('openai');

const SUPABASE_URL = 'https://cetmvcykfytixlxcxupa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNldG12Y3lrZnl0aXhseGN4dXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3Njk2MDQsImV4cCI6MjA2MTM0NTYwNH0.OX8Qf9uOwaPWSvg9DUDfUvKVGG1BMxPXAdgp3pthX-k';
const OPENAI_API_KEY = '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';

const app = express();
// Ensure uploads/ and processed/ directories exist
const uploadDir = './uploads';
const processedDir = './processed';

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

if (!fs.existsSync(processedDir)) {
  fs.mkdirSync(processedDir);
}

const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

app.use(express.static('public'));

// NEW FIX: Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

async function checkSupabase(name) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/pronunciations?name=eq.${encodeURIComponent(name)}`, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });
  const data = await response.json();
  if (data.length > 0) return data[0].pronunciation;
  return null;
}

async function saveToSupabase(name, pronunciation) {
  await fetch(`${SUPABASE_URL}/rest/v1/pronunciations`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify([{ name, pronunciation }]),
  });
}

async function getPronunciationFromGPT(name) {
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{
      role: 'user',
      content: `Please provide a simple English phonetic pronunciation for the name '${name}'. Keep it very short.`
    }],
    temperature: 0.2
  });
  return response.choices[0].message.content.trim();
}

app.post('/upload', upload.single('file'), async (req, res) => {
  console.log("File uploaded:", req.file); // ADD THIS LINE
  
  const results = [];
  const pronouncedResults = [];

  fs.createReadStream(req.file.path)
    .pipe(csv.parse({ headers: true }))
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      console.log("Starting CSV parsing..."); // ADD THIS LINE

      for (const row of results) {
        const firstName = row['First Name']?.trim() || '';
        const lastName = row['Last Name']?.trim() || '';
        const fullName = `${firstName} ${lastName}`.trim();

        if (!fullName) {
          row['Pronounced Name'] = '';
          pronouncedResults.push(row);
          continue;
        }

        let pronunciation = await checkSupabase(fullName);
        if (!pronunciation) {
          pronunciation = await getPronunciationFromGPT(fullName);
          await saveToSupabase(fullName, pronunciation);
        }

        row['Pronounced Name'] = pronunciation;
        pronouncedResults.push(row);
      }

      console.log("Finished reading CSV..."); // ADD THIS LINE

      const outputPath = `processed/${Date.now()}_pronounced.csv`;
      const ws = fs.createWriteStream(outputPath);
      csv.write(pronouncedResults, { headers: true }).pipe(ws);

      ws.on('finish', () => {
        console.log("Sending final CSV file...");
        res.download(outputPath, 'pronounced_debtors.csv');
      });
    });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
