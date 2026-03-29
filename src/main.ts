import {
  layoutNextLine,
  prepareWithSegments,
  type LayoutCursor,
  type LayoutLine,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";
import backgroundTextEn from "../background-text.en.txt?raw";
import backgroundTextZh from "../background-text.txt?raw";
import "./style.css";

type CopyLanguage = "en" | "zh";

type Point = {
  x: number;
  y: number;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Interval = {
  left: number;
  right: number;
};

type TextFragment = {
  text: string;
  x: number;
  y: number;
  width: number;
};

const SVG_NS = "http://www.w3.org/2000/svg";
const HEART_REST_SCALE = 1.3;
const HEART_PULSE_MIN_SCALE = 2.4;
const HEART_PULSE_MAX_SCALE = 3.6;
const HEART_PULSE_DURATION_MS = 720;
const HEART_POINTS = buildHeartPoints(180);
const HEART_PATH = pointsToPath(HEART_POINTS, 100);
const COPY_TEXTS: Record<CopyLanguage, string> = {
  en: normalizeCopyText(backgroundTextEn, "en"),
  zh: normalizeCopyText(backgroundTextZh, "zh"),
};

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <main class="composition">
    <section class="copy-surface" id="copy-surface" aria-label="Background text wrapped around a draggable heart">
      <div class="copy-layer" id="copy-layer" aria-hidden="true"></div>
      <div
        class="heart-shell"
        id="heart-shell"
        tabindex="0"
        role="img"
        aria-label="Draggable heart. Drag with a pointer or use arrow keys to move it."
      >
        <svg class="heart-graphic" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <linearGradient id="heart-fill" x1="18%" y1="12%" x2="82%" y2="88%">
              <stop offset="0%" stop-color="#fff3f2" />
              <stop offset="38%" stop-color="#ff8a93" />
              <stop offset="100%" stop-color="#b71339" />
            </linearGradient>
          </defs>
          <path class="heart-outline" d="${HEART_PATH}" />
          <path class="heart-shape" d="${HEART_PATH}" />
          <path class="heart-shine" d="${HEART_PATH}" />
        </svg>
      </div>
      <div class="surface-hud" id="surface-hud">
        <footer class="credit-footer">
          <a href="https://github.com/leovoon/love" target="_blank" rel="noreferrer">github/leovoon/love</a>
          <span>with thanks to</span>
          <a href="https://github.com/chenglou/pretext" target="_blank" rel="noreferrer">Pretext</a>
        </footer>
        <form class="control-panel" id="control-panel" aria-label="Display controls">
          <div class="control-panel-head">
            <button
              class="control-panel-toggle"
              id="control-panel-toggle"
              type="button"
              aria-expanded="true"
              aria-controls="control-panel-body"
            >
              <span class="control-panel-copy">
                <span class="control-panel-kicker">Display</span>
                <span class="control-panel-title">Controls</span>
              </span>
              <span class="control-panel-meta" aria-hidden="true">
                <span class="control-panel-icon"></span>
              </span>
            </button>
            <div class="language-toggle" id="language-toggle" role="group" aria-label="Background text language">
              <button class="language-button" type="button" data-language="en">EN</button>
              <button class="language-button" type="button" data-language="zh">中文</button>
            </div>
          </div>
          <div class="control-panel-body" id="control-panel-body">
            <label class="control-toggle" for="auto-play">
              <span class="control-copy">
                <span class="control-name">Auto</span>
                <span class="control-value" id="auto-play-value">Off</span>
              </span>
              <span class="toggle-shell">
                <input class="toggle-input" id="auto-play" name="auto-play" type="checkbox" />
                <span class="toggle-track" aria-hidden="true">
                  <span class="toggle-thumb"></span>
                </span>
              </span>
            </label>
            <label class="control-row" for="font-scale">
              <span class="control-copy">
                <span class="control-name">Font</span>
                <span class="control-value" id="font-scale-value">100%</span>
              </span>
              <input id="font-scale" name="font-scale" type="range" min="75" max="145" value="100" />
            </label>
            <label class="control-row" for="heart-scale">
              <span class="control-copy">
                <span class="control-name">Heart</span>
                <span class="control-value" id="heart-scale-value">100%</span>
              </span>
              <input id="heart-scale" name="heart-scale" type="range" min="70" max="150" value="100" />
            </label>
          </div>
        </form>
      </div>
      <svg class="pointer-guide" id="pointer-guide" aria-hidden="true">
        <line class="pointer-guide-line" id="pointer-guide-line" />
      </svg>
    </section>
  </main>
`;

const composition = document.querySelector<HTMLElement>(".composition")!;
const surface = document.querySelector<HTMLDivElement>("#copy-surface")!;
const copyLayer = document.querySelector<HTMLDivElement>("#copy-layer")!;
const heartShell = document.querySelector<HTMLDivElement>("#heart-shell")!;
const surfaceHud = document.querySelector<HTMLDivElement>("#surface-hud")!;
const pointerGuide = document.querySelector<SVGSVGElement>("#pointer-guide")!;
const pointerGuideLine = document.querySelector<SVGLineElement>("#pointer-guide-line")!;
const controlPanel = document.querySelector<HTMLFormElement>("#control-panel")!;
const controlPanelToggle = document.querySelector<HTMLButtonElement>("#control-panel-toggle")!;
const controlPanelBody = document.querySelector<HTMLDivElement>("#control-panel-body")!;
const creditFooter = document.querySelector<HTMLElement>(".credit-footer")!;
const languageButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-language]"));
const autoPlayInput = document.querySelector<HTMLInputElement>("#auto-play")!;
const fontScaleInput = document.querySelector<HTMLInputElement>("#font-scale")!;
const heartScaleInput = document.querySelector<HTMLInputElement>("#heart-scale")!;
const autoPlayValue = document.querySelector<HTMLSpanElement>("#auto-play-value")!;
const fontScaleValue = document.querySelector<HTMLSpanElement>("#font-scale-value")!;
const heartScaleValue = document.querySelector<HTMLSpanElement>("#heart-scale-value")!;

const state = {
  prepared: null as PreparedTextWithSegments | null,
  preparedLanguage: "zh" as CopyLanguage,
  font: "",
  lineHeight: 0,
  fontSize: 0,
  textBounds: { x: 0, y: 0, width: 0, height: 0 } as Rect,
  heartSize: 0,
  heartFootprintSize: 0,
  autoPlay: false,
  autoPlayFrameId: 0,
  autoPlayLastTime: 0,
  autoVelocityX: 148,
  autoVelocityY: 112,
  fontScale: 1,
  heartScale: 1,
  copyLanguage: "zh" as CopyLanguage,
  controlsCollapsed: false,
  wrapScale: HEART_REST_SCALE,
  currentPulseScale: 3,
  heartX: 0,
  heartY: 0,
  dragOffsetX: 0,
  dragOffsetY: 0,
  dragging: false,
  pointerStartX: 0,
  pointerStartY: 0,
  pointerMoved: false,
  pointerX: 0,
  pointerY: 0,
  pointerInsideViewport: false,
  wrapAnimationId: 0,
  wrapAnimationStart: 0,
  wrapAnimationFrom: HEART_REST_SCALE,
  pulseResetId: 0,
  rafId: 0,
};

function buildHeartPoints(sampleCount: number): Point[] {
  const raw: Point[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const t = (index / sampleCount) * Math.PI * 2;
    const sin = Math.sin(t);
    const x = 16 * sin * sin * sin;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    raw.push({ x, y });
  }

  const minX = Math.min(...raw.map((point) => point.x));
  const maxX = Math.max(...raw.map((point) => point.x));
  const minY = Math.min(...raw.map((point) => point.y));
  const maxY = Math.max(...raw.map((point) => point.y));

  return raw.map((point) => ({
    x: 0.08 + ((point.x - minX) / (maxX - minX)) * 0.84,
    y: 0.06 + ((point.y - minY) / (maxY - minY)) * 0.86,
  }));
}

function pointsToPath(points: Point[], scale: number): string {
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${(point.x * scale).toFixed(2)} ${(point.y * scale).toFixed(2)}`;
    })
    .join(" ")
    .concat(" Z");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeCopyText(rawText: string, language: CopyLanguage): string {
  if (language === "en") {
    return rawText
      .replace(/\s*\n+\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return rawText.replace(/[\r\n]+/g, "").trim();
}

function updateControlLabels(): void {
  autoPlayValue.textContent = state.autoPlay ? "On" : "Off";
  fontScaleValue.textContent = `${Math.round(state.fontScale * 100)}%`;
  heartScaleValue.textContent = `${Math.round(state.heartScale * 100)}%`;
}

function updateLanguageToggle(): void {
  for (let index = 0; index < languageButtons.length; index += 1) {
    const button = languageButtons[index]!;
    const isActive = button.dataset.language === state.copyLanguage;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function syncControlPanelState(): void {
  controlPanel.classList.toggle("is-collapsed", state.controlsCollapsed);
  controlPanelToggle.setAttribute("aria-expanded", String(!state.controlsCollapsed));
  controlPanelToggle.setAttribute(
    "aria-label",
    state.controlsCollapsed ? "Show display controls" : "Hide display controls",
  );
  controlPanelBody.setAttribute("aria-hidden", String(state.controlsCollapsed));
  controlPanelBody.inert = state.controlsCollapsed;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - (-2 * value + 2) ** 3 / 2;
}

function getHeartPulseLayer(): HTMLDivElement {
  const existingLayer = heartShell.querySelector<HTMLDivElement>(".heart-pulse-layer");
  if (existingLayer !== null) return existingLayer;

  const pulseLayer = document.createElement("div");
  pulseLayer.className = "heart-pulse-layer";
  pulseLayer.setAttribute("aria-hidden", "true");
  heartShell.prepend(pulseLayer);
  return pulseLayer;
}

function appendHeartPulse(delayMs: number): void {
  const pulseLayer = getHeartPulseLayer();
  const pulseWave = document.createElementNS(SVG_NS, "svg");
  pulseWave.setAttribute("class", "heart-pulse-wave");
  pulseWave.setAttribute("viewBox", "0 0 100 100");
  pulseWave.setAttribute("aria-hidden", "true");
  pulseWave.style.animationDelay = `${delayMs}ms`;

  const pulsePath = document.createElementNS(SVG_NS, "path");
  pulsePath.setAttribute("d", HEART_PATH);
  pulseWave.append(pulsePath);
  pulseLayer.append(pulseWave);

  pulseWave.addEventListener(
    "animationend",
    () => {
      pulseWave.remove();
      if (pulseLayer.childElementCount === 0) {
        pulseLayer.remove();
      }
    },
    { once: true },
  );
}

function animateWrapScale(frameTime: number): void {
  if (state.wrapAnimationStart === 0) {
    state.wrapAnimationStart = frameTime;
  }

  const elapsed = frameTime - state.wrapAnimationStart;
  const progress = clamp(elapsed / HEART_PULSE_DURATION_MS, 0, 1);
  const attackPortion = 0.36;
  const pulseTargetScale = state.currentPulseScale;

  if (progress <= attackPortion) {
    const attackProgress = easeOutCubic(progress / attackPortion);
    state.wrapScale =
      state.wrapAnimationFrom + (pulseTargetScale - state.wrapAnimationFrom) * attackProgress;
  } else {
    const releaseProgress = easeInOutCubic((progress - attackPortion) / (1 - attackPortion));
    state.wrapScale = pulseTargetScale + (HEART_REST_SCALE - pulseTargetScale) * releaseProgress;
  }

  scheduleRender();

  if (progress < 1) {
    state.wrapAnimationId = window.requestAnimationFrame(animateWrapScale);
    return;
  }

  state.wrapScale = HEART_REST_SCALE;
  state.wrapAnimationId = 0;
  state.wrapAnimationStart = 0;
  state.wrapAnimationFrom = HEART_REST_SCALE;
  scheduleRender();
}

function triggerHeartPulse(): void {
  if (state.pulseResetId !== 0) {
    window.clearTimeout(state.pulseResetId);
  }
  if (state.wrapAnimationId !== 0) {
    window.cancelAnimationFrame(state.wrapAnimationId);
    state.wrapAnimationId = 0;
  }

  state.currentPulseScale = randomBetween(HEART_PULSE_MIN_SCALE, HEART_PULSE_MAX_SCALE);
  heartShell.classList.remove("is-pulsing");
  void heartShell.offsetWidth;
  heartShell.classList.add("is-pulsing");
  state.wrapAnimationFrom = state.wrapScale;
  state.wrapAnimationStart = 0;
  state.wrapAnimationId = window.requestAnimationFrame(animateWrapScale);

  appendHeartPulse(0);

  state.pulseResetId = window.setTimeout(() => {
    heartShell.classList.remove("is-pulsing");
    state.pulseResetId = 0;
  }, 380);
}

function getCopyLineHeight(fontSize: number): number {
  const rawValue = getComputedStyle(surface).getPropertyValue("--copy-line-height").trim();
  const multiplier = Number.parseFloat(rawValue);

  if (!Number.isFinite(multiplier)) {
    return Math.round(fontSize * 1.72);
  }

  return Math.round(fontSize * multiplier);
}

function cursorsEqual(a: LayoutCursor, b: LayoutCursor): boolean {
  return a.segmentIndex === b.segmentIndex && a.graphemeIndex === b.graphemeIndex;
}

function lineEndedWithHardBreak(prepared: PreparedTextWithSegments, line: LayoutLine): boolean {
  return (
    line.end.graphemeIndex === 0 &&
    line.end.segmentIndex > 0 &&
    prepared.kinds[line.end.segmentIndex - 1] === "hard-break"
  );
}

function transformPoints(points: Point[], rect: Rect): Point[] {
  return points.map((point) => ({
    x: rect.x + point.x * rect.width,
    y: rect.y + point.y * rect.height,
  }));
}

function getPolygonXsAtY(points: Point[], y: number): number[] {
  const xs: number[] = [];
  let previous = points[points.length - 1];
  if (!previous) return xs;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    if ((previous.y <= y && y < current.y) || (current.y <= y && y < previous.y)) {
      xs.push(
        previous.x + ((y - previous.y) * (current.x - previous.x)) / (current.y - previous.y),
      );
    }
    previous = current;
  }

  return xs.sort((a, b) => a - b);
}

function getPolygonIntervalForBand(
  points: Point[],
  bandTop: number,
  bandBottom: number,
  horizontalPadding: number,
  verticalPadding: number,
): Interval | null {
  const sampleTop = bandTop - verticalPadding;
  const sampleBottom = bandBottom + verticalPadding;
  const startY = Math.floor(sampleTop);
  const endY = Math.ceil(sampleBottom);

  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;

  for (let y = startY; y <= endY; y += 1) {
    const intersections = getPolygonXsAtY(points, y + 0.5);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const nextLeft = intersections[index]!;
      const nextRight = intersections[index + 1]!;
      left = Math.min(left, nextLeft);
      right = Math.max(right, nextRight);
    }
  }

  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;

  return {
    left: left - horizontalPadding,
    right: right + horizontalPadding,
  };
}

function carveTextLineSlots(base: Interval, blocked: Interval[]): Interval[] {
  let slots: Interval[] = [base];

  for (let blockedIndex = 0; blockedIndex < blocked.length; blockedIndex += 1) {
    const interval = blocked[blockedIndex]!;
    const next: Interval[] = [];

    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slot = slots[slotIndex]!;
      if (interval.right <= slot.left || interval.left >= slot.right) {
        next.push(slot);
        continue;
      }

      if (interval.left > slot.left) {
        next.push({ left: slot.left, right: interval.left });
      }

      if (interval.right < slot.right) {
        next.push({ left: interval.right, right: slot.right });
      }
    }

    slots = next;
  }

  return slots.filter((slot) => slot.right - slot.left >= 56);
}

function getMovementBounds(
  textBounds: Rect = state.textBounds,
  heartFootprintSize: number = state.heartFootprintSize,
): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const minX = textBounds.x + heartFootprintSize / 2;
  const maxX = Math.max(minX, textBounds.x + textBounds.width - heartFootprintSize / 2);
  const minY = textBounds.y + heartFootprintSize / 2;
  const maxY = Math.max(minY, textBounds.y + textBounds.height - heartFootprintSize / 2);

  return { minX, maxX, minY, maxY };
}

