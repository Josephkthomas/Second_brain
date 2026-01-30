import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

interface ChaosToOrderSceneProps {
  isActive: boolean;
}

// Chaotic document/icon that gets sucked into funnel
function ChaoticDocument({
  initialPosition,
  index,
  isActive,
  cycleProgress,
}: {
  initialPosition: THREE.Vector3;
  index: number;
  isActive: boolean;
  cycleProgress: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [phase, setPhase] = useState<'chaos' | 'funnel' | 'dissolve'>('chaos');

  // Document enters funnel at different times based on index
  const enterTime = (index / 20) * 0.4;
  const documentProgress = Math.max(0, (cycleProgress - enterTime) / (1 - enterTime));

  useEffect(() => {
    if (documentProgress < 0.3) {
      setPhase('chaos');
    } else if (documentProgress < 0.7) {
      setPhase('funnel');
    } else {
      setPhase('dissolve');
    }
  }, [documentProgress]);

  useFrame((state) => {
    if (!meshRef.current || !isActive) return;

    const time = state.clock.elapsedTime;

    if (phase === 'chaos') {
      // Chaotic floating
      meshRef.current.position.x =
        initialPosition.x + Math.sin(time * 1.5 + index) * 0.3;
      meshRef.current.position.y =
        initialPosition.y + Math.cos(time * 1.2 + index * 0.5) * 0.2;
      meshRef.current.position.z =
        initialPosition.z + Math.sin(time * 0.8 + index * 0.3) * 0.3;

      meshRef.current.rotation.x = time * (0.5 + index * 0.1);
      meshRef.current.rotation.y = time * (0.3 + index * 0.15);
      meshRef.current.scale.setScalar(1);
    } else if (phase === 'funnel') {
      // Spiral into funnel
      const funnelProgress = (documentProgress - 0.3) / 0.4;
      const angle = funnelProgress * Math.PI * 4 + index * 0.5;
      const radius = 3 * (1 - funnelProgress);
      const y = 3 - funnelProgress * 6;

      meshRef.current.position.x = Math.cos(angle) * radius;
      meshRef.current.position.y = y;
      meshRef.current.position.z = Math.sin(angle) * radius;

      meshRef.current.rotation.x += 0.1;
      meshRef.current.rotation.y += 0.15;

      // Shrink as entering funnel
      meshRef.current.scale.setScalar(1 - funnelProgress * 0.5);
    } else {
      // Dissolve - make invisible
      meshRef.current.scale.setScalar(0);
    }
  });

  // Different document types based on index
  const docType = index % 4;
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];

  return (
    <mesh ref={meshRef} position={initialPosition}>
      {docType === 0 && <boxGeometry args={[0.4, 0.5, 0.05]} />}
      {docType === 1 && <octahedronGeometry args={[0.25]} />}
      {docType === 2 && <tetrahedronGeometry args={[0.3]} />}
      {docType === 3 && <sphereGeometry args={[0.2, 8, 8]} />}
      <meshStandardMaterial
        color={colors[docType]}
        transparent
        opacity={isActive && phase !== 'dissolve' ? 0.9 : 0}
        emissive={colors[docType]}
        emissiveIntensity={0.2}
      />
    </mesh>
  );
}

// Processing funnel (wireframe cone)
function ProcessingFunnel({ isActive }: { isActive: boolean }) {
  const funnelRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!funnelRef.current) return;
    funnelRef.current.rotation.y = state.clock.elapsedTime * 0.5;
  });

  return (
    <group ref={funnelRef} position={[0, 0, 0]}>
      {/* Outer funnel */}
      <mesh rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[3, 5, 32, 1, true]} />
        <meshStandardMaterial
          color="#00D9FF"
          wireframe
          transparent
          opacity={isActive ? 0.6 : 0.2}
        />
      </mesh>

      {/* Inner glow */}
      <mesh rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[2.8, 4.8, 16, 1, true]} />
        <meshBasicMaterial
          color="#B829FF"
          transparent
          opacity={isActive ? 0.15 : 0.05}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Processing particles inside funnel */}
      <FunnelParticles isActive={isActive} />
    </group>
  );
}

