# CloudWeave

**将云盘文件编织进 Obsidian Canvas。**

在 Canvas 中浏览和插入云盘文件，AI 能理解云盘内容和本地笔记，一并分析。

![效果图](asset/demo.png)

---

## 核心功能

### ☁️ 云盘文件集成
在 Canvas 中直接浏览和插入阿里云盘、百度网盘、夸克网盘、OneDrive 的文件，无需离开 Obsidian。

- **插入**：底部工具栏按钮或画布空白处右键菜单
- **追溯**：每个节点记录云盘来源和路径，始终可追踪
- **读取**：AI 可按需通过 `read_cloud_file` 工具读取云盘文件内容（PDF、文本、代码等）

### 🤖 AI 分析
选中 Canvas 节点（本地笔记 + 云盘文件）后让 AI 一同分析。

- **预设**：总结、解释、找关联
- **自定义提问**：对选中节点任意提问
- **上下文感知**：AI 理解节点布局、连线和颜色
- **支持**：OpenAI / Gemini / Claude / Ollama

### 🕒 视频/音频时间戳
在笔记中标记时间戳，一键跳转到对应 Canvas 节点。

- 快捷键 `Cmd+Shift+Space`
- 点击即可跳转到对应秒数的 Canvas 节点

---

## 前置依赖

- **[Sync Vault](https://github.com/abcamus/sync-vault-ce)** 插件（云盘引擎）
- 在 Sync Vault 设置中启用 **AI → MCP Server**
- Obsidian v1.5+（支持 Canvas 功能）

---

## 安装

1. 将 `main.js`、`manifest.json`、`styles.css` 复制到 `.obsidian/plugins/cloudweave/`
2. 在 Obsidian 设置 → 第三方插件中启用 **CloudWeave**
3. 打开一个 Canvas 文件 → 右键 → 从云盘插入

---

## 开发

```bash
# 安装依赖
pnpm install

# 开发构建（监听模式）
pnpm run dev

# 生产构建
pnpm run build

# 部署到 vault
pnpm run deploy
```

---

## 开发计划

- **[P0] 云盘文件插入 + AI 问答** ✅
- **[P1] 音频转写** — AI 转写云盘音视频
- **[P2] 联网搜索** — AI 可联网搜索作为上下文
- **[P3] 高级 AI 工作流** — 自定义提示词、多轮对话、工具组合

---

## 技术架构

```
Obsidian
├── CloudWeave 插件
│   ├── 云盘节点（cloud-link + JSON meta）
│   ├── 时间戳系统
│   └── AI 问答面板
└── Sync Vault 插件
    └── MCP Server（阿里云盘 / 百度网盘 / 夸克网盘 / OneDrive）
```

---

## 许可

MIT
