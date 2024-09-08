import { Html, useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef, useState, useMemo, useEffect } from "react";
import ProjectionRay from "./ProjectionRay";
import * as THREE from "three";

interface MaskBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface MaskedImageResult {
  base64: string;
}

interface ModelProps {
  url: string;
  maskBounds: MaskBounds;
  imageSize: { width: number; height: number };
  rotation?: { x: number; y: number; z: number };
  flipX?: boolean;
  maskedImageResult: MaskedImageResult;
  showWireframe: boolean;
  showTextureDebug: boolean;
  showAxesHelper: boolean;
  showProjectionRay: boolean;
}

function Model({ 
  url, 
  maskBounds, 
  imageSize, 
  rotation = { x: 0, y: 0, z: 0 },
  flipX = true,
  maskedImageResult,
  showWireframe,
  showTextureDebug,
  showAxesHelper,
  showProjectionRay
}: ModelProps) {
  const { scene } = useGLTF(url);
  const { camera, size } = useThree();
  const sceneRef = useRef<THREE.Group>(null);
  const axesHelper = useRef<THREE.AxesHelper>(null);
  const [projectionRayProps, setProjectionRayProps] = useState({
    origin: new THREE.Vector3(),
    direction: new THREE.Vector3(0, 0, 1),
    maskBounds,
    imageSize,
    scale: new THREE.Vector3(1, 1, 1)  // Initialize with a default scale
  });

  const [verticalAdjustment, setVerticalAdjustment] = useState(0);
  const textureRef = useRef<THREE.Texture | null>(null);

  // Memoize the texture loading to prevent unnecessary reloads
  const texture = useMemo(() => {
    if (textureRef.current) {
      textureRef.current.dispose();
    }
    const newTexture = new THREE.TextureLoader().load(maskedImageResult.base64);
    newTexture.flipY = false;
    textureRef.current = newTexture;
    return newTexture;
  }, [maskedImageResult.base64]);

  // Memoize calculations for model and projection positioning and scaling
  const modelAndProjectionTransform = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const modelSize = box.getSize(new THREE.Vector3());
    const modelCenter = box.getCenter(new THREE.Vector3());

    const maskWidth = (maskBounds.maxX - maskBounds.minX) / imageSize.width * 2;
    const maskHeight = (maskBounds.maxY - maskBounds.minY) / imageSize.height * 2;
    const scaleX = maskWidth / modelSize.x;
    const scaleY = maskHeight / modelSize.y;
    const scale = Math.min(scaleX, scaleY);

    const maskCenterX = ((maskBounds.minX + maskBounds.maxX) / 2 / imageSize.width) * 2 - 1;
    const maskCenterY = -((maskBounds.minY + maskBounds.maxY) / 2 / imageSize.height) * 2 + 1;

    const modelPosition = new THREE.Vector3(
      maskCenterX - modelCenter.x * scale,
      maskCenterY - modelCenter.y * scale,
      0
    );

    // Adjust the projection origin with the verticalAdjustment
    const projectionOrigin = new THREE.Vector3(
      modelPosition.x,
      maskCenterY - modelCenter.y * scale + verticalAdjustment,
      -1
    );

    return {
      scale: new THREE.Vector3(flipX ? -scale : scale, scale, scale),
      modelPosition: modelPosition,
      projectionOrigin: projectionOrigin,
      projectionDirection: new THREE.Vector3(0, 0, 1),
      projectionScale: new THREE.Vector3(maskWidth, 1, maskHeight)
    };
  }, [scene, maskBounds, imageSize, flipX, verticalAdjustment]);



  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.scale.copy(modelAndProjectionTransform.scale);
      sceneRef.current.position.copy(modelAndProjectionTransform.modelPosition);
      sceneRef.current.rotation.set(rotation.x, rotation.y, rotation.z);

      sceneRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = new THREE.MeshBasicMaterial({ 
            map: texture,
            side: THREE.DoubleSide,
            wireframe: showWireframe
          });
        }
      });

      setProjectionRayProps({
        origin: modelAndProjectionTransform.projectionOrigin,
        direction: modelAndProjectionTransform.projectionDirection,
        maskBounds,
        imageSize,
        scale: modelAndProjectionTransform.projectionScale
      });
    }

    // Adjust camera
    if (camera instanceof THREE.PerspectiveCamera) {
      const aspect = size.width / size.height;
      const fov = 50;
      const planeHeight = 2;
      const distance = planeHeight / (2 * Math.tan(fov * Math.PI / 360));
      
      camera.fov = fov;
      camera.aspect = aspect;
      camera.position.set(0, 0, distance);
      camera.updateProjectionMatrix();
    }

    return () => {
      // Cleanup
      if (textureRef.current) {
        textureRef.current.dispose();
      }
    };
}, [scene, camera, size, rotation, modelAndProjectionTransform, texture, showWireframe, maskBounds, imageSize]);

  useFrame(() => {
    if (axesHelper.current) {
      axesHelper.current.visible = showAxesHelper;
    }
  });
  // Add UI controls for vertical adjustment
  const handleVerticalAdjustment = (event: React.ChangeEvent<HTMLInputElement>) => {
    setVerticalAdjustment(parseFloat(event.target.value));
  };
  return (
    <group ref={sceneRef}>
      <primitive object={scene} />
      <axesHelper ref={axesHelper} args={[5]} />
      {showProjectionRay && (
        <ProjectionRay {...projectionRayProps} texture={texture} />
      )}
      {showTextureDebug && (
        <Html>
          <div style={{ background: 'white', padding: '10px', border: '1px solid black' }}>
            <img src={maskedImageResult.base64} alt="Debug Texture" style={{ width: '200px' }} />
          </div>
        </Html>
      )}
      <Html>
        <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '10px' }}>
          <label>
            Vertical Adjustment:
            <input
              type="range"
              min="-0.5"
              max="0.5"
              step="0.01"
              value={verticalAdjustment}
              onChange={handleVerticalAdjustment}
            />
            {verticalAdjustment.toFixed(2)}
          </label>
        </div>
      </Html>
    </group>
  );
}

