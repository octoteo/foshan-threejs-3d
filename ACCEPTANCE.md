# 佛山 Open Photorealistic Hybrid v1.0 验收标准

## 1. 可运行性（MUST）

- 生产版本必须使用 `package-lock.json` + `npm ci` 安装固定依赖，并由 Vite 生成本地 bundle；不得依赖浏览器运行时 CDN import map。
- 默认模式不要求付费 API Key。
- `data-app-ready="true"` 只有在首屏真实 Overture 建筑已生成且建筑数大于 0 后才能设置。
- 首屏采用渐进加载；达到可交互状态后再后台扩展周边高负载瓦片。
- 外部单个瓦片失败不得导致永久白屏；后续视野更新必须可继续恢复。
- WebGL context 恢复后必须重新加载可见数据。

## 2. 地理真实性（MUST）

- 建筑 footprint / building_part 来自 Overture Buildings，不使用 Overpass/随机城市生成器作为默认数据源。
- 完整建筑 footprint 使用 Overture z14；不得把低 zoom 的质心/简化表达直接拉伸成所谓真实建筑。
- 高度按 `Overture height → 开放高度增强 → num_floors → 确定性视觉估算` 解析。
- UI 必须展示数据支撑高度占比；视觉估算不得描述为实测高度。
- 地形来自 Terrarium 高程瓦片，不能用整城平面冒充真实地形。
- 佛山地标导航使用 WGS84 真实坐标。

## 3. 视觉真实性（MUST）

- 普通建筑不得统一灰盒；必须按用途和可用 facade 属性生成不同 PBR 立面。
- 屋顶读取 `roof_shape / roof_color / roof_material / roof_height` 等可用字段；复杂 footprint 必须安全回退为平屋顶，不能产生破面。
- 近景允许增加确定性的屋顶设备、窗格、阳台节奏等视觉增强，但不得描述为现实逐项测量结果。
- 昼夜光照、雾、大气与阴影不得改变地理坐标或高度语义。

## 4. 交互与可用性（MUST）

- 支持旋转、平移、缩放、佛山全景和七个地标飞行。
- 支持自动/性能/均衡/超清画质；自动模式在持续低 FPS 时降低负载。
- 支持单击近景建筑查看高度来源、可信度、占地、类型、楼层和 Overture ID。
- 支持复制当前视角 URL并恢复相机视角。
- 移动端 UI 不得遮满整个画布。

## 5. 性能与稳定性（MUST）

- 建筑与地形按视野瓦片加载，不一次性载入全佛山。
- 请求有并发上限和失败重试。
- 离开视野的瓦片进入受限缓存并按 LRU 思路回收。
- 远景只加载中心真实建筑瓦片并使用低细节材质；进入中近景后再扩展周边瓦片和屋顶细节。

## 6. 可扩展数据（MUST）

- 支持可选局部建筑高度增强 manifest，无需修改主渲染核心。
- 提供无第三方依赖的 GeoJSON → 高度瓦片预处理脚本。
- 支持合法授权 GLB 地标 manifest；默认仓库不捆绑来源/许可不明模型。

## 7. 自动证据

以下命令必须通过：

```bash
npm ci
npm run check
npm run build
npm run network-smoke
```

GitHub Actions 必须进一步完成：

1. 使用 lockfile 的 `npm ci`；
2. 静态、坐标、高度、屋顶、DOM、真实性规则测试；
3. Vite 生产构建；
4. 从佛山坐标访问 Overture PMTiles、Terrarium、EOX；
5. 在佛山中心 z14 解码真实 Overture 建筑 Polygon；
6. 通过项目 `OvertureBuildingsProvider` 后仍存在可渲染建筑；
7. 将同一批真实建筑送入 `buildBuildingTile()` 并实际生成 Three.js Mesh；
8. headless Chrome 加载生产 bundle，验证 `data-app-ready="true"` 且 `buildingStats > 0`；
9. 生成浏览器截图与生产 `dist/` artifact。

## 8. 摄影测量真实性（独立增强门槛）

当前 v1.0 的“完整可用”指开放数据混合城市浏览器完整可用，不等于已经取得佛山倾斜摄影原始 mesh。

只有接入佛山合法授权的倾斜摄影/CIM/实景三维/OGC 3D Tiles 后，才能额外声明“摄影测量真实性达到 Google Earth 3D 同类数据层级”。
