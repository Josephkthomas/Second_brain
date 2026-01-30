import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

interface ContextFlowSceneProps {
  isActive: boolean;
}

// Particle stream flowing from app icons to brain
function DataStream({
  startPosition,
  endPosition,
  color,
  isActive,
  delay = 0,
}: {
  startPosition: THREE.Vector3;
  endPosition: THREE.Vector3;
  color: string;
  isActive: boolean;
  delay?: number;
}) {
  const particlesRef = useRef<THREE.Points>(null);
  const particleCount = 50;

  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const vel = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const t = i / particleCount;
      vel[i] = t; // Initial progress along path

      // Distribute along path initially
      const lerped = new THREE.Vector3().lerpVectors(startPosition, endPosition, t);
      pos[i * 3] = lerped.x + (Math.random() - 0.5) * 0.3;
      pos[i * 3 + 1] = lerped.y + (Math.random() - 0.5) * 0.3;
      pos[i * 3 + 2] = lerped.z + (Math.random() - 0.5) * 0.3;
    }

    return { positions: pos, velocities: vel };
  }, [startPosition, endPosition]);

  useFrame((state, delta) => {
    if (!particlesRef.current || !isActive) return;

    const posArray = particlesRef.current.geometry.attributes.position.array as Float32Array;
    const time = state.clock.elapsedTime;

    for (let i = 0; i < particleCount; i++) {
      // Update progress
      velocities[i] += delta * 0.3;
      if (velocities[i] > 1) velocities[i] = 0;

      // Calculate position along curved path
      const t = velocities[i];
      const curve = Math.sin(t * Math.PI) * 0.5; // Arc

      const basePos = new THREE.Vector3().lerpVectors(startPosition, endPosition, t);
      posArray[i * 3] = basePos.x + Math.sin(time * 2 + i) * 0.1;
      posArray[i * 3 + 1] = basePos.y + curve;
      posArray[i * 3 + 2] = basePos.z + Math.cos(time * 2 + i) * 0.1;
    }

    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        color={color}
        transparent
        opacity={isActive ? 0.8 : 0}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// Generic brain (lifeless, gray)
function GenericBrain({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Sphere args={[1.5, 32, 32]}>
        <meshStandardMaterial
          color="#4a4a4a"
          roughness={0.8}
          metalness={0.1}
          wireframe
        />
      </Sphere>
      <Sphere args={[1.4, 16, 16]}>
        <meshStandardMaterial
          color="#333333"
          roughness={0.9}
          transparent
          opacity={0.5}
        />
      </Sphere>
    </group>
  );
}

// Personalized brain (glowing, vibrant)
function PersonalizedBrain({
  position,
  isActive,
}: {
  position: [number, number, number];
  isActive: boolean;
}) {
  const brainRef = useRef<THREE.Group>(null);
  const glowIntensity = useRef(0);

  useFrame((state, delta) => {
    if (!brainRef.current) return;

    // Animate glow intensity
    const targetIntensity = isActive ? 1 : 0;
    glowIntensity.current += (targetIntensity - glowIntensity.current) * delta * 2;

    // Subtle pulse
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.02 * glowIntensity.current;
    brainRef.current.scale.setScalar(pulse);

    // Rotation
    brainRef.current.rotation.y += delta * 0.2;
  });

  return (
    <group ref={brainRef} position={position}>
      {/* Main brain mesh */}
      <Sphere args={[1.5, 32, 32]}>
        <MeshDistortMaterial
          color="#00D9FF"
          emissive="#B829FF"
          emissiveIntensity={isActive ? 0.5 : 0}
          roughness={0.3}
          metalness={0.5}
          distort={0.2}
          speed={2}
        />
      </Sphere>

      {/* Glow effect */}
      <Sphere args={[1.7, 16, 16]}>
        <meshBasicMaterial
          color="#00D9FF"
          transparent
          opacity={isActive ? 0.15 : 0}
          side={THREE.BackSide}
        />
      </Sphere>

      {/* Synaptic pulses */}
      {isActive &&
        [0, 1, 2, 3, 4, 5].map((i) => (
          <SynapticPulse key={i} index={i} />
        ))}
    </group>
  );
}

// Synaptic pulse effect
function SynapticPulse({ index }: { index: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const startAngle = (index / 6) * Math.PI * 2;

  useFrame((state) => {
    if (!meshRef.current) return;

    const time = state.clock.elapsedTime + index * 0.5;
    const pulse = (Math.sin(time * 3) + 1) * 0.5;

    const radius = 1.5;
    meshRef.current.position.x = Math.cos(startAngle + time * 0.5) * radius;
    meshRef.current.position.y = Math.sin(time * 2) * 0.3;
    meshRef.current.position.z = Math.sin(startAngle + time * 0.5) * radius;

    meshRef.current.scale.setScalar(0.05 + pulse * 0.1);
    (meshRef.current.material as THREE.MeshBasicMaterial).opacity = pulse * 0.8;
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial
        color="#ffffff"
        transparent
        opacity={0.5}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// App icon floating above (data source indicator)
function FloatingAppIcon({
  position,
  color,
  label,
}: {
  position: [number, number, number];
  color: string;
  label: string;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.position.y =
      position[1] + Math.sin(state.clock.elapsedTime * 1.5 + position[0]) * 0.2;
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh>
        <boxGeometry args={[0.6, 0.6, 0.1]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

export function ContextFlowScene({ isActive }: ContextFlowSceneProps) {
  // App icon positions (floating above)
  const appIcons = [
    { position: [-3, 3, -1] as [number, number, number], color: '#FF0000', label: 'YouTube' },
    { position: [-1, 3.5, 0] as [number, number, number], color: '#4A154B', label: 'Slack' },
    { position: [1, 3.2, 0.5] as [number, number, number], color: '#0078D4', label: 'Outlook' },
    { position: [3, 3, -0.5] as [number, number, number], color: '#1DB954', label: 'Spotify' },
  ];

  const personalizedBrainPos = new THREE.Vector3(4, -1, 0);

  return (
    <group>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <pointLight position={[5, 5, 5]} intensity={1} />
      <pointLight position={[-5, 5, 5]} intensity={0.5} color="#00D9FF" />
      <pointLight position={[4, 0, 3]} intensity={isActive ? 1 : 0} color="#B829FF" />

      {/* Generic brain (left) */}
      <GenericBrain position={[-4, -1, 0]} />

      {/* Personalized brain (right) */}
      <PersonalizedBrain position={[4, -1, 0]} isActive={isActive} />

      {/* Floating app icons */}
      {appIcons.map((icon, i) => (
        <FloatingAppIcon key={i} {...icon} />
      ))}

      {/* Data streams from icons to personalized brain */}
      {appIcons.map((icon, i) => (
        <DataStream
          key={i}
          startPosition={new THREE.Vector3(...icon.position)}
          endPosition={personalizedBrainPos}
          color={icon.color}
          isActive={isActive}
          delay={i * 0.2}
        />
      ))}

      {/* Comparison arrow or divider */}
      <mesh position={[0, -1, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, 4, 8]} />
        <meshBasicMaterial color="#333333" transparent opacity={0.3} />
      </mesh>
    </group>
  );
}
