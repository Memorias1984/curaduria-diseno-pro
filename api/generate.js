export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const LEONARDO_KEY = '615c70ed-88a8-49ef-b0ff-96616762f64d';

  try {
    const { prompt, type, useImage, imageData } = req.body;

    // Prompts que REFUERZAN la coherencia con la imagen original
    const modifiers = {
      sketch: 'Keep the original structure and layout exactly. Enhance as a professional architectural sketch with clean linework, watercolor textures, hand-drawn style. Maintain all proportions, elements, and spatial relationships from the reference image.',
      plan: 'Keep the original structure and layout exactly. Convert to a precise technical architectural floor plan, CAD style, with dimension lines, annotations, and construction details. Maintain all spatial relationships and proportions.',
      '3d': 'Keep the original structure and layout exactly. Transform into a photorealistic 3D architectural render with volumetric lighting, realistic materials, and professional visualization. Maintain the exact same design, proportions, and spatial relationships.'
    };

    // Prompt que fuerza a la IA a respetar la imagen
    const basePrompt = useImage && imageData 
      ? `Based on the provided reference image, ${prompt || 'enhance this architectural design'}. ${modifiers[type] || modifiers.sketch}. CRITICAL: Preserve the original layout, proportions, and all visible elements. Do not invent new structures.`
      : `${prompt}. ${modifiers[type] || modifiers.sketch}. High quality, detailed, professional.`;

    let imageId = null;
    
    // Subir imagen a Leonardo si existe
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
        console.log('Image uploaded, ID:', imageId);
      } else {
        console.error('Upload failed:', await uploadRes.text());
      }
    }

    // Payload base
    const payload = {
      prompt: basePrompt,
      modelId: '6bef9f1b-29cb-40c7-b9df-32b51c1f67d3',
      width: 1024,
      height: 1024,
      num_images: 1,
      guidance_scale: 7,
      alchemy: true,
      // Fuerza a respetar más el prompt (y por ende la imagen)
      promptMagic: true,
      promptMagicVersion: 'v3',
      promptMagicStrength: 0.7
    };

    // Si hay imagen, usar PHOTOREAL como controlnet para mantener coherencia
    if (useImage && imageId) {
      payload.controlnets = [{
        initImageId: imageId,
        initImageType: 'UPLOADED',
        preprocessorId: 133, // PHOTOREAL - mantiene mejor la estructura original
        strengthType: 'High'  // Fuerza máxima para respetar la imagen
      }];
      
      // También usar la imagen como referencia de estilo
      payload.imagePrompts = [{
        initImageId: imageId,
        initImageType: 'UPLOADED',
        weight: 0.85  // Peso alto para que respete la imagen
      }];
    }

    console.log('Payload:', JSON.stringify(payload, null, 2));

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

    if (!generationId) return res.status(400).json({ error: 'No generationId received', data: genData });

    // Esperar resultado con más intentos
    for (let attempt = 0; attempt < 180; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      
      const statusRes = await fetch(`https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`, {
        headers: {
          'Authorization': `Bearer ${LEONARDO_KEY}`,
          'Accept': 'application/json'
        }
      });

      if (!statusRes.ok) continue;

      const statusData = await statusRes.json();
      const job = statusData.generations_by_pk;
      const images = job?.generated_images;

      if (images && images.length > 0 && images[0].url) {
        return res.status(200).json({
          success: true,
          images: images,
          generationId: generationId,
          prompt: basePrompt
        });
      }

      if (job?.status === 'FAILED') {
        return res.status(500).json({ error: 'Generation failed on Leonardo', details: job });
      }
    }

    return res.status(504).json({ error: 'Timeout - generation took too long' });

  } catch (error) {
    console.error('Server error:', error);
  return res.status(500).json({ error: error.message });
  }
}
