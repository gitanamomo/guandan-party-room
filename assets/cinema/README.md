# 森光会所 · v1.5 正式场景

四张配套的拟人宠物场景，使用内置 imagegen 生成，再通过 `sips` 转为 JPEG（质量 88）用于网页。没有用 CSS 形状或 SVG 替代正式场景。

| 文件 | 用途 | 构图 |
|---|---|---|
| guandan-four-desktop-v1.jpg | 掼蛋单机 / 联机桌面 | 8:5 横版，四席 |
| guandan-four-mobile-v1.jpg | 掼蛋手机宽度 | 4:5 竖版，四席重新构图 |
| doudizhu-three-desktop-v1.jpg | 斗地主桌面 | 8:5 横版，三席 |
| doudizhu-three-mobile-v1.jpg | 斗地主手机宽度 | 4:5 竖版，三席重新构图 |

橘色加菲、黑贵宾、粉色斯芬克斯和黑法斗，以 `../pets/` 的 PetVerse 原素材为品种/身份参考，重新设计拟人衣着、坐姿、持牌、椅子和环境。原立绘和旧花园均保留。

- 渲染：高质量 3D 动画电影风格的静态插画，统一日光、材质、透视与接触阴影。
- 运行时：牌面、轮次、身份、余牌、出牌与结算均由原游戏状态实时渲染，不烧录在场景中。
- 修改入口：`pet-theme.css` 中 `.room.theme-pets` 的背景与百分比座位锚点；`pet-theme.js` 的三/四人模式选择。
- 生成说明与提示词：[PROMPTS.md](../../docs/visual-v15/PROMPTS.md)。
- 原始生成 PNG 保留在本机 Codex generated_images 中；下面为对应源文件名，未覆盖原文件。

```
exec-385f2339-708c-4ed3-a5ec-599c37d1486b.png  四人横版
exec-f9b012c6-5850-4c37-9f97-4e9ed3736013.png  四人竖版
exec-521ba183-9396-4444-999e-fb338984423f.png  三人横版
exec-ab74c11b-2fbd-4fa9-a23e-ce55d9037c0b.png  三人竖版
```
