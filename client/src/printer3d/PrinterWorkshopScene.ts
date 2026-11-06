import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SheetCanvasRenderer } from './sheetRenderer';
import { SparkleParticleSystem } from './particles';
import { createBrushedMetalTexture } from './textures';
import { soundManager } from '../audio/SoundManager';
import { BackgroundManager, type BackgroundMode } from './backgroundManager';
import { ButterflySystem } from './butterflySystem';
import { BirdFlockSystem } from './birdFlockSystem';
import { MistLayerSystem } from './mistLayerSystem';
import { FallingLeavesSystem } from './FallingLeavesSystem';
import { LivingBackground } from './livingBackground';
import { mockPartialSheet } from './mockData';
import type { Sheet, SheetEntry, PrinterStatus } from '../types';

// Khung sắt: ray nằm sát ngoài 2 mép giấy (giấy rộng 2.05 -> mép ±1.025)
const FRAME_RAIL_X = 1.1;
const FRAME_RAIL_Y = 0.06;
const FRAME_Z_START = -0.98;
const FRAME_Z_END = 2.66;

export class PrinterWorkshopScene {
    public container: HTMLElement;
    public renderer: THREE.WebGLRenderer;
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;

    // Component meshes
    public sheetRenderer: SheetCanvasRenderer;
    /** Tờ trắng nằm sẵn bên dưới; khi đổi tờ chỉ kéo tờ trên xuống là lộ ra tờ này */
    private underRenderer: SheetCanvasRenderer;
    private underPaperMesh: THREE.Mesh;
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
    public livingBackground: LivingBackground;

    // Animation & control
    private animationFrameId: number | null = null;
    private timer = new THREE.Timer();
    private metalEnvMap: THREE.Texture | null = null;
    private resizeObserver: ResizeObserver;

    // Lớp sinh vật/khí quyển gắn vào camera (xem backdrop.ts)
    private backdropGroup = new THREE.Group();
    private layerToggles = { butterflies: true, birds: true, leaves: true };

    // Camera 9:16: khung hình chứa trọn tờ giấy (mép trên ~42%, mép dưới ~97% chiều cao)
    private currentTarget = new THREE.Vector3(0, 1.0, 0.8);
    private desiredTarget = new THREE.Vector3(0, 1.0, 0.8);
    private desiredCamPos = new THREE.Vector3(0, 5.0, 5.1);

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
    private printRedrawTimer = 0;
    private gleamProgress = 0.0;
    private onPrintCompleteCallback: (() => void) | null = null;

    // Trạng thái hoạt ảnh đẩy giấy (Sheet Eject Animation State)
    private isEjecting = false;
    private ejectProgress = 0.0;
    private ejectDuration = 1.4; // giây
    private nextSheetData: Sheet | null = null;
    private onEjectCompleteCallback: (() => void) | null = null;
    /** Lệnh đổi tờ đến lúc bút còn đang vẽ: vẽ xong mới kéo tờ đi */
    private pendingEject: { nextSheet: Sheet; onComplete?: () => void } | null = null;
    /**
     * Hàng đợi in: lệnh in mới không bao giờ ghi đè hình đang vẽ dở. Chờ vẽ xong / kéo tờ xong rồi vẽ tiếp,
     * hình nào phải chờ thì vẽ nhanh hơn để bắt kịp nhịp server.
     */
    private printQueue: { special: boolean; entry: SheetEntry; duration: number; onComplete?: () => void; waited: number }[] = [];

