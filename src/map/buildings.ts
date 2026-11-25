import type { Map as MlMap } from 'maplibre-gl';
import { useApp } from '../store/app';
import { useBuildings } from '../store/buildings';
import { sunPosition } from '../sun/position';
import { maptilerBuildingsUrl } from './sources';
import {
  BUILDINGS_MINZOOM,
  FREE_LAYERS,
  MAPTILER_BUILDINGS_SOURCE,
  MAPTILER_HEIGHT_ZOOM,
  MAPTILER_LAYERS,
  buildingColour,
  maptilerBuildingLayers,
  sunLight,
} from './buildingStyle';

/**
 * 3D buildings, standing on the terrain and lit from where the sun is.
 *
 * They work with no key at all: OpenFreeMap, which already draws the roads and names, has every
 * building's outline. Its heights are only what OpenStreetMap has, so most alpine buildings
 * get the 5 m default. With a MapTiler key the close zooms (15 and in) use MapTiler's
 * Buildings tiles instead, which have a real height for about half of them. If MapTiler
 * turns the key down, the free data stays on at every zoom.
 *
 * Walls and roof are separate layers (map/buildingStyle.ts): a building's own colours where
 * OpenStreetMap has them (rare in the Alps, common in big cities), light walls and a darker
 * roof everywhere else.
 *
 * Buildings don't cast shadows: map/shadowLayer.ts works from the terrain alone.
 */
export function installBuildings(map: MlMap, beforeLayer: string): () => void {
  /** The key the MapTiler layer is running on, or null while it's off. */
  let activeKey: string | null = null;
  /** A key MapTiler answered 401/403 for; not tried again until the key changes. */
  let refusedKey: string | null = null;

  const removeMaptiler = () => {
    for (const id of MAPTILER_LAYERS) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(MAPTILER_BUILDINGS_SOURCE)) map.removeSource(MAPTILER_BUILDINGS_SOURCE);
    activeKey = null;
  };

  const sync = () => {
    const s = useApp.getState();
    const key = s.maptilerKey.trim();
    // Google's 3D tiles already have the buildings in them.
    const show = s.overlays.buildings && !(s.overlays.google3d && s.googleKey.trim() !== '');
    const wantKey = show && key !== '' && key !== refusedKey ? key : null;

    if (activeKey !== wantKey) {
      removeMaptiler();
      if (wantKey) {
        map.addSource(MAPTILER_BUILDINGS_SOURCE, { type: 'vector', url: maptilerBuildingsUrl(wantKey) });
        // Added together with their source, before any of its tiles load, and removed (not
        // hidden) when off, so they never meet the zoomed-in tile problem the free layers have.
        for (const l of maptilerBuildingLayers(s.base)) map.addLayer(l, beforeLayer);
        activeKey = wantKey;
      }
    }
    // The free layers are part of the style (map/style.ts) and are switched by opacity, never
    // by visibility or by adding them here: see the note on them there.
    const freeMax = activeKey ? MAPTILER_HEIGHT_ZOOM : 24;
    for (const id of FREE_LAYERS) {
      if (map.getLayer(id)?.maxzoom !== freeMax) map.setLayerZoomRange(id, BUILDINGS_MINZOOM, freeMax);
      map.setPaintProperty(id, 'fill-extrusion-opacity', show ? 1 : 0);
    }
    for (const id of [...FREE_LAYERS, ...MAPTILER_LAYERS]) {
      if (map.getLayer(id)) map.setPaintProperty(id, 'fill-extrusion-color', buildingColour(id, s.base));
    }
    if (show) light();
    useBuildings.setState({
      source: activeKey ? 'maptiler' : 'free',
      problem: key !== '' && key === refusedKey ? "MapTiler didn't accept the key, so the free building data is shown." : '',
    });
  };

  const light = () => {
    const s = useApp.getState();
    const sun = sunPosition(s.time, s.pin.lat, s.pin.lng);
    map.setLight(sunLight(sun.azimuth, sun.elevation));
  };

  // A wrong or revoked key: MapTiler answers 403 for the tile list and every tile.
  const onError = (e: { error?: unknown; sourceId?: string }) => {
    const err = e.error as { status?: number; url?: string; message?: string } | undefined;
    const ours = e.sourceId === MAPTILER_BUILDINGS_SOURCE || `${err?.url ?? ''} ${err?.message ?? ''}`.includes('/tiles/buildings/');
    if (!ours || !activeKey || (err?.status !== 401 && err?.status !== 403)) return;
    refusedKey = activeKey;
    sync();
  };
  map.on('error', onError);

  const unsubscribe = useApp.subscribe((now, prev) => {
    if (now.maptilerKey !== prev.maptilerKey) refusedKey = null;
    if (
      now.maptilerKey !== prev.maptilerKey ||
      now.googleKey !== prev.googleKey ||
      now.base !== prev.base ||
      now.overlays.buildings !== prev.overlays.buildings ||
      now.overlays.google3d !== prev.overlays.google3d
    ) {
      sync();
    } else if (now.overlays.buildings && (now.time !== prev.time || now.pin !== prev.pin)) {
      light();
    }
  });
  sync();

  return () => {
    unsubscribe();
    map.off('error', onError);
    removeMaptiler();
  };
}
