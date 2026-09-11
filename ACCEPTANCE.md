# 佛山 Open Photorealistic Hybrid v1.0 验收标准

## 1. 可运行性（MUST）

- 默认模式不要求付费 API Key。
- 浏览器打开后必须能加载真实地形、卫星影像和 Overture 建筑数据。
- 外部单个瓦片失败不得导致应用白屏；必须允许后续视野更新继续恢复。
- WebGL context 恢复后必须重新加载可见数据。

## 2. 地理真实性（MUST）

- 建筑 footprint / building_part 来自 Overture Buildings，不使用 Overpass/随机城市生成器作为默认数据源。
- 高度按 `Overture height → 开放高度增强 → num_floors → 确定性视觉估算` 解析。
- UI 必须展示数据支撑高度占比；视觉估算不得描述为实测高度。
- 地形来自 Terrarium 高程瓦片，不能使用整城平面冒充真实地形。
- 佛山地标导航使用 WGS84 真实坐标。

## 3. 视觉真实性（MUST）

- 普通建筑不得统一灰盒；必须按用途和可用 facade 属性生成不同 PBR 立面。
- 屋顶必须读取 `roof_shape / roof_color / roof_material / roof_height` 等可用字段；未知或不适合构造的复杂 footprint 应安全回退为平屋顶，而不是产生破面。
- 近景允许增加确定性的屋顶设备、窗格、阳台节奏等视觉增强，但这些元素不得被描述为现实逐项测量结果。
- 昼夜光照、雾、大气与阴影不得破坏地理坐标或建筑高度含义。

## 4. 交互与可用性（MUST）

- 支持旋转、平移、缩放、佛山全景和七个地标飞行。
- 支持自动/性能/均衡/超清画质；自动模式在持续低 FPS 时降低负载。
- 支持单击近景建筑查看高度来源、可信度、占地、类型、楼层和 Overture ID。
- 支持复制当前视角 URL，重新打开 URL 能恢复相机视角。
- 移动端 UI 不得遮满整个画布。

## 5. 性能与稳定性（MUST）

- 建筑与地形按瓦片 LOD 加载，不一次性载入全佛山。
- 请求必须有并发上限和失败重试。
- 离开视野的瓦片进入受限缓存并按 LRU 思路回收，避免连续平移导致显存无限增长。
- 远景建筑使用更低细节层级；近景才启用屋顶设备/拾取元数据等高成本细节。

## 6. 可扩展数据（MUST）

- 支持可选的局部建筑高度增强 manifest，不要求修改渲染核心。
- 提供无第三方依赖的 GeoJSON → 高度瓦片预处理脚本。
- 支持合法授权 GLB 地标 manifest；默认仓库不捆绑来源/许可不明模型。

## 7. 自动证据

以下命令必须通过：

```bash
npm run check
npm run network-smoke
```

GitHub Actions 必须进一步完成：

1. `npm run check`；
2. 从佛山坐标访问 Overture PMTiles、Terrarium、EOX 和 Three.js ESM；
3. 启动本地 Web 服务；
4. headless Chrome 加载页面并等待 `data-app-ready="true"`；
5. 生成浏览器截图 artifact。

## 8. 摄影测量真实性（独立增强门槛）

当前 v1.0 的“完整可用”指开放数据混合城市浏览器完整可用，不等于已经取得佛山倾斜摄影原始 mesh。

只有接入佛山合法授权的倾斜摄影/CIM/实景三维/OGC 3D Tiles 后，才能额外声明“摄影测量真实性达到 Google Earth 3D 同类数据层级”。
