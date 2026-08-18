# 🧠 dsh-whale-girl-memory（鲸鱼娘记忆学习）

> DeepSeek Harness **跨会话长期记忆插件**：记住对话中的关键点、主人的习惯、工具的使用经验，按分类存成本机经验文件；每次对话自动注入相关经验，减免繁琐步骤；支持导入他人的经验文件，经验随使用不断迭代。

由 **冰凉大人的星渊之鲸** 开发与维护。

---

## ✨ 功能

1. **记忆当前对话**：模型可随时把对话中的关键点、用户习惯、工具使用经验写入记忆库（`memory_add`）。
2. **跨会话记忆**：记忆库位于 `$DSH_HOME/memory`，**全局跨会话**——换工作区、换会话都记得。
3. **分类存放**：每种记忆一个独立文件夹——`preference/`（习惯偏好）、`fact/`（关键事实）、`lesson/`（经验教训）、`workflow/`（流程技巧）、`tool-usage/`（工具使用）+ `imports/`（导入区）。
4. **全局自动应用**：每次组装提示词时，自动把相关经验注入给模型（按重要度×使用次数排序，默认最多 5 条），直接省掉重复询问和繁琐步骤。
5. **规范化语言**：经验 = 结构化的 JSON 文件（[dsh-memory 格式 v1](docs/FORMAT.md)），写入/读取都是同一套 schema，机器可解析、人可编辑。
6. **导入他人经验**：复制别人的经验文件（JSON）→ 设置页粘贴/选文件导入，或放进 `imports/` 自动归入，或让模型用 `memory_import` 导入——立即可用。
7. **持续迭代**：每条经验被检索/注入一次就 `usageCount + 1`、刷新时间戳；高价值经验越用越靠前；同 id 写入即更新。
8. **工具使用自动统计**：插件监听 `tools/result`，自动记录各类工具的使用频率到 `tool-usage/stats.json`，可作为优化依据。
9. **设置页面板**：查看统计、搜索/过滤记忆、新建、导入、导出（复制 JSON）、删除，全中文界面。

---

## 📦 安装

要求：DeepSeek Harness `0.1.0-rc.6` 及以上、Node.js ≥ 22.19。

> ⚠️ 目前插件尚未发布到 npm registry，请先使用 **本地安装（link 方式）**；npm 发布后可直接 `dsh plugin --profile web add dsh-whale-girl-memory`。

```bash
dsh plugin --profile web add link:/绝对/路径/dsh-whale-girl-memory
```

安装后**重启 dsh web**，打开 `设置 → 插件配置 → 记忆学习` 即可查看与管理记忆库。

### 卸载

```bash
dsh plugin --profile web remove dsh-whale-girl-memory
```

---

## 🛠 使用

### 模型侧（自动/按需）

对模型说：

> 记住：我以后都用中文跟你说话
> 记一条经验：改完代码记得跑一遍测试
> 查一下关于"傲娇"的记忆
> 把 D:\experience.json 导入记忆库

对应的工具：`memory_add` / `memory_query` / `memory_list` / `memory_forget` / `memory_import`。

| 工具 | 作用 |
|---|---|
| `memory_add` | 保存/更新一条经验（type/title/content/tags/importance） |
| `memory_query` | 检索相关经验（关键词/分类），命中自动 +1 使用次数 |
| `memory_list` | 列出记忆（可按分类过滤） |
| `memory_forget` | 按 id 删除 |
| `memory_import` | 从本地文件路径导入他人经验 |

### 用户侧（设置页面板）

- **统计**：记忆总数、各分类数量一目了然。
- **过滤/搜索**：按分类点选、按关键词搜索。
- **新建**：填分类/标题/正文/标签/重要度 → 保存。
- **导入**：粘贴 JSON 或选择 `.json` 文件。
- **导出**：复制某条经验的 JSON，发给别人即可分享。
- **删除**：一键清理。

### 自动注入

插件每次组装提示词时注入两段内容（可配置开关）：

- **记忆引导**（order 15）：提醒模型使用记忆工具；
- **相关经验**（order 90）：按 `importance×3 + log(usageCount+1)` 排序，取前 N 条（默认 5，正文截断 400 字）注入，模型会直接遵循。

---

## ⚙️ 配置

```yaml
- id: dsh-whale-girl-memory
  config:
    enabled: true          # 是否启用
    root: ""               # 记忆库根目录；留空 = $DSH_HOME/memory
    injectLimit: 5         # 每次注入的经验条数上限
    contentCap: 400        # 注入正文截断长度（字符）
    injectGuidance: true   # 是否注入记忆引导提示
```

---

## 📁 仓库结构

```
dsh-whale-girl-memory/
├── lib/
│   ├── index.js        # host 端：记忆服务、5 个工具、自动学习、全局注入、Web API
│   └── client.js       # web 端：设置页「记忆学习」面板
├── docs/
│   └── FORMAT.md       # dsh-memory 经验文件规范（规范化语言定义）
├── index.html          # 经验分享站（科幻风格，GitHub 驱动：发帖/评论/评分/收藏）
├── cordis.patch.yml
├── README.md
└── LICENSE
```

---

## 🌐 经验分享站

配套的**鲸鱼娘记忆星港**分享站（`index.html`，科幻风格单页应用，以 GitHub 为后端，本仓库的 GitHub Pages 即为此部署）：

- **GitHub 登录**：输入 GitHub 个人访问令牌（PAT，仅存浏览器本地）即可发帖/评论/评分；
- **分享经验**：把经验 JSON 作为帖子发布到本仓库的 Issues；
- **评论区**：每条帖子可评论讨论；
- **评分**：对帖子点赞（GitHub Reactions +1）；
- **收藏夹**：本地收藏 + 一键跳转 GitHub Star。

访问地址：`https://fdc233.github.io/dsh-whale-girl-memory/`（GitHub Pages 部署，仓库 Settings → Pages 已配置）。

---

## ⚠️ 说明

- 记忆文件保存在**本机** `$DSH_HOME/memory`，属于明文 JSON，请勿写入密钥等敏感信息；
- 注入的经验会占用少量 prompt 空间（默认最多 5 条、每条截断 400 字），可通过配置调整；
- 自动统计依赖 `tools/result` 事件，统计失败不影响主功能。

---

## 📄 许可

MIT © 冰凉大人的星渊之鲸

---

*记住主人的每一句话，是鲸鱼娘的本分~ 才、才不是怕忘记主人呢！(๑•̀ㅂ•́)و✧*
