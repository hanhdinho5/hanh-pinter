import * as THREE from 'three';

interface ButterflyInstance {
    group: THREE.Group;
    wingLeft: THREE.Mesh;
    wingRight: THREE.Mesh;
    basePos: THREE.Vector3;
    orbitRadius: { x: number; y: number; z: number };
    speed: number;
    flapSpeed: number;
    phaseOffset: number;
    currentPos: THREE.Vector3;
}

/**
 * Hệ thống đàn bướm 3D tự nhiên bay lượn ở PHÍA SAU tờ giấy (cách 6 - 10 mét trên không trung).
 * - Cánh bướm phát sáng rực rỡ (MeshBasicMaterial không bị bóng đen làm tối).
 * - Bay lơ lửng trên nền trời thung lũng núi non phía sau máy in.
 */
export class ButterflySystem {
    public group: THREE.Group;
    private butterflies: ButterflyInstance[] = [];
    private isVisible = true;

    constructor() {
        this.group = new THREE.Group();
        this.group.name = 'ButterflySystem';
        this.createFlock();
    }

    private createGlowingWingTexture(colorA: string, colorB: string, spotColor: string): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d')!;

        // Nền cánh chuyển sắc rực rỡ
        const grad = ctx.createRadialGradient(40, 40, 10, 128, 128, 150);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.25, colorA);
        grad.addColorStop(0.7, colorB);
        grad.addColorStop(1, 'rgba(10, 15, 30, 0.9)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);

        // Gân cánh bướm phát sáng
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let a = 0; a < 8; a++) {
            ctx.moveTo(20, 20);
            ctx.quadraticCurveTo(70 + a * 18, 50 + a * 20, 220, 30 + a * 28);
        }
        ctx.stroke();

        // Chấm hoa văn phát sáng lấp lánh ở viền cánh
        ctx.fillStyle = spotColor;
        for (let i = 0; i < 9; i++) {
            ctx.beginPath();
            ctx.arc(230 - i * 10, 40 + i * 22, 6, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return texture;
    }

    private createFlock(): void {
        // Cấu hình các con bướm ở cự ly PHÍA SAU tờ giấy (Z = -5.0 đến -8.5 mét, Y = 1.8 đến 3.5 mét)
        const butterflyConfigs = [
            {
                name: 'Morpho Cyan (Lam Ngọc)',
                colorA: '#38bdf8',
                colorB: '#0284c7',
                spot: '#e0f2fe',
                // Nằm sâu phía sau tờ giấy (Z = -6.5)
                basePos: new THREE.Vector3(-1.8, 2.6, -6.5),
                radius: { x: 1.2, y: 0.6, z: 1.0 },
                speed: 0.65,
                flapSpeed: 14,
                scale: 2.8,
            },
            {
                name: 'Golden Amber (Hổ Phách Vàng)',
                colorA: '#fde047',
                colorB: '#f59e0b',
                spot: '#fffbeb',
                basePos: new THREE.Vector3(1.6, 3.1, -7.8),
                radius: { x: 1.4, y: 0.7, z: 1.1 },
                speed: 0.55,
                flapSpeed: 13,
                scale: 3.2,
            },
            {
                name: 'Emerald Jade (Ngọc Lục Bảo)',
                colorA: '#4ade80',
                colorB: '#059669',
                spot: '#ecfdf5',
                basePos: new THREE.Vector3(0.2, 2.2, -5.8),
                radius: { x: 1.0, y: 0.5, z: 0.8 },
                speed: 0.75,
                flapSpeed: 16,
                scale: 2.5,
            },
            {
                name: 'Amethyst Violet (Tím Thạch Anh)',
                colorA: '#e879f9',
                colorB: '#9333ea',
                spot: '#faf5ff',
                basePos: new THREE.Vector3(-0.9, 3.4, -8.5),
                radius: { x: 1.5, y: 0.65, z: 1.2 },
                speed: 0.6,
                flapSpeed: 14,
                scale: 3.0,
            },
            {
                name: 'Ruby Rose (Hồng Ngọc)',
                colorA: '#fb7185',
                colorB: '#e11d48',
                spot: '#fff1f2',
                basePos: new THREE.Vector3(1.1, 2.5, -6.0),
                radius: { x: 1.1, y: 0.55, z: 0.9 },
                speed: 0.7,
                flapSpeed: 15,
                scale: 2.6,
            },
        ];

        // Hình dạng cánh bướm mềm mại
        const wingShape = new THREE.Shape();
        wingShape.moveTo(0, 0);
        wingShape.bezierCurveTo(0.05, 0.1, 0.14, 0.13, 0.16, 0.06);
        wingShape.bezierCurveTo(0.17, -0.01, 0.11, -0.07, 0.07, -0.1);
        wingShape.bezierCurveTo(0.04, -0.11, 0.01, -0.06, 0, 0);

        const wingGeo = new THREE.ShapeGeometry(wingShape);
        wingGeo.center();
        wingGeo.translate(0.08, 0, 0);

        const bodyGeo = new THREE.CylinderGeometry(0.008, 0.005, 0.09, 8);
        const bodyMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });

        butterflyConfigs.forEach((cfg, idx) => {
            const bGroup = new THREE.Group();

            const tex = this.createGlowingWingTexture(cfg.colorA, cfg.colorB, cfg.spot);
            // Dùng MeshBasicMaterial để cánh bướm luôn rực rỡ, không bị bóng đổ biến thành màu đen
            const wingMat = new THREE.MeshBasicMaterial({
                map: tex,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.92,
            });

            // Thân bướm
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.rotation.x = Math.PI / 2;
            bGroup.add(body);

            // Cánh trái
            const wingLeftGroup = new THREE.Group();
            const wingLeft = new THREE.Mesh(wingGeo, wingMat);
            wingLeft.position.set(0.006, 0, 0);
            wingLeftGroup.add(wingLeft);
            bGroup.add(wingLeftGroup);

            // Cánh phải (đối xứng)
            const wingRightGroup = new THREE.Group();
            const wingRight = new THREE.Mesh(wingGeo, wingMat);
            wingRight.rotation.y = Math.PI;
            wingRight.position.set(-0.006, 0, 0);
            wingRightGroup.add(wingRight);
            bGroup.add(wingRightGroup);

            // Phóng to phù hợp với khoảng cách xa 6 - 10 mét
            bGroup.scale.setScalar(cfg.scale);

            this.group.add(bGroup);

            this.butterflies.push({
                group: bGroup,
                wingLeft,
                wingRight,
                basePos: cfg.basePos.clone(),
                orbitRadius: cfg.radius,
                speed: cfg.speed,
                flapSpeed: cfg.flapSpeed,
                phaseOffset: idx * 1.7,
                currentPos: cfg.basePos.clone(),
            });
        });
    }

    /**
     * Cập nhật chuyển động vỗ cánh và đường bay lượn trong Render Loop
     */
    public update(_delta: number, time: number): void {
        if (!this.isVisible) return;

        this.butterflies.forEach((b) => {
            const t = time * b.speed + b.phaseOffset;

            // 1. Chuyển động vỗ cánh hình sin
            const flap = Math.sin(time * b.flapSpeed + b.phaseOffset) * 0.75;
            b.wingLeft.rotation.y = flap;
            b.wingRight.rotation.y = -flap;

            // 2. Quỹ đạo bay lượn uốn khúc mềm mại ở không gian xa phía sau tờ giấy
            const targetX =
                b.basePos.x +
                Math.sin(t * 0.8) * b.orbitRadius.x +
                Math.sin(t * 1.9) * 0.3;

            const targetY =
                b.basePos.y +
                Math.sin(t * 1.2) * b.orbitRadius.y +
                Math.cos(t * 0.6) * 0.2;

            const targetZ =
                b.basePos.z +
                Math.cos(t * 0.7) * b.orbitRadius.z +
                Math.cos(t * 1.5) * 0.3;

            const dx = targetX - b.currentPos.x;
            const dy = targetY - b.currentPos.y;
            const dz = targetZ - b.currentPos.z;

            b.currentPos.set(targetX, targetY, targetZ);
            b.group.position.copy(b.currentPos);

            // Quay mặt theo hướng bay
            if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
                const heading = Math.atan2(dx, dz);
                b.group.rotation.y = heading + Math.PI;
                b.group.rotation.z = -dx * 1.5;
                b.group.rotation.x = dy * 1.2;
            }
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
