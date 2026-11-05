import * as THREE from 'three';

interface BirdInstance {
    mesh: THREE.Group;
    wingLeft: THREE.Mesh;
    wingRight: THREE.Mesh;
    offset: THREE.Vector3;
    flapOffset: number;
    flapSpeed: number;
}

/**
 * Hệ thống đàn chim bay qua bầu trời xa xăm (như trong ảnh mẫu).
 * - Cứ mỗi 25-45 giây (ngẫu nhiên), một đàn chim 5-7 con chao lượn bay qua chân trời.
 * - Cánh chim vỗ nhịp nhàng mềm mại, chao nghiêng theo luồng gió.
 * - Có thể kích hoạt bay ngay lập tức qua triggerFlockFlight().
 */
export class BirdFlockSystem {
    public group: THREE.Group;
    private birds: BirdInstance[] = [];
    private isVisible = true;

    // Trạng thái chuyến bay
    private isFlying = false;
    private flightProgress = 0.0;
    private flightDuration = 10.0; // giây để bay hết bầu trời
    private nextFlightTimer = 5.0; // Khởi động chuyến bay đầu sau 5s

    private startX = -6.5;
    private endX = 6.5;
    private flightY = 4.2;
    private flightZ = -8.5;
    private direction = 1; // 1: trái qua phải, -1: phải qua trái

    constructor() {
        this.group = new THREE.Group();
        this.group.name = 'BirdFlockSystem';
        this.createBirds();
    }

    private createBirds(): void {
        const birdMat = new THREE.MeshBasicMaterial({
            color: 0x1e293b,
            side: THREE.DoubleSide,
        });

        // Hình dạng cánh chim dạng V vuốt nhọn (Chevron Wing)
        const wingShape = new THREE.Shape();
        wingShape.moveTo(0, 0);
        wingShape.lineTo(0.08, 0.04);
        wingShape.lineTo(0.06, 0.005);
        wingShape.lineTo(0, 0);

        const wingGeo = new THREE.ShapeGeometry(wingShape);
        wingGeo.center();
        wingGeo.translate(0.04, 0, 0);

        // Đội hình bay chữ V (V-Formation) 6 con chim
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

            // Cánh trái
            const wingLeft = new THREE.Mesh(wingGeo, birdMat);
            wingLeft.position.set(0.005, 0, 0);
            bGroup.add(wingLeft);

            // Cánh phải
            const wingRight = new THREE.Mesh(wingGeo, birdMat);
            wingRight.rotation.y = Math.PI;
            wingRight.position.set(-0.005, 0, 0);
            bGroup.add(wingRight);

            // Tỷ lệ ngẫu nhiên nhẹ giữa các con
            const scale = 0.85 + Math.random() * 0.3;
            bGroup.scale.setScalar(scale);

            this.group.add(bGroup);

            this.birds.push({
                mesh: bGroup,
                wingLeft,
                wingRight,
                offset,
                flapOffset: idx * 0.55,
                flapSpeed: 7.5 + Math.random() * 2.0,
            });
        });

        // Đặt ở vị trí ẩn ban đầu
        this.group.position.set(-999, 0, 0);
    }

    /**
     * Kích hoạt ngay một chuyến bay qua bầu trời
     */
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

    /**
     * Cập nhật vị trí đàn chim trong Render Loop
     */
    public update(delta: number, time: number): void {
        if (!this.isVisible) return;

        // Nếu chưa đến lúc bay thì đếm ngược
        if (!this.isFlying) {
            this.nextFlightTimer -= delta;
            if (this.nextFlightTimer <= 0) {
                this.triggerFlockFlight();
            }
            return;
        }

        // Đang bay qua bầu trời
        this.flightProgress += delta / this.flightDuration;

        if (this.flightProgress >= 1.0) {
            // Chuyến bay kết thúc, đặt lịch cho chuyến bay kế tiếp (25 - 45s)
            this.isFlying = false;
            this.group.position.set(-999, 0, 0);
            this.nextFlightTimer = 25.0 + Math.random() * 20.0;
            return;
        }

        // Tọa độ tiến trình
        const curX = THREE.MathUtils.lerp(this.startX, this.endX, this.flightProgress);
        // Đường lượn hình vòng cung nhẹ trên bầu trời
        const arcY = Math.sin(this.flightProgress * Math.PI) * 0.35;
        const curY = this.flightY + arcY;

        this.group.position.set(curX, curY, this.flightZ);

        // Hướng quay mặt theo chiều bay
        this.group.rotation.y = this.direction === 1 ? 0 : Math.PI;

        // Vỗ cánh từng con
        this.birds.forEach((b) => {
            b.mesh.position.copy(b.offset);

            // Vỗ cánh + lượn cánh
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

