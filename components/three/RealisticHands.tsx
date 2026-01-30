import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useScroll, MeshTransmissionMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { easeInOutCubic } from '../../utils/particleHelpers';

interface RealisticHandsProps {
  brainRadius?: number;
  visible?: boolean;
}

// Procedural hand geometry using primitive shapes
// This serves as a fallback until GLB models are loaded
function ProceduralHand({ isLeft = true }: { isLeft?: boolean }) {
  const handGroup = useRef<THREE.Group>(null);

  // Palm dimensions
  const palmWidth = 0.8;
  const palmHeight = 0.9;
  const palmDepth = 0.25;

  // Finger dimensions
  const fingerRadius = 0.08;
  const fingerSegments = [0.3, 0.25, 0.2]; // Phalanges

  const mirror = isLeft ? 1 : -1;

  // Finger positions relative to palm
  const fingerPositions = [
    { x: -0.28 * mirror, y: 0.4, spread: 0 },      // Index
    { x: -0.09 * mirror, y: 0.45, spread: 0 },    // Middle
    { x: 0.09 * mirror, y: 0.42, spread: 0 },     // Ring
    { x: 0.25 * mirror, y: 0.35, spread: 0.1 },   // Pinky
  ];

  // Thumb position
  const thumbPos = { x: -0.4 * mirror, y: 0.05, z: 0.1 };

  return (
    <group ref={handGroup}>
      {/* Palm */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[palmWidth, palmHeight, palmDepth]} />
        <meshStandardMaterial
          color="#e8d5c4"
          roughness={0.7}
          metalness={0.1}
        />
      </mesh>

      {/* Fingers */}
      {fingerPositions.map((pos, fingerIdx) => (
        <group
          key={fingerIdx}
          position={[pos.x, pos.y, 0]}
          rotation={[0, 0, pos.spread * mirror]}
        >
          {fingerSegments.map((length, segmentIdx) => {
            const yOffset = fingerSegments
              .slice(0, segmentIdx)
              .reduce((sum, l) => sum + l, 0);
            return (
              <mesh
                key={segmentIdx}
                position={[0, yOffset + length / 2, 0]}
              >
                <capsuleGeometry args={[fingerRadius, length, 4, 8]} />
                <meshStandardMaterial
                  color="#e8d5c4"
                  roughness={0.7}
                  metalness={0.1}
                />
              </mesh>
            );
          })}
        </group>
      ))}

      {/* Thumb */}
      <group
        position={[thumbPos.x, thumbPos.y, thumbPos.z]}
        rotation={[0.3, 0, 0.8 * mirror]}
      >
        <mesh position={[0, 0.15, 0]}>
          <capsuleGeometry args={[0.09, 0.25, 4, 8]} />
          <meshStandardMaterial
            color="#e8d5c4"
            roughness={0.7}
            metalness={0.1}
          />
        </mesh>
        <mesh position={[0, 0.4, 0]}>
          <capsuleGeometry args={[0.08, 0.2, 4, 8]} />
          <meshStandardMaterial
            color="#e8d5c4"
            roughness={0.7}
            metalness={0.1}
          />
        </mesh>
      </group>
    </group>
  );
}

