import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, RoundedBox, Line } from '@react-three/drei';
import * as THREE from 'three';

// ============================================
// Use Case 1: Meeting Intelligence
// ============================================
export function MeetingIntelMockup({ isActive }: { isActive: boolean }) {
  const [cycleProgress, setCycleProgress] = useState(0);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!isActive) return;
    const cycleDuration = 7;
    setCycleProgress((state.clock.elapsedTime % cycleDuration) / cycleDuration);
  });

  // Sample transcript lines
  const transcriptLines = [
    { text: 'Sarah: The Q4 budget needs approval', keywords: ['Sarah', 'Q4 budget'] },
    { text: 'Mike: Marketing team will handle it', keywords: ['Marketing'] },
    { text: 'Sarah: We need to finalize by Friday', keywords: ['Friday'] },
    { text: 'Decision: Approve $50k for campaign', keywords: ['Decision', '$50k'] },
  ];

  // Extracted nodes positions
  const nodePositions = useMemo(() => [
    new THREE.Vector3(3, 2, 0),
    new THREE.Vector3(4, 0.5, 0.5),
    new THREE.Vector3(3.5, -1, -0.3),
    new THREE.Vector3(4.5, -2, 0.2),
  ], []);

  return (
    <group ref={groupRef}>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <pointLight position={[-3, 3, 3]} intensity={1} color="#ffffff" />
      <pointLight position={[4, 2, 3]} intensity={0.8} color="#00D9FF" />

      {/* Transcript Panel */}
      <group position={[-3, 0, 0]}>
        <RoundedBox args={[4, 5, 0.1]} radius={0.1}>
          <meshStandardMaterial color="#1a1f2e" />
        </RoundedBox>

        {/* Transcript title */}
        <Text
          position={[0, 2, 0.06]}
          fontSize={0.25}
          color="#00D9FF"
          anchorX="center"
        >
          Meeting Transcript
        </Text>

        {/* Scrolling transcript lines */}
        {transcriptLines.map((line, i) => {
          const yPos = 1.2 - i * 0.8 - (cycleProgress * 2) % 0.8;
          const isHighlighting = cycleProgress > 0.2 + i * 0.15 && cycleProgress < 0.4 + i * 0.15;

          return (
            <group key={i} position={[0, yPos, 0.06]}>
              <Text
                fontSize={0.15}
                color={isHighlighting ? '#00D9FF' : '#94a3b8'}
                anchorX="center"
                maxWidth={3.5}
              >
                {line.text}
              </Text>
            </group>
          );
        })}
      </group>

      {/* Extracted Nodes (Knowledge Graph) */}
      <group position={[3, 0, 0]}>
        {nodePositions.map((pos, i) => {
          const appearTime = 0.3 + i * 0.12;
          const shouldShow = cycleProgress > appearTime && isActive;

          return (
            <group key={i}>
              {/* Node */}
              <mesh position={pos} scale={shouldShow ? 1 : 0}>
                <sphereGeometry args={[0.2, 16, 16]} />
                <meshStandardMaterial
                  color="#00D9FF"
                  emissive="#00D9FF"
                  emissiveIntensity={0.5}
                />
              </mesh>

              {/* Flying particle from transcript to node */}
              {cycleProgress > appearTime - 0.1 && cycleProgress < appearTime && (
                <FlyingParticle
                  start={new THREE.Vector3(-3, 1.2 - i * 0.8, 0)}
                  end={pos.clone().add(new THREE.Vector3(3, 0, 0))}
                  progress={(cycleProgress - (appearTime - 0.1)) / 0.1}
                />
              )}
            </group>
          );
        })}

        {/* Edges between nodes */}
        {cycleProgress > 0.7 && isActive && (
          <>
            <Line points={[nodePositions[0], nodePositions[1]]} color="#B829FF" lineWidth={1} />
            <Line points={[nodePositions[1], nodePositions[2]]} color="#B829FF" lineWidth={1} />
            <Line points={[nodePositions[2], nodePositions[3]]} color="#B829FF" lineWidth={1} />
            <Line points={[nodePositions[0], nodePositions[2]]} color="#B829FF" lineWidth={1} opacity={0.5} />
          </>
        )}
      </group>
    </group>
  );
}

