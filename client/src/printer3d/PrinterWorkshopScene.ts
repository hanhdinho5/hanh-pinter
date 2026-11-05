import * as THREE from 'three';
import { createActionBadgesBar } from './workshopProps';
import { SheetCanvasRenderer } from './sheetRenderer';
import { SparkleParticleSystem } from './particles';
import { soundManager } from '../audio/SoundManager';
import { BackgroundManager } from './backgroundManager';
import { ButterflySystem } from './butterflySystem';
import { BirdFlockSystem } from './birdFlockSystem';
import { MistLayerSystem } from './mistLayerSystem';
import { FallingLeavesSystem } from './FallingLeavesSystem';
import { mockPartialSheet } from './mockData';
import type { Sheet, SheetEntry, PrinterStatus } from '../types';

export class PrinterWorkshopScene {
    public container: HTMLElement;
    public renderer: THREE.WebGLRenderer;
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;

    // Component meshes
    public sheetRenderer: SheetCanvasRenderer;
    public paperMesh: THREE.Mesh;
    public printHeadGroup: THREE.Group;
    public printHeadLight: THREE.SpotLight;
    public gantryBar: THREE.Group;
    public particles: SparkleParticleSystem;

    // Background & Sinh vật bay tự nhiên
    public backgroundManager: BackgroundManager;
    public butterflySystem: ButterflySystem;
    public birdFlockSystem: BirdFlockSystem;
    public mistLayerSystem: MistLayerSystem;
    public fallingLeavesSystem: FallingLeavesSystem;

    // Animation & control
    private animationFrameId: number | null = null;
    private clock = new THREE.Clock();

    // Camera view targets (Chuẩn Livecade 9:16)
    private currentTarget = new THREE.Vector3(0, 1.0, 0.3);
    private desiredTarget = new THREE.Vector3(0, 1.0, 0.3);
    private desiredCamPos = new THREE.Vector3(0, 4.3, 3.7);

    // Trạng thái máy in
    private printerStatus: PrinterStatus = 'idle';
    private currentSheet: Sheet | null = null;

    // Trạng thái hoạt ảnh in (Animation State)
    private isPrintingActive = false;
    private activeSlot: number | null = null;
    private activeEntry: SheetEntry | null = null;
    private printProgress = 0.0;
    private printDuration = 2.5; // giây
    private printElapsedTime = 0.0;
    private gleamProgress = 0.0;
    private onPrintCompleteCallback: (() => void) | null = null;

    // Trạng thái hoạt ảnh đẩy giấy (Sheet Eject Animation State)
    private isEjecting = false;
    private ejectProgress = 0.0;
    private ejectDuration = 1.4; // giây
    private nextSheetData: Sheet | null = null;
    private onEjectCompleteCallback: (() => void) | null = null;

