import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

interface AugmentSceneProps {
  isActive: boolean;
}

// Human wireframe silhouette
function HumanSilhouette({
  position,
  isActive,
}: {
  position: [number, number, number];
  isActive: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    // Gentle sway
    groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.5) * 0.03;

    // Head glow intensity based on activity
    if (glowRef.current) {
      const targetOpacity = isActive ? 0.4 + Math.sin(state.clock.elapsedTime * 2) * 0.2 : 0.1;
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity +=
        (targetOpacity - (glowRef.current.material as THREE.MeshBasicMaterial).opacity) * delta * 3;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Head */}
      <mesh position={[0, 2.2, 0]}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial
          color="#00D9FF"
          emissive="#00D9FF"
          emissiveIntensity={isActive ? 0.3 : 0.1}
          wireframe
        />
      </mesh>

      {/* Head glow */}
      <mesh ref={glowRef} position={[0, 2.2, 0]}>
        <sphereGeometry args={[0.65, 16, 16]} />
        <meshBasicMaterial
          color="#00D9FF"
          transparent
          opacity={0.2}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Neck */}
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.15, 0.2, 0.3, 8]} />
        <meshStandardMaterial color="#B829FF" wireframe />
      </mesh>

      {/* Torso */}
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.4, 0.6, 1.5, 12]} />
        <meshStandardMaterial color="#B829FF" wireframe />
      </mesh>

      {/* Arms */}
      <group position={[-0.7, 1.2, 0]} rotation={[0, 0, -0.4]}>
        <mesh position={[0, -0.4, 0]}>
          <cylinderGeometry args={[0.1, 0.12, 0.8, 8]} />
          <meshStandardMaterial color="#B829FF" wireframe />
        </mesh>
        <mesh position={[0, -1, 0]}>
          <cylinderGeometry args={[0.08, 0.1, 0.7, 8]} />
          <meshStandardMaterial color="#B829FF" wireframe />
        </mesh>
      </group>

      <group position={[0.7, 1.2, 0]} rotation={[0, 0, 0.4]}>
        <mesh position={[0, -0.4, 0]}>
          <cylinderGeometry args={[0.1, 0.12, 0.8, 8]} />
          <meshStandardMaterial color="#B829FF" wireframe />
        </mesh>
        <mesh position={[0, -1, 0]}>
          <cylinderGeometry args={[0.08, 0.1, 0.7, 8]} />
          <meshStandardMaterial color="#B829FF" wireframe />
        </mesh>
      </group>

      {/* Legs */}
      <group position={[-0.25, -0.3, 0]}>
        <mesh position={[0, -0.5, 0]}>
          <cylinderGeometry args={[0.15, 0.12, 1, 8]} />
          <meshStandardMaterial color="#B829FF" wireframe />
        </mesh>
        <mesh position={[0, -1.3, 0]}>
          <cylinderGeometry args={[0.12, 0.1, 0.9, 8]} />
          <meshStandardMaterial color="#B829FF" wireframe />
        </mesh>
      </group>

      <group position={[0.25, -0.3, 0]}>
        <mesh position={[0, -0.5, 0]}>
          <cylinderGeometry args={[0.15, 0.12, 1, 8]} />
          <meshStandardMaterial color="#B829FF" wireframe />
        </mesh>
        <mesh position={[0, -1.3, 0]}>
          <cylinderGeometry args={[0.12, 0.1, 0.9, 8]} />
          <meshStandardMaterial color="#B829FF" wireframe />
        </mesh>
      </group>
    </group>
  );
}

