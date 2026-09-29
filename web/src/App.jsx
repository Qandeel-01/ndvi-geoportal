/**
 * App shell for the redesigned dashboard.
 *
 *   ┌ topbar (pill nav, Fit AOI) ─────────────────────────────────┐
 *   ├ header card (AOI, date, area, elevation range, stack chips) ┤
 *   ├ left col  ┬  right col                                     ─┤
 *   │  terrain  │  map card (layers + basemap segment)           ─│
 *   │  histogram│  inspection log                                 │
 *   │  range    │                                                 │
 *   │  classes  │                                                 │
 *   └───────────┴─────────────────────────────────────────────────┘
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import TopBar from './components/TopBar.jsx';
import HeaderCard from './components/HeaderCard.jsx';
import RidgelineChart from './components/charts/RidgelineChart.jsx';
import HistogramChart from './components/charts/HistogramChart.jsx';
import RangeChart from './components/charts/RangeChart.jsx';
import ClassShareChart from './components/charts/ClassShareChart.jsx';
import MapCard from './components/MapCard.jsx';
import InspectionLog from './components/InspectionLog.jsx';
import {
  fetchLayers, fetchOverview, fetchAoi, fetchCharts, identify,
} from './api.js';
import { gsap, reducedMotion } from './utils/motion.js';

const INITIAL_LAYERS = {
  rgb:       { visible: true,  opacity: 1 },
  ndvi:      { visible: false, opacity: 0.85 },
  dem:       { visible: false, opacity: 0.75 },
  hillshade: { visible: false, opacity: 0.55 },
  contours:  { visible: false, opacity: 0.85 },
  points:    { visible: true,  opacity: 1 },
  aoi:       { visible: true,  opacity: 1 },
};

let nextEntryId = 1;

export default function App() {
  const [meta, setMeta] = useState(null);
  const [metaError, setMetaError] = useState(null);
  const [overview, setOverview] = useState(null);
  const [charts, setCharts] = useState(null);
  const [aoi, setAoi] = useState(null);

  const [layerState, setLayerState] = useState(INITIAL_LAYERS);
  const [basemap, setBasemap] = useState('dark');
  const [rgbStyle, setRgbStyle] = useState('');
  const [, setTilesLoading] = useState(false);

  const [entries, setEntries] = useState([]);   // inspection log
  const [highlight, setHighlight] = useState(null);
  const [active, setActive] = useState('overview');

  const abortRef = useRef(null);
  const appRef = useRef(null);
  const mapApiRef = useRef(null);
  const logListRef = useRef(null);

  // Initial data load: layers + overview + AOI + charts (parallel).
  useEffect(() => {
    fetchLayers().then(setMeta).catch((e) => setMetaError(e.message));
    fetchOverview().then(setOverview).catch(() => {});
    fetchAoi().then(setAoi).catch(() => {});
    fetchCharts().then(setCharts).catch(() => {});
  }, []);

  // Page intro: stagger cards up on first render. useGSAP is scoped to
  // appRef so all created tweens are auto-killed on unmount. We NEVER
  // set opacity: 0 in CSS: if this hook fails to run for any reason,
  // the cards remain visible in their default state (opacity 1).
  useGSAP(
    () => {
      const cards = gsap.utils.toArray('.card, .topbar', appRef.current);
      if (!cards.length) return;
      if (reducedMotion()) {
        // Nothing to do: cards are visible in their default state.
        return;
      }
      gsap.fromTo(
        cards,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.08 },
      );
    },
    { scope: appRef },
  );

  const handleMapClick = useCallback(
    async ({ lon, lat, res }) => {
      const layers = Object.keys(layerState)
        .filter((id) => id !== 'aoi' && id !== 'hillshade' && id !== 'contours')
        .filter((id) => layerState[id]?.visible);
      // Always request points + ndvi + rgb + dem so the log has data even if
      // the user has toggled the layer off (the layers panel only affects
      // display, not the data we surface in inspection).
      const requested = Array.from(new Set([...layers, 'points', 'ndvi', 'rgb', 'dem']));
      setHighlight({ click: [lon, lat] });

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const entryId = nextEntryId++;
      const at = new Date().toISOString();
      setEntries((prev) => [{ id: entryId, at, click: { lon, lat }, result: null }, ...prev].slice(0, 10));

      try {
        const result = await identify({ lon, lat, res, layers: requested }, controller.signal);
        const p = result.points?.found ? result.points.attributes : null;
        const distanceM = result.points?.found ? result.points.distanceM : null;
        setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, result, distanceM } : e));
        setHighlight({ click: [lon, lat], point: p ? [p.lon, p.lat] : null });
      } catch (err) {
        if (err.name === 'AbortError') return;
        setEntries((prev) => prev.map((e) => e.id === entryId ? { ...e, result: { error: err.message } } : e));
      }
    },
    [layerState],
  );

  const clearLog = () => { setEntries([]); setHighlight(null); };

  const handleNav = (id) => {
    setActive(id);
    const anchor = document.getElementById(id === 'insights' ? 'insights' : id === 'overview' ? 'overview' : id);
    anchor?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Fit AOI from the top bar; delegates to the imperative handle on the map.
  const fitAoi = () => mapApiRef.current?.fitAoi();

  const isLoadingCharts = !charts;
  const rightColLoading = useMemo(() => !meta && !metaError, [meta, metaError]);

  return (
    <div className="app" ref={appRef}>
      <TopBar active={active} onNav={handleNav} onFitAoi={fitAoi} />

      <div id="overview">
        <HeaderCard overview={overview} />
      </div>

      <div className="dashboard" id="insights">
        <div className="col">
          <section className="card">
            <div className="card-h">
              <div className="card-title"><h3>Terrain</h3><span className="card-sub">DEM ridgeline</span></div>
            </div>
            <RidgelineChart overview={overview} />
          </section>

          <section className="card">
            <div className="card-h">
              <div className="card-title"><h3>NDVI distribution</h3><span className="card-sub">24 bins, −0.2 to 1.0</span></div>
            </div>
            {isLoadingCharts ? <div className="skeleton skel-block" /> : <HistogramChart charts={charts} />}
          </section>

          <section className="card">
            <div className="card-h">
              <div className="card-title"><h3>NDVI by elevation</h3><span className="card-sub">100 m bands, p10 to p90</span></div>
            </div>
            {isLoadingCharts ? <div className="skeleton skel-block" /> : <RangeChart charts={charts} />}
          </section>

          <section className="card">
            <div className="card-h">
              <div className="card-title"><h3>Land-cover share</h3><span className="card-sub">by NDVI class</span></div>
            </div>
            {isLoadingCharts ? <div className="skeleton skel-block" /> : <ClassShareChart charts={charts} />}
          </section>
        </div>

        <div className="col">
          {metaError && <div className="error-card">Could not reach the API: {metaError}</div>}
          {rightColLoading && <div className="card"><div className="skeleton skel-block" /></div>}
          {meta && (
            <MapCard
              meta={meta}
              aoi={aoi}
              layerState={layerState}
              onLayerState={setLayerState}
              basemap={basemap}
              onBasemap={setBasemap}
              rgbStyle={rgbStyle}
              onRgbStyle={setRgbStyle}
              highlight={highlight}
              onMapClick={handleMapClick}
              onLoadingChange={setTilesLoading}
              mapApiRef={mapApiRef}
            />
          )}
          <InspectionLog entries={entries} onClear={clearLog} listRef={logListRef} />
        </div>
      </div>
    </div>
  );
}
