import { FileNode } from "../types";
import { formatBytes } from "../utils";

export interface DisplayNode extends FileNode {
  isVirtualOther?: boolean;
  itemCount?: number;
}

export interface TreemapRect<T = DisplayNode> {
  x: number;
  y: number;
  width: number;
  height: number;
  data: T;
  color: NodeColorTheme;
}

export interface SunburstSector<T = DisplayNode> {
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  data: T;
  color: NodeColorTheme;
}

export type ColorMode = "category" | "heatmap";
export type GalaxyViewMode = "sunburst" | "treemap";

export interface NodeColorTheme {
  bgFrom: string;
  bgTo: string;
  border: string;
  glow: string;
  accent: string;
  textColor: string;
}

export interface HeatmapTier {
  label: string;
  badge: string;
  minDays: number;
  maxDays: number;
  theme: NodeColorTheme;
}

// 🌌 高端深色星系冷热数据热力调色板 (Cosmic Dark Glassmorphism)
export const HEATMAP_TIERS: HeatmapTier[] = [
  {
    label: "极寒深冻 (>180 天)",
    badge: "🧊 极寒",
    minDays: 180,
    maxDays: Infinity,
    theme: {
      bgFrom: "rgba(14, 48, 92, 0.85)",
      bgTo: "rgba(2, 132, 199, 0.55)",
      border: "rgba(56, 189, 248, 0.85)",
      glow: "rgba(56, 189, 248, 0.50)",
      accent: "#38bdf8",
      textColor: "#e0f2fe",
    },
  },
  {
    label: "次冷沉淀 (60~180 天)",
    badge: "❄️ 次冷",
    minDays: 60,
    maxDays: 180,
    theme: {
      bgFrom: "rgba(14, 68, 96, 0.85)",
      bgTo: "rgba(8, 145, 178, 0.55)",
      border: "rgba(34, 211, 238, 0.85)",
      glow: "rgba(34, 211, 238, 0.50)",
      accent: "#22d3ee",
      textColor: "#cffafe",
    },
  },
  {
    label: "温和星云 (14~60 天)",
    badge: "🌿 温和",
    minDays: 14,
    maxDays: 60,
    theme: {
      bgFrom: "rgba(6, 78, 59, 0.85)",
      bgTo: "rgba(5, 150, 105, 0.55)",
      border: "rgba(52, 211, 153, 0.85)",
      glow: "rgba(52, 211, 153, 0.50)",
      accent: "#34d399",
      textColor: "#d1fae5",
    },
  },
  {
    label: "活跃恒星 (3~14 天)",
    badge: "☀️ 活跃",
    minDays: 3,
    maxDays: 14,
    theme: {
      bgFrom: "rgba(120, 53, 15, 0.85)",
      bgTo: "rgba(217, 119, 6, 0.55)",
      border: "rgba(251, 191, 36, 0.85)",
      glow: "rgba(251, 191, 36, 0.50)",
      accent: "#fbbf24",
      textColor: "#fef3c7",
    },
  },
  {
    label: "超热耀斑 (<3 天)",
    badge: "🔥 耀斑",
    minDays: 0,
    maxDays: 3,
    theme: {
      bgFrom: "rgba(136, 19, 55, 0.85)",
      bgTo: "rgba(225, 29, 72, 0.60)",
      border: "rgba(251, 113, 133, 0.90)",
      glow: "rgba(251, 113, 133, 0.60)",
      accent: "#fb7185",
      textColor: "#ffe4e6",
    },
  },
];

