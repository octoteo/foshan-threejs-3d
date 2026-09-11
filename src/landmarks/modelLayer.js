import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { lonLatToWorld } from '../geo.js';

export class LandmarkModelLayer {
  constructor({ scene, originLon, originLat, terrain }) {
    this.scene = scene;
    this.originLon = originLon;
    this.originLat = originLat;
    this.terrain = terrain;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.loader = new GLTFLoader();
    this.loaded = [];
  }

  async loadManifest(url = './assets/landmarks/manifest.json') {
    try {
      const response = await fetch(url);
      if (!response.ok) return [];
      const manifest = await response.json();
      for (const item of manifest.models || []) await this.loadModel(item);
      return this.loaded;
    } catch {
      return [];
    }
  }

  async loadModel(item) {
    if (!item?.url || !Number.isFinite(item.lon) || !Number.isFinite(item.lat)) return;
    const gltf = await this.loader.loadAsync(item.url);
    const world = lonLatToWorld(item.lon, item.lat, this.originLon, this.originLat);
    const base = this.terrain.sampleHeight(item.lon, item.lat);
    gltf.scene.position.set(world.x, base + (item.altitudeOffset || 0), world.z);
    gltf.scene.rotation.y = THREE.MathUtils.degToRad(item.rotationDeg || 0);
    gltf.scene.scale.setScalar(item.scale || 1);
    gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.root.add(gltf.scene);
    this.loaded.push(item.id || item.url);
  }
}
