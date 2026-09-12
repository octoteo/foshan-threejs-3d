# 佛山数字城市 Stage 2 验收标准

## 1. 产品边界

Stage 2 的验收对象是“地图优先的佛山数字城市底座”，不是单独的 Three.js 3D Demo。

必须同时成立：

1. 2D 是完整可用的城市地图；
2. 3D 使用同一地理坐标和地图相机；
3. 道路、水系、建筑、地形来自真实开放地理数据；
4. 普通建筑具备城市级流式性能；
5. 核心地标可以用独立高细节资产覆盖普通建筑层。

## 2. 构建与启动（MUST）

- 使用 `package-lock.json + npm ci` 固定依赖。
- Vite 生产构建必须同时生成 Stage 2 默认入口与 `legacy.html`。
- 默认地图不要求付费 API Key。
- MapLibre v6 Worker 必须经过 Vite worker pipeline 打包；生产环境不得出现“Raster 正常、Vector source 静默失效”。
- 运行时第三方数据异常不得导致整个 UI 白屏。

## 3. 2D 地图事实（MUST）

- 真实道路 geometry 来自 Overture Transportation，而非手绘近似线。
- 真实水系 geometry 来自 Overture Base / Water，而非手绘近似面。
- OpenFreeMap/OpenMapTiles 可以补充地点、POI、行政与文字标签，但不得成为道路/水系真实性的唯一来源。
- 浏览器验收必须在佛山视野实际得到 `roadFeatures > 0` 与 `waterFeatures > 0`。
- 默认影像层必须可以真实加载；当前为 EOX Sentinel-2 2016。
- 所有自有叠加层统一使用 WGS84 / Web Mercator。

## 4. 3D 城市（MUST）

- 普通建筑由 Overture Buildings vector source + MapLibre `fill-extrusion` 渲染。
- Stage 2 默认入口不得逐栋调用 Three.js `ExtrudeGeometry` 生成整城普通建筑。
- 建筑高度按 Overture `height → num_floors × 3.2m → 明确的视觉兜底`表达。
- 3D 模式开启 Terrarium terrain，并保持同一道路/水系/地名布局。
- 生产浏览器 3D 验收必须得到 `threeDBuildings=visible`，不能只显示倾斜卫星平面。

## 5. 精细地标（MUST）

首批至少 5 个地标必须具有独立高细节重建，而不是普通建筑挤出：

- 世纪莲体育场
- 岭南明珠体育馆
- 顺峰山公园牌坊
- 南风古灶
- 佛山大剧院

要求：

- 使用独立材质 / 几何批次，并控制 draw call；
- CI 对三角面复杂度与公开尺寸范围设置下限，防止模型退化成盒子；
- 模型通过 Three.js Custom Layer 进入 MapLibre 地理相机；
- 模型 manifest 明确 WGS84 坐标、尺度依据和 fidelity；
- 生产浏览器必须确认 `landmarkModelsLoaded=5`；
- 参考重建必须明确标记为 `reference-reconstruction`，不得冒充测绘/摄影测量资产。

## 6. 性能（MUST）

- 矢量瓦片解析使用 MapLibre Worker；不得退回主线程逐栋建筑挤出。
- 城市普通建筑由 GPU 矢量 extrusion 承担。
- 全球 Overture archive 使用 HTTP Range / PMTiles，不一次性下载完整数据集。
- Three.js 只承担数量受控的高价值 3D 资产。
- 高精地标按材质合并 geometry，避免大量独立 Mesh draw call。

## 7. 兼容与回归（MUST）

- `legacy.html` 保留 Stage 1 Three.js 方案且必须继续构建。
- 原有 geo / height / roof / DOM / building provider 回归测试继续通过。
- Stage 2 不以删除旧实现来掩盖回归。

## 8. 自动证据

以下命令必须通过：

```bash
npm ci
npm run check
npm run build
npm run network-smoke
```

自动验证至少包括：

- Overture buildings / base / transportation 三个 PMTiles Range 请求；
- 佛山中心真实 road segment 解码数量 > 0；
- 佛山中心真实 water feature 解码数量 > 0；
- Terrarium 与 EOX 可访问；
- 5 个参考地标分别达到几何复杂度、尺度和批次预算；
- Headless Chrome 2D：`appReady=true`、MapLibre worker configured、roads > 0、water > 0、5 models loaded；
- Headless Chrome 3D：`mapMode=3d`、普通 3D buildings visible、5 models loaded；
- 保存 2D / 3D 截图和 DOM 证据。

## 9. 摄影测量真实性（独立更高门槛）

Stage 2 的“精细地标”是项目自建参考重建；普通城市是开放数据驱动的地图级 3D。

只有获得并接入合法的佛山倾斜摄影 / CIM / 实景三维 / OGC 3D Tiles 后，才能声明“摄影测量真实性达到 Google Earth 3D 同类数据层级”。这一门槛不会因为视觉上逼真而自动通过。
