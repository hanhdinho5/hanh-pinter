import * as THREE from 'three';

export interface BackgroundPreset {
    id: string;
    name: string;
    url?: string;
    isOutdoor: boolean;
    keyLightColor: number;
    ambientColor: number;
    badge: string;
}

export interface VideoPreset {
    id: string;
    name: string;
    url: string;
    badge: string;
}

export const VIDEO_PRESETS: VideoPreset[] = [
    {
        id: 'vd1',
        name: 'Video Cảnh 1 (vd1.mp4)',
        url: '/backgrounds/vd1.mp4',
        badge: '🎬 VIDEO 1 (VD1)',
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
        name: 'Núi Non Mây Mù (Bình Minh)',
        url: '/backgrounds/mountain-mist.jpg',
        isOutdoor: true,
        keyLightColor: 0xffedd5,
        ambientColor: 0xe0f2fe,
        badge: '🌄 NÚI MÂY',
    },
    {
        id: 'sunset-clouds',
        name: 'Hoàng Hôn Rực Rỡ',
        url: '/backgrounds/sunset-clouds.jpg',
        isOutdoor: true,
        keyLightColor: 0xfdba74,
        ambientColor: 0xfecdd3,
        badge: '🌇 HOÀNG HÔN',
    },
    {
        id: 'cozy-lofi',
        name: 'Phòng Lofi Thư Giãn',
        url: '/backgrounds/cozy-lofi.jpg',
        isOutdoor: true,
        keyLightColor: 0xd8b4fe,
        ambientColor: 0x38bdf8,
        badge: '☕ LOFI ĐÊM',
    },
    {
        id: 'cyberpunk',
        name: 'Cyberpunk Neon',
        url: '/backgrounds/cyberpunk.jpg',
        isOutdoor: true,
        keyLightColor: 0x38bdf8,
        ambientColor: 0xf43f5e,
        badge: '⚡ CYBERPUNK',
    },
];

/**
 * Quản lý đổi cảnh nền (Backgrounds), hiệu ứng chuyển cảnh mờ dần (Cross-Fade)
 * và chế độ tự động xoay vòng ảnh nền (Auto-Rotate).
 */
export class BackgroundManager {
    public group: THREE.Group;
    private textureLoader = new THREE.TextureLoader();
    private textureCache = new Map<string, THREE.Texture>();

    // Hai tấm nền chuyển đổi mượt mà (Cross-Fade Quads)
    private quadA: THREE.Mesh;
    private quadB: THREE.Mesh;
    private activeQuadIndex: 0 | 1 = 0;
    private isCrossFading = false;
    private crossFadeProgress = 1.0;
    private crossFadeDuration = 1.2; // giây

    // Trạng thái hiện tại
    private currentPresetId = 'mountain-mist';
    private autoRotate = false;
    private rotateIntervalSeconds = 300; // Mặc định 5 phút
    private autoRotateTimer = 0.0;

    // Chế độ nền: 'video' (ưu tiên phát video AI vd1.mp4) hoặc 'image' (ảnh tĩnh)
    private mode: 'image' | 'video' = 'video';
    private currentVideoId = 'vd1';
    private videoElement: HTMLVideoElement | null = null;
    private autoNextVideo = false;

    private scene: THREE.Scene | null = null;
    private container: HTMLElement | null = null;
    private renderer: THREE.WebGLRenderer | null = null;

    // Tham chiếu tới các đồ vật trong xưởng để ẩn/hiện khi đổi giữa ngoài trời và trong xưởng
    private workshopProps: THREE.Object3D[] = [];

    // Callback khi background tự động đổi
    public onBackgroundChanged?: (presetId: string) => void;