function getViewportHeight(): number {
  const compositionStyles = getComputedStyle(composition);
  const compositionPaddingTop = Number.parseFloat(compositionStyles.paddingTop) || 0;
  const compositionPaddingBottom = Number.parseFloat(compositionStyles.paddingBottom) || 0;

  return Math.max(window.innerHeight - compositionPaddingTop - compositionPaddingBottom, 320);
}

function positionHud(): { bottomInset: number; height: number } {
  const surfaceRect = surface.getBoundingClientRect();
  const isNarrow = window.matchMedia("(max-width: 720px)").matches;
  const horizontalInset = isNarrow ? 12 : clamp(surface.clientWidth * 0.022, 16, 28);
  const bottomInset = isNarrow ? 12 : clamp(window.innerHeight * 0.024, 16, 30);

  surfaceHud.style.setProperty("--hud-left", `${Math.round(surfaceRect.left + horizontalInset)}px`);
  surfaceHud.style.setProperty(
    "--hud-right",
    `${Math.round(window.innerWidth - surfaceRect.right + horizontalInset)}px`,
  );
  surfaceHud.style.setProperty("--hud-bottom", `${Math.round(bottomInset)}px`);

  return {
    bottomInset,
    height: surfaceHud.getBoundingClientRect().height,
  };
}

