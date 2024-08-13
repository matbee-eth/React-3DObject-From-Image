import React, { useState, useRef, useEffect, Suspense } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, PerspectiveCamera, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { generateModelFromImage } from './imageToModelService';

interface Mask {
  float_mask: number[][];
  binary_mask: number[][];
  score: number;
}

interface Scene3DProps {
  imageUrl: string;
  masks: Mask[];
  imageData: ImageData;
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const { camera } = useThree();

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = camera.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraZ *= 1.5;
      camera.position.z = cameraZ;
      camera.updateProjectionMatrix();
    }

    scene.position.x = -center.x;
    scene.position.y = -center.y;
    scene.position.z = -center.z;

    scene.rotation.y = Math.PI;

    // Traverse the scene and set materials to MeshStandardMaterial
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshStandardMaterial({
          color: child.material.color,
          map: child.material.map,
          normalMap: child.material.normalMap,
          metalness: 0.1,
          roughness: 0.8,
        });
      }
    });
  }, [scene, camera]);

  return <primitive object={scene} />;
}

export function Scene3D({ imageUrl, masks, imageData }: Scene3DProps) {
  const [selectedMask, setSelectedMask] = useState<Mask | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
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
      const hue = (index * 137.508) % 360; // Use golden angle approximation for color distribution
      ctx.fillStyle = `hsla(${hue}, 70%, 50%, 0.3)`;
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
      for (let y = 0; y < mask.binary_mask.length; y++) {
        for (let x = 0; x < mask.binary_mask[y].length; x++) {
          const index = (y * canvas.width + x) * 4;
          if (mask.binary_mask[y][x] === 0) {
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
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;

      // Find all clicked masks
      const clickedMasks = masks.filter(mask => {
        const maskWidth = mask.binary_mask[0].length;
        const maskHeight = mask.binary_mask.length;
        const maskX = Math.floor(x * maskWidth / canvas.width);
        const maskY = Math.floor(y * maskHeight / canvas.height);
        return maskX >= 0 && maskX < maskWidth && maskY >= 0 && maskY < maskHeight && mask.binary_mask[maskY][maskX] === 1;
      });

      if (clickedMasks.length > 0) {
        // Select the mask with the highest score
        const bestMask = clickedMasks.reduce((prev, current) => (prev.score > current.score) ? prev : current);
        setSelectedMask(bestMask);
        const maskedImageData = extractMaskedImage(bestMask);
        if (maskedImageData) {
          try {
            const modelData = await generateModelFromImage(maskedImageData);
            console.debug('handleImageGeneration', modelData);
            const blob = new Blob([modelData], { type: 'model/gltf-binary' });
            const url = URL.createObjectURL(blob);
            setModelUrl(url);
          } catch (error) {
            console.error('Failed to generate 3D model:', error);
          }
        }
      }
    }
  };

  return (
    <div style={{ width: '100%', height: '600px', display: 'flex' }}>
      <div style={{ width: '50%', height: '100%', overflow: 'hidden' }}>
        <canvas 
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
      <div style={{ width: '50%', height: '100%' }}>
        <Canvas>
          <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={75} />
          <ambientLight intensity={0.5} />
          <spotLight position={[5, 5, 5]} angle={0.15} penumbra={1} intensity={1} castShadow />
          <pointLight position={[-5, -5, -5]} intensity={0.5} />
          <directionalLight position={[0, 10, 0]} intensity={0.5} />
          <Suspense fallback={null}>
            {modelUrl && <Model url={modelUrl} />}
          </Suspense>
          <OrbitControls />
          <Environment preset="studio" />
        </Canvas>
      </div>
      {selectedMask && (
        <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(0,0,0,0.5)', color: 'white', padding: '5px' }}>
          <h3>Selected Mask Score: {selectedMask.score.toFixed(2)}</h3>
        </div>
      )}
    </div>
  );
}