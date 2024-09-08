import React, { useMemo } from 'react';
import * as THREE from 'three';

function ProjectionRay({ origin, direction, length = 5, color = 'yellow', texture, maskBounds, imageSize, scale }: any) {
  const planeGeometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(Math.PI / 2);
    
    // Flip texture coordinates vertically
    const uvs = geo.attributes.uv.array;
    for (let i = 1; i < uvs.length; i += 2) {
      uvs[i] = 1 - uvs[i];
    }
    geo.attributes.uv.needsUpdate = true;
    
    return geo;
  }, []);

  const planeMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    });
  }, [texture]);

  const planePosition = useMemo(() => {
    // Adjust the position to start from the top of the model
    return new THREE.Vector3().copy(origin).add(direction.clone().multiplyScalar(length / 2));
  }, [origin, direction, length]);

  const planeQuaternion = useMemo(() => {
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    return quaternion;
  }, [direction]);

  const planeScale = useMemo(() => {
    return new THREE.Vector3(scale.x, length, scale.z);
  }, [scale, length]);

  return (
    <group>
      <arrowHelper args={[direction, origin, length, color]} />
      <mesh position={origin}>
        <sphereGeometry args={[0.1, 32, 32]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh 
        geometry={planeGeometry} 
        material={planeMaterial} 
        position={planePosition}
        quaternion={planeQuaternion}
        scale={planeScale}
      />
    </group>
  );
}

export default ProjectionRay;