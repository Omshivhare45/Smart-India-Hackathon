import type { StyleSpecification, ExpressionSpecification } from 'maplibre-gl';

/* ────────────────────────────────────────────────────────────────────────
   RAILBUDDY "Operations Dark" basemap style.
   ------------------------------------------------------------------------
   A geographically-rich but dark/muted railway operations basemap built on
   the OpenFreeMap vector tile schema (source: https://tiles.openfreemap.org).

   Visual hierarchy (top tool-authorising live layer stays the brightest):
     1. geographic context   — land clearly lighter than ocean, shaded relief,
                               muted terrain bands, country/state boundaries,
                               faint arterial roads, restrained city labels
     2. railway network      — zoom-scaffolded steel hierarchy that is
                               clearly distinguishable from (and brighter
                               than) roads
     3. live trains / clusters / selection  — added programmatically on top

   Land reads warmer/lighter than the deep cool ocean so the subcontinent
   silhouette is legible from the first frame; nothing else fights the
   railway data. The palette is deliberately restrained (charcoal + slate +
   steel), with a single cool accent reserved for selected-train / RailBuddy
   ETA.
   ──────────────────────────────────────────────────────────────────────── */

const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const FONT_REG: string[] = ['Noto Sans Regular'];
const FONT_BOLD: string[] = ['Noto Sans Bold'];
const FONT_ITALIC: string[] = ['Noto Sans Italic'];

// Land base — the whole continental surface; LIGHTER than the ocean so coast
// lines/state shapes read instantly even at India zoom.
const LAND = '#161D26';

const RAIL_CORE = '#6E849B'; // steel grey — detailed rail (brighter than roads)
const RAIL_REGIONAL = '#5A6E84';
const RAIL_NATIONAL = '#4A5B6E';
const RAIL_SERVICE = '#42515F';
const RAIL_CASING = '#0B1018';

const CITY_TXT = '#BCC8D4';
const CITY_TXT_SUB = '#98A7B7';
const TOWN_TXT = '#76838F';
const STATE_TXT = '#7E8DA1';
const COUNTRY_TXT = '#A6B4C2';
const WATER_TXT = '#7C91A4';
// Address Plate halo matching the land tone (dark, not pure black blocks).
const HALO = '#0E131B';

/** Compact aliases so the scatter of `source-layer` fields stays readable. */
const OMT = 'openmaptiles';

const POINT: ExpressionSpecification = ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false];

