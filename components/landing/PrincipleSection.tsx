import { useRef, useState, useEffect, Suspense, ComponentType } from 'react';
import { Canvas } from '@react-three/fiber';
import { motion } from 'framer-motion';
import { ContextFlowScene } from '../three/ContextFlowScene';
import { AugmentScene } from '../three/AugmentScene';
import { ChaosToOrderScene } from '../three/ChaosToOrderScene';

interface PrincipleSectionItemProps {
  headline: string;
  body: string;
  SceneComponent: ComponentType<{ isActive: boolean }>;
  visualPosition: 'left' | 'right';
  index: number;
}

function PrincipleSectionItem({
  headline,
  body,
  SceneComponent,
  visualPosition,
  index,
}: PrincipleSectionItemProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsActive(entry.isIntersecting && entry.intersectionRatio > 0.3);
      },
      { threshold: [0, 0.3, 0.5, 0.7, 1] }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const textContent = (
    <motion.div
      initial={{ opacity: 0, x: visualPosition === 'left' ? 30 : -30 }}
      whileInView={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay: 0.2 }}
      viewport={{ once: true }}
      className="space-y-6"
    >
      <h3 className="text-3xl md:text-4xl font-bold text-white leading-tight">
        {headline}
      </h3>
      <p className="text-lg md:text-xl text-slate-300 leading-relaxed">
        {body}
      </p>
    </motion.div>
  );

  const visualContent = (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8 }}
      viewport={{ once: true }}
      className="h-[400px] md:h-[500px] w-full rounded-xl overflow-hidden"
    >
      <Canvas camera={{ position: [0, 0, 10], fov: 50 }}>
        <color attach="background" args={['#0A0E1A']} />
        <Suspense fallback={null}>
          <SceneComponent isActive={isActive} />
        </Suspense>
      </Canvas>
    </motion.div>
  );

  return (
    <div
      ref={sectionRef}
      className={`grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center py-16 md:py-24 ${
        index > 0 ? 'border-t border-slate-800' : ''
      }`}
    >
      {visualPosition === 'left' ? (
        <>
          {visualContent}
          {textContent}
        </>
      ) : (
        <>
          {textContent}
          {visualContent}
        </>
      )}
    </div>
  );
}

// Principle data
const PRINCIPLES = [
  {
    headline: 'Tech giants have your data. Why don\'t you?',
    body: 'Google, Meta, and others analyze your behavior to sell ads. Synapse analyzes it to give you insights. Same data. Different purpose. Your purpose.',
    SceneComponent: ContextFlowScene,
    visualPosition: 'left' as const,
  },
  {
    headline: 'Your brain is built for creativity, not storage.',
    body: 'Human memory is fragile. Digital memory is infinite. Let Synapse remember, so you can focus on what humans do best: create, connect, and think critically.',
    SceneComponent: AugmentScene,
    visualPosition: 'right' as const,
  },
  {
    headline: 'Zero overhead. Maximum insight.',
    body: 'No tagging. No folder hierarchies. No "knowledge management systems" that become full-time jobs. Synapse structures your knowledge automatically, in the background, while you live your life.',
    SceneComponent: ChaosToOrderScene,
    visualPosition: 'left' as const,
  },
];

export function PrincipleSection() {
  return (
    <section className="relative bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 py-24">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 md:px-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16 md:mb-24"
        >
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
            Built on{' '}
            <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              First Principles
            </span>
          </h2>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto">
            Every design decision stems from a simple question: does this give
            users more control over their own intelligence?
          </p>
        </motion.div>

        {/* Principle items */}
        {PRINCIPLES.map((principle, index) => (
          <PrincipleSectionItem
            key={index}
            {...principle}
            index={index}
          />
        ))}
      </div>
    </section>
  );
}

// Individual principle exports for direct use
export { PRINCIPLES };
