export interface BackgroundPreset {
    id: string;
    name: string;
    url: string;
    badge: string;
}

export interface VideoPreset {
    id: string;
    name: string;
    url: string;
    badge: string;
    /**
     * Chỉ phát đoạn [loopStart, loopEnd] (giây) của video. Dùng để bỏ phần cuối clip AI
     * bị hỏng (vd: chim lao thẳng vào camera). Bỏ trống = phát hết video.
     */
    loopStart?: number;
    loopEnd?: number;
    /** Thời gian hoà trộn (giây) giữa cuối đoạn và đầu đoạn để vòng lặp không bị giật. */
    crossfade?: number;
}

export type BackgroundMode = 'image' | 'video';

export const VIDEO_PRESETS: VideoPreset[] = [
    {
        id: 'vd1',
        name: 'Video Cảnh 1 (vd1.mp4)',
        url: '/backgrounds/vd1.mp4',
        badge: '🎬 VIDEO 1',
        // vd1.mp4 (Google Flow, 10s): sau ~6.5s đàn chim lao vào camera -> cắt bỏ
        loopStart: 0,
        loopEnd: 6.2,
        crossfade: 1.6,
    },
    {
        id: 'vd2',
        name: 'Video Cảnh 2 (vd2.mp4)',
        url: '/backgrounds/vd2.mp4',
        badge: '🎬 VIDEO 2',
    },
    {
        id: 'vd3',
        name: 'Video Cảnh 3 (vd3.mp4)',
        url: '/backgrounds/vd3.mp4',
        badge: '🎬 VIDEO 3',
    },
];

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
    {
        id: 'mountain-mist',
        name: 'Thung Lũng Mây (tách từ vd1)',
        url: '/backgrounds/mountain-mist.jpg',
        badge: '🌄 THUNG LŨNG MÂY',
    },
];

let availableVideosPromise: Promise<string[]> | null = null;

/**
 * Kiểm tra file video nào thực sự tồn tại trong /public/backgrounds.
 * (Vite dev server trả index.html với mã 200 cho file không tồn tại, nên phải kiểm tra content-type.)
 */
export function detectAvailableVideos(): Promise<string[]> {
    if (!availableVideosPromise) {
        availableVideosPromise = Promise.all(
            VIDEO_PRESETS.map(async (v) => {
                try {
                    const res = await fetch(v.url, { method: 'HEAD' });
                    const type = res.headers.get('content-type') ?? '';
                    return res.ok && type.startsWith('video/') ? v.id : null;
                } catch {
                    return null;
                }
            })
        ).then((ids) => ids.filter((id): id is string => id !== null));
    }
    return availableVideosPromise;
}

const DEFAULT_CROSSFADE = 1.2;

/**
 * Quản lý lớp nền phía SAU canvas Three.js (canvas trong suốt nằm trên):
 * - Chế độ 'image' (Cảnh sống): ảnh tĩnh, mọi chuyển động (mây, chim, lá, bướm) do Three.js tạo -> chạy vô tận không có điểm cắt.
 * - Chế độ 'video': 2 thẻ <video> chồng nhau, hoà trộn chéo ở điểm lặp để không bị giật cảnh.
 */
export class BackgroundManager {
    private layerRoot: HTMLDivElement | null = null;
    private imageLayers: HTMLDivElement[] = [];
    private activeImageLayer = 0;
    private videos: HTMLVideoElement[] = [];
    private videoBottomFog: HTMLDivElement | null = null;
    private activeVideo = 0;
    private crossfading = false;
    private crossfadeTimer = 0;

    private mode: BackgroundMode = 'image';
    private currentPresetId = BACKGROUND_PRESETS[0].id;
    private currentVideo: VideoPreset = VIDEO_PRESETS[0];
    private objectUrls: string[] = [];

    private autoRotate = false;
    private rotateIntervalSeconds = 300;
    private autoRotateTimer = 0;

    public onBackgroundChanged?: (presetId: string) => void;
    public onModeChanged?: (mode: BackgroundMode) => void;
    /** Báo ảnh nền mới cho lớp "ảnh sống" WebGL (ảnh DOM chỉ là lớp dự phòng khi texture chưa tải xong) */
    public onImageChanged?: (url: string) => void;