function hidePointerGuide(): void {
  pointerGuide.classList.remove("is-visible");
}

function getViewportBoundaryPoint(from: Point, to: Point): Point | null {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;

  if (deltaX === 0 && deltaY === 0) return null;

  const candidates: Point[] = [];

  const intersections = [
    { x: 0, y: from.y + ((0 - from.x) * deltaY) / deltaX },
    {
      x: window.innerWidth,
      y: from.y + ((window.innerWidth - from.x) * deltaY) / deltaX,
    },
    { y: 0, x: from.x + ((0 - from.y) * deltaX) / deltaY },
    {
      y: window.innerHeight,
      x: from.x + ((window.innerHeight - from.y) * deltaX) / deltaY,
    },
  ];

  for (let index = 0; index < intersections.length; index += 1) {
    const point = intersections[index]!;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const isInsideViewport =
      point.x >= 0 && point.x <= window.innerWidth && point.y >= 0 && point.y <= window.innerHeight;
    const isForward =
      (deltaX === 0 || Math.sign(point.x - from.x) === Math.sign(deltaX)) &&
      (deltaY === 0 || Math.sign(point.y - from.y) === Math.sign(deltaY));

    if (isInsideViewport && isForward) {
      candidates.push({ x: point.x, y: point.y });
    }
  }

  if (candidates.length === 0) return null;

  return candidates.reduce((closest, candidate) => {
    const closestDistance = Math.hypot(closest.x - from.x, closest.y - from.y);
    const candidateDistance = Math.hypot(candidate.x - from.x, candidate.y - from.y);
    return candidateDistance < closestDistance ? candidate : closest;
  });
}

