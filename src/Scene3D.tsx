import React, { useState, useRef, useEffect, Suspense } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { generateModelFromImage } from './imageToModelService';

interface Mask {
  float_mask: number[][];
  binary_mask: number[][];
  score: number[];
}

interface Scene3DProps {
  imageUrl: string;
  masks: Mask[];
  imageData: ImageData;
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const { camera } = useThree();

  React.useEffect(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraZ *= 1.5; // Zoom out a little so object fits in view
      camera.position.z = cameraZ;
      camera.updateProjectionMatrix();
    }

    // Center the object
    scene.position.x = -center.x;
    scene.position.y = -center.y;
    scene.position.z = -center.z;
  }, [scene, camera]);

  return <primitive object={scene} />;
}

export function Scene3D({ imageUrl, masks, imageData }: Scene3DProps) {
  const [selectedMask, setSelectedMask] = useState<Mask | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          drawMasks(ctx);
        };
        img.src = imageUrl;
      }
    }
  }, [imageUrl, masks]);

  const drawMasks = (ctx: CanvasRenderingContext2D) => {
    masks.forEach((mask, index) => {
      const color = `hsla(${index * 360 / masks.length}, 70%, 50%, 0.5)`;
      ctx.fillStyle = color;
      for (let y = 0; y < mask.binary_mask.length; y++) {
        for (let x = 0; x < mask.binary_mask[y].length; x++) {
          if (mask.binary_mask[y][x] === 1) {
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
    });
  };

  const extractMaskedImage = (mask: Mask) => {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.putImageData(imageData, 0, 0);
      const imageData2 = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < mask.binary_mask.length; i++) {
        for (let j = 0; j < mask.binary_mask[i].length; j++) {
          const index = (i * canvas.width + j) * 4;
          if (mask.binary_mask[i][j] === 0) {
            imageData2.data[index + 3] = 0; // Set alpha to 0 for non-mask pixels
          }
        }
      }
      ctx.putImageData(imageData2, 0, 0);
      return canvas.toDataURL();
    }
    return null;
  };

  const handleCanvasClick = async (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Find the clicked mask
      const clickedMask = masks.find(mask => mask.binary_mask[Math.floor(y)][Math.floor(x)] === 1);
      
      if (clickedMask) {
        setSelectedMask(clickedMask);
        const maskedImageData = extractMaskedImage(clickedMask);
        if (maskedImageData) {
          try {
            const modelData = await generateModelFromImage(maskedImageData);
            const blob = new Blob([modelData], { type: 'model/gltf-binary' });
            const url = URL.createObjectURL(blob);
            setModelUrl(url);
            setModelError(null);

          } catch (error) {
            console.error('Failed to generate 3D model:', error);
            setModelError('Failed to generate 3D model');
            }
        }
      }
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex' }}>
      <div style={{ width: '50%', height: '100%' }}>
        <canvas 
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{ width: '100%', height: '100%', border: '1px solid #ccc' }}
        />
      </div>
      <div style={{ width: '50%', height: '1024px' }}>
        <Canvas>
          <PerspectiveCamera makeDefault position={[0, 0, -5]} fov={75} />
          <ambientLight intensity={0.9} />
          <Suspense fallback={null}>
            {modelUrl && <Model url={modelUrl} />}
          </Suspense>
          <OrbitControls />
        </Canvas>
        {modelError && (
          <div style={{ position: 'absolute', top: '50%', left: '75%', transform: 'translate(-50%, -50%)', background: 'rgba(255,0,0,0.5)', color: 'white', padding: '10px' }}>
            {modelError}
          </div>
        )}
      </div>

      {selectedMask && (
        <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(0,0,0,0.5)', color: 'white', padding: '5px' }}>
          <h3>Selected Mask Score: {selectedMask.score[0].toFixed(2)}</h3>
        </div>
      )}
    </div>
  );
}