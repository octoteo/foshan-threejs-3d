import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MATERIALS = Object.freeze({
  stone: { color: 0xaaa59b, roughness: 0.82, metalness: 0.0 },
  darkstone: { color: 0x5d6262, roughness: 0.78, metalness: 0.0 },
  white: { color: 0xe5e6e2, roughness: 0.46, metalness: 0.03 },
  roofwhite: { color: 0xf0f0eb, roughness: 0.38, metalness: 0.02 },
  concrete: { color: 0xb7b8b4, roughness: 0.74, metalness: 0.0 },
  steel: { color: 0x8f989e, roughness: 0.28, metalness: 0.78 },
  glass: { color: 0x527d91, roughness: 0.18, metalness: 0.10, transparent: true, opacity: 0.88 },
  glassdark: { color: 0x243e4b, roughness: 0.20, metalness: 0.12 },
  brick: { color: 0x85412f, roughness: 0.9, metalness: 0.0 },
  brickdark: { color: 0x5c2c22, roughness: 0.92, metalness: 0.0 },
  wood: { color: 0x503324, roughness: 0.84, metalness: 0.0 },
  red: { color: 0x912a20, roughness: 0.72, metalness: 0.0 },
  gold: { color: 0xb78a30, roughness: 0.42, metalness: 0.30 },
  greenroof: { color: 0x356044, roughness: 0.60, metalness: 0.0 },
  yellowroof: { color: 0xb67929, roughness: 0.58, metalness: 0.0 },
  grass: { color: 0x35683f, roughness: 0.96, metalness: 0.0 },
  track: { color: 0x8c493d, roughness: 0.90, metalness: 0.0 },
  black: { color: 0x242829, roughness: 0.78, metalness: 0.0 },
  water: { color: 0x35667f, roughness: 0.15, metalness: 0.08, transparent: true, opacity: 0.78 }
});

function standardMaterial(spec) {
  return new THREE.MeshStandardMaterial({
    color: spec.color,
    roughness: spec.roughness,
    metalness: spec.metalness,
    transparent: spec.transparent || false,
    opacity: spec.opacity ?? 1,
    side: THREE.DoubleSide
  });
}

function normalizedGeometry(geometry) {
  let result = geometry.index ? geometry.toNonIndexed() : geometry;
  if (result !== geometry) geometry.dispose();
  if (!result.getAttribute('normal')) result.computeVertexNormals();
  for (const key of Object.keys(result.attributes)) {
    if (key !== 'position' && key !== 'normal') result.deleteAttribute(key);
  }
  return result;
}