// 🎨 优雅多样彩虹光谱（DaisyDisk 式多层彩色环，相邻色差分明）
export const SPECTRUM_PALETTE: NodeColorTheme[] = [
  {
    bgFrom: "rgba(99, 102, 241, 0.85)",
    bgTo: "rgba(139, 92, 246, 0.55)",
    border: "rgba(165, 180, 252, 0.90)",
    glow: "rgba(129, 140, 248, 0.50)",
    accent: "#a5b4fc",
    textColor: "#e0e7ff",
  },
  {
    bgFrom: "rgba(14, 165, 233, 0.85)",
    bgTo: "rgba(56, 189, 248, 0.55)",
    border: "rgba(125, 211, 252, 0.90)",
    glow: "rgba(56, 189, 248, 0.50)",
    accent: "#38bdf8",
    textColor: "#e0f2fe",
  },
  {
    bgFrom: "rgba(16, 185, 129, 0.85)",
    bgTo: "rgba(52, 211, 153, 0.55)",
    border: "rgba(110, 231, 183, 0.90)",
    glow: "rgba(52, 211, 153, 0.50)",
    accent: "#34d399",
    textColor: "#d1fae5",
  },
  {
    bgFrom: "rgba(245, 158, 11, 0.85)",
    bgTo: "rgba(251, 191, 36, 0.55)",
    border: "rgba(252, 211, 77, 0.90)",
    glow: "rgba(251, 191, 36, 0.50)",
    accent: "#fbbf24",
    textColor: "#fef3c7",
  },
  {
    bgFrom: "rgba(236, 72, 153, 0.85)",
    bgTo: "rgba(244, 114, 182, 0.55)",
    border: "rgba(249, 168, 212, 0.90)",
    glow: "rgba(244, 114, 182, 0.50)",
    accent: "#f472b6",
    textColor: "#fce7f3",
  },
  {
    bgFrom: "rgba(6, 182, 212, 0.85)",
    bgTo: "rgba(34, 211, 238, 0.55)",
    border: "rgba(103, 232, 249, 0.90)",
    glow: "rgba(34, 211, 238, 0.50)",
    accent: "#22d3ee",
    textColor: "#cffafe",
  },
  {
    bgFrom: "rgba(249, 115, 22, 0.85)",
    bgTo: "rgba(251, 146, 60, 0.55)",
    border: "rgba(253, 186, 116, 0.90)",
    glow: "rgba(251, 146, 60, 0.50)",
    accent: "#fb923c",
    textColor: "#ffedd5",
  },
  {
    bgFrom: "rgba(168, 85, 247, 0.85)",
    bgTo: "rgba(192, 132, 252, 0.55)",
    border: "rgba(216, 180, 254, 0.90)",
    glow: "rgba(192, 132, 252, 0.50)",
    accent: "#c084fc",
    textColor: "#f3e8ff",
  },
  {
    bgFrom: "rgba(225, 29, 72, 0.85)",
    bgTo: "rgba(244, 63, 94, 0.55)",
    border: "rgba(251, 113, 133, 0.90)",
    glow: "rgba(244, 63, 94, 0.50)",
    accent: "#fb7185",
    textColor: "#ffe4e6",
  },
  {
    bgFrom: "rgba(20, 184, 166, 0.85)",
    bgTo: "rgba(45, 212, 191, 0.55)",
    border: "rgba(94, 234, 212, 0.90)",
    glow: "rgba(45, 212, 191, 0.50)",
    accent: "#2dd4bf",
    textColor: "#ccfbf1",
  },
];

// 其它碎文件的中性灰蓝调色板
export const OTHER_ITEMS_THEME: NodeColorTheme = {
  bgFrom: "rgba(51, 65, 85, 0.70)",
  bgTo: "rgba(71, 85, 105, 0.45)",
  border: "rgba(148, 163, 184, 0.65)",
  glow: "rgba(148, 163, 184, 0.25)",
  accent: "#94a3b8",
  textColor: "#e2e8f0",
};

/**
 * 🌟 核心聚合器 (DaisyDisk-style Top-N + Others Aggregator)
 * 提取占用最大的 Top-12 项，其余全部聚合成「其它较小项目 (N 项)」，
 * 保证画布永远呈现 6~14 个宽大饱满的大扇区。
 */
