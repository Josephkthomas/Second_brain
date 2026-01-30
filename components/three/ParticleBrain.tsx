import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  generateBrainPositions,
  generateNebulaPositions,
  generateParticleColors,
  perlinDrift,
  easeInOutCubic,
} from '../../utils/particleHelpers';

interface ParticleBrainProps {
  particleCount?: number;
  enableRotation?: boolean;
  scrollProgress?: number; // 0-1 value passed from parent
}

export function ParticleBrain({
  particleCount = 5000,
  enableRotation = true,
  scrollProgress = 0,
}: ParticleBrainProps) {
  const pointsRef = useRef<THREE.Points>(null);

  // Generate positions
  const { nebulaPositions, brainPositions, colors, currentPositions } = useMemo(() => {
    const nebula = generateNebulaPositions(particleCount);
    const brain = generateBrainPositions(particleCount);
    const particleColors = generateParticleColors(particleCount);
    const current = new Float32Array(particleCount * 3);
    current.set(nebula);

    return {
      nebulaPositions: nebula,
      brainPositions: brain,
      colors: particleColors,
      currentPositions: current,
    };
  }, [particleCount]);

  useFrame((state) => {
    if (!pointsRef.current) return;

    const time = state.clock.elapsedTime;

    // Phase 1: Nebula floating (0% - 15% scroll)
    // Phase 2: Brain formation (15% - 50% scroll)
    // Phase 3: Formed brain with rotation (50%+ scroll)

    const positions = pointsRef.current.geometry.attributes.position
      .array as Float32Array;

    if (scrollProgress < 0.15) {
      // Nebula phase - gentle drift
      for (let i = 0; i < particleCount; i++) {
        const idx = i * 3;
        const drift = perlinDrift(
          nebulaPositions[idx],
          nebulaPositions[idx + 1],
          nebulaPositions[idx + 2],
          time
        );

        positions[idx] = nebulaPositions[idx] + drift.x * 2;
        positions[idx + 1] = nebulaPositions[idx + 1] + drift.y * 2;
        positions[idx + 2] = nebulaPositions[idx + 2] + drift.z * 2;
      }
    } else if (scrollProgress < 0.5) {
      // Brain formation phase
      const formationProgress = (scrollProgress - 0.15) / 0.35;
      const easedProgress = easeInOutCubic(Math.min(formationProgress, 1));

      for (let i = 0; i < particleCount; i++) {
        const idx = i * 3;

        // Add diminishing drift during formation
        const drift = perlinDrift(
          nebulaPositions[idx],
          nebulaPositions[idx + 1],
          nebulaPositions[idx + 2],
          time
        );
        const driftAmount = (1 - easedProgress) * 1.5;

        // Lerp from nebula to brain positions
        positions[idx] =
          nebulaPositions[idx] +
          (brainPositions[idx] - nebulaPositions[idx]) * easedProgress +
          drift.x * driftAmount;
        positions[idx + 1] =
          nebulaPositions[idx + 1] +
          (brainPositions[idx + 1] - nebulaPositions[idx + 1]) * easedProgress +
          drift.y * driftAmount;
        positions[idx + 2] =
          nebulaPositions[idx + 2] +
          (brainPositions[idx + 2] - nebulaPositions[idx + 2]) * easedProgress +
          drift.z * driftAmount;
      }
    } else {
      // Formed brain - subtle breathing
      const breathe = Math.sin(time * 0.5) * 0.015;

      for (let i = 0; i < particleCount; i++) {
        const idx = i * 3;
        positions[idx] = brainPositions[idx] * (1 + breathe);
        positions[idx + 1] = brainPositions[idx + 1] * (1 + breathe);
        positions[idx + 2] = brainPositions[idx + 2] * (1 + breathe);
      }
    }

    pointsRef.current.geometry.attributes.position.needsUpdate = true;

    // Brain rotation (starts at 30% scroll)
    if (enableRotation && scrollProgress >= 0.3) {
      const rotationSpeed = 0.12;
      pointsRef.current.rotation.y = time * rotationSpeed;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={currentPositions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={particleCount}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.1}
        vertexColors
        transparent
        opacity={0.85}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// Simplified version for CTA section background
export function ParticleBackground({ count = 2000 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, colors } = useMemo(() => {
    const pos = generateNebulaPositions(count);
    const col = generateParticleColors(count);
    return { positions: pos, colors: col };
  }, [count]);

  useFrame((state) => {
    if (!pointsRef.current) return;

    const time = state.clock.elapsedTime;
    const posArray = pointsRef.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      const drift = perlinDrift(
        positions[idx],
        positions[idx + 1],
        positions[idx + 2],
        time * 0.5
      );

      posArray[idx] = positions[idx] + drift.x * 1.5;
      posArray[idx + 1] = positions[idx + 1] + drift.y * 1.5;
      posArray[idx + 2] = positions[idx + 2] + drift.z * 1.5;
    }

    pointsRef.current.geometry.attributes.position.needsUpdate = true;
    pointsRef.current.rotation.y = time * 0.02;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={count}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        vertexColors
        transparent
        opacity={0.6}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}
