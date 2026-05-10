export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const LEONARDO_KEY = '615c70ed-88a8-49ef-b0ff-96616762f64d';

  try {
    const { prompt, type } = req.body;

    // Construir prompt ultra-específico basado en la descripción del usuario
    const basePrompt = prompt || 'Architectural design';
    
    // Prompts muy detallados por tipo que mantienen TODOS los elementos
    const prompts = {
      sketch: 'Professional architectural sketch of: ' + basePrompt + '. Hand-drawn pencil and ink style, technical drawing, concept art, detailed line work, cross-hatching, white background, clean composition, high contrast, architectural illustration',
      plan: 'Technical architectural floor plan and elevation of: ' + basePrompt + '. Top-down CAD view, precise measurements, construction blueprint, dimension lines, black and white technical drawing, professional layout, scaled drawing, architectural documentation, section view',
      '3d': 'Photorealistic 3D architectural render of: ' + basePrompt + '. Volumetric lighting, realistic materials, professional visualization, exterior view, depth of field, high quality, detailed textures, architectural photography style, 8k resolution'
    };

    const finalPrompt = prompts[type] || prompts.sketch;

    const payload = {
      prompt: finalPrompt,
      modelId: '6bef9f1b-29cb-40c7-b9df-32b51c1f67d3',
      width: 1024,
      height: 1024,
      num_images: 1,
      guidance_scale: 7,
      alchemy: true
    };

    const genRes = await fetch('https://cloud.leonardo.ai/api/rest/v1/generations', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + LEONARDO_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!genRes.ok) {
      const err = await genRes.text();
      return res.status(400).json({ error: 'Leonardo API error: ' + genRes.status, details: err });
    }

    const genData = await genRes.json();
    const generationId = genData.sdGenerationJob?.generationId;

    if (!generationId) return res.status(400).json({ error: 'No generationId received', data: genData });

    for (let attempt = 0; attempt < 150; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      
      const statusRes = await fetch('https://cloud.leonardo.ai/api/rest/v1/generations/' + generationId, {
        headers: {
          'Authorization': 'Bearer ' + LEONARDO_KEY,
          'Accept': 'application/json'
        }
      });

      if (!statusRes.ok) continue;

      const statusData = await statusRes.json();
      const images = statusData.generations_by_pk?.generated_images;

      if (images && images.length > 0 && images[0].url) {
        return res.status(200).json({
          success: true,
          images: images,
          generationId: generationId,
          prompt: finalPrompt
        });
      }

      if (statusData.generations_by_pk?.status === 'FAILED') {
        return res.status(500).json({ error: 'Generation failed on Leonardo' });
      }
    }

    return res.status(504).json({ error: 'Timeout - generation took too long' });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: error.message });
  }
}
