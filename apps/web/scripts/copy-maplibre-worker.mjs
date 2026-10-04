// Copies MapLibre's web worker (an ES module) and the shared chunk it imports into
// public/maplibre/<version>/. MapLibre resolves its worker relative to the bundle at
// runtime, which a bundled Next.js chunk cannot serve; the map points to this copy
// with setWorkerUrl() (components/map/operations-map.tsx). Runs before dev and build.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const pkgPath = require.resolve('maplibre-gl/package.json');
const { version } = JSON.parse(readFileSync(pkgPath, 'utf8'));
const dist = path.join(path.dirname(pkgPath), 'dist');
const target = path.join(import.meta.dirname, '..', 'public', 'maplibre', version);
mkdirSync(target, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(path.join(dist, file), path.join(target, file));
}
console.log(`maplibre-gl ${version} worker → public/maplibre/${version}/`);
