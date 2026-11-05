import * as THREE from 'three';

interface LeafInstance {
    mesh: THREE.Mesh;
    initialX: number;
    fallSpeed: number;
    swaySpeed: number;
    swayAmplitude: number;
    swayPhase: number;
    tumbleSpeedX: number;
    tumbleSpeedY: number;
    time: number;
}

/**
 * Hệ thống lá cây chao liệng rơi trong gió (Falling Leaves in the Breeze)
 * - Tách lớp chuyển động độc lập: những chiếc lá màu xanh/vàng chao liệng rơi từ trên xuống.
 * - Xoay lật 3D tự nhiên (tumble & sway) theo luồng gió núi.
 * - Tự động tái sinh khi chạm đáy, tạo chu kỳ rơi vô tận không bao giờ bị cắt cảnh hay đứt gãy.
 */
export class FallingLeavesSystem {
    public group: THREE.Group;
    private leaves: LeafInstance[] = [];
    private isVisible = true;
    private leafTexture: THREE.CanvasTexture;

    constructor() {
        this.group = new THREE.Group();
        this.group.name = 'FallingLeavesSystem';
        this.leafTexture = this.createLeafTexture();
        this.createLeaves(18);
    }

    /**
     * Vẽ texture chiếc lá tự nhiên mềm mại với gân lá và viền sắc nét
     */
    private createLeafTexture(): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;

        ctx.clearRect(0, 0, 128, 128);

        // Vẽ hình dáng chiếc lá hình thoi bầu dục uốn lượn
        ctx.beginPath();
        ctx.moveTo(64, 8); // Đỉnh lá
        ctx.bezierCurveTo(95, 30, 105, 75, 64, 118); // Cạnh phải
        ctx.bezierCurveTo(23, 75, 33, 30, 64, 8);   // Cạnh trái
        ctx.closePath();

        // Màu sắc chuyển sắc từ xanh non sang vàng úa nhẹ của lá rừng nhiệt đới
        const grad = ctx.createLinearGradient(64, 8, 64, 118);
        grad.addColorStop(0, '#86efac'); // Xanh non mơn mởn ở chóp
        grad.addColorStop(0.45, '#4ade80'); // Xanh lá cây tự nhiên
        grad.addColorStop(0.85, '#22c55e'); // Xanh thẫm
        grad.addColorStop(1, '#ca8a04'); // Hơi ố vàng nhẹ ở cuống lá
        ctx.fillStyle = grad;
        ctx.fill();

        // Gân chính giữa sống lá
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(64, 15);
        ctx.quadraticCurveTo(65, 64, 64, 115);
        ctx.stroke();

        // Gân phụ nhỏ tỏa ra hai bên
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        for (let y = 30; y <= 95; y += 14) {
            ctx.beginPath();
            ctx.moveTo(64, y);
            ctx.lineTo(82, y - 8);
            ctx.moveTo(64, y);
            ctx.lineTo(46, y - 8);
            ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    private createLeaves(count: number): void {
        const leafGeo = new THREE.PlaneGeometry(0.12, 0.2);

        const leafMat = new THREE.MeshBasicMaterial({
            map: this.leafTexture,
            transparent: true,
            opacity: 0.88,
            side: THREE.DoubleSide,
            depthWrite: false,
        });

        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(leafGeo, leafMat.clone());

            // Tọa độ khởi tạo ngẫu nhiên trong không gian phía trước và sau tờ giấy
            const initialX = (Math.random() - 0.5) * 4.2;
            const startY = -1.5 + Math.random() * 5.5; // Phân bổ đều theo chiều dọc ban đầu
            const startZ = -1.2 - Math.random() * 4.0; // Khoảng cách sâu sau tờ giấy

            mesh.position.set(initialX, startY, startZ);

            // Tỷ lệ kích thước lá ngẫu nhiên (từ nhỏ 0.6x đến to 1.3x)
            const scale = 0.55 + Math.random() * 0.65;
            mesh.scale.set(scale, scale, scale);

            // Góc xoay ngẫu nhiên
            mesh.rotation.x = Math.random() * Math.PI;
            mesh.rotation.y = Math.random() * Math.PI;
            mesh.rotation.z = Math.random() * Math.PI;

            this.group.add(mesh);

            this.leaves.push({
                mesh,
                initialX,
                fallSpeed: 0.28 + Math.random() * 0.35, // Tốc độ rơi êm ái
                swaySpeed: 1.4 + Math.random() * 1.8,   // Nhịp chao đảo
                swayAmplitude: 0.12 + Math.random() * 0.2, // Biên độ đung đưa
                swayPhase: Math.random() * Math.PI * 2,
                tumbleSpeedX: (Math.random() - 0.5) * 1.5,
                tumbleSpeedY: (Math.random() - 0.5) * 2.0,
                time: Math.random() * 20,
            });
        }
    }

    public update(delta: number): void {
        if (!this.isVisible) return;

        for (let i = 0; i < this.leaves.length; i++) {
            const leaf = this.leaves[i];
            leaf.time += delta;

            // Rơi xuống dần đều
            leaf.mesh.position.y -= leaf.fallSpeed * delta;

            // Đung đưa lượn sóng sang hai bên theo gió
            const sway = Math.sin(leaf.time * leaf.swaySpeed + leaf.swayPhase) * leaf.swayAmplitude;
            const microWind = Math.cos(leaf.time * 0.8) * 0.05;
            leaf.mesh.position.x = leaf.initialX + sway + microWind;

            // Lật xoay 3D chiếc lá trong không trung
            leaf.mesh.rotation.x += leaf.tumbleSpeedX * delta;
            leaf.mesh.rotation.y += leaf.tumbleSpeedY * delta;
            leaf.mesh.rotation.z = Math.sin(leaf.time * leaf.swaySpeed) * 0.45;

            // Khi lá rơi qua mép dưới khung hình -> Tái sinh trên đỉnh không gian
            if (leaf.mesh.position.y < -2.2) {
                leaf.mesh.position.y = 4.2 + Math.random() * 1.0;
                leaf.initialX = (Math.random() - 0.5) * 4.2;
                leaf.mesh.position.x = leaf.initialX;
                leaf.mesh.position.z = -1.2 - Math.random() * 4.0;
                leaf.fallSpeed = 0.28 + Math.random() * 0.35;
                leaf.time = 0;
            }
        }
    }

    public setVisible(visible: boolean): void {
        this.isVisible = visible;
        this.group.visible = visible;
    }

    public dispose(): void {
        this.leafTexture.dispose();
        this.leaves.forEach((l) => {
            l.mesh.geometry.dispose();
            if (Array.isArray(l.mesh.material)) {
                l.mesh.material.forEach((m) => m.dispose());
            } else {
                l.mesh.material.dispose();
            }
        });
        this.leaves = [];
    }
}
