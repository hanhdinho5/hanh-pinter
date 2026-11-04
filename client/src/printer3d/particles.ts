import * as THREE from 'three';

interface Particle {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    maxLife: number;
    size: number;
    color: THREE.Color;
}

/**
 * Hệ thống hiệu ứng hạt hào quang ánh kim & pháo hoa vàng (Gold Sparkles & VIP Confetti)
 */
export class SparkleParticleSystem {
    public pointsMesh: THREE.Points;
    private geometry: THREE.BufferGeometry;
    private material: THREE.PointsMaterial;
    private particles: Particle[] = [];
    private maxParticles = 300;

    private posArray: Float32Array;
    private colorArray: Float32Array;
    private sizeArray: Float32Array;

    constructor(scene: THREE.Scene) {
        this.geometry = new THREE.BufferGeometry();

        this.posArray = new Float32Array(this.maxParticles * 3);
        this.colorArray = new Float32Array(this.maxParticles * 3);
        this.sizeArray = new Float32Array(this.maxParticles);

        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.posArray, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colorArray, 3));

        // Tạo texture hình ngôi sao / đốm sáng lấp lánh bằng Canvas 2D
        const texture = this.createSparkleTexture();

        this.material = new THREE.PointsMaterial({
            size: 0.18,
            map: texture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            vertexColors: true,
        });

        this.pointsMesh = new THREE.Points(this.geometry, this.material);
        this.pointsMesh.frustumCulled = false;
        scene.add(this.pointsMesh);
    }

    /**
     * Tạo texture hình ngôi sao 4 cánh lấp lánh
     */
    private createSparkleTexture(): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;

        const cx = 32;
        const cy = 32;

        // Quầng sáng tròn trung tâm
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.2, 'rgba(254, 240, 138, 0.9)');
        grad.addColorStop(0.6, 'rgba(245, 158, 11, 0.4)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);

        // Tia sáng 4 cánh (Cross star rays)
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx, 4);
        ctx.lineTo(cx, 60);
        ctx.moveTo(4, cy);
        ctx.lineTo(60, cy);
        ctx.stroke();

        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }

    /**
     * Bùng nổ hạt vàng khi in xong khung vàng VIP
     */
    public burstGoldSparkles(origin: THREE.Vector3, count = 45): void {
        const goldColors = [
            new THREE.Color(0xfff59d), // Vàng nhạt chói
            new THREE.Color(0xfbc02d), // Vàng óng
            new THREE.Color(0xffa000), // Vàng cam
            new THREE.Color(0xffffff), // Trắng kim cương
        ];

        for (let i = 0; i < count; i++) {
            if (this.particles.length >= this.maxParticles) {
                this.particles.shift(); // Loại bỏ hạt cũ nhất
            }

            const angle = Math.random() * Math.PI * 2;
            const speed = 0.8 + Math.random() * 1.6;
            const upwardSpeed = 1.2 + Math.random() * 2.2;

            const color = goldColors[Math.floor(Math.random() * goldColors.length)];

            this.particles.push({
                x: origin.x + (Math.random() - 0.5) * 0.4,
                y: origin.y + 0.1,
                z: origin.z + (Math.random() - 0.5) * 0.4,
                vx: Math.cos(angle) * speed * 0.6,
                vy: upwardSpeed,
                vz: Math.sin(angle) * speed * 0.6,
                life: 0,
                maxLife: 1.0 + Math.random() * 0.8,
                size: 0.12 + Math.random() * 0.14,
                color,
            });
        }
    }

    /**
     * Mưa hạt pháo hoa hoàng gia cho Trang đặc biệt (Full Page VIP)
     */
    public burstGrandCelebration(origin: THREE.Vector3): void {
        this.burstGoldSparkles(origin, 90);
    }

    /**
     * Cập nhật chuyển động và tan biến hạt theo thời gian
     */
    public update(delta: number): void {
        const gravity = -3.2;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life += delta;

            if (p.life >= p.maxLife) {
                this.particles.splice(i, 1);
                continue;
            }

            // Vật lý trọng lực & cản gió nhẹ
            p.vy += gravity * delta;
            p.vx *= 0.96;
            p.vz *= 0.96;

            p.x += p.vx * delta;
            p.y += p.vy * delta;
            p.z += p.vz * delta;

            // Chạm mặt bàn thì nảy nhẹ
            if (p.y < 0.03) {
                p.y = 0.03;
                p.vy = -p.vy * 0.35;
            }
        }

        // Cập nhật BufferGeometry
        const count = this.particles.length;
        for (let i = 0; i < this.maxParticles; i++) {
            const i3 = i * 3;
            if (i < count) {
                const p = this.particles[i];
                const lifeRatio = 1 - p.life / p.maxLife;

                this.posArray[i3] = p.x;
                this.posArray[i3 + 1] = p.y;
                this.posArray[i3 + 2] = p.z;

                // Màu mờ dần theo tuổi thọ hạt
                this.colorArray[i3] = p.color.r * lifeRatio;
                this.colorArray[i3 + 1] = p.color.g * lifeRatio;
                this.colorArray[i3 + 2] = p.color.b * lifeRatio;

                this.sizeArray[i] = p.size * lifeRatio;
            } else {
                this.posArray[i3] = 0;
                this.posArray[i3 + 1] = -100; // Ẩn khỏi màn hình
                this.posArray[i3 + 2] = 0;
                this.sizeArray[i] = 0;
            }
        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
    }

    public dispose(): void {
        this.geometry.dispose();
        this.material.dispose();
    }
}

