"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Orbitron } from "next/font/google";
import {
  DEFAULT_HEIGHT,
  DEFAULT_RULE,
  DEFAULT_WIDTH,
  MAX_SIZE,
  MIN_SIZE,
  PRESETS,
  applyPatternJson,
  clampSize,
  clearGrid,
  countPopulation,
  createBuffers,
  parsePatternJson,
  parseRule,
  placePattern,
  randomiseGrid,
  setCellLine,
  stepLife,
  toPatternJson,
  type NamedPattern,
  type Rule,
} from "@/lib/life";

const orbitron = Orbitron({ subsets: ["latin"], weight: ["500", "700"] });

const DEAD_FILL = "#040b16";
const LIVE_FILL = "#34d399";
const GRID_STROKE = "#0e3a4f";
const CHART_LINE = "#22d3ee";
const CHART_FILL = "rgba(34, 211, 238, 0.18)";
const HISTORY_LEN = 240;
const SIZE_OPTIONS = [40, 80, 120, 160, 200] as const;
const RULE_PRESETS = [
  { label: "Conway's Life", rule: "B3/S23" },
  { label: "HighLife", rule: "B36/S23" },
  { label: "Day & Night", rule: "B3678/S34678" },
  { label: "Maze", rule: "B3/S12345" },
  { label: "Morley", rule: "B368/S245" },
] as const;

const parsedDefault = parseRule(DEFAULT_RULE);
const DEFAULT_PARSED: Rule = parsedDefault.ok
  ? parsedDefault.rule
  : { birth: [], survive: [], notation: DEFAULT_RULE };

const PANEL =
  "rounded-xl border border-cyan-400/30 bg-slate-900/60 p-3 shadow-[0_0_20px_rgba(34,211,238,0.08)] backdrop-blur";
const INPUT =
  "rounded-lg border border-cyan-400/40 bg-slate-950/80 px-3 py-1.5 text-sm text-cyan-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300";
const LABEL = "text-xs uppercase tracking-widest text-cyan-200";

function buttonClass(active = false): string {
  return [
    "rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all hover:-translate-y-0.5",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300",
    active
      ? "border-emerald-300 bg-emerald-500 text-slate-950 shadow-[0_0_16px_rgba(52,211,153,0.7)]"
      : "border-cyan-400/50 bg-slate-900/70 text-cyan-100 hover:border-cyan-300 hover:shadow-[0_0_14px_rgba(34,211,238,0.45)]",
  ].join(" ");
}

function Heading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className={`${orbitron.className} text-xs font-bold uppercase tracking-[0.3em] text-cyan-300`}
    >
      {children}
    </h2>
  );
}

