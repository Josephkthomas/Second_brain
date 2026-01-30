import { useEffect, useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion } from '../hooks/useGPUTier';

// Lazy load heavy 3D sections for better initial load
const HeroSection = lazy(() =>
  import('../components/landing/HeroSection').then((m) => ({ default: m.HeroSection }))
);
const DataSourceCarousel = lazy(() =>
  import('../components/landing/DataSourceCarousel').then((m) => ({
    default: m.DataSourceCarousel,
  }))
);
const PrincipleSection = lazy(() =>
  import('../components/landing/PrincipleSection').then((m) => ({
    default: m.PrincipleSection,
  }))
);
const UseCaseSection = lazy(() =>
  import('../components/landing/UseCaseSection').then((m) => ({
    default: m.UseCaseSection,
  }))
);
const CTASection = lazy(() =>
  import('../components/landing/CTASection').then((m) => ({ default: m.CTASection }))
);

// Loading fallback
function SectionLoader({ height = 'min-h-screen' }: { height?: string }) {
  return (
    <div
      className={`${height} flex items-center justify-center bg-slate-950`}
    >
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    </div>
  );
}

// WebGL support check component
function WebGLNotSupported() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-8">
      <div className="text-center max-w-lg">
        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-10 h-10 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-4">
          3D Graphics Not Supported
        </h1>
        <p className="text-slate-400 mb-6">
          Your browser doesn't support WebGL, which is required for the
          immersive 3D experience. Please try upgrading to a modern browser like
          Chrome, Firefox, or Safari.
        </p>
        <a
          href="/login"
          className="inline-block px-6 py-3 bg-cyan-500 text-white font-semibold rounded-lg hover:bg-cyan-400 transition-colors"
        >
          Continue to Login
        </a>
      </div>
    </div>
  );
}

// Mobile/small screen warning
function MobileWarning({ onDismiss }: { onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-950 flex items-center justify-center px-8"
    >
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-10 h-10 text-cyan-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-4">
          Best Viewed on Desktop
        </h2>
        <p className="text-slate-400 mb-8">
          This immersive 3D experience is optimized for desktop screens. For the
          full experience, please visit on a larger screen.
        </p>
        <div className="flex flex-col gap-4">
          <button
            onClick={onDismiss}
            className="px-6 py-3 bg-cyan-500 text-white font-semibold rounded-lg hover:bg-cyan-400 transition-colors"
          >
            Continue Anyway
          </button>
          <a
            href="/login"
            className="px-6 py-3 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors"
          >
            Go to Login
          </a>
        </div>
      </div>
    </motion.div>
  );
}

// Reduced motion fallback - static version
function StaticLandingPage() {
  return (
    <div className="min-h-screen bg-slate-950">
      {/* Static Hero */}
      <section className="min-h-screen flex items-center justify-center px-8">
        <div className="text-center max-w-4xl">
          <h1 className="text-6xl md:text-8xl font-bold mb-6">
            <span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              Synapse
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-slate-400 mb-8">
            Your data. Your intelligence. Your control.
          </p>
          <a
            href="/register"
            className="inline-block px-10 py-4 bg-cyan-500 text-white text-lg font-semibold rounded-xl hover:bg-cyan-400 transition-colors"
          >
            Get Started
          </a>
        </div>
      </section>

      {/* Static content sections */}
      <section className="py-24 px-8 max-w-4xl mx-auto">
        <h2 className="text-4xl font-bold text-white mb-8 text-center">
          Connect Your Digital Universe
        </h2>
        <p className="text-lg text-slate-400 text-center mb-12">
          Every day, you create hundreds of data points across platforms. Synapse
          brings it all back to you.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {['YouTube', 'Slack', 'Notion', 'Gmail', 'Twitter', 'LinkedIn', 'Spotify', 'Drive'].map(
            (app) => (
              <div
                key={app}
                className="p-4 bg-slate-900 rounded-lg text-center text-slate-300"
              >
                {app}
              </div>
            )
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-8 text-center">
        <h2 className="text-4xl font-bold text-white mb-6">
          Ready to get started?
        </h2>
        <a
          href="/register"
          className="inline-block px-10 py-4 bg-cyan-500 text-white text-lg font-semibold rounded-xl hover:bg-cyan-400 transition-colors"
        >
          Start Free Now
        </a>
      </section>
    </div>
  );
}

// Main landing page component
export function LandingPage() {
  const [webGLSupported, setWebGLSupported] = useState(true);
  const [showMobileWarning, setShowMobileWarning] = useState(false);
  const [dismissedWarning, setDismissedWarning] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Check WebGL support
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl =
        canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      setWebGLSupported(!!gl);
      canvas.remove();
    } catch {
      setWebGLSupported(false);
    }
  }, []);

  // Check screen size
  useEffect(() => {
    const checkScreenSize = () => {
      const isSmallScreen = window.innerWidth < 1024;
      setShowMobileWarning(isSmallScreen && !dismissedWarning);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, [dismissedWarning]);

  // WebGL not supported
  if (!webGLSupported) {
    return <WebGLNotSupported />;
  }

  // Reduced motion preference - show static version
  if (prefersReducedMotion) {
    return <StaticLandingPage />;
  }

  return (
    <div className="relative bg-slate-950">
      {/* Mobile warning overlay */}
      <AnimatePresence>
        {showMobileWarning && (
          <MobileWarning onDismiss={() => setDismissedWarning(true)} />
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className={showMobileWarning ? 'hidden' : ''}>
        {/* Hero Section with 3D particle brain */}
        <Suspense fallback={<SectionLoader />}>
          <HeroSection />
        </Suspense>

        {/* Data Source Carousel */}
        <Suspense fallback={<SectionLoader height="min-h-[800px]" />}>
          <DataSourceCarousel />
        </Suspense>

        {/* Principles Section */}
        <Suspense fallback={<SectionLoader />}>
          <PrincipleSection />
        </Suspense>

        {/* Use Cases Section */}
        <Suspense fallback={<SectionLoader />}>
          <UseCaseSection />
        </Suspense>

        {/* CTA Section */}
        <Suspense fallback={<SectionLoader />}>
          <CTASection />
        </Suspense>
      </main>

      {/* Scroll progress indicator (optional) */}
      <ScrollProgressIndicator />
    </div>
  );
}

// Scroll progress indicator
function ScrollProgressIndicator() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight - windowHeight;
      const scrolled = window.scrollY;
      setProgress((scrolled / documentHeight) * 100);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 h-1 z-50 bg-slate-900/50">
      <motion.div
        className="h-full bg-gradient-to-r from-cyan-400 to-purple-400"
        style={{ width: `${progress}%` }}
        transition={{ duration: 0.1 }}
      />
    </div>
  );
}

export default LandingPage;
