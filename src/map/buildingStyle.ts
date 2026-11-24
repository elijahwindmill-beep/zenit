import type { FillExtrusionLayerSpecification, LightSpecification } from 'maplibre-gl';
import type { BaseLayer } from './style';

// The 3D building layers (map/buildings.ts adds and switches them). Kept free of the app
// store so the unit tests can load it.

/** Free building shapes from OpenFreeMap, the vector source the base map already uses. No key. */
export const BUILDINGS_FREE = 'buildings-3d';
/** MapTiler's Buildings tiles with the viewer's own key: far more real heights. */
export const BUILDINGS_MAPTILER = 'buildings-3d-maptiler';
export const MAPTILER_BUILDINGS_SOURCE = 'maptiler-buildings';

/** OpenFreeMap has buildings from this zoom. */
export const BUILDINGS_MINZOOM = 13;
/** MapTiler's building tiles only carry heights from this zoom, so it takes over from here. */
export const MAPTILER_HEIGHT_ZOOM = 15;
/** Height for a building nobody has mapped a height for (OpenMapTiles' own default). */
export const DEFAULT_HEIGHT = 5;

export function buildingColour(base: BaseLayer): string {
  return base === 'satellite' ? '#E9E6DF' : '#DAD3C2';
}

/** `maptilerOn`: MapTiler draws the close zooms, so this layer stops where it starts. */
export function freeBuildingsLayer(base: BaseLayer, maptilerOn: boolean): FillExtrusionLayerSpecification {
  return {
    id: BUILDINGS_FREE,
    type: 'fill-extrusion',
    source: 'omt',
    'source-layer': 'building',
    minzoom: BUILDINGS_MINZOOM,
    maxzoom: maptilerOn ? MAPTILER_HEIGHT_ZOOM : 24,
    // Outlines whose parts are mapped separately would double up with them.
    filter: ['!=', ['get', 'hide_3d'], true],
    paint: {
      'fill-extrusion-color': buildingColour(base),
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], DEFAULT_HEIGHT],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
    },
  };
}

export function maptilerBuildingsLayer(base: BaseLayer): FillExtrusionLayerSpecification {
  return {
    id: BUILDINGS_MAPTILER,
    type: 'fill-extrusion',
    source: MAPTILER_BUILDINGS_SOURCE,
    'source-layer': 'building',
    minzoom: MAPTILER_HEIGHT_ZOOM,
    filter: ['!=', ['get', 'underground'], true],
    paint: {
      'fill-extrusion-color': buildingColour(base),
      // Far tiles of a tilted view come from coarser zooms, which have no heights.
      'fill-extrusion-height': ['coalesce', ['get', 'height'], DEFAULT_HEIGHT],
      'fill-extrusion-base': ['coalesce', ['get', 'height_min'], 0],
    },
  };
}

/**
 * MapLibre's light for extruded shapes, placed where the sun is: walls facing the sun are
 * bright, the others darker. Below the horizon the light stays on it and dims.
 * `azimuth` is degrees clockwise from north, `elevation` degrees above the horizon.
 */
export function sunLight(azimuth: number, elevation: number): LightSpecification {
  const up = Math.min(90, Math.max(0, elevation));
  // Full contrast by day, fading out through twilight (sun 0° to 6° below the horizon).
  const day = Math.min(1, Math.max(0, (elevation + 6) / 6));
  return {
    anchor: 'map',
    // [distance, degrees clockwise from north, degrees down from straight above]
    position: [1.5, ((azimuth % 360) + 360) % 360, 90 - up],
    'position-transition': { duration: 0, delay: 0 },
    color: '#ffffff',
    intensity: 0.12 + 0.38 * day,
    'intensity-transition': { duration: 0, delay: 0 },
  };
}