export default Model;

/*

function Model({ 
  url, 
  maskBounds, 
  imageSize, 
  rotation = { x: 0, y: 0, z: 0 },
  flipX = true,
  maskedImageResult,
  showWireframe,
  showTextureDebug,
  showAxesHelper,
  showProjectionRay
}: { 
  url: string; 
  maskBounds: MaskBounds; 
  imageSize: { width: number; height: number };
  rotation?: { x: number; y: number; z: number };
  flipX?: boolean;
  maskedImageResult: MaskedImageResult;
  showWireframe: boolean;
  showTextureDebug: boolean;
  showAxesHelper: boolean;
  showProjectionRay: boolean;
}) {
  const { scene } = useGLTF(url);
  const { camera, size } = useThree();
  const sceneRef = useRef<THREE.Group>(null);
  const axesHelper = useRef<THREE.AxesHelper>(null);
  const [projectionRayProps, setProjectionRayProps] = useState({ origin: new THREE.Vector3(), direction: new THREE.Vector3(0, 0, -1) });

  const textureRef = useRef<THREE.Texture | null>(null);

  // Memoize the texture loading to prevent unnecessary reloads
  const texture = useMemo(() => {
    if (textureRef.current) {
      textureRef.current.dispose();
    }
    const newTexture = new THREE.TextureLoader().load(maskedImageResult.base64);
    newTexture.flipY = true;
    textureRef.current = newTexture;
    return newTexture;
  }, [maskedImageResult.base64]);

  // Memoize calculations that depend on maskBounds and imageSize
  const modelTransform = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const modelSize = box.getSize(new THREE.Vector3());
    const modelCenter = box.getCenter(new THREE.Vector3());

    const maskWidth = (maskBounds.maxX - maskBounds.minX) / imageSize.width * 2;
    const maskHeight = (maskBounds.maxY - maskBounds.minY) / imageSize.height * 2;
    const scaleX = maskWidth / modelSize.x;
    const scaleY = maskHeight / modelSize.y;
    const scale = Math.min(scaleX, scaleY);

    const maskCenterX = ((maskBounds.minX + maskBounds.maxX) / 2 / imageSize.width) * 2 - 1;
    const maskCenterY = -((maskBounds.minY + maskBounds.maxY) / 2 / imageSize.height) * 2 + 1;

    return {
      scale: new THREE.Vector3(flipX ? -scale : scale, scale, scale),
      position: new THREE.Vector3(
        maskCenterX - modelCenter.x * scale,
        maskCenterY - modelCenter.y * scale,
        0
      ),
      rayOrigin: new THREE.Vector3(maskCenterX, maskCenterY, 1),
      rayDirection: new THREE.Vector3(0, 0, -1)
    };
  }, [scene, maskBounds, imageSize, flipX]);

  useEffect(() => {
    console.log('Model effect running');

    if (sceneRef.current) {
      sceneRef.current.scale.copy(modelTransform.scale);
      sceneRef.current.position.copy(modelTransform.position);
      sceneRef.current.rotation.set(rotation.x, rotation.y, rotation.z);

      sceneRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = new THREE.MeshBasicMaterial({ 
            map: texture,
            side: THREE.DoubleSide,
            wireframe: showWireframe
          });
        }
      });

      setProjectionRayProps({ 
        origin: modelTransform.rayOrigin, 
        direction: modelTransform.rayDirection 
      });
    }

    // Adjust camera
    if (camera instanceof THREE.PerspectiveCamera) {
      const aspect = size.width / size.height;
      const fov = 50;
      const planeHeight = 2;
      const distance = planeHeight / (2 * Math.tan(fov * Math.PI / 360));
      
      camera.fov = fov;
      camera.aspect = aspect;
      camera.position.set(0, 0, distance);
      camera.updateProjectionMatrix();
    }

    return () => {
      // Cleanup
      if (textureRef.current) {
        textureRef.current.dispose();
      }
    };
  }, [scene, camera, size, rotation, modelTransform, texture, showWireframe]);

  useFrame(() => {
    if (axesHelper.current) {
      axesHelper.current.visible = showAxesHelper;
    }
  });

  return (
    <group ref={sceneRef}>
      <primitive object={scene} />
      <axesHelper ref={axesHelper} args={[5]} />
      {showProjectionRay && (
        <ProjectionRay {...projectionRayProps} />
      )}
      {showTextureDebug && (
        <Html>
          <div style={{ background: 'white', padding: '10px', border: '1px solid black' }}>
            <img src={maskedImageResult.base64} alt="Debug Texture" style={{ width: '200px' }} />
          </div>
        </Html>
      )}
    </group>
  );
}

*/