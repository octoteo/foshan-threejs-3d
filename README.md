# 佛山全景 3D / Foshan Photorealistic Three.js

面向“接近 Google Earth 3D 的真实效果”重新设计的佛山三维城市浏览器。渲染核心仍为 **Three.js**，城市数据改为 **OGC 3D Tiles 实景三维流式加载**，不再把 OSM 拉伸建筑或程序化立面作为高保真结果。

## 为什么重构

Google 官方对 Photorealistic 3D Tiles 的定义是：高分辨率影像纹理覆盖的真实 3D mesh。要达到这一视觉等级，数据本身必须来自摄影测量、倾斜摄影、实景三维或同等级城市网格；仅凭建筑 footprint、高度和通用纹理无法满足验收。

因此 v2 的原则是：**宁可明确提示“缺少实景数据”，也不生成假建筑冒充真实佛山。**

## 已实现

- Three.js + `3d-tiles-renderer` 0.5.2 直接渲染 OGC 3D Tiles。
- Google Maps Platform Photorealistic 3D Tiles 适配器。
- 自有/第三方 3D Tiles 根 URL 适配器，适合接入佛山授权倾斜摄影、实景三维或城市 Mesh。
- WGS84 全球坐标与佛山真实经纬度地标导航。
- 佛山祖庙、岭南天地、南风古灶、世纪莲、千灯湖、西樵山、清晖园一键飞行。
- 连续 LOD、瓦片卸载、Tile Compression、Fade、Draco/glTF 扩展。
- 三档画质：性能 24 px、均衡 14 px、超清 8 px。
- 显存/缓存、可见瓦片、FPS、海拔实时遥测。
- Google 模式动态显示每个可见瓦片返回的数据 attribution，并保留 Google Maps 品牌区。
- API Key 只保存在 `sessionStorage`，刷新标签页会话可继续使用，关闭会话后消失；不会提交到 GitHub。
- 不提供 Google 内容预抓取、离线缓存或数据提取功能。

## 运行

无需 npm 安装依赖；依赖由浏览器从 CDN 以 ES Modules 加载。

### Windows

双击 `run.bat`，打开：

```text
http://localhost:5173
```

### macOS / Linux

```bash
./run.sh
```

或者：

```bash
npm run serve
```

## 数据源 1：Google Photorealistic 3D Tiles

1. 在 Google Cloud 创建项目并启用 **Map Tiles API**。
2. 开启 Billing。
3. 创建 API Key，并建议使用 HTTP referrer 与 API restrictions 限制使用范围。
4. 页面点击“数据源”，选择 **Google Photorealistic**，输入 Key。
5. 进入佛山并切换“超清”画质进行实际视觉验收。

> Google 的 Photorealistic 3D **surface data 并非全球所有城市都有覆盖**。如果佛山目标区域没有真实 surface mesh，则即使 API 正常也不能判定视觉验收通过。

## 数据源 2：佛山自有实景三维 / 倾斜摄影

这是对佛山项目更可控的生产路径。把经授权的数据整理/转换为 OGC 3D Tiles，并提供可访问的根 `tileset.json` URL，然后在“数据源 → 自有 3D Tiles”中输入 URL。

推荐源数据：

- 无人机倾斜摄影（OSGB / OBJ / ContextCapture / Smart3D 输出）转换到 3D Tiles；
- 城市级实景三维 mesh；
- 已完成纹理烘焙的 CityMesh / GLB，经 3D Tiles 切片；
- 政务/测绘已有的授权三维城市成果。

## 验收

完整验收合同见 [`ACCEPTANCE.md`](./ACCEPTANCE.md)。核心硬门槛：

**没有佛山真实摄影测量/实景三维数据，就不能以“Google Earth 3D 级真实效果”验收通过。**

静态工程检查：

```bash
npm run check
```

## 技术版本

- Three.js r185
- 3d-tiles-renderer 0.5.2
- Google Maps Platform Map Tiles API / Photorealistic 3D Tiles

## 数据与合规

Google Maps Platform 内容受 Google Maps Platform Terms 与 Map Tiles API Policies 约束。应用运行时只做在线可视化，并显示数据 attribution。自有 3D Tiles 的授权、版权与 attribution 由数据持有人负责。
