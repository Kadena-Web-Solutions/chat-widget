import * as esbuild from 'esbuild';

const result = await esbuild.build({
  entryPoints: ['widget/src/chat-widget.js'],
  bundle: true,
  outfile: 'widget/public/chat-widget.js',
  format: 'iife',
  minify: true,
  target: ['es2020'],
  legalComments: 'none',
  treeShaking: true,
});

console.log('Widget built to widget/public/chat-widget.js');

const fs = await import('fs');
const stats = fs.statSync('widget/public/chat-widget.js');
const { gzipSync } = await import('zlib');
const gzSize = gzipSync(fs.readFileSync('widget/public/chat-widget.js')).length;
console.log(`Bundle size: ${(stats.size / 1024).toFixed(1)}KB raw, ${(gzSize / 1024).toFixed(1)}KB gzipped`);
