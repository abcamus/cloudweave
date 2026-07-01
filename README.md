# Context Canvas

**让 Obsidian Canvas 成为云端知识上下文容器。**

把云盘上的视频、音频、图片、PDF 拖入画布，在 Canvas 里直接预览，然后基于整个画布的内容与 AI 对话。

---

## 核心功能

### ☁️ 云盘节点
右键 Canvas → 从云盘插入 → 浏览阿里云盘/百度网盘/夸克网盘文件 → 自动创建节点。

- **图片**：通过 Sync Vault 后处理器自动渲染缩略图
- **视频/音频**：生成 cloud-link 节点，后续支持内嵌播放
- **PDF/其他**：文件节点，带来源标签

### 🕒 时间戳笔记
在笔记中记录视频/音频时间戳，点击即可跳转到 Canvas 对应节点。

- 快捷键 `Cmd+Shift+Space` 记录时间戳
- 格式 `cc-timestamp://nodeId/seconds`
- 点击自动定位到 Canvas 节点

### 🤖 AI 问答面板
选中 Canvas 节点作为上下文，向 AI 提问。

- 支持 OpenAI / Gemini / Claude
- 自动聚合节点元数据作为上下文
- 不离开 Canvas 界面即可问答

### 🌐 国际化
自动跟随 Obsidian 界面语言（中文 / English）。

---

## 前置依赖

- **[Sync Vault](https://github.com/abcamus/sync-vault-ce)** 插件（云盘引擎）
- 在 Sync Vault 设置中启用 **AI → MCP Server**
- Obsidian v1.5+（Canvas 功能）

---

## 安装

1. 将 `main.js`、`manifest.json`、`styles.css` 复制到 `.obsidian/plugins/context-canvas/`
2. 在 Obsidian 设置 → 第三方插件中启用 **Context Canvas**
3. 打开一个 Canvas 文件 → 右键 → 从云盘插入

---

## 开发

```bash
# 安装依赖
pnpm install

# 开发构建（监听）
pnpm run dev

# 生产构建
pnpm run build

# 部署到 vault
pnpm run deploy
```

---

## 路线图

| Phase | 功能 | 状态 |
|-------|------|------|
| P0 | 云盘节点 + 文件选择器 | ✅ 图片可用，视频/PDF 降级显示 |
| P1 | 视频/音频播放 + 时间戳 | ✅ 时间戳系统，⏳ 内嵌播放器 |
| P2 | AI 问答面板 | ✅ 基础问答，⏳ STT/Vision/PDF 提取 |
| P3 | MCP 上下文导出 | ⏳ 未开始 |
| P4 | 性能优化 + 缓存 | ⏳ 未开始 |

---

## 技术架构

```
Obsidian
├── Context Canvas 插件
│   ├── 云盘节点（cloud-link + JSON meta）
│   ├── 时间戳系统
│   └── AI 问答面板
└── Sync Vault 插件
    └── MCP Server（云盘引擎：阿里/百度/夸克）
```

---

## 许可

MIT
