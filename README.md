# 佛山真实 3D · Open Photorealistic Hybrid v1.0.1

一个用 **Three.js** 构建、默认零付费 API Key 即可运行的佛山高保真三维城市浏览器。

项目目标不是把简单拉伸建筑包装成“Google Earth 3D”，而是在没有佛山公开倾斜摄影 mesh 的现实条件下，把合法开放资源组合成一条完整、可解释、可扩展的城市 3D 管线：真实建筑 footprint + 尽可能真实的建筑高度 + 真实地形 + 卫星影像 + 程序化 PBR 视觉增强。

## 已交付能力

- **真实建筑轮廓**：Overture Maps Buildings PMTiles，固定数据版本 `2026-08-19.0`，浏览器通过 HTTP Range 按视野读取。
- **Building Part**：优先绘制 Overture `building_part`，避免有 parts 的建筑重复绘制主体。
- **高度可信度**：`height` → 可选开放高度增强 → `num_floors` → 确定性视觉估算；页面实时显示数据支撑比例。
- **高度增强接口**：支持把 3D-GloBFP/CNBH 等合法获取的数据预处理成局部瓦片，不改变主渲染架构。
- **真实地形**：Mapzen Terrain Tiles / Terrarium 高程。
- **卫星影像**：默认 EOX Sentinel-2 2016（CC BY 4.0）；可切换 EOX 2024（非商业）或天地图影像（需 Key）。
- **建筑视觉**：住宅、商业、工业、公共、宗教等分类型 PBR 立面；利用 `facade_color/material`、`roof_color/material/shape`。
- **屋顶细节**：支持 flat、gable、hip、pyramid、cone、dome、mansard、skillion 等属性的视觉表达；近景高层增加确定性的屋顶设备视觉细节。
- **建筑检查器**：单击近景建筑可查看高度来源、可信度、楼层、占地、类型、屋顶和 Overture ID。
- **稳定性**：地形/建筑请求并发队列、重试、受限视野缓存、距离 LOD、自动画质、WebGL context 恢复。
- **城市浏览体验**：佛山全景、七个地标飞行、昼夜光照、软阴影、视角 URL 分享、全屏、键盘操作和移动端布局。
- **渐进首屏**：启动只加载中心地形和真实中心建筑形成可交互首屏，就绪后后台扩展周边视野，避免“大场景先全部完成才显示”的长等待。
- **生产构建**：Three.js、PMTiles、PBF、Vector Tile 都通过固定 npm 版本 + lockfile + Vite 本地打包，不依赖浏览器运行时 CDN import map。
- **地标模型扩展**：`public/assets/landmarks/manifest.json` 可叠加有合法授权的 GLB；仓库默认不捆绑来源不明模型。

## 运行

需要 Node.js 22.12+。

```bash
npm ci
npm run dev
```

打开：

```text
http://localhost:4173
```

Windows 也可以直接运行 `run.bat`；macOS/Linux 可运行 `./run.sh`。

生产构建：

```bash
npm ci
npm run build
npm run preview
```

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

完整建筑 footprint 使用 Overture z14。远、中、近景的视觉复杂度由相机距离控制，而不是在低 zoom 使用质心/简化几何冒充建筑体块。

## 接入 3D-GloBFP / CNBH 高度增强

先将合法获得的数据裁剪到佛山并转成 WGS84 GeoJSON。例如输入文件有 `height` 字段：

```bash
node tools/build-height-overlay.mjs foshan-heights.geojson public/data/heights --zoom 14 --source 3d-globfp --height-field height
```

生成：

```text
public/data/heights/manifest.json
public/data/heights/14/<x>/<y>.json
```

浏览器重新加载后会自动发现并启用高度增强。匹配使用局部空间最近邻并限制最大匹配距离，避免高度误配。

> 3D-GloBFP/CNBH 属于模型推算或遥感融合数据，不等同于现场测量；界面仍应表述为“数据增强”。

## 地标 GLB

只有模型具有明确再分发/使用许可时才加入仓库。把 GLB 放入 `public/assets/landmarks/` 并在 `manifest.json` 填写经纬度、旋转、缩放和授权信息即可。

## 验证

```bash
npm ci
npm run check
npm run build
npm run network-smoke
```

GitHub Actions 进一步执行真实生产浏览器验收：安装 lockfile 依赖、生成 Vite bundle、在佛山 z14 实际解码 Overture Polygon、将真实佛山数据送进 Three.js 建筑几何生成器、启动生产预览，并用 headless Chrome + SwiftShader 验证 `appReady=true`、首屏建筑数大于 0，同时保存截图和 `dist/` artifact。

## 真实性边界

可以声明：建筑位置/footprint 来自真实开放地理数据；有 `height`、`num_floors` 或高度增强数据时高度有数据依据；地形来自真实 DEM；地表来自真实卫星遥感影像；程序化材质用于增强城市级和航拍级视觉。

不能声明：每栋楼的窗户、空调、屋顶设备都是现实逐项复刻；程序化屋顶就是现场测量几何；当前默认模式已经拥有佛山 Google Earth 式摄影测量 mesh。

真正的逐表面摄影测量真实性仍需要佛山倾斜摄影/CIM/授权 3D Tiles。取得此类数据后可以作为独立高保真层接入，无需推倒现有架构。

## 主要版本

- Three.js `0.186.0`
- Vite `8.2.2`
- PMTiles `4.5.0`
- PBF `5.1.2`
- @mapbox/vector-tile `3.0.0`
- Overture Maps data `2026-08-19.0`

## 数据许可与署名

运行时页面持续显示建筑、影像和地形署名。Overture Buildings 的具体许可与署名以 Overture 官方 Attribution and Licensing 页面为准；EOX 影像许可按页面所选数据源执行；天地图按其开发授权执行。
