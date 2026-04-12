/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Upload, 
  Download, 
  Settings2, 
  Image as ImageIcon, 
  Layers, 
  RefreshCw,
  ChevronRight,
  Info,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { 
  generateNormalMap, 
  generateRoughnessMap, 
  generateDisplacementMap, 
  generateBumpMap,
  generateGlossinessMap,
  generateReflectionsMap,
  generateEmissiveMap,
  generateCutoutMap,
  generateAOMap,
  generateSeamless,
  invertNormalGreen,
  upscaleCanvas,
  sharpenCanvas,
  applyGrout,
  generateTiledPreview,
  TextureOptions 
} from './lib/textureUtils';
import { GoogleGenAI, Type } from "@google/genai";

type MapType = 'Normal' | 'Roughness' | 'Displacement' | 'Bump' | 'AO' | 'Glossiness' | 'Reflections' | 'Self-Illumination' | 'Cutout';

interface MapConfig {
  type: MapType;
  intensity: number;
  contrast: number;
  blur: number;
  invert: boolean;
  enabled: boolean;
  aiBoost: boolean;
}

type MaterialCategory = 'Wood' | 'Concrete' | 'Stone' | 'Brick' | 'Metal' | 'Fabric' | 'Other';

interface MaterialAnalysis {
  category: MaterialCategory;
  description: string;
  suggestedConfigs: Partial<Record<MapType, Partial<MapConfig>>>;
}

