export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt, type, useImage, imageData } = req.body;

    const modifiers = {
      sketch: 'professional architectural sketch, hand-drawn style, detailed line work, concept art, technical drawing, high contrast',
      plan: 'technical architectural floor plan, top-down CAD view, precise measurements, construction blueprint, dimension lines',
      '3d': '3D architectural render, volumetric lighting, photorealistic, isometric view, depth of field, professional visualization'
    };

    const finalPrompt = (prompt || 'Architectural design') + '. ' + (modifiers[type] || modifiers.sketch) + '. High quality, detailed, professional.';

    let imageUrl = null;

    if (useImage && imageData) {
      const encodedPrompt = encodeURIComponent(finalPrompt);
      imageUrl = 'https://image.pollinations.ai/prompt/' + encodedPrompt + '?width=1024&height=1024&seed=42&nologo=true&negative=people,interior,room,furniture,table,chair,restaurant,cafe&image=' + encodeURIComponent('data:image/png;base64,' + imageData) + '&strength=0.4';
    } else {
      const encodedPrompt = encodeURIComponent(finalPrompt);
      imageUrl = 'https://image.pollinations.ai/prompt/' + encodedPrompt + '?width=1024&height=1024&seed=42&nologo=true';
    }

    return res.status(200).json({
      success: true,
      images: [{ url: imageUrl }],
      generationId: 'pollinations-' + Date.now(),
      prompt: finalPrompt
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: error.message });
  }
}
