import { FileNode } from "../types";
import { formatBytes } from "../utils";

export interface TreemapRect<T = FileNode> {
  x: number;
  y: number;
  width: number;
  height: number;
  data: T;
  color: {
    bgFrom: string;
    bgTo: string;
    border: string;
    glow: string;
    accent: string;
    textColor: string;
  };
}

export interface SunburstSector<T = FileNode> {
  startAngle: number;
  endAngle: number;
  innerRadius: number;
  outerRadius: number;
  data: T;
  color: {
    bgFrom: string;
    bgTo: string;
    border: string;
    glow: string;
    accent: string;
    textColor: string;
  };
}

export type ColorMode = "category" | "heatmap";
export type GalaxyViewMode = "sunburst" | "treemap";

export interface HeatmapTier {
  label: string;
  badge: string;
  minDays: number;
  maxDays: number;
  bgFrom: string;
  bgTo: string;
  border: string;
  glow: string;
  accent: string;
  textColor: string;
}

// 🌌 高端深色星系冷热数据热力调色板 (Cosmic Dark Glassmorphism)
export const HEATMAP_TIERS: HeatmapTier[] = [
  {
    label: "极寒深冻 (>180 天)",
    badge: "🧊 极寒",
    minDays: 180,
    maxDays: Infinity,
    bgFrom: "rgba(12, 38, 77, 0.75)",
    bgTo: "rgba(3, 105, 161, 0.45)",
    border: "rgba(56, 189, 248, 0.65)",
    glow: "rgba(56, 189, 248, 0.35)",
    accent: "#38bdf8",
    textColor: "#e0f2fe",
  },
  {
    label: "次冷沉淀 (60~180 天)",
    badge: "❄️ 次冷",
    minDays: 60,
    maxDays: 180,
    bgFrom: "rgba(14, 58, 82, 0.75)",
    bgTo: "rgba(8, 145, 178, 0.45)",
    border: "rgba(34, 211, 238, 0.65)",
    glow: "rgba(34, 211, 238, 0.35)",
    accent: "#22d3ee",
    textColor: "#cffafe",
  },
  {
    label: "温和星云 (14~60 天)",
    badge: "🌿 温和",
    minDays: 14,
    maxDays: 60,
    bgFrom: "rgba(6, 64, 50, 0.75)",
    bgTo: "rgba(5, 150, 105, 0.45)",
    border: "rgba(52, 211, 153, 0.65)",
    glow: "rgba(52, 211, 153, 0.35)",
    accent: "#34d399",
    textColor: "#d1fae5",
  },
  {
    label: "活跃恒星 (3~14 天)",
    badge: "☀️ 活跃",
    minDays: 3,
    maxDays: 14,
    bgFrom: "rgba(92, 45, 15, 0.75)",
    bgTo: "rgba(217, 119, 6, 0.45)",
    border: "rgba(251, 191, 36, 0.65)",
    glow: "rgba(251, 191, 36, 0.35)",
    accent: "#fbbf24",
    textColor: "#fef3c7",
  },
  {
    label: "超热耀斑 (<3 天)",
    badge: "🔥 耀斑",
    minDays: 0,
    maxDays: 3,
    bgFrom: "rgba(105, 16, 45, 0.75)",
    bgTo: "rgba(225, 29, 72, 0.50)",
    border: "rgba(251, 113, 133, 0.75)",
    glow: "rgba(251, 113, 133, 0.45)",
    accent: "#fb7185",
    textColor: "#ffe4e6",
  },
];

export const CATEGORY_PALETTE: Record<
  string,
  {
    bgFrom: string;
    bgTo: string;
    border: string;
    glow: string;
    accent: string;
    textColor: string;
  }
