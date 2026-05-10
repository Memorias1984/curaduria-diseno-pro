export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const LEONARDO_KEY = '615c70ed-88a8-49ef-b0ff-96616762f64d';

  try {
    const { prompt, type, useImage, imageData } = req.body;
    
    const modifiers = {
      sketch: 'professional architectural sketch, hand-drawn style, detailed line work, concept art, technical drawing, high contrast',
      plan: 'technical architectural floor plan, top-down CAD view, precise measurements, construction blueprint, dimension lines',
      '3d': '3D architectural render, volumetric lighting, photorealistic, isometric view, depth of field, professional visualization'
    };

    const finalPrompt = `${prompt}. ${modifiers[type] || modifiers.sketch}. High quality, detailed, professional.`;

    let imageId = null;
    if (useImage && imageData) {
      const uploadRes = await fetch('https://cloud.leonardo.ai/api/rest/v1/init-image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LEONARDO_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ extension: 'png', content: imageData })
      });
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        imageId = uploadData.uploadInitImage?.id;
      }
    }

    const payload = {
      prompt: finalPrompt,
      modelId: '6bef9f1b-29cb-40c7-b9df-32b51c1f67d3',
      width: 1024,
      height: 1024,
      num_images: 1,
      guidance_scale: 7,
      alchemy: true
    };

    if (useImage && imageId) {
      payload.controlnets = [{
        initImageId: imageId,
        initImageType: 'UPLOADED',
        preprocessorId: 67,
        strengthType: 'Low'
      }];
    }

    const genRes = await fetch('https://cloud.leonardo.ai/api/rest/v1/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LEONARDO_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!genRes.ok) {
      const err = await genRes.text();
      return res.status(400).json({ error: `Leonardo API error: ${genRes.status}`, details: err });
    }

    const genData = await genRes.json();
    const generationId = genData.sdGenerationJob?.generationId;

    if (!generationId) return res.status(400).json({ error: 'No generationId received' });

    for (let attempt = 0; attempt < 150; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      
      const statusRes = await fetch(`https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`, {
        headers: {
          'Authorization': `Bearer ${LEONARDO_KEY}`,
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
