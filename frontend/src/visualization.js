import * as THREE from "three";

let scene;
let camera;
let renderer;
let ringGroup;
let frameId;

const baseColors = ["#29f3c3", "#6aa9ff", "#ff784f", "#f8d66d", "#8a7dff"];
const ringConfig = {
  baseRadius: 1.25,
  radiusStep: 0.3,
  thickness: 0.09,
  segments: 280
};

function colorForPercent(percent, index) {
  const base = new THREE.Color(baseColors[index % baseColors.length]);
  const hot = new THREE.Color("#ff3b3b");
  return base.lerp(hot, Math.min(percent / 100, 1));
}

function clearRings() {
  if (!ringGroup) {
    return;
  }
  const rings = ringGroup.children.filter((child) => child.userData.isRing);
  rings.forEach((ring) => {
    ring.geometry?.dispose?.();
    ring.material?.dispose?.();
    ringGroup.remove(ring);
  });
}

export function initVisualization(container) {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 0.95, 3.4);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  ringGroup = new THREE.Group();
  scene.add(ringGroup);

  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const point = new THREE.PointLight(0x6aa9ff, 0.95, 18);
  point.position.set(3.2, 3.6, 3.2);
  scene.add(point);

  const rim = new THREE.DirectionalLight(0xffffff, 0.7);
  rim.position.set(-3, 2.4, 2.6);
  scene.add(rim);

  const coreGeometry = new THREE.SphereGeometry(0.42, 40, 40);
  const coreMaterial = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    emissive: "#29f3c3",
    emissiveIntensity: 0.18,
    roughness: 0.15,
    metalness: 0.9
  });
  const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
  ringGroup.add(coreMesh);
  ringGroup.position.y = 0.02;

  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  window.addEventListener("resize", resize);
  resize();

  const animate = () => {
    frameId = requestAnimationFrame(animate);
    ringGroup.rotation.y += 0.0014;
    ringGroup.rotation.x = Math.sin(Date.now() * 0.0002) * 0.12;
    renderer.render(scene, camera);
  };
  animate();
}

export function updateRings(disks) {
  if (!scene || !ringGroup) {
    return;
  }

  clearRings();
  if (!disks || disks.length === 0) {
    return;
  }

  const centerOffset = (disks.length - 1) * 0.1;
  disks.forEach((disk, index) => {
    const radius = ringConfig.baseRadius + index * ringConfig.radiusStep;
    const ringThickness = ringConfig.thickness;
    const yOffset = index * 0.18 - centerOffset;

    const baseGeometry = new THREE.TorusGeometry(
      radius,
      ringThickness,
      36,
      ringConfig.segments,
      Math.PI * 2
    );
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: "#1b2436",
      emissive: "#0b101c",
      emissiveIntensity: 0.25,
      roughness: 0.5,
      metalness: 0.3,
      transparent: true,
      opacity: 0.5
    });
    const baseRing = new THREE.Mesh(baseGeometry, baseMaterial);
    baseRing.rotation.x = Math.PI / 2.1;
    baseRing.position.y = yOffset;
    baseRing.userData.isRing = true;
    ringGroup.add(baseRing);

    const usageArc = Math.max(0.02, (disk.percent / 100) * Math.PI * 2);
    const usageGeometry = new THREE.TorusGeometry(
      radius,
      ringThickness,
      36,
      ringConfig.segments,
      usageArc
    );
    const usageMaterial = new THREE.MeshStandardMaterial({
      color: colorForPercent(disk.percent, index),
      emissive: "#0c2a27",
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.8
    });
    const usageRing = new THREE.Mesh(usageGeometry, usageMaterial);
    usageRing.rotation.x = Math.PI / 2.1;
    usageRing.rotation.z = -Math.PI / 2;
    usageRing.position.y = yOffset;
    usageRing.userData.isRing = true;
    ringGroup.add(usageRing);

    const railGeometry = new THREE.TorusGeometry(radius, ringThickness * 0.25, 24, 200, Math.PI * 2);
    const railMaterial = new THREE.MeshStandardMaterial({
      color: "#0f1626",
      emissive: "#0a0f1c",
      emissiveIntensity: 0.2,
      roughness: 0.35,
      metalness: 0.4,
      transparent: true,
      opacity: 0.65
    });
    const railRing = new THREE.Mesh(railGeometry, railMaterial);
    railRing.rotation.x = Math.PI / 2.1;
    railRing.position.y = yOffset - ringThickness * 0.35;
    railRing.userData.isRing = true;
    ringGroup.add(railRing);
  });
}

export function disposeVisualization() {
  if (frameId) {
    cancelAnimationFrame(frameId);
  }
  if (renderer) {
    renderer.dispose();
  }
}