> = {
  disk_image: {
    bgFrom: "rgba(76, 29, 149, 0.75)",
    bgTo: "rgba(139, 92, 246, 0.45)",
    border: "rgba(192, 132, 252, 0.65)",
    glow: "rgba(192, 132, 252, 0.35)",
    accent: "#c084fc",
    textColor: "#f3e8ff",
  },
  model: {
    bgFrom: "rgba(131, 24, 67, 0.75)",
    bgTo: "rgba(219, 39, 119, 0.45)",
    border: "rgba(244, 114, 182, 0.65)",
    glow: "rgba(244, 114, 182, 0.35)",
    accent: "#f472b6",
    textColor: "#fce7f3",
  },
  media: {
    bgFrom: "rgba(12, 74, 110, 0.75)",
    bgTo: "rgba(14, 165, 233, 0.45)",
    border: "rgba(56, 189, 248, 0.65)",
    glow: "rgba(56, 189, 248, 0.35)",
    accent: "#38bdf8",
    textColor: "#e0f2fe",
  },
  archive: {
    bgFrom: "rgba(120, 53, 15, 0.75)",
    bgTo: "rgba(245, 158, 11, 0.45)",
    border: "rgba(251, 191, 36, 0.65)",
    glow: "rgba(251, 191, 36, 0.35)",
    accent: "#fbbf24",
    textColor: "#fef3c7",
  },
  executable: {
    bgFrom: "rgba(6, 78, 59, 0.75)",
    bgTo: "rgba(16, 185, 129, 0.45)",
    border: "rgba(52, 211, 153, 0.65)",
    glow: "rgba(52, 211, 153, 0.35)",
    accent: "#34d399",
    textColor: "#d1fae5",
  },
  database: {
    bgFrom: "rgba(21, 94, 117, 0.75)",
    bgTo: "rgba(6, 182, 212, 0.45)",
    border: "rgba(34, 211, 238, 0.65)",
    glow: "rgba(34, 211, 238, 0.35)",
    accent: "#22d3ee",
    textColor: "#cffafe",
  },
  cache: {
    bgFrom: "rgba(49, 46, 129, 0.75)",
    bgTo: "rgba(99, 102, 241, 0.45)",
    border: "rgba(129, 140, 248, 0.65)",
    glow: "rgba(129, 140, 248, 0.35)",
    accent: "#818cf8",
    textColor: "#e0e7ff",
  },
  dir: {
    bgFrom: "rgba(30, 41, 59, 0.80)",
    bgTo: "rgba(51, 65, 85, 0.55)",
    border: "rgba(100, 116, 139, 0.65)",
    glow: "rgba(100, 116, 139, 0.30)",
    accent: "#94a3b8",
    textColor: "#f8fafc",
  },
  other: {
    bgFrom: "rgba(15, 23, 42, 0.85)",
    bgTo: "rgba(30, 41, 59, 0.55)",
    border: "rgba(71, 85, 105, 0.60)",
    glow: "rgba(71, 85, 105, 0.25)",
    accent: "#64748b",
    textColor: "#f1f5f9",
  },
};

export function getFileCategory(node: FileNode): string {
  if (node.isDir) return "dir";
  const ext = node.name.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "vhdx":
    case "vhd":
    case "vmdk":
    case "iso":
    case "img":
      return "disk_image";
    case "gguf":
    case "safetensors":
    case "ckpt":
    case "bin":
    case "pt":
    case "onnx":
      return "model";
    case "mp4":
    case "mkv":
    case "avi":
    case "mov":
    case "mp3":
    case "wav":
      return "media";
    case "zip":
    case "7z":
    case "rar":
    case "tar":
    case "gz":
      return "archive";
    case "exe":
    case "msi":
    case "dll":
    case "sys":
      return "executable";
    case "bak":
    case "mdf":
    case "db":
    case "sqlite":
      return "database";
    default:
      if (node.isHeuristic || node.cleanable) return "cache";
      return "other";
  }
}

export function getNodeColorTheme(
  node: FileNode,
  mode: ColorMode
): {
  bgFrom: string;
  bgTo: string;
  border: string;
  glow: string;
  accent: string;
  textColor: string;
} {
  if (mode === "heatmap") {
    const days = node.daysSinceModified ?? 30;
    for (const tier of HEATMAP_TIERS) {
      if (days >= tier.minDays && days < tier.maxDays) {
        return {
          bgFrom: tier.bgFrom,
          bgTo: tier.bgTo,
          border: tier.border,
          glow: tier.glow,
          accent: tier.accent,
          textColor: tier.textColor,
        };
      }
    }
    return CATEGORY_PALETTE.other;
  }

  const cat = getFileCategory(node);
  return CATEGORY_PALETTE[cat] || CATEGORY_PALETTE.other;
}

/**
 * 绘制高品质深邃星空背景与暗黑微光网格 (Deep Space Starfield)
 */
