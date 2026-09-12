# Stage 2 — 佛山数字城市地图内核

## 最终产品方向

项目从 Stage 1 的“3D 城市浏览器”升级为 **佛山数字城市 / 开放数据版 Google Earth**。

地图是主产品；Three.js 是地图内部的精细 3D 扩展层。

## 已落地架构

### MapLibre GL JS

负责：

- 2D / 3D 同一地图相机；
- Vector Tile worker 解码；
- 道路、水系、标签与 GPU building extrusion；
- Terrarium terrain；
- 交互、缩放、俯仰和 bearing。

MapLibre 6 在 Vite 环境使用显式 `maplibre-gl-worker.mjs?worker&url`，避免生产 bundle 中 worker 静默失效。

### Overture Maps

固定数据版本：`2026-08-19.0`。

Stage 2 直接使用三份 archive：

- `base.pmtiles`：water 等基础地理事实；
- `transportation.pmtiles`：road / rail segment；
- `buildings.pmtiles`：building / building_part。

道路与水系的关键 geometry 不再依赖第三方地图样式是否及时加载。

### OpenFreeMap / OpenMapTiles

用于开放的地图标签、地点、POI、行政与背景表达。即使它的远程 Vector Tile 发生延迟，Stage 2 的 EOX 影像 + Overture 道路/水系/建筑仍组成核心地图事实链。

### Three.js Custom Layer

普通城市不再使用 Three.js 逐栋挤出。

Three.js 只用于：

- 首批 5 个项目自建精细参考地标；
- 后续具有明确许可的 GLB；
- 未来特殊 3D / 3D Tiles adapter。

## 已解决的建筑加载瓶颈

Stage 1：

```text
PBF → JS polygon loop → THREE.Shape → ExtrudeGeometry
    → normals → materials → merge → Mesh
```

佛山市中心一个 z14 瓦片可以有 5,000+ footprint，所以主线程 CPU 几何构建非常重。

Stage 2：

```text
PMTiles → MapLibre Worker → GPU fill-extrusion
```

普通建筑不再逐栋创建 Three.js Geometry；Three.js 的预算留给真正值得精模的地标。

## 地图“完全复刻”的定义

目标是复刻**地理事实**：

- 道路在哪里、怎样弯、如何连接；
- 河流 / 湖泊 / 水系边界；
- 建筑 footprint 与地形；
- 地名与地点关系。

不复制 Google Maps / 高德的专有配色、图标和版权视觉资产。

## 首批精细地标

已交付 5 个 `reference-reconstruction`：

1. 世纪莲体育场：莲花屋盖、40 片膜瓣、V 形支承、环梁与场馆碗体；
2. 岭南明珠体育馆：一大两小穹顶、网格肋与环向构件；
3. 顺峰山公园牌坊：三跨主体、多级屋顶、立柱、拱券与牌匾；
4. 南风古灶：34.4m 龙窑尺度、窑体分节、窑孔、烟囱与周边传统建筑；
5. 佛山大剧院：九个叠合方盒、玻璃体块与外部白色格构。

这些资产全部在代码中由项目自身 geometry 生成，不使用来源不明第三方 mesh / texture；CI 对复杂度和尺度做回归检查。

真实性等级是“公开资料参考重建”，不是摄影测量。

## 仍保留的重点地标目标

祖庙、岭南天地、千灯湖、西樵山、清晖园、潭洲国际会展中心、顺德欢乐海岸 PLUS 等继续保留在导航和资产路线中，未完成时明确显示为规划目标。

## Stage 2 验收证据

自动验证分四层：

1. 静态 / regression / landmark geometry；
2. 公网真实数据解码；
3. Vite 生产构建与 MapLibre Worker；
4. Chrome 2D / 3D 真页面截图与 DOM runtime facts。

只有 2D 道路/水系可见、3D 建筑可见、5 个精细地标加载、legacy 仍可用，才允许合并到 `main`。

## 下一阶段优化

Stage 2 之后仍值得继续：

- 离线裁出佛山区域专用 `base / transportation / buildings.pmtiles`，减少全球 archive 索引与字段冗余；
- 将精细地标转成 LOD0 / LOD1 / LOD2，并使用 KTX2 / Draco / Meshopt；
- 增加建筑点击、道路查询、地点搜索和路线能力；
- 接入合法佛山实景三维 / 3D Tiles 时增加摄影测量层。