// ============================================
// Use Case 2: Serendipity Engine
// ============================================
export function SerendipityMockup({ isActive }: { isActive: boolean }) {
  const [cycleProgress, setCycleProgress] = useState(0);
  const [highlightedNodes, setHighlightedNodes] = useState<number[]>([]);

  useFrame((state) => {
    if (!isActive) return;
    const cycleDuration = 6;
    setCycleProgress((state.clock.elapsedTime % cycleDuration) / cycleDuration);
  });

  useEffect(() => {
    if (cycleProgress > 0.3 && cycleProgress < 0.8) {
      setHighlightedNodes([2, 7, 14]); // Highlight specific nodes
    } else {
      setHighlightedNodes([]);
    }
  }, [cycleProgress]);

  // Generate knowledge graph nodes
  const nodes = useMemo(() => {
    const positions: THREE.Vector3[] = [];
    for (let i = 0; i < 25; i++) {
      const angle = (i / 25) * Math.PI * 2 + (i % 5) * 0.3;
      const radius = 2 + (i % 3) * 0.8;
      const y = (Math.random() - 0.5) * 2;
      positions.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        y,
        Math.sin(angle) * radius
      ));
    }
    return positions;
  }, []);

  // Generate edges
  const edges = useMemo(() => {
    const connections: [number, number][] = [];
    for (let i = 0; i < nodes.length; i++) {
      const next = (i + 1) % nodes.length;
      connections.push([i, next]);
      if (i % 4 === 0) {
        connections.push([i, (i + 5) % nodes.length]);
      }
    }
    return connections;
  }, [nodes]);

  return (
    <group>
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 5, 5]} intensity={1} color="#ffffff" />

      {/* Search query text */}
      {cycleProgress > 0.1 && cycleProgress < 0.9 && (
        <Text
          position={[0, 3.5, 0]}
          fontSize={0.3}
          color="#00D9FF"
          anchorX="center"
        >
          "What did I learn about AI regulation?"
        </Text>
      )}

      {/* Knowledge graph */}
      <group rotation={[0.2, cycleProgress * Math.PI * 2 * 0.1, 0]}>
        {/* Nodes */}
        {nodes.map((pos, i) => {
          const isHighlighted = highlightedNodes.includes(i);
          return (
            <mesh key={i} position={pos}>
              <sphereGeometry args={[isHighlighted ? 0.25 : 0.15, 16, 16]} />
              <meshStandardMaterial
                color={isHighlighted ? '#00D9FF' : '#4a4a4a'}
                emissive={isHighlighted ? '#00D9FF' : '#000000'}
                emissiveIntensity={isHighlighted ? 0.8 : 0}
              />
            </mesh>
          );
        })}

        {/* Edges */}
        {edges.map(([a, b], i) => {
          const isHighlightedEdge =
            highlightedNodes.includes(a) && highlightedNodes.includes(b);
          return (
            <Line
              key={i}
              points={[nodes[a], nodes[b]]}
              color={isHighlightedEdge ? '#B829FF' : '#333333'}
              lineWidth={isHighlightedEdge ? 2 : 0.5}
              transparent
              opacity={isHighlightedEdge ? 1 : 0.3}
            />
          );
        })}

        {/* Highlight connections between found nodes */}
        {highlightedNodes.length === 3 && (
          <>
            <Line
              points={[nodes[highlightedNodes[0]], nodes[highlightedNodes[1]]]}
              color="#FFD700"
              lineWidth={3}
            />
            <Line
              points={[nodes[highlightedNodes[1]], nodes[highlightedNodes[2]]]}
              color="#FFD700"
              lineWidth={3}
            />
          </>
        )}
      </group>

      {/* Aha moment spark */}
      {cycleProgress > 0.5 && cycleProgress < 0.7 && (
        <AhaSparkEffect position={nodes[highlightedNodes[1]] || new THREE.Vector3(0, 0, 0)} />
      )}
    </group>
  );
}

