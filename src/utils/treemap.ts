import { FileNode } from "../types";
import { formatBytes } from "../utils";

export interface TreemapRect<T = FileNode> {
  x: number;
  y: number;
  width: number;
  height: number;
  data: T;
  color: string;
}

export type ColorMode = "category" | "heatmap";

export interface HeatmapTier {
  label: string;
  minDays: number;
  maxDays: number;
  color: string;
  borderColor: string;
  textColor: string;
}

export const HEATMAP_TIERS: HeatmapTier[] = [
  {
    label: "极冷数据 (>180 天)",
    minDays: 180,
    maxDays: Infinity,
    color: "#1e3a8a", // blue-900
    borderColor: "#3b82f6",
    textColor: "#93c5fd",
  },
  {
    label: "次冷数据 (60~180 天)",
    minDays: 60,
    maxDays: 180,
    color: "#0369a1", // sky-700
    borderColor: "#38bdf8",
    textColor: "#bae6fd",
  },
  {
    label: "温和数据 (14~60 天)",
    minDays: 14,
    maxDays: 60,
    color: "#047857", // emerald-700
    borderColor: "#34d399",
    textColor: "#a7f3d0",
  },
  {
    label: "微温活跃 (3~14 天)",
    minDays: 3,
    maxDays: 14,
    color: "#b45309", // amber-700
    borderColor: "#fbbf24",
    textColor: "#fde68a",
  },
  {
    label: "高热活跃 (<3 天)",
    minDays: 0,
    maxDays: 3,
    color: "#b91c1c", // red-700
    borderColor: "#f87171",
    textColor: "#fecaca",
  },
];