// Synapse brain network (particle-based)
function SynapseBrain({
  position,
  isActive,
}: {
  position: [number, number, number];
  isActive: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = state.clock.elapsedTime * 0.2;
  });

  return (
    <group ref={groupRef} position={position}>
      <Sphere args={[1.5, 32, 32]}>
        <MeshDistortMaterial
          color="#B829FF"
          emissive="#00D9FF"
          emissiveIntensity={isActive ? 0.4 : 0.1}
          roughness={0.4}
          metalness={0.6}
          distort={isActive ? 0.3 : 0.1}
          speed={2}
          transparent
          opacity={0.9}
        />
      </Sphere>

      {/* Network nodes on surface */}
      {Array.from({ length: 20 }).map((_, i) => {
        const phi = Math.acos(-1 + (2 * i) / 20);
        const theta = Math.sqrt(20 * Math.PI) * phi;
        const r = 1.5;

        return (
          <mesh
            key={i}
            position={[
              r * Math.sin(phi) * Math.cos(theta),
              r * Math.sin(phi) * Math.sin(theta),
              r * Math.cos(phi),
            ]}
          >
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshBasicMaterial
              color="#00D9FF"
              transparent
              opacity={isActive ? 0.8 : 0.3}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// Memory fragment floating from human to brain
function MemoryFragment({
  index,
  isActive,
  direction,
}: {
  index: number;
  isActive: boolean;
  direction: 'to-brain' | 'to-human';
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const progress = useRef(Math.random());

  const startPos = direction === 'to-brain'
    ? new THREE.Vector3(-4, 2.2, 0)
    : new THREE.Vector3(4, 0, 0);

  const endPos = direction === 'to-brain'
    ? new THREE.Vector3(4, 0, 0)
    : new THREE.Vector3(-4, 2.2, 0);

  useFrame((state, delta) => {
    if (!meshRef.current || !isActive) return;

    progress.current += delta * 0.2;
    if (progress.current > 1) progress.current = 0;

    const t = progress.current;
    const curve = Math.sin(t * Math.PI) * 2;

    const pos = new THREE.Vector3().lerpVectors(startPos, endPos, t);
    pos.y += curve;
    pos.z += Math.sin(t * Math.PI * 2 + index) * 0.5;

    meshRef.current.position.copy(pos);
    meshRef.current.rotation.x = state.clock.elapsedTime * 2;
    meshRef.current.rotation.y = state.clock.elapsedTime * 3;

    // Scale based on position in arc
    const scale = 0.8 + Math.sin(t * Math.PI) * 0.4;
    meshRef.current.scale.setScalar(scale);
  });

  const color = direction === 'to-brain' ? '#B829FF' : '#00D9FF';
  const isDocument = index % 3 === 0;

  return (
    <mesh ref={meshRef}>
      {isDocument ? (
        <boxGeometry args={[0.3, 0.4, 0.05]} />
      ) : (
        <octahedronGeometry args={[0.15]} />
      )}
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.5}
        transparent
        opacity={isActive ? 0.8 : 0}
      />
    </mesh>
  );
}

// Creative spark (particle burst)
function CreativeSpark({ position, isActive }: { position: THREE.Vector3; isActive: boolean }) {
  const particlesRef = useRef<THREE.Points>(null);
  const particleCount = 30;

  const positions = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = 0.1;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  }, []);

  useFrame((state, delta) => {
    if (!particlesRef.current || !isActive) return;

    const time = state.clock.elapsedTime;
    const posArray = particlesRef.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;
      const angle = (i / particleCount) * Math.PI * 2 + time * 2;
      const r = 0.3 + Math.sin(time * 3 + i) * 0.2;

      posArray[idx] = Math.cos(angle) * r;
      posArray[idx + 1] = Math.sin(time * 4 + i * 0.5) * 0.5;
      posArray[idx + 2] = Math.sin(angle) * r;
    }

    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={particlesRef} position={position}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.1}
        color="#FFD700"
        transparent
        opacity={isActive ? 0.8 : 0}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export function AugmentScene({ isActive }: AugmentSceneProps) {
  return (
    <group>
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <pointLight position={[-4, 4, 4]} intensity={1} color="#00D9FF" />
      <pointLight position={[4, 4, 4]} intensity={1} color="#B829FF" />
      <spotLight
        position={[0, 5, 5]}
        angle={0.5}
        penumbra={0.5}
        intensity={isActive ? 2 : 0.5}
        color="#ffffff"
      />

      {/* Human silhouette (left) */}
      <HumanSilhouette position={[-4, -0.5, 0]} isActive={isActive} />

      {/* Synapse brain network (right) */}
      <SynapseBrain position={[4, 0, 0]} isActive={isActive} />

      {/* Memory fragments going to brain */}
      {[0, 1, 2, 3].map((i) => (
        <MemoryFragment key={`to-brain-${i}`} index={i} isActive={isActive} direction="to-brain" />
      ))}

      {/* Creative sparks coming back */}
      {[0, 1, 2].map((i) => (
        <MemoryFragment
          key={`to-human-${i}`}
          index={i + 10}
          isActive={isActive}
          direction="to-human"
        />
      ))}

      {/* Creative spark effect at human's head */}
      <CreativeSpark position={new THREE.Vector3(-4, 1.7, 0)} isActive={isActive} />

      {/* Connection beam between human and brain */}
      <mesh position={[0, 0.5, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, 7, 8]} />
        <meshBasicMaterial
          color="#00D9FF"
          transparent
          opacity={isActive ? 0.3 : 0.1}
        />
      </mesh>
    </group>
  );
}
