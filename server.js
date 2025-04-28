const express = require('express');
const multer = require('multer');
const csv = require('fast-csv');
const fs = require('fs');
const fetch = require('node-fetch');
const { OpenAI } = require('openai');

const SUPABASE_URL = 'https://cetmvcykfytixlxcxupa.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR-SUPABASE-ANON-KEY';
const OPENAI_API_KEY = 'YOUR-OPENAI-API-KEY';

const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

app.use(express.static('public'));

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
  const results = [];
  const pronouncedResults = [];

  fs.createReadStream(req.file.path)
    .pipe(csv.parse({ headers: true }))
    .on('data', (data) => results.push(data))
    .on('end', async () => {
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

      const outputPath = `processed/${Date.now()}_pronounced.csv`;
      const ws = fs.createWriteStream(outputPath);
      csv.write(pronouncedResults, { headers: true }).pipe(ws);

      ws.on('finish', () => {
        res.download(outputPath, 'pronounced_debtors.csv');
      });
    });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));