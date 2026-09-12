import * as THREE from 'three';
import * as maplibregl from 'maplibre-gl';

export class LandmarkThreeLayer {
  constructor({ id = 'foshan-landmark-models', manifestUrl = './assets/landmarks/manifest.json', manifest = null } = {}) {
    this.id = id;
    this.type = 'custom';
    this.renderingMode = '3d';
    this.manifestUrl = manifestUrl;
    this.manifest = manifest;
    this.modelCount = 0;
  }

  async onAdd(map, gl) {
    this.map = map;
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x617080, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 2.8);
    sun.position.set(120, 180, 80);
    this.scene.add(sun);
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    await this.loadManifest();
  }

  async loadManifest() {
    try {
      let manifest = this.manifest;
      if (!manifest) {
        const response = await fetch(this.manifestUrl, { cache: 'no-cache' });
        if (!response.ok) return;
        manifest = await response.json();
      }
      const models = Array.isArray(manifest?.models) ? manifest.models : [];
      const needsReferenceFactory = models.some(model => model.generator);
      const referenceFactory = needsReferenceFactory ? await import('./referenceLandmarks.js') : null;
      await Promise.allSettled(models.map(model => this.loadModel(model, referenceFactory)));
      document.documentElement.dataset.landmarkModelsLoaded = String(this.modelCount);
      this.map?.triggerRepaint();
    } catch (error) {
      console.warn('Landmark manifest unavailable', error);
      document.documentElement.dataset.landmarkModelsLoaded = 'error';
    }
  }

  async loadModel(model, referenceFactory) {
    if (!Number.isFinite(model?.lon) || !Number.isFinite(model?.lat)) return;
    let root = null;
    if (model.generator) {
      root = referenceFactory?.buildReferenceLandmark(model.generator) || null;
    } else if (model.url) {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(model.url);
      root = gltf.scene;
    }
    if (!root) return;
    this.mountRoot(root, model);
  }

  mountRoot(root, model) {
    const origin = maplibregl.MercatorCoordinate.fromLngLat([model.lon, model.lat], model.altitude || 0);
    const meterScale = origin.meterInMercatorCoordinateUnits() * (model.scale ?? 1);
    const rotationX = new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(model.rotateX ?? 90));
    const rotationY = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(model.rotateY ?? 0));
    const rotationZ = new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(model.rotateZ ?? 0));
    const transform = new THREE.Matrix4()
      .makeTranslation(origin.x, origin.y, origin.z)
      .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
      .multiply(rotationX)
      .multiply(rotationY)
      .multiply(rotationZ);

    root.matrixAutoUpdate = false;
    root.matrix.copy(transform);
    root.userData.landmarkId = model.id;
    root.userData.fidelity = model.fidelity || 'unknown';
    root.traverse(object => {
      if (object.isMesh) {
        object.castShadow = false;
        object.receiveShadow = true;
      }
    });
    this.scene.add(root);
    this.modelCount++;
  }

  render(_gl, args) {
    if (!this.renderer || !this.camera) return;
    this.camera.projectionMatrix.fromArray(args.defaultProjectionData.mainMatrix);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    if (this.modelCount) this.map?.triggerRepaint();
  }

  onRemove() {
    this.scene?.traverse(object => {
      if (!object.isMesh) return;
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material?.dispose?.();
    });
    this.renderer?.dispose();
  }
}
