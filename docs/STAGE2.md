# Stage 2 — 佛山数字城市地图内核

## 产品目标
Stage 2 不再把项目定义为“Three.js 3D 建筑演示”，而是“佛山数字城市 / 开放数据版 Google Earth”。地图是主产品，Three.js 是地图里的高精 3D 扩展层。

## 架构
- **MapLibre GL JS**：2D/3D 地图相机、矢量瓦片、道路、水系、标签、GPU 建筑 extrusion、地形。
- **OpenFreeMap / OpenMapTiles**：零 Key 的完整 2D 道路、水系、地名、POI 与行政地图底座。
- **Overture Buildings PMTiles**：佛山建筑 footprint、高度/楼层和 building parts。
- **Terrarium DEM**：3D 地形。
- **Three.js Custom Layer**：只负责经授权的精细地标 GLB / 3D Tiles，不再承担整城普通建筑 CPU 挤出。

## 性能变化
旧版每个 Overture z14 tile 要在主线程逐栋执行 Shape、ExtrudeGeometry、normal、merge。佛山中心单瓦片可超过 5,000 个 footprint。Stage 2 让 MapLibre worker + GPU 直接处理矢量瓦片和 fill-extrusion，普通建筑不再创建数千个 Three.js Geometry。

## 地理真实性
道路、河流、街区和地名使用开放地图矢量数据的真实 geometry。这里的“复刻”定义为地理结构、拓扑和位置尽量忠实于开放数据事实，而不是复制 Google/高德的专有视觉样式。

## 地标精度路线
地标采用独立资产流水线：现场/公开参考 → 尺度校准 → LOD0/LOD1/LOD2 → PBR → GLB → WGS84 定位 → Three.js Custom Layer。仓库不捆绑授权不清晰的第三方模型。

## 当前里程碑（2.1）
- 默认入口切换为 MapLibre 地图内核。
- 2D / 3D 一键切换。
- OpenFreeMap 完整道路、水系、标签底图。
- Overture GPU 建筑 extrusion。
- Terrarium 真实地形。
- 12 个地标高精资产位。
- Three.js GLB custom layer 已接入地图共享 WebGL 上下文。
- 旧 v1 Three.js 版本保留在 legacy.html。

## 下一里程碑（2.2）
- 佛山区域专用 PMTiles，减少全球 archive Range 查找和字段冗余。
- 道路/水系 Overture 专用 overlay 与道路等级可视化。
- 首批 5 个经过授权/自建的高精地标 GLB。
- 地标 LOD、模型加载队列、KTX2/Draco 压缩。