// ============================================
// Use Case 3: Team Knowledge Hub
// ============================================
export function TeamHubMockup({ isActive }: { isActive: boolean }) {
  const [cycleProgress, setCycleProgress] = useState(0);

  useFrame((state) => {
    if (!isActive) return;
    const cycleDuration = 8;
    setCycleProgress((state.clock.elapsedTime % cycleDuration) / cycleDuration);
  });

  // Team avatars (positioned around perimeter)
  const avatars = [
    { color: '#3B82F6', position: new THREE.Vector3(-4, 2, 0), contributionTime: 0.1 },
    { color: '#10B981', position: new THREE.Vector3(4, 2, 0), contributionTime: 0.3 },
    { color: '#F59E0B', position: new THREE.Vector3(-4, -2, 0), contributionTime: 0.5 },
    { color: '#8B5CF6', position: new THREE.Vector3(4, -2, 0), contributionTime: 0.5 },
  ];

  // Central graph nodes
  const graphNodes = useMemo(() => {
    const nodes: THREE.Vector3[] = [];
    for (let i = 0; i < 15; i++) {
      const angle = (i / 15) * Math.PI * 2;
      const radius = 1 + Math.random() * 0.8;
      nodes.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        (Math.random() - 0.5) * 1.5,
        Math.sin(angle) * radius * 0.5
      ));
    }
    return nodes;
  }, []);

  return (
    <group>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 5, 5]} intensity={1} />

      {/* Team avatars */}
      {avatars.map((avatar, i) => (
        <group key={i} position={avatar.position}>
          {/* Avatar sphere */}
          <mesh>
            <sphereGeometry args={[0.5, 32, 32]} />
            <meshStandardMaterial color={avatar.color} />
          </mesh>

          {/* Contribution particle */}
          {cycleProgress > avatar.contributionTime &&
            cycleProgress < avatar.contributionTime + 0.15 && (
              <FlyingParticle
                start={avatar.position.clone()}
                end={new THREE.Vector3(0, 0, 0)}
                progress={(cycleProgress - avatar.contributionTime) / 0.15}
                color={avatar.color}
              />
            )}
        </group>
      ))}

      {/* Central knowledge graph */}
      <group>
        {/* Graph nodes */}
        {graphNodes.map((pos, i) => {
          // Nodes appear as contributions come in
          const appearTime = 0.2 + (i / graphNodes.length) * 0.6;
          const shouldShow = cycleProgress > appearTime && isActive;

          return (
            <mesh key={i} position={pos} scale={shouldShow ? 1 : 0}>
              <sphereGeometry args={[0.12, 16, 16]} />
              <meshStandardMaterial
                color="#00D9FF"
                emissive="#00D9FF"
                emissiveIntensity={0.4}
              />
            </mesh>
          );
        })}

        {/* Graph edges (appear after nodes) */}
        {cycleProgress > 0.5 &&
          graphNodes.slice(0, -1).map((pos, i) => (
            <Line
              key={i}
              points={[pos, graphNodes[(i + 1) % graphNodes.length]]}
              color="#B829FF"
              lineWidth={1}
              transparent
              opacity={0.6}
            />
          ))}
      </group>

      {/* Pulse effect when graph integrates */}
      {cycleProgress > 0.7 && cycleProgress < 0.85 && (
        <mesh scale={1 + (cycleProgress - 0.7) * 10}>
          <sphereGeometry args={[2, 16, 16]} />
          <meshBasicMaterial
            color="#00D9FF"
            transparent
            opacity={0.1 * (0.85 - cycleProgress) / 0.15}
            side={THREE.BackSide}
          />
        </mesh>
      )}
    </group>
  );
}

