import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { Canvas, } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Mask, Point, extractMaskedImage } from './App';
import Model from './Model';

function deepCompare(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || obj1 == null || obj2 == null) return false;
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  if (keys1.length !== keys2.length) return false;
  for (const key of keys1) {
    if (!keys2.includes(key) || !deepCompare(obj1[key], obj2[key])) return false;
  }
  return true;
}

export function useDebugChangedProps<T extends object>(props: T, componentName: string) {
  const prevPropsRef = useRef<T | null>(null);

  useEffect(() => {
    if (prevPropsRef.current) {
      const changedProps: Partial<T> = {};
      let hasChanges = false;

      Object.keys(props).forEach((key) => {
        const k = key as keyof T;
        if (!deepCompare(props[k], prevPropsRef.current![k])) {
          changedProps[k] = props[k];
          hasChanges = true;
        }
      });

      if (hasChanges) {
        console.log(`${componentName} - Changed props:`, changedProps);
      }
    }

    prevPropsRef.current = { ...props };
  });
}

interface Scene3DProps {
  imageUrl: string;
  modelUrl: string | null;
  masks: Mask[];
  points: Point[];
  imageData: ImageData;
  onImageClick: (event: React.MouseEvent<HTMLCanvasElement>) => void;
}

export interface MaskBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
export function calculateMaskBounds(mask: Mask): MaskBounds {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  
  for (let y = 0; y < mask.binary_mask.length; y++) {
    for (let x = 0; x < mask.binary_mask[y].length; x++) {
      if (mask.binary_mask[y][x] === 1) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }
  
  return { minX, maxX, minY, maxY };
}


interface DebugPanelProps {
  showWireframe: boolean;
  setShowWireframe: (show: boolean) => void;
  showTextureDebug: boolean;
  setShowTextureDebug: (show: boolean) => void;
  showAxesHelper: boolean;
  setShowAxesHelper: (show: boolean) => void;
  showProjectionRay: boolean;
  setShowProjectionRay: (show: boolean) => void;
}

function DebugPanel({
  showWireframe,
  setShowWireframe,
  showTextureDebug,
  setShowTextureDebug,
  showAxesHelper,
  setShowAxesHelper,
  showProjectionRay,
  setShowProjectionRay
}: DebugPanelProps) {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, background: 'rgba(0,0,0,0.7)', color: 'white', padding: '10px' }}>
      <h3>Debug Panel</h3>
      <label>
        <input
          type="checkbox"
          checked={showWireframe}
          onChange={(e) => setShowWireframe(e.target.checked)}
        />
        Show Wireframe
      </label>
      <br />
      <label>
        <input
          type="checkbox"
          checked={showTextureDebug}
          onChange={(e) => setShowTextureDebug(e.target.checked)}
        />
        Show Texture Debug
      </label>
      <br />
      <label>
        <input
          type="checkbox"
          checked={showAxesHelper}
          onChange={(e) => setShowAxesHelper(e.target.checked)}
        />
        Show Axes Helper
      </label>
      <label>
        <input
          type="checkbox"
          checked={showProjectionRay}
          onChange={(e) => setShowProjectionRay(e.target.checked)}
        />
        Show Projection Ray
      </label>
    </div>
  );
}

function Scene2D({ texture }: { texture: THREE.Texture }) {
  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial map={texture} transparent opacity={0.5} depthWrite={false} />
    </mesh>
  );
}

function MaskMesh({ mask, imageSize }: { mask: Mask; imageSize: { width: number; height: number } }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];

    for (let y = 0; y < mask.binary_mask.length; y++) {
      for (let x = 0; x < mask.binary_mask[y].length; x++) {
        if (mask.binary_mask[y][x] === 1) {
          const x1 = (x / imageSize.width) * 2 - 1;
          const x2 = ((x + 1) / imageSize.width) * 2 - 1;
          const y1 = -(y / imageSize.height) * 2 + 1;
          const y2 = -((y + 1) / imageSize.height) * 2 + 1;

          vertices.push(x1, y1, 0, x2, y1, 0, x2, y2, 0, x1, y2, 0);
          const vertexOffset = vertices.length / 3 - 4;
          indices.push(
            vertexOffset, vertexOffset + 1, vertexOffset + 2,
            vertexOffset, vertexOffset + 2, vertexOffset + 3
          );
        }
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    return geo;
  }, [mask, imageSize]);

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color="red" side={THREE.DoubleSide} opacity={0.3} transparent />
    </mesh>
  );
}

