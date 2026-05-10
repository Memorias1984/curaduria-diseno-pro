export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GEMINI_KEY = 'AIzaSyCExbJv_x0lpCJMG_wHiImBUBLQmnFYxso';

  try {
    const { prompt, mode } = req.body;

    const systemPrompt = mode === 'enhance'
      ? 'Eres experto en diseno arquitectonico. Optimiza este prompt para generacion de imagenes AI. Anade detalles tecnicos, estilo visual, iluminacion, materiales. Responde SOLO con el prompt optimizado.'
      : 'Eres critico de diseno profesional. Analiza este proyecto: concepto, elementos clave, recomendaciones de estilo, consideraciones tecnicas. Se conciso.';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\nProyecto: ${prompt}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      })
    });

    if (!geminiRes.ok) {
      return res.status(400).json({ error: `Gemini error: ${geminiRes.status}` });
    }

    const data = await geminiRes.json();
    const text = data.candidates[0].content.parts[0].text;

    return res.status(200).json({ success: true, text });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