// ============================================
// Use Case 4: Integrated Intelligence
// ============================================
export function IntegratedIntelMockup({ isActive }: { isActive: boolean }) {
  const [cycleProgress, setCycleProgress] = useState(0);
  const [nodeCount, setNodeCount] = useState(5);

  useFrame((state) => {
    if (!isActive) return;
    const cycleDuration = 9;
    setCycleProgress((state.clock.elapsedTime % cycleDuration) / cycleDuration);
  });

  useEffect(() => {
    // Increase node count as time progresses
    if (cycleProgress < 0.25) setNodeCount(5);
    else if (cycleProgress < 0.5) setNodeCount(12);
    else if (cycleProgress < 0.75) setNodeCount(20);
    else setNodeCount(30);
  }, [cycleProgress]);

  // Calendar grid
  const calendarDays = useMemo(() => {
    const days: { x: number; y: number; hasMeeting: boolean }[] = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 7; col++) {
        days.push({
          x: col * 0.5 - 1.5,
          y: -row * 0.5 + 0.75,
          hasMeeting: Math.random() > 0.7,
        });
      }
    }
    return days;
  }, []);

  // Dynamic graph nodes
  const graphNodes = useMemo(() => {
    const nodes: THREE.Vector3[] = [];
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2 + i * 0.2;
      const radius = 1.2 + (i % 4) * 0.4;
      nodes.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        (Math.random() - 0.5) * 2,
        Math.sin(angle) * radius * 0.5
      ));
    }
    return nodes;
  }, []);

  return (
    <group>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <pointLight position={[-5, 3, 3]} intensity={1} color="#ffffff" />
      <pointLight position={[5, 3, 3]} intensity={1} color="#00D9FF" />

      {/* Calendar (left side) */}
      <group position={[-4, 0, 0]}>
        <RoundedBox args={[4, 3, 0.1]} radius={0.1}>
          <meshStandardMaterial color="#1a1f2e" />
        </RoundedBox>

        {/* Calendar title */}
        <Text position={[0, 1.2, 0.06]} fontSize={0.2} color="#ffffff" anchorX="center">
          Calendar
        </Text>

        {/* Calendar days */}
        {calendarDays.map((day, i) => {
          const isHighlighted = day.hasMeeting && cycleProgress > i * 0.02;
          return (
            <mesh key={i} position={[day.x, day.y, 0.06]}>
              <boxGeometry args={[0.4, 0.4, 0.02]} />
              <meshStandardMaterial
                color={isHighlighted ? '#00D9FF' : '#333333'}
                emissive={isHighlighted ? '#00D9FF' : '#000000'}
                emissiveIntensity={isHighlighted ? 0.5 : 0}
              />
            </mesh>
          );
        })}

        {/* Date flip animation indicator */}
        {cycleProgress > 0.1 && (
          <Text
            position={[0, -1.2, 0.06]}
            fontSize={0.15}
            color="#94a3b8"
            anchorX="center"
          >
            {`Month ${Math.floor(cycleProgress * 4) + 1}`}
          </Text>
        )}
      </group>

      {/* Knowledge graph (right side) - grows over time */}
      <group position={[3, 0, 0]} rotation={[0, cycleProgress * 0.5, 0]}>
        {/* Graph nodes - show based on nodeCount */}
        {graphNodes.slice(0, nodeCount).map((pos, i) => (
          <mesh key={i} position={pos}>
            <sphereGeometry args={[0.1, 12, 12]} />
            <meshStandardMaterial
              color="#00D9FF"
              emissive="#00D9FF"
              emissiveIntensity={0.4}
            />
          </mesh>
        ))}

        {/* Graph edges */}
        {graphNodes.slice(0, nodeCount - 1).map((pos, i) => (
          <Line
            key={i}
            points={[pos, graphNodes[(i + 1) % nodeCount]]}
            color="#B829FF"
            lineWidth={0.5}
            transparent
            opacity={0.5}
          />
        ))}

        {/* Cross connections for density */}
        {nodeCount > 10 &&
          graphNodes.slice(0, Math.min(nodeCount, 15)).map((pos, i) => {
            if (i % 3 !== 0) return null;
            const target = (i + 5) % Math.min(nodeCount, 20);
            return (
              <Line
                key={`cross-${i}`}
                points={[pos, graphNodes[target]]}
                color="#B829FF"
                lineWidth={0.3}
                transparent
                opacity={0.3}
              />
            );
          })}
      </group>

      {/* Particle flow from calendar to graph */}
      {isActive && cycleProgress > 0.15 && (
        <ParticleStream
          start={new THREE.Vector3(-4, 0, 0)}
          end={new THREE.Vector3(3, 0, 0)}
          count={20}
          isActive={isActive}
        />
      )}
    </group>
  );
}

