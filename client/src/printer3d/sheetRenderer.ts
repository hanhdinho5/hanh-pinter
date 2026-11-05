import * as THREE from 'three';
import type { Sheet, SheetEntry } from '../types';

/**
 * Quản lý vẽ và cập nhật bề mặt tờ giấy in (CanvasTexture)
 * Hỗ trợ in 6 ô avatar, hiệu ứng quét từng dòng (scanline/dither) theo thời gian thực,
 * viền vàng VIP lấp lánh và trang đặc biệt Full Page.
 */
export class SheetCanvasRenderer {
    public canvas: HTMLCanvasElement;
    public ctx: CanvasRenderingContext2D;
    public texture: THREE.CanvasTexture;

    // Cache avatar image element để không tải lại liên tục
    private imageCache = new Map<string, HTMLImageElement>();

    constructor(width = 1024, height = 1536) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        const ctx = this.canvas.getContext('2d');
        if (!ctx) throw new Error('Cannot get 2D context');
        this.ctx = ctx;

        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.generateMipmaps = true;
        this.texture.minFilter = THREE.LinearMipmapLinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
    }

    /**
     * Tải trước avatar ảnh và trigger render lại khi tải xong
     */
    public preloadAvatar(url: string, onLoaded?: () => void): void {
        if (!url || this.imageCache.has(url)) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        // Avatar TikTok đi qua proxy của server (CDN không có CORS)
        const remote = /^https?:\/\/(?!localhost)/.test(url) && !url.includes('/api/avatar');
        const serverUrl = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SERVER_URL ?? `${window.location.protocol}//${window.location.hostname}:3001`;
        const src = remote ? `${serverUrl}/api/avatar?url=${encodeURIComponent(url)}` : url;
        img.onload = () => {
            this.imageCache.set(url, img);
            onLoaded?.();
        };
        img.src = src;
    }

    /**
     * Vẽ toàn bộ tờ giấy dựa vào dữ liệu Sheet (chế độ tĩnh hoàn tất)
     */
    public renderSheet(sheet: Sheet): void {
        this.renderSheetProgress(sheet, null, 1.0);
    }

    /**
     * Vẽ tờ giấy có hỗ trợ hiệu ứng in động từng dòng (Progressive Printing)
     * @param sheet Dữ liệu tờ in
     * @param activeSlot Index ô đang in (0..5 hoặc null nếu không in)
     * @param progress Tiến độ in của ô đang in (0.0 -> 1.0)
     * @param activeEntry Dữ liệu người dùng đang in vào ô đó
     * @param gleam Tiến độ vệt sáng ánh kim quét qua viền vàng (0.0 -> 1.0)
     */
    public renderSheetProgress(
        sheet: Sheet,
        activeSlot: number | null = null,
        progress = 1.0,
        activeEntry?: SheetEntry,
        gleam = 0.0
    ): void {
        const { width, height } = this.canvas;
        const ctx = this.ctx;

        // 1. Nền giấy in ngà ấm cúng
        ctx.fillStyle = '#faf9f5';
        ctx.fillRect(0, 0, width, height);

        // Hiệu ứng vân giấy nhẹ
        ctx.fillStyle = 'rgba(235, 230, 220, 0.35)';
        for (let i = 0; i < 40; i++) {
            const y = Math.random() * height;
            ctx.fillRect(0, y, width, 1.5);
        }

        // 2. Viền mép giấy
        ctx.strokeStyle = '#e2ded5';
        ctx.lineWidth = 4;
        ctx.strokeRect(12, 12, width - 24, height - 24);

        // 3. Header tờ giấy
        this.renderHeader(sheet);

        // 4. Nội dung: Trang đặc biệt hoặc 6 ô chuẩn
        if (sheet.kind === 'special') {
            this.renderSpecialFullPageProgress(sheet, activeSlot !== null, progress, activeEntry ?? sheet.entries[0], gleam);
        } else {
            this.renderStandardGridProgress(sheet, activeSlot, progress, activeEntry, gleam);
        }

        // 5. Đường cắt răng cưa ở chân giấy
        this.renderFooterPerforation();

        this.texture.needsUpdate = true;
    }

    private renderHeader(sheet: Sheet): void {
        const { width } = this.canvas;
        const ctx = this.ctx;

        // Dải tiêu đề
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(30, 30, width - 60, 90);

        // Chữ thương hiệu
        ctx.font = 'bold 32px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'left';
        ctx.fillText('⚡ TIKTOK LIVE PFP PRINTER', 50, 78);

        // Số thứ tự tờ giấy
        ctx.font = 'bold 22px monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'right';
        const sheetLabel = sheet.kind === 'special' ? '★ GOLD VIP SHEET ★' : `SHEET #${String(sheet.id).padStart(4, '0')}`;
        ctx.fillText(sheetLabel, width - 50, 78);

        // Dòng phụ
        ctx.font = '600 14px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'left';
        ctx.fillText('LIVE COMMUNITY PHOTO WALL • PRINTED ON DEMAND', 50, 104);
    }

    private renderStandardGridProgress(
        sheet: Sheet,
        activeSlot: number | null,
        progress: number,
        activeEntry?: SheetEntry,
        gleam = 0.0
    ): void {
        const { width, height } = this.canvas;

        // Bố cục mới: Khổ giấy 4 avatar (2 hàng x 2 cột)
        // Nếu là "quà to" (isWide hoặc frame === 'gold'): chiếm nguyên một hàng và in avatar to hơn!
        const startX = 46;
        const startY = 160;
        const totalW = width - startX * 2; // 932 px
        const totalH = height - startY - 76; // 1300 px

        const gapX = 36;
        const gapY = 40;
        const normalW = (totalW - gapX) / 2; // 448 px
        const rowH = (totalH - gapY) / 2; // 630 px
        const wideW = totalW; // 932 px

        // Duyệt 2 hàng (Hàng 0: slot 0, 1; Hàng 1: slot 2, 3)
        for (let row = 0; row < 2; row++) {
            const y = startY + row * (rowH + gapY);
            const slotStart = row * 2;

            const rowEntries = sheet.entries.filter((e) => e.slot === slotStart || e.slot === slotStart + 1);
            const isRowWideActive =
                (activeSlot === slotStart || activeSlot === slotStart + 1) &&
                Boolean(activeEntry?.isWide || activeEntry?.frame === 'gold');
            const rowWideEntry = isRowWideActive ? activeEntry : rowEntries.find((e) => e.isWide);

            if (rowWideEntry || isRowWideActive) {
                // HÀNG CHIẾM NGUYÊN BẰNG QUÀ TO
                const slotIdx = slotStart;
                if ((activeSlot === slotStart || activeSlot === slotStart + 1) && activeEntry) {
                    this.renderActivePrintingWideSlot(startX, y, wideW, rowH, slotIdx, activeEntry, progress, gleam);
                } else if (rowWideEntry) {
                    this.renderStaticWideSlot(startX, y, wideW, rowH, slotIdx, rowWideEntry, gleam);
                }
            } else {
                // HÀNG BÌNH THƯỜNG: 2 AVATAR (CỘT 0 VÀ CỘT 1)
                for (let col = 0; col < 2; col++) {
                    const slotIdx = slotStart + col;
                    const x = startX + col * (normalW + gapX);

                    if (slotIdx === activeSlot && activeEntry) {
                        this.renderActivePrintingSlot(x, y, normalW, rowH, slotIdx, activeEntry, progress, gleam);
                    } else {
                        const entry = rowEntries.find((e) => e.slot === slotIdx);
                        this.renderStaticSlot(x, y, normalW, rowH, slotIdx, entry, gleam);
                    }
                }
            }
        }
    }

    /**
     * Vẽ ô quà to đang in tiến trình chiếm nguyên cả hàng
     */
    private renderActivePrintingWideSlot(
        x: number,
        y: number,
        w: number,
        h: number,
        slotIdx: number,
        entry: SheetEntry,
        progress: number,
        gleam: number
    ): void {
        const ctx = this.ctx;
        const radius = 20;

        // 1. Nền ô trống trước khi vẽ
        ctx.fillStyle = '#fffdf7';
        this.roundRect(ctx, x, y, w, h, radius);
        ctx.fill();

        ctx.save();
        ctx.setLineDash([10, 10]);
        ctx.strokeStyle = '#fde68a';
        ctx.lineWidth = 3;
        this.roundRect(ctx, x, y, w, h, radius);
        ctx.stroke();
        ctx.restore();

        // 2. Cắt clip phần nội dung đã in từ trên xuống
        const currentPrintH = Math.max(1, h * Math.min(progress, 1.0));

        ctx.save();
        ctx.beginPath();
        ctx.rect(x - 8, y - 8, w + 16, currentPrintH + 8);
        ctx.clip();

        this.renderWideCardContent(x, y, w, h, slotIdx, entry, gleam);

        ctx.restore();

        // 3. Tia quét Laser / nét bút scanline ngang qua cả hàng
        if (progress > 0 && progress < 1.0) {
            const scanY = y + currentPrintH;
            const beamGrad = ctx.createLinearGradient(x, scanY, x + w, scanY);
            beamGrad.addColorStop(0, 'rgba(251, 191, 36, 0.2)');
            beamGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.98)');
            beamGrad.addColorStop(1, 'rgba(251, 191, 36, 0.2)');

            ctx.save();
            ctx.strokeStyle = beamGrad;
            ctx.lineWidth = 5;
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 16;
            ctx.beginPath();
            ctx.moveTo(x - 4, scanY);
            ctx.lineTo(x + w + 4, scanY);
            ctx.stroke();

            // Chấm dither lấp lánh vàng
            ctx.fillStyle = '#f59e0b';
            for (let dot = 0; dot < 24; dot++) {
                const dx = x + Math.random() * w;
                const dy = scanY + (Math.random() * 8 - 4);
                ctx.fillRect(dx, dy, 3, 3);
            }
            ctx.restore();
        }
    }

    /**
     * Vẽ ô quà to tĩnh chiếm nguyên một hàng
     */
    private renderStaticWideSlot(
        x: number,
        y: number,
        w: number,
        h: number,
        slotIdx: number,
        entry: SheetEntry,
        gleam = 0.0
    ): void {
        this.renderWideCardContent(x, y, w, h, slotIdx, entry, gleam);
    }

    /**
     * Nội dung thẻ quà to VIP chiếm nguyên một hàng (avatar to hơn nhiều, typography lộng lẫy)
     */
    private renderWideCardContent(
        x: number,
        y: number,
        w: number,
        h: number,
        slotIdx: number,
        entry: SheetEntry,
        gleam: number
    ): void {
        const ctx = this.ctx;
        const radius = 20;

        // Nền thẻ quà to VIP
        const bgGrad = ctx.createLinearGradient(x, y, x + w, y + h);
        bgGrad.addColorStop(0, '#ffffff');
        bgGrad.addColorStop(0.5, '#fffdf5');
        bgGrad.addColorStop(1, '#fef9c3');
        ctx.fillStyle = bgGrad;
        this.roundRect(ctx, x, y, w, h, radius);
        ctx.fill();

        // Đổ bóng hoàng kim
        ctx.save();
        ctx.shadowColor = 'rgba(245, 158, 11, 0.35)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 6;
        this.roundRect(ctx, x, y, w, h, radius);
        ctx.stroke();
        ctx.restore();

        // Khung viền vàng kép lộng lẫy
        const goldGrad = ctx.createLinearGradient(x, y, x + w, y + h);
        goldGrad.addColorStop(0, '#f59e0b');
        goldGrad.addColorStop(0.25, '#fef08a');
        goldGrad.addColorStop(0.7, '#d97706');
        goldGrad.addColorStop(1, '#b45309');

        ctx.lineWidth = 7;
        ctx.strokeStyle = goldGrad;
        this.roundRect(ctx, x, y, w, h, radius);
        ctx.stroke();

        // Viền chỉ vàng mảnh bên trong
        ctx.save();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(217, 119, 6, 0.5)';
        this.roundRect(ctx, x + 8, y + 8, w - 16, h - 16, radius - 4);
        ctx.stroke();
        ctx.restore();

        // Hiệu ứng ánh kim quét qua (Gleam sweep)
        if (gleam > 0) {
            const gleamX = x - w + gleam * (w * 2);
            const sweepGrad = ctx.createLinearGradient(gleamX, y, gleamX + 100, y + h);
            sweepGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
            sweepGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.9)');
            sweepGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

            ctx.save();
            ctx.lineWidth = 10;
            ctx.strokeStyle = sweepGrad;
            this.roundRect(ctx, x, y, w, h, radius);
            ctx.stroke();
            ctx.restore();
        }

        // 1. Avatar to hơn hẳn (đường kính ~340px) đặt ở bên trái
        const avatarSize = Math.min(340, h - 70);
        const avatarX = x + 48;
        const avatarY = y + (h - avatarSize) / 2;

        this.drawAvatar(avatarX, avatarY, avatarSize, entry.avatarUrl, entry.username, true);

        // 2. Khu vực thông tin VIP ở bên phải
        const textStartX = avatarX + avatarSize + 48;
        const textCenterY = y + h / 2;

        // Huy hiệu VIP lớn
        this.renderBadge(textStartX + 95, textCenterY - 110, '👑 VIP GOLD • BIG GIFT', '#d97706', '#fef3c7');

        // Tên Username to, nổi bật
        ctx.font = 'bold 36px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'left';
        const displayUser = entry.username.length > 20 ? entry.username.slice(0, 19) + '…' : entry.username;
        ctx.fillText(displayUser, textStartX, textCenterY - 30);

        // Dòng phụ cảm ơn & vinh danh
        ctx.font = '600 20px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#b45309';
        ctx.fillText('✨ QUÀ TO ĐẶC BIỆT CHIẾM TRỌN HÀNG ✨', textStartX, textCenterY + 25);

        // Thông tin slot hàng
        ctx.font = '600 16px monospace';
        ctx.fillStyle = '#94a3b8';
        const rowNum = slotIdx < 2 ? 1 : 2;
        ctx.fillText(`★ HÀNG ${rowNum} • TOÀN KHỔ VIP BANNER`, textStartX, textCenterY + 75);
    }

    /**
     * Vẽ ô đang in với hiệu ứng cắt dòng (clip) và tia laser scanline rực sáng
     */
    private renderActivePrintingSlot(
        x: number,
        y: number,
        w: number,
        h: number,
        slotIdx: number,
        entry: SheetEntry,
        progress: number,
        gleam: number
    ): void {
        const ctx = this.ctx;
        const isGold = entry.frame === 'gold';
        const radius = 16;

        // 1. Vẽ nền ô trống phía dưới trước
        ctx.fillStyle = '#f1f1ee';
        this.roundRect(ctx, x, y, w, h, radius);
        ctx.fill();

        ctx.save();
        ctx.setLineDash([8, 8]);
        ctx.strokeStyle = '#d4d4cb';
        ctx.lineWidth = 3;
        this.roundRect(ctx, x, y, w, h, radius);
        ctx.stroke();
        ctx.restore();

        // 2. Cắt clip phần nội dung đã in từ trên xuống
        const currentPrintH = Math.max(1, h * Math.min(progress, 1.0));

        ctx.save();
        ctx.beginPath();
        ctx.rect(x - 8, y - 8, w + 16, currentPrintH + 8);
        ctx.clip();

        // Vẽ nội dung thẻ avatar
        this.renderCardContent(x, y, w, h, slotIdx, entry, isGold, gleam);

        ctx.restore();

        // 3. Tia quét Laser Scanline & Hạt chấm dither tại đường cắt
        if (progress > 0 && progress < 1.0) {
            const scanY = y + currentPrintH;

            // Vệt sáng phát quang ngang qua thẻ
            const beamGrad = ctx.createLinearGradient(x, scanY, x + w, scanY);
            if (isGold) {
                beamGrad.addColorStop(0, 'rgba(251, 191, 36, 0.2)');
                beamGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
                beamGrad.addColorStop(1, 'rgba(251, 191, 36, 0.2)');
            } else {
                beamGrad.addColorStop(0, 'rgba(56, 189, 248, 0.2)');
                beamGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
                beamGrad.addColorStop(1, 'rgba(56, 189, 248, 0.2)');
            }

            ctx.save();
            ctx.strokeStyle = beamGrad;
            ctx.lineWidth = 4;
            ctx.shadowColor = isGold ? '#fbbf24' : '#38bdf8';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(x - 4, scanY);
            ctx.lineTo(x + w + 4, scanY);
            ctx.stroke();

            // Các chấm dither nhiệt mô phỏng in kim ảo
            ctx.fillStyle = isGold ? '#f59e0b' : '#38bdf8';
            for (let dot = 0; dot < 14; dot++) {
                const dx = x + Math.random() * w;
                const dy = scanY + (Math.random() * 6 - 3);
                ctx.fillRect(dx, dy, 2, 2);
            }
            ctx.restore();
        }
    }

    private renderStaticSlot(
        x: number,
        y: number,
        w: number,
        h: number,
        slotIdx: number,
        entry?: SheetEntry,
        gleam = 0.0
    ): void {
        const ctx = this.ctx;
        const radius = 16;

        if (!entry) {
            // Ô TRỐNG
            ctx.fillStyle = '#f1f1ee';
            this.roundRect(ctx, x, y, w, h, radius);
            ctx.fill();

            ctx.save();
            ctx.setLineDash([8, 8]);
            ctx.strokeStyle = '#d4d4cb';
            ctx.lineWidth = 3;
            this.roundRect(ctx, x, y, w, h, radius);
            ctx.stroke();
            ctx.restore();

            ctx.fillStyle = '#9ca3af';
            ctx.font = 'bold 24px "Segoe UI", system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`SLOT ${slotIdx + 1}`, x + w / 2, y + h / 2 - 10);
            ctx.font = '500 16px "Segoe UI", system-ui, sans-serif';
            ctx.fillText('⏳ Chờ in...', x + w / 2, y + h / 2 + 20);
            return;
        }

        // Ô ĐÃ CÓ AVATAR
        const isGold = entry.frame === 'gold';
        this.renderCardContent(x, y, w, h, slotIdx, entry, isGold, gleam);
    }

    private renderCardContent(
        x: number,
        y: number,
        w: number,
        h: number,
        slotIdx: number,
        entry: SheetEntry,
        isGold: boolean,
        gleam: number
    ): void {
        const ctx = this.ctx;
        const radius = 16;

        // Nền thẻ card
        ctx.fillStyle = isGold ? '#fffdf7' : '#ffffff';
        this.roundRect(ctx, x, y, w, h, radius);
        ctx.fill();

        // Đổ bóng thẻ
        ctx.save();
        ctx.shadowColor = isGold ? 'rgba(245, 158, 11, 0.45)' : 'rgba(0, 0, 0, 0.08)';
        ctx.shadowBlur = isGold ? 16 : 10;
        ctx.shadowOffsetY = 4;
        this.roundRect(ctx, x, y, w, h, radius);
        ctx.stroke();
        ctx.restore();

        // Khung viền (vàng hoặc thường)
        if (isGold) {
            const goldGrad = ctx.createLinearGradient(x, y, x + w, y + h);
            goldGrad.addColorStop(0, '#f59e0b');
            goldGrad.addColorStop(0.3, '#fef08a');
            goldGrad.addColorStop(0.7, '#d97706');
            goldGrad.addColorStop(1, '#b45309');

            ctx.lineWidth = 6;
            ctx.strokeStyle = goldGrad;
            this.roundRect(ctx, x, y, w, h, radius);
            ctx.stroke();

            // Hiệu ứng ánh kim quét qua (Gleam Sweep)
            if (gleam > 0) {
                const gleamX = x - w + gleam * (w * 2);
                const sweepGrad = ctx.createLinearGradient(gleamX, y, gleamX + 60, y + h);
                sweepGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
                sweepGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.85)');
                sweepGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

                ctx.save();
                ctx.lineWidth = 8;
                ctx.strokeStyle = sweepGrad;
                this.roundRect(ctx, x, y, w, h, radius);
                ctx.stroke();
                ctx.restore();
            }

            // Huy hiệu vương miện VIP
            this.renderBadge(x + w - 42, y + 16, '👑 GOLD', '#d97706', '#fef3c7');
        } else {
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#cbd5e1';
            this.roundRect(ctx, x, y, w, h, radius);
            ctx.stroke();
        }

        // Kích thước Avatar trong ô (khổ 4 avatar lớn và rõ nét)
        const avatarSize = Math.min(w * 0.62, h * 0.5);
        const avatarX = x + (w - avatarSize) / 2;
        const avatarY = y + 36;

        // Vẽ ảnh Avatar
        this.drawAvatar(avatarX, avatarY, avatarSize, entry.avatarUrl, entry.username, isGold);

        // Vẽ tên Username
        ctx.font = 'bold 26px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'center';
        const displayUser = entry.username.length > 15 ? entry.username.slice(0, 14) + '…' : entry.username;
        ctx.fillText(displayUser, x + w / 2, avatarY + avatarSize + 44);

        // Nhãn số slot
        ctx.font = '600 15px monospace';
        ctx.fillStyle = isGold ? '#b45309' : '#94a3b8';
        ctx.fillText(`PFP #${slotIdx + 1}`, x + w / 2, avatarY + avatarSize + 74);
    }

    private drawAvatar(
        x: number,
        y: number,
        size: number,
        avatarUrl: string | null,
        username: string,
        isGold: boolean
    ): void {
        const ctx = this.ctx;
        const cx = x + size / 2;
        const cy = y + size / 2;
        const r = size / 2;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        const cachedImg = avatarUrl ? this.imageCache.get(avatarUrl) : null;
        if (cachedImg) {
            ctx.drawImage(cachedImg, x, y, size, size);
        } else {
            const hue = this.hashStringToHue(username);
            const grad = ctx.createLinearGradient(x, y, x + size, y + size);
            grad.addColorStop(0, `hsl(${hue}, 80%, 65%)`);
            grad.addColorStop(1, `hsl(${(hue + 45) % 360}, 85%, 45%)`);
            ctx.fillStyle = grad;
            ctx.fillRect(x, y, size, size);

            ctx.font = `bold ${Math.floor(size * 0.44)}px "Segoe UI", system-ui, sans-serif`;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const initial = (username.charAt(0) || 'U').toUpperCase();
            ctx.fillText(initial, cx, cy);
        }

        ctx.restore();

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = isGold ? '#f59e0b' : '#e2e8f0';
        ctx.lineWidth = isGold ? 4 : 2;
        ctx.stroke();
    }

    private renderSpecialFullPageProgress(
        _sheet: Sheet,
        isPrinting: boolean,
        progress: number,
        entry: SheetEntry,
        _gleam = 0.0
    ): void {
        const { width, height } = this.canvas;
        const ctx = this.ctx;

        const x = 50;
        const y = 160;
        const w = width - 100;
        const h = height - y - 80;

        // Nếu đang in thì cắt clip theo tiến trình
        const currentPrintH = isPrinting ? Math.max(1, h * Math.min(progress, 1.0)) : h;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x - 10, y - 10, w + 20, currentPrintH + 20);
        ctx.clip();

        // Nền đặc biệt hoàng gia
        const bgGrad = ctx.createLinearGradient(x, y, x + w, y + h);
        bgGrad.addColorStop(0, '#fffbeb');
        bgGrad.addColorStop(0.5, '#fef3c7');
        bgGrad.addColorStop(1, '#fde68a');
        ctx.fillStyle = bgGrad;
        this.roundRect(ctx, x, y, w, h, 24);
        ctx.fill();

        // Viền vàng lấp lánh kép
        const goldGrad = ctx.createLinearGradient(x, y, x + w, y + h);
        goldGrad.addColorStop(0, '#d97706');
        goldGrad.addColorStop(0.25, '#fbbf24');
        goldGrad.addColorStop(0.5, '#fef08a');
        goldGrad.addColorStop(0.75, '#f59e0b');
        goldGrad.addColorStop(1, '#92400e');

        ctx.lineWidth = 10;
        ctx.strokeStyle = goldGrad;
        this.roundRect(ctx, x, y, w, h, 24);
        ctx.stroke();

        ctx.lineWidth = 3;
        ctx.strokeStyle = '#92400e';
        this.roundRect(ctx, x + 8, y + 8, w - 16, h - 16, 18);
        ctx.stroke();

        // Tiêu đề giải thưởng
        ctx.font = 'bold 38px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#b45309';
        ctx.textAlign = 'center';
        ctx.fillText('👑 LEGENDARY SUPERSTAR 👑', x + w / 2, y + 70);

        ctx.font = '600 20px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#78350f';
        ctx.fillText('FULL PAGE EXCLUSIVE PRINT • 1000+ DIAMONDS', x + w / 2, y + 105);

        // Avatar khổng lồ ở giữa
        const avatarSize = 380;
        const avatarX = x + (w - avatarSize) / 2;
        const avatarY = y + 150;
        const username = entry?.username ?? 'Superstar';
        this.drawAvatar(avatarX, avatarY, avatarSize, entry?.avatarUrl ?? null, username, true);

        // Tên người dùng cực lớn
        ctx.font = 'bold 44px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#451a03';
        ctx.textAlign = 'center';
        ctx.fillText(`@${username}`, x + w / 2, avatarY + avatarSize + 70);

        // Dải ruy băng cảm ơn
        ctx.font = 'bold 24px monospace';
        ctx.fillStyle = '#92400e';
        ctx.fillText('✦ THANK YOU FOR YOUR INCREDIBLE SUPPORT ✦', x + w / 2, avatarY + avatarSize + 120);

        ctx.restore();

        // Tia laser scanline khi đang in
        if (isPrinting && progress < 1.0) {
            const scanY = y + currentPrintH;
            ctx.save();
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 6;
            ctx.shadowColor = '#f59e0b';
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.moveTo(x - 10, scanY);
            ctx.lineTo(x + w + 10, scanY);
            ctx.stroke();
            ctx.restore();
        }
    }

    private renderBadge(x: number, y: number, text: string, stroke: string, fill: string): void {
        const ctx = this.ctx;
        ctx.save();
        ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
        const textMetrics = ctx.measureText(text);
        const bw = textMetrics.width + 16;
        const bh = 24;

        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.5;
        this.roundRect(ctx, x - bw, y, bw, bh, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = stroke;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x - bw / 2, y + bh / 2);
        ctx.restore();
    }

    private renderFooterPerforation(): void {
        const { width, height } = this.canvas;
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
        ctx.fillText('✂ TEAR HERE', 40, y - 6);
        ctx.restore();
    }

    private roundRect(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        w: number,
        h: number,
        r: number
    ): void {
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

    private hashStringToHue(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash % 360);
    }
}
