import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { motion } from 'framer-motion';
import { ParticleBackground } from '../three/ParticleBrain';
import { useGPUTier } from '../../hooks/useGPUTier';

interface CTASectionProps {
  onSignUp?: () => void;
  onContact?: () => void;
}

// Contact modal component
function ContactModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production, this would send to a backend
    console.log('Contact form submitted:', { email, message });
    setSubmitted(true);
    setTimeout(() => {
      onClose();
      setSubmitted(false);
      setEmail('');
      setMessage('');
    }, 2000);
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {submitted ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-cyan-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Message Sent!</h3>
            <p className="text-slate-400">We'll get back to you soon.</p>
          </div>
        ) : (
          <>
            <h3 className="text-2xl font-bold text-white mb-2">Get in Touch</h3>
            <p className="text-slate-400 mb-6">
              Questions? Feedback? We'd love to hear from you.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-2">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  rows={4}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
                  placeholder="Your message..."
                />
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-6 py-3 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-cyan-500 text-white font-semibold rounded-lg hover:bg-cyan-400 transition-colors"
                >
                  Send
                </button>
              </div>
            </form>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

export function CTASection({ onSignUp, onContact }: CTASectionProps) {
  const { config } = useGPUTier();
  const [showContactModal, setShowContactModal] = useState(false);

  const handleSignUp = () => {
    if (onSignUp) {
      onSignUp();
    } else {
      // Default: navigate to register page
      window.location.href = '/register';
    }
  };

  const handleContact = () => {
    if (onContact) {
      onContact();
    } else {
      setShowContactModal(true);
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* 3D Particle Background */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 15], fov: 60 }}>
          <color attach="background" args={['#0A0E1A']} />
          <Suspense fallback={null}>
            <ParticleBackground count={config.particleCount} />
          </Suspense>
        </Canvas>
      </div>

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/50 via-transparent to-slate-950/80 z-10" />

      {/* Content */}
      <div className="relative z-20 max-w-4xl mx-auto px-6 md:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="space-y-8"
        >
          {/* Headline */}
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
            Ready to reclaim your{' '}
            <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              digital intelligence
            </span>
            ?
          </h2>

          {/* Subheading */}
          <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto">
            Synapse is free during beta. We're building this with early users, not
            for investors. Your feedback shapes the product.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSignUp}
              className="px-10 py-4 bg-cyan-500 text-white text-lg font-semibold rounded-xl shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 hover:bg-cyan-400 transition-all"
            >
              Start Free Now
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleContact}
              className="px-10 py-4 border-2 border-cyan-500 text-cyan-400 text-lg font-semibold rounded-xl hover:bg-cyan-500/10 transition-all"
            >
              Get in Touch
            </motion.button>
          </div>

          {/* Trust signals */}
          <div className="space-y-3 pt-6">
            <p className="text-slate-400 text-sm">
              No credit card. No data lock-in. Cancel anytime.
            </p>
            <p className="text-slate-500 text-sm">
              Built with privacy first. Your data never trains our models.
            </p>
          </div>
        </motion.div>

        {/* Footer links */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
          className="mt-20 pt-8 border-t border-slate-800"
        >
          <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-500">
            <a href="#" className="hover:text-slate-300 transition-colors">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-slate-300 transition-colors">
              Terms of Service
            </a>
            <a href="#" className="hover:text-slate-300 transition-colors">
              About
            </a>
            <a href="#" className="hover:text-slate-300 transition-colors">
              Careers
            </a>
          </div>
          <p className="mt-6 text-slate-600 text-xs">
            © {new Date().getFullYear()} Synapse. All rights reserved.
          </p>
        </motion.div>
      </div>

      {/* Contact Modal */}
      <ContactModal
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
      />
    </section>
  );
}