    constructor(container: HTMLElement) {
        this.container = container;

        // 1. Scene trong suốt để nhìn xuyên thấu xuống video nền phía dưới
        this.scene = new THREE.Scene();
        this.scene.background = null;

        // 2. Camera chuẩn góc 9:16 (Livecade top-down isometric)
        const aspect = Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight);
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
        // Render dày gấp 2 rồi trình duyệt thu nhỏ (supersampling) -> mép khung, chữ, avatar sắc nét
        // kể cả khi OBS / TikTok LIVE Studio mở trang ở tỉ lệ 1:1. Có thể giảm bằng ?quality=1
        const q = Number(new URLSearchParams(window.location.search).get('quality'));
        this.renderer.setPixelRatio(q > 0 ? Math.min(q, 3) : Math.max(2, Math.min(window.devicePixelRatio, 3)));
        this.renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight), false);
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

        // Môi trường phản chiếu cho khung kim loại (không có thì kim loại trông đen kịt)
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        // Chỉ gắn cho vật liệu khung (gắn vào scene.environment thì giấy bị chói trắng)
        this.metalEnvMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();

        // 5. Lớp nền (ảnh/video DOM phía sau canvas) & sinh vật tự nhiên gắn vào camera
        this.livingBackground = new LivingBackground(this.camera);
        this.backgroundManager = new BackgroundManager();
        this.backgroundManager.onImageChanged = (url) => this.livingBackground.setImage(url);
        this.backgroundManager.onModeChanged = () => this.applyLayerVisibility();
        this.backgroundManager.attach(container);

        this.mistLayerSystem = new MistLayerSystem(this.camera);
        this.birdFlockSystem = new BirdFlockSystem(this.camera);
        this.butterflySystem = new ButterflySystem(this.camera);
        this.fallingLeavesSystem = new FallingLeavesSystem(this.camera);

        this.backdropGroup.name = 'Backdrop';
        this.backdropGroup.add(
            this.livingBackground.mesh,
            this.mistLayerSystem.group,
            this.birdFlockSystem.group,
            this.butterflySystem.group,
            this.fallingLeavesSystem.group
        );
        this.camera.add(this.backdropGroup);
        this.scene.add(this.camera);
        this.applyLayerVisibility();

        // 6. Môi trường (Bàn gỗ, Tường gỗ, Pegboard, Kệ đồ)
        this.setupEnvironment();

        // 7. Tờ giấy in (Sheet Renderer)
        this.sheetRenderer = new SheetCanvasRenderer(1024, 1536);
        this.sheetRenderer.renderSheet(mockPartialSheet);
        this.paperMesh = this.createPaperMesh(this.sheetRenderer);
        this.scene.add(this.paperMesh);
        this.underRenderer = new SheetCanvasRenderer(1024, 1536);
        this.underPaperMesh = this.createPaperMesh(this.underRenderer);
        this.underPaperMesh.position.y = -0.006; // ngay dưới tờ trên, không bị chồng hình
        this.scene.add(this.underPaperMesh);
        this.renderUnderSheet(mockPartialSheet.id + 1);

        // 8. Máy in dạng Plotter CNC mở
        const { gantry, printHead, printHeadLight } = this.createPlotterPrinter();
        this.scene.add(gantry);
        this.printHeadGroup = printHead;
        this.printHeadLight = printHeadLight;
        this.gantryBar = gantry;

        // 9. Hệ thống hạt lấp lánh (Sparkle Particle System)
        this.particles = new SparkleParticleSystem(this.scene);

        // 11. Resize listener
        this.onWindowResize = this.onWindowResize.bind(this);
        this.resizeObserver = new ResizeObserver(() => this.onWindowResize());
        this.resizeObserver.observe(container);

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

        // ---- KHUNG SẮT ĐEN quanh tờ giấy (cố định). Cây bút tự di chuyển, không có thanh ngang ----
        const frameMat = this.createFrameMaterial();
        const trimMat = new THREE.MeshStandardMaterial({
            color: 0xaeb6c2,
            metalness: 0.7,
            roughness: 0.25,
            envMap: this.metalEnvMap,
            envMapIntensity: 0.6,
        });

        this.scene.add(this.createFixedFrame(frameMat, trimMat));

        return {
            gantry: gantryGroup,
            printHead: penGroup,
            printHeadLight,
        };
    }

    private createFrameMaterial(): THREE.MeshStandardMaterial {
        const metal = createBrushedMetalTexture(512, 512, '#16191e');
        metal.map.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({
            color: 0x4a515c,
            map: metal.map,
            roughnessMap: metal.roughnessMap,
            roughness: 0.42,
            metalness: 0.55,
            envMap: this.metalEnvMap,
            envMapIntensity: 0.6,
        });
    }

    /** Phần khung cố định: 2 ray dọc hai mép giấy, hộp nạp giấy phía trên, chân đỡ 4 góc. */
    private createFixedFrame(frameMat: THREE.Material, trimMat: THREE.Material): THREE.Group {
        const frame = new THREE.Group();
        frame.name = 'PrinterFrame';
        const railLen = FRAME_Z_END - FRAME_Z_START;
        const railMidZ = (FRAME_Z_START + FRAME_Z_END) / 2;

        for (const side of [-1, 1]) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.04, railLen), frameMat);
            rail.position.set(side * FRAME_RAIL_X, FRAME_RAIL_Y - 0.025, railMidZ);
            rail.castShadow = true;
            rail.receiveShadow = true;
            frame.add(rail);

            // Thanh dẫn hướng sáng bóng trên mặt ray
            const guide = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, railLen, 12), trimMat);
            guide.rotation.x = Math.PI / 2;
            guide.position.set(side * FRAME_RAIL_X, FRAME_RAIL_Y + 0.01, railMidZ);
            frame.add(guide);

            for (const z of [FRAME_Z_START, FRAME_Z_END]) {
                const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.09), frameMat);
                foot.position.set(side * FRAME_RAIL_X, FRAME_RAIL_Y - 0.03, z);
                foot.castShadow = true;
                frame.add(foot);
                const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 12), trimMat);
                bolt.position.set(side * FRAME_RAIL_X, FRAME_RAIL_Y + 0.026, z);
                frame.add(bolt);
            }
        }

        // Hộp nạp giấy phía trên (giấy chui ra từ khe này)
        const housingW = FRAME_RAIL_X * 2 + 0.12;
        const housing = new THREE.Mesh(new THREE.BoxGeometry(housingW, 0.09, 0.12), frameMat);
        housing.position.set(0, 0.15, FRAME_Z_START);
        housing.castShadow = true;
        frame.add(housing);
        const slot = new THREE.Mesh(new THREE.BoxGeometry(housingW - 0.3, 0.012, 0.004), new THREE.MeshBasicMaterial({ color: 0x050608 }));
        slot.position.set(0, 0.125, FRAME_Z_START + 0.062);
        frame.add(slot);
        const housingTrim = new THREE.Mesh(new THREE.BoxGeometry(housingW - 0.02, 0.008, 0.004), trimMat);
        housingTrim.position.set(0, 0.185, FRAME_Z_START + 0.062);
        frame.add(housingTrim);

        return frame;
    }

    private renderUnderSheet(id: number): void {
        this.underRenderer.renderSheet({ id, kind: 'standard', capacity: 4, entries: [], completed: false });
    }

    private createPaperMesh(renderer: SheetCanvasRenderer): THREE.Mesh {
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

        // Giấy tự phát sáng một phần theo chính texture -> trắng sáng, chữ/ảnh rõ, không bị xám đục vì tone mapping
        const mat = new THREE.MeshStandardMaterial({
            map: renderer.texture,
            emissive: 0xffffff,
            emissiveMap: renderer.texture,
            emissiveIntensity: 0.55,
            color: 0xb8b8b8,
            roughness: 0.92,
            metalness: 0,
            side: THREE.DoubleSide,
            toneMapped: false,
        });

        const paperMesh = new THREE.Mesh(geo, mat);
        paperMesh.position.set(0, 0, 0.85);
        paperMesh.receiveShadow = true;

        return paperMesh;
    }

    public updateSheet(sheet: Sheet): void {
        // Đang kéo tờ cũ đi: dữ liệu tờ mới hiện ngay lên tờ bên dưới
        if (this.isEjecting || this.pendingEject) {
            if (this.currentSheet && sheet.id === this.currentSheet.id) {
                // cập nhật cuối của tờ cũ: chỉ lưu khi chưa bắt đầu kéo
                if (!this.isEjecting) this.currentSheet = this.withActiveEntry(sheet);
                return;
            }
            this.nextSheetData = sheet;
            this.underRenderer.renderSheet(this.visible(sheet));
            return;
        }
        const idChanged = !this.currentSheet || this.currentSheet.id !== sheet.id;
        this.currentSheet = this.withActiveEntry(sheet);
        if (idChanged) this.renderUnderSheet(sheet.id + 1);
        if (!this.isPrintingActive) {
            this.sheetRenderer.renderSheet(this.visible(this.currentSheet));
        }
    }

    /**
     * Server có thể gửi bản cập nhật tờ giấy chưa có avatar vừa in xong (hoặc đến trễ).
     * Giữ lại avatar đã in trên cùng tờ để hình trước không bao giờ bị mất khi đang vẽ hình sau.
     */
    private withActiveEntry(sheet: Sheet): Sheet {
        const prev = this.currentSheet;
        if (!prev || prev.id !== sheet.id || prev.kind !== sheet.kind) return sheet;
        const missing = prev.entries.filter((e) => !sheet.entries.some((n) => n.slot === e.slot));
        if (missing.length === 0) return sheet;
        return { ...sheet, entries: [...sheet.entries, ...missing].sort((a, b) => a.slot - b.slot) };
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
            this.desiredCamPos.set(0, 5.0, 5.1);
            this.desiredTarget.set(0, 1.0, 0.8);
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
        this.printQueue.push({ special: false, entry, duration: durationSeconds, onComplete, waited: 0 });
        this.advance();
    }

    private beginPrintSlot(entry: SheetEntry, durationSeconds: number, onComplete?: () => void): void {
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
        soundManager.startPrintSound(entry.frame !== 'normal');

        // Cài đặt màu đèn đầu in phù hợp với khung
        if (entry.frame !== 'normal') {
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
        this.printQueue.push({ special: true, entry, duration: durationSeconds, onComplete, waited: 0 });
        this.advance();
    }

    private beginPrintSpecial(entry: SheetEntry, durationSeconds: number, onComplete?: () => void): void {
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
     * Điều phối duy nhất: rảnh tay thì quyết định việc tiếp theo.
     * - Còn hình thuộc TỜ HIỆN TẠI chưa vẽ -> vẽ nốt trước, rồi mới kéo tờ đi.
     * - Có lệnh kéo tờ -> kéo tờ; các hình của tờ mới chờ kéo xong mới vẽ.
     */
    private advance(): void {
        if (this.isPrintingActive || this.isEjecting) return;
        const next = this.printQueue[0];
        if (this.pendingEject) {
            const forCurrentSheet = next?.entry.sheetId != null && next.entry.sheetId === this.currentSheet?.id;
            if (!forCurrentSheet) {
                const ej = this.pendingEject;
                this.pendingEject = null;
                this.beginEject(ej.nextSheet, ej.onComplete);
                return;
            }
        }
        if (!next) return;
        this.printQueue.shift();
        // Hình phải chờ lâu thì vẽ nhanh hơn để bắt kịp nhịp server
        const duration = Math.max(0.8, next.duration - next.waited);
        if (next.special) this.beginPrintSpecial(next.entry, duration, next.onComplete);
        else this.beginPrintSlot(next.entry, duration, next.onComplete);
    }

    /** Ẩn các avatar server đã báo nhưng chưa tới lượt bút vẽ (tránh hiện sẵn rồi bị vẽ lại) */
    private visible(sheet: Sheet): Sheet {
        if (this.printQueue.length === 0) return sheet;
        const waiting = new Set(this.printQueue.map((q) => q.entry.jobId));
        return { ...sheet, entries: sheet.entries.filter((e) => !waiting.has(e.jobId)) };
    }

    /**
     * Kích hoạt hoạt ảnh cuộn tờ giấy cũ ra ngoài và nạp tờ mới vào
     */
    public startEjectSheetAnimation(nextSheet: Sheet, onComplete?: () => void): void {
        this.pendingEject = { nextSheet, onComplete };
        this.advance();
    }

    private beginEject(nextSheet: Sheet, onComplete?: () => void): void {
        this.isEjecting = true;
        this.ejectProgress = 0.0;
        // Tờ mới thật từ server có thể đã đến trước (lúc chờ bút vẽ xong) -> ưu tiên dùng
        this.nextSheetData = this.nextSheetData ?? nextSheet;
        this.onEjectCompleteCallback = onComplete ?? null;
        this.underRenderer.renderSheet(this.visible(this.nextSheetData));

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
        if (this.activeEntry.frame !== 'normal' && this.printProgress > 0.8) {
            this.gleamProgress = (this.printProgress - 0.8) / 0.2;
        }

        // Vẽ lại canvas texture với tiến trình cắt dòng (tối đa 30 lần/giây: mỗi lần phải tải cả tờ lên GPU)
        this.printRedrawTimer += delta;
        if (this.printRedrawTimer >= 1 / 30 || this.printProgress >= 1) {
            this.printRedrawTimer = 0;
            this.sheetRenderer.renderSheetProgress(
                this.visible(this.currentSheet),
                this.activeSlot,
                this.printProgress,
                this.activeEntry,
                this.gleamProgress
            );
        }

        const isSpecial = this.currentSheet.kind === 'special';
        const isWide = Boolean(this.activeEntry.isWide || this.activeEntry.frame !== 'normal');
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
            } else if (this.activeEntry.frame === 'vip') {
                // VIP: chuông + pháo hoa ánh kim lớn ngay tại avatar
                soundManager.playGoldChime();
                this.particles.burstGrandCelebration(this.getSlotWorldPosition(this.activeSlot, true));
            } else if (this.activeEntry.frame === 'gold' || isWide) {
                soundManager.playGoldChime();
                const burstPos = this.getSlotWorldPosition(this.activeSlot, isWide);
                this.particles.burstGoldSparkles(burstPos, 65);
            }

            // Ghi avatar vừa in vào tờ hiện tại để các lần vẽ lại sau vẫn còn nó
            const done: SheetEntry = { ...this.activeEntry, isWide: this.activeEntry.isWide ?? this.activeEntry.frame !== 'normal' };
            if (this.currentSheet.kind !== 'special' && !this.currentSheet.entries.some((e) => e.slot === done.slot)) {
                this.currentSheet = {
                    ...this.currentSheet,
                    entries: [...this.currentSheet.entries, done].sort((a, b) => a.slot - b.slot),
                };
            }
            this.sheetRenderer.renderSheet(this.visible(this.currentSheet));

            // Gọi callback hoàn tất
            const cb = this.onPrintCompleteCallback;
            this.onPrintCompleteCallback = null;
            this.activeSlot = null;
            this.activeEntry = null;
            cb?.();

            this.advance();
        }
    }

    /**
     * Đổi tờ: tờ trên cùng bị kéo trượt xuống dưới khỏi khung hình, lộ ra tờ trắng nằm sẵn bên dưới.
     */
    private updateEjectAnimation(delta: number): void {
        if (!this.isEjecting) return;

        this.ejectProgress = Math.min(1, this.ejectProgress + delta / this.ejectDuration);
        const t = this.ejectProgress;
        // Giật nhẹ lúc đầu rồi tăng tốc như bị kéo tay
        const pull = t * t * (2.2 - 1.2 * t);
        this.paperMesh.position.z = 0.85 + pull * 4.6;
        this.paperMesh.position.y = 0.004 + Math.sin(t * Math.PI) * 0.03;

        if (t >= 1) {
            const next = this.nextSheetData;
            if (next) {
                this.currentSheet = next;
                // Tờ trên nhận nội dung tờ dưới rồi về chỗ cũ (giống hệt nên không thấy chuyển cảnh)
                this.sheetRenderer.renderSheet(this.visible(next));
                this.renderUnderSheet(next.id + 1);
            }
            this.nextSheetData = null;
            this.isEjecting = false;
            this.paperMesh.position.set(0, 0, 0.85);

            const cb = this.onEjectCompleteCallback;
            this.onEjectCompleteCallback = null;
            cb?.();

            this.advance();
        }
    }

    /**
     * Vòng lặp Render Three.js chính
     */
    private startRenderLoop(): void {
        const animate = () => {
            this.animationFrameId = requestAnimationFrame(animate);

            this.timer.update();
            // Giới hạn delta: khi tab/OBS bị ẩn rồi hiện lại không bị "nhảy cóc" hoạt ảnh
            const delta = Math.min(this.timer.getDelta(), 0.1);
            const time = this.timer.getElapsed();

            for (const q of this.printQueue) q.waited += delta;

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
            this.livingBackground.update(delta, time);
            this.mistLayerSystem.update(delta, time);
            this.birdFlockSystem.update(delta, time);
            this.butterflySystem.update(delta, time);
            this.fallingLeavesSystem.update(delta, time);

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

    public setBackgroundMode(mode: BackgroundMode): void {
        this.backgroundManager.setMode(mode);
    }

    public setBackgroundVideo(videoId: string): void {
        this.backgroundManager.applyVideo(videoId);
    }

    public applyCustomVideo(fileOrUrl: File | string): void {
        this.backgroundManager.setCustomVideo(fileOrUrl);
    }

    public getBackgroundMode(): BackgroundMode {
        return this.backgroundManager.getMode();
    }

    public applyCustomBackground(dataUrl: string): void {
        this.backgroundManager.applyCustomImage(dataUrl);
    }

    public setAutoRotate(enabled: boolean, intervalMinutes?: number): void {
        this.backgroundManager.setAutoRotate(enabled, intervalMinutes);
    }

    public setCreaturesVisible(butterflies: boolean, birds: boolean, leaves?: boolean): void {
        this.layerToggles.butterflies = butterflies;
        this.layerToggles.birds = birds;
        if (leaves !== undefined) this.layerToggles.leaves = leaves;
        this.applyLayerVisibility();
    }

    /**
     * Video AI đã có sẵn chim/lá/bướm/mây riêng -> chỉ bật các lớp 3D ở chế độ Cảnh sống (ảnh tĩnh),
     * tránh cảnh chim 3D bay chồng lên chim trong video.
     */
    private applyLayerVisibility(): void {
        const live = this.backgroundManager.getMode() === 'image';
        this.livingBackground.setEnabled(live);
        this.mistLayerSystem.setVisible(live);
        this.butterflySystem.setVisible(live && this.layerToggles.butterflies);
        this.birdFlockSystem.setVisible(live && this.layerToggles.birds);
        this.fallingLeavesSystem.setVisible(live && this.layerToggles.leaves);
    }

    public triggerBirdFlock(): void {
        this.birdFlockSystem.triggerFlockFlight();
    }

    public onWindowResize(): void {
        if (!this.container) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        if (width === 0 || height === 0) return;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height, false);
    }

    public dispose(): void {
        soundManager.stopPrintSound();
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
        }
        this.resizeObserver.disconnect();

        this.backgroundManager.dispose();
        this.butterflySystem.dispose();
        this.birdFlockSystem.dispose();
        this.mistLayerSystem.dispose();
        this.livingBackground.dispose();
        this.fallingLeavesSystem.dispose();
        this.particles.dispose();
        this.sheetRenderer.texture.dispose();
        this.paperMesh.geometry.dispose();
        (this.paperMesh.material as THREE.Material).dispose();
        this.underRenderer.texture.dispose();
        this.underPaperMesh.geometry.dispose();
        (this.underPaperMesh.material as THREE.Material).dispose();
        this.timer.dispose();
        this.metalEnvMap?.dispose();
        this.renderer.dispose();
        if (this.renderer.domElement.parentElement) {
            this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
        }
    }
}

// Khi phát triển: code scene (hoặc chim, lá, giấy...) thay đổi thì tải lại trang,
// vì scene đang chạy là bản tạo từ lúc mở trang và sẽ không tự cập nhật logic mới.
if (import.meta.hot) {
    import.meta.hot.accept(() => window.location.reload());
}