    constructor(container: HTMLElement) {
        this.container = container;

        // 1. Scene trong suốt để nhìn xuyên thấu xuống video nền phía dưới
        this.scene = new THREE.Scene();
        this.scene.background = null;

        // 2. Camera chuẩn góc 9:16 (Livecade top-down isometric)
        const aspect = container.clientWidth / container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(46, aspect, 0.1, 50);
        this.camera.position.copy(this.desiredCamPos);
        this.camera.lookAt(this.desiredTarget);

        // 3. WebGL Renderer trong suốt (alpha: true) đặt ở lớp zIndex: 10 phía trên video nền
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance',
            alpha: true,
        });
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.25;

        // ĐẶT CANVAS Ở LỚP TRÊN CÙNG (z-index: 10), video nền ở lớp dưới (z-index: 0)
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.renderer.domElement.style.zIndex = '10';
        this.renderer.domElement.style.pointerEvents = 'none';

        container.appendChild(this.renderer.domElement);

        // 4. Ánh sáng ấm cúng & Đèn bàn xưởng
        this.setupLighting();

        // 5. Khởi tạo Background & Sinh vật tự nhiên
        this.backgroundManager = new BackgroundManager();
        this.backgroundManager.setSceneAndContainer(this.scene, container, this.renderer);
        this.mistLayerSystem = new MistLayerSystem();
        this.birdFlockSystem = new BirdFlockSystem();
        this.butterflySystem = new ButterflySystem();
        this.fallingLeavesSystem = new FallingLeavesSystem();

        this.scene.add(this.backgroundManager.group);
        this.scene.add(this.mistLayerSystem.group);
        this.scene.add(this.birdFlockSystem.group);
        this.scene.add(this.butterflySystem.group);
        this.scene.add(this.fallingLeavesSystem.group);

        // 6. Môi trường (Bàn gỗ, Tường gỗ, Pegboard, Kệ đồ)
        this.setupEnvironment();

        // 7. Tờ giấy in (Sheet Renderer)
        this.sheetRenderer = new SheetCanvasRenderer(1024, 1536);
        this.sheetRenderer.renderSheet(mockPartialSheet);
        this.paperMesh = this.createPaperMesh();
        this.scene.add(this.paperMesh);

        // 8. Máy in dạng Plotter CNC mở
        const { gantry, printHead, printHeadLight } = this.createPlotterPrinter();
        this.scene.add(gantry);
        this.printHeadGroup = printHead;
        this.printHeadLight = printHeadLight;
        this.gantryBar = gantry;

        // 9. Hệ thống hạt lấp lánh (Sparkle Particle System)
        this.particles = new SparkleParticleSystem(this.scene);

        // 10. Dải huy hiệu hành động nổi
        const actionBadges = createActionBadgesBar();
        this.scene.add(actionBadges);

        // 11. Resize listener
        this.onWindowResize = this.onWindowResize.bind(this);
        window.addEventListener('resize', this.onWindowResize);

        // 12. Render Loop
        this.startRenderLoop();
    }

    private setupLighting(): void {
        const ambient = new THREE.AmbientLight(0xffeedd, 1.1);
        this.scene.add(ambient);

        const overheadKey = new THREE.DirectionalLight(0xffdfba, 1.8);
        overheadKey.position.set(2.0, 6.0, 2.5);
        overheadKey.castShadow = true;
        overheadKey.shadow.mapSize.width = 2048;
        overheadKey.shadow.mapSize.height = 2048;
        overheadKey.shadow.bias = -0.0004;
        this.scene.add(overheadKey);

        const rimFill = new THREE.DirectionalLight(0x7890b0, 0.5);
        rimFill.position.set(4.0, 3.0, 1.0);
        this.scene.add(rimFill);
    }

    private setupEnvironment(): void {
        // Đã loại bỏ hoàn toàn các đồ gỗ xưởng mộc (bàn gỗ, tường gỗ, kệ đồ)
        // để mở rộng toàn cảnh thiên nhiên / wallpaper phía sau máy in
    }

    private createPlotterPrinter() {
        // CÂY BÚT VẼ (PEN / STYLUS) TINH TẾ THAY THẾ CHO THANH IN CỒNG KỀNH
        // Thiết kế thanh thoát, không che khuất tờ giấy và phong cảnh thiên nhiên phía sau
        const penGroup = new THREE.Group();
        penGroup.position.set(0, 0.08, 0);

        // Góc nghiêng tự nhiên của cây bút (~20 độ) như đang cầm nắn nót viết vẽ trên trang giấy
        const penAngleGroup = new THREE.Group();
        penAngleGroup.rotation.z = -0.24;
        penAngleGroup.rotation.x = -0.14;
        penGroup.add(penAngleGroup);

        // Vật liệu thân bút: đen bóng sơn mài piano (Midnight Obsidian Lacquer)
        const penBodyMat = new THREE.MeshStandardMaterial({
            color: 0x11161d,
            metalness: 0.88,
            roughness: 0.16,
        });

        // Vật liệu mạ vàng hoàng gia bóng bẩy (Polished Gold Accents)
        const goldAccentMat = new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            metalness: 0.96,
            roughness: 0.12,
        });

        // Vật liệu chrome sáng bóng của ngòi bút
        const chromeMat = new THREE.MeshStandardMaterial({
            color: 0xe2e8f0,
            metalness: 0.98,
            roughness: 0.06,
        });

        // 1. Thân bút chính (Pen Barrel)
        const barrelGeo = new THREE.CylinderGeometry(0.024, 0.028, 0.44, 24);
        const barrel = new THREE.Mesh(barrelGeo, penBodyMat);
        barrel.position.y = 0.32;
        barrel.castShadow = true;
        penAngleGroup.add(barrel);

        // 2. Các vành nhẫn vàng trang trí trên thân bút (Gold Accent Bands)
        const ringGeo1 = new THREE.CylinderGeometry(0.029, 0.029, 0.014, 24);
        const ring1 = new THREE.Mesh(ringGeo1, goldAccentMat);
        ring1.position.y = 0.22;
        penAngleGroup.add(ring1);

        const ringGeo2 = new THREE.CylinderGeometry(0.029, 0.029, 0.008, 24);
        const ring2 = new THREE.Mesh(ringGeo2, goldAccentMat);
        ring2.position.y = 0.46;
        penAngleGroup.add(ring2);

        // 3. Đuôi nắp bút mạ vàng (Cap Finial)
        const capGeo = new THREE.CylinderGeometry(0.024, 0.027, 0.06, 24);
        const cap = new THREE.Mesh(capGeo, goldAccentMat);
        cap.position.y = 0.55;
        penAngleGroup.add(cap);

        // 4. Kẹp cài áo mạ vàng (Pen Clip)
        const clipGeo = new THREE.BoxGeometry(0.008, 0.18, 0.014);
        const clip = new THREE.Mesh(clipGeo, goldAccentMat);
        clip.position.set(0.028, 0.42, 0);
        penAngleGroup.add(clip);

        // 5. Khâu cầm bút tiện công thái học (Grip Section)
        const gripGeo = new THREE.CylinderGeometry(0.018, 0.024, 0.12, 24);
        const gripMat = new THREE.MeshStandardMaterial({ color: 0x1e242c, roughness: 0.4, metalness: 0.8 });
        const grip = new THREE.Mesh(gripGeo, gripMat);
        grip.position.y = 0.16;
        penAngleGroup.add(grip);

        // 6. Đầu côn vuốt nhọn (Cone Tip)
        const coneGeo = new THREE.ConeGeometry(0.018, 0.06, 24);
        coneGeo.rotateX(Math.PI);
        const cone = new THREE.Mesh(coneGeo, goldAccentMat);
        cone.position.y = 0.07;
        penAngleGroup.add(cone);

        // 7. Ngòi bút siêu mảnh (Fine Nib) chạm thẳng mặt giấy
        const nibGeo = new THREE.ConeGeometry(0.006, 0.035, 16);
        nibGeo.rotateX(Math.PI);
        const nib = new THREE.Mesh(nibGeo, chromeMat);
        nib.position.y = 0.022;
        penAngleGroup.add(nib);

        // 8. Đốm sáng tinh tế tại ngòi bút (Nib Glow Point)
        const nibLedGeo = new THREE.SphereGeometry(0.006, 12, 12);
        const nibLedMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb });
        const nibLed = new THREE.Mesh(nibLedGeo, nibLedMat);
        nibLed.position.y = 0.006;
        penAngleGroup.add(nibLed);

        // Đèn chiếu sáng nhẹ nhàng tập trung tại điểm vẽ của ngòi bút
        const printHeadLight = new THREE.SpotLight(0xfff6e6, 2.5, 1.4, Math.PI / 6, 0.8, 1.2);
        printHeadLight.position.set(0, 0.14, 0);
        printHeadLight.target.position.set(0, 0, 0);
        penGroup.add(printHeadLight);
        penGroup.add(printHeadLight.target);

        // Cây bút được gán vào Gantry điều khiển Z dọc tờ giấy
        const gantryGroup = new THREE.Group();
        gantryGroup.position.set(0, 0, -0.65);
        gantryGroup.add(penGroup);

        return {
            gantry: gantryGroup,
            printHead: penGroup,
            printHeadLight,
        };
    }

    private createPaperMesh(): THREE.Mesh {
        const paperWidth = 2.05;
        const paperLength = 3.4;

        const geo = new THREE.PlaneGeometry(paperWidth, paperLength, 16, 32);
        geo.rotateX(-Math.PI / 2);

        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const z = pos.getZ(i);
            if (z < -0.3) {
                const factor = (-0.3 - z) / 1.4;
                pos.setY(i, 0.015 + factor * 0.12);
            } else {
                pos.setY(i, 0.015);
            }
        }
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            map: this.sheetRenderer.texture,
            roughness: 0.88,
            metalness: 0.02,
            side: THREE.DoubleSide,
        });

        const paperMesh = new THREE.Mesh(geo, mat);
        paperMesh.position.set(0, 0, 0.85);
        paperMesh.receiveShadow = true;

        return paperMesh;
    }

    public updateSheet(sheet: Sheet): void {
        this.currentSheet = sheet;
        if (!this.isPrintingActive) {
            this.sheetRenderer.renderSheet(sheet);
        }
    }

    public getPrinterStatus(): PrinterStatus {
        return this.printerStatus;
    }

    public setPrinterStatus(status: PrinterStatus, _currentSlot?: number): void {
        this.printerStatus = status;

        if (status === 'printing') {
            this.printHeadLight.intensity = 5.0;
            this.printHeadLight.color.setHex(0xfff8e7);
        } else if (status === 'paused') {
            this.printHeadLight.intensity = 1.0;
            this.printHeadLight.color.setHex(0xf59e0b);
        } else {
            this.printHeadLight.intensity = 2.5;
            this.printHeadLight.color.setHex(0xffeedd);
        }
    }

    public setCameraPreset(preset: 'stream' | 'closeup' | 'overview'): void {
        if (preset === 'stream') {
            this.desiredCamPos.set(0, 4.3, 3.7);
            this.desiredTarget.set(0, 1.0, 0.3);
        } else if (preset === 'closeup') {
            this.desiredCamPos.set(0, 2.8, 2.5);
            this.desiredTarget.set(0, 0.3, 0.9);
        } else if (preset === 'overview') {
            this.desiredCamPos.set(1.4, 4.5, 4.2);
            this.desiredTarget.set(0, 0.8, 0.4);
        }
    }

    // =========================================================================
    // HOẠT ẢNH GIAI ĐOẠN 3 (ANIMATIONS & EFFECTS)
    // =========================================================================

    /**
     * Kích hoạt hoạt ảnh in quét từng dòng một avatar vào ô slot
     */
    public startPrintSlotAnimation(
        entry: SheetEntry,
        durationSeconds = 2.4,
        onComplete?: () => void
    ): void {
        this.isPrintingActive = true;
        this.activeSlot = entry.slot;
        this.activeEntry = entry;
        this.printProgress = 0.0;
        this.printElapsedTime = 0.0;
        this.printDuration = durationSeconds;
        this.gleamProgress = 0.0;
        this.onPrintCompleteCallback = onComplete ?? null;

        this.setPrinterStatus('printing');

        // Bật âm thanh máy in (âm motor bước + kim nhiệt)
        soundManager.startPrintSound(entry.frame === 'gold');

        // Cài đặt màu đèn đầu in phù hợp với khung
        if (entry.frame === 'gold') {
            this.printHeadLight.color.setHex(0xfbbf24);
            this.printHeadLight.intensity = 6.0;
        } else {
            this.printHeadLight.color.setHex(0xffffff);
            this.printHeadLight.intensity = 4.5;
        }
    }

    /**
     * Kích hoạt hoạt ảnh in Trang đặc biệt Full Page
     */
    public startPrintSpecialAnimation(
        entry: SheetEntry,
        durationSeconds = 3.5,
        onComplete?: () => void
    ): void {
        this.isPrintingActive = true;
        this.activeSlot = 0;
        this.activeEntry = entry;
        this.printProgress = 0.0;
        this.printElapsedTime = 0.0;
        this.printDuration = durationSeconds;
        this.gleamProgress = 0.0;
        this.onPrintCompleteCallback = onComplete ?? null;

        this.setPrinterStatus('printing');
        soundManager.startPrintSound(true);

        this.printHeadLight.color.setHex(0xf59e0b);
        this.printHeadLight.intensity = 7.0;
    }

    /**
     * Kích hoạt hoạt ảnh cuộn tờ giấy cũ ra ngoài và nạp tờ mới vào
     */
    public startEjectSheetAnimation(nextSheet: Sheet, onComplete?: () => void): void {
        this.isEjecting = true;
        this.ejectProgress = 0.0;
        this.nextSheetData = nextSheet;
        this.onEjectCompleteCallback = onComplete ?? null;

        // Âm thanh cuộn giấy xoẹt qua
        soundManager.playPaperRoll();
    }

    /**
     * Tính toạ độ 3D của ô slot trên mặt giấy để bùng nổ hạt ánh kim
     */
    private getSlotWorldPosition(slotIdx: number, isWide = false): THREE.Vector3 {
        const row = slotIdx < 2 ? 0 : 1;
        const col = slotIdx % 2;

        const x = isWide ? 0 : (col === 0 ? -0.48 : 0.48);
        const paperZ0 = -0.85;
        const paperLen = 3.4;
        // Tâm hàng 0: Y = 160 + 630/2 = 475; Tâm hàng 1: Y = 830 + 630/2 = 1145
        const rowCentersZ = [
            paperZ0 + (475 / 1536) * paperLen,
            paperZ0 + (1145 / 1536) * paperLen,
        ];
        const z = rowCentersZ[Math.min(row, 1)];
        const y = 0.04;

        return new THREE.Vector3(x, y, z);
    }

    /**
     * Tính toán toạ độ mục tiêu chuẩn xác cho Cây Bút (Z & X)
     * tương ứng đúng vị trí hình ảnh và tiến độ quét dòng trên khổ 4 avatar.
     */
    private getSlotPrintheadTargets(
        slotIdx: number,
        progress: number,
        isSpecial: boolean,
        isWide = false
    ): { gantryZ: number; centerX: number; halfWidth: number } {
        const paperLen = 3.4;
        const paperZ0 = -0.85; // Mép trên của giấy bắt đầu tại Z = -0.85

        if (isSpecial) {
            const yStart = 160;
            const yEnd = 1456;
            const y = yStart + progress * (yEnd - yStart);
            const paperZ = paperZ0 + (y / 1536) * paperLen;
            return {
                gantryZ: paperZ,
                centerX: 0,
                halfWidth: 0.78,
            };
        }

        const row = slotIdx < 2 ? 0 : 1;
        const col = slotIdx % 2;

        // Bố cục 2 hàng: Hàng 0 bắt đầu Y = 160; Hàng 1 bắt đầu Y = 830; mỗi hàng cao 630px
        const rowYStarts = [160, 830];
        const rowHeight = 630;

        const yStart = rowYStarts[Math.min(row, 1)];
        const y = yStart + progress * rowHeight;
        const paperZ = paperZ0 + (y / 1536) * paperLen;

        if (isWide) {
            return {
                gantryZ: paperZ,
                centerX: 0,
                halfWidth: 0.72,
            };
        }

        const centerX = col === 0 ? -0.48 : 0.48;
        return {
            gantryZ: paperZ,
            centerX,
            halfWidth: 0.36,
        };
    }

    /**
     * Cập nhật tiến trình nét vẽ từng dòng và vị trí cây bút trong Render Loop
     */
    private updatePrintAnimation(delta: number, time: number): void {
        if (!this.isPrintingActive || this.activeSlot === null || !this.activeEntry || !this.currentSheet) {
            return;
        }

        this.printElapsedTime += delta;
        this.printProgress = Math.min(1.0, this.printElapsedTime / this.printDuration);

        // Hiệu ứng quét ánh kim viền vàng khi tiến độ > 0.8
        if (this.activeEntry.frame === 'gold' && this.printProgress > 0.8) {
            this.gleamProgress = (this.printProgress - 0.8) / 0.2;
        }

        // Vẽ lại canvas texture với tiến trình cắt dòng
        this.sheetRenderer.renderSheetProgress(
            this.currentSheet,
            this.activeSlot,
            this.printProgress,
            this.activeEntry,
            this.gleamProgress
        );

        const isSpecial = this.currentSheet.kind === 'special';
        const isWide = Boolean(this.activeEntry.isWide || this.activeEntry.frame === 'gold');
        const targets = this.getSlotPrintheadTargets(this.activeSlot, this.printProgress, isSpecial, isWide);

        // 1. Chuyển động cây bút dọc theo trục Z bám sát scanline từ trên xuống dưới
        this.gantryBar.position.z = THREE.MathUtils.lerp(
            this.gantryBar.position.z,
            targets.gantryZ,
            Math.min(1.0, delta * 14)
        );

        // 2. Chuyển động ngòi bút quét ngang trục X qua lại đúng khung avatar như đang vẽ
        const scanOscillation = Math.sin(time * 26) * targets.halfWidth;
        this.printHeadGroup.position.x = targets.centerX + scanOscillation;

        // 3. Khi vẽ, ngòi bút hạ xuống mặt giấy (Y = 0.02) và hơi rung nhẹ tự nhiên
        const sketchingJitter = Math.sin(time * 36) * 0.002;
        this.printHeadGroup.position.y = 0.02 + sketchingJitter;

        // Khi in hoàn thành 100%
        if (this.printProgress >= 1.0) {
            this.isPrintingActive = false;
            this.setPrinterStatus('idle');

            // Tắt tiếng bút vẽ
            soundManager.stopPrintSound();

            // Phát tiếng chuông vàng và bùng nổ hạt lấp lánh nếu là khung vàng hoặc trang đặc biệt
            if (isSpecial) {
                soundManager.playGoldChime();
                this.particles.burstGrandCelebration(new THREE.Vector3(0, 0.05, 0.8));
            } else if (this.activeEntry.frame === 'gold' || isWide) {
                soundManager.playGoldChime();
                const burstPos = this.getSlotWorldPosition(this.activeSlot, isWide);
                this.particles.burstGoldSparkles(burstPos, 65);
            }

            // Gọi callback hoàn tất
            const cb = this.onPrintCompleteCallback;
            this.onPrintCompleteCallback = null;
            this.activeSlot = null;
            this.activeEntry = null;
            cb?.();
        }
    }

    /**
     * Cập nhật tiến trình đẩy giấy ra và nạp giấy mới trong Render Loop
     */
    private updateEjectAnimation(delta: number): void {
        if (!this.isEjecting) return;

        this.ejectProgress += delta / this.ejectDuration;

        // Nửa đầu (0.0 -> 0.5): Tờ giấy cũ trượt vút về phía trước rơi khỏi bàn
        if (this.ejectProgress < 0.5) {
            const t = this.ejectProgress * 2; // 0 -> 1
            // Trượt từ 0.85 -> 4.5
            this.paperMesh.position.z = 0.85 + Math.pow(t, 2) * 3.65;
            // Rơi nghiêng xuống mép bàn
            this.paperMesh.position.y = -Math.pow(t, 2) * 0.9;
        }
        // Giữa chặng (0.5): Đổi dữ liệu sang tờ mới và đặt ở vị trí sau khe dầm
        else if (this.ejectProgress >= 0.5 && this.nextSheetData) {
            this.currentSheet = this.nextSheetData;
            this.sheetRenderer.renderSheet(this.nextSheetData);
            this.nextSheetData = null; // Chỉ đổi 1 lần

            this.paperMesh.position.z = -1.2;
            this.paperMesh.position.y = 0.015;
        }
        // Nửa sau (0.5 -> 1.0): Tờ mới chui từ khe máy in trượt vào vị trí chuẩn
        else {
            const t = (this.ejectProgress - 0.5) * 2; // 0 -> 1
            // Trượt từ -1.2 -> 0.85
            const easeOut = 1 - Math.pow(1 - t, 3);
            this.paperMesh.position.z = -1.2 + easeOut * 2.05;
            this.paperMesh.position.y = 0.015;
        }

        // Hoàn tất cuộn giấy
        if (this.ejectProgress >= 1.0) {
            this.isEjecting = false;
            this.paperMesh.position.set(0, 0, 0.85);

            const cb = this.onEjectCompleteCallback;
            this.onEjectCompleteCallback = null;
            cb?.();
        }
    }

    /**
     * Vòng lặp Render Three.js chính
     */
    private startRenderLoop(): void {
        const animate = () => {
            this.animationFrameId = requestAnimationFrame(animate);

            const delta = this.clock.getDelta();
            const time = this.clock.getElapsedTime();

            // 1. Cập nhật hoạt ảnh in avatar
            if (this.isPrintingActive) {
                this.updatePrintAnimation(delta, time);
            } else if (!this.isEjecting) {
                // Khi nghỉ, cây bút nhấc nhẹ lên khỏi mặt giấy và lùi về vị trí chờ (Home)
                this.printHeadGroup.position.x = THREE.MathUtils.lerp(
                    this.printHeadGroup.position.x,
                    0,
                    delta * 4
                );
                this.printHeadGroup.position.y = THREE.MathUtils.lerp(
                    this.printHeadGroup.position.y,
                    0.08,
                    delta * 6
                );
                this.gantryBar.position.z = THREE.MathUtils.lerp(
                    this.gantryBar.position.z,
                    -0.65,
                    delta * 3.5
                );
            }

            // 2. Cập nhật hoạt ảnh đẩy giấy
            if (this.isEjecting) {
                this.updateEjectAnimation(delta);
            }

            // 3. Cập nhật nền, mây mù, đàn chim, đàn bướm và lá rơi
            this.backgroundManager.update(delta);
            this.mistLayerSystem.update(delta);
            this.birdFlockSystem.update(delta, time);
            this.butterflySystem.update(delta, time);
            this.fallingLeavesSystem.update(delta);

            // 4. Cập nhật hạt ánh kim / pháo hoa
            this.particles.update(delta);

            // 5. Camera di chuyển mềm mại
            this.camera.position.lerp(this.desiredCamPos, delta * 3.5);
            this.currentTarget.lerp(this.desiredTarget, delta * 3.5);
            this.camera.lookAt(this.currentTarget);

            this.renderer.render(this.scene, this.camera);
        };

        animate();
    }

    public setBackground(presetId: string): void {
        this.backgroundManager.applyPreset(presetId, true);
    }

    public setBackgroundMode(mode: 'image' | 'video'): void {
        this.backgroundManager.setMode(mode);
    }

    public setBackgroundVideo(videoId: string): void {
        this.backgroundManager.applyVideo(videoId);
    }

    public applyCustomVideo(fileOrUrl: File | string): void {
        this.backgroundManager.setCustomVideo(fileOrUrl);
    }

    public getBackgroundMode(): 'image' | 'video' {
        return this.backgroundManager.getMode();
    }

    public applyCustomBackground(dataUrl: string): void {
        this.backgroundManager.applyCustomImage(dataUrl);
    }

    public setAutoRotate(enabled: boolean, intervalMinutes?: number): void {
        this.backgroundManager.setAutoRotate(enabled, intervalMinutes);
    }

    public setCreaturesVisible(butterflies: boolean, birds: boolean, leaves?: boolean): void {
        this.butterflySystem.setVisible(butterflies);
        this.birdFlockSystem.setVisible(birds);
        if (leaves !== undefined) {
            this.fallingLeavesSystem.setVisible(leaves);
        }
    }

    public triggerBirdFlock(): void {
        this.birdFlockSystem.triggerFlockFlight();
    }

    public onWindowResize(): void {
        if (!this.container) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }

    public dispose(): void {
        soundManager.stopPrintSound();
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
        }
        window.removeEventListener('resize', this.onWindowResize);

        this.backgroundManager.dispose();
        this.butterflySystem.dispose();
        this.birdFlockSystem.dispose();
        this.mistLayerSystem.dispose();
        this.fallingLeavesSystem.dispose();
        this.particles.dispose();
        this.renderer.dispose();
        if (this.renderer.domElement.parentElement) {
            this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
        }
    }
}
