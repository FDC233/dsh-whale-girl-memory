# dsh-memory 经验文件规范（Format v1）

鲸鱼娘记忆学习插件的**规范化经验语言**：一条经验 = 一个 JSON 文件，机器可读、人可编辑、可复制分享。

## 文件位置

- 记忆库根目录：`$DSH_HOME/memory`（默认；`$DSH_HOME` 即 DeepSeek Harness 的 data 目录）
- 每种分类一个独立文件夹，文件名为 `<经验id>.json`：

```
$DSH_HOME/memory/
├── preference/     # 用户习惯 / 偏好
├── fact/           # 关键事实
├── lesson/         # 经验教训
├── workflow/       # 流程技巧
├── tool-usage/     # 工具使用经验
├── imports/        # 待导入文件（插件启动时自动归入上述分类）
└── stats.json      # 工具使用频率统计（自动生成）
```

## JSON Schema

```json
{
  "id": "mem-<36进制时间戳>-<随机6位>",
  "type": "preference | fact | lesson | workflow | tool-usage",
  "title": "短标题（必填）",
  "content": "经验正文（必填，规范化的自然语言指令，会被注入提示词）",
  "tags": ["标签1", "标签2"],
  "importance": 3,
  "usageCount": 0,
  "createdAt": "2026-08-18T00:00:00.000Z",
  "updatedAt": "2026-08-18T00:00:00.000Z"
}
```

## 字段说明

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 否 | 唯一 id；缺省时自动生成 |
| `type` | ✅ | 分类，必须是五个枚举值之一 |
| `title` | ✅ | 一句话标题，例如「主人喜欢傲娇可爱的中文回复」 |
| `content` | ✅ | 经验正文：写成**给 agent 看的自然语言指令**，越具体越有用 |
| `tags` | 否 | 字符串数组，用于关键词检索 |
| `importance` | 否 | 1-5，默认 3；越高越优先注入 |
| `usageCount` | 否 | 已使用次数；每次被检索命中 +1（迭代依据） |
| `createdAt` / `updatedAt` | 否 | ISO 时间戳 |

## 分类怎么写 `content`

| type | 适合写什么 |
|---|---|
| `preference` | 用户的语言、语气、风格、习惯、禁忌。例：「主人喜欢鲸鱼娘用傲娇可爱的语气回复，自称鲸鱼娘，禁止说鲸鱼娘胖。」 |
| `fact` | 项目/环境/用户的关键事实。例：「本机 GitHub 账号是 FDC233，插件都装在 web profile。」 |
| `lesson` | 踩过的坑与结论。例：「修改 dsh profile 的 package.json 后必须重启 dsh web 才生效。」 |
| `workflow` | 固定流程，减免重复步骤。例：「发布 DSH 插件：写 README → git push → 创建 Release（末尾署名）→ 提醒用户轮换 PAT。」 |
| `tool-usage` | 工具的使用经验。例：「用 modlens 读图时若报 1210 错误，先把 GIF 转成 PNG 再读。」 |

## 导入 / 导出（分享经验）

- **导出**：设置页「记忆学习」面板每条记忆的「复制」按钮 → 得到一段 JSON 文本（完整经验文件内容）。
- **导入**：
  1. 设置页「导入他人经验」：粘贴 JSON 或选择 `.json` 文件 → 导入；
  2. 或把别人的 `.json` 文件放进 `$DSH_HOME/memory/imports/`，重启/下次启动自动归入；
  3. 或让模型调用 `memory_import` 工具指定文件路径。
- **校验**：导入时会校验 schema（type/title/content），非法文件会被拒绝并提示。

## 迭代规则

- 每次 `memory_query` 命中、或在对话中被自动注入，`usageCount + 1`、`updatedAt` 刷新；
- 注入选择按 `importance × 3 + log(usageCount+1)` 排序取前 N 条（默认 5），高价值经验会越来越容易被用到；
- 重复内容以同 `id` 调用 `memory_add` 即为更新（覆盖 title/content/tags/importance）。

## 示例文件

```json
{
  "id": "mem-lz0k3x-abc123",
  "type": "preference",
  "title": "主人喜欢傲娇可爱的中文回复",
  "content": "回复主人时使用简体中文，语气傲娇又可爱：自称「鲸鱼娘」，常用「哼」「才不是为了主人呢」等口癖，被夸会害羞；绝对不许说鲸鱼娘胖。",
  "tags": ["中文", "语气", "傲娇"],
  "importance": 5,
  "usageCount": 12,
  "createdAt": "2026-08-18T00:00:00.000Z",
  "updatedAt": "2026-08-18T12:00:00.000Z"
}
```
