import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LANDMARK_MODEL_MANIFEST } from '../config.js';
import { lonLatToWorld } from '../geo.js';

export class LandmarkModelLayer {
  constructor({ scene, originLon, originLat, terrain }) {
    this.originLon = originLon;
    this.originLat = originLat;
    this.terrain = terrain;
    this.root = new THREE.Group();
    this.root.name = 'landmark-models';
    scene.add(this.root);
    this.loader = new GLTFLoader();
    this.loaded = [];
    this.failed = [];
    this.manifest = null;
  }

  async loadManifest(url = LANDMARK_MODEL_MANIFEST) {
    try {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) return [];
      this.manifest = await response.json();
      for (const item of this.manifest.models || []) {
        try { await this.loadModel(item); }
        catch (error) {
          this.failed.push({ id: item?.id || item?.url, error: error?.message || String(error) });
          console.warn('Landmark GLB failed', item?.id || item?.url, error);
        }
      }
    } catch (error) {
      this.failed.push({ id: 'manifest', error: error?.message || String(error) });
    }
    return this.loaded;
  }

  async loadModel(item) {
    if (!item?.url || !Number.isFinite(item.lon) || !Number.isFinite(item.lat)) return;
    const gltf = await this.loader.loadAsync(item.url);
    const world = lonLatToWorld(item.lon, item.lat, this.originLon, this.originLat);
    const base = this.terrain.sampleHeight(item.lon, item.lat);
    gltf.scene.position.set(world.x, base + (Number(item.altitudeOffset) || 0), world.z);
    gltf.scene.rotation.y = THREE.MathUtils.degToRad(Number(item.rotationDeg) || 0);
    gltf.scene.scale.setScalar(Number(item.scale) || 1);
    gltf.scene.userData.landmark = item;
    gltf.scene.traverse(object => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    this.root.add(gltf.scene);
    this.loaded.push(item.id || item.url);
  }

  getStatus() {
    return { loaded: this.loaded.length, failed: this.failed.length, license: this.manifest?.license || null };
  }
}
