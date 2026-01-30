import * as esbuild from 'esbuild';
import { cp } from 'fs/promises';
import { existsSync } from 'fs';

const isWatch = process.argv.includes('--watch');

const commonConfig = {
  bundle: true,
  minify: !isWatch,
  sourcemap: isWatch,
  target: ['chrome100'],
  define: {
    'process.env.NODE_ENV': isWatch ? '"development"' : '"production"'
  },
  logLevel: 'info'
};

// Build popup (React) - CSS is bundled inline
const popupBuild = esbuild.build({
  ...commonConfig,
  entryPoints: ['src/popup/index.tsx'],
  outfile: 'dist/popup.js',
  loader: { '.tsx': 'tsx', '.ts': 'ts', '.css': 'css' },
});

// Build CSS separately for the popup.html link
const cssBuild = esbuild.build({
  ...commonConfig,
  entryPoints: ['src/styles/popup.css'],
  outfile: 'dist/popup.css',
});

// Build YouTube content script
const youtubeBuild = esbuild.build({
  ...commonConfig,
  entryPoints: ['src/content/youtube.ts'],
  outfile: 'dist/content-youtube.js',
});

// Build article content script
const articleBuild = esbuild.build({
  ...commonConfig,
  entryPoints: ['src/content/article.ts'],
  outfile: 'dist/content-article.js',
});

// Build background service worker
const backgroundBuild = esbuild.build({
  ...commonConfig,
  entryPoints: ['src/background/service-worker.ts'],
  outfile: 'dist/background.js',
  format: 'esm',
});

// Run all builds
await Promise.all([popupBuild, cssBuild, youtubeBuild, articleBuild, backgroundBuild]);

// Copy static files to dist
await cp('public/popup.html', 'dist/popup.html');
await cp('manifest.json', 'dist/manifest.json');

// Copy icons if they exist
if (existsSync('public/icons')) {
  await cp('public/icons', 'dist/icons', { recursive: true });
}

console.log('Build complete!');

if (isWatch) {
  console.log('Watching for changes...');
}
