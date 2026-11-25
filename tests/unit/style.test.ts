import { describe, expect, it } from 'vitest';
import { buildStyle, layerVisibility } from '../../src/map/style';
import { ELEVATION, IMAGERY } from '../../src/map/sources';

describe('base layers', () => {
  const all = { shadows: true, sunPath: true, solstices: true, compass: true, contours: true, labels: true, lightColour: true, routes: true, places: true, photos: true, lens: true, photoSpots: true, sunHours: false, google3d: false, buildings: true };

  it('shows exactly one base at a time', () => {
    const sat = layerVisibility('satellite', all);
    expect(sat.satellite).toBe(true);
    expect(sat['paper-hillshade']).toBe(false);
    expect(sat['terrain-hillshade']).toBe(false);

    const paper = layerVisibility('paper', all);
    expect(paper.satellite).toBe(false);
    expect(paper['paper-hillshade']).toBe(true);
    expect(paper.water).toBe(true);

    const terrain = layerVisibility('terrain', all);
    expect(terrain['terrain-hillshade']).toBe(true);
    expect(terrain.satellite).toBe(false);
  });

  it('overlays toggle independently of the base', () => {
    const v = layerVisibility('satellite', { ...all, contours: false });
    expect(v['contour-minor']).toBe(false);
    expect(v['contour-major']).toBe(false);
    expect(v['label-peak']).toBe(true);
  });

  it('builds a style with 3D terrain and every managed layer', () => {
    const style = buildStyle({
      base: 'paper',
      overlays: all,
      imagery: IMAGERY.esri,
      imageryKey: '',
      elevation: ELEVATION.mapterhorn,
      contourTilesUrl: 'dem-contour://{z}/{x}/{y}',
    });
    expect(style.terrain?.source).toBe('dem-terrain');
    const ids = style.layers.map((l) => l.id);
    // The shadow layers and 'sun-hours' are added at runtime once elevation loads.
    for (const id of Object.keys(layerVisibility('paper', all))) if (!['shadows', 'shadows-detail', 'sun-hours'].includes(id)) expect(ids).toContain(id);
  });

  it('has the 3D buildings in the style from the start, switched by opacity and never hidden', () => {
    const opts = { base: 'paper' as const, imagery: IMAGERY.esri, imageryKey: '', elevation: ELEVATION.mapterhorn, contourTilesUrl: 'dem-contour://{z}/{x}/{y}' };
    for (const on of [true, false]) {
      const layers = buildStyle({ ...opts, overlays: { ...all, buildings: on } }).layers;
      for (const id of ['buildings-3d', 'buildings-3d-roof']) {
        const b = layers.find((l) => l.id === id) as { layout?: { visibility?: string }; paint: Record<string, unknown> };
        expect(b.layout?.visibility).not.toBe('none');
        expect(b.paint['fill-extrusion-opacity']).toBe(on ? 1 : 0);
      }
      // Walls then roof, under the labels and above the contour lines.
      const ids = layers.map((l) => l.id);
      expect(ids.indexOf('buildings-3d')).toBe(ids.indexOf('contour-label') - 2);
      expect(ids.indexOf('buildings-3d-roof')).toBe(ids.indexOf('contour-label') - 1);
    }
  });

  it('never puts a MapTiler key in the style unless one is given', () => {
    const src = IMAGERY.maptiler.source('');
    expect(src.url).toContain('key=');
    expect(src.url).not.toMatch(/key=[A-Za-z0-9]/);
  });
});
