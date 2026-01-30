import { motion } from 'framer-motion';

interface ScrollIndicatorProps {
  visible?: boolean;
}

export function ScrollIndicator({ visible = true }: ScrollIndicatorProps) {
  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.5, delay: 1 }}
      className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-10"
    >
      <motion.span
        className="text-slate-400 text-sm tracking-widest uppercase"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        Scroll to explore
      </motion.span>

      {/* Animated arrow */}
      <motion.div
        className="relative w-6 h-10"
        animate={{ y: [0, 4, 0] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Mouse outline */}
        <div className="w-6 h-10 rounded-full border-2 border-cyan-400/60 flex justify-center pt-2">
          {/* Scroll wheel */}
          <motion.div
            className="w-1 h-2 bg-cyan-400 rounded-full"
            animate={{ y: [0, 4, 0], opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </motion.div>

      {/* Down arrows */}
      <div className="flex flex-col items-center gap-0.5">
        <motion.svg
          width="16"
          height="8"
          viewBox="0 0 16 8"
          fill="none"
          className="text-cyan-400"
          animate={{ y: [0, 2, 0], opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0 }}
        >
          <path
            d="M1 1L8 7L15 1"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
        <motion.svg
          width="16"
          height="8"
          viewBox="0 0 16 8"
          fill="none"
          className="text-cyan-400"
          animate={{ y: [0, 2, 0], opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: 0.15 }}
        >
          <path
            d="M1 1L8 7L15 1"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.svg>
      </div>
    </motion.div>
  );
}

// Alternative minimal scroll indicator
export function ScrollIndicatorMinimal({ visible = true }: ScrollIndicatorProps) {
  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
    >
      <motion.div
        className="w-px h-16 bg-gradient-to-b from-transparent via-cyan-400 to-transparent"
        animate={{ scaleY: [0.5, 1, 0.5], opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.div>
  );
}
