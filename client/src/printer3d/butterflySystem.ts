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
 * Hệ thống đàn bướm 3D tự nhiên dập dờn bay lượn quanh máy in và không gian bàn làm việc.
 * - Vỗ cánh nhịp nhàng theo chu kỳ hình sin.
 * - Quỹ đạo bay lượn lơ lửng, uốn lượn tự nhiên theo vector hướng bay.
 * - Cánh bướm 3D có độ bóng nhẹ và phát quang màu sắc rực rỡ.
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

    private createButterflyWingTexture(colorA: string, colorB: string, spotColor: string): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;

        // Nền cánh chuyển sắc
        const grad = ctx.createRadialGradient(20, 20, 5, 64, 64, 70);
        grad.addColorStop(0, colorA);
        grad.addColorStop(0.6, colorB);
        grad.addColorStop(1, '#050508');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);

        // Gân cánh bướm
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let a = 0; a < 6; a++) {
            ctx.moveTo(10, 10);
            ctx.quadraticCurveTo(40 + a * 12, 30 + a * 14, 110, 20 + a * 20);
        }
        ctx.stroke();

        // Chấm hoa văn cánh ngoài
        ctx.fillStyle = spotColor;
        for (let i = 0; i < 7; i++) {
            ctx.beginPath();
            ctx.arc(115 - i * 6, 25 + i * 14, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return texture;
    }

    private createFlock(): void {
        // Cấu hình các con bướm với màu sắc và quỹ đạo riêng biệt
        const butterflyConfigs = [
            {
                name: 'Morpho Blue',
                colorA: '#38bdf8',
                colorB: '#0284c7',
                spot: '#ffffff',
                basePos: new THREE.Vector3(-0.7, 0.65, 0.4),
                radius: { x: 0.55, y: 0.28, z: 0.6 },
                speed: 0.75,
                flapSpeed: 16,
                scale: 0.85,
            },
            {
                name: 'Amber Gold',
                colorA: '#fde047',
                colorB: '#d97706',
                spot: '#fffbeb',
                basePos: new THREE.Vector3(0.65, 0.8, 0.9),
                radius: { x: 0.65, y: 0.32, z: 0.55 },
                speed: 0.6,
                flapSpeed: 14,
                scale: 0.95,
            },
            {
                name: 'Emerald Teal',
                colorA: '#34d399',
                colorB: '#059669',
                spot: '#ecfdf5',
                basePos: new THREE.Vector3(0.1, 0.9, -0.1),
                radius: { x: 0.5, y: 0.3, z: 0.5 },
                speed: 0.85,
                flapSpeed: 18,
                scale: 0.8,
            },
            {
                name: 'Violet Dream',
                colorA: '#c084fc',
                colorB: '#7e22ce',
                spot: '#fdf4ff',
                basePos: new THREE.Vector3(-0.3, 0.75, 1.3),
                radius: { x: 0.6, y: 0.25, z: 0.65 },
                speed: 0.7,
                flapSpeed: 15,
                scale: 0.9,
            },
        ];

        // Hình dạng cánh bướm cong mềm mại (Butterfly Wing Shape)
        const wingShape = new THREE.Shape();
        wingShape.moveTo(0, 0);
        wingShape.bezierCurveTo(0.04, 0.08, 0.12, 0.11, 0.14, 0.05);
        wingShape.bezierCurveTo(0.15, -0.01, 0.09, -0.06, 0.06, -0.08);
        wingShape.bezierCurveTo(0.03, -0.09, 0.01, -0.05, 0, 0);

        const wingGeo = new THREE.ShapeGeometry(wingShape);
        wingGeo.center();
        // Dịch tâm xoay về mép cánh để khi vỗ cánh xoay quanh khớp thân
        wingGeo.translate(0.07, 0, 0);

        const bodyGeo = new THREE.CylinderGeometry(0.006, 0.004, 0.07, 8);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x111827,
            roughness: 0.6,
            metalness: 0.2,
        });

        butterflyConfigs.forEach((cfg, idx) => {
            const bGroup = new THREE.Group();

            const tex = this.createButterflyWingTexture(cfg.colorA, cfg.colorB, cfg.spot);
            const wingMat = new THREE.MeshStandardMaterial({
                map: tex,
                roughness: 0.35,
                metalness: 0.15,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.95,
            });

            // Thân bướm
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.rotation.x = Math.PI / 2;
            bGroup.add(body);

            // Cánh trái
            const wingLeftGroup = new THREE.Group();
            const wingLeft = new THREE.Mesh(wingGeo, wingMat);
            wingLeft.position.set(0.005, 0, 0);
            wingLeftGroup.add(wingLeft);
            bGroup.add(wingLeftGroup);

            // Cánh phải (đối xứng)
            const wingRightGroup = new THREE.Group();
            const wingRight = new THREE.Mesh(wingGeo, wingMat);
            wingRight.rotation.y = Math.PI;
            wingRight.position.set(-0.005, 0, 0);
            wingRightGroup.add(wingRight);
            bGroup.add(wingRightGroup);

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
                phaseOffset: idx * 1.85,
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
            const flap = Math.sin(time * b.flapSpeed + b.phaseOffset) * 0.72;
            b.wingLeft.rotation.y = flap;
            b.wingRight.rotation.y = -flap;

            // 2. Quỹ đạo bay lượn uốn khúc mềm mại (Lissajous curves)
            const targetX =
                b.basePos.x +
                Math.sin(t * 0.9) * b.orbitRadius.x +
                Math.sin(t * 2.1) * 0.12;

            const targetY =
                b.basePos.y +
                Math.sin(t * 1.4) * b.orbitRadius.y +
                Math.cos(t * 0.7) * 0.08;

            const targetZ =
                b.basePos.z +
                Math.cos(t * 0.75) * b.orbitRadius.z +
                Math.cos(t * 1.8) * 0.15;

            // Tính hướng di chuyển để đầu bướm hướng về phía trước
            const dx = targetX - b.currentPos.x;
            const dy = targetY - b.currentPos.y;
            const dz = targetZ - b.currentPos.z;

            b.currentPos.set(targetX, targetY, targetZ);
            b.group.position.copy(b.currentPos);

            // Bướm quay mặt theo hướng bay
            if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
                const heading = Math.atan2(dx, dz);
                b.group.rotation.y = heading + Math.PI;
                // Nghiêng mình (banking) khi lượn cua
                b.group.rotation.z = -dx * 1.8;
                b.group.rotation.x = dy * 1.5;
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