    public attach(container: HTMLElement): void {

        const root = document.createElement('div');
        root.dataset.role = 'background-layers';
        Object.assign(root.style, {
            position: 'absolute',
            inset: '0',
            zIndex: '0',
            pointerEvents: 'none',
            overflow: 'hidden',
            backgroundColor: '#9fb8cf',
        });

        for (let i = 0; i < 2; i++) {
            const layer = document.createElement('div');
            Object.assign(layer.style, {
                position: 'absolute',
                inset: '0',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                opacity: '0',
                transition: 'opacity 1.2s ease',
            });
            root.appendChild(layer);
            this.imageLayers.push(layer);
        }

        for (let i = 0; i < 2; i++) {
            const v = document.createElement('video');
            v.muted = true;
            v.playsInline = true;
            v.preload = 'auto';
            v.setAttribute('muted', '');
            v.setAttribute('playsinline', '');
            Object.assign(v.style, {
                position: 'absolute',
                inset: '0',
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: '0',
                display: 'none',
            });
            v.addEventListener('error', () => this.handleVideoError(v));
            v.addEventListener('ended', () => {
                // Dự phòng: nếu vì lý do nào đó chưa kịp hoà trộn thì tua về đầu đoạn
                if (this.videos[this.activeVideo] === v && this.mode === 'video') {
                    v.currentTime = this.currentVideo.loopStart ?? 0;
                    void v.play().catch(() => undefined);
                }
            });
            root.appendChild(v);
            this.videos.push(v);
        }

        // Video AI có sẵn một tờ giấy trắng vẽ ở nửa dưới; tờ giấy 3D che phần lớn,
        // dải sương này che nốt phần mép đáy lộ ra dưới tờ giấy 3D.
        const fog = document.createElement('div');
        Object.assign(fog.style, {
            position: 'absolute',
            left: '0',
            right: '0',
            bottom: '0',
            height: '14%',
            zIndex: '3',
            display: 'none',
            background:
                'linear-gradient(to bottom, rgba(226, 234, 243, 0) 0%, rgba(226, 234, 243, 0.85) 45%, rgba(232, 238, 246, 0.98) 100%)',
        });
        root.appendChild(fog);
        this.videoBottomFog = fog;

        container.insertBefore(root, container.firstChild);
        this.layerRoot = root;

        this.showImage(this.getCurrentPreset().url, false);
        this.loadVideoSources(this.currentVideo.url);
        this.applyModeVisibility();
    }

    // ------------------------------------------------------------------ MODE

    public setMode(mode: BackgroundMode): void {
        if (this.mode === mode) return;
        this.mode = mode;
        this.applyModeVisibility();
        this.onModeChanged?.(mode);
    }

    public getMode(): BackgroundMode {
        return this.mode;
    }

    private applyModeVisibility(): void {
        const isVideo = this.mode === 'video';
        this.imageLayers.forEach((layer, i) => {
            layer.style.display = isVideo ? 'none' : 'block';
            if (!isVideo) layer.style.opacity = i === this.activeImageLayer ? '1' : '0';
        });
        this.videos.forEach((v, i) => {
            v.style.display = isVideo ? 'block' : 'none';
            if (isVideo) {
                v.style.transition = 'none';
                v.style.opacity = i === this.activeVideo ? '1' : '0';
            }
        });
        if (this.videoBottomFog) this.videoBottomFog.style.display = isVideo ? 'block' : 'none';
        const active = this.videos[this.activeVideo];
        if (isVideo && active) {
            void active.play().catch(() => undefined);
        } else {
            this.videos.forEach((v) => v.pause());
            this.crossfading = false;
        }
    }

    // ----------------------------------------------------------------- IMAGE

    private showImage(url: string, animated: boolean): void {
        if (this.imageLayers.length < 2) return;
        const next = animated ? 1 - this.activeImageLayer : this.activeImageLayer;
        const nextLayer = this.imageLayers[next];
        const prevLayer = this.imageLayers[1 - next];

        nextLayer.style.transition = animated ? 'opacity 1.2s ease' : 'none';
        prevLayer.style.transition = animated ? 'opacity 1.2s ease' : 'none';
        nextLayer.style.backgroundImage = `url("${url}")`;
        this.onImageChanged?.(url);

        // Chờ ảnh tải xong rồi mới hoà trộn để không hiện khung trống
        const img = new Image();
        img.onload = img.onerror = () => {
            nextLayer.style.opacity = '1';
            if (animated) prevLayer.style.opacity = '0';
        };
        img.src = url;
        this.activeImageLayer = next;
    }

    public applyPreset(presetId: string, animated = true): void {
        const preset = BACKGROUND_PRESETS.find((p) => p.id === presetId) ?? BACKGROUND_PRESETS[0];
        if (preset.id === this.currentPresetId && this.imageLayers[this.activeImageLayer]?.style.backgroundImage) {
            return;
        }
        this.currentPresetId = preset.id;
        this.showImage(preset.url, animated);
    }

    public applyCustomImage(dataUrl: string): void {
        const customId = `custom-${Date.now()}`;
        BACKGROUND_PRESETS.push({
            id: customId,
            name: 'Ảnh Bạn Vừa Tải',
            url: dataUrl,
            badge: '🖼️ TỰ CHỌN',
        });
        this.applyPreset(customId, true);
        this.onBackgroundChanged?.(customId);
    }

    public nextBackground(): void {
        const idx = BACKGROUND_PRESETS.findIndex((p) => p.id === this.currentPresetId);
        const next = BACKGROUND_PRESETS[(idx + 1) % BACKGROUND_PRESETS.length];
        this.applyPreset(next.id, true);
        this.onBackgroundChanged?.(next.id);
    }

    // ----------------------------------------------------------------- VIDEO