function renderPointerGuide(): void {
  if (!state.pointerInsideViewport) {
    hidePointerGuide();
    return;
  }

  const heartRect = heartShell.getBoundingClientRect();
  const isHeartVisible =
    heartRect.bottom >= 0 &&
    heartRect.top <= window.innerHeight &&
    heartRect.right >= 0 &&
    heartRect.left <= window.innerWidth;

  if (isHeartVisible) {
    hidePointerGuide();
    return;
  }

  const cursor = {
    x: clamp(state.pointerX, 0, window.innerWidth),
    y: clamp(state.pointerY, 0, window.innerHeight),
  };
  const heartCenter = {
    x: heartRect.left + heartRect.width / 2,
    y: heartRect.top + heartRect.height / 2,
  };
  const boundaryPoint = getViewportBoundaryPoint(cursor, heartCenter);

  if (boundaryPoint === null) {
    hidePointerGuide();
    return;
  }

  pointerGuide.setAttribute("viewBox", `0 0 ${window.innerWidth} ${window.innerHeight}`);
  pointerGuideLine.setAttribute("x1", cursor.x.toFixed(2));
  pointerGuideLine.setAttribute("y1", cursor.y.toFixed(2));
  pointerGuideLine.setAttribute("x2", boundaryPoint.x.toFixed(2));
  pointerGuideLine.setAttribute("y2", boundaryPoint.y.toFixed(2));
  pointerGuide.classList.add("is-visible");
}

