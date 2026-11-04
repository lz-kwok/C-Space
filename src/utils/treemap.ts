import { FileNode } from "../types";
import { formatBytes } from "../utils";

export interface DisplayNode extends FileNode {
  isVirtualOther?: boolean;
  itemCount?: number;
}

export interface PlanetNode<T = DisplayNode> {
  x: number;
  y: number;
  radius: number;
  data: T;
  color: NodeColorTheme;
  hasRing?: boolean;
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
export type GalaxyViewMode = "sunburst" | "planet";

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
      bgFrom: "#1e3a8a",
      bgTo: "#0284c7",
      border: "#38bdf8",
      glow: "rgba(56, 189, 248, 0.65)",
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
      bgFrom: "#0e4460",
      bgTo: "#0891b2",
      border: "#22d3ee",
      glow: "rgba(34, 211, 238, 0.65)",
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
      bgFrom: "#065f46",
      bgTo: "#059669",
      border: "#34d399",
      glow: "rgba(52, 211, 153, 0.65)",
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
      bgFrom: "#92400e",
      bgTo: "#d97706",
      border: "#fbbf24",
      glow: "rgba(251, 191, 36, 0.65)",
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
      bgFrom: "#9f1239",
      bgTo: "#e11d48",
      border: "#fb7185",
      glow: "rgba(251, 113, 133, 0.75)",
      accent: "#fb7185",
      textColor: "#ffe4e6",
    },
  },
];

// 🎨 优雅多样彩虹光谱（DaisyDisk 式多层彩色环，相邻色差分明）
export const SPECTRUM_PALETTE: NodeColorTheme[] = [
  {
    bgFrom: "#4f46e5",
    bgTo: "#8b5cf6",
    border: "#a5b4fc",
    glow: "rgba(165, 180, 252, 0.65)",
    accent: "#a5b4fc",
    textColor: "#e0e7ff",
  },
  {
    bgFrom: "#0284c7",
    bgTo: "#38bdf8",
    border: "#7dd3fc",
    glow: "rgba(56, 189, 248, 0.65)",
    accent: "#38bdf8",
    textColor: "#e0f2fe",
  },
  {
    bgFrom: "#059669",
    bgTo: "#10b981",
    border: "#6ee7b7",
    glow: "rgba(52, 211, 153, 0.65)",
    accent: "#34d399",
    textColor: "#d1fae5",
  },
  {
    bgFrom: "#d97706",
    bgTo: "#f59e0b",
    border: "#fde68a",
    glow: "rgba(251, 191, 36, 0.65)",
    accent: "#fbbf24",
    textColor: "#fef3c7",
  },
  {
    bgFrom: "#db2777",
    bgTo: "#f472b6",
    border: "#fbcfe8",
    glow: "rgba(244, 114, 182, 0.65)",
    accent: "#f472b6",
    textColor: "#fce7f3",
  },
  {
    bgFrom: "#0891b2",
    bgTo: "#06b6d4",
    border: "#a5f3fc",
    glow: "rgba(34, 211, 238, 0.65)",
    accent: "#22d3ee",
    textColor: "#cffafe",
  },
  {
    bgFrom: "#ea580c",
    bgTo: "#fb923c",
    border: "#fed7aa",
    glow: "rgba(251, 146, 60, 0.65)",
    accent: "#fb923c",
    textColor: "#ffedd5",
  },
  {
    bgFrom: "#9333ea",
    bgTo: "#c084fc",
    border: "#f3e8ff",
    glow: "rgba(192, 132, 252, 0.65)",
    accent: "#c084fc",
    textColor: "#f3e8ff",
  },
  {
    bgFrom: "#e11d48",
    bgTo: "#fb7185",
    border: "#ffe4e6",
    glow: "rgba(251, 113, 133, 0.65)",
    accent: "#fb7185",
    textColor: "#ffe4e6",
  },
  {
    bgFrom: "#0d9488",
    bgTo: "#2dd4bf",
    border: "#99f6e4",
    glow: "rgba(45, 212, 191, 0.65)",
    accent: "#2dd4bf",
    textColor: "#ccfbf1",
  },
];

