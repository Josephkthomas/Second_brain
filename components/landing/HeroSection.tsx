import { useRef, Suspense, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Preload } from '@react-three/drei';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';
import { ParticleBrain } from '../three/ParticleBrain';
import { ScrollIndicator } from './ScrollIndicator';
import { useGPUTier, useReducedMotion } from '../../hooks/useGPUTier';
import { easeInOutCubic } from '../../utils/particleHelpers';

// Stylized hands component that receives scroll progress
function StylizedHands({ scrollProgress }: { scrollProgress: number }) {
  const leftRef = useRef<THREE.Group>(null);
  const rightRef = useRef<THREE.Group>(null);

  // Hands appear after 25% scroll and fully visible at 60%
  const handProgress = Math.max(0, (scrollProgress - 0.25) / 0.35);
  const easedHandProgress = easeInOutCubic(Math.min(handProgress, 1));

  useFrame((state) => {
    if (!leftRef.current || !rightRef.current) return;

    const time = state.clock.elapsedTime;

    // Animate hands from far away to cupping position
    const startDistance = 15;
    const endDistance = 6;
    const currentDistance = startDistance - (startDistance - endDistance) * easedHandProgress;

    // Left hand
    leftRef.current.position.x = -currentDistance;
    leftRef.current.position.y = -0.5 + Math.sin(time * 0.5) * 0.15;
    leftRef.current.rotation.z = 0.5 * easedHandProgress;
    leftRef.current.rotation.y = 0.3 * easedHandProgress;

    // Right hand
    rightRef.current.position.x = currentDistance;
    rightRef.current.position.y = -0.5 + Math.sin(time * 0.5 + Math.PI) * 0.15;
    rightRef.current.rotation.z = -0.5 * easedHandProgress;
    rightRef.current.rotation.y = -0.3 * easedHandProgress;

    // Set visibility based on progress
    const shouldShow = scrollProgress > 0.2 && easedHandProgress > 0.01;
    leftRef.current.visible = shouldShow;
    rightRef.current.visible = shouldShow;
  });

  const handOpacity = easedHandProgress * 0.7;

  return (
    <>
      {/* Left hand */}
      <group ref={leftRef} position={[-15, -0.5, 0]} visible={false}>
        {/* Palm */}
        <mesh rotation={[0.3, 0.4, 0.5]}>
          <boxGeometry args={[1.5, 2, 0.4]} />
          <meshStandardMaterial
            color="#00D9FF"
            transparent
            opacity={handOpacity}
            emissive="#00D9FF"
            emissiveIntensity={0.4}
          />
        </mesh>
        {/* Fingers */}
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh
            key={i}
            position={[
              (i - 2) * 0.3,
              1.2 + (i === 2 ? 0.3 : i === 0 ? -0.4 : 0),
              0,
            ]}
            rotation={[0.3, 0, (i - 2) * 0.12]}
          >
            <capsuleGeometry args={[0.1, i === 0 ? 0.5 : 0.8, 4, 8]} />
            <meshStandardMaterial
              color="#B829FF"
              transparent
              opacity={handOpacity * 0.8}
              emissive="#B829FF"
              emissiveIntensity={0.3}
            />
          </mesh>
        ))}
      </group>

      {/* Right hand - mirrored */}
      <group ref={rightRef} position={[15, -0.5, 0]} visible={false}>
        <mesh rotation={[0.3, -0.4, -0.5]}>
          <boxGeometry args={[1.5, 2, 0.4]} />
          <meshStandardMaterial
            color="#00D9FF"
            transparent
            opacity={handOpacity}
            emissive="#00D9FF"
            emissiveIntensity={0.4}
          />
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh
            key={i}
            position={[
              -(i - 2) * 0.3,
              1.2 + (i === 2 ? 0.3 : i === 0 ? -0.4 : 0),
              0,
            ]}
            rotation={[0.3, 0, -(i - 2) * 0.12]}
          >
            <capsuleGeometry args={[0.1, i === 0 ? 0.5 : 0.8, 4, 8]} />
            <meshStandardMaterial
              color="#B829FF"
              transparent
              opacity={handOpacity * 0.8}
              emissive="#B829FF"
              emissiveIntensity={0.3}
            />
          </mesh>
        ))}
      </group>
    </>
  );
}