export function drawStarfield(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  // 宇宙深渊底色
  const bgGrad = ctx.createRadialGradient(
    width / 2,
    height / 2,
    50,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.75
  );
  bgGrad.addColorStop(0, "#0b1220");
  bgGrad.addColorStop(0.6, "#070b14");
  bgGrad.addColorStop(1, "#03060c");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 极淡宇宙微光网格
  ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
  ctx.lineWidth = 1;
  const gridSize = 48;
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

  // 静态生成星光微尘 (基于确定性散列坐标，避免每帧抖动)
  const starCount = Math.floor((width * height) / 9000);
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < starCount; i++) {
    const sx = (Math.sin(i * 123.456) * 0.5 + 0.5) * width;
    const sy = (Math.cos(i * 654.321) * 0.5 + 0.5) * height;
    const r = (Math.sin(i * 987.654) * 0.5 + 0.5) * 1.2 + 0.4;
    const alpha = (Math.cos(i * 333.222) * 0.5 + 0.5) * 0.4 + 0.1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Squarified Treemap Algorithm (Mark Bruls, Kees Huizing, Jarke J. van Wijk)
 */
export function computeSquarifiedTreemap(
  nodes: FileNode[],
  width: number,
  height: number,
  padding: number = 6,
  colorMode: ColorMode = "heatmap"
): TreemapRect<FileNode>[] {
  if (nodes.length === 0 || width <= 0 || height <= 0) return [];

  const validNodes = nodes.filter((n) => n.size > 0);
  if (validNodes.length === 0) return [];

  const totalSize = validNodes.reduce((acc, curr) => acc + curr.size, 0);
  const totalArea = width * height;

  interface Item {
    node: FileNode;
    area: number;
  }

  const items: Item[] = validNodes.map((n) => ({
    node: n,
    area: (n.size / totalSize) * totalArea,
  }));

  items.sort((a, b) => b.area - a.area);

  const rects: TreemapRect<FileNode>[] = [];

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
        color: getNodeColorTheme(item.node, colorMode),
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
 * 绘制高质感毛玻璃星系矩阵单元格 (Glassmorphic Treemap Tile)
 */
export function drawTreemapCell(
  ctx: CanvasRenderingContext2D,
  rect: TreemapRect<FileNode>,
  isHovered: boolean,
  isSelected: boolean,
  totalDiskSize: number
) {
  const { x, y, width, height, data, color } = rect;
  if (width < 3 || height < 3) return;

  const radius = Math.min(8, width / 4, height / 4);

  ctx.save();

  // 1. 悬停与选中微光光晕 (Glow Aura)
  if (isSelected || isHovered) {
    ctx.shadowColor = isSelected ? "#38bdf8" : color.glow;
    ctx.shadowBlur = isSelected ? 24 : 16;
  }

  // 2. 绘制圆角底板与渐变
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);

  const grad = ctx.createLinearGradient(x, y, x + width, y + height);
  if (isSelected) {
    grad.addColorStop(0, "rgba(14, 116, 144, 0.90)");
    grad.addColorStop(1, "rgba(56, 189, 248, 0.70)");
  } else if (isHovered) {
    grad.addColorStop(0, color.bgFrom.replace(/0\.\d+\)/, "0.92)"));
    grad.addColorStop(1, color.bgTo.replace(/0\.\d+\)/, "0.75)"));
  } else {
    grad.addColorStop(0, color.bgFrom);
    grad.addColorStop(1, color.bgTo);
  }
  ctx.fillStyle = grad;
  ctx.fill();

  // 3. 玻璃顶部透亮高光层 (Glass Highlight Sheen)
  const sheenHeight = Math.min(height * 0.4, 28);
  if (sheenHeight > 4 && width > 10) {
    const sheenGrad = ctx.createLinearGradient(x, y, x, y + sheenHeight);
    sheenGrad.addColorStop(0, "rgba(255, 255, 255, 0.15)");
    sheenGrad.addColorStop(1, "rgba(255, 255, 255, 0.0)");
    ctx.fillStyle = sheenGrad;
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 1, width - 2, sheenHeight, [radius, radius, 0, 0]);
    ctx.fill();
  }

  // 4. 精细边框
  ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1;
  ctx.strokeStyle = isSelected
    ? "#38bdf8"
    : isHovered
    ? "#ffffff"
    : color.border;
  ctx.stroke();

  // 5. 内容文字排版
  const pad = 8;
  const availW = width - pad * 2;
  const availH = height - pad * 2;

  if (availW >= 40 && availH >= 24) {
    // 目录/文件图标
    const iconSymbol = data.isDir ? "📁" : "📄";
    ctx.font = `11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillStyle = color.accent;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(iconSymbol, x + pad, y + pad);

    // 名称排版
    const nameX = x + pad + 16;
    const maxNameW = availW - 18;
    ctx.font = `600 ${Math.min(13, Math.max(11, Math.floor(width / 12)))}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = "#ffffff";

    let nameText = data.name;
    while (ctx.measureText(nameText).width > maxNameW && nameText.length > 3) {
      nameText = nameText.slice(0, -2) + "...";
    }
    ctx.fillText(nameText, nameX, y + pad);

    // 中间行：体积数值与百分比徽章
    if (availH >= 52) {
      const sizeY = y + pad + 20;
      ctx.fillStyle = color.accent;
      ctx.font = `700 ${Math.min(14, Math.max(11, Math.floor(width / 14)))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.fillText(formatBytes(data.size), x + pad, sizeY);

      // 百分比
      if (totalDiskSize > 0 && availW >= 90) {
        const pct = ((data.size / totalDiskSize) * 100).toFixed(1) + "%";
        ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
        ctx.font = `500 10px ui-monospace, monospace`;
        ctx.fillText(`(${pct})`, x + pad + ctx.measureText(formatBytes(data.size)).width + 6, sizeY + 2);
      }
    }

    // 底部行：活跃度徽章 / 距今天数
    if (availH >= 76 && width >= 80) {
      const days = data.daysSinceModified ?? 30;
      const statusText =
        days > 180
          ? `🧊 ${days}天未动`
          : days > 60
          ? `❄️ ${days}天前`
          : days > 14
          ? `🌿 ${days}天前`
          : days > 3
          ? `☀️ ${days}天前`
          : `🔥 ${days}天内更新`;

      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx.font = `500 10px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillText(statusText, x + pad, y + height - pad - 12);
    }
  }

  ctx.restore();
}

