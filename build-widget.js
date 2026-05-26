// build-widget.js — Widget build script placeholder
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['widget/src/chat-widget.js'],
  bundle: true,
  outfile: 'widget/public/chat-widget.js',
  format: 'iife',
  minify: true
});

console.log('Widget built to widget/public/chat-widget.js');