// 3D Scene component that receives scroll progress as prop
function HeroScene({
  particleCount,
  scrollProgress,
}: {
  particleCount: number;
  scrollProgress: number;
}) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={1} color="#ffffff" />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#00D9FF" />
      <pointLight position={[0, 0, 8]} intensity={0.4} color="#B829FF" />

      {/* Main particle brain - pass scroll progress */}
      <ParticleBrain
        particleCount={particleCount}
        enableRotation={true}
        scrollProgress={scrollProgress}
      />

      {/* Hands cupping the brain */}
      <StylizedHands scrollProgress={scrollProgress} />
    </>
  );
}

// Main Hero Section export
export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const { config, tier } = useGPUTier();
  const prefersReducedMotion = useReducedMotion();

  // Track scroll position using standard window scroll
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const sectionHeight = containerRef.current.offsetHeight;
      const viewportHeight = window.innerHeight;

      // Calculate progress: 0 at start, 1 when section ends
      const scrolled = -rect.top;
      const scrollableDistance = sectionHeight - viewportHeight;
      const progress = Math.max(0, Math.min(1, scrolled / scrollableDistance));

      setScrollProgress(progress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial calculation

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Reduced motion fallback
  if (prefersReducedMotion) {
    return (
      <section className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center px-8">
          <h1 className="text-7xl md:text-9xl font-bold">
            <span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              Synapse
            </span>
          </h1>
          <p className="mt-6 text-xl md:text-2xl text-slate-400 font-light">
            Your data. Your intelligence. Your control.
          </p>
        </div>
      </section>
    );
  }

  const showTitle = scrollProgress < 0.3;
  const showTagline = scrollProgress >= 0.5 && scrollProgress < 0.85;

  return (
    <section
      ref={containerRef}
      className="relative bg-slate-950"
      style={{ height: '200vh' }} // 2x viewport height for scroll room
    >
      {/* Sticky container for the 3D canvas */}
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <Canvas
          camera={{ position: [0, 0, 15], fov: 60 }}
          gl={{
            antialias: tier !== 'low',
            powerPreference: tier === 'high' ? 'high-performance' : 'default',
          }}
          dpr={[1, tier === 'high' ? 2 : 1.5]}
          style={{ width: '100%', height: '100%' }}
        >
          <color attach="background" args={['#050508']} />

          <Suspense fallback={null}>
            <HeroScene
              particleCount={config.particleCount}
              scrollProgress={scrollProgress}
            />
          </Suspense>

          <Preload all />
        </Canvas>

        {/* Text overlays - absolutely positioned over canvas */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <AnimatePresence mode="wait">
            {showTitle && (
              <motion.div
                key="title"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -30 }}
                transition={{ duration: 0.5 }}
                className="text-center"
              >
                <h1 className="text-7xl md:text-9xl font-bold tracking-tight">
                  <span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-lg">
                    Synapse
                  </span>
                </h1>
                <p className="mt-6 text-xl md:text-2xl text-slate-300 font-light">
                  Your data. Your intelligence. Your control.
                </p>
              </motion.div>
            )}

            {showTagline && (
              <motion.div
                key="tagline"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -30 }}
                transition={{ duration: 0.5 }}
                className="text-center max-w-4xl px-8"
              >
                <h2 className="text-4xl md:text-6xl font-bold text-white leading-tight">
                  The power of your knowledge
                  <br />
                  <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                    in your hands
                  </span>
                </h2>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Scroll indicator - only show at the very start */}
        <AnimatePresence>
          {scrollProgress < 0.05 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute bottom-8 left-1/2 -translate-x-1/2"
            >
              <ScrollIndicator visible={true} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

// Standalone hero canvas for embedding elsewhere
export function HeroCanvas({
  particleCount = 3000,
  className = '',
}: {
  particleCount?: number;
  className?: string;
}) {
  const { tier } = useGPUTier();

  return (
    <Canvas
      camera={{ position: [0, 0, 15], fov: 60 }}
      gl={{ antialias: tier !== 'low' }}
      className={className}
    >
      <color attach="background" args={['#050508']} />
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={1} />

      <Suspense fallback={null}>
        <ParticleBrain particleCount={particleCount} scrollProgress={0.5} />
      </Suspense>
    </Canvas>
  );
}
