import * as THREE from 'three';
import {
    createWoodTexture,
    createBrushedMetalTexture,
    createOledScreenTexture,
} from './textures';
import { SheetCanvasRenderer } from './sheetRenderer';
import type { Sheet, PrinterStatus } from '../types';

export interface CameraPreset {
    name: 'stream' | 'closeup' | 'overview';
    position: THREE.Vector3;
    target: THREE.Vector3;
}

export class PrinterWorkshopScene {
    public container: HTMLElement;
    public renderer: THREE.WebGLRenderer;
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;

    // Component meshes
    public sheetRenderer: SheetCanvasRenderer;
    public paperMesh: THREE.Mesh;
    public printHeadGroup: THREE.Group;
    public ledMesh: THREE.Mesh;
    public ledLight: THREE.PointLight;
    public oledScreenMesh: THREE.Mesh;

    // Materials needing updates
    private ledMaterial: THREE.MeshStandardMaterial;
    private oledMaterial: THREE.MeshBasicMaterial;

    // Animation & control
    private animationFrameId: number | null = null;
    private clock = new THREE.Clock();

    // Camera view targets
    private currentTarget = new THREE.Vector3(0, 0.75, 0.7);
    private desiredTarget = new THREE.Vector3(0, 0.75, 0.7);
    private desiredCamPos = new THREE.Vector3(0, 3.8, 5.2);

    constructor(container: HTMLElement) {
        this.container = container;

        // 1. Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x181412); // Nền workshop tối ấm cúng

        // 2. Camera tối ưu cho khung hình 9:16 (dọc OBS)
        const aspect = container.clientWidth / container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 100);
        this.camera.position.copy(this.desiredCamPos);
        this.camera.lookAt(this.desiredTarget);