export const CATEGORY_PALETTE: Record<string, { color: string; borderColor: string }> = {
  disk_image: { color: "#581c87", borderColor: "#a855f7" }, // purple
  model: { color: "#831843", borderColor: "#ec4899" }, // pink
  media: { color: "#075985", borderColor: "#38bdf8" }, // sky
  archive: { color: "#78350f", borderColor: "#f59e0b" }, // amber
  executable: { color: "#064e3b", borderColor: "#10b981" }, // emerald
  database: { color: "#155e75", borderColor: "#06b6d4" }, // cyan
  cache: { color: "#312e81", borderColor: "#6366f1" }, // indigo
  dir: { color: "#1e293b", borderColor: "#475569" }, // slate
  other: { color: "#334155", borderColor: "#64748b" }, // slate lighter
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

export function getNodeColor(node: FileNode, mode: ColorMode): { bg: string; border: string } {
  if (mode === "heatmap") {
    const days = node.daysSinceModified ?? 30; // 默认温和
    for (const tier of HEATMAP_TIERS) {
      if (days >= tier.minDays && days < tier.maxDays) {
        return { bg: tier.color, border: tier.borderColor };
      }
    }
    return { bg: "#1e293b", border: "#475569" };
  }

  const cat = getFileCategory(node);
  const conf = CATEGORY_PALETTE[cat] || CATEGORY_PALETTE.other;
  return { bg: conf.color, border: conf.borderColor };
}

/**
 * Squarified Treemap Algorithm (Mark Bruls, Kees Huizing, Jarke J. van Wijk)
 * 将节点按照体积等比例分割进给定 (width x height) 画布区域
 */
export function computeSquarifiedTreemap(
  nodes: FileNode[],
  width: number,
  height: number,
  padding: number = 4,
  colorMode: ColorMode = "category"
): TreemapRect<FileNode>[] {
  if (nodes.length === 0 || width <= 0 || height <= 0) return [];

  const validNodes = nodes.filter((n) => n.size > 0);
  if (validNodes.length === 0) return [];

  const totalSize = validNodes.reduce((acc, curr) => acc + curr.size, 0);
  const totalArea = width * height;

  // 节点转为带标准化面积的候选项
  const items = validNodes
    .map((node) => ({
      node,
      area: (node.size / totalSize) * totalArea,
    }))
    .sort((a, b) => b.area - a.area);

  const rects: TreemapRect<FileNode>[] = [];

  function worst(row: number[], w: number): number {
    let max = -Infinity;
    let min = Infinity;
    let sum = 0;
    for (const a of row) {
      sum += a;
      if (a > max) max = a;
      if (a < min) min = a;
    }
    if (sum === 0 || min === 0) return Infinity;
    const s2 = sum * sum;
    const w2 = w * w;
    return Math.max((w2 * max) / s2, s2 / (w2 * min));
  }

  function layoutRow(
    row: { node: FileNode; area: number }[],
    x: number,
    y: number,
    w: number,
    isVertical: boolean
  ): { nextX: number; nextY: number; nextW: number; nextH: number } {
    const rowArea = row.reduce((acc, r) => acc + r.area, 0);
    const rowLength = isVertical ? rowArea / w : rowArea / w;

    let offset = 0;
    for (const item of row) {
      const itemSpan = item.area / rowLength;
      const rx = isVertical ? x + offset : x;
      const ry = isVertical ? y : y + offset;
      const rw = isVertical ? itemSpan : rowLength;
      const rh = isVertical ? rowLength : itemSpan;

      const colors = getNodeColor(item.node, colorMode);
      rects.push({
        x: rx + padding / 2,
        y: ry + padding / 2,
        width: Math.max(0, rw - padding),
        height: Math.max(0, rh - padding),
        data: item.node,
        color: colors.bg,
      });

      offset += itemSpan;
    }

    if (isVertical) {
      return { nextX: x, nextY: y + rowLength, nextW: w, nextH: 0 };
    } else {
      return { nextX: x + rowLength, nextY: y, nextW: 0, nextH: w };
    }
  }

  function squarify(
    children: { node: FileNode; area: number }[],
    row: { node: FileNode; area: number }[],
    x: number,
    y: number,
    w: number,
    h: number
  ) {
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

    const currentWorst = row.length === 0 ? Infinity : worst(row.map((r) => r.area), shortSide);
    const newRow = [...row, nextChild];
    const newWorst = worst(newRow.map((r) => r.area), shortSide);

    if (newWorst <= currentWorst || row.length === 0) {
      squarify(children.slice(1), newRow, x, y, w, h);
    } else {
      // 换行放置当前已构建的 row
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
 * 在 Canvas 上渲染圆角矩形及文字
 */
export function drawTreemapCell(
  ctx: CanvasRenderingContext2D,
  rect: TreemapRect<FileNode>,
  isHovered: boolean,
  isSelected: boolean,
  colorMode: ColorMode
) {
  const { x, y, width, height, data } = rect;
  if (width < 3 || height < 3) return;

  const colors = getNodeColor(data, colorMode);
  const radius = Math.min(6, width / 4, height / 4);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);

  // 背景色
  if (isSelected) {
    ctx.fillStyle = "#3b82f6"; // 选中高亮蓝
  } else if (isHovered) {
    ctx.fillStyle = colors.border; // 悬浮亮色
  } else {
    ctx.fillStyle = colors.bg;
  }
  ctx.fill();

  // 边框
  ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1;
  ctx.strokeStyle = isSelected ? "#ffffff" : isHovered ? "#ffffff" : colors.border;
  ctx.stroke();

  // 文字渲染
  if (width >= 45 && height >= 22) {
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 ${Math.min(13, Math.max(10, Math.floor(width / 10)))}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    const pad = 6;
    const maxTextWidth = width - pad * 2;

    // 名称截断
    let nameText = data.name;
    while (ctx.measureText(nameText).width > maxTextWidth && nameText.length > 3) {
      nameText = nameText.slice(0, -2) + "...";
    }

    ctx.fillText(nameText, x + pad, y + pad);

    // 大小标签 (空间足够时展示)
    if (height >= 42) {
      ctx.fillStyle = isSelected || isHovered ? "#e2e8f0" : "#94a3b8";
      ctx.font = `500 ${Math.min(11, Math.max(9, Math.floor(width / 12)))}px ui-monospace, monospace`;
      ctx.fillText(formatBytes(data.size), x + pad, y + pad + 16);
    }
  }

  ctx.restore();
}