class ModelBuilder {
  constructor(id) {
    this.id = id;
    this.batches = new Map();
  }
  add(geometry, material = 'white') {
    if (!geometry) return;
    const normalized = normalizedGeometry(geometry);
    if (!this.batches.has(material)) this.batches.set(material, []);
    this.batches.get(material).push(normalized);
  }
  box(width, depth, height, x = 0, z = 0, y = height / 2, material = 'concrete') {
    const g = new THREE.BoxGeometry(width, height, depth);
    g.translate(x, y, z);
    this.add(g, material);
  }
  cylinder(radius, height, x = 0, z = 0, y = height / 2, material = 'steel', sections = 18) {
    const g = new THREE.CylinderGeometry(radius, radius, height, sections, 1, false);
    g.translate(x, y, z);
    this.add(g, material);
  }
  cylinderBetween(a, b, radius = 0.2, material = 'steel', sections = 8) {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start);
    const length = direction.length();
    if (length < 1e-5) return;
    const g = new THREE.CylinderGeometry(radius, radius, length, sections, 1, false);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    g.applyQuaternion(q);
    g.translate(...start.clone().add(end).multiplyScalar(0.5).toArray());
    this.add(g, material);
  }
  torus(major, minor, y = 0, material = 'steel', radialSegments = 8, tubularSegments = 96) {
    const g = new THREE.TorusGeometry(major, minor, radialSegments, tubularSegments);
    g.rotateX(Math.PI / 2);
    g.translate(0, y, 0);
    this.add(g, material);
  }
  ring(inner, outer, y = 0, material = 'concrete', segments = 128) {
    const g = new THREE.RingGeometry(inner, outer, segments, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    this.add(g, material);
  }
  finalize() {
    const group = new THREE.Group();
    let triangles = 0;
    for (const [name, geometries] of this.batches) {
      const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
      if (!merged) continue;
      if (geometries.length > 1) geometries.forEach(g => g.dispose());
      triangles += merged.getAttribute('position').count / 3;
      const mesh = new THREE.Mesh(merged, standardMaterial(MATERIALS[name] || MATERIALS.white));
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    group.userData.referenceReconstruction = true;
    group.userData.triangles = Math.round(triangles);
    group.userData.materialBatches = group.children.length;
    return group;
  }
}

function trianglePrism(points, thickness = 0.55) {
  const vertices = [];
  for (const p of points) vertices.push(p[0], p[1], p[2]);
  for (const p of points) vertices.push(p[0], p[1] - thickness, p[2]);
  const faces = [0,1,2, 5,4,3, 0,3,4, 0,4,1, 1,4,5, 1,5,2, 2,5,3, 2,3,0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setIndex(faces);
  g.computeVertexNormals();
  return g;
}

function ellipseRing(builder, rx, rz, y, tube = 0.18, material = 'steel', segments = 64) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = Math.PI * 2 * i / segments;
    pts.push([rx * Math.cos(a), y, rz * Math.sin(a)]);
  }
  for (let i = 0; i < segments; i++) builder.cylinderBetween(pts[i], pts[(i + 1) % segments], tube, material, 6);
}

