import { describe, expect, it } from 'vitest';
import {
  MAPTILER_HEIGHT_ZOOM,
  freeBuildingsLayer,
  maptilerBuildingsLayer,
  sunLight,
} from '../../src/map/buildingStyle';
import { maptilerBuildingsUrl } from '../../src/map/sources';

describe('3D buildings', () => {
  it('needs no key: the free layer reads the base map source at every zoom', () => {
    const layer = freeBuildingsLayer('paper', false);
    expect(layer.source).toBe('omt');
    expect(layer['source-layer']).toBe('building');
    expect(layer.maxzoom).toBe(24);
  });

  it('hands the close zooms to MapTiler when a key is in use, with no gap or overlap', () => {
    expect(freeBuildingsLayer('paper', true).maxzoom).toBe(MAPTILER_HEIGHT_ZOOM);
    expect(maptilerBuildingsLayer('paper').minzoom).toBe(MAPTILER_HEIGHT_ZOOM);
  });

  it('gives a building with no mapped height a default one', () => {
    for (const layer of [freeBuildingsLayer('satellite', false), maptilerBuildingsLayer('satellite')]) {
      const height = layer.paint?.['fill-extrusion-height'] as unknown[];
      expect(height[0]).toBe('coalesce');
      expect(height[height.length - 1]).toBe(5);
    }
  });

  it('only puts the key in the MapTiler address', () => {
    expect(maptilerBuildingsUrl('a b')).toBe('https://api.maptiler.com/tiles/buildings/tiles.json?key=a%20b');
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
