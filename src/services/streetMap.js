const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { gunzipSync } = require('node:zlib');
const { SERVICE_AREAS } = require('../utils/serviceArea');

const GRID_SIZE = 0.025;
const MAX_VIEW_SIZE = 0.25;
const grid = new Map();
const cell = (value) => Math.floor(value / GRID_SIZE);
const overlaps = ([west, south, east, north], [left, bottom, right, top]) =>
  west <= right && east >= left && south <= top && north >= bottom;

function visitCells([west, south, east, north], visit) {
  for (let x = cell(west); x <= cell(east); x++) {
    for (let y = cell(south); y <= cell(north); y++) visit(`${x},${y}`);
  }
}

function loadStreetMap() {
  const path = join(__dirname, '../data/trechos-ibge.json.gz');
  for (const [name, points] of JSON.parse(gunzipSync(readFileSync(path)))) {
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const segment = { name, points, bounds };
    visitCells(bounds, (key) => {
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(segment);
    });
  }
}

function parseStreetBounds(value) {
  if (typeof value !== 'string') return null;
  const parts = value.split(',');
  if (parts.length !== 4 || parts.some((part) => !part.trim())) return null;
  const bounds = parts.map(Number);
  const [west, south, east, north] = bounds;
  if (!bounds.every(Number.isFinite) || west < -180 || east > 180 || south < -90 || north > 90
    || west >= east || south >= north || east - west > MAX_VIEW_SIZE || north - south > MAX_VIEW_SIZE) return null;
  return bounds;
}

function getStreetMap(bounds) {
  if (!SERVICE_AREAS.some(({ minLng, minLat, maxLng, maxLat }) =>
    overlaps(bounds, [minLng, minLat, maxLng, maxLat]))) return { type: 'FeatureCollection', features: [] };

  if (!grid.size) loadStreetMap();
  const seen = new Set();
  const streets = new Map();
  visitCells(bounds, (key) => {
    for (const segment of grid.get(key) || []) {
      if (seen.has(segment) || !overlaps(segment.bounds, bounds)) continue;
      seen.add(segment);
      if (!streets.has(segment.name)) streets.set(segment.name, []);
      streets.get(segment.name).push(segment.points);
    }
  });
  const features = Array.from(streets, ([nome, coordinates]) => ({
    type: 'Feature',
    properties: { nome },
    geometry: { type: 'MultiLineString', coordinates }
  }));
  return { type: 'FeatureCollection', features };
}

module.exports = { parseStreetBounds, getStreetMap };
