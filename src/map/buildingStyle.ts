import type { ExpressionSpecification, FillExtrusionLayerSpecification, LightSpecification } from 'maplibre-gl';
import type { BaseLayer } from './style';

// The 3D building layers (map/buildings.ts switches them). Kept free of the app store so the
// unit tests can load it.
//
// Each source draws two layers: the walls, and a thin slab on top for the roof, so a building
// can have a wall colour and a roof colour (an extruded shape only takes one colour).

/** Free building shapes from OpenFreeMap, the vector source the base map already uses. No key. */
export const BUILDINGS_FREE = 'buildings-3d';
export const BUILDINGS_FREE_ROOF = 'buildings-3d-roof';
/** MapTiler's Buildings tiles with the viewer's own key: far more real heights and colours. */
export const BUILDINGS_MAPTILER = 'buildings-3d-maptiler';
export const BUILDINGS_MAPTILER_ROOF = 'buildings-3d-maptiler-roof';
export const MAPTILER_BUILDINGS_SOURCE = 'maptiler-buildings';

export const FREE_LAYERS = [BUILDINGS_FREE, BUILDINGS_FREE_ROOF] as const;
export const MAPTILER_LAYERS = [BUILDINGS_MAPTILER, BUILDINGS_MAPTILER_ROOF] as const;

/** OpenFreeMap has buildings from this zoom. */
export const BUILDINGS_MINZOOM = 13;
/** MapTiler's building tiles only carry heights from this zoom, so it takes over from here. */
export const MAPTILER_HEIGHT_ZOOM = 15;
/** Height for a building nobody has mapped a height for (OpenMapTiles' own default). */
export const DEFAULT_HEIGHT = 5;
/** Above this height, metres, a building with no mapped roof shape gets a flat roof's colour. */
export const FLAT_ROOF_ABOVE = 25;
/** How thick the roof slab is, metres. */
export const ROOF_THICKNESS = 0.5;

/**
 * Colours for a building nobody has mapped a colour for: light plaster walls and a warm
 * tile-brown roof, or concrete grey where the roof is mapped as flat. Softer on the paper bases.
 */
export function defaultColours(base: BaseLayer): { wall: string; roof: string; flatRoof: string } {
  return base === 'satellite'
    ? { wall: '#F3EDE1', roof: '#8A5F4B', flatRoof: '#9C9992' }
    : { wall: '#F1EADC', roof: '#B08268', flatRoof: '#B9B5AB' };
}

type Part = 'wall' | 'roof';

/**
 * A building's own colour where OpenStreetMap has one, else the default. `to-color` takes the
 * first value that is a colour, so a missing or odd value ("yes") falls through to the default.
 * The free data has one colour per building (the walls); MapTiler has walls and roof.
 */
export function buildingColour(layer: string, base: BaseLayer): ExpressionSpecification | string {
  const d = defaultColours(base);
  // With no roof shape mapped, a tall building is taken to have a flat roof.
  const tall = (height: string): ExpressionSpecification => ['>', ['coalesce', ['get', height], DEFAULT_HEIGHT], FLAT_ROOF_ABOVE];
  switch (layer) {
    case BUILDINGS_FREE:
      return ['to-color', ['get', 'colour'], d.wall];
    case BUILDINGS_MAPTILER:
      return ['to-color', ['get', 'facade_color'], d.wall];
    case BUILDINGS_MAPTILER_ROOF:
      return [
        'to-color',
        ['get', 'roof_color'],
        ['case', ['==', ['get', 'roof_shape'], 'flat'], d.flatRoof, ['has', 'roof_shape'], d.roof, tall('height'), d.flatRoof, d.roof],
      ];
    default:
      return ['case', tall('render_height'), d.flatRoof, d.roof];
  }
}

function layer(
  id: string,
  part: Part,
  base: BaseLayer,
  data: { source: string; height: string; minHeight: string; hide: string; minzoom: number; maxzoom: number },
): FillExtrusionLayerSpecification {
  // Far tiles of a tilted view come from coarser zooms, which can lack heights.
  const top: ExpressionSpecification = ['coalesce', ['get', data.height], DEFAULT_HEIGHT];
  return {
    id,
    type: 'fill-extrusion',
    source: data.source,
    'source-layer': 'building',
    minzoom: data.minzoom,
    maxzoom: data.maxzoom,
    filter: ['!=', ['get', data.hide], true],
    paint: {
      'fill-extrusion-color': buildingColour(id, base),
      'fill-extrusion-height': part === 'wall' ? top : ['+', top, ROOF_THICKNESS],
      'fill-extrusion-base': part === 'wall' ? ['coalesce', ['get', data.minHeight], 0] : top,
    },
  };
}

/** Walls, then roof. `maptilerOn`: MapTiler draws the close zooms, so these stop where it starts. */
export function freeBuildingLayers(base: BaseLayer, maptilerOn: boolean): FillExtrusionLayerSpecification[] {
  // `hide_3d`: outlines whose parts are mapped separately would double up with them.
  const data = { source: 'omt', height: 'render_height', minHeight: 'render_min_height', hide: 'hide_3d', minzoom: BUILDINGS_MINZOOM, maxzoom: maptilerOn ? MAPTILER_HEIGHT_ZOOM : 24 };
  return [layer(BUILDINGS_FREE, 'wall', base, data), layer(BUILDINGS_FREE_ROOF, 'roof', base, data)];
}

export function maptilerBuildingLayers(base: BaseLayer): FillExtrusionLayerSpecification[] {
  const data = { source: MAPTILER_BUILDINGS_SOURCE, height: 'height', minHeight: 'height_min', hide: 'underground', minzoom: MAPTILER_HEIGHT_ZOOM, maxzoom: 24 };
  return [layer(BUILDINGS_MAPTILER, 'wall', base, data), layer(BUILDINGS_MAPTILER_ROOF, 'roof', base, data)];
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
    // Kept moderate: the side away from the sun is drawn (1 - intensity) as bright, and at 0.5
    // light walls turned a dull grey.
    intensity: 0.1 + 0.25 * day,
    'intensity-transition': { duration: 0, delay: 0 },
  };
}
