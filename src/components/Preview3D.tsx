import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ViewMode = 'Full PBR' | 'Albedo' | 'Normal' | 'Roughness' | 'Displacement' | 'Bump' | 'AO' | 'Glossiness' | 'Reflections' | 'Self-Illumination' | 'Cutout';

interface Preview3DProps {
  maps: {
    albedo: string | null;
    normal: string | null;
    roughness: string | null;
    displacement: string | null;
    bump: string | null;
    ao: string | null;
    glossiness: string | null;
    reflections: string | null;
    emissive: string | null;
    cutout: string | null;
  };
  geometryType: 'Cube' | 'Sphere' | 'Cylinder' | 'Plane';
  tiling: number;
  rotation: number;
  zoom: number;
  autoRotate: boolean;
  viewMode: ViewMode;
}

const Preview3D: React.FC<Preview3DProps> = ({ 
  maps, 
  geometryType, 
  tiling, 
  rotation, 
  zoom, 
  autoRotate,
  viewMode
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string>('Initializing Engine...');
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    mesh: THREE.Mesh;
    material: THREE.MeshStandardMaterial;
    controls: OrbitControls;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0a0a');

    const width = containerRef.current.clientWidth || 500;
    const height = containerRef.current.clientHeight || 500;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(3, 3, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);

    // Lighting - Stronger setup to prevent black screen
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
    scene.add(hemiLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
    mainLight.position.set(5, 5, 5);
    mainLight.castShadow = true;
    scene.add(mainLight);

    const fillLight = new THREE.PointLight(0xffffff, 1.0);
    fillLight.position.set(-5, 2, 2);
    scene.add(fillLight);

    // Material
    const material = new THREE.MeshStandardMaterial({
      roughness: 1,
      metalness: 0,
      color: 0xffffff,
      side: THREE.DoubleSide,
      alphaTest: 0.1,
    });

    // Geometry
    const getGeometry = (type: string) => {
      switch (type) {
        case 'Sphere': return new THREE.SphereGeometry(1, 128, 128);
        case 'Cylinder': return new THREE.CylinderGeometry(1, 1, 2, 64);
        case 'Plane': return new THREE.PlaneGeometry(2, 2, 256, 256);
        default: return new THREE.BoxGeometry(1.5, 1.5, 1.5, 128, 128, 128);
      }
    };

    const mesh = new THREE.Mesh(getGeometry(geometryType), material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1;
    controls.maxDistance = 15;

    sceneRef.current = { scene, camera, renderer, mesh, material, controls };
    setStatus('Engine Ready');

    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (sceneRef.current) {
        if (autoRotate) {
          sceneRef.current.mesh.rotation.y += 0.005;
        }
        sceneRef.current.controls.update();
        sceneRef.current.renderer.render(sceneRef.current.scene, sceneRef.current.camera);
      }
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !sceneRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      sceneRef.current.camera.aspect = w / h;
      sceneRef.current.camera.updateProjectionMatrix();
      sceneRef.current.renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      controls.dispose();
      renderer.dispose();
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update Geometry
  useEffect(() => {
    if (!sceneRef.current) return;
    const { mesh } = sceneRef.current;
    
    mesh.geometry.dispose();
    switch (geometryType) {
      case 'Sphere': mesh.geometry = new THREE.SphereGeometry(1, 128, 128); break;
      case 'Cylinder': mesh.geometry = new THREE.CylinderGeometry(1, 1, 2, 64); break;
      case 'Plane': mesh.geometry = new THREE.PlaneGeometry(2, 2, 256, 256); break;
      default: mesh.geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5, 128, 128, 128);
    }
    setStatus(`Geometry: ${geometryType}`);
  }, [geometryType]);

  // Update Textures and View Mode
  useEffect(() => {
    if (!sceneRef.current) return;
    const { material } = sceneRef.current;
    const loader = new THREE.TextureLoader();
    let isCurrent = true;

    setStatus('Updating Textures...');

    const updateTexture = (url: string | null, mapKey: keyof THREE.MeshStandardMaterial) => {
      if (url) {
        loader.load(url, (texture) => {
          if (!isCurrent) {
            texture.dispose();
            return;
          }
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(tiling, tiling);
          texture.rotation = (rotation * Math.PI) / 180;
          texture.center.set(0.5, 0.5);
          texture.anisotropy = sceneRef.current?.renderer.capabilities.getMaxAnisotropy() || 1;
          texture.needsUpdate = true;
          
          const oldTexture = (material as any)[mapKey];
          if (oldTexture && oldTexture.isTexture) {
            oldTexture.dispose();
          }

          (material as any)[mapKey] = texture;
          material.needsUpdate = true;
          setStatus('Textures Loaded');
        }, undefined, (err) => {
          if (!isCurrent) return;
          console.error(`Error loading texture for ${mapKey}:`, err);
          setStatus(`Error: ${mapKey} failed`);
        });
      } else {
        const oldTexture = (material as any)[mapKey];
        if (oldTexture && oldTexture.isTexture) {
          oldTexture.dispose();
        }
        (material as any)[mapKey] = null;
        material.needsUpdate = true;
      }
    };

    // Reset material properties for isolated views
    material.map = null;
    material.normalMap = null;
    material.roughnessMap = null;
    material.displacementMap = null;
    material.aoMap = null;
    material.emissiveMap = null;
    material.alphaMap = null;
    material.transparent = false;
    material.roughness = 1;
    material.metalness = 0;
    material.displacementScale = 0;
    material.emissiveIntensity = 1.0;
    material.emissive.setHex(0x000000);
    material.color.setHex(0xffffff);

    if (viewMode === 'Full PBR') {
      updateTexture(maps.albedo, 'map');
      updateTexture(maps.normal, 'normalMap');
      updateTexture(maps.roughness, 'roughnessMap');
      updateTexture(maps.displacement, 'displacementMap');
      updateTexture(maps.ao, 'aoMap');
      updateTexture(maps.emissive, 'emissiveMap');
      if (maps.emissive) {
        material.emissive.setHex(0xffffff);
        material.emissiveIntensity = 1.0;
      }
      if (maps.cutout) {
        updateTexture(maps.cutout, 'alphaMap');
        material.transparent = true;
      }
      material.displacementScale = 0.2;
      material.displacementBias = -0.1;
    } else {
      // Isolated View Modes
      material.roughness = 1.0;
      material.metalness = 0.0;
      
      switch (viewMode) {
        case 'Albedo': updateTexture(maps.albedo, 'map'); break;
        case 'Normal': updateTexture(maps.normal, 'map'); break;
        case 'Roughness': updateTexture(maps.roughness, 'map'); break;
        case 'Displacement': updateTexture(maps.displacement, 'map'); break;
        case 'Bump': updateTexture(maps.bump, 'map'); break;
        case 'AO': updateTexture(maps.ao, 'map'); break;
        case 'Glossiness': updateTexture(maps.glossiness, 'map'); break;
        case 'Reflections': updateTexture(maps.reflections, 'map'); break;
        case 'Self-Illumination': 
          updateTexture(maps.emissive, 'map');
          material.color.setHex(0x000000);
          updateTexture(maps.emissive, 'emissiveMap');
          material.emissive.setHex(0xffffff);
          break;
        case 'Cutout': 
          updateTexture(maps.cutout, 'map');
          material.transparent = true;
          break;
      }
    }

    material.needsUpdate = true;

    return () => {
      isCurrent = false;
    };
  }, [maps, tiling, rotation, viewMode]);

  // Update Camera Zoom
  useEffect(() => {
    if (!sceneRef.current) return;
    const baseDistance = 5;
    sceneRef.current.camera.position.setLength(baseDistance / zoom);
  }, [zoom]);

  return (
    <div ref={containerRef} className="w-full h-full rounded-lg overflow-hidden border border-hardware-border bg-black relative">
      <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded border border-white/10 pointer-events-none z-10">
        <span className="text-[8px] font-mono text-white/80 uppercase tracking-widest">Real-time PBR Engine</span>
      </div>

      {/* Map Status Bar */}
      <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-md p-1 rounded border border-white/10 z-10">
        {[
          { id: 'Albedo', label: 'A' },
          { id: 'Normal', label: 'N' },
          { id: 'Roughness', label: 'R' },
          { id: 'Displacement', label: 'D' },
          { id: 'Bump', label: 'B' },
          { id: 'AO', label: 'AO' },
          { id: 'Glossiness', label: 'G' },
          { id: 'Reflections', label: 'Rf' },
          { id: 'Self-Illumination', label: 'SI' },
          { id: 'Cutout', label: 'C' }
        ].map(map => {
          const isActive = maps[map.id as keyof typeof maps] || (map.id === 'Bump' && maps.displacement); // Bump often uses displacement data
          return (
            <div 
              key={map.id}
              className={`w-5 h-5 flex items-center justify-center rounded text-[7px] font-bold transition-all border ${
                isActive 
                  ? 'bg-hardware-accent/20 border-hardware-accent text-hardware-accent glow-accent glow-text' 
                  : 'bg-white/5 border-white/5 text-white/20'
              }`}
              title={`${map.id} Map ${isActive ? 'Active' : 'Inactive'}`}
            >
              {map.label}
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded border border-white/10 pointer-events-none z-10">
        <span className="text-[8px] font-mono text-white/60 uppercase tracking-widest">
          Status: {status}
        </span>
      </div>
    </div>
  );
};

export default Preview3D;