function updateMetrics(): void {
  const width = surface.clientWidth;
  const height = getViewportHeight();
  const baseFontSize = clamp(width * 0.018, 15, 21);
  const fontSize = clamp(baseFontSize * state.fontScale, 12, 34);
  const lineHeight = getCopyLineHeight(fontSize);
  const paddingX = clamp(width * 0.07, 24, 88);
  const paddingY = clamp(height * 0.08, 28, 72);
  const textBounds = {
    x: paddingX,
    y: paddingY,
    width: width - paddingX * 2,
    height: Math.max(lineHeight * 5, height - paddingY * 2),
  };
  const baseHeartSize = clamp(Math.min(width * 0.14, height * 0.18), 68, 128);
  const heartSize = clamp(baseHeartSize * state.heartScale, 52, 188);
  const heartFootprintSize = Math.round(heartSize * state.wrapScale);
  const fontFamily =
    getComputedStyle(document.documentElement).getPropertyValue("--copy-font-family").trim() ||
    'Georgia, "Times New Roman", serif';
  const font = `400 ${fontSize}px ${fontFamily}`;
  const activeCopy = COPY_TEXTS[state.copyLanguage];

  surface.style.setProperty("--copy-font-size", `${fontSize}px`);

  if (font !== state.font || state.preparedLanguage !== state.copyLanguage) {
    state.font = font;
    state.prepared = prepareWithSegments(activeCopy, font);
    state.preparedLanguage = state.copyLanguage;
  }

  state.fontSize = fontSize;
  state.lineHeight = lineHeight;
  state.textBounds = textBounds;
  state.heartSize = heartSize;
  state.heartFootprintSize = heartFootprintSize;

  if (state.heartX === 0 && state.heartY === 0) {
    state.heartX = width / 2;
    state.heartY = height / 2;
  }

  const bounds = getMovementBounds(textBounds, heartFootprintSize);
  state.heartX = clamp(state.heartX, bounds.minX, bounds.maxX);
  state.heartY = clamp(state.heartY, bounds.minY, bounds.maxY);
}

