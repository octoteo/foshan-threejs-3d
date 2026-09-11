# 佛山真实 3D · Open Photorealistic Hybrid

一个用 **Three.js** 构建、默认零付费 API Key 即可运行的佛山高保真三维城市浏览器。

项目目标不是把简单拉伸建筑包装成“Google Earth 3D”，而是在没有佛山公开倾斜摄影 mesh 的现实条件下，把可合法公开获取的数据组合成一条完整、可解释、可扩展的城市 3D 管线：真实建筑 footprint + 尽可能真实的建筑高度 + 真实地形 + 卫星影像 + 程序化 PBR 视觉增强。

## v1.0 能做什么

- **真实建筑轮廓**：Overture Maps Buildings PMTiles，浏览器通过 HTTP Range 按视野读取，不下载全球数据集。
- **Building Part**：优先绘制 Overture `building_part`，避免有 parts 的建筑重复绘制主体。
- **高度可信度**：`height` → 可选开放高度增强 → `num_floors` → 确定性视觉估算；页面实时显示数据支撑比例。
- **高度增强接口**：支持把 3D-GloBFP/CNBH 等合法获取的数据预处理成局部瓦片，不改变主渲染架构。
- **真实地形**：Mapzen Terrain Tiles / Terrarium 高程。
- **卫星影像**：默认 EOX Sentinel-2 2016（CC BY 4.0）；可切换 EOX 2024（非商业）或天地图影像（需 Key）。
- **建筑视觉**：住宅、商业、工业、公共、宗教等分类型 PBR 立面；利用 `facade_color/material`、`roof_color/material/shape`。
- **屋顶细节**：支持 flat、gable、hip、pyramid、cone、dome、mansard、skillion 等属性的视觉表达；近景高层增加确定性的屋顶设备视觉细节。
- **建筑检查器**：单击近景建筑可查看高度来源、可信度、楼层、占地、类型、屋顶、Overture ID。
- **性能工程**：地形/建筑请求并发队列、重试、LRU 式视野缓存、距离 LOD、自动画质、WebGL context 恢复。
- **城市浏览体验**：佛山全景、七个地标飞行、昼夜光照、软阴影、视角 URL 分享、全屏、键盘操作。
- **地标模型扩展**：`assets/landmarks/manifest.json` 可叠加有合法授权的 GLB；仓库默认不捆绑来源不明模型。

## 运行

需要 Node.js 18+（推荐 Node.js 22）。项目运行时依赖通过固定版本 ESM CDN 加载，无需 `npm install`。

```bash
npm run serve
```

浏览器打开：

```text
http://localhost:4173
```

Windows 也可以直接运行 `run.bat`；macOS/Linux 可运行 `./run.sh`。

## 默认数据链

```text
Overture Buildings PMTiles 2026-08-19.0
          │
          ├── footprint / building_part
          ├── height / num_floors
          ├── facade_* / roof_*
          │
          └───────────────┐
                          ↓
Terrarium DEM ───────→ Three.js ←──── EOX / 天地图影像
                          │
                 PBR + Roof + LOD
                          │
                   Foshan 3D Viewer
```

Overture 版本固定到 `2026-08-19.0`，避免上游 schema 突然变化破坏客户端；升级时应先跑 CI 再修改版本。

## 接入 3D-GloBFP / CNBH 高度增强

运行时不会要求用户下载几十 GB 的亚洲/中国数据。推荐先在本地把合法获得的数据裁剪到佛山并转成 WGS84 GeoJSON，然后生成轻量高度瓦片。

假设 `foshan-heights.geojson` 中有 `height` 字段：

```bash
node tools/build-height-overlay.mjs foshan-heights.geojson data/heights --zoom 14 --source 3d-globfp --height-field height
```

生成：

```text
data/heights/manifest.json
data/heights/14/<x>/<y>.json
```

浏览器重新加载后会自动发现并启用高度增强。匹配采用局部空间最近邻，并设置最大匹配距离，避免把高度误配给远处建筑。

> 3D-GloBFP 是模型推算/融合数据，不等同于现场测量。即使启用，也应保持“数据增强”而非“实测高度”的表述。

## 地标 GLB

只有在模型具有明确的再分发/使用许可时才加入仓库。配置示例：

```json
{
  "version": 1,
  "license": "CC BY 4.0",
  "models": [
    {
      "id": "example",
      "url": "./assets/landmarks/example.glb",
      "lon": 113.1122,
      "lat": 23.0315,
      "rotationDeg": 0,
      "scale": 1,
      "altitudeOffset": 0
    }
  ]
}
```

## 验证

本地静态与算法检查：

```bash
npm run check
```

公网数据链检查：

```bash
npm run network-smoke
```

GitHub Actions 还会启动真实页面，通过 headless Chrome + SwiftShader 访问本地服务，等待开放数据加载并生成浏览器截图 artifact。

## 真实性边界

### 可以声明

- 佛山建筑位置和 footprint 来自真实公开地理数据。
- 有 `height` / `num_floors` / 高度增强数据时，建筑高度有数据依据。
- 地形来自真实高程瓦片。
- 地表使用真实卫星遥感影像。
- 程序化材质用于提高城市级和航拍级视觉质量。

### 不可以声明

- 每栋楼的窗户、空调、屋顶设备都是现实逐项复刻。
- 程序化屋顶就是现场测量的屋顶几何。
- 当前默认模式已经拥有佛山 Google Earth 式摄影测量 mesh。

真正的逐表面摄影测量真实性仍需要佛山倾斜摄影/CIM/授权 3D Tiles。拿到此类数据后，可以作为独立高保真层接入，而不需要推倒现有开放数据架构。

## 主要版本

- Three.js `0.186.0`
- PMTiles `4.5.0`
- @mapbox/vector-tile `3.0.0`
- Overture Maps data `2026-08-19.0`

## 数据许可与署名

运行时页面持续显示建筑、影像、地形署名。Overture Buildings 主题包含 OSM、Microsoft、Google Open Buildings、Esri 等来源，其具体许可与署名以 Overture 官方 Attribution and Licensing 页面为准。EOX 影像许可按页面所选数据源执行；天地图按其开发授权执行。
