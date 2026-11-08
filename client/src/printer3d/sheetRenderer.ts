import * as THREE from 'three';
import type { Sheet, SheetEntry } from '../types';

/**
 * Mức trang trí của một ô in. Dù ở mức nào, nội dung chỉ gồm AVATAR + TÊN:
 * - normal: avatar viền trắng, tên chữ màu.
 * - gold (quà ≥ 100 kim cương / quà to chiếm nguyên hàng): thêm khung vàng trang trí quanh avatar, tên chữ vàng.
 * - legend (trang đặc biệt ≥ 1000 kim cương): khung vàng lớn nhất có vương miện và cành nguyệt quế.
 */
import { DEFAULT_VIEWER_AVATAR } from './avatarManager';
export { fallbackAvatarUrl, getRandomAvatarUrl, AVAILABLE_AVATARS } from './avatarManager';

type Tier = 'normal' | 'gold' | 'legend';

// Baloo 2: chữ tròn, đậm, rất dễ đọc, đủ dấu tiếng Việt (SIL OFL)
const NAME_FONT = 'Baloo 2';
const NAME_WEIGHT = 700;
const NAME_FONT_STACK = `"${NAME_FONT}", "Segoe UI", "Arial Rounded MT Bold", Arial, sans-serif`;

let nameFontPromise: Promise<void> | null = null;

/** Nạp font viết tay cho tên (đóng gói sẵn trong /public/fonts nên OBS chạy offline vẫn có). */
function loadNameFont(): Promise<void> {
    if (!nameFontPromise) {
        const face = new FontFace(NAME_FONT, 'url(/fonts/Baloo2-Variable.ttf)', { weight: '400 800' });
        nameFontPromise = face
            .load()
            .then((loaded) => {
                document.fonts.add(loaded);
            })
            .catch(() => {
                console.warn('[SheetRenderer] Không tải được font Baloo 2, dùng font dự phòng');
            });
    }
    return nameFontPromise;
}

/**
 * Kho avatar dùng chung cho mọi tờ giấy (tờ trên + tờ dưới): mỗi ảnh chỉ tải 1 lần,
 * chỉ giữ MAX_AVATARS ảnh gần nhất trong RAM (không lưu ổ đĩa),
 * ảnh lỗi được ghi nhớ để không tải lại liên tục.
 */
