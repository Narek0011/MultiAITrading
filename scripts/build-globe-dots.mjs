// Builds public/data/globe-dots.json: [lon, lat] points on land for the website globe.
// Run after changing STEP: npm run globe:dots
import { geoContains } from 'd3-geo';
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { feature } from 'topojson-client';

const STEP = 1.6; // degrees between dots
const require = createRequire(import.meta.url);
const world = JSON.parse(readFileSync(require.resolve('world-atlas/land-110m.json'), 'utf8'));
const land = feature(world, world.objects.land);

const dots = [];
for (let lat = -58; lat <= 78; lat += STEP) {
  // Fewer dots towards the poles so they stay evenly spaced on the sphere.
  const step = STEP / Math.max(0.25, Math.cos((lat * Math.PI) / 180));
  for (let lon = -180; lon < 180; lon += step) {
    if (geoContains(land, [lon, lat])) dots.push([Math.round(lon * 10) / 10, Math.round(lat * 10) / 10]);
  }
}
writeFileSync(new URL('../public/data/globe-dots.json', import.meta.url), JSON.stringify(dots));
console.log(`${dots.length} land dots written`);
