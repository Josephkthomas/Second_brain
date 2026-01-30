import * as THREE from 'three';

// Generate brain-like vertex positions using superquadric equations
export function generateBrainPositions(particleCount: number): Float32Array {
  const positions = new Float32Array(particleCount * 3);

  // Brain dimensions (asymmetric for realism)
  const scaleX = 3.0;  // Width
  const scaleY = 2.8;  // Height
  const scaleZ = 3.5;  // Depth (front-to-back)

  for (let i = 0; i < particleCount; i++) {
    const idx = i * 3;

    // Use fibonacci sphere for even distribution
    const phi = Math.acos(1 - 2 * (i + 0.5) / particleCount);
    const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);

    // Base spherical coordinates
    let x = Math.sin(phi) * Math.cos(theta);
    let y = Math.cos(phi);
    let z = Math.sin(phi) * Math.sin(theta);

    // Apply brain-like deformation
    // Central sulcus (groove down the middle)
    const centralSulcus = Math.abs(z) < 0.15 ? 0.85 : 1.0;

    // Frontal lobe bulge
    const frontalBulge = z > 0.3 ? 1 + 0.2 * Math.pow(z - 0.3, 2) : 1.0;

    // Temporal lobe widening at sides
    const temporalWide = y < -0.2 ? 1 + 0.15 * Math.abs(y + 0.2) : 1.0;

    // Occipital lobe (back) slight narrowing
    const occipitalNarrow = z < -0.4 ? 1 - 0.1 * Math.abs(z + 0.4) : 1.0;

    // Apply deformations
    x *= centralSulcus * temporalWide * scaleX;
    y *= scaleY;
    z *= frontalBulge * occipitalNarrow * scaleZ;

    // Add surface detail variation (gyri and sulci effect)
    const noiseScale = 0.15;
    const noise = simplex3D(x * 2, y * 2, z * 2) * noiseScale;
    const radiusMultiplier = 1 + noise;

    positions[idx] = x * radiusMultiplier;
    positions[idx + 1] = y * radiusMultiplier;
    positions[idx + 2] = z * radiusMultiplier;
  }

  return positions;
}

// Generate initial nebula (scattered) positions
export function generateNebulaPositions(particleCount: number): Float32Array {
  const positions = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i++) {
    const idx = i * 3;

    // Random spherical distribution with varying radius
    const radius = 8 + Math.random() * 12; // 8-20 units
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;

    positions[idx] = radius * Math.sin(phi) * Math.cos(theta);
    positions[idx + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[idx + 2] = radius * Math.cos(phi);
  }

  return positions;
}

// Simplex-like noise function (simplified 3D)
function simplex3D(x: number, y: number, z: number): number {
  // Simple pseudo-noise based on sine combinations
  const n1 = Math.sin(x * 1.7 + y * 2.3 + z * 1.5);
  const n2 = Math.sin(x * 3.1 - y * 1.9 + z * 2.7);
  const n3 = Math.sin(x * 2.5 + y * 3.7 - z * 1.3);
  return (n1 + n2 + n3) / 3;
}

// Perlin-like noise for particle drift animation
export function perlinDrift(x: number, y: number, z: number, time: number): THREE.Vector3 {
  const scale = 0.5;
  const speed = 0.3;

  const dx = Math.sin(x * scale + time * speed) * Math.cos(y * scale * 1.3 + time * speed * 0.7);
  const dy = Math.sin(y * scale * 1.1 + time * speed * 0.9) * Math.cos(z * scale + time * speed * 1.2);
  const dz = Math.sin(z * scale * 0.9 + time * speed * 1.1) * Math.cos(x * scale * 1.2 + time * speed * 0.8);

  return new THREE.Vector3(dx, dy, dz);
}

// Smooth interpolation (ease in-out cubic)
export function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Lerp between two Float32Arrays
export function lerpPositions(
  from: Float32Array,
  to: Float32Array,
  progress: number,
  output: Float32Array
): void {
  const easedProgress = easeInOutCubic(progress);

  for (let i = 0; i < from.length; i++) {
    output[i] = from[i] + (to[i] - from[i]) * easedProgress;
  }
}

// Generate particle colors with gradient
export function generateParticleColors(
  particleCount: number,
  colorA: THREE.Color = new THREE.Color('#00D9FF'),
  colorB: THREE.Color = new THREE.Color('#B829FF')
): Float32Array {
  const colors = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i++) {
    const idx = i * 3;
    const t = Math.random(); // Random gradient position per particle

    const color = new THREE.Color().lerpColors(colorA, colorB, t);
    colors[idx] = color.r;
    colors[idx + 1] = color.g;
    colors[idx + 2] = color.b;
  }

  return colors;
}

// Generate particle sizes with variation
export function generateParticleSizes(
  particleCount: number,
  baseSize: number = 0.05,
  variation: number = 0.03
): Float32Array {
  const sizes = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    sizes[i] = baseSize + (Math.random() - 0.5) * variation;
  }

  return sizes;
}

// Generate hand cupping positions (two arcs)
export function generateHandPositions(brainRadius: number = 3.5): {
  leftHand: THREE.Vector3;
  rightHand: THREE.Vector3;
  leftRotation: THREE.Euler;
  rightRotation: THREE.Euler;
} {
  const distance = brainRadius * 1.5;

  return {
    leftHand: new THREE.Vector3(-distance, -1, 0),
    rightHand: new THREE.Vector3(distance, -1, 0),
    leftRotation: new THREE.Euler(0, Math.PI / 6, Math.PI / 4),
    rightRotation: new THREE.Euler(0, -Math.PI / 6, -Math.PI / 4),
  };
}

// Graph node positions for knowledge graph visualization
export function generateGraphPositions(nodeCount: number, radius: number = 5): Float32Array {
  const positions = new Float32Array(nodeCount * 3);

  for (let i = 0; i < nodeCount; i++) {
    const idx = i * 3;

    // Use golden angle for even distribution
    const theta = i * 2.399963; // Golden angle in radians
    const r = Math.sqrt(i / nodeCount) * radius;
    const y = (Math.random() - 0.5) * radius * 0.5;

    positions[idx] = r * Math.cos(theta);
    positions[idx + 1] = y;
    positions[idx + 2] = r * Math.sin(theta);
  }

  return positions;
}

// Generate edge connections between nodes
export function generateGraphEdges(
  nodeCount: number,
  connectionDensity: number = 0.3
): Array<[number, number]> {
  const edges: Array<[number, number]> = [];

  for (let i = 0; i < nodeCount; i++) {
    // Connect to 1-3 other nodes
    const connectionCount = Math.floor(Math.random() * 3) + 1;

    for (let j = 0; j < connectionCount; j++) {
      if (Math.random() < connectionDensity) {
        const target = Math.floor(Math.random() * nodeCount);
        if (target !== i) {
          edges.push([i, target]);
        }
      }
    }
  }

  return edges;
}

// Calculate positions along a spiral path (for data flow animations)
export function spiralPath(
  t: number, // 0 to 1
  startRadius: number,
  endRadius: number,
  height: number,
  rotations: number = 2
): THREE.Vector3 {
  const radius = startRadius + (endRadius - startRadius) * t;
  const angle = t * Math.PI * 2 * rotations;
  const y = height * (1 - t);

  return new THREE.Vector3(
    radius * Math.cos(angle),
    y,
    radius * Math.sin(angle)
  );
}
