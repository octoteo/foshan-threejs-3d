# 佛山数字城市 · Stage 2

一个以 **MapLibre GL JS + Overture Maps + PMTiles + Three.js** 构建的佛山 2D/3D 一体数字城市底座。

Stage 2 不再把项目定义成“Three.js 拉伸建筑 Demo”。默认入口是一张真正的城市地图：道路、水系、地名、卫星影像、真实建筑 footprint 和地形处在同一套 WGS84/Web Mercator 坐标中；普通建筑交给 MapLibre worker + GPU 渲染，Three.js 只承担需要更高几何自由度的精细地标层。

## 已交付

- **2D / 3D 同一地图无缝切换**：2D 查看完整地图结构，3D 开启真实地形和建筑 extrusion。
- **真实道路与铁路**：直接读取 Overture `transportation.pmtiles`，按真实 segment geometry 与道路等级绘制。
- **真实河流 / 湖泊 / 水系**：直接读取 Overture `base.pmtiles` 的 `water` geometry。
- **地图标签 / POI 补充**：OpenFreeMap / OpenMapTiles 样式作为开放地图标签与背景表达层。
- **卫星底图**：默认 EOX Sentinel-2 2016，无付费 Key。
- **城市建筑**：Overture `buildings.pmtiles`，2D footprint + 3D `fill-extrusion`；`height → num_floors × 3.2m → 视觉兜底`。
- **真实地形**：Mapzen Terrarium DEM。
- **MapLibre v6 Worker 固定打包**：Vite 显式打包 `maplibre-gl-worker.mjs`，避免矢量源静默不加载。
- **首批 5 个独立精细参考重建**：世纪莲体育场、岭南明珠体育馆、顺峰山公园牌坊、南风古灶、佛山大剧院。
- **12 个重点地标导航目标**：未完成精细资产的地标继续明确标记为规划目标。
- **Three.js Custom Layer**：精细地标与未来合法 GLB 可以共享 MapLibre 的地图相机和 WebGL 上下文。
- **旧版保留**：`legacy.html` 保留 Stage 1 Three.js 城市浏览器，作为回归与对比路径。

## 为什么建筑加载比 v1 快

v1 在浏览器主线程对每个 Overture Polygon 执行 `Shape → ExtrudeGeometry → normal → merge`。佛山市中心单个 z14 瓦片就可能包含 5,000+ 建筑 footprint，因此 CPU 几何构建才是主要瓶颈，而不仅是网络。

Stage 2 改为：

```text
PMTiles Range Request
        ↓
MapLibre Web Worker
        ↓
Vector Tile decode / style evaluation
        ↓
GPU fill / fill-extrusion
```

普通城市建筑不再逐栋创建 Three.js `ExtrudeGeometry`。Three.js 只加载少量高价值精细地标。

## 数据架构

```text
EOX Sentinel-2 ─────────────┐
Overture Base / Water ──────┤
Overture Transportation ────┤
OpenFreeMap labels / POI ───┼──→ MapLibre GL JS ──→ 2D / 3D city map
Overture Buildings ─────────┤          │
Terrarium DEM ──────────────┘          │ shared map camera / WebGL
                                      ↓
                                Three.js Custom Layer
                                      │
                       detailed landmarks / future GLB
```

## 精细地标的真实性定义

仓库当前的 5 个模型是**项目自建 reference reconstruction（公开资料参考重建）**：根据公开坐标、公开尺寸、建筑结构描述和多视角视觉研究重新构建，不包含来源不明的第三方 mesh / texture。

它们比普通建筑 footprint 有显著更高的几何复杂度，并在 CI 中设置三角面、尺度和 draw-call 回归门槛；但它们**不是测绘模型，也不是摄影测量**。因此不能描述成“每一块幕墙/构件与现场毫米级一致”。

真正的 Google Earth 摄影测量级表面真实性，仍需合法的佛山倾斜摄影 / CIM / 实景三维 / 3D Tiles 数据。

## 运行

要求 Node.js 22.12+。

```bash
npm ci
npm run dev
```

打开：

```text
http://localhost:4173
```

生产验证：

```bash
npm ci
npm run check
npm run build
npm run network-smoke
npm run preview
```

旧版：

```text
http://localhost:4173/legacy.html
```

## 关键版本

- MapLibre GL JS `6.9.0`
- Three.js `0.186.0`
- PMTiles `4.5.0`
- Vite `8.2.2`
- Overture Maps data `2026-08-19.0`

## 验收

详见 [`ACCEPTANCE.md`](./ACCEPTANCE.md) 和 [`docs/STAGE2.md`](./docs/STAGE2.md)。

第二阶段的完成标准不是“页面能打开”，而是：生产浏览器里真实道路和水系必须有可见 feature；3D 模式必须出现 Overture 建筑 extrusion；5 个精细参考地标必须成功进入 Three.js Custom Layer；旧版仍能构建运行。

## 地图复刻边界

“复刻佛山地图布局”指尽可能忠实复现开放数据中真实存在的道路、水系、建筑、地形、地点和拓扑关系，不复制 Google Maps / 高德地图等平台的专有样式、图标或受版权保护的视觉资产。