function layoutFragments(): { fragments: TextFragment[]; contentBottom: number } {
  if (state.prepared === null) {
    return { fragments: [], contentBottom: state.textBounds.y };
  }

  const fragments: TextFragment[] = [];
  const cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
  const heartRect = {
    x: state.heartX - state.heartFootprintSize / 2,
    y: state.heartY - state.heartFootprintSize / 2,
    width: state.heartFootprintSize,
    height: state.heartFootprintSize,
  };
  const heartPolygon = transformPoints(HEART_POINTS, heartRect);
  const horizontalPadding = Math.max(10, state.fontSize * 0.7);
  const verticalPadding = Math.max(6, state.fontSize * 0.22);
  let contentBottom = state.textBounds.y;

  for (let bandTop = state.textBounds.y; ; bandTop += state.lineHeight) {
    const baseSlot = {
      left: state.textBounds.x,
      right: state.textBounds.x + state.textBounds.width,
    };
    const blockedInterval = getPolygonIntervalForBand(
      heartPolygon,
      bandTop,
      bandTop + state.lineHeight,
      horizontalPadding,
      verticalPadding,
    );
    // Each intersecting text band can split into left/right slots around the heart.
    const slots =
      blockedInterval === null ? [baseSlot] : carveTextLineSlots(baseSlot, [blockedInterval]);

    if (slots.length === 0) continue;

    let consumedLine = false;

    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slot = slots[slotIndex]!;
      const line = layoutNextLine(state.prepared, cursor, slot.right - slot.left);

      if (line === null) {
        return { fragments, contentBottom };
      }

      if (cursorsEqual(cursor, line.end)) {
        return { fragments, contentBottom };
      }

      cursor.segmentIndex = line.end.segmentIndex;
      cursor.graphemeIndex = line.end.graphemeIndex;
      consumedLine = true;
      contentBottom = bandTop + state.lineHeight;

      if (line.text.length > 0) {
        fragments.push({
          text: line.text,
          x: slot.left,
          y: bandTop,
          width: line.width,
        });
      }

      if (lineEndedWithHardBreak(state.prepared, line)) {
        break;
      }
    }

    if (!consumedLine) {
      break;
    }
  }

  return { fragments, contentBottom };
}

