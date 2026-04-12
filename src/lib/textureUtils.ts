/**
 * Utility functions for generating texture maps from a base image.
 */

export interface TextureOptions {
  intensity: number;
  contrast: number;
  blur: number;
  invert?: boolean;
}

export type MapType = 'Normal' | 'Roughness' | 'Displacement' | 'Bump' | 'AO' | 'Glossiness' | 'Reflections' | 'Self-Illumination' | 'Cutout';

export const generateGrayscale = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    data[i] = avg;
    data[i + 1] = avg;
    data[i + 2] = avg;
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = canvas.width;
  outCanvas.height = canvas.height;
  outCanvas.getContext('2d')?.putImageData(imageData, 0, 0);
  return outCanvas;
};

export const applyContrast = (canvas: HTMLCanvasElement, contrast: number): HTMLCanvasElement => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

  for (let i = 0; i < data.length; i += 4) {
    data[i] = factor * (data[i] - 128) + 128;
    data[i + 1] = factor * (data[i + 1] - 128) + 128;
    data[i + 2] = factor * (data[i + 2] - 128) + 128;
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = canvas.width;
  outCanvas.height = canvas.height;
  outCanvas.getContext('2d')?.putImageData(imageData, 0, 0);
  return outCanvas;
};

export const generateNormalMap = (canvas: HTMLCanvasElement, intensity: number): HTMLCanvasElement => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return canvas;
  const outImageData = outCtx.createImageData(width, height);
  const outData = outImageData.data;

  const getGray = (x: number, y: number) => {
    x = Math.max(0, Math.min(width - 1, x));
    y = Math.max(0, Math.min(height - 1, y));
    const idx = (y * width + x) * 4;
    return (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
  };

  const strength = intensity * 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tl = getGray(x - 1, y - 1);
      const t = getGray(x, y - 1);
      const tr = getGray(x + 1, y - 1);
      const l = getGray(x - 1, y);
      const r = getGray(x + 1, y);
      const bl = getGray(x - 1, y + 1);
      const b = getGray(x, y + 1);
      const br = getGray(x + 1, y + 1);

      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      const dz = 1.0 / strength;

      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const nx = dx / len;
      const ny = dy / len;
      const nz = dz / len;

      const idx = (y * width + x) * 4;
      outData[idx] = (nx * 0.5 + 0.5) * 255;
      outData[idx + 1] = (ny * 0.5 + 0.5) * 255;
      outData[idx + 2] = (nz * 0.5 + 0.5) * 255;
      outData[idx + 3] = 255;
    }
  }

  outCtx.putImageData(outImageData, 0, 0);
  return outCanvas;
};

/**
 * Makes a canvas tileable using an edge-wrap/offset algorithm.
 */
export const generateSeamless = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
  const width = canvas.width;
  const height = canvas.height;
  const seamless = document.createElement('canvas');
  seamless.width = width;
  seamless.height = height;
  const ctx = seamless.getContext('2d');
  if (!ctx) return canvas;

  // Offset the image by 50% in both directions
  const offsetX = Math.floor(width / 2);
  const offsetY = Math.floor(height / 2);

  // Draw 4 quadrants
  ctx.drawImage(canvas, 0, 0, offsetX, offsetY, width - offsetX, height - offsetY, offsetX, offsetY);
  ctx.drawImage(canvas, offsetX, 0, width - offsetX, offsetY, 0, height - offsetY, width - offsetX, offsetY);
  ctx.drawImage(canvas, 0, offsetY, offsetX, height - offsetY, width - offsetX, 0, offsetX, height - offsetY);
  ctx.drawImage(canvas, offsetX, offsetY, width - offsetX, height - offsetY, 0, 0, width - offsetX, height - offsetY);

  return seamless;
};

/**
 * Inverts the green channel of a normal map (OpenGL vs DirectX).
 */