// ============================================
// Helper Components
// ============================================

// Flying particle between two points
function FlyingParticle({
  start,
  end,
  progress,
  color = '#00D9FF',
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  progress: number;
  color?: string;
}) {
  const pos = new THREE.Vector3().lerpVectors(start, end, progress);
  const arc = Math.sin(progress * Math.PI) * 1;
  pos.y += arc;

  return (
    <mesh position={pos}>
      <sphereGeometry args={[0.1, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={1 - progress * 0.5} />
    </mesh>
  );
}

// Aha moment spark effect
function AhaSparkEffect({ position }: { position: THREE.Vector3 }) {
  const particlesRef = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const pos = new Float32Array(30 * 3);
    for (let i = 0; i < 30; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.2;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
    }
    return pos;
  }, []);

  useFrame((state) => {
    if (!particlesRef.current) return;
    const time = state.clock.elapsedTime;
    const posArray = particlesRef.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < 30; i++) {
      const idx = i * 3;
      const angle = (i / 30) * Math.PI * 2 + time * 5;
      const r = 0.3 + Math.sin(time * 10 + i) * 0.2;
      posArray[idx] = Math.cos(angle) * r;
      posArray[idx + 1] = Math.sin(time * 8 + i * 0.5) * 0.3;
      posArray[idx + 2] = Math.sin(angle) * r;
    }
    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={particlesRef} position={position}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={30}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.1}
        color="#FFD700"
        transparent
        opacity={0.9}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// Continuous particle stream
function ParticleStream({
  start,
  end,
  count,
  isActive,
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  count: number;
  isActive: boolean;
}) {
  const particlesRef = useRef<THREE.Points>(null);

  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      vel[i] = i / count;
      const lerped = new THREE.Vector3().lerpVectors(start, end, vel[i]);
      pos[i * 3] = lerped.x;
      pos[i * 3 + 1] = lerped.y;
      pos[i * 3 + 2] = lerped.z;
    }

    return { positions: pos, velocities: vel };
  }, [start, end, count]);

  useFrame((_, delta) => {
    if (!particlesRef.current || !isActive) return;

    const posArray = particlesRef.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < count; i++) {
      velocities[i] += delta * 0.3;
      if (velocities[i] > 1) velocities[i] = 0;

      const t = velocities[i];
      const lerped = new THREE.Vector3().lerpVectors(start, end, t);
      const arc = Math.sin(t * Math.PI) * 0.5;

      posArray[i * 3] = lerped.x + (Math.random() - 0.5) * 0.1;
      posArray[i * 3 + 1] = lerped.y + arc;
      posArray[i * 3 + 2] = lerped.z + (Math.random() - 0.5) * 0.1;
    }

    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        color="#00D9FF"
        transparent
        opacity={isActive ? 0.7 : 0}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