export function aggregateNodesForDisplay(
  nodes: FileNode[],
  maxTopItems: number = 12,
  minPercentage: number = 0.015
): DisplayNode[] {
  if (nodes.length <= maxTopItems) {
    return nodes.map((n) => ({ ...n }));
  }

  const valid = nodes.filter((n) => n.size > 0);
  const totalSize = valid.reduce((acc, curr) => acc + curr.size, 0);
  if (totalSize === 0) return [];

  const sorted = [...valid].sort((a, b) => b.size - a.size);

  const topItems: DisplayNode[] = [];
  const otherItems: FileNode[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const pct = item.size / totalSize;

    if (topItems.length < maxTopItems && (pct >= minPercentage || topItems.length < 5)) {
      topItems.push({ ...item });
    } else {
      otherItems.push(item);
    }
  }

  if (otherItems.length > 0) {
    const otherSize = otherItems.reduce((acc, curr) => acc + curr.size, 0);
    const otherNode: DisplayNode = {
      name: `其它较小项目 (${otherItems.length}项)`,
      path: `${otherItems[0].path} [aggregated]`,
      isDir: true,
      size: otherSize,
      fileCount: otherItems.reduce((acc, curr) => acc + (curr.fileCount || 0), 0),
      isLink: false,
      linkTarget: undefined,
      purpose: "包含众多零散小文件",
      risk: undefined,
      riskNote: undefined,
      cleanable: false,
      migratable: false,
      isHeuristic: false,
      hasChildren: false,
      modifiedTime: undefined,
      daysSinceModified: 90,
      isVirtualOther: true,
      itemCount: otherItems.length,
    };
    topItems.push(otherNode);
  }

  return topItems;
}

export function getNodeColorTheme(
  node: DisplayNode,
  mode: ColorMode,
  index: number = 0
): NodeColorTheme {
  if (node.isVirtualOther) {
    return OTHER_ITEMS_THEME;
  }

  if (mode === "heatmap") {
    const days = node.daysSinceModified ?? 30;
    for (const tier of HEATMAP_TIERS) {
      if (days >= tier.minDays && days < tier.maxDays) {
        return tier.theme;
      }
    }
    return OTHER_ITEMS_THEME;
  }

  return SPECTRUM_PALETTE[index % SPECTRUM_PALETTE.length];
}

/**
 * 绘制高品质深邃星空背景与暗黑微光网格（极速无 save/restore 内存开销版）
 */
export function drawStarfield(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  const bgGrad = ctx.createRadialGradient(
    width / 2,
    height / 2,
    40,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.7
  );
  bgGrad.addColorStop(0, "#0c1322");
  bgGrad.addColorStop(0.6, "#080c16");
  bgGrad.addColorStop(1, "#04070e");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.025)";
  ctx.lineWidth = 1;
  const gridSize = 50;
  ctx.beginPath();
  for (let x = 0; x < width; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = 0; y < height; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  // 绘制星芒点，避免在循环中 save/restore
  const starCount = Math.min(80, Math.floor((width * height) / 10000));
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.beginPath();
  for (let i = 0; i < starCount; i++) {
    const sx = (Math.sin(i * 123.456) * 0.5 + 0.5) * width;
    const sy = (Math.cos(i * 654.321) * 0.5 + 0.5) * height;
    const r = (Math.sin(i * 987.654) * 0.5 + 0.5) * 1.0 + 0.5;
    ctx.moveTo(sx + r, sy);
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
  }
  ctx.fill();
}

/**
 * 🌌 DaisyDisk 风格星系同心罗盘算法
 */
export function computeSunburstSectors(
  rawNodes: FileNode[],
  innerRadius: number,
  outerRadius: number,
  colorMode: ColorMode = "category"
): SunburstSector<DisplayNode>[] {
  const displayNodes = aggregateNodesForDisplay(rawNodes, 12, 0.02);
  if (displayNodes.length === 0) return [];

  const totalSize = displayNodes.reduce((acc, curr) => acc + curr.size, 0);
  const sectors: SunburstSector<DisplayNode>[] = [];

  let currentAngle = -Math.PI / 2;
  const fullCircle = Math.PI * 2;
  const minAngle = 0.10;

  for (let i = 0; i < displayNodes.length; i++) {
    const n = displayNodes[i];
    let span = (n.size / totalSize) * fullCircle;
    if (span < minAngle) span = minAngle;

    const endAngle = currentAngle + span;

    sectors.push({
      startAngle: currentAngle,
      endAngle,
      innerRadius,
      outerRadius,
      data: n,
      color: getNodeColorTheme(n, colorMode, i),
    });

    currentAngle = endAngle;
  }

  return sectors;
}