function render(): void {
  updateMetrics();
  const hudMetrics = positionHud();

  surface.style.setProperty("--heart-center-x", `${state.heartX}px`);
  surface.style.setProperty("--heart-center-y", `${state.heartY}px`);
  surface.style.setProperty(
    "--heart-aura-size",
    `${Math.round(state.heartFootprintSize * 1.45)}px`,
  );
  surface.style.setProperty(
    "--heart-vignette-size",
    `${Math.round(state.heartFootprintSize * 3.3)}px`,
  );

  const fragmentRoot = document.createDocumentFragment();
  const layout = layoutFragments();
  const hudSafeSpace =
    hudMetrics.height + hudMetrics.bottomInset + clamp(state.lineHeight * 1.1, 28, 56);
  const copyHeight = Math.max(getViewportHeight(), layout.contentBottom + hudSafeSpace);

  for (let index = 0; index < layout.fragments.length; index += 1) {
    const fragment = layout.fragments[index]!;
    const element = document.createElement("span");
    element.className = "copy-fragment";
    element.textContent = fragment.text;
    element.style.transform = `translate(${fragment.x}px, ${fragment.y}px)`;
    element.style.width = `${Math.ceil(fragment.width + 1)}px`;
    fragmentRoot.append(element);
  }

  copyLayer.replaceChildren(fragmentRoot);
  copyLayer.style.height = `${Math.ceil(copyHeight)}px`;
  heartShell.style.width = `${state.heartSize}px`;
  heartShell.style.height = `${state.heartSize}px`;
  heartShell.style.setProperty("--heart-footprint-size", `${state.heartFootprintSize}px`);
  heartShell.style.transform = `translate(${state.heartX - state.heartSize / 2}px, ${state.heartY - state.heartSize / 2}px)`;
  renderPointerGuide();
}

function scheduleRender(): void {
  if (state.rafId !== 0) return;
  state.rafId = window.requestAnimationFrame(() => {
    state.rafId = 0;
    render();
  });
}

function moveHeart(nextX: number, nextY: number): void {
  const bounds = getMovementBounds();

  state.heartX = clamp(nextX, bounds.minX, bounds.maxX);
  state.heartY = clamp(nextY, bounds.minY, bounds.maxY);
  scheduleRender();
}

function stepAutoPlay(frameTime: number): void {
  if (!state.autoPlay) {
    state.autoPlayFrameId = 0;
    state.autoPlayLastTime = 0;
    return;
  }

  if (state.autoPlayLastTime === 0) {
    state.autoPlayLastTime = frameTime;
  }

  const deltaTime = Math.min((frameTime - state.autoPlayLastTime) / 1000, 0.032);
  state.autoPlayLastTime = frameTime;

  if (!state.dragging) {
    const bounds = getMovementBounds();
    let nextX = state.heartX + state.autoVelocityX * deltaTime;
    let nextY = state.heartY + state.autoVelocityY * deltaTime;

    if (nextX <= bounds.minX) {
      nextX = bounds.minX;
      state.autoVelocityX = Math.abs(state.autoVelocityX);
    } else if (nextX >= bounds.maxX) {
      nextX = bounds.maxX;
      state.autoVelocityX = -Math.abs(state.autoVelocityX);
    }

    if (nextY <= bounds.minY) {
      nextY = bounds.minY;
      state.autoVelocityY = Math.abs(state.autoVelocityY);
    } else if (nextY >= bounds.maxY) {
      nextY = bounds.maxY;
      state.autoVelocityY = -Math.abs(state.autoVelocityY);
    }

    state.heartX = nextX;
    state.heartY = nextY;
    scheduleRender();
  }

  state.autoPlayFrameId = window.requestAnimationFrame(stepAutoPlay);
}

function startAutoPlay(): void {
  if (state.autoPlayFrameId !== 0) return;
  state.autoPlayLastTime = 0;
  state.autoPlayFrameId = window.requestAnimationFrame(stepAutoPlay);
}

function stopAutoPlay(): void {
  if (state.autoPlayFrameId !== 0) {
    window.cancelAnimationFrame(state.autoPlayFrameId);
    state.autoPlayFrameId = 0;
  }
  state.autoPlayLastTime = 0;
}

heartShell.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  const heartRect = heartShell.getBoundingClientRect();
  state.dragging = true;
  state.pointerMoved = false;
  state.pointerStartX = event.clientX;
  state.pointerStartY = event.clientY;
  state.dragOffsetX = event.clientX - heartRect.left;
  state.dragOffsetY = event.clientY - heartRect.top;
  surface.classList.add("is-dragging");
  heartShell.setPointerCapture(event.pointerId);
});

heartShell.addEventListener("pointermove", (event) => {
  if (!state.dragging) return;

  if (
    Math.abs(event.clientX - state.pointerStartX) > 4 ||
    Math.abs(event.clientY - state.pointerStartY) > 4
  ) {
    state.pointerMoved = true;
  }

  const surfaceRect = surface.getBoundingClientRect();
  moveHeart(
    event.clientX - surfaceRect.left - state.dragOffsetX + state.heartSize / 2,
    event.clientY - surfaceRect.top - state.dragOffsetY + state.heartSize / 2,
  );
});