export const invertNormalGreen = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i + 1] = 255 - data[i + 1]; // Invert Green channel
  }
  const outCanvas = document.createElement('canvas');
  outCanvas.width = canvas.width;
  outCanvas.height = canvas.height;
  outCanvas.getContext('2d')?.putImageData(imageData, 0, 0);
  return outCanvas;
};

/**
 * Upscales a canvas to a target resolution.
 */
export const upscaleCanvas = (canvas: HTMLCanvasElement, targetWidth: number): HTMLCanvasElement => {
  const targetHeight = Math.floor((canvas.height / canvas.width) * targetWidth);
  const upscaled = document.createElement('canvas');
  upscaled.width = targetWidth;
  upscaled.height = targetHeight;
  const ctx = upscaled.getContext('2d');
  if (!ctx) return canvas;
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
  
  return upscaled;
};

/**
 * Adds a grout border to a canvas and modifies map channels accordingly.
 */
export const applyGrout = (
  canvas: HTMLCanvasElement, 
  widthPx: number, 
  color: string, 
  type: MapType | 'Albedo',
  options: { matteGrout?: boolean; depth?: number; sharpness?: number } = {}
): HTMLCanvasElement => {
  const width = canvas.width;
  const height = canvas.height;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const ctx = outCanvas.getContext('2d');
  if (!ctx) return canvas;

  // Draw original
  ctx.drawImage(canvas, 0, 0);

  const halfWidth = widthPx / 2;
  const sharpness = options.sharpness ?? 50; // 0-100
  // Bevel width based on sharpness: lower sharpness = wider bevel
  const bevelWidth = Math.max(1, halfWidth * (1 - sharpness / 100));
  
  ctx.fillStyle = color;
  
  if (type === 'Albedo') {
    ctx.fillRect(0, 0, width, halfWidth); // Top
    ctx.fillRect(0, height - halfWidth, width, halfWidth); // Bottom
    ctx.fillRect(0, 0, halfWidth, height); // Left
    ctx.fillRect(width - halfWidth, 0, halfWidth, height); // Right
  } else if (type === 'Displacement' || type === 'Bump' || type === 'AO') {
    const depthVal = Math.max(0, 50 - (options.depth || 0) * 10);
    ctx.fillStyle = `rgb(${depthVal},${depthVal},${depthVal})`;
    
    // Draw grout base
    ctx.fillRect(0, 0, width, halfWidth);
    ctx.fillRect(0, height - halfWidth, width, halfWidth);
    ctx.fillRect(0, 0, halfWidth, height);
    ctx.fillRect(width - halfWidth, 0, halfWidth, height);

    // Draw bevels for displacement (gradient from surface to grout depth)
    const surfaceVal = 255;
    
    // Top bevel
    const gradTop = ctx.createLinearGradient(0, halfWidth, 0, halfWidth + bevelWidth);
    gradTop.addColorStop(0, `rgb(${depthVal},${depthVal},${depthVal})`);
    gradTop.addColorStop(1, `rgb(${surfaceVal},${surfaceVal},${surfaceVal})`);
    ctx.fillStyle = gradTop;
    ctx.fillRect(halfWidth, halfWidth, width - widthPx, bevelWidth);

    // Bottom bevel
    const gradBottom = ctx.createLinearGradient(0, height - halfWidth, 0, height - halfWidth - bevelWidth);
    gradBottom.addColorStop(0, `rgb(${depthVal},${depthVal},${depthVal})`);
    gradBottom.addColorStop(1, `rgb(${surfaceVal},${surfaceVal},${surfaceVal})`);
    ctx.fillStyle = gradBottom;
    ctx.fillRect(halfWidth, height - halfWidth - bevelWidth, width - widthPx, bevelWidth);

  } else if (type === 'Roughness') {
    if (options.matteGrout) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, halfWidth);
      ctx.fillRect(0, height - halfWidth, width, halfWidth);
      ctx.fillRect(0, 0, halfWidth, height);
      ctx.fillRect(width - halfWidth, 0, halfWidth, height);
    }
  } else if (type === 'Normal') {
    // Flat normal for grout
    ctx.fillStyle = 'rgb(128, 128, 255)'; 
    ctx.fillRect(0, 0, width, halfWidth);
    ctx.fillRect(0, height - halfWidth, width, halfWidth);
    ctx.fillRect(0, 0, halfWidth, height);
    ctx.fillRect(width - halfWidth, 0, halfWidth, height);
    
    // Normal map bevels
    // Top bevel (slanting up)
    const gradTop = ctx.createLinearGradient(0, halfWidth, 0, halfWidth + bevelWidth);
    gradTop.addColorStop(0, 'rgb(128, 64, 255)'); 
    gradTop.addColorStop(1, 'rgb(128, 128, 255)');
    ctx.fillStyle = gradTop;
    ctx.fillRect(halfWidth, halfWidth, width - widthPx, bevelWidth);

    // Bottom bevel (slanting down)
    const gradBottom = ctx.createLinearGradient(0, height - halfWidth, 0, height - halfWidth - bevelWidth);
    gradBottom.addColorStop(0, 'rgb(128, 192, 255)'); 
    gradBottom.addColorStop(1, 'rgb(128, 128, 255)');
    ctx.fillStyle = gradBottom;
    ctx.fillRect(halfWidth, height - halfWidth - bevelWidth, width - widthPx, bevelWidth);
  }

  return outCanvas;
};