export const RAILBUDDY_MAP_STYLE: StyleSpecification = {
  version: 8,
  name: 'RailBuddy — Operations Dark',
  sources: {
    [OMT]: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
    },
    ne2_shaded: {
      type: 'raster',
      tileSize: 256,
      maxzoom: 6,
      tiles: ['https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png'],
    },
  },
  glyphs: GLYPHS,
  layers: [
    // ── Ground ────────────────────────────────────────────────
    // Land surface: noticeably lighter than the ocean, cool charcoal-slate
    // so the geographic skin reads without ever going "navigation app".
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': LAND },
    },

    // Shaded relief — terrain texture at India/regional zoom. On land only
    // (the water layer is drawn above it), fades out before high zoom.
    {
      id: 'relief',
      type: 'raster',
      source: 'ne2_shaded',
      minzoom: 0,
      maxzoom: 6,
      paint: {
        'raster-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.24, 2, 0.3, 5, 0.16, 6, 0.0],
        'raster-saturation': -0.85,
        'raster-brightness-min': 0.48,
        'raster-brightness-max': 0.72,
        'raster-contrast': -0.25,
      },
    },

    // Landcover — broad terrain bands (Western Ghats, NE hills, Thar) at low
    // zoom, detailed envelopes at high zoom. Never louder than railway data.
    {
      id: 'landcover-sand',
      type: 'fill',
      source: OMT,
      'source-layer': 'landcover',
      minzoom: 4,
      filter: ['==', ['get', 'class'], 'sand'],
      paint: { 'fill-color': '#201F18', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.3, 8, 0.18] },
    },
    {
      id: 'landcover-wood',
      type: 'fill',
      source: OMT,
      'source-layer': 'landcover',
      minzoom: 5,
      filter: ['all', ['==', ['get', 'class'], 'wood'], ['!=', ['get', 'subclass'], 'wetland']],
      paint: { 'fill-color': '#12201A', 'fill-opacity': 0.5 },
    },
    {
      id: 'landcover-grass',
      type: 'fill',
      source: OMT,
      'source-layer': 'landcover',
      minzoom: 8,
      filter: ['==', ['get', 'class'], 'grass'],
      paint: { 'fill-color': '#151C1C', 'fill-opacity': 0.42 },
    },
    {
      id: 'landuse-park',
      type: 'fill',
      source: OMT,
      'source-layer': 'park',
      minzoom: 10,
      filter: ['==', ['get', 'class'], 'park'],
      paint: { 'fill-color': '#131D18', 'fill-opacity': 0.55 },
    },

    // ── Water — deep cool ocean clearly darker than land; rivers readable ──
    {
      id: 'water',
      type: 'fill',
      source: OMT,
      'source-layer': 'water',
      filter: ['all', ['!=', ['get', 'brunnel'], 'tunnel']],
      paint: {
        'fill-color': ['interpolate', ['linear'], ['zoom'], 0, '#0A111C', 6, '#0C1622', 12, '#0E1B29'],
        'fill-antialias': true,
      },
    },
    {
      id: 'waterway',
      type: 'line',
      source: OMT,
      'source-layer': 'waterway',
      minzoom: 4,
      filter: ['all', ['!=', ['get', 'brunnel'], 'tunnel'], ['!=', ['get', 'class'], 'canal']],
      paint: {
        'line-color': '#264050',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 9, 1.1, 12, 2.0],
        'line-opacity': 0.85,
      },
    },

    // ── Boundaries — state subtle, national border clearly readable ──
    {
      id: 'boundary-state',
      type: 'line',
      source: OMT,
      'source-layer': 'boundary',
      minzoom: 3.2,
      filter: ['==', ['get', 'admin_level'], 4],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#45566E',
        'line-dasharray': [3, 3.5],
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.7, 8, 1.4],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.3, 7, 0.45],
      },
    },
    {
      id: 'boundary-country',
      type: 'line',
      source: OMT,
      'source-layer': 'boundary',
      filter: ['==', ['get', 'admin_level'], 2],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#A3B4C8',
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.4, 8, 2.4],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 6, 0.75],
        'line-blur': 0.5,
      },
    },

    // ── Roads — faint warm-grey urban grid, purely for orientation.
    //    Kept dimmer than every rail style so tracks stay the hero. ──
    {
      id: 'road-motorway',
      type: 'line',
      source: OMT,
      'source-layer': 'transportation',
      minzoom: 4,
      filter: ['all', ['==', ['get', 'class'], 'motorway'], ['!=', ['get', 'brunnel'], 'tunnel']],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#2C3845',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.7, 10, 2.6, 14, 4.6],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 10, 0.5],
      },
    },
    {
      id: 'road-trunk-primary',
      type: 'line',
      source: OMT,
      'source-layer': 'transportation',
      minzoom: 5,
      filter: [
        'all',
        ['match', ['get', 'class'], ['trunk', 'primary'], true, false],
        ['!=', ['get', 'brunnel'], 'tunnel'],
      ],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#26313D',
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 10, 1.9, 13, 3.2],
        'line-opacity': 0.6,
      },
    },
    {
      id: 'road-secondary',
      type: 'line',
      source: OMT,
      'source-layer': 'transportation',
      minzoom: 7,
      filter: ['all', ['==', ['get', 'class'], 'secondary'], ['!=', ['get', 'brunnel'], 'tunnel']],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#202A34',
        'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.5, 12, 1.7],
        'line-opacity': 0.55,
      },
    },

    // ── RAILWAY NETWORK — zoom-scaffolded steel hierarchy ─────────────
    // Casing sits under every rail style so lines read as hatching, not glow.
    // Roads stay dimmer than every rail style so tracks remain the hero.
    {
      id: 'rail-casing',
      type: 'line',
      source: OMT,
      'source-layer': 'transportation',
      minzoom: 7,
      filter: ['all', ['==', ['get', 'class'], 'rail'], ['!=', ['get', 'brunnel'], 'tunnel']],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': RAIL_CASING,
        'line-width': ['interpolate', ['linear'], ['zoom'], 7, 2.2, 10, 3.8, 14, 5.0],
        'line-opacity': 0.95,
      },
    },
    {
      id: 'rail-service-casing',
      type: 'line',
      source: OMT,
      'source-layer': 'transportation',
      minzoom: 11,
      filter: ['all', ['==', ['get', 'class'], 'rail'], ['has', 'service']],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': RAIL_CASING,
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.3, 15, 2.6],
        'line-opacity': 0.85,
      },
    },
    // National spine (India-level) — quiet but clearly present under clusters.
    {
      id: 'rail-network',
      type: 'line',
      source: OMT,
      'source-layer': 'transportation',
      minzoom: 3,
      maxzoom: 6.5,
      filter: ['all', ['==', ['get', 'class'], 'rail'], ['!', ['has', 'service']]],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': RAIL_NATIONAL,
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.0, 5, 1.4, 6.5, 1.7],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 6, 0.62],
      },
    },
    // Regional corridors (Delhi/NCR, Mumbai, Kolkata, …) — clearly visible.
    {
      id: 'rail-network-region',
      type: 'line',
      source: OMT,
      'source-layer': 'transportation',
      minzoom: 6.5,
      maxzoom: 9.5,
      filter: ['all', ['==', ['get', 'class'], 'rail'], ['!', ['has', 'service']]],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': RAIL_REGIONAL,
        'line-width': ['interpolate', ['linear'], ['zoom'], 6.5, 1.4, 8, 1.9, 9.5, 2.3],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 6.5, 0.62, 9.5, 0.75],
      },
    },
    // Detailed lines (high zoom) — strongest rail, still below live trains.
    {
      id: 'rail-network-detail',
      type: 'line',
      source: OMT,
      'source-layer': 'transportation',
      minzoom: 9.5,
      filter: ['all', ['==', ['get', 'class'], 'rail'], ['!', ['has', 'service']], ['!=', ['get', 'brunnel'], 'tunnel']],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': RAIL_CORE,
        'line-width': ['interpolate', ['linear'], ['zoom'], 9.5, 1.8, 12, 2.5, 14, 3.0],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 9.5, 0.85, 13, 0.95],
      },
    },
    // Siding/service tracks — appear only when you are close enough to care.
    {
      id: 'rail-service',
      type: 'line',
      source: OMT,
      'source-layer': 'transportation',
      minzoom: 10.5,
      filter: ['all', ['==', ['get', 'class'], 'rail'], ['has', 'service'], ['!=', ['get', 'brunnel'], 'tunnel']],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': RAIL_SERVICE,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10.5, 0.7, 14, 1.2],
        'line-opacity': 0.85,
        'line-dasharray': [2, 1.8],
      },
    },

    // ── Toponyms — restrained labels with collision de-confliction ─────
    {
      id: 'water-name',
      type: 'symbol',
      source: OMT,
      'source-layer': 'water_name',
      minzoom: 6,
      layout: {
        'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
        'text-font': FONT_ITALIC,
        'text-size': ['interpolate', ['linear'], ['zoom'], 6, 8.5, 11, 10.5],
        'text-max-width': 8,
        'text-letter-spacing': 0.02,
      },
      paint: {
        'text-color': WATER_TXT,
        'text-halo-color': HALO,
        'text-halo-width': 1.2,
        'text-opacity': 0.8,
      },
    },
    {
      id: 'place-country-major',
      type: 'symbol',
      source: OMT,
      'source-layer': 'place',
      minzoom: 2.4,
      filter: ['all', ['==', ['get', 'class'], 'country'], ['<=', ['get', 'rank'], 3], POINT],
      layout: {
        'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
        'text-font': FONT_BOLD,
        'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11, 6, 14],
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.12,
      },
      paint: {
        'text-color': COUNTRY_TXT,
        'text-halo-color': HALO,
        'text-halo-width': 2,
      },
    },
    {
      id: 'place-country-minor',
      type: 'symbol',
      source: OMT,
      'source-layer': 'place',
      minzoom: 4,
      filter: ['all', ['==', ['get', 'class'], 'country'], ['>', ['get', 'rank'], 3], POINT],
      layout: {
        'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
        'text-font': FONT_REG,
        'text-size': 9.5,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.08,
      },
      paint: {
        'text-color': COUNTRY_TXT,
        'text-halo-color': HALO,
        'text-halo-width': 1.5,
      },
    },
    // State labels appear around India zoom so the network reads in context.
    {
      id: 'place-state',
      type: 'symbol',
      source: OMT,
      'source-layer': 'place',
      minzoom: 4.6,
      filter: ['all', ['==', ['get', 'class'], 'state'], POINT],
      layout: {
        'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
        'text-font': FONT_REG,
        'text-size': 9.5,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.08,
        'text-max-width': 10,
      },
      paint: {
        'text-color': STATE_TXT,
        'text-halo-color': HALO,
        'text-halo-width': 1.4,
      },
    },
    // Major cities — every deliberate anchor (Delhi, Mumbai, Bhopal, Jaipur,
    // Ahmedabad, Lucknow, Kolkata, Hyderabad, Chennai, Bengaluru, …) appears
    // early so the map is instantly placeable. MapLibre collision rules still
    // thin the label set automatically.
    {
      id: 'place-city-large',
      type: 'symbol',
      source: OMT,
      'source-layer': 'place',
      minzoom: 3.2,
      filter: ['all', ['==', ['get', 'class'], 'city'], ['<=', ['get', 'rank'], 4], POINT],
      layout: {
        'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
        'text-font': FONT_BOLD,
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10.5, 8, 13.5],
        'text-max-width': 11,
        'text-letter-spacing': 0.02,
      },
      paint: {
        'text-color': CITY_TXT,
        'text-halo-color': HALO,
        'text-halo-width': 2,
      },
    },
    {
      id: 'place-city',
      type: 'symbol',
      source: OMT,
      'source-layer': 'place',
      minzoom: 6.2,
      filter: ['all', ['==', ['get', 'class'], 'city'], ['>', ['get', 'rank'], 4], POINT],
      layout: {
        'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
        'text-font': FONT_REG,
        'text-size': 10,
        'text-max-width': 10,
      },
      paint: {
        'text-color': CITY_TXT_SUB,
        'text-halo-color': HALO,
        'text-halo-width': 1.6,
      },
    },
    {
      id: 'place-town',
      type: 'symbol',
      source: OMT,
      'source-layer': 'place',
      minzoom: 8.4,
      filter: ['all', ['==', ['get', 'class'], 'town'], POINT],
      layout: {
        'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
        'text-font': FONT_REG,
        'text-size': 8.5,
        'text-max-width': 8,
      },
      paint: {
        'text-color': TOWN_TXT,
        'text-halo-color': HALO,
        'text-halo-width': 1.2,
      },
    },
    {
      id: 'place-suburb',
      type: 'symbol',
      source: OMT,
      'source-layer': 'place',
      minzoom: 11.4,
      filter: ['all', ['==', ['get', 'class'], 'suburb'], POINT],
      layout: {
        'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
        'text-font': FONT_REG,
        'text-size': 7.5,
        'text-max-width': 9,
      },
      paint: {
        'text-color': '#6A7681',
        'text-halo-color': HALO,
        'text-halo-width': 1.1,
      },
    },
    {
      id: 'place-village',
      type: 'symbol',
      source: OMT,
      'source-layer': 'place',
      minzoom: 12.4,
      filter: ['all', ['==', ['get', 'class'], 'village'], POINT],
      layout: {
        'text-field': ['coalesce', ['get', 'name:latin'], ['get', 'name']],
        'text-font': FONT_REG,
        'text-size': 7.5,
        'text-max-width': 8,
      },
      paint: {
        'text-color': '#5F6A75',
        'text-halo-color': HALO,
        'text-halo-width': 1,
      },
    },
  ],
};