/**
 * 绘制 DaisyDisk 星盘罗盘
 */
export function drawSunburstWheel(
  ctx: CanvasRenderingContext2D,
  sectors: SunburstSector<DisplayNode>[],
  centerX: number,
  centerY: number,
  coreRadius: number,
  currentPath: string,
  totalSize: number,
  hoveredSector: SunburstSector<DisplayNode> | null,
  selectedSector: SunburstSector<DisplayNode> | null
) {
  // 1. 绘制核心母星光环
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, coreRadius - 6, 0, Math.PI * 2);

  const coreGrad = ctx.createRadialGradient(
    centerX,
    centerY,
    15,
    centerX,
    centerY,
    coreRadius
  );
  coreGrad.addColorStop(0, "rgba(30, 58, 138, 0.95)");
  coreGrad.addColorStop(0.65, "rgba(15, 23, 42, 0.98)");
  coreGrad.addColorStop(1, "rgba(2, 6, 23, 1)");
  ctx.fillStyle = coreGrad;
  ctx.fill();

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(56, 189, 248, 0.70)";
  ctx.shadowColor = "#38bdf8";
  ctx.shadowBlur = 20;
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const basename = currentPath.replace(/\\$/, "").split("\\").pop() || currentPath;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText(basename, centerX, centerY - 16);

  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 15px ui-monospace, SFMono-Regular, monospace";
  ctx.fillText(formatBytes(totalSize), centerX, centerY + 8);

  ctx.fillStyle = "rgba(255, 255, 255, 0.60)";
  ctx.font = "500 11px -apple-system, sans-serif";
  ctx.fillText(`${sectors.length} 个主要扇区`, centerX, centerY + 28);
  ctx.restore();

  // 2. 绘制星环扇区
  for (const s of sectors) {
    const isHovered = hoveredSector?.data.path === s.data.path;
    const isSelected = selectedSector?.data.path === s.data.path;

    ctx.save();

    let drawInner = s.innerRadius;
    let drawOuter = s.outerRadius;
    if (isHovered || isSelected) {
      drawOuter += 12;
      drawInner -= 2;
      ctx.shadowColor = isSelected ? "#38bdf8" : s.color.glow;
      ctx.shadowBlur = 26;
    }

    ctx.beginPath();
    const gap = 0.025;
    const a1 = s.startAngle + gap / 2;
    const a2 = s.endAngle - gap / 2;

    ctx.arc(centerX, centerY, drawOuter, a1, a2, false);
    ctx.arc(centerX, centerY, drawInner, a2, a1, true);
    ctx.closePath();

    const midAngle = (a1 + a2) / 2;
    const gradX1 = centerX + Math.cos(midAngle) * drawInner;
    const gradY1 = centerY + Math.sin(midAngle) * drawInner;
    const gradX2 = centerX + Math.cos(midAngle) * drawOuter;
    const gradY2 = centerY + Math.sin(midAngle) * drawOuter;

    const sectorGrad = ctx.createLinearGradient(gradX1, gradY1, gradX2, gradY2);
    if (isSelected) {
      sectorGrad.addColorStop(0, "rgba(56, 189, 248, 1)");
      sectorGrad.addColorStop(1, "rgba(14, 116, 144, 0.90)");
    } else if (isHovered) {
      sectorGrad.addColorStop(0, s.color.bgFrom.replace(/0\.\d+\)/, "1)"));
      sectorGrad.addColorStop(1, s.color.bgTo.replace(/0\.\d+\)/, "0.85)"));
    } else {
      sectorGrad.addColorStop(0, s.color.bgFrom);
      sectorGrad.addColorStop(1, s.color.bgTo);
    }

    ctx.fillStyle = sectorGrad;
    ctx.fill();

    ctx.lineWidth = isSelected ? 3 : isHovered ? 2.5 : 1.2;
    ctx.strokeStyle = isSelected
      ? "#ffffff"
      : isHovered
      ? "#ffffff"
      : s.color.border;
    ctx.stroke();

    const angleSpan = a2 - a1;
    if (angleSpan > 0.18 && drawOuter - drawInner > 35) {
      ctx.shadowBlur = 0;
      ctx.save();
      const labelRadius = (drawInner + drawOuter) / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate(midAngle);

      let text = s.data.name;
      if (text.length > 12) text = text.slice(0, 11) + "…";

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      if (midAngle > Math.PI / 2 || midAngle < -Math.PI / 2) {
        ctx.translate(labelRadius, 0);
        ctx.rotate(Math.PI);
        ctx.fillText(text, 0, -6);
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillStyle = s.color.accent;
        ctx.fillText(formatBytes(s.data.size), 0, 8);
      } else {
        ctx.fillText(text, labelRadius, -6);
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillStyle = s.color.accent;
        ctx.fillText(formatBytes(s.data.size), labelRadius, 8);
      }
      ctx.restore();
    }

    ctx.restore();
  }
}