/**
 * Creates a tiled preview of a canvas.
 */
export const generateTiledPreview = (canvas: HTMLCanvasElement, grid: number): HTMLCanvasElement => {
  const size = 600; // Fixed preview size
  const outCanvas = document.createElement('canvas');
  outCanvas.width = size;
  outCanvas.height = size;
  const ctx = outCanvas.getContext('2d');
  if (!ctx) return canvas;

  const tileSize = size / grid;
  for (let y = 0; y < grid; y++) {
    for (let x = 0; x < grid; x++) {
      ctx.drawImage(canvas, x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }
  return outCanvas;
};

export const sharpenCanvas = (canvas: HTMLCanvasElement, amount: number): HTMLCanvasElement => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return canvas;
  const outImageData = outCtx.createImageData(width, height);
  const outData = outImageData.data;

  const mix = amount / 100;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      const getVal = (nx: number, ny: number, c: number) => {
        nx = Math.max(0, Math.min(width - 1, nx));
        ny = Math.max(0, Math.min(height - 1, ny));
        return data[(ny * width + nx) * 4 + c];
      };

      for (let c = 0; c < 3; c++) {
        const center = getVal(x, y, c);
        const top = getVal(x, y - 1, c);
        const left = getVal(x - 1, y, c);
        const right = getVal(x + 1, y, c);
        const bottom = getVal(x, y + 1, c);
        
        const sharpened = center * 5 - (top + left + right + bottom);
        outData[idx + c] = center * (1 - mix) + sharpened * mix;
      }
      outData[idx + 3] = 255;
    }
  }
  
  outCtx.putImageData(outImageData, 0, 0);
  return outCanvas;
};

export const generateRoughnessMap = (canvas: HTMLCanvasElement, options: TextureOptions): HTMLCanvasElement => {
  const grayscale = generateGrayscale(canvas);
  const contrasted = applyContrast(grayscale, options.contrast);
  const ctx = contrasted.getContext('2d');
  if (!ctx) return contrasted;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  if (options.invert) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return contrasted;
};

export const generateDisplacementMap = (canvas: HTMLCanvasElement, options: TextureOptions): HTMLCanvasElement => {
  const grayscale = generateGrayscale(canvas);
  return applyContrast(grayscale, options.contrast);
};

