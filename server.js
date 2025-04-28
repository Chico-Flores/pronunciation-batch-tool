// ====== IMPORTS ======
import express from 'express';
import multer from 'multer';
import csv from 'fast-csv';
import fs from 'fs';
import fetch from 'node-fetch';
import { OpenAI } from 'openai';

// ====== CONFIG ======
const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 10000;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ====== HELPERS ======
async function checkSupabase(name) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/pronunciations?name=eq.${encodeURIComponent(name)}`, {
    method: "GET",
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });
  const data = await response.json();
  if (data.length > 0) {
    return data[0].pronunciation;
  }
  return null;
}

async function saveToSupabase(name, pronunciation) {
  await fetch(`${SUPABASE_URL}/rest/v1/pronunciations`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify([{ name, pronunciation }])
  });
}

async function getPronunciationFromGPT(name) {
  const chatCompletion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{
      role: "user",
      content: `Provide a simple English phonetic pronunciation for the name '${name}'. Keep it very short.`
    }],
    temperature: 0.2
  });
  return chatCompletion.choices[0].message.content.trim();
}

// ====== ROUTES ======
app.use(express.static('public'));

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      console.error("No file uploaded");
      return res.status(400).send("No file uploaded.");
    }

    const results = [];
    const pronouncedResults = [];

    fs.createReadStream(req.file.path)
      .pipe(csv.parse({ headers: true }))
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        console.log("Starting CSV parsing...");

        for (const row of results) {
          const firstName = row['First Name']?.trim() || '';
          const lastName = row['Last Name']?.trim() || '';
          const fullName = `${firstName} ${lastName}`.trim();

          if (!fullName) {
            row['Pronounced Name'] = '';
            pronouncedResults.push(row);
            continue;
          }

          // Check individually
          let firstPronunciation = await checkSupabase(firstName);
          if (!firstPronunciation && firstName) {
            firstPronunciation = await getPronunciationFromGPT(firstName);
            await saveToSupabase(firstName, firstPronunciation);
          }

          let lastPronunciation = await checkSupabase(lastName);
          if (!lastPronunciation && lastName) {
            lastPronunciation = await getPronunciationFromGPT(lastName);
            await saveToSupabase(lastName, lastPronunciation);
          }

          // Combine pronunciations
          row['Pronounced Name'] = `${firstPronunciation || ''} ${lastPronunciation || ''}`.trim();
          pronouncedResults.push(row);
        }

        console.log("Finished processing CSV...");

        const outputPath = `processed/${Date.now()}_pronounced_debtors.csv`;
        const ws = fs.createWriteStream(outputPath);
        csv.write(pronouncedResults, { headers: true }).pipe(ws);

        ws.on('finish', () => {
          console.log("Sending file to user...");
          res.download(outputPath, 'pronounced_debtors.csv');
        });
      });
  } catch (error) {
    console.error("Error during upload processing:", error);
    res.status(500).send("Server error while processing file.");
  }
});

// ====== START SERVER ======
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