// Chỉ cần ảnh của tờ đang hiện + tờ bên dưới + vài hình đang chờ vẽ; tờ đã qua thì ảnh bị bỏ
const MAX_AVATARS = 24;
const avatarStore = {
    images: new Map<string, HTMLImageElement>(),
    loading: new Map<string, (() => void)[]>(),
    failed: new Map<string, number>(),

    get(url: string): HTMLImageElement | null {
        const img = this.images.get(url);
        if (!img) return null;
        // LRU: đưa lên cuối
        this.images.delete(url);
        this.images.set(url, img);
        return img;
    },

    hasFailed(url: string): boolean {
        const at = this.failed.get(url);
        if (at === undefined) return false;
        // Cho thử lại sau 10 phút (ảnh có thể chỉ lỗi tạm thời)
        if (Date.now() - at > 10 * 60_000) {
            this.failed.delete(url);
            return false;
        }
        return true;
    },

    load(url: string, onDone: () => void): void {
        if (!url || this.images.has(url) || this.hasFailed(url)) return;
        const waiting = this.loading.get(url);
        if (waiting) {
            waiting.push(onDone);
            return;
        }
        this.loading.set(url, [onDone]);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        // Avatar TikTok đi qua proxy của server (CDN không có CORS)
        const remote = /^https?:\/\/(?!localhost)/.test(url) && !url.includes('/api/avatar');
        const serverUrl =
            (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SERVER_URL ??
            `${window.location.protocol}//${window.location.hostname}:3001`;
        const finish = () => {
            const cbs = this.loading.get(url) ?? [];
            this.loading.delete(url);
            for (const cb of cbs) cb();
        };
        img.onload = () => {
            this.images.set(url, img);
            while (this.images.size > MAX_AVATARS) {
                const oldest = this.images.keys().next().value;
                if (oldest === undefined) break;
                this.images.delete(oldest);
            }
            finish();
        };
        img.onerror = () => {
            this.failed.set(url, Date.now());
            if (this.failed.size > 1000) this.failed.clear();
            finish();
        };
        img.src = remote ? `${serverUrl}/api/avatar?url=${encodeURIComponent(url)}` : url;
    },
};

type RenderArgs = [Sheet, number | null, number, SheetEntry | undefined, number];

/**
 * Vẽ bề mặt tờ giấy in (CanvasTexture) gồm lưới 4 ô (2 hàng x 2 cột), hàng quà to và trang đặc biệt,
 * kèm hiệu ứng in dần từng dòng theo tiến độ.
 */
export class SheetCanvasRenderer {
    public canvas: HTMLCanvasElement;
    public ctx: CanvasRenderingContext2D;
    public texture: THREE.CanvasTexture;

    private paperBase: HTMLCanvasElement;
    private lastArgs: RenderArgs | null = null;
    private redrawQueued = false;
    /** Ảnh chụp phần tĩnh của tờ khi đang in một ô */
    private staticLayer: HTMLCanvasElement | null = null;
    private staticKey: string | null = null;
    /** Kích thước logic (toạ độ bố cục) — canvas thật lớn hơn `scale` lần cho chữ/ảnh sắc nét */
    private W: number;
    private H: number;
    private scale: number;

    constructor(width = 1024, height = 1536, scale = 1.5) {
        this.W = width;
        this.H = height;
        this.scale = scale;
        this.canvas = document.createElement('canvas');
        this.canvas.width = Math.round(width * scale);
        this.canvas.height = Math.round(height * scale);
        const ctx = this.canvas.getContext('2d');
        if (!ctx) throw new Error('Cannot get 2D context');
        this.ctx = ctx;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);

        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.texture.anisotropy = 16;
        this.texture.generateMipmaps = true;
        this.texture.minFilter = THREE.LinearMipmapLinearFilter;
        this.texture.magFilter = THREE.LinearFilter;

        // Vân giấy vẽ 1 lần (trước đây random mỗi khung hình nên giấy bị nhấp nháy khi in)
        this.paperBase = this.createPaperBase(width, height);

        void loadNameFont().then(() => this.queueRedraw());
    }

    // ------------------------------------------------------------------ ẢNH AVATAR

    public preloadAvatar(url: string, onLoaded?: () => void): void {
        avatarStore.load(url, () => {
            onLoaded?.();
            this.queueRedraw();
        });
    }

    private getAvatarImage(entry: SheetEntry): HTMLImageElement | null {
        const fallback = DEFAULT_VIEWER_AVATAR;
        const url = entry.avatarUrl || fallback;
        const img = avatarStore.get(url);
        if (img) return img;
        if (avatarStore.hasFailed(url)) {
            // Không ghép ảnh test của người khác khi avatar thật thiếu hoặc tải lỗi.
            const fb = avatarStore.get(fallback);
            if (fb) return fb;
            this.preloadAvatar(fallback);
            return null;
        }
        this.preloadAvatar(url);
        return null;
    }

    /** Vẽ lại lần gần nhất khi ảnh/font tải xong (gộp nhiều lần tải trong 1 khung hình). */
    private queueRedraw(): void {
        if (this.redrawQueued || !this.lastArgs) return;
        this.redrawQueued = true;
        this.staticKey = null; // ảnh/font mới tải xong -> chụp lại phần tĩnh
        requestAnimationFrame(() => {
            this.redrawQueued = false;
            if (this.lastArgs) this.renderSheetProgress(...this.lastArgs);
        });
    }

    // ------------------------------------------------------------------ VẼ TỜ GIẤY

    public renderSheet(sheet: Sheet): void {
        this.renderSheetProgress(sheet, null, 1.0);
    }

    /**
     * @param activeSlot ô đang in (null nếu không in)
     * @param progress tiến độ in ô đó (0 -> 1), nội dung hiện dần từ trên xuống
     * @param gleam vệt sáng quét qua khung vàng (0 -> 1)
     */
    public renderSheetProgress(
        sheet: Sheet,
        activeSlot: number | null = null,
        progress = 1.0,
        activeEntry?: SheetEntry,
        gleam = 0.0
    ): void {
        this.lastArgs = [sheet, activeSlot, progress, activeEntry, gleam];

        // Đang in: phần còn lại của tờ không đổi -> chụp sẵn 1 lần, mỗi khung hình chỉ vẽ lại ô đang in
        const cell = sheet.kind !== 'special' && activeSlot !== null && activeEntry ? this.activeCell(activeSlot, activeEntry) : null;
        if (cell) {
            const key = `${sheet.id}|${activeSlot}|${activeEntry?.jobId}|${sheet.entries.map((e) => `${e.slot}:${e.jobId}`).join(',')}`;
            if (key !== this.staticKey) {
                this.drawPaperBase(0, 0, this.W, this.H);
                this.renderStandardGrid(sheet, activeSlot, 0, activeEntry, 0);
                this.staticLayer ??= document.createElement('canvas');
                this.staticLayer.width = this.canvas.width;
                this.staticLayer.height = this.canvas.height;
                this.staticLayer.getContext('2d')!.drawImage(this.canvas, 0, 0);
                this.staticKey = key;
            }
            this.ctx.save();
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.drawImage(this.staticLayer!, 0, 0);
            this.ctx.restore();
            // Ô đang in vẽ lại từ nền giấy trắng (tránh vòng nét đứt bị vẽ chồng đậm dần)
            this.drawPaperBase(cell.x, cell.y, cell.w, cell.h);
            this.withPrintClip(cell.x, cell.y, cell.w, cell.h, progress, cell.tier, () =>
                this.renderEntry(cell.x, cell.y, cell.w, cell.h, activeEntry!, cell.tier, gleam)
            );
            this.renderHeader(sheet);
            this.renderFooterPerforation();
            this.texture.needsUpdate = true;
            return;
        }
        this.staticKey = null;

        this.drawPaperBase(0, 0, this.W, this.H);

        if (sheet.kind === 'special') {
            const entry = activeEntry ?? sheet.entries[0];
            if (entry) {
                const { x, y, w, h } = this.specialRect();
                this.withPrintClip(x, y, w, h, activeSlot !== null ? progress : 1, 'legend', () =>
                    this.renderEntry(x, y, w, h, entry, 'legend', gleam)
                );
            }
        } else {
            this.renderStandardGrid(sheet, activeSlot, progress, activeEntry, gleam);
        }

        // Header vẽ SAU nội dung: hào quang/vùng xoá khi in dần không bao giờ đè lên dải tiêu đề
        this.renderHeader(sheet);
        this.renderFooterPerforation();
        this.texture.needsUpdate = true;
    }

    /** Vẽ lại một vùng nền giấy (toạ độ logic) */
    private drawPaperBase(x: number, y: number, w: number, h: number): void {
        const s = this.scale;
        const sx = Math.max(0, x);
        const sy = Math.max(0, y);
        const sw = Math.min(this.W - sx, w - (sx - x));
        const sh = Math.min(this.H - sy, h - (sy - y));
        if (sw <= 0 || sh <= 0) return;
        this.ctx.drawImage(this.paperBase, sx * s, sy * s, sw * s, sh * s, sx, sy, sw, sh);
    }

    private createPaperBase(width: number, height: number): HTMLCanvasElement {
        const c = document.createElement('canvas');
        c.width = Math.round(width * this.scale);
        c.height = Math.round(height * this.scale);
        const ctx = c.getContext('2d')!;
        ctx.scale(this.scale, this.scale);

        ctx.fillStyle = '#fbfaf6';
        ctx.fillRect(0, 0, width, height);

        // Vân giấy cố định (seeded)
        let seed = 1337;
        const rnd = () => {
            seed = (seed * 16807) % 2147483647;
            return seed / 2147483647;
        };
        for (let i = 0; i < 2200; i++) {
            ctx.fillStyle = `rgba(${200 + rnd() * 30}, ${190 + rnd() * 30}, ${170 + rnd() * 30}, ${0.05 + rnd() * 0.08})`;
            ctx.fillRect(rnd() * width, rnd() * height, 1 + rnd() * 2, 1 + rnd() * 2);
        }
        // Tối nhẹ ở mép giấy
        const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.35, width / 2, height / 2, height * 0.75);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(120, 100, 70, 0.08)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = '#e7e2d6';
        ctx.lineWidth = 4;
        ctx.strokeRect(12, 12, width - 24, height - 24);
        return c;
    }

    private renderHeader(sheet: Sheet): void {
        const width = this.W;
        const ctx = this.ctx;

        ctx.fillStyle = '#1e293b';
        this.roundRect(30, 30, width - 60, 90, 14);
        ctx.fill();

        ctx.textBaseline = 'alphabetic';
        ctx.font = 'bold 32px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'left';
        ctx.fillText('⚡ TIKTOK LIVE HẠNH ĐINHO', 50, 78);

        ctx.font = 'bold 22px monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'right';
        const sheetLabel = sheet.kind === 'special' ? '★ GOLD VIP SHEET ★' : `SHEET #${String(sheet.id).padStart(4, '0')}`;
        ctx.fillText(sheetLabel, width - 50, 78);

        ctx.font = '600 14px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'left';
        ctx.fillText('LIVE COMMUNITY PHOTO WALL • PRINTED ON DEMAND', 50, 104);
    }

    // Bố cục lưới (giữ nguyên toạ độ vì cây bút 3D bám theo các hằng số này trong PrinterWorkshopScene)
    private gridLayout() {
        const width = this.W;
        const height = this.H;
        const startX = 46;
        const startY = 160;
        const totalW = width - startX * 2;
        const totalH = height - startY - 76;
        const gapX = 36;
        const gapY = 40;
        return {
            startX,
            startY,
            gapX,
            gapY,
            normalW: (totalW - gapX) / 2,
            rowH: (totalH - gapY) / 2,
            wideW: totalW,
        };
    }

    private specialRect() {
        const width = this.W;
        const height = this.H;
        const y = 160;
        return { x: 50, y, w: width - 100, h: height - y - 80 };
    }

    /** Vị trí + cỡ ô đang in trong lưới 2 hàng (quà to chiếm cả hàng) */
    private activeCell(slot: number, entry: SheetEntry): { x: number; y: number; w: number; h: number; tier: Tier } {
        const L = this.gridLayout();
        const row = slot < 2 ? 0 : 1;
        const y = L.startY + row * (L.rowH + L.gapY);
        const wide = entry.isWide ?? (entry.frame === 'gold' || entry.frame === 'vip');
        const tier: Tier = entry.frame === 'vip' ? 'legend' : entry.frame === 'gold' || wide ? 'gold' : 'normal';
        if (wide) return { x: L.startX, y, w: L.wideW, h: L.rowH, tier };
        const col = slot % 2;
        return { x: L.startX + col * (L.normalW + L.gapX), y, w: L.normalW, h: L.rowH, tier };
    }

    private renderStandardGrid(
        sheet: Sheet,
        activeSlot: number | null,
        progress: number,
        activeEntry: SheetEntry | undefined,
        gleam: number
    ): void {
        const L = this.gridLayout();

        for (let row = 0; row < 2; row++) {
            const y = L.startY + row * (L.rowH + L.gapY);
            const slotStart = row * 2;
            const inRow = (slot: number | null) => slot === slotStart || slot === slotStart + 1;

            const rowEntries = sheet.entries.filter((e) => inRow(e.slot));
            const activeHere = inRow(activeSlot) && activeEntry ? activeEntry : undefined;
            const activeIsWide = Boolean(activeHere && (activeHere.isWide ?? (activeHere.frame === 'gold' || activeHere.frame === 'vip')));
            const wideEntry = activeIsWide ? activeHere : rowEntries.find((e) => e.isWide);

            if (wideEntry) {
                // Quà to: chiếm nguyên cả hàng
                const p = activeIsWide ? progress : 1;
                this.withPrintClip(L.startX, y, L.wideW, L.rowH, p, wideEntry.frame === 'vip' ? 'legend' : 'gold', () =>
                    this.renderEntry(L.startX, y, L.wideW, L.rowH, wideEntry, wideEntry.frame === 'vip' ? 'legend' : 'gold', gleam)
                );
                continue;
            }

            for (let col = 0; col < 2; col++) {
                const slotIdx = slotStart + col;
                const x = L.startX + col * (L.normalW + L.gapX);
                const entry = slotIdx === activeSlot && activeEntry ? activeEntry : rowEntries.find((e) => e.slot === slotIdx);
                const p = slotIdx === activeSlot ? progress : 1;

                if (!entry) {
                    this.renderEmptySlot(x, y, L.normalW, L.rowH);
                    continue;
                }
                const tier: Tier = entry.frame === 'vip' ? 'legend' : entry.frame === 'gold' ? 'gold' : 'normal';
                this.withPrintClip(x, y, L.normalW, L.rowH, p, tier, () =>
                    this.renderEntry(x, y, L.normalW, L.rowH, entry, tier, gleam)
                );
            }
        }
    }

    /** Ô trống: chỉ một vòng tròn nét đứt mờ báo chỗ sẽ in */
    private renderEmptySlot(x: number, y: number, w: number, h: number): void {
        const ctx = this.ctx;
        const { cx, cy, r } = this.avatarGeometry(x, y, w, h, 'normal');
        ctx.save();
        ctx.setLineDash([10, 10]);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Phần đã in hiện dần từ trên xuống + vệt mực phát sáng ở mép đang vẽ.
     */
    private withPrintClip(x: number, y: number, w: number, h: number, progress: number, tier: Tier, draw: () => void): void {
        const ctx = this.ctx;
        if (progress >= 1) {
            draw();
            return;
        }
        const printedH = Math.max(1, h * Math.max(0, progress));

        // Ô đang chờ phần chưa in: vòng nét đứt
        this.renderEmptySlot(x, y, w, h);

        ctx.save();
        ctx.beginPath();
        ctx.rect(x - 60, y - 60, w + 120, printedH + 60);
        ctx.clip();
        // Xoá vòng nét đứt ở phần đã in (chỉ trong ô, không lẹm sang ô bên cạnh) rồi vẽ nội dung
        this.drawPaperBase(x, y, w, printedH);
        draw();
        ctx.restore();

        if (progress > 0) {
            const scanY = y + printedH;
            const glow = tier === 'normal' ? '56, 189, 248' : '251, 191, 36';
            const beam = ctx.createLinearGradient(x, scanY, x + w, scanY);
            beam.addColorStop(0, `rgba(${glow}, 0)`);
            beam.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
            beam.addColorStop(1, `rgba(${glow}, 0)`);
            ctx.save();
            ctx.strokeStyle = beam;
            ctx.lineWidth = 4;
            ctx.shadowColor = `rgb(${glow})`;
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.moveTo(x, scanY);
            ctx.lineTo(x + w, scanY);
            ctx.stroke();
            ctx.restore();
        }
    }

    private avatarGeometry(x: number, y: number, w: number, h: number, tier: Tier) {
        // Chừa chỗ cho khung vàng (vương miện phía trên) và tên phía dưới
        // VIP trong 1 hàng: avatar cùng cỡ khung vàng; chỉ trang đặc biệt (cũ) mới phóng to cả trang
        const fullPage = tier === 'legend' && h > 900;
        const nameSpace = fullPage ? 190 : tier === 'normal' ? 110 : 120;
        const frameSpace = tier === 'legend' ? 0.4 : tier === 'gold' ? 0.3 : 0.08;
        const maxR = Math.min(w / 2 - 20, (h - nameSpace) / 2) / (1 + frameSpace);
        const r = fullPage ? maxR : Math.min(maxR, tier === 'normal' ? 165 : 185);
        const crownLift = tier === 'normal' ? 0 : r * 0.12;
        const cx = x + w / 2;
        const cy = y + (h - nameSpace) / 2 + crownLift;
        return { cx, cy, r };
    }

    private renderEntry(x: number, y: number, w: number, h: number, entry: SheetEntry, tier: Tier, gleam: number): void {
        const { cx, cy, r } = this.avatarGeometry(x, y, w, h, tier);

        if (tier === 'normal') {
            this.drawAvatarCircle(cx, cy, r, entry, 'normal');
            if (entry.frame === 'rose') {
                this.drawRoseFrame(cx, cy, r);
            }
        } else {
            this.drawGoldFrame(cx, cy, r, tier, gleam, () => this.drawAvatarCircle(cx, cy, r, entry, tier));
        }

        const fullPage = tier === 'legend' && h > 900;
        const ringOuter = tier === 'normal' ? r + 8 : r * (tier === 'legend' ? 1.3 : 1.26);
        const nameY = cy + ringOuter + (fullPage ? 95 : 62);
        const maxFont = fullPage ? 84 : tier === 'normal' ? 46 : 64;
        this.drawName(entry.username, cx, nameY, w - 40, maxFont, tier);
    }

    /** Khung đá quý pastel: kim loại hồng/xanh, bốn viên đá cắt hình thoi. */
    private drawRoseFrame(cx: number, cy: number, r: number): void {
        const ctx = this.ctx;
        ctx.save();
        const ring = (radius: number, width: number, color: string | CanvasGradient) => {
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.lineWidth = width;
            ctx.strokeStyle = color;
            ctx.stroke();
        };
        const metal = ctx.createLinearGradient(cx - r, cy + r * 0.45, cx + r, cy - r * 0.45);
        metal.addColorStop(0, '#743e50');
        metal.addColorStop(0.18, '#be7f87');
        metal.addColorStop(0.38, '#ffddd1');
        metal.addColorStop(0.5, '#fff6de');
        metal.addColorStop(0.62, '#d7f4cd');
        metal.addColorStop(0.82, '#86b9a0');
        metal.addColorStop(1, '#416d66');

        // Bóng nhẹ dưới khung; giữ thoáng vùng avatar.
        ctx.shadowColor = 'rgba(81, 48, 55, 0.23)';
        ctx.shadowBlur = 7;
        ctx.shadowOffsetY = 3;
        ring(r + 10, 24, '#a8787c');
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ring(r + 10, 22, metal);
        ring(r + 22, 1.5, '#b88b91');
        ring(r + 20, 2.5, '#fff0db');
        ring(r + 15, 1.7, '#71545a');
        ring(r + 12.5, 2, '#fff4df');
        ring(r + 5, 2, '#72535d');
        ring(r + 2.5, 2.5, '#ffe9df');
        ring(r + 0.5, 1, '#b18091');

        // Vệt phản sáng mảnh trên hai nửa ánh kim.
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(255, 249, 227, 0.85)';
        for (const start of [-2.95, -1.35]) {
            ctx.beginPath();
            ctx.arc(cx, cy, r + 17, start, start + 1.15);
            ctx.stroke();
        }

        const stone = (angle: number, blue: boolean) => {
            const x = cx + Math.cos(angle) * (r + 11);
            const y = cy + Math.sin(angle) * (r + 11);
            ctx.save();
            ctx.translate(x, y);
            const diamond = (size: number) => {
                ctx.beginPath();
                ctx.moveTo(0, -size);
                ctx.lineTo(size * 0.83, 0);
                ctx.lineTo(0, size);
                ctx.lineTo(-size * 0.83, 0);
                ctx.closePath();
            };
            ctx.shadowColor = 'rgba(66, 45, 68, 0.35)';
            ctx.shadowBlur = 3;
            ctx.shadowOffsetY = 2;
            diamond(20);
            ctx.fillStyle = '#fce4d2';
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
            ctx.strokeStyle = '#8d7586';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            const gem = ctx.createLinearGradient(-12, -13, 12, 14);
            gem.addColorStop(0, blue ? '#d3e6ff' : '#fff0eb');
            gem.addColorStop(0.45, blue ? '#6e9cdb' : '#e8a6bc');
            gem.addColorStop(1, blue ? '#334b90' : '#ad6b88');
            diamond(16);
            ctx.fillStyle = gem;
            ctx.fill();
            const facet = (points: number[], color: string) => {
                ctx.beginPath();
                ctx.moveTo(points[0], points[1]);
                for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
                ctx.closePath();
                ctx.fillStyle = color;
                ctx.fill();
            };
            facet([0, -16, -13, 0, -4, -1], blue ? '#bcd6f5' : '#fbd8de');
            facet([0, -16, 13, 0, 4, -1], blue ? '#819ed0' : '#e5aec4');
            facet([-13, 0, 0, 16, -4, -1], blue ? '#5776b0' : '#c68ba7');
            facet([13, 0, 0, 16, 4, -1], blue ? '#3e568e' : '#b27897');
            facet([0, -9, 5, 0, 0, 9, -5, 0], blue ? '#98bdec' : '#efc3cf');
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-12, 0);
            ctx.lineTo(0, -15);
            ctx.lineTo(5, -9);
            ctx.stroke();
            ctx.restore();
        };
        stone(-Math.PI / 2, true);
        stone(Math.PI, true);
        stone(0, false);
        stone(Math.PI / 2, false);
        ctx.restore();
    }
    private drawAvatarCircle(cx: number, cy: number, r: number, entry: SheetEntry, tier: Tier): void {
        const ctx = this.ctx;
        const img = this.getAvatarImage(entry);

        // Bóng đổ mềm dưới avatar
        ctx.save();
        ctx.shadowColor = 'rgba(15, 23, 42, 0.28)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 10;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, r + (tier === 'normal' ? 8 : 2), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();
        if (img) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            // Cắt vuông ở giữa ảnh nguồn thay vì kéo méo ảnh dọc/ngang thành hình vuông.
            const side = Math.min(img.naturalWidth, img.naturalHeight);
            ctx.drawImage(img,
                (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
                cx - r, cy - r, r * 2, r * 2);
        } else {
            // Đang tải ảnh: nền màu nhạt theo tên
            const hue = this.hue(entry.username);
            ctx.fillStyle = `hsl(${hue}, 70%, 88%)`;
            ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
        // Giữ chút bóng giấy ảnh, tránh phủ trắng làm mất tương phản khuôn mặt.
        const shine = ctx.createLinearGradient(cx, cy - r, cx, cy);
        shine.addColorStop(0, 'rgba(255,255,255,0.035)');
        shine.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shine;
        ctx.fillRect(cx - r, cy - r, r * 2, r);
        ctx.restore();

        if (tier === 'normal') {
            const hue = this.hue(entry.username);
            ctx.save();
            ctx.lineWidth = 3;
            ctx.strokeStyle = `hsla(${hue}, 75%, 60%, 0.9)`;
            ctx.beginPath();
            ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    /** Khung vàng trang trí: vành kim loại, viền hạt châu, đá quý, lấp lánh, vương miện (và nguyệt quế cho legend). */
    private drawGoldFrame(cx: number, cy: number, r: number, tier: Tier, gleam: number, drawInside: () => void): void {
        const ctx = this.ctx;
        const ringW = r * (tier === 'legend' ? 0.2 : 0.17);
        const ringR = r + ringW / 2;
        const outerR = r + ringW;

        // Hào quang
        ctx.save();
        const halo = ctx.createRadialGradient(cx, cy, r, cx, cy, outerR * 1.45);
        halo.addColorStop(0, 'rgba(253, 224, 71, 0.45)');
        halo.addColorStop(1, 'rgba(253, 224, 71, 0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR * 1.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (tier === 'legend') {
            this.drawSunburst(cx, cy, outerR);
            this.drawLaurel(cx, cy, outerR);
        }

        drawInside();

        // Vành vàng kim loại (gradient xoay quanh tạo cảm giác kim loại đánh bóng)
        const metal = ctx.createConicGradient(-Math.PI / 4, cx, cy);
        const stops = ['#fff3b0', '#e8a317', '#a8650a', '#f7c948', '#fffbe0', '#c9850f', '#8a5208', '#f2b632', '#fff3b0'];
        stops.forEach((c, i) => metal.addColorStop(i / (stops.length - 1), c));
        ctx.save();
        ctx.shadowColor = 'rgba(120, 72, 0, 0.45)';
        ctx.shadowBlur = 10;
        ctx.lineWidth = ringW;
        ctx.strokeStyle = metal;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Chỉ viền nâu đậm trong/ngoài
        ctx.save();
        ctx.strokeStyle = '#6b3d05';
        ctx.lineWidth = 2;
        for (const rr of [r + 1, outerR]) {
            ctx.beginPath();
            ctx.arc(cx, cy, rr, 0, Math.PI * 2);
            ctx.stroke();
        }
        // Đường khắc chìm giữa vành
        ctx.strokeStyle = 'rgba(255, 250, 220, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Hạt châu quanh mép ngoài
        const beads = tier === 'legend' ? 48 : 36;
        const beadR = ringW * 0.16;
        for (let i = 0; i < beads; i++) {
            const a = (i / beads) * Math.PI * 2;
            const bx = cx + Math.cos(a) * (outerR + beadR * 1.2);
            const by = cy + Math.sin(a) * (outerR + beadR * 1.2);
            const g = ctx.createRadialGradient(bx - beadR * 0.4, by - beadR * 0.4, 0, bx, by, beadR);
            g.addColorStop(0, '#fffbe6');
            g.addColorStop(0.5, '#f5b82e');
            g.addColorStop(1, '#8a5208');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(bx, by, beadR, 0, Math.PI * 2);
            ctx.fill();
        }

        // Đá quý gắn trên vành (trái, phải, dưới)
        const gemColors = tier === 'legend' ? ['#e11d48', '#2563eb', '#059669', '#9333ea'] : ['#e11d48', '#2563eb', '#e11d48'];
        const gemAngles = tier === 'legend' ? [Math.PI, 0, Math.PI / 2, Math.PI * 0.75] : [Math.PI, 0, Math.PI / 2];
        gemAngles.forEach((a, i) => {
            this.drawGem(cx + Math.cos(a) * ringR, cy + Math.sin(a) * ringR, ringW * 0.42, gemColors[i % gemColors.length]);
        });

        // Vệt sáng chạy quanh vành khi vừa in xong
        if (gleam > 0 && gleam < 1) {
            const a = -Math.PI / 2 + gleam * Math.PI * 2;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = 'rgba(255, 255, 230, 0.85)';
            ctx.lineWidth = ringW * 0.6;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(cx, cy, ringR, a - 0.35, a);
            ctx.stroke();
            ctx.restore();
        }

        // Ánh lấp lánh
        const sparkles = tier === 'legend' ? 7 : 4;
        for (let i = 0; i < sparkles; i++) {
            const a = -Math.PI * 0.85 + (i / sparkles) * Math.PI * 1.9 + 0.3;
            const d = outerR + ringW * (0.9 + (i % 2) * 0.5);
            this.drawSparkle(cx + Math.cos(a) * d, cy + Math.sin(a) * d, ringW * (0.35 + (i % 3) * 0.12));
        }

        if (tier === 'legend') this.drawRoyalCrown(cx, cy - outerR + ringW * 0.1, r * 0.7);
        else this.drawCrown(cx, cy - outerR + ringW * 0.15, r * 0.5);
    }

    private drawGem(x: number, y: number, size: number, color: string): void {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(x, y);
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size * 0.8, 0);
        ctx.lineTo(0, size);
        ctx.lineTo(-size * 0.8, 0);
        ctx.closePath();
        const g = ctx.createLinearGradient(-size, -size, size, size);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.35, color);
        g.addColorStop(1, '#111827');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#7a4a06';
        ctx.stroke();
        ctx.restore();
    }

    private drawSparkle(x: number, y: number, size: number): void {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = '#fffbe8';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = size;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const rr = i % 2 === 0 ? size : size * 0.22;
            ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    private drawCrown(cx: number, baseY: number, width: number): void {
        const ctx = this.ctx;
        const h = width * 0.62;
        const w = width;
        ctx.save();
        ctx.translate(cx, baseY);
        ctx.shadowColor = 'rgba(120, 72, 0, 0.5)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;

        ctx.beginPath();
        ctx.moveTo(-w / 2, 0);
        ctx.lineTo(-w / 2 - w * 0.04, -h * 0.75);
        ctx.lineTo(-w * 0.25, -h * 0.35);
        ctx.lineTo(0, -h);
        ctx.lineTo(w * 0.25, -h * 0.35);
        ctx.lineTo(w / 2 + w * 0.04, -h * 0.75);
        ctx.lineTo(w / 2, 0);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, -h, 0, 0);
        g.addColorStop(0, '#fff6c4');
        g.addColorStop(0.45, '#f5b82e');
        g.addColorStop(1, '#9a5b07');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#6b3d05';
        ctx.stroke();

        // Đai vương miện
        ctx.fillStyle = '#b8720b';
        ctx.fillRect(-w / 2, -h * 0.16, w, h * 0.16);
        ctx.strokeRect(-w / 2, -h * 0.16, w, h * 0.16);

        // Ngọc trên các đỉnh
        for (const [px, py] of [[-w / 2 - w * 0.04, -h * 0.75], [0, -h], [w / 2 + w * 0.04, -h * 0.75]]) {
            const pearl = ctx.createRadialGradient(px - 2, py - 2, 0, px, py, w * 0.06);
            pearl.addColorStop(0, '#ffffff');
            pearl.addColorStop(1, '#e5d3a1');
            ctx.fillStyle = pearl;
            ctx.beginPath();
            ctx.arc(px, py, w * 0.055, 0, Math.PI * 2);
            ctx.fill();
        }
        this.drawGem(0, -h * 0.42, w * 0.08, '#e11d48');
        ctx.restore();
    }

    /** Tia hào quang vàng toả ra sau khung VIP */
    private drawSunburst(cx: number, cy: number, radius: number): void {
        const ctx = this.ctx;
        const rays = 24;
        const outer = radius * 1.55;
        ctx.save();
        for (let i = 0; i < rays; i++) {
            const a = (i / rays) * Math.PI * 2;
            const half = (Math.PI / rays) * 0.45;
            const g = ctx.createRadialGradient(cx, cy, radius * 0.9, cx, cy, outer * (i % 2 ? 0.92 : 1));
            g.addColorStop(0, 'rgba(253, 224, 71, 0.55)');
            g.addColorStop(1, 'rgba(253, 224, 71, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, outer * (i % 2 ? 0.92 : 1), a - half, a + half);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    /** Vương miện hoàng gia cho khung VIP: 5 đỉnh, lót nhung đỏ, đai nạm ngọc, quả cầu thập tự trên đỉnh */
    private drawRoyalCrown(cx: number, baseY: number, width: number): void {
        const ctx = this.ctx;
        const w = width;
        const h = w * 0.7;
        ctx.save();
        ctx.translate(cx, baseY);

        // Lót nhung đỏ phía sau
        ctx.beginPath();
        ctx.ellipse(0, -h * 0.42, w * 0.42, h * 0.5, 0, Math.PI, 0);
        const velvet = ctx.createRadialGradient(-w * 0.1, -h * 0.6, 2, 0, -h * 0.4, w * 0.5);
        velvet.addColorStop(0, '#f43f5e');
        velvet.addColorStop(1, '#7f1d1d');
        ctx.fillStyle = velvet;
        ctx.fill();

        // Thân vương miện 5 đỉnh
        const tips = [-0.5, -0.27, 0, 0.27, 0.5];
        const tipH = [0.78, 0.95, 1.05, 0.95, 0.78];
        ctx.beginPath();
        ctx.moveTo(-w / 2, 0);
        tips.forEach((t, i) => {
            const tx = t * w;
            ctx.lineTo(tx, -h * tipH[i]);
            if (i < tips.length - 1) {
                const mx = ((t + tips[i + 1]) / 2) * w;
                ctx.quadraticCurveTo(mx, -h * 0.25, tips[i + 1] * w, -h * tipH[i + 1]);
            }
        });
        ctx.lineTo(w / 2, 0);
        ctx.closePath();
        const gold = ctx.createLinearGradient(-w / 2, -h, w / 2, 0);
        gold.addColorStop(0, '#fff7cc');
        gold.addColorStop(0.3, '#f8c845');
        gold.addColorStop(0.55, '#fff2b3');
        gold.addColorStop(0.8, '#d6930f');
        gold.addColorStop(1, '#8a5208');
        ctx.shadowColor = 'rgba(120, 72, 0, 0.55)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = gold;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#6b3d05';
        ctx.stroke();

        // Đai vương miện nạm ngọc
        const bandH = h * 0.2;
        const band = ctx.createLinearGradient(0, -bandH, 0, 0);
        band.addColorStop(0, '#fde68a');
        band.addColorStop(1, '#b7791f');
        ctx.fillStyle = band;
        ctx.fillRect(-w / 2, -bandH, w, bandH);
        ctx.strokeRect(-w / 2, -bandH, w, bandH);
        const gems = ['#2563eb', '#e11d48', '#059669', '#e11d48', '#2563eb'];
        gems.forEach((c, i) => this.drawGem((i - 2) * w * 0.2, -bandH / 2, bandH * 0.42, c));

        // Ngọc trai trên các đỉnh + thập tự giữa
        tips.forEach((t, i) => {
            if (i === 2) return;
            const px = t * w;
            const py = -h * tipH[i];
            const pearl = ctx.createRadialGradient(px - 3, py - 3, 0, px, py, w * 0.05);
            pearl.addColorStop(0, '#ffffff');
            pearl.addColorStop(1, '#e5d3a1');
            ctx.fillStyle = pearl;
            ctx.beginPath();
            ctx.arc(px, py, w * 0.045, 0, Math.PI * 2);
            ctx.fill();
        });
        const topY = -h * tipH[2];
        ctx.fillStyle = gold;
        ctx.beginPath();
        ctx.arc(0, topY - w * 0.04, w * 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillRect(-w * 0.012, topY - w * 0.17, w * 0.024, w * 0.1);
        ctx.fillRect(-w * 0.045, topY - w * 0.14, w * 0.09, w * 0.024);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-w * 0.012, topY - w * 0.17, w * 0.024, w * 0.1);
        ctx.strokeRect(-w * 0.045, topY - w * 0.14, w * 0.09, w * 0.024);

        // Ngọc lớn giữa thân
        this.drawGem(0, -h * 0.5, w * 0.075, '#e11d48');
        this.drawGem(-w * 0.27, -h * 0.45, w * 0.05, '#059669');
        this.drawGem(w * 0.27, -h * 0.45, w * 0.05, '#059669');
        ctx.restore();
    }

    private drawLaurel(cx: number, cy: number, radius: number): void {
        const ctx = this.ctx;
        const leafR = radius * 1.12;
        for (const side of [-1, 1]) {
            for (let i = 0; i < 9; i++) {
                const a = Math.PI / 2 + side * (0.35 + i * 0.2);
                const lx = cx + Math.cos(a) * leafR;
                const ly = cy + Math.sin(a) * leafR;
                ctx.save();
                ctx.translate(lx, ly);
                ctx.rotate(a + (side > 0 ? -Math.PI / 2 - 0.5 : Math.PI / 2 + 0.5));
                const len = radius * 0.17;
                const g = ctx.createLinearGradient(0, -len, 0, len);
                g.addColorStop(0, '#fde68a');
                g.addColorStop(1, '#b7791f');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.ellipse(0, 0, len * 0.38, len, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(107, 61, 5, 0.6)';
                ctx.lineWidth = 1.2;
                ctx.stroke();
                ctx.restore();
            }
        }
    }

    /** Tên người xem: chữ tròn đậm, màu đậm trên viền trắng dày -> đọc rõ từ xa trên livestream. */
    private drawName(username: string, cx: number, baselineY: number, maxWidth: number, maxFont: number, tier: Tier): void {
        const ctx = this.ctx;
        const name = username.length > 22 ? `${username.slice(0, 21)}…` : username;

        let size = maxFont;
        const font = (px: number) => `${NAME_WEIGHT} ${px}px ${NAME_FONT_STACK}`;
        ctx.font = font(size);
        while (ctx.measureText(name).width > maxWidth && size > 20) {
            size -= 2;
            ctx.font = font(size);
        }
        const textW = ctx.measureText(name).width;
        // Baloo có phần dấu cao: hạ nhẹ chữ cho cân với avatar
        const y = baselineY + size * 0.12;

        let fill: string | CanvasGradient;
        let outline: string;
        if (tier === 'normal') {
            // Một màu đậm duy nhất theo tên (đủ tương phản với giấy trắng)
            // Bảng màu đậm, tươi, dễ đọc trên giấy trắng (bỏ vàng/xanh rêu khó nhìn)
            const palette = ['#e11d48', '#db2777', '#9333ea', '#4f46e5', '#2563eb', '#0284c7', '#0d9488', '#059669', '#ea580c', '#c2410c'];
            fill = palette[Math.abs(Math.round(this.hue(username))) % palette.length];
            outline = 'rgba(15, 23, 42, 0.55)';
        } else {
            fill = ctx.createLinearGradient(0, y - size * 0.8, 0, y + size * 0.1);
            fill.addColorStop(0, '#fde68a');
            fill.addColorStop(0.45, '#f59e0b');
            fill.addColorStop(1, '#b45309');
            outline = '#4a2503';
        }

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;

        // 1. Viền trắng gọn, bóng sát nét để chữ không có quầng mờ khi lên LIVE.
        ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetY = 1;
        ctx.lineWidth = size * 0.26;
        ctx.strokeStyle = '#ffffff';
        ctx.strokeText(name, cx, y);
        ctx.shadowColor = 'transparent';

        // 2. Viền tối mảnh làm nét chữ sắc
        ctx.lineWidth = Math.max(1.5, size * (tier === 'normal' ? 0.04 : 0.055));
        ctx.strokeStyle = outline;
        ctx.strokeText(name, cx, y);

        // 3. Lõi chữ
        ctx.fillStyle = fill;
        ctx.fillText(name, cx, y);

        if (tier !== 'normal') {
            // Ánh kim nhẹ ở nửa trên chữ vàng
            ctx.save();
            ctx.beginPath();
            ctx.rect(cx - textW, y - size, textW * 2, size * 0.5);
            ctx.clip();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
            ctx.fillText(name, cx, y);
            ctx.restore();
        }
        ctx.restore();
    }

    private renderFooterPerforation(): void {
        const width = this.W;
        const height = this.H;
        const ctx = this.ctx;
        const y = height - 25;

        ctx.save();
        ctx.setLineDash([10, 8]);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(30, y);
        ctx.lineTo(width - 30, y);
        ctx.stroke();

        ctx.font = '16px monospace';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('✂ TEAR HERE', 40, y - 6);
        ctx.restore();
    }

    private roundRect(x: number, y: number, w: number, h: number, r: number): void {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    private hue(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash % 360);
    }
}