/**
 * Squarified Treemap Algorithm
 */
export function computeSquarifiedTreemap(
  rawNodes: FileNode[],
  width: number,
  height: number,
  padding: number = 6,
  colorMode: ColorMode = "category"
): TreemapRect<DisplayNode>[] {
  if (rawNodes.length === 0 || width <= 0 || height <= 0) return [];

  const displayNodes = aggregateNodesForDisplay(rawNodes, 16, 0.015);
  const totalSize = displayNodes.reduce((acc, curr) => acc + curr.size, 0);
  const totalArea = width * height;

  interface Item {
    node: DisplayNode;
    area: number;
    index: number;
  }

  const items: Item[] = displayNodes.map((n, idx) => ({
    node: n,
    area: (n.size / totalSize) * totalArea,
    index: idx,
  }));

  items.sort((a, b) => b.area - a.area);

  const rects: TreemapRect<DisplayNode>[] = [];

  function worst(rowAreas: number[], sideLength: number): number {
    if (rowAreas.length === 0 || sideLength === 0) return Infinity;
    const sum = rowAreas.reduce((acc, val) => acc + val, 0);
    const max = Math.max(...rowAreas);
    const min = Math.min(...rowAreas);
    const side2 = sideLength * sideLength;
    const sum2 = sum * sum;
    return Math.max((side2 * max) / sum2, sum2 / (side2 * min));
  }

  function layoutRow(
    row: Item[],
    x: number,
    y: number,
    sideLength: number,
    isVertical: boolean
  ) {
    const rowArea = row.reduce((acc, curr) => acc + curr.area, 0);
    const rowThickness = rowArea / sideLength;
    let offset = 0;

    for (const item of row) {
      const itemLen = item.area / rowThickness;
      let rx: number, ry: number, rw: number, rh: number;

      if (isVertical) {
        rx = x;
        ry = y + offset;
        rw = rowThickness;
        rh = itemLen;
      } else {
        rx = x + offset;
        ry = y;
        rw = itemLen;
        rh = rowThickness;
      }

      rects.push({
        x: rx + padding / 2,
        y: ry + padding / 2,
        width: Math.max(0, rw - padding),
        height: Math.max(0, rh - padding),
        data: item.node,
        color: getNodeColorTheme(item.node, colorMode, item.index),
      });

      offset += itemLen;
    }
  }

  function squarify(
    children: Item[],
    row: Item[],
    x: number,
    y: number,
    w: number,
    h: number
  ) {
    if (w <= 0 || h <= 0) return;
    if (children.length === 0) {
      if (row.length > 0) {
        const isVertical = w >= h;
        const shortSide = Math.min(w, h);
        layoutRow(row, x, y, shortSide, !isVertical);
      }
      return;
    }

    const nextChild = children[0];
    const isVertical = w >= h;
    const shortSide = Math.min(w, h);

    const currentWorst =
      row.length === 0 ? Infinity : worst(row.map((r) => r.area), shortSide);
    const newRow = [...row, nextChild];
    const newWorst = worst(newRow.map((r) => r.area), shortSide);

    if (newWorst <= currentWorst || row.length === 0) {
      squarify(children.slice(1), newRow, x, y, w, h);
    } else {
      const rowArea = row.reduce((acc, r) => acc + r.area, 0);
      const rowThickness = rowArea / shortSide;

      if (isVertical) {
        layoutRow(row, x, y, shortSide, false);
        squarify(children, [], x + rowThickness, y, w - rowThickness, h);
      } else {
        layoutRow(row, x, y, shortSide, true);
        squarify(children, [], x, y + rowThickness, w, h - rowThickness);
      }
    }
  }

  squarify(items, [], 0, 0, width, height);
  return rects;
}