export const generateBumpMap = (canvas: HTMLCanvasElement, options: TextureOptions): HTMLCanvasElement => {
  const grayscale = generateGrayscale(canvas);
  // Bump maps often benefit from higher contrast to define edges
  return applyContrast(grayscale, options.contrast + 20);
};

export const generateGlossinessMap = (canvas: HTMLCanvasElement, options: TextureOptions): HTMLCanvasElement => {
  const grayscale = generateGrayscale(canvas);
  const contrasted = applyContrast(grayscale, options.contrast);
  const ctx = contrasted.getContext('2d');
  if (!ctx) return contrasted;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Glossiness is typically the inverse of Roughness
  // If invert is true, it becomes Roughness-like, so we handle it carefully
  const shouldInvert = !options.invert; 

  for (let i = 0; i < data.length; i += 4) {
    const val = shouldInvert ? 255 - data[i] : data[i];
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }

  ctx.putImageData(imageData, 0, 0);
  return contrasted;
};

export const generateReflectionsMap = (canvas: HTMLCanvasElement, options: TextureOptions): HTMLCanvasElement => {
  const grayscale = generateGrayscale(canvas);
  // Reflections often need higher contrast to define shiny spots
  return applyContrast(grayscale, options.contrast + 30);
};

export const generateEmissiveMap = (canvas: HTMLCanvasElement, options: TextureOptions): HTMLCanvasElement => {
  const grayscale = generateGrayscale(canvas);
  const ctx = grayscale.getContext('2d');
  if (!ctx) return grayscale;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Emissive: Keep only the brightest parts
  const threshold = 180 - (options.intensity / 2);

  for (let i = 0; i < data.length; i += 4) {
    const val = data[i] > threshold ? data[i] : 0;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }

  ctx.putImageData(imageData, 0, 0);
  return applyContrast(grayscale, options.contrast);
};

export const generateCutoutMap = (canvas: HTMLCanvasElement, options: TextureOptions): HTMLCanvasElement => {
  const grayscale = generateGrayscale(canvas);
  const ctx = grayscale.getContext('2d');
  if (!ctx) return grayscale;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Cutout: Binary threshold
  const threshold = 128 - (options.intensity - 50);

  for (let i = 0; i < data.length; i += 4) {
    const val = data[i] > threshold ? 255 : 0;
    const finalVal = options.invert ? 255 - val : val;
    data[i] = finalVal;
    data[i + 1] = finalVal;
    data[i + 2] = finalVal;
  }

  ctx.putImageData(imageData, 0, 0);
  return grayscale;
};

export const generateAOMap = (canvas: HTMLCanvasElement, intensity: number): HTMLCanvasElement => {
  // Better AO simulation: Invert grayscale, blur it slightly, then multiply with original
  const grayscale = generateGrayscale(canvas);
  const width = canvas.width;
  const height = canvas.height;
  
  const ctx = grayscale.getContext('2d');
  if (!ctx) return grayscale;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return grayscale;
  
  const outImageData = outCtx.createImageData(width, height);
  const outData = outImageData.data;

  // Simple box blur / local average to simulate occlusion
  const radius = Math.max(1, Math.floor(width / 200));
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      
      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const nx = Math.max(0, Math.min(width - 1, x + kx));
          const ny = Math.max(0, Math.min(height - 1, y + ky));
          const nIdx = (ny * width + nx) * 4;
          sum += data[nIdx];
          count++;
        }
      }
      
      const avg = sum / count;
      const current = data[(y * width + x) * 4];
      
      // AO is stronger where current is darker than average
      const diff = Math.max(0, avg - current);
      const aoValue = 255 - (diff * (intensity / 20));
      
      const idx = (y * width + x) * 4;
      const finalVal = Math.max(0, Math.min(255, aoValue));
      outData[idx] = finalVal;
      outData[idx + 1] = finalVal;
      outData[idx + 2] = finalVal;
      outData[idx + 3] = 255;
    }
  }

  outCtx.putImageData(outImageData, 0, 0);
  return outCanvas;
};