/**
 * 🌌 DaisyDisk 风格星系同心罗盘算法 (Sunburst Galaxy Compass Algorithm)
 * 中心为当前根目录，外圈为一级子项目放射状扇区
 */
export function computeSunburstSectors(
  nodes: FileNode[],
  innerRadius: number,
  outerRadius: number,
  colorMode: ColorMode = "heatmap"
): SunburstSector<FileNode>[] {
  const validNodes = nodes.filter((n) => n.size > 0);
  if (validNodes.length === 0) return [];

  const totalSize = validNodes.reduce((acc, curr) => acc + curr.size, 0);
  const sectors: SunburstSector<FileNode>[] = [];

  let currentAngle = -Math.PI / 2; // 从 12 点钟方向顺时针展开
  const fullCircle = Math.PI * 2;
  const minAngle = 0.035; // 避免微小扇区重叠

  for (const node of validNodes) {
    const rawSpan = (node.size / totalSize) * fullCircle;
    const span = Math.max(rawSpan, minAngle);
    const endAngle = currentAngle + span;

    sectors.push({
      startAngle: currentAngle,
      endAngle,
      innerRadius,
      outerRadius,
      data: node,
      color: getNodeColorTheme(node, colorMode),
    });

    currentAngle = endAngle;
  }

  return sectors;
}

/**
 * 绘制 DaisyDisk 星盘罗盘 (Sunburst Wheel Renderer)
 */
