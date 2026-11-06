import * as THREE from 'three';
import { disposeObjectTree, halfExtents, seededRandom, smoothNoise } from './backdrop';

interface Leaf {
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
    depth: number;
    x: number;
    y: number;
    fallSpeed: number;
    swingFreq: number;
    swingAmp: number;
    windFactor: number;
    phase: number;
    spin: number;
    age: number;
}

const LEAF_COLORS: [string, string, string][] = [
    ['#9ccc5a', '#5f9a2e', '#3f6e1c'], // xanh non
    ['#c9d65a', '#8fae34', '#5d7a1f'], // xanh vàng
    ['#e7b347', '#c9822a', '#8a4e17'], // vàng úa
];

/**
 * Lá cây rơi trong gió (gắn vào camera, nằm phía sau tờ giấy):
 * - Lắc lư kiểu con lắc + gió giật chung cho cả khung cảnh nên trông như cùng một luồng gió.
 * - Rơi khỏi khung hình thì sinh lại ở mép trên/mép đón gió, mờ dần khi xuất hiện -> không bao giờ "bật" ra giữa màn hình.
 */
export class FallingLeavesSystem {
    public group = new THREE.Group();
    private camera: THREE.PerspectiveCamera;
    private leaves: Leaf[] = [];
    private textures: THREE.CanvasTexture[] = [];
    private geometry = new THREE.PlaneGeometry(0.075, 0.11);
    private random = seededRandom(777);
    private isVisible = true;
    private wind = 0;

    constructor(camera: THREE.PerspectiveCamera, count = 14) {
        this.camera = camera;
        this.group.name = 'FallingLeavesSystem';
        this.textures = LEAF_COLORS.map((c) => this.createLeafTexture(c));

        for (let i = 0; i < count; i++) {
            const material = new THREE.MeshBasicMaterial({
                map: this.textures[i % this.textures.length],
                transparent: true,
                alphaTest: 0.05,
                side: THREE.DoubleSide,
                depthWrite: false,
                opacity: 0,
            });
            const mesh = new THREE.Mesh(this.geometry, material);
            this.group.add(mesh);
            const leaf: Leaf = {
                mesh,
                material,
                depth: 0,
                x: 0,
                y: 0,
                fallSpeed: 0,
                swingFreq: 0,
                swingAmp: 0,
                windFactor: 0,
                phase: 0,
                spin: 0,
                age: 0,
            };
            this.respawn(leaf, true);
            this.leaves.push(leaf);
        }
    }

    private createLeafTexture([light, mid, dark]: [string, string, string]): THREE.CanvasTexture {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 96;
        const ctx = canvas.getContext('2d')!;

        ctx.beginPath();
        ctx.moveTo(32, 4);
        ctx.bezierCurveTo(56, 22, 58, 58, 32, 84);
        ctx.bezierCurveTo(6, 58, 8, 22, 32, 4);
        ctx.closePath();
        const grad = ctx.createLinearGradient(10, 10, 54, 80);
        grad.addColorStop(0, light);
        grad.addColorStop(0.55, mid);
        grad.addColorStop(1, dark);
        ctx.fillStyle = grad;
        ctx.fill();

        // Gân lá
        ctx.strokeStyle = 'rgba(255, 255, 240, 0.35)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(32, 8);
        ctx.lineTo(32, 92);
        for (let y = 22; y <= 70; y += 12) {
            ctx.moveTo(32, y + 6);
            ctx.lineTo(46, y - 2);
            ctx.moveTo(32, y + 6);
            ctx.lineTo(18, y - 2);
        }
        ctx.stroke();

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    private respawn(leaf: Leaf, initial: boolean): void {
        leaf.depth = 7.6 + this.random() * 3.6;
        const { halfW, halfH } = halfExtents(this.camera, leaf.depth);
        if (initial) {
            leaf.x = (this.random() * 2 - 1) * halfW;
            leaf.y = (this.random() * 2 - 1) * halfH;
        } else if (this.random() < 0.3) {
            // Một số lá bay vào từ mép đón gió
            leaf.x = (this.wind >= 0 ? -1 : 1) * (halfW + 0.2);
            leaf.y = (0.2 + this.random() * 0.8) * halfH;
        } else {
            leaf.x = (this.random() * 2 - 1) * halfW;
            leaf.y = halfH + 0.15 + this.random() * 0.4;
        }
        leaf.fallSpeed = 0.28 + this.random() * 0.22;
        leaf.swingFreq = 1.1 + this.random() * 0.9;
        leaf.swingAmp = 0.12 + this.random() * 0.14;
        leaf.windFactor = 0.7 + this.random() * 0.6;
        leaf.phase = this.random() * Math.PI * 2;
        leaf.spin = (this.random() - 0.5) * 1.2;
        leaf.age = 0;
        leaf.mesh.scale.setScalar(0.8 + this.random() * 0.6);
        leaf.material.opacity = initial ? 0.95 : 0;
    }

    public update(delta: number, time: number): void {
        if (!this.isVisible) return;
        const dt = Math.min(delta, 0.1);

        // Gió chung: thổi nhẹ sang phải, thỉnh thoảng có cơn giật
        this.wind = 0.12 + smoothNoise(time * 0.08, 4) * 0.22 + Math.max(0, smoothNoise(time * 0.21, 9)) * 0.25;

        for (const leaf of this.leaves) {
            leaf.age += dt;
            const swing = Math.sin(leaf.age * leaf.swingFreq + leaf.phase);
            const swingVel = Math.cos(leaf.age * leaf.swingFreq + leaf.phase);

            // Rơi chậm hơn khi đang ở đỉnh nhịp lắc (giống lá thật lượn)
            leaf.y -= leaf.fallSpeed * (0.6 + 0.4 * Math.abs(swingVel)) * dt;
            leaf.x += (this.wind * leaf.windFactor + swingVel * leaf.swingAmp * leaf.swingFreq) * dt;

            leaf.mesh.position.set(leaf.x, leaf.y, -leaf.depth);
            leaf.mesh.rotation.set(
                0.5 + swing * 0.55,
                Math.sin(leaf.age * 0.7 + leaf.phase) * 0.6,
                -swingVel * 0.7 + leaf.spin * leaf.age * 0.3
            );

            // Hiện dần khi mới sinh ra
            leaf.material.opacity = Math.min(0.95, leaf.material.opacity + dt * 0.8);

            const { halfW, halfH } = halfExtents(this.camera, leaf.depth);
            if (leaf.y < -halfH - 0.3 || Math.abs(leaf.x) > halfW + 0.5) {
                this.respawn(leaf, false);
            }
        }
    }

    public setVisible(visible: boolean): void {
        this.isVisible = visible;
        this.group.visible = visible;
    }

    public dispose(): void {
        disposeObjectTree(this.group);
        this.textures.forEach((t) => t.dispose());
        this.leaves = [];
    }
}