export default function LifeLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const buffersRef = useRef(createBuffers(DEFAULT_WIDTH, DEFAULT_HEIGHT));
  const sizeRef = useRef({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const ruleRef = useRef<Rule>(DEFAULT_PARSED);
  const wrapRef = useRef(true);
  const playingRef = useRef(false);
  const speedRef = useRef(10);
  const lastStepRef = useRef(0);
  const rafRef = useRef(0);
  const drawingRef = useRef(false);
  const lastCellRef = useRef<{ x: number; y: number } | null>(null);
  const pendingPresetRef = useRef<NamedPattern | null>(null);
  const generationRef = useRef(0);
  const populationRef = useRef(0);
  const historyRef = useRef<number[]>([0]);
  const statsTickRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [ruleText, setRuleText] = useState(DEFAULT_RULE);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [population, setPopulation] = useState(0);
  const [wrap, setWrap] = useState(true);
  const [gridSize, setGridSize] = useState(DEFAULT_WIDTH);
  const [placeMode, setPlaceMode] = useState<"center" | "click">("center");
  const [pendingPreset, setPendingPreset] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const ruleId = useId();
  const speedId = useId();
  const sizeId = useId();
  const wrapId = useId();
  const fileId = useId();
  const ruleErrorId = useId();

  const syncStats = useCallback(() => {
    setGeneration(generationRef.current);
    setPopulation(populationRef.current);
  }, []);

  const paintGrid = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = sizeRef.current;
    const { current } = buffersRef.current;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    const pxW = Math.max(1, Math.floor(cssW * dpr));
    const pxH = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = DEAD_FILL;
    ctx.fillRect(0, 0, cssW, cssH);

    const cellW = cssW / width;
    const cellH = cssH / height;

    ctx.fillStyle = LIVE_FILL;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if (current[row + x] === 1) {
          ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
        }
      }
    }

    if (cellW >= 6) {
      ctx.strokeStyle = GRID_STROKE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= width; x++) {
        const px = Math.round(x * cellW) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, cssH);
      }
      for (let y = 0; y <= height; y++) {
        const py = Math.round(y * cellH) + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(cssW, py);
      }
      ctx.stroke();
    }
  }, []);

  const paintChart = useCallback(() => {
    const canvas = chartRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    const pxW = Math.max(1, Math.floor(cssW * dpr));
    const pxH = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#06121f";
    ctx.fillRect(0, 0, cssW, cssH);

    const hist = historyRef.current;
    const maxPop = Math.max(1, ...hist);
    ctx.strokeStyle = "#164e63";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, cssW - 1, cssH - 1);

    if (hist.length < 2) return;

    ctx.beginPath();
    hist.forEach((v, i) => {
      const x = (i / (HISTORY_LEN - 1)) * (cssW - 2) + 1;
      const y = cssH - 2 - (v / maxPop) * (cssH - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = CHART_LINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.lineTo(cssW - 1, cssH - 1);
    ctx.lineTo(1, cssH - 1);
    ctx.closePath();
    ctx.fillStyle = CHART_FILL;
    ctx.fill();
  }, []);

  const recordHistory = useCallback((pop: number) => {
    const hist = historyRef.current;
    hist.push(pop);
    if (hist.length > HISTORY_LEN) hist.shift();
  }, []);

  const runStep = useCallback(() => {
    const { width, height } = sizeRef.current;
    const { current, next } = buffersRef.current;
    const pop = stepLife(current, next, width, height, ruleRef.current, wrapRef.current);
    buffersRef.current = { current: next, next: current };
    generationRef.current += 1;
    populationRef.current = pop;
    recordHistory(pop);
  }, [recordHistory]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    wrapRef.current = wrap;
  }, [wrap]);

  useEffect(() => {
    const loop = (time: number) => {
      if (playingRef.current) {
        const interval = 1000 / Math.max(1, speedRef.current);
        if (time - lastStepRef.current >= interval) {
          const steps = Math.min(4, Math.floor((time - lastStepRef.current) / interval));
          lastStepRef.current = time;
          for (let i = 0; i < steps; i++) runStep();
        }
      }
      paintGrid();
      paintChart();
      statsTickRef.current += 1;
      if (statsTickRef.current % 4 === 0) syncStats();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paintChart, paintGrid, runStep, syncStats]);

  const cellFromPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { width, height } = sizeRef.current;
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * height);
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    return { x, y };
  };

  const stampPreset = (pattern: NamedPattern, cx: number, cy: number) => {
    const { width, height } = sizeRef.current;
    placePattern(buffersRef.current.current, width, height, pattern.cells, cx, cy, wrapRef.current);
    populationRef.current = countPopulation(buffersRef.current.current);
    historyRef.current = [populationRef.current];
    syncStats();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const cell = cellFromPointer(event);
    if (!cell) return;
    const pending = pendingPresetRef.current;
    if (pending) {
      stampPreset(pending, cell.x, cell.y);
      pendingPresetRef.current = null;
      setPendingPreset(null);
      return;
    }
    drawingRef.current = true;
    lastCellRef.current = cell;
    event.currentTarget.setPointerCapture(event.pointerId);
    const { width, height } = sizeRef.current;
    setCellLine(buffersRef.current.current, width, height, cell.x, cell.y, cell.x, cell.y, 1);
    populationRef.current = countPopulation(buffersRef.current.current);
    syncStats();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const cell = cellFromPointer(event);
    if (!cell) return;
    const last = lastCellRef.current ?? cell;
    const { width, height } = sizeRef.current;
    setCellLine(buffersRef.current.current, width, height, last.x, last.y, cell.x, cell.y, 1);
    lastCellRef.current = cell;
    populationRef.current = countPopulation(buffersRef.current.current);
  };

  const endDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    lastCellRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    syncStats();
  };

  const applyRuleText = (value: string) => {
    setRuleText(value);
    const result = parseRule(value);
    if (result.ok) {
      ruleRef.current = result.rule;
      setRuleError(null);
      setRuleText(result.rule.notation);
    } else {
      setRuleError(result.error);
    }
  };

  const handlePlay = () => {
    lastStepRef.current = performance.now();
    setPlaying(true);
  };

  const handlePause = () => setPlaying(false);

  const handleStep = () => {
    setPlaying(false);
    runStep();
    syncStats();
  };

  const handleClear = () => {
    clearGrid(buffersRef.current.current);
    generationRef.current = 0;
    populationRef.current = 0;
    historyRef.current = [0];
    syncStats();
  };

  const handleRandomise = () => {
    randomiseGrid(buffersRef.current.current);
    generationRef.current = 0;
    populationRef.current = countPopulation(buffersRef.current.current);
    historyRef.current = [populationRef.current];
    syncStats();
  };

  const handlePreset = (pattern: NamedPattern) => {
    if (placeMode === "click") {
      pendingPresetRef.current = pattern;
      setPendingPreset(pattern.id);
      return;
    }
    const { width, height } = sizeRef.current;
    stampPreset(pattern, Math.floor(width / 2), Math.floor(height / 2));
    pendingPresetRef.current = null;
    setPendingPreset(null);
  };

  const resizeGrid = (nextSize: number) => {
    const size = clampSize(nextSize);
    const prev = sizeRef.current;
    const old = buffersRef.current.current;
    const next = createBuffers(size, size);
    const copyW = Math.min(prev.width, size);
    const copyH = Math.min(prev.height, size);
    for (let y = 0; y < copyH; y++) {
      for (let x = 0; x < copyW; x++) {
        next.current[y * size + x] = old[y * prev.width + x];
      }
    }
    buffersRef.current = next;
    sizeRef.current = { width: size, height: size };
    setGridSize(size);
    populationRef.current = countPopulation(next.current);
    historyRef.current = [populationRef.current];
    syncStats();
  };

  const handleSave = () => {
    const data = toPatternJson(
      buffersRef.current.current,
      sizeRef.current.width,
      sizeRef.current.height,
      ruleRef.current.notation,
      wrapRef.current,
    );
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "life-pattern.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoad = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const parsed = parsePatternJson(text);
      if (!parsed.ok) {
        setFileError(parsed.error);
        return;
      }
      setFileError(null);
      const w = clampSize(parsed.data.width);
      const h = clampSize(parsed.data.height);
      const size = Math.max(w, h);
      const next = createBuffers(size, size);
      applyPatternJson(next.current, size, size, parsed.data);
      buffersRef.current = next;
      sizeRef.current = { width: size, height: size };
      setGridSize(size);
      setWrap(parsed.data.wrap);
      wrapRef.current = parsed.data.wrap;
      const ruleResult = parseRule(parsed.data.rule);
      if (ruleResult.ok) {
        ruleRef.current = ruleResult.rule;
        setRuleText(ruleResult.rule.notation);
        setRuleError(null);
      }
      generationRef.current = 0;
      populationRef.current = countPopulation(next.current);
      historyRef.current = [populationRef.current];
      syncStats();
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top_left,#0b2a4a_0%,#050b1a_45%,#02040a_100%)] text-zinc-100">
      <header className="flex shrink-0 flex-wrap items-baseline gap-x-5 gap-y-1 px-5 pb-2 pt-3">
        <h1
          className={`${orbitron.className} bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-3xl font-bold uppercase tracking-[0.2em] text-transparent`}
        >
          Big Boss
        </h1>
        <p className="font-mono text-sm text-cyan-100">
          Cellular Automata Lab 
        </p>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-4 px-5 pb-4 lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div className="aspect-square h-full max-h-full max-w-full overflow-hidden rounded-xl border-2 border-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.45)]">
              <canvas
                ref={canvasRef}
                className="block size-full touch-none bg-[#040b16]"
                role="img"
                aria-label={`Cellular automata grid, ${gridSize} by ${gridSize}. Live cells are green on a dark background.`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDraw}
                onPointerCancel={endDraw}
                onPointerLeave={endDraw}
              />
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-x-8 gap-y-1 rounded-xl border border-cyan-400/40 bg-slate-900/70 px-5 py-2">
            <p className="flex items-center gap-3">
              <span className={LABEL}>Generation</span>
              <span
                className={`${orbitron.className} text-2xl tabular-nums text-emerald-300`}
                style={{ textShadow: "0 0 12px rgba(52,211,153,0.7)" }}
              >
                {generation}
              </span>
            </p>
            <p className="flex items-center gap-3">
              <span className={LABEL}>Live cells</span>
              <span
                className={`${orbitron.className} text-2xl tabular-nums text-emerald-300`}
                style={{ textShadow: "0 0 12px rgba(52,211,153,0.7)" }}
              >
                {population}
              </span>
            </p>
            {pendingPreset ? (
              <span className="text-sm text-emerald-300">
                Click the grid to place {pendingPreset}.
              </span>
            ) : null}
          </div>
        </div>

        <aside
          className="flex min-h-0 w-full flex-col gap-3 overflow-y-auto pr-1 lg:w-[26rem]"
          style={{ scrollbarWidth: "thin", scrollbarColor: "#155e75 transparent" }}
        >
          <section className={`${PANEL} flex flex-col gap-2`} aria-labelledby="sim-controls">
            <Heading id="sim-controls">Simulation</Heading>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass(playing)} onClick={handlePlay} aria-pressed={playing}>
                Play
              </button>
              <button type="button" className={buttonClass()} onClick={handlePause}>
                Pause
              </button>
              <button type="button" className={buttonClass()} onClick={handleStep}>
                Step
              </button>
              <button type="button" className={buttonClass()} onClick={handleClear}>
                Clear
              </button>
              <button type="button" className={buttonClass()} onClick={handleRandomise}>
                Randomise
              </button>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={speedId} className={LABEL}>
                Speed: {speed} generations per second
              </label>
              <input
                id={speedId}
                type="range"
                min={1}
                max={60}
                step={1}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>
          </section>

          <section className={`${PANEL} flex flex-col gap-2`} aria-labelledby="rule-heading">
            <Heading id="rule-heading">Rule</Heading>
            <label htmlFor={ruleId + "-preset"} className={LABEL}>
              Rule preset
            </label>
            <select
              id={ruleId + "-preset"}
              value={RULE_PRESETS.find((p) => p.rule === ruleText)?.rule ?? ""}
              onChange={(e) => {
                if (e.target.value) applyRuleText(e.target.value);
              }}
              className={INPUT}
            >
              <option value="">Custom</option>
              {RULE_PRESETS.map((p) => (
                <option key={p.rule} value={p.rule}>
                  {p.label} ({p.rule})
                </option>
              ))}
            </select>
            <label htmlFor={ruleId} className={LABEL}>
              Birth / Survive notation
            </label>
            <input
              id={ruleId}
              type="text"
              spellCheck={false}
              autoComplete="off"
              value={ruleText}
              aria-invalid={ruleError ? true : undefined}
              aria-describedby={ruleError ? ruleErrorId : undefined}
              onChange={(e) => applyRuleText(e.target.value)}
              className={`${INPUT} font-mono`}
            />
            {ruleError ? (
              <p id={ruleErrorId} role="alert" className="text-sm text-red-300">
                {ruleError}
              </p>
            ) : (
              <p className="text-sm text-cyan-100">Examples: B3/S23 (Life), B36/S23 (HighLife).</p>
            )}
          </section>

          <section className={`${PANEL} flex flex-col gap-2`} aria-labelledby="preset-heading">
            <Heading id="preset-heading">Presets</Heading>
            <fieldset className="flex flex-col gap-1">
              <legend className={LABEL}>Place at</legend>
              <label className="flex items-center gap-2 text-sm text-zinc-100">
                <input
                  type="radio"
                  name="place-mode"
                  className="accent-cyan-400"
                  checked={placeMode === "center"}
                  onChange={() => setPlaceMode("center")}
                />
                Center of grid
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-100">
                <input
                  type="radio"
                  name="place-mode"
                  className="accent-cyan-400"
                  checked={placeMode === "click"}
                  onChange={() => setPlaceMode("click")}
                />
                Next click on grid
              </label>
            </fieldset>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={buttonClass(pendingPreset === preset.id)}
                  onClick={() => handlePreset(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </section>

          <section className={`${PANEL} flex flex-col gap-2`} aria-labelledby="world-heading">
            <Heading id="world-heading">World</Heading>
            <label htmlFor={sizeId} className={LABEL}>
              Grid size ({MIN_SIZE}–{MAX_SIZE})
            </label>
            <select
              id={sizeId}
              value={gridSize}
              onChange={(e) => resizeGrid(Number(e.target.value))}
              className={INPUT}
            >
              {SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} × {n}
                </option>
              ))}
            </select>
            <label htmlFor={wrapId} className="flex items-center gap-2 text-sm text-zinc-100">
              <input
                id={wrapId}
                type="checkbox"
                className="accent-cyan-400"
                checked={wrap}
                onChange={(e) => setWrap(e.target.checked)}
              />
              Wrap edges (torus). Off uses fixed dead borders.
            </label>
          </section>

          <section className={`${PANEL} flex flex-col gap-2`} aria-labelledby="io-heading">
            <Heading id="io-heading">Pattern file</Heading>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass()} onClick={handleSave}>
                Save JSON
              </button>
              <label htmlFor={fileId} className={`${buttonClass()} cursor-pointer`}>
                Load JSON
              </label>
              <input
                id={fileId}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={handleLoad}
              />
            </div>
            {fileError ? (
              <p role="alert" className="text-sm text-red-300">
                {fileError}
              </p>
            ) : null}
          </section>

          <section className={`${PANEL} flex flex-col gap-2`} aria-labelledby="chart-heading">
            <Heading id="chart-heading">Population</Heading>
            <canvas
              ref={chartRef}
              className="h-28 w-full rounded border border-cyan-900"
              role="img"
              aria-label={`Line chart of live population over recent generations. Current population ${population}.`}
            />
          </section>
        </aside>
      </main>
    </div>
  );
}