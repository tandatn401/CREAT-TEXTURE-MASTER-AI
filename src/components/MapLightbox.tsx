import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Eye, EyeOff, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface MapLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  mapName: string;
  mapUrl: string;
  originalUrl: string | null;
  onDownload: () => void;
}

const MapLightbox: React.FC<MapLightboxProps> = ({
  isOpen,
  onClose,
  mapName,
  mapUrl,
  originalUrl,
  onDownload
}) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setShowOriginal(false);
    }
  }, [isOpen]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(prev => Math.min(Math.max(0.5, prev + delta), 10));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-md flex flex-col"
          onWheel={handleWheel}
        >
          {/* Header */}
          <div className="h-16 border-b border-white/10 px-6 flex items-center justify-between bg-black/50">
            <div className="flex flex-col">
              <span className="text-[10px] font-mono text-hardware-accent uppercase tracking-widest">Inspecting Map</span>
              <h2 className="text-sm font-bold text-white uppercase">{mapName}</h2>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center bg-white/5 rounded-full p-1 border border-white/10">
                <button
                  onClick={() => setScale(prev => Math.max(0.5, prev - 0.2))}
                  className="p-1.5 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors"
                >
                  <ZoomOut size={16} />
                </button>
                <span className="text-[10px] font-mono w-12 text-center text-white/80">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  onClick={() => setScale(prev => Math.min(10, prev + 0.2))}
                  className="p-1.5 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors"
                >
                  <ZoomIn size={16} />
                </button>
              </div>

              <button
                onClick={resetView}
                className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors flex items-center gap-2"
                title="Reset View"
              >
                <Maximize2 size={16} />
              </button>

              <div className="w-px h-6 bg-white/10 mx-2" />

              {originalUrl && (
                <button
                  onMouseDown={() => setShowOriginal(true)}
                  onMouseUp={() => setShowOriginal(false)}
                  onMouseLeave={() => setShowOriginal(false)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                    showOriginal 
                      ? 'bg-hardware-accent border-hardware-accent text-white' 
                      : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {showOriginal ? <EyeOff size={16} /> : <Eye size={16} />}
                  <span className="text-[10px] font-bold uppercase">Compare Original</span>
                </button>
              )}

              <button
                onClick={onDownload}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-hardware-accent text-white hover:bg-hardware-accent/80 transition-all shadow-[0_0_15px_rgba(var(--hardware-accent-rgb),0.3)]"
              >
                <Download size={16} />
                <span className="text-[10px] font-bold uppercase">Download</span>
              </button>

              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Viewport */}
          <div 
            ref={containerRef}
            className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <motion.div
              style={{
                x: position.x,
                y: position.y,
                scale: scale,
              }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <img
                src={showOriginal ? (originalUrl || mapUrl) : mapUrl}
                alt={mapName}
                className="max-w-[90%] max-h-[90%] object-contain shadow-2xl border border-white/5"
                referrerPolicy="no-referrer"
              />
            </motion.div>

            {/* Navigation Hint */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 pointer-events-none">
              <span className="text-[9px] font-mono text-white/60 uppercase tracking-widest">
                Scroll to Zoom • Drag to Pan • Hold "Compare" to see Original
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MapLightbox;
