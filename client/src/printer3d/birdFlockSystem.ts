import * as THREE from 'three';

interface BirdInstance {
    mesh: THREE.Group;
    wingLeft: THREE.Mesh;
    wingRight: THREE.Mesh;
    offset: THREE.Vector3;
    flapOffset: number;
    flapSpeed: number;
}

interface SoaringBird {
    group: THREE.Group;
    wingLeft: THREE.Mesh;
    wingRight: THREE.Mesh;
    centerX: number;
    centerY: number;
    radiusX: number;
    radiusY: number;
    speed: number;
    phase: number;
}

/**
 * Hệ thống chim trời bay qua bầu trời xa xăm (như trong ảnh mẫu và video vd1).
 * 1. Đàn chim di cư (Flock): Cứ 20-35s bay theo đội hình chữ V ngang qua chân trời.
 * 2. Chim đơn lẻ chao lượn (Soaring Birds): 2 chú chim bay lượn tự do xa xa gần đỉnh núi, cánh chao nghiêng êm ái.
 * -> Tạo bầu trời sống động liên tục, không bao giờ bị đứt gãy hay giật cục.
 */
export class BirdFlockSystem {
    public group: THREE.Group;
    private flockGroup: THREE.Group;
    private soaringGroup: THREE.Group;

    private birds: BirdInstance[] = [];
    private soaringBirds: SoaringBird[] = [];
    private isVisible = true;

    // Trạng thái đàn chim di cư
    private isFlying = false;
    private flightProgress = 0.0;
    private flightDuration = 10.0;
    private nextFlightTimer = 4.0;

    private startX = -6.5;
    private endX = 6.5;
    private flightY = 4.2;
    private flightZ = -8.5;
    private direction = 1;

    constructor() {
        this.group = new THREE.Group();
        this.group.name = 'BirdFlockSystem';

        this.flockGroup = new THREE.Group();
        this.soaringGroup = new THREE.Group();
        this.group.add(this.flockGroup);
        this.group.add(this.soaringGroup);

        this.createBirds();
        this.createSoaringBirds();
    }

    private createWingGeometry(): THREE.BufferGeometry {
        const wingShape = new THREE.Shape();
        wingShape.moveTo(0, 0);
        wingShape.lineTo(0.08, 0.04);
        wingShape.lineTo(0.06, 0.005);
        wingShape.lineTo(0, 0);

        const wingGeo = new THREE.ShapeGeometry(wingShape);
        wingGeo.center();
        wingGeo.translate(0.04, 0, 0);
        return wingGeo;
    }

    private createBirds(): void {
        const birdMat = new THREE.MeshBasicMaterial({
            color: 0x1e293b,
            side: THREE.DoubleSide,
        });

        const wingGeo = this.createWingGeometry();

        // Đội hình bay chữ V 6 con chim
        const formationOffsets = [
            new THREE.Vector3(0, 0, 0),         // Chim đầu đàn
            new THREE.Vector3(-0.25, 0.08, -0.15), // Cánh trái 1
            new THREE.Vector3(-0.5, 0.14, -0.3),  // Cánh trái 2
            new THREE.Vector3(-0.22, -0.06, 0.15), // Cánh phải 1
            new THREE.Vector3(-0.45, -0.12, 0.3), // Cánh phải 2
            new THREE.Vector3(-0.7, 0.02, -0.05), // Con bay bọc hậu
        ];

        formationOffsets.forEach((offset, idx) => {
            const bGroup = new THREE.Group();

            const wingLeft = new THREE.Mesh(wingGeo, birdMat);
            wingLeft.position.set(0.005, 0, 0);
            bGroup.add(wingLeft);

            const wingRight = new THREE.Mesh(wingGeo, birdMat);
            wingRight.rotation.y = Math.PI;
            wingRight.position.set(-0.005, 0, 0);
            bGroup.add(wingRight);

            const scale = 0.85 + Math.random() * 0.3;
            bGroup.scale.setScalar(scale);

            this.flockGroup.add(bGroup);

            this.birds.push({
                mesh: bGroup,
                wingLeft,
                wingRight,
                offset,
                flapOffset: idx * 0.55,
                flapSpeed: 7.5 + Math.random() * 2.0,
            });
        });

        this.flockGroup.position.set(-999, 0, 0);
    }