// Stylized crystal/glass hand for more artistic effect
function StylizedHand({ isLeft = true }: { isLeft?: boolean }) {
  const mirror = isLeft ? 1 : -1;

  return (
    <group scale={[mirror, 1, 1]}>
      {/* Palm - abstract curved shape */}
      <mesh position={[0, 0, 0]} rotation={[0.2, 0, 0]}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <MeshTransmissionMaterial
          backside
          samples={4}
          thickness={0.5}
          roughness={0.1}
          transmission={0.95}
          ior={1.5}
          chromaticAberration={0.06}
          color="#00D9FF"
        />
      </mesh>

      {/* Fingers as flowing curves */}
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = (i - 2) * 0.25;
        const length = i === 2 ? 1.2 : i === 0 ? 0.7 : 1.0;

        return (
          <mesh
            key={i}
            position={[
              Math.sin(angle) * 0.4,
              0.4 + Math.cos(angle) * 0.1,
              0,
            ]}
            rotation={[0, 0, angle]}
          >
            <capsuleGeometry args={[0.06, length, 4, 8]} />
            <MeshTransmissionMaterial
              backside
              samples={4}
              thickness={0.3}
              roughness={0.1}
              transmission={0.95}
              ior={1.5}
              chromaticAberration={0.06}
              color="#B829FF"
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function RealisticHands({
  brainRadius = 3.5,
  visible = true,
}: RealisticHandsProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftHandRef = useRef<THREE.Group>(null);
  const rightHandRef = useRef<THREE.Group>(null);
  const scroll = useScroll();

  // Initial positions (off-screen)
  const startDistance = 20;
  const endDistance = brainRadius * 1.8;

  useFrame((state) => {
    if (!groupRef.current || !leftHandRef.current || !rightHandRef.current) return;

    const scrollProgress = scroll.offset;
    const time = state.clock.elapsedTime;

    // Hands appear at 30% scroll, fully visible at 50%
    if (scrollProgress < 0.3) {
      leftHandRef.current.visible = false;
      rightHandRef.current.visible = false;
      return;
    }

    leftHandRef.current.visible = true;
    rightHandRef.current.visible = true;

    // Formation progress (30% to 50% scroll)
    const formationProgress = Math.min((scrollProgress - 0.3) / 0.2, 1);
    const easedProgress = easeInOutCubic(formationProgress);

    // Interpolate hand positions
    const currentDistance =
      startDistance + (endDistance - startDistance) * easedProgress;

    // Left hand position
    leftHandRef.current.position.set(
      -currentDistance,
      -1 + Math.sin(time * 0.5) * 0.1,
      0
    );
    leftHandRef.current.rotation.set(
      0.2 + Math.sin(time * 0.3) * 0.05,
      Math.PI / 6,
      Math.PI / 4
    );

    // Right hand position
    rightHandRef.current.position.set(
      currentDistance,
      -1 + Math.sin(time * 0.5 + Math.PI) * 0.1,
      0
    );
    rightHandRef.current.rotation.set(
      0.2 + Math.sin(time * 0.3 + Math.PI) * 0.05,
      -Math.PI / 6,
      -Math.PI / 4
    );

    // Orbital rotation of hands around the brain (after formation)
    if (scrollProgress >= 0.5) {
      const orbitSpeed = 0.04;
      const orbitAngle = time * orbitSpeed;

      leftHandRef.current.position.x =
        -endDistance * Math.cos(orbitAngle);
      leftHandRef.current.position.z =
        endDistance * Math.sin(orbitAngle) * 0.3;

      rightHandRef.current.position.x =
        endDistance * Math.cos(orbitAngle);
      rightHandRef.current.position.z =
        -endDistance * Math.sin(orbitAngle) * 0.3;
    }

    // Opacity based on scroll
    const materials = [
      ...leftHandRef.current.children,
      ...rightHandRef.current.children,
    ];
    materials.forEach((mesh) => {
      if (mesh instanceof THREE.Mesh && mesh.material) {
        (mesh.material as THREE.MeshStandardMaterial).opacity = easedProgress;
        (mesh.material as THREE.MeshStandardMaterial).transparent = true;
      }
    });
  });

  if (!visible) return null;

  return (
    <group ref={groupRef}>
      {/* Lighting for hands */}
      <pointLight position={[-5, 5, 5]} intensity={1} color="#ffffff" />
      <pointLight position={[5, 5, 5]} intensity={1} color="#ffffff" />
      <pointLight position={[0, -3, 5]} intensity={0.5} color="#00D9FF" />

      {/* Left hand */}
      <group ref={leftHandRef} scale={2}>
        <StylizedHand isLeft={true} />
      </group>

      {/* Right hand */}
      <group ref={rightHandRef} scale={2}>
        <StylizedHand isLeft={false} />
      </group>
    </group>
  );
}

// Export individual hand for testing/preview
export { ProceduralHand, StylizedHand };