function stopDragging(pointerId?: number): void {
  state.dragging = false;
  surface.classList.remove("is-dragging");
  if (pointerId !== undefined && heartShell.hasPointerCapture(pointerId)) {
    heartShell.releasePointerCapture(pointerId);
  }
}

heartShell.addEventListener("pointerup", (event) => {
  if (!state.pointerMoved) {
    triggerHeartPulse();
  }
  stopDragging(event.pointerId);
});

heartShell.addEventListener("pointercancel", (event) => {
  stopDragging(event.pointerId);
});

heartShell.addEventListener("keydown", (event) => {
  const distance = event.shiftKey ? 28 : 12;

  switch (event.key) {
    case "ArrowLeft":
      event.preventDefault();
      moveHeart(state.heartX - distance, state.heartY);
      break;
    case "ArrowRight":
      event.preventDefault();
      moveHeart(state.heartX + distance, state.heartY);
      break;
    case "ArrowUp":
      event.preventDefault();
      moveHeart(state.heartX, state.heartY - distance);
      break;
    case "ArrowDown":
      event.preventDefault();
      moveHeart(state.heartX, state.heartY + distance);
      break;
    case "Enter":
    case " ":
      event.preventDefault();
      triggerHeartPulse();
      break;
    default:
      break;
  }
});

fontScaleInput.addEventListener("input", () => {
  state.fontScale = Number.parseInt(fontScaleInput.value, 10) / 100;
  updateControlLabels();
  scheduleRender();
});

heartScaleInput.addEventListener("input", () => {
  state.heartScale = Number.parseInt(heartScaleInput.value, 10) / 100;
  updateControlLabels();
  scheduleRender();
});

controlPanelToggle.addEventListener("click", () => {
  state.controlsCollapsed = !state.controlsCollapsed;
  syncControlPanelState();
  scheduleRender();
});

for (let index = 0; index < languageButtons.length; index += 1) {
  const button = languageButtons[index]!;
  button.addEventListener("click", () => {
    const nextLanguage = button.dataset.language as CopyLanguage | undefined;
    if (nextLanguage === undefined || nextLanguage === state.copyLanguage) return;

    state.copyLanguage = nextLanguage;
    updateLanguageToggle();
    scheduleRender();
  });
}

autoPlayInput.addEventListener("change", () => {
  state.autoPlay = autoPlayInput.checked;
  updateControlLabels();
  if (state.autoPlay) {
    startAutoPlay();
  } else {
    stopAutoPlay();
  }
});

state.autoPlay = autoPlayInput.checked;
state.fontScale = Number.parseInt(fontScaleInput.value, 10) / 100;
state.heartScale = Number.parseInt(heartScaleInput.value, 10) / 100;
state.controlsCollapsed = window.matchMedia("(max-width: 720px)").matches;
updateControlLabels();
updateLanguageToggle();
syncControlPanelState();

new ResizeObserver(() => {
  scheduleRender();
}).observe(surface);

new ResizeObserver(() => {
  scheduleRender();
}).observe(surfaceHud);

new ResizeObserver(() => {
  scheduleRender();
}).observe(creditFooter);

window.addEventListener(
  "pointermove",
  (event) => {
    if (event.pointerType === "touch") {
      state.pointerInsideViewport = false;
      hidePointerGuide();
      return;
    }

    state.pointerX = event.clientX;
    state.pointerY = event.clientY;
    state.pointerInsideViewport = true;
    renderPointerGuide();
  },
  { passive: true },
);

window.addEventListener(
  "pointerdown",
  (event) => {
    if (event.pointerType !== "touch") return;
    state.pointerInsideViewport = false;
    hidePointerGuide();
  },
  { passive: true },
);

window.addEventListener("pointerleave", () => {
  state.pointerInsideViewport = false;
  hidePointerGuide();
});

window.addEventListener(
  "scroll",
  () => {
    renderPointerGuide();
  },
  { passive: true },
);

window.addEventListener("resize", () => {
  scheduleRender();
  renderPointerGuide();
});

if ("fonts" in document) {
  void document.fonts.ready.then(() => {
    scheduleRender();
  });
} else {
  scheduleRender();
}