        // 3. Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance',
        });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        container.appendChild(this.renderer.domElement);

        // 4. Ánh sáng workshop
        this.setupLighting();

        // 5. Môi trường (Bàn gỗ & Tường gỗ)
        this.setupEnvironment();

        // 6. Tờ giấy in (Sheet Renderer)
        this.sheetRenderer = new SheetCanvasRenderer(1024, 1536);
        this.paperMesh = this.createPaperMesh();
        this.scene.add(this.paperMesh);

        // 7. Máy in kim loại 3D
        const { printerGroup, printHead, led, ledLight, oled, ledMat, oledMat } =
            this.createPrinterMesh();
        this.scene.add(printerGroup);
        this.printHeadGroup = printHead;
        this.ledMesh = led;
        this.ledLight = ledLight;
        this.oledScreenMesh = oled;
        this.ledMaterial = ledMat;
        this.oledMaterial = oledMat;

        // 8. Handle window resize
        this.onWindowResize = this.onWindowResize.bind(this);
        window.addEventListener('resize', this.onWindowResize);

        // 9. Bắt đầu Render Loop
        this.startRenderLoop();
    }

    /**
     * Cài đặt hệ thống ánh sáng phong cách xưởng chế tác (warm workshop lighting)
     */
    private setupLighting(): void {
        // Ánh sáng môi trường dịu ấm
        const ambientLight = new THREE.AmbientLight(0xffecd6, 1.2);
        this.scene.add(ambientLight);

        // Đèn chính (Key Directional Light) có bóng đổ mềm mại
        const keyLight = new THREE.DirectionalLight(0xffeedd, 2.4);
        keyLight.position.set(3.5, 6.0, 3.8);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        keyLight.shadow.camera.near = 0.5;
        keyLight.shadow.camera.far = 15;
        keyLight.shadow.camera.left = -4;
        keyLight.shadow.camera.right = 4;
        keyLight.shadow.camera.top = 4;
        keyLight.shadow.camera.bottom = -4;
        keyLight.shadow.bias = -0.0004;
        this.scene.add(keyLight);

        // Đèn rọi bàn in (Spot Light chiếu thẳng vào giấy & máy)
        const spotLight = new THREE.SpotLight(0xfff5e6, 3.2, 12, Math.PI / 4, 0.6, 1.2);
        spotLight.position.set(0, 5.2, 1.5);
        spotLight.target.position.set(0, 0.6, 0.8);
        this.scene.add(spotLight);
        this.scene.add(spotLight.target);

        // Đèn phụ dịu (Cool Blue/Cyan Fill Light) tạo chiều sâu kim loại
        const fillLight = new THREE.DirectionalLight(0x7da4c7, 0.7);
        fillLight.position.set(-4.5, 3.2, 1.0);
        this.scene.add(fillLight);

        // Đèn hắt dưới gầm nhẹ
        const rimLight = new THREE.PointLight(0xf59e0b, 0.8, 6);
        rimLight.position.set(0, 0.2, -1.2);
        this.scene.add(rimLight);
    }

    /**
     * Dựng môi trường xưởng: Mặt bàn gỗ tự nhiên và tường gỗ phía sau
     */
    private setupEnvironment(): void {
        // 1. Mặt bàn gỗ workshop
        const tableTex = createWoodTexture(1024, 1024, false);
        tableTex.map.repeat.set(2, 2);
        tableTex.roughnessMap.repeat.set(2, 2);

        const tableGeo = new THREE.BoxGeometry(10, 0.3, 8);
        const tableMat = new THREE.MeshStandardMaterial({
            map: tableTex.map,
            roughnessMap: tableTex.roughnessMap,
            roughness: 0.45,
            metalness: 0.05,
        });

        const tableMesh = new THREE.Mesh(tableGeo, tableMat);
        tableMesh.position.set(0, -0.15, 1.0);
        tableMesh.receiveShadow = true;
        this.scene.add(tableMesh);

        // 2. Viền kim loại cạnh bàn
        const tableTrimGeo = new THREE.BoxGeometry(10.05, 0.1, 0.05);
        const tableTrimMat = new THREE.MeshStandardMaterial({
            color: 0x33373d,
            metalness: 0.8,
            roughness: 0.3,
        });
        const tableTrim = new THREE.Mesh(tableTrimGeo, tableTrimMat);
        tableTrim.position.set(0, -0.05, 5.02);
        this.scene.add(tableTrim);

        // 3. Tường gỗ phía sau (Backdrop)
        const wallTex = createWoodTexture(1024, 1024, true);
        wallTex.map.repeat.set(2, 1);
        wallTex.roughnessMap.repeat.set(2, 1);

        const wallGeo = new THREE.PlaneGeometry(12, 10);
        const wallMat = new THREE.MeshStandardMaterial({
            map: wallTex.map,
            roughnessMap: wallTex.roughnessMap,
            roughness: 0.8,
            metalness: 0.02,
        });

        const wallMesh = new THREE.Mesh(wallGeo, wallMat);
        wallMesh.position.set(0, 4.0, -2.6);
        wallMesh.receiveShadow = true;
        this.scene.add(wallMesh);

        // Đèn treo trang trí trên cao (Pendant Lamp)
        const lampGroup = new THREE.Group();
        lampGroup.position.set(0, 5.0, 0.8);

        const cordGeo = new THREE.CylinderGeometry(0.015, 0.015, 2.5);
        const cordMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        const cord = new THREE.Mesh(cordGeo, cordMat);
        cord.position.y = 1.25;
        lampGroup.add(cord);

        const shadeGeo = new THREE.ConeGeometry(0.45, 0.3, 16, 1, true);
        const shadeMat = new THREE.MeshStandardMaterial({
            color: 0x1e242b,
            metalness: 0.85,
            roughness: 0.25,
            side: THREE.DoubleSide,
        });
        const shade = new THREE.Mesh(shadeGeo, shadeMat);
        shade.rotation.x = Math.PI;
        lampGroup.add(shade);

        const bulbGeo = new THREE.SphereGeometry(0.1, 16, 16);
        const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2cc });
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.y = -0.05;
        lampGroup.add(bulb);

        this.scene.add(lampGroup);
    }

    /**
     * Dựng mô hình Máy In Kim Loại 3D chi tiết
     */
    private createPrinterMesh() {
        const printerGroup = new THREE.Group();
        printerGroup.position.set(0, 0, -0.3);

        const metalTex = createBrushedMetalTexture(512, 512, '#202227');

        // Vật liệu kim loại xước tối màu
        const darkMetalMat = new THREE.MeshStandardMaterial({
            color: 0x24272d,
            map: metalTex.map,
            roughnessMap: metalTex.roughnessMap,
            roughness: 0.35,
            metalness: 0.85,
        });

        // Vật liệu kim loại bạc bóng
        const silverMetalMat = new THREE.MeshStandardMaterial({
            color: 0xabb4be,
            metalness: 0.9,
            roughness: 0.2,
        });

        // Vật liệu chi tiết đồng / vàng thau
        const brassMat = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            metalness: 0.85,
            roughness: 0.25,
        });

        // --- 1. Thân máy chính (Chassis) ---
        // Kích thước: Rộng 3.1, Cao 1.5, Sâu 2.1
        const bodyGeo = new THREE.BoxGeometry(3.1, 1.5, 2.1);
        const bodyMesh = new THREE.Mesh(bodyGeo, darkMetalMat);
        bodyMesh.position.set(0, 0.75, 0);
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
        printerGroup.add(bodyMesh);

        // --- 2. Tấm nẹp kim loại hai bên hông (Side Plates) ---
        const sidePlateGeo = new THREE.BoxGeometry(0.08, 1.52, 2.12);
        const leftPlate = new THREE.Mesh(sidePlateGeo, silverMetalMat);
        leftPlate.position.set(-1.56, 0.75, 0);
        leftPlate.castShadow = true;
        printerGroup.add(leftPlate);

        const rightPlate = new THREE.Mesh(sidePlateGeo, silverMetalMat);
        rightPlate.position.set(1.56, 0.75, 0);
        rightPlate.castShadow = true;
        printerGroup.add(rightPlate);

        // Ốc vít lục giác trang trí 4 góc mỗi bên
        const boltGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.04, 6);
        const boltMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9 });
        for (const side of [-1.61, 1.61]) {
            for (const by of [0.25, 1.25]) {
                for (const bz of [-0.75, 0.75]) {
                    const bolt = new THREE.Mesh(boltGeo, boltMat);
                    bolt.rotation.z = Math.PI / 2;
                    bolt.position.set(side, by, bz);
                    printerGroup.add(bolt);
                }
            }
        }

        // --- 3. Khe nhả giấy (Paper Output Slot) ---
        const slotCutoutGeo = new THREE.BoxGeometry(2.3, 0.16, 0.3);
        const slotInteriorMat = new THREE.MeshStandardMaterial({
            color: 0x0f1114,
            roughness: 0.9,
        });
        const slotMesh = new THREE.Mesh(slotCutoutGeo, slotInteriorMat);
        slotMesh.position.set(0, 0.52, 0.95);
        printerGroup.add(slotMesh);

        // Miệng viền kim loại khe giấy
        const slotRimGeo = new THREE.BoxGeometry(2.36, 0.04, 0.05);
        const topRim = new THREE.Mesh(slotRimGeo, silverMetalMat);
        topRim.position.set(0, 0.61, 1.06);
        printerGroup.add(topRim);

        const botRim = new THREE.Mesh(slotRimGeo, silverMetalMat);
        botRim.position.set(0, 0.43, 1.06);
        printerGroup.add(botRim);

        // Con lăn cao su đưa giấy (Feed Rollers) bên trong khe
        const rollerGeo = new THREE.CylinderGeometry(0.03, 0.03, 2.2, 16);
        const rollerMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.8 });
        const roller = new THREE.Mesh(rollerGeo, rollerMat);
        roller.rotation.z = Math.PI / 2;
        roller.position.set(0, 0.52, 0.9);
        printerGroup.add(roller);

        // --- 4. Khay đỡ giấy dốc nhẹ ra bàn (Paper Output Tray) ---
        const trayGeo = new THREE.BoxGeometry(2.35, 0.03, 1.4);
        const trayMat = new THREE.MeshStandardMaterial({
            color: 0x2a2f38,
            metalness: 0.8,
            roughness: 0.3,
        });
        const tray = new THREE.Mesh(trayGeo, trayMat);
        tray.position.set(0, 0.34, 1.65);
        tray.rotation.x = 0.16; // Nghiêng dốc nhẹ tiếp đất
        tray.castShadow = true;
        tray.receiveShadow = true;
        printerGroup.add(tray);

        // --- 5. Trục ray gantry & Đầu in (Print Head Assembly) ---
        // Khoang nhìn vào đầu in trên nóc trước máy
        const bayGeo = new THREE.BoxGeometry(2.5, 0.5, 0.8);
        const bayMesh = new THREE.Mesh(bayGeo, slotInteriorMat);
        bayMesh.position.set(0, 1.1, 0.45);
        printerGroup.add(bayMesh);

        // Cặp trục ray trượt thép không gỉ
        const railGeo = new THREE.CylinderGeometry(0.025, 0.025, 2.45, 16);
        const rail1 = new THREE.Mesh(railGeo, silverMetalMat);
        rail1.rotation.z = Math.PI / 2;
        rail1.position.set(0, 1.22, 0.45);
        printerGroup.add(rail1);

        const rail2 = new THREE.Mesh(railGeo, silverMetalMat);
        rail2.rotation.z = Math.PI / 2;
        rail2.position.set(0, 0.98, 0.45);
        printerGroup.add(rail2);

        // Cụm đầu in (Print Head)
        const printHead = new THREE.Group();
        printHead.position.set(0, 1.1, 0.45);

        // Thân đầu in
        const headBodyGeo = new THREE.BoxGeometry(0.38, 0.38, 0.35);
        const headBodyMat = new THREE.MeshStandardMaterial({
            color: 0x1f2329,
            metalness: 0.9,
            roughness: 0.25,
        });
        const headBody = new THREE.Mesh(headBodyGeo, headBodyMat);
        headBody.castShadow = true;
        printHead.add(headBody);

        // Cánh tản nhiệt đầu in (Heatsink fins)
        for (let f = -0.12; f <= 0.12; f += 0.06) {
            const finGeo = new THREE.BoxGeometry(0.4, 0.015, 0.37);
            const fin = new THREE.Mesh(finGeo, silverMetalMat);
            fin.position.y = f;
            printHead.add(fin);
        }

        // Đầu phun nhiệt / kim phun phía dưới bằng đồng thau
        const nozzleGeo = new THREE.ConeGeometry(0.05, 0.1, 12);
        const nozzle = new THREE.Mesh(nozzleGeo, brassMat);
        nozzle.rotation.x = Math.PI;
        nozzle.position.set(0, -0.22, 0.05);
        printHead.add(nozzle);

        // Đèn LED soi tia kim trên đầu in
        const headLedGeo = new THREE.SphereGeometry(0.02, 8, 8);
        const headLedMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const headLed = new THREE.Mesh(headLedGeo, headLedMat);
        headLed.position.set(0.12, -0.16, 0.18);
        printHead.add(headLed);

        printerGroup.add(printHead);

        // --- 6. Màn hình OLED trạng thái vát nghiêng trên máy in ---
        const oledGeo = new THREE.PlaneGeometry(0.95, 0.24);
        const oledTexture = createOledScreenTexture('PRINTER READY', 'COMMUNITY PRINT HUB', '#00ffaa');
        const oledMat = new THREE.MeshBasicMaterial({
            map: oledTexture,
        });
        const oled = new THREE.Mesh(oledGeo, oledMat);
        oled.position.set(-0.7, 1.4, 0.95);
        oled.rotation.x = -0.3; // Nghiêng hướng lên mắt nhìn
        printerGroup.add(oled);

        // Khung viền màn hình OLED
        const oledFrameGeo = new THREE.BoxGeometry(1.02, 0.3, 0.03);
        const oledFrame = new THREE.Mesh(oledFrameGeo, silverMetalMat);
        oledFrame.position.set(-0.7, 1.4, 0.93);
        oledFrame.rotation.x = -0.3;
        printerGroup.add(oledFrame);

        // --- 7. Đèn LED chỉ báo trạng thái máy (Status LED Dome) ---
        const ledGeo = new THREE.SphereGeometry(0.045, 16, 16);
        const ledMat = new THREE.MeshStandardMaterial({
            color: 0x00ffaa,
            emissive: 0x00ffaa,
            emissiveIntensity: 1.2,
            roughness: 0.1,
        });
        const led = new THREE.Mesh(ledGeo, ledMat);
        led.position.set(0.95, 1.38, 0.96);
        printerGroup.add(led);

        // Điểm sáng tỏa từ LED
        const ledLight = new THREE.PointLight(0x00ffaa, 0.8, 1.5);
        ledLight.position.set(0.95, 1.4, 1.0);
        printerGroup.add(ledLight);

        // Nút bấm kim loại cạnh đèn LED
        const btnGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16);
        const btn = new THREE.Mesh(btnGeo, brassMat);
        btn.rotation.x = Math.PI / 2 - 0.3;
        btn.position.set(1.15, 1.38, 0.96);
        printerGroup.add(btn);

        // Nhãn in chìm logo mặt trước
        // Tạo dải logo khắc laser
        const brandPlateGeo = new THREE.BoxGeometry(0.65, 0.06, 0.01);
        const brandPlate = new THREE.Mesh(brandPlateGeo, brassMat);
        brandPlate.position.set(0, 0.22, 1.06);
        printerGroup.add(brandPlate);

        return {
            printerGroup,
            printHead,
            led,
            ledLight,
            oled,
            ledMat,
            oledMat,
        };
    }

    /**
     * Tạo Mesh tờ giấy in với đường cong tự nhiên từ khe máy in chảy xuống bàn
     */
    private createPaperMesh(): THREE.Mesh {
        // Tờ giấy rộng 2.05, dài 3.0 (phù hợp 6 ô avatar 2 cột x 3 hàng)
        const paperWidth = 2.05;
        const paperLength = 3.0;
        const segmentsX = 24;
        const segmentsY = 48;

        const geo = new THREE.PlaneGeometry(paperWidth, paperLength, segmentsX, segmentsY);

        // Làm cong tờ giấy theo trục Y:
        // Đoạn đầu (trong khe máy): y ~ 0.52, z ~ 0.65
        // Đoạn giữa (trượt theo khay dốc): chuyển tiếp mượt mà
        // Đoạn cuối (nằm trên bàn): y ~ 0.02, z ~ 2.45
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            // Trong PlaneGeometry mặc định: y chạy từ -length/2 (đoạn chân giấy) đến +length/2 (đoạn đầu trong máy)
            const localY = pos.getY(i);
            const t = (localY + paperLength / 2) / paperLength; // 0 = chân giấy phía ngoài, 1 = đầu giấy trong khe máy

            // Đường cong tự nhiên S-curve từ khe máy ra bàn
            const curveZ = -0.3 + 0.65 * t + (1 - t) * 2.25;
            const curveY = 0.03 + 0.49 * Math.pow(t, 2.2);

            // Gán lại toạ độ 3D (xoay mặt giấy ngửa lên phía camera)
            pos.setY(i, curveY);
            pos.setZ(i, curveZ);
        }
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            map: this.sheetRenderer.texture,
            roughness: 0.82,
            metalness: 0.02,
            side: THREE.DoubleSide,
        });

        const paperMesh = new THREE.Mesh(geo, mat);
        paperMesh.castShadow = true;
        paperMesh.receiveShadow = true;
        return paperMesh;
    }

    /**
     * Cập nhật dữ liệu tờ giấy (Sheet) và vẽ lại texture
     */
    public updateSheet(sheet: Sheet): void {
        this.sheetRenderer.renderSheet(sheet);
    }

    /**
     * Cập nhật trạng thái đèn LED và màn hình OLED máy in
     */
    public setPrinterStatus(status: PrinterStatus, currentSlot?: number): void {
        let ledColor = 0x00ffaa;
        let oledText = 'PRINTER READY';
        let oledSub = 'WAITING FOR NEW PRINT';
        let hexColor = '#00ffaa';

        if (status === 'printing') {
            ledColor = 0x38bdf8;
            hexColor = '#38bdf8';
            oledText = 'PRINTING NOW';
            oledSub = currentSlot !== undefined ? `PRINTING SLOT ${currentSlot + 1}/6` : 'IN PROGRESS';
        } else if (status === 'paused') {
            ledColor = 0xf59e0b;
            hexColor = '#f59e0b';
            oledText = 'PRINTER PAUSED';
            oledSub = 'RESUME VIA DASHBOARD';
        }

        this.ledMaterial.color.setHex(ledColor);
        this.ledMaterial.emissive.setHex(ledColor);
        this.ledLight.color.setHex(ledColor);

        // Tạo lại texture màn hình OLED
        const newOledTex = createOledScreenTexture(oledText, oledSub, hexColor);
        this.oledMaterial.map?.dispose();
        this.oledMaterial.map = newOledTex;
        this.oledMaterial.needsUpdate = true;
    }

    /**
     * Đổi góc nhìn Camera
     */
    public setCameraPreset(preset: 'stream' | 'closeup' | 'overview'): void {
        if (preset === 'stream') {
            // Góc 9:16 chuẩn livestream TikTok / OBS
            this.desiredCamPos.set(0, 3.8, 5.2);
            this.desiredTarget.set(0, 0.75, 0.7);
        } else if (preset === 'closeup') {
            // Cận cảnh tờ giấy in
            this.desiredCamPos.set(0, 2.5, 3.2);
            this.desiredTarget.set(0, 0.45, 1.2);
        } else if (preset === 'overview') {
            // Toàn cảnh xưởng nghiêng nhẹ
            this.desiredCamPos.set(1.5, 4.2, 5.8);
            this.desiredTarget.set(0, 0.6, 0.5);
        }
    }

    /**
     * Vòng lặp Render Three.js với hiệu ứng chuyển động mượt mà
     */
    private startRenderLoop(): void {
        const animate = () => {
            this.animationFrameId = requestAnimationFrame(animate);

            const delta = this.clock.getDelta();
            const time = this.clock.getElapsedTime();

            // Nhịp thở nhấp nháy nhẹ cho đèn LED
            const pulse = Math.sin(time * 3) * 0.15 + 0.85;
            this.ledMaterial.emissiveIntensity = pulse * 1.3;
            this.ledLight.intensity = pulse * 0.9;

            // Camera di chuyển mềm mại (LERP) về vị trí mong muốn
            this.camera.position.lerp(this.desiredCamPos, delta * 3.5);
            this.currentTarget.lerp(this.desiredTarget, delta * 3.5);
            this.camera.lookAt(this.currentTarget);

            this.renderer.render(this.scene, this.camera);
        };

        animate();
    }

    /**
     * Xử lý thay đổi kích thước khung hình (giữ tỷ lệ 9:16 hoặc responsive)
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
     * Giải phóng bộ nhớ WebGL khi component unmount
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
