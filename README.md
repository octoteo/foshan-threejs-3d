# 佛山真实 3D · Open Photorealistic Hybrid

用 **Three.js** 构建的佛山开放数据高保真三维城市浏览器。默认不依赖 Google Photorealistic 3D Tiles，也不要求用户先购买倾斜摄影数据。

核心思路不是“用 OSM 拉伸一堆灰色方块”，而是把免费开放资源组合成一条可运行的数据管线：

- **建筑**：Overture Maps 官方全球 `buildings.pmtiles`，浏览器按当前视野 HTTP Range 读取佛山真实建筑 footprint。
- **高度**：优先 Overture `height`，其次 `num_floors`；缺失时使用确定性的视觉估算，并在 UI 显示真实字段覆盖率。
- **建筑属性**：利用 `subtype` / `class` / `facade_color` 等字段生成住宅、商业、工业、公共建筑等不同 PBR 立面。
- **地形**：Mapzen Terrain Tiles / Terrarium，构建真实高程网格。
- **影像**：默认 EOX Sentinel-2 2016（CC BY 4.0）；可切换 EOX 2024（非商业）或天地图影像（需要开发 Key）。
- **地标**：祖庙、岭南天地、南风古灶、世纪莲、千灯湖、西樵山、清晖园使用真实 WGS84 坐标飞行；若后续有授权 GLB，可通过地标模型 manifest 叠加。

## 运行

无需安装第三方 npm 依赖；Three.js、PMTiles 和 MVT 解码器通过浏览器 ES Modules 加载。

```bash
npm run serve
```

浏览器打开：

```text
http://127.0.0.1:5173
```

Windows 也可直接双击 `run.bat`。

## 为什么这条路线可行

Overture 每月发布全球 Buildings PMTiles，官方提供可直接通过 HTTP 访问的 PMTiles URL，因此应用只读取佛山视野范围内的矢量瓦片，而不是下载全球几十 GB 数据。Overture Buildings schema 包含 `height`、`num_floors`、`min_height`、`facade_color`、`facade_material`、`roof_shape` 等三维可视化字段。

这意味着没有佛山摄影测量 mesh 时，我们仍然可以做到：

**真实建筑位置 + 真实 footprint + 可用时真实高度 + 真实地形 + 卫星影像 + 分类型高质量立面。**

这与“Google Earth 摄影测量 mesh”仍不是同一数据等级，因此项目不会把程序化墙面宣称为现实中真实的每扇窗户。完整边界见 [`ACCEPTANCE.md`](./ACCEPTANCE.md)。

## 影像许可

默认 `EOX Sentinel-2 2016` 使用 CC BY 4.0。`EOX 2024` 为 CC BY-NC-SA 4.0，仅适用于符合其非商业许可的场景。正式商业项目建议切换为已获授权的天地图影像、自有正射影像或其他商业卫星底图。

## 可选地标模型

项目不会生成“假地标模型”冒充真实建筑。若有经授权的 GLB/GLTF，在 `assets/landmarks/manifest.json` 中配置：

```json
{
  "models": [
    {
      "id": "zumiao",
      "url": "./assets/landmarks/zumiao.glb",
      "lon": 113.1122,
      "lat": 23.0315,
      "rotationDeg": 0,
      "scale": 1
    }
  ]
}
```

## 验证

```bash
npm run check
```

检查内容包括坐标换算、Web Mercator 瓦片定位、高度优先级、确定性高度估算，以及禁止回退到 Overpass / 随机建筑。

## 当前锁定数据版本

- Overture Maps: `2026-08-19.0`
- Three.js: `0.185.0`
- PMTiles JS: `4.5.0`
- @mapbox/vector-tile: `3.0.0`
- pbf: `5.1.2`

## Attribution

Buildings 数据按 Overture Buildings 主题许可与各源 attribution 要求显示，包括 `© OpenStreetMap contributors, Overture Maps Foundation`。影像和地形 attribution 固定显示在视图右下角。
