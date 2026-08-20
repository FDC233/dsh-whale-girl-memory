# dsh-memory 记忆规范（Format v2 · 人脑式分层记忆）

鲸鱼娘记忆学习插件的**规范化记忆语言**：每一条记忆 = 一个 JSON 文件，机器可读、人可编辑、可复制分享。

## 🧠 分层架构（对应人脑）

| 层 | 对应人脑 | 目录 | 生命周期 | 作用 |
|---|---|---|---|---|
| **短期记忆** | 工作记忆 | `short-term/` | 24 小时自动遗忘（TTL） | 当前会话的临时信息、进行中的任务；会话结束时高频使用的自动巩固为长期 |
| **情景记忆** | 情景记忆 | `episodic/` | 长期保留 | 具体发生过的事件（时间线），用于"我上次做到哪了" |
| **长期记忆** | 语义记忆 | `preference/` `fact/` `lesson/` `workflow/` `tool-usage/` | 长期保留 | 稳定的习惯、事实、教训、流程、工具用法（按重要度×使用次数注入） |
| **巩固** | 记忆巩固 | — | 自动/手动 | 会话结束时把短期记忆中使用 ≥2 次的条目转为长期经验 |
| **遗忘** | 遗忘 | — | 自动/手动 | 短期 TTL 过期懒清理；长期可手动删除 |

## 📁 目录结构

```
$DSH_HOME/memory/
├── short-term/        # 短期记忆（工作记忆，24h TTL）
├── episodic/          # 情景记忆（事件记录）
├── preference/        # 长期：用户习惯 / 偏好
├── fact/              # 长期：关键事实
├── lesson/            # 长期：经验教训
├── workflow/          # 长期：流程技巧
├── tool-usage/        # 长期：工具使用经验
├── imports/           # 待导入文件（启动时自动归入）
└── stats.json         # 工具使用频率统计（自动生成）
```

## 1️⃣ 长期记忆格式（v1 兼容，语义记忆）

```json
{
  "id": "mem-<时间戳>-<随机>",
  "type": "preference | fact | lesson | workflow | tool-usage",
  "title": "短标题（必填）",
  "content": "经验正文（必填，规范化的自然语言指令，会注入提示词）",
  "tags": ["标签"],
  "importance": 3,
  "usageCount": 0,
  "createdAt": "2026-08-18T00:00:00.000Z",
  "updatedAt": "2026-08-18T00:00:00.000Z"
}
```

## 2️⃣ 短期记忆格式（工作记忆）

```json
{
  "id": "stm-<时间戳>-<随机>",
  "sessionId": "session-xxx",
  "title": "短标题（必填）",
  "content": "临时信息（必填）",
  "tags": ["标签"],
  "importance": 3,
  "usageCount": 0,
  "longType": "lesson",
  "createdAt": "2026-08-18T00:00:00.000Z",
  "updatedAt": "2026-08-18T00:00:00.000Z",
  "expiresAt": "2026-08-19T00:00:00.000Z"
}
```

- `sessionId`：所属会话（按会话隔离，不同会话互不可见）
- `expiresAt`：24 小时后自动遗忘（读取时懒清理）
- `longType`：巩固为长期记忆时的目标分类（preference/fact/lesson/workflow/tool-usage）

## 3️⃣ 情景记忆格式（事件记录）

```json
{
  "id": "epi-<时间戳>-<随机>",
  "title": "事件标题（必填），例如「完成鲸鱼娘画图插件开发并上传 GitHub」",
  "content": "事件详情（发生了什么、结果如何）",
  "tags": ["标签"],
  "importance": 3,
  "occurredAt": "2026-08-18T12:00:00.000Z",
  "createdAt": "2026-08-18T12:00:00.000Z"
}
```

## 🛠 对应工具

| 工具 | 记忆层 | 用途 |
|---|---|---|
| `memory_remember` | 短期 | 记当前会话的临时信息（TTL 24h） |
| `memory_event` | 情景 | 记录发生过的事件 |
| `memory_recall` | 全部 | 人脑式分层回忆：短期 → 情景 → 长期 |
| `memory_consolidate` | 巩固 | 把高频短期记忆转长期 |
| `memory_add` | 长期 | 保存/更新长期经验 |
| `memory_query` | 长期 | 检索长期经验（命中自动 +1） |
| `memory_list` | 全部 | 列出（可按分类/分层过滤） |
| `memory_forget` | 全部 | 按 id 删除任何层的记忆 |
| `memory_import` | 长期 | 导入他人经验文件 |

## 🔄 自动行为

- **自动巩固**：会话结束（`session/disposed`）时，把该会话短期记忆中使用 ≥2 次的条目转为长期经验；
- **自动遗忘**：短期记忆超过 24 小时未用，读取时自动清理；
- **自动打点**：每次被检索/注入，`usageCount + 1`，高价值记忆越用越靠前；
- **自动注入**：组装提示词时注入 短期（order 85）→ 情景（order 88）→ 长期（order 90）三层相关记忆。

## 📤 导入 / 导出（分享经验）

- 导出：设置页「记忆学习」面板每条记忆的「复制」按钮；
- 导入：粘贴 JSON / 选择文件 / 放进 `imports/` 自动归入 / `memory_import` 工具。
- 校验：导入时校验 schema，非法文件拒绝并提示。
