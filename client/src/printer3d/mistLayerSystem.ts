import * as THREE from 'three';

/**
 * Hệ thống lớp sương mù/mây trôi lững lờ (Parallax Drifting Mist)
 * Tạo chiều sâu không gian đa tầng (atmospheric depth) giữa máy in và phong cảnh núi non phía sau.
 */
export class MistLayerSystem {
    public group: THREE.Group;
    private mistPlanes: { mesh: THREE.Mesh; speed: number; startX: number; rangeX: number }[] = [];
    private isVisible = true;

    constructor() {
        this.group = new THREE.Group();
        this.group.name = 'MistLayerSystem';
        this.createMistLayers();
    }

    private createMistTexture(): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;

        // Đám mây sương chuyển sắc mềm
        const grad = ctx.createRadialGradient(256, 64, 10, 256, 64, 250);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
        grad.addColorStop(0.4, 'rgba(240, 248, 255, 0.25)');
        grad.addColorStop(0.8, 'rgba(224, 242, 254, 0.08)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 128);

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.MirroredRepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        return tex;
    }

    private createMistLayers(): void {
        const mistTex = this.createMistTexture();

        const configs = [
            { width: 9.0, height: 2.2, y: 1.4, z: -1.8, opacity: 0.22, speed: 0.035 },
            { width: 11.0, height: 2.6, y: 2.1, z: -2.1, opacity: 0.16, speed: 0.022 },
        ];

        configs.forEach((cfg, idx) => {
            const geo = new THREE.PlaneGeometry(cfg.width, cfg.height);
            const mat = new THREE.MeshBasicMaterial({
                map: mistTex,
                transparent: true,
                opacity: cfg.opacity,
                depthWrite: false,
                side: THREE.DoubleSide,
            });

            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set((idx - 0.5) * 1.5, cfg.y, cfg.z);
            this.group.add(mesh);

            this.mistPlanes.push({
                mesh,
                speed: cfg.speed,
                startX: mesh.position.x,
                rangeX: 6.0,
            });
        });
    }

    public update(delta: number): void {
        if (!this.isVisible) return;

        this.mistPlanes.forEach((p) => {
            p.mesh.position.x += delta * p.speed;
            if (p.mesh.position.x > p.startX + p.rangeX) {
                p.mesh.position.x = p.startX - p.rangeX;
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