/**
 * 绘制高质感毛玻璃星系矩阵单元格
 */
export function drawTreemapCell(
  ctx: CanvasRenderingContext2D,
  rect: TreemapRect<DisplayNode>,
  isHovered: boolean,
  isSelected: boolean,
  totalDiskSize: number
) {
  const { x, y, width, height, data, color } = rect;
  if (width < 3 || height < 3) return;

  const radius = Math.min(8, width / 4, height / 4);

  ctx.save();

  if (isSelected || isHovered) {
    ctx.shadowColor = isSelected ? "#38bdf8" : color.glow;
    ctx.shadowBlur = isSelected ? 24 : 16;
  }

  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);

  const grad = ctx.createLinearGradient(x, y, x + width, y + height);
  if (isSelected) {
    grad.addColorStop(0, "rgba(14, 116, 144, 0.95)");
    grad.addColorStop(1, "rgba(56, 189, 248, 0.85)");
  } else if (isHovered) {
    grad.addColorStop(0, color.bgFrom.replace(/0\.\d+\)/, "0.95)"));
    grad.addColorStop(1, color.bgTo.replace(/0\.\d+\)/, "0.80)"));
  } else {
    grad.addColorStop(0, color.bgFrom);
    grad.addColorStop(1, color.bgTo);
  }
  ctx.fillStyle = grad;
  ctx.fill();

  const sheenHeight = Math.min(height * 0.4, 28);
  if (sheenHeight > 4 && width > 10) {
    const sheenGrad = ctx.createLinearGradient(x, y, x, y + sheenHeight);
    sheenGrad.addColorStop(0, "rgba(255, 255, 255, 0.16)");
    sheenGrad.addColorStop(1, "rgba(255, 255, 255, 0.0)");
    ctx.fillStyle = sheenGrad;
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 1, width - 2, sheenHeight, [radius, radius, 0, 0]);
    ctx.fill();
  }

  ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1;
  ctx.strokeStyle = isSelected
    ? "#38bdf8"
    : isHovered
    ? "#ffffff"
    : color.border;
  ctx.stroke();

  const pad = 10;
  const availW = width - pad * 2;
  const availH = height - pad * 2;

  if (availW >= 40 && availH >= 24) {
    const iconSymbol = data.isVirtualOther ? "📦" : data.isDir ? "📁" : "📄";
    ctx.font = `12px -apple-system, sans-serif`;
    ctx.fillStyle = color.accent;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(iconSymbol, x + pad, y + pad);

    const nameX = x + pad + 18;
    const maxNameW = availW - 20;
    ctx.font = `bold ${Math.min(13, Math.max(11, Math.floor(width / 12)))}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillStyle = "#ffffff";

    let nameText = data.name;
    while (ctx.measureText(nameText).width > maxNameW && nameText.length > 3) {
      nameText = nameText.slice(0, -2) + "...";
    }
    ctx.fillText(nameText, nameX, y + pad);

    if (availH >= 52) {
      const sizeY = y + pad + 20;
      ctx.fillStyle = color.accent;
      ctx.font = `bold ${Math.min(14, Math.max(11, Math.floor(width / 14)))}px ui-monospace, monospace`;
      ctx.fillText(formatBytes(data.size), x + pad, sizeY);

      if (totalDiskSize > 0 && availW >= 90) {
        const pct = ((data.size / totalDiskSize) * 100).toFixed(1) + "%";
        ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
        ctx.font = `500 10px ui-monospace, monospace`;
        ctx.fillText(`(${pct})`, x + pad + ctx.measureText(formatBytes(data.size)).width + 6, sizeY + 2);
      }
    }
  }

  ctx.restore();
}