export default function App() {
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string>('texture');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<MaterialAnalysis | null>(null);
  const [isSeamless, setIsSeamless] = useState(false);
  const [normalStandard, setNormalStandard] = useState<'OpenGL' | 'DirectX'>('OpenGL');
  const [exportRes, setExportRes] = useState<number>(1024);
  
  // Grout Settings
  const [groutEnabled, setGroutEnabled] = useState(false);
  const [groutWidth, setGroutWidth] = useState(2); // 1-10mm
  const [groutDepth, setGroutDepth] = useState(2); // 1-5mm
  const [groutSharpness, setGroutSharpness] = useState(50); // 0-100
  const [groutColor, setGroutColor] = useState('#808080');
  const [matteGrout, setMatteGrout] = useState(true);
  const [tileWidth, setTileWidth] = useState(600); // mm
  const [tileHeight, setTileHeight] = useState(600); // mm
  const [previewGrid, setPreviewGrid] = useState(2); // 1x1, 2x2, 3x3
  const [tiledPreview, setTiledPreview] = useState<string | null>(null);
  const [showTiledPreview, setShowTiledPreview] = useState(false);
  
  const [configs, setConfigs] = useState<Record<MapType, MapConfig>>({
    Normal: { type: 'Normal', intensity: 50, contrast: 0, blur: 0, invert: false, enabled: true, aiBoost: false },
    Roughness: { type: 'Roughness', intensity: 50, contrast: 20, blur: 0, invert: true, enabled: true, aiBoost: false },
    Displacement: { type: 'Displacement', intensity: 50, contrast: 10, blur: 0, invert: false, enabled: true, aiBoost: false },
    Bump: { type: 'Bump', intensity: 50, contrast: 10, blur: 0, invert: false, enabled: true, aiBoost: false },
    AO: { type: 'AO', intensity: 30, contrast: 0, blur: 0, invert: false, enabled: true, aiBoost: false },
    Glossiness: { type: 'Glossiness', intensity: 50, contrast: 20, blur: 0, invert: false, enabled: true, aiBoost: false },
    Reflections: { type: 'Reflections', intensity: 50, contrast: 30, blur: 0, invert: false, enabled: true, aiBoost: false },
    'Self-Illumination': { type: 'Self-Illumination', intensity: 50, contrast: 0, blur: 0, invert: false, enabled: true, aiBoost: false },
    Cutout: { type: 'Cutout', intensity: 50, contrast: 0, blur: 0, invert: false, enabled: true, aiBoost: false },
  });

  const [activeMaps, setActiveMaps] = useState<MapType[]>(['Normal', 'Roughness', 'Displacement', 'Bump']);

  const [previews, setPreviews] = useState<Record<MapType, string>>({
    Normal: '',
    Roughness: '',
    Displacement: '',
    Bump: '',
    AO: '',
    Glossiness: '',
    Reflections: '',
    'Self-Illumination': '',
    Cutout: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const analyzeMaterial = async (base64: string) => {
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { inlineData: { mimeType: "image/png", data: base64.split(',')[1] } },
            { text: "Analyze this texture for PBR material properties. Identify the category (Wood, Concrete, Stone, Brick, Metal, Fabric, Other) and suggest intensity/contrast values for Normal, Roughness, and Displacement maps. Return JSON only." }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              description: { type: Type.STRING },
              suggestedConfigs: {
                type: Type.OBJECT,
                properties: {
                  Normal: { type: Type.OBJECT, properties: { intensity: { type: Type.NUMBER }, contrast: { type: Type.NUMBER } } },
                  Roughness: { type: Type.OBJECT, properties: { intensity: { type: Type.NUMBER }, contrast: { type: Type.NUMBER } } },
                  Displacement: { type: Type.OBJECT, properties: { intensity: { type: Type.NUMBER }, contrast: { type: Type.NUMBER } } },
                }
              }
            },
            required: ["category", "description", "suggestedConfigs"]
          }
        }
      });

      const result = JSON.parse(response.text || '{}') as MaterialAnalysis;
      setAnalysis(result);
      
      // Apply suggested configs
      if (result.suggestedConfigs) {
        setConfigs(prev => {
          const next = { ...prev };
          Object.entries(result.suggestedConfigs).forEach(([type, cfg]) => {
            if (next[type as MapType]) {
              next[type as MapType] = { ...next[type as MapType], ...cfg };
            }
          });
          return next;
        });
      }
    } catch (error) {
      console.error("AI Analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const fileName = file.name.replace(/\.[^/.]+$/, "");
      setOriginalFileName(fileName);
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setBaseImage(base64);
        analyzeMaterial(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const processMaps = useCallback(async () => {
    if (!baseImage) return;
    setIsProcessing(true);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = baseImage;
    
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);

    const workingCanvas = isSeamless ? generateSeamless(canvas) : canvas;
    
    // Calculate grout width in pixels based on real-world dimensions
    // Ratio = Pixel Width / Tile Width (mm)
    const pxPerMm = workingCanvas.width / tileWidth;
    const groutWidthPx = groutWidth * pxPerMm;

    // Apply Grout to Albedo for preview if needed
    const albedoWithGrout = groutEnabled 
      ? applyGrout(workingCanvas, groutWidthPx, groutColor, 'Albedo')
      : workingCanvas;

    const newPreviews: Record<MapType, string> = { ...previews };

    // Generate Normal
    let normalCanvas = generateNormalMap(workingCanvas, configs.Normal.intensity / 10);
    if (groutEnabled) {
      normalCanvas = applyGrout(normalCanvas, groutWidthPx, 'rgb(128,128,255)', 'Normal', { depth: groutDepth, sharpness: groutSharpness });
    }
    if (normalStandard === 'DirectX') {
      normalCanvas = invertNormalGreen(normalCanvas);
    }
    if (configs.Normal.aiBoost) {
      normalCanvas = sharpenCanvas(normalCanvas, 40);
    }
    newPreviews.Normal = normalCanvas.toDataURL('image/png');

    // Generate Roughness
    let roughnessCanvas = generateRoughnessMap(workingCanvas, configs.Roughness);
    if (groutEnabled) {
      roughnessCanvas = applyGrout(roughnessCanvas, groutWidthPx, '#ffffff', 'Roughness', { matteGrout });
    }
    if (configs.Roughness.aiBoost) {
      roughnessCanvas = sharpenCanvas(roughnessCanvas, 30);
    }
    newPreviews.Roughness = roughnessCanvas.toDataURL('image/png');

    // Generate Displacement
    let displacementCanvas = generateDisplacementMap(workingCanvas, configs.Displacement);
    if (groutEnabled) {
      displacementCanvas = applyGrout(displacementCanvas, groutWidthPx, '#000000', 'Displacement', { depth: groutDepth, sharpness: groutSharpness });
    }
    if (configs.Displacement.aiBoost) {
      displacementCanvas = sharpenCanvas(displacementCanvas, 50);
    }
    newPreviews.Displacement = displacementCanvas.toDataURL('image/png');

    // Generate Bump
    let bumpCanvas = generateBumpMap(workingCanvas, configs.Bump);
    if (groutEnabled) {
      bumpCanvas = applyGrout(bumpCanvas, groutWidthPx, '#000000', 'Bump', { depth: groutDepth, sharpness: groutSharpness });
    }
    newPreviews.Bump = bumpCanvas.toDataURL('image/png');

    // Generate AO
    let aoCanvas = generateAOMap(workingCanvas, configs.AO.intensity);
    if (groutEnabled) {
      aoCanvas = applyGrout(aoCanvas, groutWidthPx, '#000000', 'AO', { depth: groutDepth, sharpness: groutSharpness });
    }
    newPreviews.AO = aoCanvas.toDataURL('image/png');

    // Generate Optional Maps if active
    if (activeMaps.includes('Glossiness')) {
      let glossCanvas = generateGlossinessMap(workingCanvas, configs.Glossiness);
      if (groutEnabled) {
        glossCanvas = applyGrout(glossCanvas, groutWidthPx, '#000000', 'Roughness', { matteGrout: true }); // Glossiness grout is black (matte)
      }
      newPreviews.Glossiness = glossCanvas.toDataURL('image/png');
    }
    if (activeMaps.includes('Reflections')) {
      let reflectionsCanvas = generateReflectionsMap(workingCanvas, configs.Reflections);
      if (groutEnabled) {
        reflectionsCanvas = applyGrout(reflectionsCanvas, groutWidthPx, '#000000', 'Displacement', { depth: groutDepth, sharpness: groutSharpness });
      }
      newPreviews.Reflections = reflectionsCanvas.toDataURL('image/png');
    }
    if (activeMaps.includes('Self-Illumination')) {
      const emissiveCanvas = generateEmissiveMap(workingCanvas, configs['Self-Illumination']);
      newPreviews['Self-Illumination'] = emissiveCanvas.toDataURL('image/png');
    }
    if (activeMaps.includes('Cutout')) {
      const cutoutCanvas = generateCutoutMap(workingCanvas, configs.Cutout);
      newPreviews.Cutout = cutoutCanvas.toDataURL('image/png');
    }

    // Generate Tiled Preview
    const tiled = generateTiledPreview(albedoWithGrout, previewGrid);
    setTiledPreview(tiled.toDataURL('image/png'));

    setPreviews(newPreviews);
    setIsProcessing(false);
  }, [baseImage, configs, isSeamless, normalStandard, groutEnabled, groutWidth, groutDepth, groutColor, matteGrout, previewGrid]);

  useEffect(() => {
    if (baseImage) {
      const timer = setTimeout(() => {
        processMaps();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [baseImage, configs, processMaps]);

  const updateConfig = (type: MapType, key: keyof MapConfig, value: any) => {
    setConfigs(prev => ({
      ...prev,
      [type]: { ...prev[type], [key]: value }
    }));
  };

  const downloadAll = async () => {
    const zip = new JSZip();
    
    // Add original texture as PNG (Albedo)
    if (baseImage) {
      const img = new Image();
      img.src = baseImage;
      await new Promise(r => img.onload = r);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d')?.drawImage(img, 0, 0);
      
      const working = isSeamless ? generateSeamless(canvas) : canvas;
      
      const pxPerMm = working.width / tileWidth;
      const groutWidthPx = groutWidth * pxPerMm;

      const withGrout = groutEnabled 
        ? applyGrout(working, groutWidthPx, groutColor, 'Albedo')
        : working;

      const upscaled = upscaleCanvas(withGrout, exportRes);
      const base64Data = upscaled.toDataURL('image/png').split(',')[1];
      zip.file(`${originalFileName}_albedo.png`, base64Data, { base64: true });
    }

    for (const [type, dataUrl] of Object.entries(previews) as [string, string][]) {
      if (dataUrl && activeMaps.includes(type as MapType)) {
        const img = new Image();
        img.src = dataUrl;
        await new Promise(r => img.onload = r);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d')?.drawImage(img, 0, 0);
        
        const upscaled = upscaleCanvas(canvas, exportRes);
        const base64Data = upscaled.toDataURL('image/png').split(',')[1];
        zip.file(`${originalFileName}_${type.toLowerCase()}.png`, base64Data, { base64: true });
      }
    }
    
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${originalFileName}_textures_${exportRes}.zip`);
  };

  const resetConfigs = () => {
    setConfigs({
      Normal: { type: 'Normal', intensity: 50, contrast: 0, blur: 0, invert: false, enabled: true, aiBoost: false },
      Roughness: { type: 'Roughness', intensity: 50, contrast: 20, blur: 0, invert: true, enabled: true, aiBoost: false },
      Displacement: { type: 'Displacement', intensity: 50, contrast: 10, blur: 0, invert: false, enabled: true, aiBoost: false },
      Bump: { type: 'Bump', intensity: 50, contrast: 10, blur: 0, invert: false, enabled: true, aiBoost: false },
      AO: { type: 'AO', intensity: 30, contrast: 0, blur: 0, invert: false, enabled: true, aiBoost: false },
      Glossiness: { type: 'Glossiness', intensity: 50, contrast: 20, blur: 0, invert: false, enabled: true, aiBoost: false },
      Reflections: { type: 'Reflections', intensity: 50, contrast: 30, blur: 0, invert: false, enabled: true, aiBoost: false },
      'Self-Illumination': { type: 'Self-Illumination', intensity: 50, contrast: 0, blur: 0, invert: false, enabled: true, aiBoost: false },
      Cutout: { type: 'Cutout', intensity: 50, contrast: 0, blur: 0, invert: false, enabled: true, aiBoost: false },
    });
    setActiveMaps(['Normal', 'Roughness', 'Displacement', 'Bump']);
    setIsSeamless(false);
    setNormalStandard('OpenGL');
    setExportRes(1024);
    setGroutEnabled(false);
    setGroutWidth(2);
    setGroutDepth(2);
    setGroutSharpness(50);
    setGroutColor('#808080');
    setMatteGrout(true);
    setTileWidth(600);
    setTileHeight(600);
    setPreviewGrid(2);
  };

  const toggleMap = (type: MapType) => {
    setActiveMaps(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b]">
      {/* Header */}
      <header className="border-b border-hardware-border bg-hardware-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-hardware-accent rounded flex items-center justify-center">
              <Layers className="text-white w-5 h-5" />
            </div>
            <h1 className="font-bold text-sm tracking-tight">Texture Master AI</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-hardware-bg border border-hardware-border rounded px-2 py-1 gap-2">
              <span className="text-[9px] font-mono text-hardware-muted uppercase">Resolution</span>
              <select 
                value={exportRes} 
                onChange={(e) => setExportRes(parseInt(e.target.value))}
                className="bg-transparent text-[10px] font-mono outline-none cursor-pointer"
              >
                <option value={1024}>1K</option>
                <option value={2048}>2K</option>
                <option value={4096}>4K</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-hardware-muted uppercase">Seamless</span>
              <button 
                onClick={() => setIsSeamless(!isSeamless)}
                className={`w-7 h-3.5 rounded-full transition-colors relative ${isSeamless ? 'bg-hardware-accent' : 'bg-hardware-border'}`}
              >
                <motion.div 
                  animate={{ x: isSeamless ? 15 : 2 }}
                  className="w-2.5 h-2.5 bg-white rounded-full absolute top-0.5"
                />
              </button>
            </div>
            <button 
              onClick={resetConfigs}
              className="text-[10px] font-mono text-hardware-muted hover:text-hardware-text uppercase tracking-wider px-2"
            >
              Reset
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="hardware-button py-1.5 text-xs flex items-center gap-2 bg-hardware-card border border-hardware-border hover:bg-hardware-border text-hardware-text"
            >
              <Upload size={14} />
              <span>Upload</span>
            </button>
            <button 
              onClick={downloadAll}
              disabled={!baseImage || isProcessing}
              className="hardware-button py-1.5 text-xs flex items-center gap-2"
            >
              <Download size={14} />
              <span>Export All</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-4 flex gap-4 overflow-hidden">
        {/* Sidebar: Original Image */}
        <div className="w-64 shrink-0 flex flex-col gap-4">
          <div className="hardware-panel p-3 flex flex-col h-fit">
            <div className="flex items-center justify-between mb-2">
              <label className="hardware-label">Original Map</label>
              {isAnalyzing && <RefreshCw size={10} className="animate-spin text-hardware-accent" />}
            </div>
            <div className="aspect-square bg-black/40 rounded border border-hardware-border overflow-hidden flex items-center justify-center group relative">
              {baseImage ? (
                <>
                  <img 
                    src={baseImage} 
                    alt="Original" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                    <button 
                      onClick={() => setBaseImage(null)}
                      className="p-2 bg-red-500/20 hover:bg-red-500/40 rounded text-red-500 transition-colors"
                    >
                      <XCircle size={20} />
                    </button>
                  </div>
                </>
              ) : (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-2 text-hardware-muted cursor-pointer hover:text-hardware-accent transition-colors"
                >
                  <Upload size={24} />
                  <span className="text-[10px] uppercase font-mono">Upload</span>
                </div>
              )}
            </div>

            {analysis && (
              <div className="mt-3 p-2 bg-hardware-accent/5 rounded border border-hardware-accent/20">
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckCircle2 size={10} className="text-hardware-accent" />
                  <span className="text-[9px] font-bold uppercase text-hardware-accent">{analysis.category} Detected</span>
                </div>
                <p className="text-[9px] text-hardware-muted leading-tight">{analysis.description}</p>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-hardware-border">
              <div className="flex items-center justify-between mb-2">
                <label className="hardware-label">Tiled Preview</label>
                <select 
                  value={previewGrid} 
                  onChange={(e) => setPreviewGrid(parseInt(e.target.value))}
                  className="bg-transparent text-[9px] font-mono outline-none cursor-pointer text-hardware-accent"
                >
                  <option value={1}>1x1</option>
                  <option value={2}>2x2</option>
                  <option value={3}>3x3</option>
                </select>
              </div>
              <div 
                className="aspect-square bg-black/40 rounded border border-hardware-border overflow-hidden cursor-zoom-in"
                onClick={() => setShowTiledPreview(true)}
              >
                {tiledPreview ? (
                  <img src={tiledPreview} alt="Tiled" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-hardware-muted">
                    <RefreshCw size={16} className="animate-spin" />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="hardware-panel p-4 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Settings2 className="text-hardware-muted w-3.5 h-3.5" />
                <h3 className="text-[10px] font-bold uppercase tracking-wider">Grout Settings</h3>
              </div>
              <button 
                onClick={() => setGroutEnabled(!groutEnabled)}
                className={`w-7 h-3.5 rounded-full transition-colors relative ${groutEnabled ? 'bg-hardware-accent' : 'bg-hardware-border'}`}
              >
                <motion.div 
                  animate={{ x: groutEnabled ? 15 : 2 }}
                  className="w-2.5 h-2.5 bg-white rounded-full absolute top-0.5"
                />
              </button>
            </div>

            {groutEnabled && (
              <div className="space-y-4 mb-6 p-3 bg-hardware-bg/50 rounded border border-hardware-border">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="hardware-label text-[8px]">Tile Width (mm)</label>
                    <input 
                      type="number" 
                      value={tileWidth}
                      onChange={(e) => setTileWidth(Math.max(1, parseInt(e.target.value) || 0))}
                      className="w-full bg-hardware-bg border border-hardware-border rounded px-2 py-1 text-[10px] font-mono outline-none focus:border-hardware-accent"
                    />
                  </div>
                  <div>
                    <label className="hardware-label text-[8px]">Tile Height (mm)</label>
                    <input 
                      type="number" 
                      value={tileHeight}
                      onChange={(e) => setTileHeight(Math.max(1, parseInt(e.target.value) || 0))}
                      className="w-full bg-hardware-bg border border-hardware-border rounded px-2 py-1 text-[10px] font-mono outline-none focus:border-hardware-accent"
                    />
                  </div>
                </div>

                <div>
                  <label className="hardware-label text-[9px]">Grout Width (mm)</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="range" 
                      min="1" 
                      max="10" 
                      step="0.5"
                      value={groutWidth}
                      onChange={(e) => setGroutWidth(parseFloat(e.target.value))}
                      className="hardware-slider h-1"
                    />
                    <span className="text-[9px] font-mono w-5 text-right">{groutWidth}</span>
                  </div>
                </div>

                <div>
                  <label className="hardware-label text-[9px]">Grout Depth (mm)</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="range" 
                      min="1" 
                      max="5" 
                      value={groutDepth}
                      onChange={(e) => setGroutDepth(parseInt(e.target.value))}
                      className="hardware-slider h-1"
                    />
                    <span className="text-[9px] font-mono w-5 text-right">{groutDepth}</span>
                  </div>
                </div>

                <div>
                  <label className="hardware-label text-[9px]">Grout Sharpness</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={groutSharpness}
                      onChange={(e) => setGroutSharpness(parseInt(e.target.value))}
                      className="hardware-slider h-1"
                    />
                    <span className="text-[9px] font-mono w-5 text-right">{groutSharpness}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="hardware-label text-[9px]">Grout Color</label>
                  <input 
                    type="color" 
                    value={groutColor}
                    onChange={(e) => setGroutColor(e.target.value)}
                    className="w-6 h-6 bg-transparent border-none cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono text-hardware-muted uppercase">Matte Grout</span>
                  <button 
                    onClick={() => setMatteGrout(!matteGrout)}
                    className={`w-7 h-3.5 rounded-full transition-colors relative ${matteGrout ? 'bg-hardware-accent' : 'bg-hardware-border'}`}
                  >
                    <motion.div 
                      animate={{ x: matteGrout ? 15 : 2 }}
                      className="w-2.5 h-2.5 bg-white rounded-full absolute top-0.5"
                    />
                  </button>
                </div>

                <div className="pt-2 border-t border-hardware-border">
                  <div className="flex items-start gap-1.5">
                    <Info size={10} className="text-hardware-accent mt-0.5" />
                    <div className="flex flex-col">
                      <span className="text-[8px] font-bold uppercase text-hardware-accent">Enscape UV Lock</span>
                      <span className="text-[8px] text-hardware-muted leading-tight">
                        Set Material Size to: <span className="text-white">{(tileWidth/1000).toFixed(3)}m x {(tileHeight/1000).toFixed(3)}m</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 mb-3">
              <Settings2 className="text-hardware-muted w-3.5 h-3.5" />
              <h3 className="text-[10px] font-bold uppercase tracking-wider">Additional Maps</h3>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {(['AO', 'Glossiness', 'Reflections', 'Self-Illumination', 'Cutout'] as MapType[]).map(type => (
                <button
                  key={type}
                  onClick={() => toggleMap(type)}
                  className={`flex items-center justify-between px-3 py-2 rounded border text-[11px] transition-all ${
                    activeMaps.includes(type) 
                      ? 'bg-hardware-accent/10 border-hardware-accent text-hardware-accent' 
                      : 'bg-hardware-bg border-hardware-border text-hardware-muted hover:border-hardware-muted'
                  }`}
                >
                  <span>{type}</span>
                  {activeMaps.includes(type) ? <CheckCircle2 size={12} /> : <div className="w-3 h-3 rounded-full border border-hardware-muted" />}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 mt-6 mb-3">
              <Info className="text-hardware-muted w-3.5 h-3.5" />
              <h3 className="text-[10px] font-bold uppercase tracking-wider">Quick Tips</h3>
            </div>
            <div className="space-y-3 text-[11px] text-hardware-muted leading-relaxed">
              <p>• <b>Normal</b>: Adds surface detail.</p>
              <p>• <b>Roughness</b>: White = Matte, Black = Shiny.</p>
              <p>• <b>Displacement</b>: Physical depth.</p>
              <p>• <b>Bump</b>: Fine surface texture.</p>
              <p>• <b>AO</b>: Enhances shadows.</p>
            </div>
          </div>
        </div>

        {/* Main Grid: All Maps */}
        <div className="flex-1 overflow-y-auto pr-2">
          {!baseImage ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="hardware-panel h-full flex flex-col items-center justify-center border-dashed border-2 cursor-pointer hover:border-hardware-accent hover:bg-hardware-accent/5 transition-all group"
            >
              <Upload className="text-hardware-muted group-hover:text-hardware-accent mb-4" size={48} />
              <h3 className="text-lg font-bold mb-1">Drop texture here</h3>
              <p className="text-hardware-muted text-xs">PNG, JPG, WEBP</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {activeMaps.map((type) => (
                <div key={type} className="hardware-panel flex flex-col overflow-hidden">
                  <div className="px-3 py-2 border-b border-hardware-border flex items-center justify-between bg-hardware-card/80">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-hardware-accent">{type} Map</span>
                      {['AO', 'Glossiness', 'Reflections', 'Self-Illumination', 'Cutout'].includes(type) && (
                        <button 
                          onClick={() => toggleMap(type)}
                          className="text-red-500/50 hover:text-red-500 transition-colors"
                        >
                          <XCircle size={10} />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {['Normal', 'Roughness', 'Displacement'].includes(type) && (
                        <button 
                          onClick={() => updateConfig(type, 'aiBoost', !configs[type].aiBoost)}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-tighter transition-all ${
                            configs[type].aiBoost 
                              ? 'bg-hardware-accent text-white shadow-[0_0_10px_rgba(var(--hardware-accent-rgb),0.5)]' 
                              : 'bg-hardware-bg border border-hardware-border text-hardware-muted hover:text-hardware-text'
                          }`}
                        >
                          <RefreshCw size={8} className={configs[type].aiBoost ? 'animate-spin' : ''} />
                          AI BOOST
                        </button>
                      )}
                      {type === 'Normal' && (
                        <button 
                          onClick={() => setNormalStandard(prev => prev === 'OpenGL' ? 'DirectX' : 'OpenGL')}
                          className="text-[8px] font-mono bg-hardware-bg border border-hardware-border px-1.5 py-0.5 rounded hover:border-hardware-muted transition-colors"
                        >
                          {normalStandard}
                        </button>
                      )}
                      {isProcessing && <RefreshCw size={10} className="animate-spin text-hardware-muted" />}
                      <button 
                        onClick={() => {
                          const link = document.createElement('a');
                          link.download = `${originalFileName}_${type.toLowerCase()}.png`;
                          link.href = previews[type];
                          link.click();
                        }}
                        className="p-1 hover:bg-hardware-bg rounded transition-colors text-hardware-muted hover:text-hardware-accent"
                      >
                        <Download size={12} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex flex-1 min-h-0">
                    {/* Map Preview */}
                    <div className="w-1/2 aspect-square bg-black/20 flex items-center justify-center p-2 border-r border-hardware-border">
                      {previews[type] ? (
                        <img 
                          src={previews[type]} 
                          alt={type} 
                          className="max-h-full max-w-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <RefreshCw className="animate-spin text-hardware-muted" size={16} />
                      )}
                    </div>

                    {/* Map Controls */}
                    <div className="w-1/2 p-3 flex flex-col justify-center gap-4">
                      <div>
                        <label className="hardware-label text-[9px]">Intensity</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            value={configs[type].intensity}
                            onChange={(e) => updateConfig(type, 'intensity', parseInt(e.target.value))}
                            className="hardware-slider h-1"
                          />
                          <span className="text-[9px] font-mono w-5 text-right">{configs[type].intensity}</span>
                        </div>
                      </div>

                      <div>
                        <label className="hardware-label text-[9px]">Contrast</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="range" 
                            min="-100" 
                            max="100" 
                            value={configs[type].contrast}
                            onChange={(e) => updateConfig(type, 'contrast', parseInt(e.target.value))}
                            className="hardware-slider h-1"
                          />
                          <span className="text-[9px] font-mono w-5 text-right">{configs[type].contrast}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[9px] font-mono text-hardware-muted uppercase">Invert</span>
                        <button 
                          onClick={() => updateConfig(type, 'invert', !configs[type].invert)}
                          className={`w-7 h-3.5 rounded-full transition-colors relative ${configs[type].invert ? 'bg-hardware-accent' : 'bg-hardware-border'}`}
                        >
                          <motion.div 
                            animate={{ x: configs[type].invert ? 15 : 2 }}
                            className="w-2.5 h-2.5 bg-white rounded-full absolute top-0.5"
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        className="hidden" 
        accept="image/*"
      />

      {/* Tiled Preview Modal */}
      <AnimatePresence>
        {showTiledPreview && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-8"
            onClick={() => setShowTiledPreview(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-4xl w-full aspect-square bg-hardware-card rounded-lg border border-hardware-border overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="absolute top-4 right-4 z-10">
                <button 
                  onClick={() => setShowTiledPreview(false)}
                  className="p-2 bg-black/50 hover:bg-black/80 rounded-full text-white transition-colors"
                >
                  <XCircle size={24} />
                </button>
              </div>
              <img src={tiledPreview!} alt="Tiled Full" className="w-full h-full object-contain" />
              <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                <span className="text-xs font-mono text-white/80 uppercase tracking-widest">
                  {previewGrid}x{previewGrid} Tiled Preview
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