    private createSoaringBirds(): void {
        const birdMat = new THREE.MeshBasicMaterial({
            color: 0x334155,
            side: THREE.DoubleSide,
        });
        const wingGeo = this.createWingGeometry();

        // 2 chú chim chao lượn liên tục quanh vùng đỉnh núi ánh mặt trời
        const soaringConfigs = [
            { centerX: 1.2, centerY: 3.8, radiusX: 1.8, radiusY: 0.45, speed: 0.35, scale: 0.75, z: -8.8 },
            { centerX: -1.0, centerY: 4.1, radiusX: 2.2, radiusY: 0.5, speed: 0.28, scale: 0.65, z: -9.2 },
        ];

        soaringConfigs.forEach((cfg, idx) => {
            const bGroup = new THREE.Group();

            const wingLeft = new THREE.Mesh(wingGeo, birdMat);
            wingLeft.position.set(0.005, 0, 0);
            bGroup.add(wingLeft);

            const wingRight = new THREE.Mesh(wingGeo, birdMat);
            wingRight.rotation.y = Math.PI;
            wingRight.position.set(-0.005, 0, 0);
            bGroup.add(wingRight);

            bGroup.scale.setScalar(cfg.scale);
            bGroup.position.set(cfg.centerX, cfg.centerY, cfg.z);

            this.soaringGroup.add(bGroup);

            this.soaringBirds.push({
                group: bGroup,
                wingLeft,
                wingRight,
                centerX: cfg.centerX,
                centerY: cfg.centerY,
                radiusX: cfg.radiusX,
                radiusY: cfg.radiusY,
                speed: cfg.speed,
                phase: idx * Math.PI,
            });
        });
    }

    public triggerFlockFlight(): void {
        this.isFlying = true;
        this.flightProgress = 0.0;
        this.direction = Math.random() > 0.5 ? 1 : -1;
        this.startX = this.direction === 1 ? -6.5 : 6.5;
        this.endX = this.direction === 1 ? 6.5 : -6.5;
        this.flightY = 3.8 + Math.random() * 0.8;
        this.flightZ = -8.0 - Math.random() * 1.5;
        this.flightDuration = 9.5 + Math.random() * 3.5;
    }

    public update(delta: number, time: number): void {
        if (!this.isVisible) return;

        // 1. Cập nhật 2 chú chim chao lượn liên tục ở đỉnh núi
        for (let i = 0; i < this.soaringBirds.length; i++) {
            const sb = this.soaringBirds[i];
            const angle = time * sb.speed + sb.phase;
            const x = sb.centerX + Math.cos(angle) * sb.radiusX;
            const y = sb.centerY + Math.sin(angle * 2) * sb.radiusY;

            sb.group.position.x = x;
            sb.group.position.y = y;

            // Góc nghiêng lượn theo hướng bay
            const heading = Math.atan2(Math.cos(angle * 2) * sb.radiusY * 2, -Math.sin(angle) * sb.radiusX);
            sb.group.rotation.y = heading + Math.PI / 2;
            sb.group.rotation.z = Math.sin(angle) * 0.25; // Chao nghiêng cánh

            // Vỗ cánh êm dịu lúc lượn lúc vỗ
            const glideOrFlap = (Math.sin(time * 1.8 + sb.phase) > 0.2)
                ? Math.sin(time * 5.5) * 0.35
                : 0.05; // Giữ cánh lượn gió
            sb.wingLeft.rotation.z = glideOrFlap;
            sb.wingRight.rotation.z = -glideOrFlap;
        }

        // 2. Cập nhật đàn chim di cư
        if (!this.isFlying) {
            this.nextFlightTimer -= delta;
            if (this.nextFlightTimer <= 0) {
                this.triggerFlockFlight();
            }
            return;
        }

        this.flightProgress += delta / this.flightDuration;

        if (this.flightProgress >= 1.0) {
            this.isFlying = false;
            this.flockGroup.position.set(-999, 0, 0);
            this.nextFlightTimer = 20.0 + Math.random() * 20.0;
            return;
        }

        const curX = THREE.MathUtils.lerp(this.startX, this.endX, this.flightProgress);
        const arcY = Math.sin(this.flightProgress * Math.PI) * 0.35;
        const curY = this.flightY + arcY;

        this.flockGroup.position.set(curX, curY, this.flightZ);
        this.flockGroup.rotation.y = this.direction === 1 ? 0 : Math.PI;

        this.birds.forEach((b) => {
            b.mesh.position.copy(b.offset);
            const flap = Math.sin(time * b.flapSpeed + b.flapOffset) * 0.42;
            b.wingLeft.rotation.z = flap;
            b.wingRight.rotation.z = -flap;
        });
    }

    public setVisible(visible: boolean): void {
        this.isVisible = visible;
        this.group.visible = visible;
    }

    public getVisible(): boolean {
        return this.isVisible;
    }

    public dispose(): void {
        this.group.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose();
                if (Array.isArray(obj.material)) {
                    obj.material.forEach((m) => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        });
    }
}
