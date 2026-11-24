/**
 * 在页面里用 canvas 画演示封面：纯几何图形 + 竖排原文书名，不使用任何外部图片。
 * 字体沿用应用已加载的 Noto Serif JP，所以不同机器上画出来的封面一致。
 */
import type { DemoBook, DemoCoverMotif } from './demo-library';

const WIDTH = 480;
const HEIGHT = 680;
const SERIF = '"Noto Serif JP", serif';
/** 竖排时要缩到右上角的小假名 */
const SMALL_KANA = 'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ';

type Painter = (ctx: CanvasRenderingContext2D, accent: string, random: () => number) => void;

/** 固定种子的伪随机数，保证每次生成的封面相同 */
function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
}

const MOTIFS: Record<DemoCoverMotif, Painter> = {
  stars(ctx, accent, random) {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 420; i++) {
      // 一半的星星聚在斜向的银河带上
      const along = random();
      const onBand = i % 2 === 0;
      const x = onBand ? along * WIDTH + (random() - 0.5) * 150 : random() * WIDTH;
      const y = onBand
        ? HEIGHT * 0.95 - along * HEIGHT * 0.9 + (random() - 0.5) * 150
        : random() * HEIGHT;
      ctx.globalAlpha = 0.25 + random() * 0.6;
      circle(ctx, x, y, random() * 1.5 + 0.3);
      ctx.fill();
    }
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-20, HEIGHT * 0.86);
    ctx.quadraticCurveTo(WIDTH * 0.35, HEIGHT * 0.78, WIDTH * 0.62, HEIGHT * 0.4);
    ctx.stroke();
    ctx.fillStyle = accent;
    for (const [x, y, size] of [
      [96, 150, 9],
      [210, 96, 5],
      [300, 520, 7],
      [70, 420, 4],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.quadraticCurveTo(x, y, x + size, y);
      ctx.quadraticCurveTo(x, y, x, y + size);
      ctx.quadraticCurveTo(x, y, x - size, y);
      ctx.quadraticCurveTo(x, y, x, y - size);
      ctx.fill();
    }
  },
  cat(ctx, accent) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(170, 560, 78, 108, 0, 0, Math.PI * 2);
    ctx.fill();
    circle(ctx, 170, 420, 54);
    ctx.fill();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(170 + side * 50, 400);
      ctx.lineTo(170 + side * 44, 340);
      ctx.lineTo(170 + side * 12, 376);
      ctx.fill();
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(236, 640);
    ctx.bezierCurveTo(330, 650, 330, 560, 290, 520);
    ctx.stroke();
  },
  gate(ctx, accent, random) {
    ctx.fillStyle = accent;
    ctx.fillRect(60, 330, 26, 350);
    ctx.fillRect(250, 330, 26, 350);
    ctx.fillRect(30, 300, 276, 22);
    ctx.fillRect(48, 356, 240, 12);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      const x = random() * (WIDTH + 80);
      const y = random() * HEIGHT;
      ctx.globalAlpha = 0.08 + random() * 0.14;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 14, y + 46);
      ctx.stroke();
    }
  },
  sun(ctx, accent) {
    ctx.fillStyle = '#fff3d6';
    ctx.globalAlpha = 0.92;
    circle(ctx, 190, 560, 150);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#fff3d6';
    ctx.lineWidth = 3;
    for (let i = 0; i < 18; i++) {
      const angle = Math.PI + (Math.PI * i) / 17;
      ctx.beginPath();
      ctx.moveTo(190 + Math.cos(angle) * 176, 560 + Math.sin(angle) * 176);
      ctx.lineTo(190 + Math.cos(angle) * 300, 560 + Math.sin(angle) * 300);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = accent;
    ctx.fillRect(0, 600, WIDTH, 80);
  },
  forest(ctx, accent, random) {
    for (let i = 0; i < 16; i++) {
      const x = random() * WIDTH;
      const width = 8 + random() * 26;
      ctx.globalAlpha = 0.25 + random() * 0.4;
      ctx.fillStyle = '#0b1a10';
      ctx.fillRect(x, 0, width, HEIGHT);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = accent;
    ctx.fillRect(150, 470, 70, 96);
    ctx.fillStyle = '#1f3524';
    ctx.fillRect(183, 470, 4, 96);
    ctx.fillRect(150, 514, 70, 4);
  },
  moon(ctx, accent) {
    ctx.fillStyle = accent;
    circle(ctx, 150, 190, 92);
    ctx.fill();
    const ridges: Array<[number, string]> = [
      [470, '#16302f'],
      [530, '#0d2221'],
      [596, '#071514'],
    ];
    for (const [top, color] of ridges) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, HEIGHT);
      ctx.lineTo(0, top + 40);
      ctx.quadraticCurveTo(120, top - 60, 230, top + 10);
      ctx.quadraticCurveTo(350, top - 80, WIDTH, top + 30);
      ctx.lineTo(WIDTH, HEIGHT);
      ctx.fill();
    }
  },
  waves(ctx, accent) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    const radius = 60;
    for (let row = 0; row < 7; row++) {
      for (let col = -1; col < 6; col++) {
        const x = col * radius * 2 + (row % 2 ? radius : 0);
        const y = HEIGHT - row * radius * 0.5 + 20;
        ctx.globalAlpha = 0.5 - row * 0.05;
        for (const scale of [1, 0.72, 0.44]) {
          ctx.beginPath();
          ctx.arc(x, y, radius * scale, Math.PI, 0);
          ctx.stroke();
        }
      }
    }
  },
  thread(ctx, accent) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(170, 0);
    ctx.lineTo(170, 520);
    ctx.stroke();
    ctx.fillStyle = accent;
    circle(ctx, 170, 528, 8);
    ctx.fill();
    ctx.globalAlpha = 0.22;
    for (const [x, y, radius] of [
      [110, 60, 70],
      [220, 40, 86],
      [60, 130, 50],
    ] as const) {
      circle(ctx, x, y, radius);
      ctx.fill();
    }
  },
  rings(ctx, accent) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    for (const [x, y] of [
      [150, 470],
      [250, 540],
    ] as const) {
      for (let radius = 20; radius <= 200; radius += 20) {
        ctx.globalAlpha = 0.6 - radius / 400;
        circle(ctx, x, y, radius);
        ctx.stroke();
      }
    }
  },
  mask(ctx, accent) {
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(175, 470, 96, 128, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(175, 470, 96, 128, 0, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.5;
    for (let y = 360; y < 590; y += 14) {
      ctx.beginPath();
      ctx.moveTo(60, y);
      ctx.lineTo(175, y + 8);
      ctx.stroke();
    }
  },
};

function drawVerticalText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  top: number,
  size: number,
  weight: number,
): void {
  ctx.font = `${weight} ${size}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = top + size / 2;
  for (const char of text) {
    const small = SMALL_KANA.includes(char);
    ctx.fillText(char, x + (small ? size * 0.12 : 0), y - (small ? size * 0.12 : 0));
    y += size * 1.12;
  }
}

/** 画一张演示封面，返回 JPEG data URL */
export async function drawDemoCover(book: DemoBook): Promise<string> {
  const text = book.originalTitle + book.originalAuthor;
  await Promise.all([
    document.fonts.load(`700 48px ${SERIF}`, text),
    document.fonts.load(`500 20px ${SERIF}`, text),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建封面画布');
  const [from, to, accent] = book.cover.colors;

  const gradient = ctx.createLinearGradient(0, 0, WIDTH * 0.4, HEIGHT);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  MOTIFS[book.cover.motif](ctx, accent, seededRandom(book.key));
  ctx.restore();

  // 右侧竖排书名与作者，外加一圈细边框
  ctx.fillStyle = accent;
  const titleSize = Math.min(58, Math.floor(430 / (book.originalTitle.length * 1.12)));
  drawVerticalText(ctx, book.originalTitle, WIDTH - 84, 64, titleSize, 700);
  drawVerticalText(ctx, book.originalAuthor, WIDTH - 148, 70, 20, 500);
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(18, 18, WIDTH - 36, HEIGHT - 36);

  return canvas.toDataURL('image/jpeg', 0.86);
}