// Particles swirling inside funnel
function FunnelParticles({ isActive }: { isActive: boolean }) {
  const particlesRef = useRef<THREE.Points>(null);
  const particleCount = 100;

  const positions = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 2;
      pos[i * 3 + 1] = Math.random() * -4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }
    return pos;
  }, []);

  useFrame((state) => {
    if (!particlesRef.current || !isActive) return;

    const time = state.clock.elapsedTime;
    const posArray = particlesRef.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;
      const y = posArray[idx + 1];
      const progress = (y + 4) / 4; // 0 at bottom, 1 at top
      const radius = progress * 2;

      const angle = time * 2 + i * 0.2 + y;
      posArray[idx] = Math.cos(angle) * radius;
      posArray[idx + 2] = Math.sin(angle) * radius;

      // Move down
      posArray[idx + 1] -= 0.02;
      if (posArray[idx + 1] < -4) {
        posArray[idx + 1] = 0;
      }
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
        color="#00D9FF"
        transparent
        opacity={isActive ? 0.6 : 0}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// Organized knowledge graph node
function GraphNode({
  position,
  index,
  isActive,
  appearTime,
  cycleProgress,
}: {
  position: THREE.Vector3;
  index: number;
  isActive: boolean;
  appearTime: number;
  cycleProgress: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [scale, setScale] = useState(0);

  // Node appears after certain point in cycle
  const shouldShow = cycleProgress > appearTime;

  useEffect(() => {
    if (shouldShow && isActive) {
      // Bounce animation
      setScale(0);
      const timeout = setTimeout(() => setScale(1.2), 50);
      const timeout2 = setTimeout(() => setScale(1), 200);
      return () => {
        clearTimeout(timeout);
        clearTimeout(timeout2);
      };
    } else if (!shouldShow) {
      setScale(0);
    }
  }, [shouldShow, isActive]);

  useFrame(() => {
    if (!meshRef.current) return;

    // Smooth scale transition
    const currentScale = meshRef.current.scale.x;
    const targetScale = shouldShow && isActive ? scale : 0;
    meshRef.current.scale.setScalar(
      currentScale + (targetScale - currentScale) * 0.1
    );
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[0.2, 16, 16]} />
      <meshStandardMaterial
        color="#00D9FF"
        emissive="#00D9FF"
        emissiveIntensity={0.5}
      />
    </mesh>
  );
}

// Organized knowledge graph
function OrganizedGraph({
  isActive,
  cycleProgress,
}: {
  isActive: boolean;
  cycleProgress: number;
}) {
  // Node positions
  const nodes = useMemo(() => {
    const positions: { pos: THREE.Vector3; appearTime: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const radius = 1.5 + Math.random() * 1;
      positions.push({
        pos: new THREE.Vector3(
          Math.cos(angle) * radius,
          (Math.random() - 0.5) * 1.5,
          Math.sin(angle) * radius
        ),
        appearTime: 0.6 + (i / 10) * 0.35, // Staggered appearance
      });
    }
    return positions;
  }, []);

  // Edge connections
  const edges = useMemo(() => {
    const connections: [THREE.Vector3, THREE.Vector3, number][] = [];
    // Connect adjacent nodes
    for (let i = 0; i < nodes.length; i++) {
      const next = (i + 1) % nodes.length;
      const appearTime = Math.max(nodes[i].appearTime, nodes[next].appearTime) + 0.05;
      connections.push([nodes[i].pos, nodes[next].pos, appearTime]);

      // Some cross connections
      if (i % 3 === 0) {
        const cross = (i + 4) % nodes.length;
        const crossAppear = Math.max(nodes[i].appearTime, nodes[cross].appearTime) + 0.05;
        connections.push([nodes[i].pos, nodes[cross].pos, crossAppear]);
      }
    }
    return connections;
  }, [nodes]);

  return (
    <group position={[6, -1, 0]}>
      {/* Nodes */}
      {nodes.map((node, i) => (
        <GraphNode
          key={i}
          position={node.pos}
          index={i}
          isActive={isActive}
          appearTime={node.appearTime}
          cycleProgress={cycleProgress}
        />
      ))}

      {/* Edges */}
      {edges.map(([start, end, appearTime], i) => (
        <group key={i}>
          {cycleProgress > appearTime && isActive && (
            <Line
              points={[start, end]}
              color="#B829FF"
              lineWidth={1}
              transparent
              opacity={0.6}
            />
          )}
        </group>
      ))}
    </group>
  );
}

export function ChaosToOrderScene({ isActive }: ChaosToOrderSceneProps) {
  const [cycleProgress, setCycleProgress] = useState(0);

  // 6-second cycle
  useFrame((state) => {
    if (!isActive) {
      setCycleProgress(0);
      return;
    }
    const cycleDuration = 6;
    setCycleProgress((state.clock.elapsedTime % cycleDuration) / cycleDuration);
  });

  // Chaotic document initial positions (left side)
  const chaoticPositions = useMemo(() => {
    const positions: THREE.Vector3[] = [];
    for (let i = 0; i < 15; i++) {
      positions.push(
        new THREE.Vector3(
          -6 + (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 2
        )
      );
    }
    return positions;
  }, []);

  return (
    <group>
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <pointLight position={[-6, 4, 4]} intensity={1} color="#FF6B6B" />
      <pointLight position={[0, 2, 4]} intensity={1.5} color="#00D9FF" />
      <pointLight position={[6, 4, 4]} intensity={1} color="#B829FF" />

      {/* Chaotic documents (left) */}
      {chaoticPositions.map((pos, i) => (
        <ChaoticDocument
          key={i}
          initialPosition={pos}
          index={i}
          isActive={isActive}
          cycleProgress={cycleProgress}
        />
      ))}

      {/* Processing funnel (center) */}
      <ProcessingFunnel isActive={isActive} />

      {/* Organized graph (right) */}
      <OrganizedGraph isActive={isActive} cycleProgress={cycleProgress} />

      {/* Labels */}
      <mesh position={[-6, 3, 0]}>
        <planeGeometry args={[2, 0.5]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
}