export function drawSunburstWheel(
  ctx: CanvasRenderingContext2D,
  sectors: SunburstSector<FileNode>[],
  centerX: number,
  centerY: number,
  coreRadius: number,
  currentPath: string,
  totalSize: number,
  hoveredSector: SunburstSector<FileNode> | null,
  selectedSector: SunburstSector<FileNode> | null
) {
  // 1. 绘制核心恒星光环 (Core Planetary Sun)
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, coreRadius - 4, 0, Math.PI * 2);

  const coreGrad = ctx.createRadialGradient(
    centerX,
    centerY,
    10,
    centerX,
    centerY,
    coreRadius
  );
  coreGrad.addColorStop(0, "rgba(30, 58, 138, 0.85)");
  coreGrad.addColorStop(0.7, "rgba(15, 23, 42, 0.95)");
  coreGrad.addColorStop(1, "rgba(2, 6, 23, 0.98)");
  ctx.fillStyle = coreGrad;
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(56, 189, 248, 0.55)";
  ctx.shadowColor = "#38bdf8";
  ctx.shadowBlur = 18;
  ctx.stroke();

  // 核心文字
  ctx.shadowBlur = 0;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // 根路径缩写
  const basename = currentPath.replace(/\\$/, "").split("\\").pop() || currentPath;
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 15px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(basename, centerX, centerY - 14);

  // 总体积
  ctx.fillStyle = "#38bdf8";
  ctx.font = "700 13px ui-monospace, monospace";
  ctx.fillText(formatBytes(totalSize), centerX, centerY + 8);

  // 子项数量
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.font = "500 10px -apple-system, sans-serif";
  ctx.fillText(`${sectors.length} 个子项`, centerX, centerY + 24);

  ctx.restore();

  // 2. 绘制星环扇区 (Orbit Sectors)
  for (const s of sectors) {
    const isHovered = hoveredSector?.data.path === s.data.path;
    const isSelected = selectedSector?.data.path === s.data.path;

    ctx.save();

    // 扇区外移高光效果 (Explode / Pulse effect on hover)
    let drawInner = s.innerRadius;
    let drawOuter = s.outerRadius;
    if (isHovered || isSelected) {
      drawOuter += 8;
      ctx.shadowColor = isSelected ? "#38bdf8" : s.color.glow;
      ctx.shadowBlur = 20;
    }

    ctx.beginPath();
    // 弧度间隙 0.015 rad
    const gap = 0.015;
    const a1 = s.startAngle + gap / 2;
    const a2 = s.endAngle - gap / 2;

    ctx.arc(centerX, centerY, drawOuter, a1, a2, false);
    ctx.arc(centerX, centerY, drawInner, a2, a1, true);
    ctx.closePath();

    // 扇区渐变填充
    const midAngle = (a1 + a2) / 2;
    const gradX1 = centerX + Math.cos(midAngle) * drawInner;
    const gradY1 = centerY + Math.sin(midAngle) * drawInner;
    const gradX2 = centerX + Math.cos(midAngle) * drawOuter;
    const gradY2 = centerY + Math.sin(midAngle) * drawOuter;

    const sectorGrad = ctx.createLinearGradient(gradX1, gradY1, gradX2, gradY2);
    if (isSelected) {
      sectorGrad.addColorStop(0, "rgba(56, 189, 248, 0.95)");
      sectorGrad.addColorStop(1, "rgba(14, 116, 144, 0.85)");
    } else if (isHovered) {
      sectorGrad.addColorStop(0, s.color.bgFrom.replace(/0\.\d+\)/, "0.95)"));
      sectorGrad.addColorStop(1, s.color.bgTo.replace(/0\.\d+\)/, "0.85)"));
    } else {
      sectorGrad.addColorStop(0, s.color.bgFrom);
      sectorGrad.addColorStop(1, s.color.bgTo);
    }

    ctx.fillStyle = sectorGrad;
    ctx.fill();

    // 扇区边缘发光描边
    ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1;
    ctx.strokeStyle = isSelected
      ? "#ffffff"
      : isHovered
      ? "#ffffff"
      : s.color.border;
    ctx.stroke();

    // 扇区文字标签 (当角度足够大时绘制沿着放射轴的文字)
    const angleSpan = a2 - a1;
    if (angleSpan > 0.12 && drawOuter - drawInner > 40) {
      ctx.shadowBlur = 0;
      ctx.save();
      const labelRadius = (drawInner + drawOuter) / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate(midAngle);

      let text = s.data.name;
      if (text.length > 10) text = text.slice(0, 9) + "…";

      ctx.fillStyle = "#ffffff";
      ctx.font = "600 11px -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // 如果文字在左半圆，翻转 180 度避免倒立阅读
      if (midAngle > Math.PI / 2 || midAngle < -Math.PI / 2) {
        ctx.translate(labelRadius, 0);
        ctx.rotate(Math.PI);
        ctx.fillText(text, 0, 0);
      } else {
        ctx.fillText(text, labelRadius, 0);
      }
      ctx.restore();
    }

    ctx.restore();
  }
}
