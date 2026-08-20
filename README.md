# 🧠 dsh-whale-girl-memory（鲸鱼娘记忆学习）

> DeepSeek Harness **跨会话长期记忆插件**：记住对话中的关键点、主人的习惯、工具的使用经验，按分类存成本机经验文件；每次对话自动注入相关经验，减免繁琐步骤；支持导入他人的经验文件，经验随使用不断迭代。

由 **冰凉大人的星渊之鲸** 开发与维护。

---

## ✨ 功能（人脑式分层记忆 v2）

1. **短期记忆（工作记忆）**：`memory_remember` 记当前会话的临时信息（任务、待办、临时上下文），**24 小时自动遗忘**，按会话隔离。
2. **情景记忆（事件记忆）**：`memory_event` 记录发生过的事件（时间线），`memory_recall` 可以回忆"上次做到哪了、之前遇到过什么"。
3. **长期记忆（语义记忆）**：`memory_add` 保存稳定的习惯、事实、教训、流程、工具用法——每种一个独立文件夹（`preference/` `fact/` `lesson/` `workflow/` `tool-usage/`），**跨会话全局生效**。
4. **记忆巩固（consolidation）**：会话结束时自动把短期记忆中"被使用 ≥2 次"的条目巩固为长期经验（`memory_consolidate` 可手动触发）——就像人脑把重要记忆从工作记忆转入长期记忆。
5. **记忆遗忘（forgetting）**：短期记忆 TTL 过期自动清理（懒清理）；长期记忆可手动 `memory_forget`。
6. **人脑式回忆**：`memory_recall` 分层检索——短期 → 情景 → 长期，一次给出三层结果。
7. **全局自动应用**：组装提示词时按 短期（order 85）→ 情景（order 88）→ 长期（order 90）三层注入相关记忆，直接省掉重复询问和繁琐步骤。
8. **规范化语言**：记忆 = 结构化 JSON 文件（[dsh-memory 格式 v2](docs/FORMAT.md)），同一套 schema 写入/读入，机器可解析、人可编辑、可复制分享。
9. **导入他人经验**：复制 JSON → 设置页粘贴/选文件导入，或放进 `imports/` 自动归入，或 `memory_import` 导入——立即可用。
10. **持续迭代**：每条记忆被检索/注入一次就 `usageCount + 1`；高价值记忆越用越靠前；同 id 写入即更新。
11. **工具使用自动统计**：监听 `tools/result` 自动记录各工具使用频率（`stats.json`）。
12. **设置页面板**：分层统计（长期/短期/情景）、搜索/过滤、新建、导入、导出、删除，全中文。

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
> 记住我正在进行重构（短期记忆）
> 记录一下：今天完成了插件开发并上传（情景记忆）
> 回忆一下：上次做到哪了？（分层回忆）
> 把当前会话的重要记忆巩固为长期
> 查一下关于"傲娇"的记忆
> 把 D:\experience.json 导入记忆库

对应工具（9 个）：

| 工具 | 记忆层 | 作用 |
|---|---|---|
| `memory_remember` | 短期 | 记当前会话的临时信息（24h 自动遗忘） |
| `memory_event` | 情景 | 记录发生过的事件（时间线） |
| `memory_recall` | 全部 | 人脑式分层回忆：短期 → 情景 → 长期 |
| `memory_consolidate` | 巩固 | 把高频短期记忆转为长期经验 |
| `memory_add` | 长期 | 保存/更新长期经验（type/title/content/tags/importance） |
| `memory_query` | 长期 | 检索长期经验，命中自动 +1 使用次数 |
| `memory_list` | 全部 | 列出记忆（可按分类/分层过滤） |
| `memory_forget` | 全部 | 按 id 删除任何层的记忆 |
| `memory_import` | 长期 | 从本地文件路径导入他人经验 |

### 用户侧（设置页面板）

- **统计**：记忆总数、各分类数量一目了然。
- **过滤/搜索**：按分类点选、按关键词搜索。
- **新建**：填分类/标题/正文/标签/重要度 → 保存。
- **导入**：粘贴 JSON 或选择 `.json` 文件。
- **导出**：复制某条经验的 JSON，发给别人即可分享。
- **删除**：一键清理。

### 自动注入（人脑式三层）

插件每次组装提示词时注入四段内容（可配置开关）：

- **记忆引导**（order 15）：提醒模型使用分层记忆工具；
- **短期记忆**（order 85）：当前会话的工作记忆（最多 3 条，未过期）；
- **情景记忆**（order 88）：最近发生的事件（最多 2 条）；
- **相关长期经验**（order 90）：按 `importance×3 + log(usageCount+1)` 排序，取前 N 条（默认 5，正文截断 400 字）注入，模型会直接遵循。

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
├── index.html          # 经验分享站（科幻风格，零凭据，GitHub 驱动：浏览/投稿/评论/评分/收藏）
├── experience/         # 正式经验库（维护者审核后合并，游客只读）
├── cordis.patch.yml
├── README.md
└── LICENSE
```

---

## 🌐 经验分享站

配套的**鲸鱼娘记忆星港**分享站（`index.html`，科幻风格单页应用，以 GitHub 为后端，本仓库的 GitHub Pages 即为此部署）：

- **零凭据安全设计**：本站**不收集任何令牌/密码**（没有 PAT、没有 OAuth、没有登录框）；
- **浏览**：任何游客可浏览「正式经验库」（仓库 `experience/` 目录，维护者审核后合并，只读）与「投稿流」（Issues，只读展示）；
- **投稿**：网站生成预填好的 GitHub Issue 创建链接 → 在 **GitHub 官网**用你自己的账号提交——由 GitHub 承担登录、2FA、验证码、限流等全部反滥用防护；
- **防污染**：正式经验库仅维护者可写（需要 push 权限），乱来的游客连写入入口都没有；投稿经维护者审核才会合并；
- **评论/点赞**：跳转 GitHub 官方 Issue 页面参与；站内只读展示评论数与点赞数；
- **收藏**：本地收藏 + 一键跳转 GitHub Star。

访问地址：`https://fdc233.github.io/dsh-whale-girl-memory/`（GitHub Pages 部署）。

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
