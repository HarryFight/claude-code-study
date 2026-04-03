import { build } from 'bun';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';

// Define build-time constants (MACRO.*)
const define = {
  'MACRO.VERSION': '"1.0.0"',
  'MACRO.BUILD_TIME': `"${new Date().toISOString()}"`,
  'MACRO.GIT_COMMIT': '"unknown"',
};

// Custom bun:bundle feature() shim
const bunBundleShim = `
// bun:bundle feature() shim
export function feature(name: string): boolean {
  return true;
}
`;

// React compiler runtime stub
const reactCompilerRuntimeShim = `
// React compiler runtime stub
export const c = (v) => v;
`;

async function main() {
  console.log('Building Claude Code...');

  // Clean dist directory
  try {
    await rm('dist', { recursive: true });
  } catch {
    // Directory doesn't exist, ignore
  }
  await mkdir('dist', { recursive: true });

  // Build CLI
  const result = await build({
    entrypoints: ['./src/entrypoints/cli.tsx'],
    outdir: './dist',
    target: 'node',
    format: 'esm',
    naming: 'cli.js',
    sourcemap: false,
    minify: false,
    define,
    external: [
      // Keep these as external dependencies
      '@anthropic-ai/sdk',
      '@commander-js/extra-typings',
      'chalk',
      'ink',
      'lodash-es',
      // Keep bun:bundle as external (will be shimmed)
      'bun:bundle',
    ],
    plugins: [
      {
        name: 'bun-bundle-shim',
        setup(build) {
          // Replace bun:bundle imports with our shim
          build.onResolve({ filter: /^bun:bundle$/ }, (args) => {
            return { path: 'bun:bundle', namespace: 'bun-bundle-shim' };
          });

          build.onLoad({ filter: /^bun:bundle$/, namespace: 'bun-bundle-shim' }, () => {
            return {
              contents: bunBundleShim,
              loader: 'js',
            };
          });
        },
      },
      {
        name: 'react-compiler-shim',
        setup(build) {
          // Replace react/compiler-runtime with stub
          build.onResolve({ filter: /^react\/compiler-runtime$/ }, (args) => {
            return { path: 'react/compiler-runtime', namespace: 'react-compiler-shim' };
          });

          build.onLoad({ filter: /^react\/compiler-runtime$/, namespace: 'react-compiler-shim' }, () => {
            return {
              contents: reactCompilerRuntimeShim,
              loader: 'js',
            };
          });
        },
      },
      {
        name: 'dts-loader',
        setup(build) {
          // Handle .d.ts imports as empty modules
          build.onResolve({ filter: /\.d\.ts$/ }, (args) => {
            return { path: args.path, namespace: 'dts-stub' };
          });

          build.onLoad({ filter: /\.d\.ts$/, namespace: 'dts-stub' }, () => {
            return {
              contents: '// TypeScript declaration file stub\nexport {};',
              loader: 'js',
            };
          });
        },
      },
      {
        name: 'text-loader',
        setup(build) {
          // Load .md and .txt files as text
          build.onLoad({ filter: /\.(md|txt)$/ }, async (args) => {
            const contents = await Bun.file(args.path).text();
            // Return as default export for compatibility with import statements
            return {
              contents: `export default ${JSON.stringify(contents)};`,
              loader: 'js',
            };
          });
        },
      },
    ],
  });

  if (result.success) {
    console.log('Build successful! Output: dist/cli.js');
    console.log('Run with: node dist/cli.js');
  } else {
    console.error('Build failed!');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Build error:', err);
  process.exit(1);
});
