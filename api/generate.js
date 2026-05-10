export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const LEONARDO_KEY = '615c70ed-88a8-49ef-b0ff-96616762f64d';

  try {
    const { prompt, type } = req.body;

    // El prompt del usuario ya viene detallado, lo usamos directamente
    // pero le agregamos instrucciones técnicas muy específicas
    const basePrompt = prompt || 'Architectural design';

    // Instrucciones ultra-específicas por tipo
    const styleInstructions = {
      sketch: 'Technical architectural hand-drawn sketch, pencil and ink on white paper, detailed line work, cross-hatching for shadows, concept art, professional architectural illustration, clean composition, NO people, NO background buildings, isolated object on white background',
      plan: 'Technical architectural floor plan, CAD drawing, top-down view, precise measurements, dimension lines, construction blueprint style, black and white, professional layout, NO perspective, NO people, technical documentation',
      '3d': 'Photorealistic 3D architectural render, studio lighting, neutral gray background, professional product visualization, high quality materials, NO people, NO background environment, isolated object, 8k resolution'
    };

    // Prompt final que combina la descripción del usuario con instrucciones técnicas
    const finalPrompt = basePrompt + '. ' + styleInstructions[type] + '. Single object centered in frame.';

    const payload = {
      prompt: finalPrompt,
      modelId: '6bef9f1b-29cb-40c7-b9df-32b51c1f67d3',
      width: 1024,
      height: 1024,
      num_images: 1,
      guidance_scale: 9,  // Aumentado para seguir más estrictamente el prompt
      alchemy: true,
      // Negative prompt para excluir lo que NO queremos
      negative_prompt: 'people, humans, persons, crowd, maze, labyrinth, background buildings, cityscape, landscape, interior, room, furniture, table, chair, restaurant, cafe, street, cars, trees in background'
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