    constructor() {
        this.group = new THREE.Group();
        this.group.name = 'BackgroundManager';

        // Tạo 2 tấm quad nền dự phòng
        const bgGeo = new THREE.PlaneGeometry(10.5, 8.2);

        const matA = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 1.0,
            depthWrite: false,
        });
        this.quadA = new THREE.Mesh(bgGeo, matA);
        this.quadA.position.set(0, 3.6, -2.48);
        this.quadA.visible = false;
        this.group.add(this.quadA);

        const matB = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
        });
        this.quadB = new THREE.Mesh(bgGeo.clone(), matB);
        this.quadB.position.set(0, 3.6, -2.47);
        this.quadB.visible = false;
        this.group.add(this.quadB);
    }

    public setSceneAndContainer(scene: THREE.Scene, container: HTMLElement, renderer?: THREE.WebGLRenderer): void {
        this.scene = scene;
        this.container = container;
        this.renderer = renderer ?? null;
        this.container.style.position = 'relative';
        this.container.style.overflow = 'hidden';

        this.initVideoElement();

        if (this.mode === 'video') {
            this.setMode('video');
        } else {
            this.applyPreset(this.currentPresetId, false);
        }
    }

    private initVideoElement(): void {
        if (!this.container || this.videoElement) return;

        const v = document.createElement('video');
        v.autoplay = true;
        v.loop = true;
        v.muted = true;
        v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.setAttribute('webkit-playsinline', '');
        v.setAttribute('muted', '');
        v.setAttribute('loop', '');
        v.setAttribute('autoplay', '');
        v.style.position = 'absolute';
        v.style.top = '0';
        v.style.left = '0';
        v.style.width = '100%';
        v.style.height = '100%';
        v.style.objectFit = 'cover';
        v.style.pointerEvents = 'none';
        v.style.zIndex = '0';
        v.style.display = this.mode === 'video' ? 'block' : 'none';

        v.addEventListener('ended', () => {
            if (this.autoNextVideo) {
                this.playNextVideo();
            }
        });

        this.videoElement = v;
        this.container.insertBefore(v, this.container.firstChild);

        // Nạp video vd1.mp4 của người dùng
        this.applyVideo(this.currentVideoId);
    }

    public setMode(mode: 'image' | 'video'): void {
        this.mode = mode;
        if (!this.container) return;

        if (mode === 'video') {
            if (this.videoElement) {
                this.videoElement.style.display = 'block';
                this.videoElement.play().catch(() => undefined);
            }
            if (this.scene) {
                this.scene.background = null;
            }
            if (this.renderer) {
                this.renderer.setClearColor(0x000000, 0);
            }
            this.container.style.backgroundImage = 'none';
            this.container.style.backgroundColor = 'transparent';
        } else {
            if (this.videoElement) {
                this.videoElement.style.display = 'none';
                this.videoElement.pause();
            }
            this.applyPreset(this.currentPresetId, false);
        }
    }

    public getMode(): 'image' | 'video' {
        return this.mode;
    }

    public applyVideo(videoId: string): void {
        this.currentVideoId = videoId;
        const preset = VIDEO_PRESETS.find((v) => v.id === videoId);
        const url = preset?.url ?? '/backgrounds/vd1.mp4';

        if (this.videoElement) {
            this.videoElement.src = url;
            this.videoElement.loop = !this.autoNextVideo;
            if (this.mode === 'video') {
                this.videoElement.play().catch(() => undefined);
            }
        }
    }

    public getCurrentVideoId(): string {
        return this.currentVideoId;
    }

    public setAutoNextVideo(enabled: boolean): void {
        this.autoNextVideo = enabled;
        if (this.videoElement) {
            this.videoElement.loop = !enabled;
        }
    }

    public getAutoNextVideo(): boolean {
        return this.autoNextVideo;
    }

    public playNextVideo(): void {
        const idx = VIDEO_PRESETS.findIndex((v) => v.id === this.currentVideoId);
        const nextIdx = (idx + 1) % VIDEO_PRESETS.length;
        this.applyVideo(VIDEO_PRESETS[nextIdx].id);
    }

    public setCustomVideo(fileOrUrl: File | string): void {
        let url: string;
        if (typeof fileOrUrl === 'string') {
            url = fileOrUrl;
        } else {
            url = URL.createObjectURL(fileOrUrl);
        }
        if (this.videoElement) {
            this.videoElement.src = url;
            this.setMode('video');
            this.videoElement.play().catch(() => undefined);
        }
    }

    /**
     * Đăng ký các đồ vật workshop (bàn gỗ, rãnh xẻ, bức tường gỗ, giá kệ, bảng dụng cụ, đèn bàn)
     * để ẩn đi khi ở chế độ phong cảnh ngoài trời.
     */
    public registerWorkshopProps(props: THREE.Object3D[]): void {
        this.workshopProps = props;
        this.updateWorkshopPropsVisibility(this.getCurrentPreset()?.isOutdoor ?? false);
    }

    private updateWorkshopPropsVisibility(isOutdoor: boolean): void {
        // Khi ở chế độ ngoài trời, ẩn toàn bộ đồ gỗ xưởng mộc để lộ toàn cảnh núi non phía sau
        this.workshopProps.forEach((prop) => {
            prop.visible = !isOutdoor;
        });
    }

    /**
     * Tạo texture dự phòng tuyệt đẹp bằng Canvas nếu file ảnh ngoài chưa sẵn sàng
     */
    private createProceduralSky(type: string): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d')!;

        if (type === 'sunset-clouds') {
            const grad = ctx.createLinearGradient(0, 0, 0, 1024);
            grad.addColorStop(0, '#1e1b4b');
            grad.addColorStop(0.3, '#701a75');
            grad.addColorStop(0.55, '#ea580c');
            grad.addColorStop(0.75, '#fb923c');
            grad.addColorStop(1, '#fed7aa');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 1024, 1024);

            // Mặt trời hoàng hôn
            const sunGrad = ctx.createRadialGradient(650, 680, 10, 650, 680, 280);
            sunGrad.addColorStop(0, '#fffbeb');
            sunGrad.addColorStop(0.2, '#fde047');
            sunGrad.addColorStop(0.5, 'rgba(249, 115, 22, 0.4)');
            sunGrad.addColorStop(1, 'rgba(234, 88, 12, 0)');
            ctx.fillStyle = sunGrad;
            ctx.beginPath();
            ctx.arc(650, 680, 280, 0, Math.PI * 2);
            ctx.fill();
        } else if (type === 'cozy-lofi') {
            const grad = ctx.createLinearGradient(0, 0, 0, 1024);
            grad.addColorStop(0, '#0f172a');
            grad.addColorStop(0.5, '#1e1b4b');
            grad.addColorStop(0.8, '#312e81');
            grad.addColorStop(1, '#4338ca');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 1024, 1024);

            // Các ngôi sao lấp lánh
            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < 90; i++) {
                const sx = Math.random() * 1024;
                const sy = Math.random() * 600;
                const sr = Math.random() * 2 + 1;
                ctx.beginPath();
                ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (type === 'cyberpunk') {
            const grad = ctx.createLinearGradient(0, 0, 0, 1024);
            grad.addColorStop(0, '#020617');
            grad.addColorStop(0.5, '#0f172a');
            grad.addColorStop(0.8, '#1e1b4b');
            grad.addColorStop(1, '#083344');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 1024, 1024);

            // Dải lưới laser tím xanh
            ctx.strokeStyle = 'rgba(6, 182, 212, 0.25)';
            ctx.lineWidth = 2;
            for (let lx = 0; lx <= 1024; lx += 80) {
                ctx.beginPath();
                ctx.moveTo(lx, 600);
                ctx.lineTo(lx, 1024);
                ctx.stroke();
            }
        } else {
            // Mountain mist procedural fallback
            const grad = ctx.createLinearGradient(0, 0, 0, 1024);
            grad.addColorStop(0, '#bae6fd');
            grad.addColorStop(0.45, '#e0f2fe');
            grad.addColorStop(0.8, '#cbd5e1');
            grad.addColorStop(1, '#64748b');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 1024, 1024);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    /**
     * Tải texture ảnh nền hoặc dùng procedural canvas
     */
    private loadPresetTexture(preset: BackgroundPreset, onReady: (tex: THREE.Texture) => void): void {
        if (!preset.url) {
            onReady(this.createProceduralSky(preset.id));
            return;
        }

        if (this.textureCache.has(preset.url)) {
            onReady(this.textureCache.get(preset.url)!);
            return;
        }

        this.textureLoader.load(
            preset.url,
            (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                this.textureCache.set(preset.url!, tex);
                onReady(tex);
            },
            undefined,
            () => {
                // Nếu không tải được ảnh file, dùng bộ tạo Canvas procedural
                console.warn(`[BackgroundManager] Không tìm thấy ${preset.url}, dùng Canvas texture procedural`);
                const fallbackTex = this.createProceduralSky(preset.id);
                this.textureCache.set(preset.url!, fallbackTex);
                onReady(fallbackTex);
            }
        );
    }

    /**
     * Chuyển đổi sang một Background Preset
     */
    public applyPreset(presetId: string, animated = true): void {
        const preset = BACKGROUND_PRESETS.find((p) => p.id === presetId) ?? BACKGROUND_PRESETS[0];
        this.currentPresetId = preset.id;
        this.updateWorkshopPropsVisibility(preset.isOutdoor);

        // 1. Cập nhật nền CSS trên container (hiển thị lập tức, không phụ thuộc WebGL)
        if (this.container) {
            if (this.mode === 'video') {
                this.container.style.backgroundImage = 'none';
                this.container.style.backgroundColor = 'transparent';
            } else if (preset.isOutdoor && preset.url) {
                this.container.style.backgroundImage = `url("${preset.url}")`;
                this.container.style.backgroundSize = 'cover';
                this.container.style.backgroundPosition = 'center';
                this.container.style.backgroundRepeat = 'no-repeat';
            } else {
                this.container.style.backgroundImage = 'none';
                this.container.style.backgroundColor = preset.isOutdoor ? '#0a0c10' : '#0e0a07';
            }
        }

        // 2. Cập nhật Three.js scene.background (Chỉ áp dụng khi ở chế độ Image)
        if (this.scene) {
            if (this.mode === 'video') {
                this.scene.background = null;
                if (this.renderer) {
                    this.renderer.setClearColor(0x000000, 0);
                }
            } else if (preset.isOutdoor) {
                this.loadPresetTexture(preset, (newTex) => {
                    if (this.scene && this.currentPresetId === preset.id && this.mode === 'image') {
                        this.scene.background = newTex;
                    }
                });
            } else {
                this.scene.background = null;
            }
        }

        if (!preset.isOutdoor) {
            return;
        }

        this.loadPresetTexture(preset, (newTex) => {
            if (!animated) {
                const currentMat = this.quadA.material as THREE.MeshBasicMaterial;
                currentMat.map = newTex;
                currentMat.opacity = 1.0;
                currentMat.needsUpdate = true;
                (this.quadB.material as THREE.MeshBasicMaterial).opacity = 0.0;
                this.activeQuadIndex = 0;
                this.isCrossFading = false;
                return;
            }

            // Bắt đầu Cross-Fade mượt mà giữa QuadA và QuadB
            const nextQuad = this.activeQuadIndex === 0 ? this.quadB : this.quadA;
            const nextMat = nextQuad.material as THREE.MeshBasicMaterial;
            nextMat.map = newTex;
            nextMat.opacity = 0.0;
            nextMat.needsUpdate = true;

            this.isCrossFading = true;
            this.crossFadeProgress = 0.0;
        });
    }

    /**
     * Nạp ảnh tự chọn của người dùng (Data URL từ file upload)
     */
    public applyCustomImage(dataUrl: string): void {
        const customId = `custom-${Date.now()}`;
        const customPreset: BackgroundPreset = {
            id: customId,
            name: 'Ảnh Bạn Vừa Tải',
            url: dataUrl,
            isOutdoor: true,
            keyLightColor: 0xffedd5,
            ambientColor: 0xe0f2fe,
            badge: '🖼️ TỰ CHỌN',
        };
        BACKGROUND_PRESETS.unshift(customPreset);
        this.applyPreset(customId, true);
        this.onBackgroundChanged?.(customId);
    }

    /**
     * Chuyển sang background tiếp theo trong danh sách
     */
    public nextBackground(): void {
        const currentIdx = BACKGROUND_PRESETS.findIndex((p) => p.id === this.currentPresetId);
        const nextIdx = (currentIdx + 1) % BACKGROUND_PRESETS.length;
        const nextPreset = BACKGROUND_PRESETS[nextIdx];
        this.applyPreset(nextPreset.id, true);
        this.onBackgroundChanged?.(nextPreset.id);
    }

    /**
     * Cập nhật tiến trình Cross-Fade và bộ đếm tự động xoay vòng trong Render Loop
     */
    public update(delta: number): void {
        // 1. Cập nhật hiệu ứng chuyển cảnh Cross-Fade
        if (this.isCrossFading) {
            this.crossFadeProgress += delta / this.crossFadeDuration;
            const t = Math.min(1.0, this.crossFadeProgress);

            const fromQuad = this.activeQuadIndex === 0 ? this.quadA : this.quadB;
            const toQuad = this.activeQuadIndex === 0 ? this.quadB : this.quadA;

            (fromQuad.material as THREE.MeshBasicMaterial).opacity = 1.0 - t;
            (toQuad.material as THREE.MeshBasicMaterial).opacity = t;

            if (this.crossFadeProgress >= 1.0) {
                this.isCrossFading = false;
                this.activeQuadIndex = this.activeQuadIndex === 0 ? 1 : 0;
            }
        }

        // 2. Bộ đếm thời gian tự động đổi cảnh (Auto-Rotate)
        if (this.autoRotate) {
            this.autoRotateTimer += delta;
            if (this.autoRotateTimer >= this.rotateIntervalSeconds) {
                this.autoRotateTimer = 0.0;
                this.nextBackground();
            }
        }
    }

    // =========================================================================
    // CÁC HÀM GET / SET CẤU HÌNH
    // =========================================================================

    public getCurrentPresetId(): string {
        return this.currentPresetId;
    }

    public getCurrentPreset(): BackgroundPreset | undefined {
        return BACKGROUND_PRESETS.find((p) => p.id === this.currentPresetId);
    }

    public setAutoRotate(enabled: boolean, intervalMinutes?: number): void {
        this.autoRotate = enabled;
        if (intervalMinutes && intervalMinutes > 0) {
            this.rotateIntervalSeconds = intervalMinutes * 60;
        }
        if (!enabled) {
            this.autoRotateTimer = 0.0;
        }
    }

    public getAutoRotate(): { enabled: boolean; intervalMinutes: number } {
        return {
            enabled: this.autoRotate,
            intervalMinutes: Math.round(this.rotateIntervalSeconds / 60),
        };
    }

    public dispose(): void {
        this.quadA.geometry.dispose();
        (this.quadA.material as THREE.Material).dispose();
        this.quadB.geometry.dispose();
        (this.quadB.material as THREE.Material).dispose();
        this.textureCache.forEach((tex) => tex.dispose());
        this.textureCache.clear();
    }
}

