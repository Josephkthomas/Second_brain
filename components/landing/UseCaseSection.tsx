import { useRef, useState, useEffect, Suspense, ComponentType } from 'react';
import { Canvas } from '@react-three/fiber';
import { motion } from 'framer-motion';
import {
  MeetingIntelMockup,
  SerendipityMockup,
  TeamHubMockup,
  IntegratedIntelMockup,
} from '../three/UseCaseMockups';

interface UseCaseItemProps {
  story: string;
  solution: string;
  highlightedPhrase: string;
  SceneComponent: ComponentType<{ isActive: boolean }>;
  visualPosition: 'left' | 'right';
  index: number;
}

function UseCaseItem({
  story,
  solution,
  highlightedPhrase,
  SceneComponent,
  visualPosition,
  index,
}: UseCaseItemProps) {
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

  // Parse solution to highlight the phrase
  const renderSolution = () => {
    const parts = solution.split(highlightedPhrase);
    if (parts.length === 1) return solution;

    return (
      <>
        {parts[0]}
        <span className="text-purple-400 font-semibold">{highlightedPhrase}</span>
        {parts[1]}
      </>
    );
  };

  const textContent = (
    <motion.div
      initial={{ opacity: 0, x: visualPosition === 'left' ? 30 : -30 }}
      whileInView={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, delay: 0.2 }}
      viewport={{ once: true }}
      className="space-y-6"
    >
      {/* Story (problem statement) */}
      <p className="text-xl md:text-2xl text-cyan-400 font-medium italic">
        "{story}"
      </p>

      {/* Solution */}
      <p className="text-lg md:text-xl text-slate-300 leading-relaxed">
        {renderSolution()}
      </p>
    </motion.div>
  );

  const visualContent = (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8 }}
      viewport={{ once: true }}
      className="h-[350px] md:h-[450px] w-full rounded-xl overflow-hidden bg-slate-900/50 border border-slate-800"
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
      className={`grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center py-12 md:py-20 ${
        index > 0 ? 'border-t border-slate-800/50' : ''
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

// Use case data
const USE_CASES = [
  {
    story: "You're in back-to-back meetings. Action items pile up. Context gets lost.",
    solution:
      'Synapse attends every meeting. Decisions become searchable knowledge. Action items link to the right projects. Nothing falls through the cracks.',
    highlightedPhrase: 'Nothing falls through the cracks',
    SceneComponent: MeetingIntelMockup,
    visualPosition: 'left' as const,
  },
  {
    story: 'Remember that article you read 6 months ago? Synapse does.',
    solution:
      'Ask your knowledge graph anything. Discover connections you didn\'t know existed. Let serendipity become systematic.',
    highlightedPhrase: 'serendipity become systematic',
    SceneComponent: SerendipityMockup,
    visualPosition: 'right' as const,
  },
  {
    story: "Your team's collective brain, always learning.",
    solution:
      'Stop losing knowledge when people leave. Build a living, shared intelligence that grows with every contribution.',
    highlightedPhrase: 'living, shared intelligence',
    SceneComponent: TeamHubMockup,
    visualPosition: 'left' as const,
  },
  {
    story: 'Every approved meeting feeds the collective brain.',
    solution:
      'Turn recurring meetings into compounding knowledge. Watch your team\'s intelligence grow with every conversation.',
    highlightedPhrase: 'compounding knowledge',
    SceneComponent: IntegratedIntelMockup,
    visualPosition: 'right' as const,
  },
];

export function UseCaseSection() {
  return (
    <section className="relative bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 py-20 md:py-32">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/3 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-500/3 rounded-full blur-3xl" />
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
            See It{' '}
            <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              In Action
            </span>
          </h2>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto">
            Real scenarios. Real intelligence. Real results.
          </p>
        </motion.div>

        {/* Use case items */}
        {USE_CASES.map((useCase, index) => (
          <UseCaseItem key={index} {...useCase} index={index} />
        ))}
      </div>
    </section>
  );
}

// Export use cases for direct use
export { USE_CASES };
