import { describe, expect, it } from 'vitest';
import {
  BUILDINGS_FREE,
  BUILDINGS_FREE_ROOF,
  BUILDINGS_MAPTILER,
  BUILDINGS_MAPTILER_ROOF,
  MAPTILER_HEIGHT_ZOOM,
  ROOF_THICKNESS,
  buildingColour,
  defaultColours,
  freeBuildingLayers,
  maptilerBuildingLayers,
  sunLight,
} from '../../src/map/buildingStyle';
import { maptilerBuildingsUrl } from '../../src/map/sources';

describe('3D buildings', () => {
  it('needs no key: the free layers read the base map source at every zoom', () => {
    for (const layer of freeBuildingLayers('paper', false)) {
      expect(layer.source).toBe('omt');
      expect(layer['source-layer']).toBe('building');
      expect(layer.maxzoom).toBe(24);
    }
  });

  it('hands the close zooms to MapTiler when a key is in use, with no gap or overlap', () => {
    for (const layer of freeBuildingLayers('paper', true)) expect(layer.maxzoom).toBe(MAPTILER_HEIGHT_ZOOM);
    for (const layer of maptilerBuildingLayers('paper')) expect(layer.minzoom).toBe(MAPTILER_HEIGHT_ZOOM);
  });

  it('gives a building with no mapped height a default one', () => {
    for (const [walls] of [freeBuildingLayers('satellite', false), maptilerBuildingLayers('satellite')]) {
      const height = walls.paint?.['fill-extrusion-height'] as unknown[];
      expect(height[0]).toBe('coalesce');
      expect(height[height.length - 1]).toBe(5);
    }
  });

  it('only puts the key in the MapTiler address', () => {
    expect(maptilerBuildingsUrl('a b')).toBe('https://api.maptiler.com/tiles/buildings/tiles.json?key=a%20b');
  });
});

describe('building colours', () => {
  it('draws walls, then a thin roof slab that starts where the walls end', () => {
    for (const [walls, roof] of [freeBuildingLayers('paper', false), maptilerBuildingLayers('paper')]) {
      const top = walls.paint?.['fill-extrusion-height'];
      expect(roof.paint?.['fill-extrusion-base']).toEqual(top);
      expect(roof.paint?.['fill-extrusion-height']).toEqual(['+', top, ROOF_THICKNESS]);
      // Same buildings in both, or a roof would float with no walls under it.
      expect(roof.filter).toEqual(walls.filter);
      expect(roof.source).toBe(walls.source);
    }
    expect(freeBuildingLayers('paper', false).map((l) => l.id)).toEqual([BUILDINGS_FREE, BUILDINGS_FREE_ROOF]);
    expect(maptilerBuildingLayers('paper').map((l) => l.id)).toEqual([BUILDINGS_MAPTILER, BUILDINGS_MAPTILER_ROOF]);
  });

  it("uses a building's own colours where they are mapped, else the defaults", () => {
    const d = defaultColours('satellite');
    expect(buildingColour(BUILDINGS_FREE, 'satellite')).toEqual(['to-color', ['get', 'colour'], d.wall]);
    expect(buildingColour(BUILDINGS_MAPTILER, 'satellite')).toEqual(['to-color', ['get', 'facade_color'], d.wall]);
    const roof = buildingColour(BUILDINGS_MAPTILER_ROOF, 'satellite') as unknown[];
    expect(roof.slice(0, 2)).toEqual(['to-color', ['get', 'roof_color']]);
  });

  it('with no roof colour mapped: grey for a flat or tall roof, tile-brown otherwise', () => {
    const d = defaultColours('paper');
    const tall = (height: string) => ['>', ['coalesce', ['get', height], 5], 25];
    // MapTiler: the mapped shape decides; only without one does the height.
    expect((buildingColour(BUILDINGS_MAPTILER_ROOF, 'paper') as unknown[])[2]).toEqual([
      'case',
      ['==', ['get', 'roof_shape'], 'flat'],
      d.flatRoof,
      ['has', 'roof_shape'],
      d.roof,
      tall('height'),
      d.flatRoof,
      d.roof,
    ]);
    // The free data has neither roof colour nor shape.
    expect(buildingColour(BUILDINGS_FREE_ROOF, 'paper')).toEqual(['case', tall('render_height'), d.flatRoof, d.roof]);
  });

  it('keeps walls and roof apart in tone on every base, so a building reads as a house', () => {
    for (const base of ['satellite', 'paper', 'terrain'] as const) {
      const d = defaultColours(base);
      const luma = (hex: string) => 0.2126 * parseInt(hex.slice(1, 3), 16) + 0.7152 * parseInt(hex.slice(3, 5), 16) + 0.0722 * parseInt(hex.slice(5, 7), 16);
      expect(luma(d.wall) - luma(d.roof)).toBeGreaterThan(50);
    }
  });
});

describe('sun light on buildings', () => {
  it('sits where the sun is: azimuth from north, angle down from straight above', () => {
    const light = sunLight(127.2, 28.2);
    expect(light.anchor).toBe('map');
    const [, azimuth, polar] = light.position as [number, number, number];
    expect(azimuth).toBeCloseTo(127.2);
    expect(polar).toBeCloseTo(61.8);
  });

  it('stays on the horizon and dims once the sun is down', () => {
    const day = sunLight(180, 40);
    const dusk = sunLight(270, -3);
    const night = sunLight(350, -30);
    expect((night.position as number[])[2]).toBe(90);
    expect(dusk.intensity as number).toBeLessThan(day.intensity as number);
    expect(night.intensity as number).toBeLessThan(dusk.intensity as number);
    expect(night.intensity as number).toBeGreaterThan(0);
  });

  it('keeps the azimuth inside 0 to 360', () => {
    expect((sunLight(-10, 10).position as number[])[1]).toBeCloseTo(350);
    expect((sunLight(370, 10).position as number[])[1]).toBeCloseTo(10);
  });
});