function domeGeometry(rx, rz, height, baseY = 0, lonSegments = 48, latSegments = 14) {
  const vertices = [];
  const indices = [];
  for (let j = 0; j <= latSegments; j++) {
    const phi = Math.PI * 0.5 * j / latSegments;
    const r = Math.sin(phi);
    const y = baseY + height * Math.cos(phi);
    for (let i = 0; i < lonSegments; i++) {
      const a = Math.PI * 2 * i / lonSegments;
      vertices.push(rx * r * Math.cos(a), y, rz * r * Math.sin(a));
    }
  }
  for (let j = 0; j < latSegments; j++) {
    for (let i = 0; i < lonSegments; i++) {
      const ni = (i + 1) % lonSegments;
      const a = j * lonSegments + i;
      const b = j * lonSegments + ni;
      const c = (j + 1) * lonSegments + ni;
      const d = (j + 1) * lonSegments + i;
      indices.push(a,b,c, a,c,d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function hipRoof(builder, x, z, width, depth, eaveY, ridgeY, material = 'greenroof', overhang = 0.8) {
  const w = width / 2 + overhang;
  const d = depth / 2 + overhang;
  const ridgeHalf = Math.max(0, w - d * 0.55);
  const p = [
    [x-w,eaveY,z-d],[x+w,eaveY,z-d],[x+w,eaveY,z+d],[x-w,eaveY,z+d],
    [x-ridgeHalf,ridgeY,z],[x+ridgeHalf,ridgeY,z]
  ];
  const indices = [0,1,5, 0,5,4, 3,4,5, 3,5,2, 0,4,3, 1,2,5];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p.flat(), 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  builder.add(g, material);
  builder.cylinderBetween(p[4], p[5], 0.18, 'gold', 6);
  for (const [a,b] of [[0,1],[1,2],[2,3],[3,0]]) builder.cylinderBetween(p[a], p[b], 0.11, 'gold', 6);
}

function arcTube(builder, centerX, radius, baseY, z, tube = 0.32, material = 'darkstone', segments = 24) {
  let prev = null;
  for (let i = 0; i <= segments; i++) {
    const a = Math.PI * i / segments;
    const p = [centerX + radius * Math.cos(a), baseY + radius * Math.sin(a), z];
    if (prev) builder.cylinderBetween(prev, p, tube, material, 6);
    prev = p;
  }
}

function addDome(builder, x, z, rx, rz, height, baseY, main = false) {
  const dome = domeGeometry(rx, rz, height, baseY, 56, 16);
  dome.translate(x, 0, z);
  builder.add(dome, 'white');
  for (let k = 0; k < 16; k++) {
    const a = Math.PI * 2 * k / 16;
    let prev = null;
    for (let j = 0; j < 14; j++) {
      const phi = Math.PI * 0.5 * j / 13;
      const p = [x + rx * Math.sin(phi) * Math.cos(a), baseY + height * Math.cos(phi) + 0.25, z + rz * Math.sin(phi) * Math.sin(a)];
      if (prev) builder.cylinderBetween(prev, p, main ? 0.20 : 0.15, 'steel', 6);
      prev = p;
    }
  }
  for (const fraction of [0.25,0.48,0.70,0.86]) {
    const phi = Math.asin(fraction);
    ellipseRing(builder, rx * fraction, rz * fraction, baseY + height * Math.cos(phi) + 0.2, main ? 0.17 : 0.12, 'steel', 56);
    const lastBatch = builder.batches.get('steel');
    for (let i = lastBatch.length - 56; i < lastBatch.length; i++) lastBatch[i].translate(x, 0, z);
  }
}

function centuryLotus() {
  const b = new ModelBuilder('century-lotus');
  b.ring(72,145,3,'concrete',160);
  b.ring(68,137,7,'stone',160);
  b.ring(70,125,12,'darkstone',160);
  b.ring(65,112,15,'concrete',160);
  b.box(105,70,0.35,0,0,10.3,'grass');
  b.ring(54,63,10.5,'track',128);
  b.torus(154.5,0.9,46.5,'steel',8,160);
  b.torus(137.5,1.1,8.5,'steel',8,160);
  b.torus(68.5,0.55,27,'steel',6,128);
  const petals = 40;
  const half = Math.PI / petals;
  for (let i = 0; i < petals; i++) {
    const a = Math.PI * 2 * i / petals;
    const p1 = [154*Math.cos(a-half*0.88),46,154*Math.sin(a-half*0.88)];
    const p2 = [154*Math.cos(a+half*0.88),46,154*Math.sin(a+half*0.88)];
    const p3 = [69*Math.cos(a),27,69*Math.sin(a)];
    b.add(trianglePrism([p1,p2,p3],0.65),'roofwhite');
    const foot = [138*Math.cos(a),5.5,138*Math.sin(a)];
    const left = [153*Math.cos(a-half*0.72),44.5,153*Math.sin(a-half*0.72)];
    const right = [153*Math.cos(a+half*0.72),44.5,153*Math.sin(a+half*0.72)];
    b.cylinderBetween(foot,left,1.05,'white',10);
    b.cylinderBetween(foot,right,1.05,'white',10);
    b.cylinderBetween([70*Math.cos(a),25,70*Math.sin(a)],[153*Math.cos(a),46,153*Math.sin(a)],0.34,'steel',8);
    b.cylinderBetween([143*Math.cos(a),5,143*Math.sin(a)],[143*Math.cos(a),18,143*Math.sin(a)],0.44,'concrete',8);
  }
  return b.finalize();
}

function lingnanPearl() {
  const b = new ModelBuilder('lingnan-pearl');
  b.box(210,160,1.2,0,0,0.6,'stone');
  addDome(b,0,28,64.2,61,35.48,2,true);
  addDome(b,-56,-38,39.2,37,26.4,2,false);
  addDome(b,56,-38,39.2,37,26.4,2,false);
  b.cylinder(57,7,0,28,5.5,'glassdark',56);
  b.cylinder(33,5,-56,-38,4.5,'glassdark',40);
  b.cylinder(33,5,56,-38,4.5,'glassdark',40);
  b.box(112,18,5,0,-8,4,'glass');
  for (let i=0;i<20;i++) {
    const x=-94+188*i/19;
    b.cylinderBetween([x,2,-48],[x,9,-48],0.22,'steel',6);
  }
  return b.finalize();
}

function shunfengGate() {
  const b = new ModelBuilder('shunfeng-gate');
  b.box(94,28,1.4,0,0,0.7,'stone');
  for (const x of [-43,-24,24,43]) {
    b.box(6.5,10,20,x,0,10,'stone');
    b.box(8.3,12,1.0,x,0,3.2,'darkstone');
    b.box(8.0,11.5,1.0,x,0,17.5,'darkstone');
  }
  b.box(54,10,5,0,0,22,'stone');
  b.box(94,10,3.8,0,0,19.5,'stone');
  for (const z of [-5.2,5.2]) {
    arcTube(b,0,17.5,8,z,0.5,'darkstone');
    arcTube(b,-33.5,9,8.8,z,0.42,'darkstone');
    arcTube(b,33.5,9,8.8,z,0.42,'darkstone');
  }
  for (const z of [-6.3,6.3]) for (const x of [-40,-30,-20,-7,7,20,30,40]) {
    b.cylinder(0.55,12,x,z,18,'darkstone',10);
    b.cylinder(0.78,0.7,x,z,12.2,'gold',10);
  }
  hipRoof(b,0,0,48,15,25,31,'yellowroof',1.4);
  hipRoof(b,0,0,34,13,30.4,36.8,'greenroof',1.2);
  for (const x of [-32,32]) {
    hipRoof(b,x,0,27,14,22,28.2,'yellowroof',1.2);
    hipRoof(b,x,0,20,12,27.4,32.6,'greenroof',1.0);
  }
  for (const x of [-43,-24,24,43]) hipRoof(b,x,0,12,11,18.5,22.8,'yellowroof',0.7);
  b.box(18,1,4.3,0,-5.6,26,'darkstone');
  b.box(16,0.35,2.8,0,-6.15,26.2,'gold');
  for (const x of [-34,34]) b.box(11,0.45,3,x,-5.6,22.4,'darkstone');
  return b.finalize();
}

function nanfengKiln() {
  const b = new ModelBuilder('nanfeng-kiln');
  const length = 34.4;
  const segments = 14;
  const segment = length / segments;
  for (let i=0;i<segments;i++) {
    const z=-length/2+(i+0.5)*segment;
    const y=1+i*0.42;
    b.box(7.4,segment*1.04,2.4,0,z,y,'brick');
    b.cylinderBetween([-3.3,y+1.35,z-segment*0.45],[-3.3,y+1.35,z+segment*0.45],0.2,'brickdark',6);
    b.cylinderBetween([3.3,y+1.35,z-segment*0.45],[3.3,y+1.35,z+segment*0.45],0.2,'brickdark',6);
    if (i%2===0) {
      b.box(0.45,0.65,0.8,-3.75,z,y+0.4,'black');
      b.box(0.45,0.65,0.8,3.75,z,y+0.4,'black');
    }
  }
  b.cylinderBetween([0,2.8,-17.2],[0,8.5,17.2],0.45,'brickdark',8);
  b.cylinder(1.85,27,-11,5,13.5,'brick',24);
  for (const y of [2.5,7,11.5,16,20.5,25]) {
    const g = new THREE.TorusGeometry(1.9,0.16,6,28); g.rotateX(Math.PI/2); g.translate(-11,y,5); b.add(g,'brickdark');
  }
  for (const [x,z,w,d,h] of [[-17,-7,15,10,5],[16,-9,18,11,5.5],[17,7,15,10,5],[-18,12,14,9,4.8]]) {
    b.box(w,d,h,x,z,h/2,'brick');
    hipRoof(b,x,z,w,d,h,h+3.1,'wood',0.8);
  }
  for (const x of [-3.4,3.4]) for (const z of [22,28]) b.cylinder(0.32,5,x,z,2.5,'red',10);
  hipRoof(b,0,25,10,9,5,9.8,'greenroof',1.0);
  for (let i=0;i<12;i++) b.box(5.5,2.1,0.45,9.5,-14+i*2.3,0.25+i*0.24,'stone');
  return b.finalize();
}

function latticeFace(builder, cx, cz, cy, width, depth, height, face, spacing = 3.2) {
  if (face === 'front' || face === 'back') {
    const z = cz + (depth/2 + 0.18) * (face === 'front' ? 1 : -1);
    for (let x=-width/2-height; x<width/2; x+=spacing) {
      const x0=Math.max(-width/2,x), x1=Math.min(width/2,x+height);
      if (x1-x0<0.5) continue;
      builder.cylinderBetween([cx+x0,cy-height/2+(x0-x),z],[cx+x1,cy-height/2+(x1-x),z],0.16,'white',5);
      builder.cylinderBetween([cx+x0,cy+height/2-(x0+width/2),z],[cx+x1,cy+height/2-(x1+width/2),z],0.16,'white',5);
    }
  } else {
    const x = cx + (width/2 + 0.18) * (face === 'right' ? 1 : -1);
    for (let z0=-depth/2-height; z0<depth/2; z0+=spacing) {
      const a=Math.max(-depth/2,z0), c=Math.min(depth/2,z0+height);
      if (c-a<0.5) continue;
      builder.cylinderBetween([x,cy-height/2+(a-z0),cz+a],[x,cy-height/2+(c-z0),cz+c],0.16,'white',5);
    }
  }
}

function foshanGrandTheatre() {
  const b = new ModelBuilder('foshan-grand-theatre');
  b.box(72,58,1,0,0,0.5,'stone');
  b.box(56,42,5,0,0,2.8,'glassdark');
  const boxes = [
    [-17,-6,18,17,10,8], [2,-8,20,18,11,9], [20,-4,17,16,10,8],
    [-10,5,17,16,10,16], [9,5,17,16,10,18], [1,4,15,14,9,25],
    [-3,3,13,12,8,32], [12,2,11,10,8,27], [-15,1,11,10,8,24]
  ];
  for (const [x,z,w,d,h,y] of boxes) {
    b.box(w,d,h,x,z,y,'glass');
    for (const face of ['front','back','left','right']) latticeFace(b,x,z,y,w,d,h,face,3.0);
    const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2,y0=y-h/2,y1=y+h/2;
    for (const xx of [x0,x1]) for (const zz of [z0,z1]) b.cylinderBetween([xx,y0,zz],[xx,y1,zz],0.22,'white',6);
    for (const yy of [y0,y1]) {
      b.cylinderBetween([x0,yy,z0],[x1,yy,z0],0.22,'white',6); b.cylinderBetween([x0,yy,z1],[x1,yy,z1],0.22,'white',6);
      b.cylinderBetween([x0,yy,z0],[x0,yy,z1],0.22,'white',6); b.cylinderBetween([x1,yy,z0],[x1,yy,z1],0.22,'white',6);
    }
  }
  b.box(78,18,0.18,0,-29,0.12,'water');
  for (const z of [-22,-18,-14]) b.box(50,2,0.25,0,z,0.2,'stone');
  return b.finalize();
}

const GENERATORS = Object.freeze({
  centuryLotus,
  lingnanPearl,
  shunfengGate,
  nanfengKiln,
  foshanGrandTheatre
});

export function buildReferenceLandmark(id) {
  const factory = GENERATORS[id];
  if (!factory) throw new Error(`Unknown reference landmark generator: ${id}`);
  const group = factory();
  group.name = `reference:${id}`;
  group.userData.generator = id;
  return group;
}

export const REFERENCE_LANDMARK_IDS = Object.freeze(Object.keys(GENERATORS));