// 其它碎文件的中性灰蓝调色板
export const OTHER_ITEMS_THEME: NodeColorTheme = {
  bgFrom: "#334155",
  bgTo: "#475569",
  border: "#94a3b8",
  glow: "rgba(148, 163, 184, 0.40)",
  accent: "#94a3b8",
  textColor: "#e2e8f0",
};

/**
 * 🌟 核心聚合器 (Top-N + Others Aggregator)
 */
export function aggregateNodesForDisplay(
  nodes: FileNode[],
  maxTopItems: number = 10,
  minPercentage: number = 0.02
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

    if (topItems.length < maxTopItems && (pct >= minPercentage || topItems.length < 4)) {
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
 * 绘制高品质深邃星空背景与暗黑微光网格
 */
export function drawStarfield(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  const bgGrad = ctx.createRadialGradient(
    width / 2,
    height / 2,
    30,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.7
  );
  bgGrad.addColorStop(0, "#0b1220");
  bgGrad.addColorStop(0.65, "#060913");
  bgGrad.addColorStop(1, "#020408");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
  ctx.lineWidth = 1;
  const gridSize = 45;
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

  const starCount = Math.min(75, Math.floor((width * height) / 10000));
  ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
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
 * 🪐 星球图谱天体引力算法 (Planetary Celestial Map Layout Algorithm)
 * 将目录与文件转化为发光天体星球，半径正比于体积平方根，按引力与碰撞算法自适应星系排布
 */
export function computePlanetarySystem(
  rawNodes: FileNode[],
  width: number,
  height: number,
  colorMode: ColorMode = "category"
): PlanetNode<DisplayNode>[] {
  const displayNodes = aggregateNodesForDisplay(rawNodes, 10, 0.02);
  if (displayNodes.length === 0 || width <= 0 || height <= 0) return [];

  const totalSize = displayNodes.reduce((acc, curr) => acc + curr.size, 0);
  const cx = width / 2;
  const cy = height / 2;

  // 根据画布尺寸决定可用星系空间与星球半径尺度
  const minDim = Math.min(width, height);
  const maxRadius = Math.min(110, minDim * 0.22);
  const minRadius = 32;

  const planets: PlanetNode<DisplayNode>[] = displayNodes.map((node, i) => {
    const ratio = node.size / totalSize;
    // 半径按面积比例衰减开方
    const radius = Math.max(
      minRadius,
      Math.min(maxRadius, Math.sqrt(ratio) * (minDim * 0.38))
    );

    // 初始位置分布：依黄金角排列在不同半径的轨道上
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const dist = i === 0 ? 0 : (radius + 20) + (i * 26);
    const angle = i * goldenAngle;

    const x = cx + Math.cos(angle) * (dist * 0.85);
    const y = cy + Math.sin(angle) * (dist * 0.85);

    return {
      x,
      y,
      radius,
      data: node,
      color: getNodeColorTheme(node, colorMode, i),
      hasRing: i === 0 && radius >= 55, // 最大星球自带宏伟星环
    };
  });

  // 2D 物理碰撞斥力迭代松弛算法 (20 次迭代迅速收敛，保持星球互不重叠且紧凑优雅)
  for (let iter = 0; iter < 24; iter++) {
    for (let i = 0; i < planets.length; i++) {
      for (let j = i + 1; j < planets.length; j++) {
        const p1 = planets[i];
        const p2 = planets[j];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy) || 1;
        const minDist = p1.radius + p2.radius + 18; // 18px 舒适星际间距

        if (dist < minDist) {
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;

          // 大星球质量大，受力位移偏小
          const weight1 = p2.radius / (p1.radius + p2.radius);
          const weight2 = p1.radius / (p1.radius + p2.radius);

          p1.x -= nx * overlap * weight1;
          p1.y -= ny * overlap * weight1;
          p2.x += nx * overlap * weight2;
          p2.y += ny * overlap * weight2;
        }
      }

      // 居中引力：向画面中心柔和回缩
      const p = planets[i];
      p.x += (cx - p.x) * 0.04;
      p.y += (cy - p.y) * 0.04;

      // 边界约束
      p.x = Math.max(p.radius + 15, Math.min(width - p.radius - 15, p.x));
      p.y = Math.max(p.radius + 15, Math.min(height - p.radius - 15, p.y));
    }
  }

  return planets;
}

/**
 * 绘制高质感发光天体星球 (Celestial 3D Planet Renderer)
 */
export function drawPlanet(
  ctx: CanvasRenderingContext2D,
  planet: PlanetNode<DisplayNode>,
  isHovered: boolean,
  isSelected: boolean,
  totalDiskSize: number
) {
  const { x, y, radius, data, color, hasRing } = planet;

  ctx.save();

  // 1. 大气发光日冕 (Atmospheric Glow Corona)
  ctx.beginPath();
  ctx.arc(x, y, radius + (isHovered || isSelected ? 8 : 4), 0, Math.PI * 2);
  ctx.fillStyle = isSelected
    ? "rgba(56, 189, 248, 0.25)"
    : isHovered
    ? color.glow
    : "rgba(255, 255, 255, 0.04)";
  ctx.shadowColor = isSelected ? "#38bdf8" : color.border;
  ctx.shadowBlur = isSelected ? 32 : isHovered ? 24 : 14;
  ctx.fill();

  // 2. 真实 3D 球体径向渐变采光 (3D Spherical Light Gradient)
  const lightOffsetX = -radius * 0.32;
  const lightOffsetY = -radius * 0.32;
  const sphereGrad = ctx.createRadialGradient(
    x + lightOffsetX,
    y + lightOffsetY,
    radius * 0.08,
    x,
    y,
    radius
  );
  sphereGrad.addColorStop(0, "#ffffff");
  sphereGrad.addColorStop(0.2, color.border);
  sphereGrad.addColorStop(0.65, color.bgTo);
  sphereGrad.addColorStop(1, color.bgFrom);

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = sphereGrad;
  ctx.fill();

  // 3. 星球边缘精细发光外圈
  ctx.lineWidth = isSelected ? 3 : isHovered ? 2.5 : 1.2;
  ctx.strokeStyle = isSelected
    ? "#ffffff"
    : isHovered
    ? "#ffffff"
    : color.border;
  ctx.stroke();

  // 4. 土星式宏伟星环 (Saturn Planetary Ring for super-planets)
  if (hasRing && radius >= 50) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 6);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.6, radius * 0.42, 0, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(3, radius * 0.08);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.shadowColor = color.border;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.restore();
  }

  // 5. 星球表面清晰文字与数据徽章
  ctx.shadowBlur = 0;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const iconSymbol = data.isVirtualOther ? "📦" : data.isDir ? "📁" : "📄";
  const nameMaxW = radius * 1.5;

  if (radius >= 32) {
    // 居中或略偏上显示名称
    ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = "#ffffff";

    let displayName = data.name;
    while (ctx.measureText(displayName).width > nameMaxW && displayName.length > 4) {
      displayName = displayName.slice(0, -2) + "…";
    }

    const textYOffset = radius >= 45 ? -8 : 0;
    ctx.fillText(`${iconSymbol} ${displayName}`, x, y + textYOffset);

    // 显示体积与占比
    if (radius >= 45) {
      ctx.font = "bold 12px ui-monospace, SFMono-Regular, monospace";
      ctx.fillStyle = color.accent;
      ctx.fillText(formatBytes(data.size), x, y + 12);

      if (totalDiskSize > 0 && radius >= 60) {
        const pct = ((data.size / totalDiskSize) * 100).toFixed(1) + "%";
        ctx.font = "500 10px ui-monospace, monospace";
        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        ctx.fillText(`(${pct})`, x, y + 26);
      }
    }
  }

  ctx.restore();
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
  // 1. 核心恒星
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
