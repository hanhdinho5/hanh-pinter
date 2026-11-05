import * as THREE from 'three';
import {
    createWoodTexture,
    createBrushedMetalTexture,
} from './textures';
import {
    createWallPegboardAndTools,
    createWorkshopShelf,
    createVintageDeskLamp,
    createActionBadgesBar,
} from './workshopProps';
import { SheetCanvasRenderer } from './sheetRenderer';
import { SparkleParticleSystem } from './particles';
import { soundManager } from '../audio/SoundManager';
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

        // 1. Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0e0a07);

        // 2. Camera chuẩn góc 9:16 (Livecade top-down isometric)
        const aspect = container.clientWidth / container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(46, aspect, 0.1, 50);
        this.camera.position.copy(this.desiredCamPos);
        this.camera.lookAt(this.desiredTarget);

        // 3. WebGL Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance',
        });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.25;
        container.appendChild(this.renderer.domElement);

        // 4. Ánh sáng ấm cúng & Đèn bàn xưởng
        this.setupLighting();

        // 5. Môi trường (Bàn gỗ, Tường gỗ, Pegboard, Kệ đồ)
        this.setupEnvironment();

        // 6. Tờ giấy in (Sheet Renderer)
        this.sheetRenderer = new SheetCanvasRenderer(1024, 1536);
        this.paperMesh = this.createPaperMesh();
        this.scene.add(this.paperMesh);

        // 7. Máy in dạng Plotter CNC mở
        const { gantry, printHead, printHeadLight } = this.createPlotterPrinter();
        this.scene.add(gantry);
        this.printHeadGroup = printHead;
        this.printHeadLight = printHeadLight;
        this.gantryBar = gantry;

        // 8. Hệ thống hạt lấp lánh (Sparkle Particle System)
        this.particles = new SparkleParticleSystem(this.scene);

        // 9. Dải huy hiệu hành động nổi
        const actionBadges = createActionBadgesBar();
        this.scene.add(actionBadges);

        // 10. Resize listener
        this.onWindowResize = this.onWindowResize.bind(this);
        window.addEventListener('resize', this.onWindowResize);

        // 11. Render Loop
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
        const tableTex = createWoodTexture(1024, 1024, false);
        tableTex.map.repeat.set(1.5, 3);
        tableTex.roughnessMap.repeat.set(1.5, 3);

        const tableGeo = new THREE.BoxGeometry(8, 0.4, 8);
        const tableMat = new THREE.MeshStandardMaterial({
            map: tableTex.map,
            roughnessMap: tableTex.roughnessMap,
            roughness: 0.5,
            metalness: 0.05,
        });
        const table = new THREE.Mesh(tableGeo, tableMat);
        table.position.set(0, -0.2, 0.8);
        table.receiveShadow = true;
        this.scene.add(table);

        const grooveMat = new THREE.MeshBasicMaterial({ color: 0x140b05 });
        for (let gz = -2.5; gz <= 4.0; gz += 0.85) {
            const grooveGeo = new THREE.BoxGeometry(8.02, 0.005, 0.015);
            const groove = new THREE.Mesh(grooveGeo, grooveMat);
            groove.position.set(0, 0.003, gz);
            this.scene.add(groove);
        }

        const wallTex = createWoodTexture(1024, 1024, true);
        wallTex.map.repeat.set(2, 1);
        const wallGeo = new THREE.PlaneGeometry(10, 8);
        const wallMat = new THREE.MeshStandardMaterial({
            map: wallTex.map,
            roughness: 0.85,
            metalness: 0.02,
        });
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(0, 3.6, -2.5);
        wall.receiveShadow = true;
        this.scene.add(wall);

        const pegboard = createWallPegboardAndTools();
        this.scene.add(pegboard);

        const shelf = createWorkshopShelf();
        this.scene.add(shelf);

        const { lampGroup } = createVintageDeskLamp();
        this.scene.add(lampGroup);
    }

    private createPlotterPrinter() {
        const railLength = 4.2;
        const railGeo = new THREE.CylinderGeometry(0.022, 0.022, railLength, 16);
        const railMat = new THREE.MeshStandardMaterial({
            color: 0xd8e0e8,
            metalness: 0.95,
            roughness: 0.15,
        });

        const leftRail = new THREE.Mesh(railGeo, railMat);
        leftRail.rotation.x = Math.PI / 2;
        leftRail.position.set(-1.16, 0.18, 0.9);
        leftRail.castShadow = true;
        this.scene.add(leftRail);

        const rightRail = new THREE.Mesh(railGeo, railMat);
        rightRail.rotation.x = Math.PI / 2;
        rightRail.position.set(1.16, 0.18, 0.9);
        rightRail.castShadow = true;
        this.scene.add(rightRail);

        const mountGeo = new THREE.BoxGeometry(0.08, 0.14, 0.08);
        const mountMat = new THREE.MeshStandardMaterial({ color: 0x1f242c, metalness: 0.85 });
        for (const rx of [-1.16, 1.16]) {
            for (const rz of [-1.15, 2.95]) {
                const mount = new THREE.Mesh(mountGeo, mountMat);
                mount.position.set(rx, 0.07, rz);
                this.scene.add(mount);
            }
        }

        const gantryGroup = new THREE.Group();
        gantryGroup.position.set(0, 0.28, -0.65);

        const metalTex = createBrushedMetalTexture(512, 512, '#181b20');
        const darkChassisMat = new THREE.MeshStandardMaterial({
            color: 0x22262d,
            map: metalTex.map,
            roughnessMap: metalTex.roughnessMap,
            roughness: 0.35,
            metalness: 0.9,
        });

        const barGeo = new THREE.BoxGeometry(2.46, 0.14, 0.18);
        const barMesh = new THREE.Mesh(barGeo, darkChassisMat);
        barMesh.castShadow = true;
        gantryGroup.add(barMesh);

        const bearingGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.22, 16);
        const bearingMat = new THREE.MeshStandardMaterial({
            color: 0x3b424d,
            metalness: 0.9,
            roughness: 0.2,
        });

        const leftBearing = new THREE.Mesh(bearingGeo, bearingMat);
        leftBearing.rotation.x = Math.PI / 2;
        leftBearing.position.set(-1.16, 0, 0);
        gantryGroup.add(leftBearing);

        const rightBearing = new THREE.Mesh(bearingGeo, bearingMat);
        rightBearing.rotation.x = Math.PI / 2;
        rightBearing.position.set(1.16, 0, 0);
        gantryGroup.add(rightBearing);

        const capGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16);
        const silverMat = new THREE.MeshStandardMaterial({ color: 0xccd6e0, metalness: 0.9 });
        for (const bx of [-1.24, 1.24]) {
            const cap = new THREE.Mesh(capGeo, silverMat);
            cap.rotation.z = Math.PI / 2;
            cap.position.set(bx, 0, 0);
            gantryGroup.add(cap);
        }

        const feederGeo = new THREE.BoxGeometry(2.15, 0.06, 0.2);
        const feeder = new THREE.Mesh(feederGeo, darkChassisMat);
        feeder.position.set(0, 0.04, -0.16);
        gantryGroup.add(feeder);

        const printHead = new THREE.Group();
        printHead.position.set(0, 0.02, 0.08);

        const headGeo = new THREE.BoxGeometry(0.24, 0.18, 0.2);
        const headMesh = new THREE.Mesh(headGeo, darkChassisMat);
        headMesh.castShadow = true;
        printHead.add(headMesh);

        const finMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8 });
        for (let f = -0.05; f <= 0.05; f += 0.03) {
            const finGeo = new THREE.BoxGeometry(0.25, 0.01, 0.18);
            const fin = new THREE.Mesh(finGeo, finMat);
            fin.position.y = f;
            printHead.add(fin);
        }

        const headLedGeo = new THREE.SphereGeometry(0.02, 12, 12);
        const headLedMat = new THREE.MeshBasicMaterial({ color: 0xfff4e0 });
        const headLed = new THREE.Mesh(headLedGeo, headLedMat);
        headLed.position.set(0, -0.09, 0.02);
        printHead.add(headLed);

        const printHeadLight = new THREE.SpotLight(0xfff6e6, 3.5, 2.5, Math.PI / 6, 0.8, 1.5);
        printHeadLight.position.set(0, -0.08, 0.02);
        printHeadLight.target.position.set(0, -0.28, 0.02);
        printHead.add(printHeadLight);
        printHead.add(printHeadLight.target);

        gantryGroup.add(printHead);

        return {
            gantry: gantryGroup,
            printHead,
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
     * Tính toạ độ 3D của ô slot trên mặt bàn để bùng nổ hạt ánh kim
     */
    private getSlotWorldPosition(slotIdx: number): THREE.Vector3 {
        const col = slotIdx % 2;
        const row = Math.floor(slotIdx / 2);

        const x = col === 0 ? -0.488 : 0.488;
        const rowCentersZ = [-0.054, 0.939, 1.931];
        const z = rowCentersZ[Math.min(row, 2)];
        const y = 0.04;

        return new THREE.Vector3(x, y, z);
    }

    /**
     * Tính toán toạ độ mục tiêu chuẩn xác cho Thanh in (Gantry Z) và Đầu in (Printhead X)
     * tương ứng đúng vị trí hình ảnh và tiến độ quét dòng trên tờ giấy.
     */
    private getSlotPrintheadTargets(
        slotIdx: number,
        progress: number,
        isSpecial: boolean
    ): { gantryZ: number; centerX: number; halfWidth: number } {
        const paperLen = 3.4;
        const paperZ0 = -0.85; // Mép trên của giấy bắt đầu tại Z = -0.85
        const headZOffset = 0.08; // Nozzle lệch so với tâm thanh dầm

        if (isSpecial) {
            const yStart = 160;
            const yEnd = 1456;
            const y = yStart + progress * (yEnd - yStart);
            const paperZ = paperZ0 + (y / 1536) * paperLen;
            return {
                gantryZ: paperZ - headZOffset,
                centerX: 0,
                halfWidth: 0.78,
            };
        }

        const row = Math.floor(slotIdx / 2);
        const col = slotIdx % 2;

        const rowYStarts = [150, 598.67, 1047.33];
        const rowHeight = 418.67;

        const yStart = rowYStarts[Math.min(row, 2)];
        const yEnd = yStart + rowHeight;
        const y = yStart + progress * (yEnd - yStart);
        const paperZ = paperZ0 + (y / 1536) * paperLen;

        const centerX = col === 0 ? -0.488 : 0.488;
        return {
            gantryZ: paperZ - headZOffset,
            centerX,
            halfWidth: 0.38,
        };
    }

    /**
     * Cập nhật tiến trình in từng dòng và vị trí đầu in trong Render Loop
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
        const targets = this.getSlotPrintheadTargets(this.activeSlot, this.printProgress, isSpecial);

        // 1. Chuyển động thanh dầm (Gantry) di chuyển dọc thanh ray trục Z tới đúng hàng đang in
        // và bám sát từng dòng vẽ từ trên xuống dưới
        this.gantryBar.position.z = THREE.MathUtils.lerp(
            this.gantryBar.position.z,
            targets.gantryZ,
            Math.min(1.0, delta * 14)
        );

        // 2. Chuyển động đầu in (Printhead) quét ngang trục X qua lại đúng khung ô avatar như cây bút đang vẽ
        const scanOscillation = Math.sin(time * 26) * targets.halfWidth;
        this.printHeadGroup.position.x = targets.centerX + scanOscillation;

        // Khi in hoàn thành 100%
        if (this.printProgress >= 1.0) {
            this.isPrintingActive = false;
            this.setPrinterStatus('idle');

            // Tắt tiếng máy in
            soundManager.stopPrintSound();

            // Phát tiếng chuông vàng và bùng nổ hạt lấp lánh nếu là khung vàng hoặc trang đặc biệt
            if (isSpecial) {
                soundManager.playGoldChime();
                this.particles.burstGrandCelebration(new THREE.Vector3(0, 0.05, 0.8));
            } else if (this.activeEntry.frame === 'gold') {
                soundManager.playGoldChime();
                const burstPos = this.getSlotWorldPosition(this.activeSlot);
                this.particles.burstGoldSparkles(burstPos, 50);
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
                // Khi nghỉ, đầu in nhẹ nhàng lướt về tâm máy và thanh dầm lùi về vị trí chờ (Home)
                this.printHeadGroup.position.x = THREE.MathUtils.lerp(
                    this.printHeadGroup.position.x,
                    0,
                    delta * 4
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

            // 3. Cập nhật hạt ánh kim / pháo hoa
            this.particles.update(delta);

            // 4. Camera di chuyển mềm mại
            this.camera.position.lerp(this.desiredCamPos, delta * 3.5);
            this.currentTarget.lerp(this.desiredTarget, delta * 3.5);
            this.camera.lookAt(this.currentTarget);

            this.renderer.render(this.scene, this.camera);
        };

        animate();
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

        this.particles.dispose();
        this.renderer.dispose();
        if (this.renderer.domElement.parentElement) {
            this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
        }
    }
}