export function Scene3D({ imageUrl, masks, imageData, modelUrl, points, onImageClick }: Scene3DProps) {
  const [selectedMask, setSelectedMask] = useState<Mask | null>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showWireframe, setShowWireframe] = useState(false);
  const [showTextureDebug, setShowTextureDebug] = useState(false);
  const [showAxesHelper, setShowAxesHelper] = useState(false);
  const [showProjectionRay, setShowProjectionRay] = useState(false);
  // Memoize the rotation object
  const modelRotation = useMemo<{x:number, y: number, z: number}>(() => ({ x: 0, y: 0, z: 0 }), []);

  // If you need to update rotation, use a function like this:
  // const updateRotation = useCallback((x: number, y: number, z: number) => {
  //   modelRotation.x = x;
  //   modelRotation.y = y;
  //   modelRotation.z = z;
  // }, [modelRotation]);

  const maskedImageResult = useMemo(() => {
    if (selectedMask && imageData) {
      return extractMaskedImage(imageData, selectedMask);
    }
    return null;
  }, [selectedMask, imageData]);

  const maskBounds = useMemo(() => {
    if (selectedMask) {
      return calculateMaskBounds(selectedMask);
    }
    return null;
  }, [selectedMask]);

  useEffect(() => {
    if (masks.length > 0 && !selectedMask) {
      setSelectedMask(masks[0]);
    }
  }, [masks, selectedMask]);

  useEffect(() => {
    if (imageUrl) {
      const loader = new THREE.TextureLoader();
      loader.load(imageUrl, (loadedTexture) => {
        setTexture(loadedTexture);
      });
    }
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && imageData) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Set canvas dimensions
        canvas.width = imageData.width;
        canvas.height = imageData.height;

        // Draw the original image
        ctx.putImageData(imageData, 0, 0);

        // Draw the mask if selected
        if (selectedMask) {
          ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
          for (let y = 0; y < selectedMask.binary_mask.length; y++) {
            for (let x = 0; x < selectedMask.binary_mask[y].length; x++) {
              if (selectedMask.binary_mask[y][x] === 1) {
                ctx.fillRect(x, y, 1, 1);
              }
            }
          }
        }

        // Draw points
        points.forEach((point, index) => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 5, 0, 2 * Math.PI);
          ctx.fillStyle = index === points.length - 1 ? 'red' : 'blue';
          ctx.fill();
        });
      }
    }
  }, [imageData, selectedMask, points]);

  const handleImageClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    onImageClick(event);
  }, [onImageClick]);

  if (!imageData) {
    return null;
  }

  const aspectRatio = imageData.width / imageData.height;
  const maxWidth = 500;
  const width = Math.min(imageData.width, maxWidth);
  const height = width / aspectRatio;

  return (
    <div style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '600px' }}>
      <div style={{ width: `${width}px`, height: `${height}px`, marginRight: '20px' }}>
        <canvas
          ref={canvasRef}
          onClick={handleImageClick}
          style={{ 
            width: '100%', 
            height: '100%', 
            border: '1px solid black', 
            cursor: 'crosshair' 
          }}
        />
      </div>
      <div style={{ flex: 1, height: '100%', position: 'relative' }}>
        <Canvas>
          <PerspectiveCamera makeDefault position={[0, 0, 5]} />
          {texture && <Scene2D texture={texture} />}
          {selectedMask && (
            <MaskMesh 
              mask={selectedMask} 
              imageSize={{ width: imageData.width, height: imageData.height }} 
            />
          )}
          {modelUrl && maskBounds && maskedImageResult && (
            <Model 
              url={modelUrl} 
              maskBounds={maskBounds} 
              imageSize={{ width: imageData.width, height: imageData.height }} 
              flipX={true}
              maskedImageResult={maskedImageResult}
              showWireframe={showWireframe}
              showTextureDebug={showTextureDebug}
              showAxesHelper={showAxesHelper}
              showProjectionRay={showProjectionRay}
              rotation={modelRotation}
            />
          )}
          <OrbitControls enablePan={false} enableZoom={false} />
        </Canvas>
        <DebugPanel 
          showWireframe={showWireframe}
          setShowWireframe={setShowWireframe}
          showTextureDebug={showTextureDebug}
          setShowTextureDebug={setShowTextureDebug}
          showAxesHelper={showAxesHelper}
          setShowAxesHelper={setShowAxesHelper}
          showProjectionRay={showProjectionRay}
          setShowProjectionRay={setShowProjectionRay}
        />
      </div>
    </div>
  );
}

export default React.memo(Scene3D);