    private loadVideoSources(url: string): void {
        this.crossfading = false;
        this.activeVideo = 0;
        const start = this.currentVideo.loopStart ?? 0;
        this.videos.forEach((v, i) => {
            v.src = url;
            v.load();
            v.style.transition = 'none';
            v.style.opacity = i === 0 ? '1' : '0';
            const seek = () => {
                v.currentTime = start;
            };
            if (v.readyState >= 1) seek();
            else v.addEventListener('loadedmetadata', seek, { once: true });
        });
        if (this.mode === 'video') {
            void this.videos[0]?.play().catch(() => undefined);
        }
    }

    public applyVideo(videoId: string): void {
        // Đang phát đúng video này rồi -> không nạp lại (tránh giật hình mỗi lần đồng bộ cài đặt)
        const preset = VIDEO_PRESETS.find((v) => v.id === videoId) ?? VIDEO_PRESETS[0];
        if (this.currentVideo.id === preset.id) return;
        this.currentVideo = preset;
        this.loadVideoSources(preset.url);
    }

    public getCurrentVideoId(): string {
        return this.currentVideo.id;
    }

    public setCustomVideo(fileOrUrl: File | string): void {
        let url: string;
        if (typeof fileOrUrl === 'string') {
            url = fileOrUrl;
        } else {
            url = URL.createObjectURL(fileOrUrl);
            this.objectUrls.forEach((u) => URL.revokeObjectURL(u));
            this.objectUrls = [url];
        }
        this.currentVideo = { id: 'custom', name: 'Video tự chọn', url, badge: '📁 TỰ CHỌN' };
        this.loadVideoSources(url);
        this.setMode('video');
    }

    private handleVideoError(v: HTMLVideoElement): void {
        if (this.videos[this.activeVideo] !== v) return;
        console.warn(`[BackgroundManager] Không phát được video ${this.currentVideo.url}`);
        if (this.currentVideo.id !== VIDEO_PRESETS[0].id) {
            this.applyVideo(VIDEO_PRESETS[0].id);
        } else {
            // Ngay cả video mặc định cũng lỗi -> quay về Cảnh sống để không bị màn hình đen
            this.setMode('image');
        }
    }

    /** Hoà trộn chéo 2 thẻ video ở điểm lặp -> vòng lặp liền mạch không giật cảnh. */
    private updateVideoLoop(delta: number): void {
        const active = this.videos[this.activeVideo];
        const standby = this.videos[1 - this.activeVideo];
        if (!active || !standby || !active.duration || !isFinite(active.duration)) return;

        const start = this.currentVideo.loopStart ?? 0;
        const end = Math.min(this.currentVideo.loopEnd ?? active.duration, active.duration - 0.05);
        const fade = Math.min(this.currentVideo.crossfade ?? DEFAULT_CROSSFADE, (end - start) / 3);

        if (!this.crossfading && active.currentTime >= end - fade) {
            this.crossfading = true;
            this.crossfadeTimer = 0;
            standby.currentTime = start;
            void standby.play().catch(() => undefined);
            standby.style.transition = 'none';
            standby.style.opacity = '0';
            // Đặt video mới lên trên rồi tăng dần độ hiện
            standby.style.zIndex = '2';
            active.style.zIndex = '1';
        }

        if (this.crossfading) {
            this.crossfadeTimer += delta;
            const t = Math.min(1, this.crossfadeTimer / fade);
            const eased = t * t * (3 - 2 * t);
            standby.style.opacity = eased.toFixed(3);
            if (t >= 1) {
                this.crossfading = false;
                active.pause();
                active.style.opacity = '0';
                active.currentTime = start;
                this.activeVideo = 1 - this.activeVideo;
            }
        }
    }

    // ---------------------------------------------------------------- UPDATE

    public update(delta: number): void {
        if (this.mode === 'video') {
            this.updateVideoLoop(delta);
        }

        if (this.autoRotate && this.mode === 'image' && BACKGROUND_PRESETS.length > 1) {
            this.autoRotateTimer += delta;
            if (this.autoRotateTimer >= this.rotateIntervalSeconds) {
                this.autoRotateTimer = 0;
                this.nextBackground();
            }
        }
    }

    public getCurrentPresetId(): string {
        return this.currentPresetId;
    }

    public getCurrentPreset(): BackgroundPreset {
        return BACKGROUND_PRESETS.find((p) => p.id === this.currentPresetId) ?? BACKGROUND_PRESETS[0];
    }

    public setAutoRotate(enabled: boolean, intervalMinutes?: number): void {
        this.autoRotate = enabled;
        if (intervalMinutes && intervalMinutes > 0) {
            this.rotateIntervalSeconds = intervalMinutes * 60;
        }
        if (!enabled) this.autoRotateTimer = 0;
    }

    public getAutoRotate(): { enabled: boolean; intervalMinutes: number } {
        return { enabled: this.autoRotate, intervalMinutes: Math.round(this.rotateIntervalSeconds / 60) };
    }

    public dispose(): void {
        this.videos.forEach((v) => {
            v.pause();
            v.removeAttribute('src');
            v.load();
        });
        this.objectUrls.forEach((u) => URL.revokeObjectURL(u));
        this.objectUrls = [];
        this.layerRoot?.remove();
        this.layerRoot = null;
        this.videos = [];
        this.imageLayers = [];
        this.videoBottomFog = null;
    }
}
