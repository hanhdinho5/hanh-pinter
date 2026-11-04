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
import type { Sheet, PrinterStatus } from '../types';

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

    // Animation & control
    private animationFrameId: number | null = null;
    private clock = new THREE.Clock();

    // Camera view targets (Chuẩn Livecade 9:16)
    private currentTarget = new THREE.Vector3(0, 1.0, 0.3);
    private desiredTarget = new THREE.Vector3(0, 1.0, 0.3);
    private desiredCamPos = new THREE.Vector3(0, 4.3, 3.7);

    // Trạng thái máy in
    private printerStatus: PrinterStatus = 'idle';

    constructor(container: HTMLElement) {
        this.container = container;

        // 1. Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0e0a07); // Không gian xưởng mờ tối ấm cúng

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
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

        // 7. Máy in dạng Plotter CNC mở (Open-frame Gantry & Rails phong cách Livecade)
        const { gantry, printHead, printHeadLight } = this.createPlotterPrinter();
        this.scene.add(gantry);
        this.printHeadGroup = printHead;
        this.printHeadLight = printHeadLight;
        this.gantryBar = gantry;

        // 8. Thanh huy hiệu hành động nổi [PRINT] [GOLD FRAME] [FULL PAGE] [LEGENDARY]
        const actionBadges = createActionBadgesBar();
        this.scene.add(actionBadges);

        // 9. Resize listener
        this.onWindowResize = this.onWindowResize.bind(this);
        window.addEventListener('resize', this.onWindowResize);

        // 10. Render Loop
        this.startRenderLoop();
    }

    /**
     * Cài đặt ánh sáng xưởng thủ công ấm cúng: Đèn bàn cổ điển + ánh sáng môi trường dịu
     */
    private setupLighting(): void {
        // Ánh sáng nền ấm tối
        const ambient = new THREE.AmbientLight(0xffeedd, 1.1);
        this.scene.add(ambient);

        // Đèn chiếu mờ từ trên cao
        const overheadKey = new THREE.DirectionalLight(0xffdfba, 1.8);
        overheadKey.position.set(2.0, 6.0, 2.5);
        overheadKey.castShadow = true;
        overheadKey.shadow.mapSize.width = 2048;
        overheadKey.shadow.mapSize.height = 2048;
        overheadKey.shadow.bias = -0.0004;
        this.scene.add(overheadKey);

        // Ánh sáng bù viền xanh dịu từ bên phải
        const rimFill = new THREE.DirectionalLight(0x7890b0, 0.5);
        rimFill.position.set(4.0, 3.0, 1.0);
        this.scene.add(rimFill);
    }

    /**
     * Dựng môi trường xưởng giống Livecade PFP Printer:
     * - Mặt bàn gỗ với các đường rãnh ván gỗ nằm ngang
     * - Tường gỗ sẫm màu
     * - Bảng pegboard treo kìm, búa, cờ lê
     * - Kệ gỗ 2 tầng chứa lọ thủy tinh linh kiện & hộp đựng
     * - Đèn bàn cổ điển uốn cong tỏa ánh sáng vàng rực
     */
    private setupEnvironment(): void {
        // 1. Mặt bàn gỗ ván (Table Desk)
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

        // Các khe rãnh ván gỗ trên mặt bàn tạo chiều sâu
        const grooveMat = new THREE.MeshBasicMaterial({ color: 0x140b05 });
        for (let gz = -2.5; gz <= 4.0; gz += 0.85) {
            const grooveGeo = new THREE.BoxGeometry(8.02, 0.005, 0.015);
            const groove = new THREE.Mesh(grooveGeo, grooveMat);
            groove.position.set(0, 0.003, gz);
            this.scene.add(groove);
        }

        // 2. Tường gỗ phía sau (Backdrop Wall)
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

        // 3. Pegboard treo dụng cụ (kìm, búa, cờ lê)
        const pegboard = createWallPegboardAndTools();
        this.scene.add(pegboard);

        // 4. Kệ gỗ 2 tầng bên phải (lọ thủy tinh & hộp đựng)
        const shelf = createWorkshopShelf();
        this.scene.add(shelf);

        // 5. Đèn bàn cổ điển (Vintage Desk Lamp) bên góc trái
        const { lampGroup } = createVintageDeskLamp();
        this.scene.add(lampGroup);
    }

    /**
     * Dựng máy in dạng Plotter CNC mở (Open-frame Gantry & Rails phong cách Livecade)
     */
    private createPlotterPrinter() {
        // 1. Hai thanh ray trượt kim loại hai bên mép giấy (Side Guide Rails)
        const railLength = 3.6;
        const railGeo = new THREE.CylinderGeometry(0.022, 0.022, railLength, 16);
        const railMat = new THREE.MeshStandardMaterial({
            color: 0xd8e0e8,
            metalness: 0.95,
            roughness: 0.15,
        });

        // Ray trái
        const leftRail = new THREE.Mesh(railGeo, railMat);
        leftRail.rotation.x = Math.PI / 2;
        leftRail.position.set(-1.16, 0.18, 0.8);
        leftRail.castShadow = true;
        this.scene.add(leftRail);

        // Ray phải
        const rightRail = new THREE.Mesh(railGeo, railMat);
        rightRail.rotation.x = Math.PI / 2;
        rightRail.position.set(1.16, 0.18, 0.8);
        rightRail.castShadow = true;
        this.scene.add(rightRail);

        // Chân đế gắn thanh ray xuống mặt bàn (4 góc ray)
        const mountGeo = new THREE.BoxGeometry(0.08, 0.14, 0.08);
        const mountMat = new THREE.MeshStandardMaterial({ color: 0x1f242c, metalness: 0.85 });
        for (const rx of [-1.16, 1.16]) {
            for (const rz of [-0.95, 2.55]) {
                const mount = new THREE.Mesh(mountGeo, mountMat);
                mount.position.set(rx, 0.07, rz);
                this.scene.add(mount);
            }
        }

        // 2. Thanh dầm ngang chính của máy in (Gantry Crossbar)
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

        // Khối dầm ngang kim loại đen
        const barGeo = new THREE.BoxGeometry(2.46, 0.14, 0.18);
        const barMesh = new THREE.Mesh(barGeo, darkChassisMat);
        barMesh.castShadow = true;
        gantryGroup.add(barMesh);

        // Cục bạc đạn trượt hình trụ ở 2 đầu thanh dầm
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

        // Nắp che kim loại bạc viền đầu thanh dầm
        const capGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16);
        const silverMat = new THREE.MeshStandardMaterial({ color: 0xccd6e0, metalness: 0.9 });
        for (const bx of [-1.24, 1.24]) {
            const cap = new THREE.Mesh(capGeo, silverMat);
            cap.rotation.z = Math.PI / 2;
            cap.position.set(bx, 0, 0);
            gantryGroup.add(cap);
        }

        // Khe cấp giấy phía sau dầm ngang (Feed Slot)
        const feederGeo = new THREE.BoxGeometry(2.15, 0.06, 0.2);
        const feeder = new THREE.Mesh(feederGeo, darkChassisMat);
        feeder.position.set(0, 0.04, -0.16);
        gantryGroup.add(feeder);

        // 3. Đầu in hình hộp vuông trượt trên thanh dầm (Print Head Carriage)
        const printHead = new THREE.Group();
        printHead.position.set(0, 0.02, 0.08);

        // Thân đầu in màu đen nhám
        const headGeo = new THREE.BoxGeometry(0.24, 0.18, 0.2);
        const headMesh = new THREE.Mesh(headGeo, darkChassisMat);
        headMesh.castShadow = true;
        printHead.add(headMesh);

        // Rãnh tản nhiệt trên đầu in
        const finMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8 });
        for (let f = -0.05; f <= 0.05; f += 0.03) {
            const finGeo = new THREE.BoxGeometry(0.25, 0.01, 0.18);
            const fin = new THREE.Mesh(finGeo, finMat);
            fin.position.y = f;
            printHead.add(fin);
        }

        // Đèn LED chiếu điểm ngay dưới đầu in (Spotlight soi thẳng vào điểm đang in)
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

    /**
     * Tạo Mesh tờ giấy in trải dài từ thanh dầm máy in chảy thẳng về phía người xem
     */
    private createPaperMesh(): THREE.Mesh {
        const paperWidth = 2.05;
        const paperLength = 3.4;

        // PlaneGeometry trải trên mặt phẳng XZ (nằm trên bàn gỗ)
        const geo = new THREE.PlaneGeometry(paperWidth, paperLength, 16, 32);

        // Xoay nằm ngang trên bàn
        geo.rotateX(-Math.PI / 2);

        // Uốn cong nhẹ đoạn đầu giấy chui ra từ dưới thanh dầm
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const z = pos.getZ(i);
            // Đoạn chui ra từ thanh gantry (z âm) nhấc lên một chút
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
        paperMesh.position.set(0, 0, 0.85); // Đặt tâm giấy trượt dài trên mặt bàn
        paperMesh.receiveShadow = true;

        return paperMesh;
    }

    /**
     * Cập nhật dữ liệu tờ giấy (Sheet) và vẽ lại CanvasTexture
     */
    public updateSheet(sheet: Sheet): void {
        this.sheetRenderer.renderSheet(sheet);
    }

    /**
     * Cập nhật trạng thái máy in (idle, printing, paused)
     */
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

    /**
     * Chuyển đổi góc nhìn Camera
     */
    public setCameraPreset(preset: 'stream' | 'closeup' | 'overview'): void {
        if (preset === 'stream') {
            // Góc 9:16 chuẩn giống hình chụp Livecade
            this.desiredCamPos.set(0, 4.3, 3.7);
            this.desiredTarget.set(0, 1.0, 0.3);
        } else if (preset === 'closeup') {
            // Cận cảnh tờ giấy in
            this.desiredCamPos.set(0, 2.8, 2.5);
            this.desiredTarget.set(0, 0.3, 0.9);
        } else if (preset === 'overview') {
            // Nghiêng toàn cảnh xưởng
            this.desiredCamPos.set(1.4, 4.5, 4.2);
            this.desiredTarget.set(0, 0.8, 0.4);
        }
    }

    /**
     * Vòng lặp Render Three.js với chuyển động mượt mà
     */
    private startRenderLoop(): void {
        const animate = () => {
            this.animationFrameId = requestAnimationFrame(animate);

            const delta = this.clock.getDelta();
            const time = this.clock.getElapsedTime();

            // Nếu đang ở trạng thái printing, đầu in lắc lư nhẹ mô phỏng hoạt động
            if (this.printerStatus === 'printing') {
                this.printHeadGroup.position.x = Math.sin(time * 6) * 0.45;
            } else {
                // Đưa về giữa
                this.printHeadGroup.position.x = THREE.MathUtils.lerp(
                    this.printHeadGroup.position.x,
                    0,
                    delta * 3
                );
            }

            // Camera di chuyển mềm mại về vị trí mong muốn
            this.camera.position.lerp(this.desiredCamPos, delta * 3.5);
            this.currentTarget.lerp(this.desiredTarget, delta * 3.5);
            this.camera.lookAt(this.currentTarget);

            this.renderer.render(this.scene, this.camera);
        };

        animate();
    }

    /**
     * Thay đổi kích thước khung hình
     */
    public onWindowResize(): void {
        if (!this.container) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }

    /**
     * Giải phóng bộ nhớ WebGL khi unmount
     */
    public dispose(): void {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
        }
        window.removeEventListener('resize', this.onWindowResize);

        this.renderer.dispose();
        if (this.renderer.domElement.parentElement) {
            this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
        }
    }
}
