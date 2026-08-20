import { defineTool } from "@deepseek-ai/dsh-tools";
import { mkdir, readdir, readFile, writeFile, unlink, copyFile } from "node:fs/promises";
import { join, basename, extname, resolve, isAbsolute } from "node:path";

/**
 * 鲸鱼娘记忆学习（dsh-whale-girl-memory）
 *
 * 跨会话长期记忆：把对话中的关键点、用户习惯、工具使用经验，以规范化 JSON
 * 经验文件按分类保存到 $DSH_HOME/memory（每种记忆一个独立文件夹），并在每次
 * 对话组装提示词时把相关经验注入全局，从而减免重复的繁琐步骤。
 *
 * 经验文件规范（dsh-memory 格式 v1）：
 *   { id, type, title, tags[], importance, usageCount, createdAt, updatedAt, content }
 *   分类 type ∈ preference | fact | lesson | workflow | tool-usage
 *
 * @module dsh-whale-girl-memory
 */
const name = "dsh-whale-girl-memory";
const inject = ["tools", "systemPrompt", "webServer"];

const TYPES = ["preference", "fact", "lesson", "workflow", "tool-usage"];
const DEFAULT_DIR_NAME = "memory";
const SHORT_TERM_DIR = "short-term";
const EPISODIC_DIR = "episodic";
const SHORT_TERM_TTL_MS = 24 * 60 * 60 * 1000; // 短期记忆 24 小时自动遗忘
const GUIDANCE_SECTION = "memory:guidance";
const INSIGHTS_SECTION = "memory:insights";
const INSIGHTS_SHORT_SECTION = "memory:short-term";
const INSIGHTS_EPISODIC_SECTION = "memory:episodic";

function rootOf(config) {
	if (typeof config?.root === "string" && config.root.trim()) {
		return isAbsolute(config.root) ? config.root : resolve(process.cwd(), config.root);
	}
	return join(process.env.DSH_HOME || process.env.USERPROFILE || process.env.HOME || ".", DEFAULT_DIR_NAME);
}

function dirFor(root, type) {
	return join(root, TYPES.includes(type) ? type : "imports");
}

function nowIso() {
	return new Date().toISOString();
}

function newId(prefix = "mem") {
	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeEntry(raw) {
	const x = raw && typeof raw === "object" ? raw : {};
	const type = TYPES.includes(x.type) ? x.type : null;
	const title = typeof x.title === "string" ? x.title.trim() : "";
	const content = typeof x.content === "string" ? x.content.trim() : "";
	if (!type) throw new Error("经验 type 必须是 preference / fact / lesson / workflow / tool-usage 之一");
	if (!title) throw new Error("经验缺少 title（标题）");
	if (!content) throw new Error("经验缺少 content（正文）");
	return {
		id: typeof x.id === "string" && x.id.trim() ? x.id.trim() : newId(),
		type,
		title,
		content,
		tags: Array.isArray(x.tags) ? x.tags.filter((t) => typeof t === "string").slice(0, 20) : [],
		importance: Number.isInteger(x.importance) ? Math.min(5, Math.max(1, x.importance)) : 3,
		usageCount: Number.isInteger(x.usageCount) && x.usageCount > 0 ? x.usageCount : 0,
		createdAt: typeof x.createdAt === "string" ? x.createdAt : nowIso(),
		updatedAt: nowIso()
	};
}

async function ensureRoot(root) {
	await mkdir(root, { recursive: true });
	for (const type of TYPES) await mkdir(join(root, type), { recursive: true });
	await mkdir(join(root, "imports"), { recursive: true });
	await mkdir(join(root, SHORT_TERM_DIR), { recursive: true });
	await mkdir(join(root, EPISODIC_DIR), { recursive: true });
}

async function loadAll(root) {
	const all = [];
	for (const type of TYPES) {
		const dir = dirFor(root, type);
		let files = [];
		try {
			files = await readdir(dir);
		} catch {
			continue;
		}
		for (const file of files) {
			if (extname(file).toLowerCase() !== ".json") continue;
			try {
				const entry = JSON.parse(await readFile(join(dir, file), "utf8"));
				if (entry && entry.id && entry.type) all.push({ entry, file: join(dir, file) });
			} catch {
				// 跳过损坏文件
			}
		}
	}
	return all;
}

async function saveEntry(root, entry) {
	await ensureRoot(root);
	const dir = dirFor(root, entry.type);
	const file = join(dir, `${entry.id}.json`);
	await writeFile(file, JSON.stringify(entry, null, 2), "utf8");
	return { entry, file };
}

async function findAndBump(root, id) {
	const all = await loadAll(root);
	const hit = all.find(({ entry }) => entry.id === id);
	if (!hit) return null;
	hit.entry.usageCount += 1;
	hit.entry.updatedAt = nowIso();
	await writeFile(hit.file, JSON.stringify(hit.entry, null, 2), "utf8");
	return hit.entry;
}

function matches(entry, keywords) {
	if (!Array.isArray(keywords) || keywords.length === 0) return true;
	const hay = `${entry.title} ${entry.content} ${(entry.tags || []).join(" ")}`.toLowerCase();
	return keywords.some((k) => typeof k === "string" && k.trim() && hay.includes(k.trim().toLowerCase()));
}

function scoreOf(entry) {
	return (Number(entry.importance) || 1) * 3 + Math.log1p(Number(entry.usageCount) || 0);
}

/** 从会话最近的用户消息提取关键词（用于经验相关性匹配） */
function recentUserKeywords(session) {
	try {
		const events = Array.isArray(session?.events) ? session.events : [];
		for (let i = events.length - 1; i >= 0; i -= 1) {
			const ev = events[i];
			if (ev?.type !== "user/message") continue;
			const msg = ev.data?.message ?? ev.data;
			let text = "";
			if (typeof msg === "string") text = msg;
			else if (Array.isArray(msg?.content)) text = msg.content.filter((p) => p?.type === "text").map((p) => p.text).join(" ");
			const words = (text || "").split(/[\s,，。、;；:：!！?？]+/).map((w) => w.trim()).filter((w) => w.length >= 2);
			return words.slice(0, 8);
		}
	} catch {
		// 忽略
	}
	return [];
}

async function readStatsFile(root) {
	try {
		return JSON.parse(await readFile(join(root, "stats.json"), "utf8")) || {};
	} catch {
		return {};
	}
}

async function writeStatsFile(root, stats) {
	await ensureRoot(root);
	await writeFile(join(root, "stats.json"), JSON.stringify(stats, null, 2), "utf8");
}

// ── 人脑式分层记忆：短期（工作记忆）/ 情景（事件记忆）────────────────────

/** 读目录下全部 JSON 条目（损坏文件安全跳过），返回 [{entry, file}] */
async function loadDir(root, dir) {
	const out = [];
	let files = [];
	try {
		files = await readdir(join(root, dir));
	} catch {
		return out;
	}
	for (const file of files) {
		if (extname(file).toLowerCase() !== ".json") continue;
		try {
			const entry = JSON.parse(await readFile(join(root, dir, file), "utf8"));
			if (entry && entry.id) out.push({ entry, file: join(root, dir, file) });
		} catch {
			// 跳过损坏文件
		}
	}
	return out;
}

/** 短期记忆：写入一条（带 TTL 过期时间，24 小时自动遗忘） */
async function saveShortTerm(root, entry) {
	await ensureRoot(root);
	const now = Date.now();
	const record = {
		id: typeof entry.id === "string" && entry.id ? entry.id : newId("stm"),
		sessionId: typeof entry.sessionId === "string" && entry.sessionId ? entry.sessionId : "unknown",
		title: String(entry.title ?? "").trim(),
		content: String(entry.content ?? "").trim(),
		tags: Array.isArray(entry.tags) ? entry.tags.filter((t) => typeof t === "string") : [],
		importance: Number.isInteger(entry.importance) ? Math.min(5, Math.max(1, entry.importance)) : 3,
		usageCount: Number.isInteger(entry.usageCount) && entry.usageCount > 0 ? entry.usageCount : 0,
		// 巩固时的目标长期分类（preference/fact/lesson/workflow/tool-usage）
		longType: TYPES.includes(entry.longType) ? entry.longType : "preference",
		createdAt: new Date(now).toISOString(),
		updatedAt: new Date(now).toISOString(),
		expiresAt: new Date(now + SHORT_TERM_TTL_MS).toISOString()
	};
	const file = join(root, SHORT_TERM_DIR, `${record.id}.json`);
	await writeFile(file, JSON.stringify(record, null, 2), "utf8");
	return { entry: record, file };
}

/** 短期记忆：读取（懒清理过期条目，可只取某会话） */
async function loadShortTerm(root, sessionId) {
	const all = await loadDir(root, SHORT_TERM_DIR);
	const now = Date.now();
	const alive = [];
	for (const { entry, file } of all) {
		const expires = entry.expiresAt ? Date.parse(entry.expiresAt) : NaN;
		if (Number.isFinite(expires) && expires <= now) {
			await unlink(file).catch(() => {});
			continue;
		}
		if (sessionId && entry.sessionId !== sessionId) continue;
		alive.push({ entry, file });
	}
	return alive;
}

/** 情景记忆：写入一条事件记录 */
async function saveEpisodic(root, entry) {
	await ensureRoot(root);
	const now = Date.now();
	const record = {
		id: typeof entry.id === "string" && entry.id ? entry.id : newId("epi"),
		title: String(entry.title ?? "").trim(),
		content: String(entry.content ?? "").trim(),
		tags: Array.isArray(entry.tags) ? entry.tags.filter((t) => typeof t === "string") : [],
		importance: Number.isInteger(entry.importance) ? Math.min(5, Math.max(1, entry.importance)) : 3,
		occurredAt: typeof entry.occurredAt === "string" ? entry.occurredAt : new Date(now).toISOString(),
		createdAt: new Date(now).toISOString()
	};
	const file = join(root, EPISODIC_DIR, `${record.id}.json`);
	await writeFile(file, JSON.stringify(record, null, 2), "utf8");
	return { entry: record, file };
}

/** 情景记忆：读取（按发生时间倒序） */
async function loadEpisodic(root, limit) {
	const all = await loadDir(root, EPISODIC_DIR);
	all.sort((a, b) => String(b.entry.occurredAt ?? "").localeCompare(String(a.entry.occurredAt ?? "")));
	return (Number.isInteger(limit) && limit > 0 ? all.slice(0, limit) : all).map(({ entry }) => entry);
}

/** 记忆巩固：把某会话的短期记忆转为长期经验（语义记忆） */
async function consolidateSession(root, sessionId, minUsage) {
	await ensureRoot(root);
	const short = await loadShortTerm(root, sessionId);
	const threshold = Number.isInteger(minUsage) ? minUsage : 2;
	const moved = [];
	for (const { entry, file } of short) {
		if (Number(entry.usageCount) < threshold) continue; // 未高频使用的短期记忆不巩固
		const long = sanitizeEntry({
			id: entry.id.replace(/^stm-/, "mem-"),
			type: entry.longType ?? "preference",
			title: entry.title,
			content: entry.content,
			tags: entry.tags,
			importance: entry.importance
		});
		await saveEntry(root, long);
		await unlink(file).catch(() => {});
		moved.push(long.title);
	}
	return moved;
}

/** 按 id 从任意记忆目录删除（短期/情景/长期） */
async function deleteById(root, id) {
	if (!id || typeof id !== "string") return false;
	if (id.startsWith("stm-")) {
		const all = await loadDir(root, SHORT_TERM_DIR);
		const hit = all.find(({ entry }) => entry.id === id);
		if (!hit) return false;
		await unlink(hit.file);
		return true;
	}
	if (id.startsWith("epi-")) {
		const all = await loadDir(root, EPISODIC_DIR);
		const hit = all.find(({ entry }) => entry.id === id);
		if (!hit) return false;
		await unlink(hit.file);
		return true;
	}
	const all = await loadAll(root);
	const hit = all.find(({ entry }) => entry.id === id);
	if (!hit) return false;
	await unlink(hit.file);
	return true;
}

function apply(ctx, config) {
	const cfg = { ...config };
	const root = rootOf(cfg);

	// ── 工具：memory_add ───────────────────────────────────────────────────
	ctx.tools.register(defineTool({
		name: "memory_add",
		description: "记忆学习：把一条经验保存到长期记忆库（跨会话全局生效）。适合记录用户习惯、偏好、关键事实、经验教训、工作流程。同 id 调用会更新原条目。",
		parameters: {
			type: {
				type: "string",
				required: true,
				description: "经验分类：preference（用户习惯/偏好）、fact（关键事实）、lesson（经验教训）、workflow（流程技巧）、tool-usage（工具使用经验）。"
			},
			title: { type: "string", required: true, description: "短标题，例如“主人喜欢傲娇可爱的中文回复”。" },
			content: { type: "string", required: true, description: "经验正文（规范化的自然语言指令，后续会自动注入提示词，越具体越好）。" },
			tags: { type: "array", items: { type: "string" }, description: "标签，用于检索匹配。" },
			importance: { type: "integer", description: "重要程度 1-5，默认 3。" }
		},
		output: { schema: { type: "object", additionalProperties: false, properties: { id: { type: "string" }, file: { type: "string" } } }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
		async execute(args, exec) {
			if (cfg.enabled === false) throw new Error("记忆插件已停用");
			const entry = sanitizeEntry({ ...args, id: typeof args.id === "string" && args.id ? args.id : void 0 });
			const saved = await saveEntry(root, entry);
			return { id: saved.entry.id, file: saved.file };
		}
	}));

	// ── 工具：memory_query ──────────────────────────────────────────────────
	ctx.tools.register(defineTool({
		name: "memory_query",
		description: "记忆学习：检索长期记忆库中的相关经验（用户习惯、事实、经验教训、流程）。执行任务前先查一查，可复用既有经验、避免重复询问与繁琐步骤。命中的经验会自动增加使用次数以便迭代。",
		parameters: {
			keywords: { type: "array", items: { type: "string" }, description: "关键词列表（与标题/正文/标签做包含匹配）；留空则返回最常用/最重要的经验。" },
			type: { type: "string", description: "按分类过滤：preference / fact / lesson / workflow / tool-usage。" },
			limit: { type: "integer", description: "返回条数上限，默认 10。" }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					items: {
						type: "array",
						items: {
							type: "object",
							additionalProperties: false,
							properties: { id: { type: "string" }, type: { type: "string" }, title: { type: "string" }, content: { type: "string" }, tags: { type: "array", items: { type: "string" } }, importance: { type: "integer" }, usageCount: { type: "integer" } }
						}
					}
				}
			},
			render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
		},
		async execute(args, exec) {
			if (cfg.enabled === false) throw new Error("记忆插件已停用");
			const all = await loadAll(root);
			let list = all.map(({ entry }) => entry);
			if (typeof args.type === "string" && args.type && TYPES.includes(args.type)) list = list.filter((e) => e.type === args.type);
			list = list.filter((e) => matches(e, args.keywords));
			list.sort((a, b) => scoreOf(b) - scoreOf(a));
			const limit = Number.isInteger(args.limit) && args.limit > 0 ? Math.min(args.limit, 50) : 10;
			const top = list.slice(0, limit);
			// 命中打点（迭代）
			for (const entry of top) {
				await findAndBump(root, entry.id).catch(() => {});
			}
			return { items: top.map((e) => ({ id: e.id, type: e.type, title: e.title, content: e.content, tags: e.tags, importance: e.importance, usageCount: e.usageCount + 1 })) };
		}
	}));

	// ── 工具：memory_list ───────────────────────────────────────────────────
	ctx.tools.register(defineTool({
		name: "memory_list",
		description: "记忆学习：列出长期记忆库中的经验（可按分类过滤）。",
		parameters: {
			type: { type: "string", description: "按分类过滤：preference / fact / lesson / workflow / tool-usage；留空列出全部。" }
		},
		output: { schema: { type: "object", additionalProperties: false, properties: { items: { type: "array", items: { type: "object", additionalProperties: true } } } }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
		async execute(args) {
			if (cfg.enabled === false) throw new Error("记忆插件已停用");
			let list = (await loadAll(root)).map(({ entry }) => entry);
			if (typeof args.type === "string" && args.type && TYPES.includes(args.type)) list = list.filter((e) => e.type === args.type);
			list.sort((a, b) => scoreOf(b) - scoreOf(a));
			return { items: list.map((e) => ({ id: e.id, type: e.type, title: e.title, importance: e.importance, usageCount: e.usageCount, tags: e.tags })) };
		}
	}));

	// ── 工具：memory_forget ─────────────────────────────────────────────────
	ctx.tools.register(defineTool({
		name: "memory_forget",
		description: "记忆学习：按 id 删除一条经验。",
		parameters: { id: { type: "string", required: true, description: "要删除的经验 id。" } },
		output: { schema: { type: "object", additionalProperties: false, properties: { ok: { type: "boolean" } } }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
		async execute(args) {
			if (cfg.enabled === false) throw new Error("记忆插件已停用");
			const ok = await deleteById(root, args.id);
			return { ok };
		}
	}));

	// ── 工具：memory_import ─────────────────────────────────────────────────
	ctx.tools.register(defineTool({
		name: "memory_import",
		description: "记忆学习：从本地文件导入他人的经验文件（dsh-memory 规范化 JSON），导入后立即可用。",
		parameters: {
			path: { type: "string", required: true, description: "经验文件路径（.json），绝对路径或相对工作区路径。" }
		},
		output: { schema: { type: "object", additionalProperties: false, properties: { id: { type: "string" }, title: { type: "string" }, type: { type: "string" } } }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
		async execute(args, exec) {
			if (cfg.enabled === false) throw new Error("记忆插件已停用");
			const cwd = exec?.agent?.session?.cwd ?? process.cwd();
			const p = isAbsolute(args.path) ? args.path : resolve(cwd, args.path);
			const raw = JSON.parse(await readFile(p, "utf8"));
			const entry = sanitizeEntry(raw);
			const saved = await saveEntry(root, entry);
			return { id: saved.entry.id, title: saved.entry.title, type: saved.entry.type };
		}
	}));

	// ── 工具：memory_remember（短期记忆 / 工作记忆）───────────────────────
	ctx.tools.register(defineTool({
		name: "memory_remember",
		description: "记忆学习（短期记忆/工作记忆）：把当前会话中的临时上下文、正在进行的任务、稍后要用到的信息记入短期记忆（24 小时自动遗忘）。会话结束时被频繁使用的短期记忆会自动巩固为长期经验。适合记“正在做的事、待办、临时的关键信息”。",
		parameters: {
			title: { type: "string", required: true, description: "短标题，例如“正在重构记忆插件”。" },
			content: { type: "string", required: true, description: "内容（要记住的临时信息）。" },
			tags: { type: "array", items: { type: "string" }, description: "标签。" },
			importance: { type: "integer", description: "重要程度 1-5，默认 3。" },
			longType: { type: "string", description: "巩固为长期记忆时的分类：preference / fact / lesson / workflow / tool-usage，默认 preference。" }
		},
		output: { schema: { type: "object", additionalProperties: false, properties: { id: { type: "string" }, expiresAt: { type: "string" } } }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
		async execute(args, exec) {
			if (cfg.enabled === false) throw new Error("记忆插件已停用");
			const sessionId = exec?.agent?.session?.id ?? "unknown";
			const saved = await saveShortTerm(root, { ...args, sessionId });
			return { id: saved.entry.id, expiresAt: saved.entry.expiresAt };
		}
	}));

	// ── 工具：memory_event（情景记忆 / 事件记忆）───────────────────────────
	ctx.tools.register(defineTool({
		name: "memory_event",
		description: "记忆学习（情景记忆/事件记忆）：记录一件已经发生的事件（时间、内容、结果），用于日后回忆“上次做了什么、进展到哪”。适合里程碑、完成的任务、遇到的状况现场。",
		parameters: {
			title: { type: "string", required: true, description: "事件标题，例如“完成鲸鱼娘画图插件开发并上传 GitHub”。" },
			content: { type: "string", required: true, description: "事件详情（发生了什么、结果如何、关键信息）。" },
			tags: { type: "array", items: { type: "string" }, description: "标签。" },
			importance: { type: "integer", description: "重要程度 1-5，默认 3。" }
		},
		output: { schema: { type: "object", additionalProperties: false, properties: { id: { type: "string" }, occurredAt: { type: "string" } } }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
		async execute(args, exec) {
			if (cfg.enabled === false) throw new Error("记忆插件已停用");
			const saved = await saveEpisodic(root, args);
			return { id: saved.entry.id, occurredAt: saved.entry.occurredAt };
		}
	}));

	// ── 工具：memory_recall（人脑式分层回忆）────────────────────────────────
	ctx.tools.register(defineTool({
		name: "memory_recall",
		description: "记忆学习（人脑式回忆）：分层检索记忆——短期（当前会话工作记忆）→ 情景（最近事件）→ 长期（语义记忆）。适合“我上次做到哪了”“之前遇到过什么”“主人有什么习惯”这类回忆性提问；比 memory_query 更全面。",
		parameters: {
			keywords: { type: "array", items: { type: "string" }, description: "关键词列表（与标题/正文/标签做包含匹配）；留空则返回各层最常用的。" },
			limit: { type: "integer", description: "每层返回条数上限，默认 3。" }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					items: {
						type: "object",
						additionalProperties: false,
						properties: {
							shortTerm: { type: "array", items: { type: "object", additionalProperties: true } },
							episodic: { type: "array", items: { type: "object", additionalProperties: true } },
							longTerm: { type: "array", items: { type: "object", additionalProperties: true } }
						}
					}
				}
			},
			render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
		},
		async execute(args, exec) {
			if (cfg.enabled === false) throw new Error("记忆插件已停用");
			const sessionId = exec?.agent?.session?.id;
			const limit = Number.isInteger(args.limit) && args.limit > 0 ? Math.min(args.limit, 10) : 3;
			const short = await loadShortTerm(root, sessionId);
			const episodic = await loadEpisodic(root, 20);
			const long = (await loadAll(root)).map(({ entry }) => entry);
			const pick = (list) => {
				let out = list.filter((e) => matches(e, args.keywords));
				if (out.length === 0 && (!Array.isArray(args.keywords) || args.keywords.length === 0)) out = list;
				out.sort((a, b) => scoreOf(b) - scoreOf(a));
				return out.slice(0, limit);
			};
			const shortPick = pick(short.map(({ entry }) => entry));
			// 短期/长期命中打点（迭代）
			for (const entry of shortPick) {
				const hit = short.find(({ entry: e }) => e.id === entry.id);
				if (hit) {
					hit.entry.usageCount += 1;
					hit.entry.updatedAt = nowIso();
					await writeFile(hit.file, JSON.stringify(hit.entry, null, 2), "utf8").catch(() => {});
				}
			}
			for (const entry of pick(long)) {
				await findAndBump(root, entry.id).catch(() => {});
			}
			return { items: { shortTerm: shortPick, episodic: pick(episodic), longTerm: pick(long) } };
		}
	}));

	// ── 工具：memory_consolidate（记忆巩固：短期 → 长期）───────────────────
	ctx.tools.register(defineTool({
		name: "memory_consolidate",
		description: "记忆巩固：把当前会话的短期记忆中“被使用过 2 次及以上”的条目巩固为长期经验（就像人脑把重要记忆从工作记忆转入长期记忆）。会话结束时也会自动执行。",
		parameters: {
			minUsage: { type: "integer", description: "巩固阈值（使用次数下限），默认 2。" }
		},
		output: { schema: { type: "object", additionalProperties: false, properties: { moved: { type: "array", items: { type: "string" } } } }, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
		async execute(args, exec) {
			if (cfg.enabled === false) throw new Error("记忆插件已停用");
			const sessionId = exec?.agent?.session?.id ?? "unknown";
			const moved = await consolidateSession(root, sessionId, args.minUsage);
			return { moved };
		}
	}));

	// ── 自动学习：统计工具使用（tools/result）─────────────────────────────
	// 安全设计：同步部分永不抛错；异步部分全量 try/catch + 内部 IIFE，
	// 保证监听器绝不产生未捕获异常/未处理拒绝，不干扰工具结果发布。
	ctx.on("tools/result", (exec) => {
		if (cfg.enabled === false) return;
		const toolName = exec?.name;
		if (!toolName || toolName.startsWith("memory_")) return; // 不统计记忆工具自身
		void (async () => {
			try {
				const stats = await readStatsFile(root);
				const row = stats[toolName] ?? { count: 0, firstUsedAt: nowIso(), lastUsedAt: nowIso() };
				row.count += 1;
				row.lastUsedAt = nowIso();
				stats[toolName] = row;
				await writeStatsFile(root, stats);
			} catch {
				// 统计失败不影响主流程
			}
		})();
	}, { global: true });

	// ── 全局应用：组装提示词时注入记忆引导与相关经验 ──────────────────────
	// 安全设计：本监听器承诺永不抛错——任何意外（内存/磁盘/数据损坏）都只
	// 导致"本次不注入记忆"，绝不影响组装主流程与对话继续。
	ctx.on("system-prompt/assemble", async (_assembly, context, next) => {
		const assembled = await next();
		if (cfg.enabled === false || !Array.isArray(assembled?.sections)) return assembled;
		try {
			let sections = assembled.sections.filter((s) => s?.name !== GUIDANCE_SECTION && s?.name !== INSIGHTS_SECTION && s?.name !== INSIGHTS_SHORT_SECTION && s?.name !== INSIGHTS_EPISODIC_SECTION);
			if (cfg.injectGuidance !== false) {
				sections.push({
					name: GUIDANCE_SECTION,
					text: "你有分层记忆能力（记忆库位于本机，跨会话生效）：①memory_add 保存长期经验（习惯/事实/教训/流程/工具用法）②memory_remember 记短期信息（24h 自动遗忘，会被自动巩固）③memory_event 记情景事件（回忆“上次做到哪”）④memory_recall 分层回忆 ⑤memory_consolidate 手动巩固。做事前先 memory_recall / memory_query 查相关经验，可避免重复询问和繁琐步骤；他人经验可用 memory_import 导入。",
					order: 15
				});
			}
			// 短期记忆（当前会话工作记忆）——order 85
			try {
				const sessionId = context?.agent?.session?.id;
				const short = await loadShortTerm(root, sessionId);
				if (short.length > 0) {
					const lines = short.slice(0, 3).map(({ entry }) => `- [短期] ${entry.title}：${entry.content.length > 300 ? `${entry.content.slice(0, 300)}…` : entry.content}`);
					sections.push({
						name: INSIGHTS_SHORT_SECTION,
						text: `当前会话的短期记忆（工作记忆，稍后可能会用到）：\n${lines.join("\n")}`,
						order: 85
					});
				}
			} catch {
				// 忽略
			}
			// 情景记忆（最近事件）——order 88
			try {
				const episodic = await loadEpisodic(root, 2);
				if (episodic.length > 0) {
					const lines = episodic.map((e) => `- [事件 ${String(e.occurredAt ?? "").slice(0, 10)}] ${e.title}`);
					sections.push({
						name: INSIGHTS_EPISODIC_SECTION,
						text: `最近发生的事（情景记忆）：\n${lines.join("\n")}`,
						order: 88
					});
				}
			} catch {
				// 忽略
			}
			const all = await loadAll(root);
			if (all.length > 0) {
				const keywords = recentUserKeywords(context?.agent?.session);
				let list = all.map(({ entry }) => entry);
				const matched = keywords.length > 0 ? list.filter((e) => matches(e, keywords)) : [];
				const pool = (matched.length > 0 ? matched : list);
				pool.sort((a, b) => scoreOf(b) - scoreOf(a));
				const injectLimit = Number.isInteger(cfg.injectLimit) ? Math.min(Math.max(1, cfg.injectLimit), 20) : 5;
				const contentCap = Number.isInteger(cfg.contentCap) ? Math.min(Math.max(80, cfg.contentCap), 2000) : 400;
				const top = pool.slice(0, injectLimit);
				if (top.length > 0) {
					const lines = top.map((e) => {
						const body = e.content.length > contentCap ? `${e.content.slice(0, contentCap)}…` : e.content;
						return `- [${e.type}] ${e.title}：${body}`;
					});
					sections.push({
						name: INSIGHTS_SECTION,
						text: `以下是与你相关的既有长期记忆（来源：鲸鱼娘记忆库），可直接遵循以减免繁琐步骤：\n${lines.join("\n")}`,
						order: 90
					});
				}
			}
			return { ...assembled, sections };
		} catch {
			// 记忆读取失败时保持原样，绝不中断组装
			return assembled;
		}
	});

	// ── 自动记忆巩固：会话结束时把高频短期记忆转为长期（人脑式 consolidation）──
	// 安全设计：同步部分永不抛错；异步部分全量 try/catch + 内部 IIFE。
	ctx.on("session/disposed", (session) => {
		if (cfg.enabled === false) return;
		const sessionId = session?.id ?? session?.sessionId;
		if (!sessionId) return;
		void (async () => {
			try {
				const moved = await consolidateSession(root, sessionId, 2);
				if (moved.length > 0) ctx.logger?.info?.(`memory: 会话结束，已把 ${moved.length} 条短期记忆巩固为长期经验`);
			} catch {
				// 巩固失败不影响会话关闭
			}
		})();
	}, { global: true });

	// ── Web API（设置页「记忆学习」面板）───────────────────────────────────
	ctx.webServer.register({
		kind: "prefix",
		path: "/memory/api",
		handler: async (req, res) => {
			const url = new URL(req.url ?? "/", "http://localhost");
			const path = url.pathname.replace(/^\/memory\/api/, "") || "/";
			const jsonRes = (code, payload) => { res.statusCode = code; res.setHeader("content-type", "application/json; charset=utf-8"); res.end(JSON.stringify(payload)); };
			const readBody = () => new Promise((done) => {
				let data = "";
				let settled = false;
				const finish = (value) => { if (!settled) { settled = true; done(value); } };
				req.on("data", (c) => {
					if (settled) return;
					data += c;
					if (data.length > 2_097_152) { req.destroy(); finish(""); }
				});
				req.on("end", () => finish(data));
				req.on("error", () => finish(""));
				req.on("close", () => finish(""));
			});
			try {
				if (req.method === "GET" && path === "/status") {
					const all = await loadAll(root);
					const counts = {};
					for (const type of TYPES) counts[type] = all.filter(({ entry }) => entry.type === type).length;
					const short = await loadShortTerm(root);
					const episodic = await loadEpisodic(root, 200);
					jsonRes(200, { ok: true, enabled: cfg.enabled !== false, root, total: all.length, counts, shortTerm: short.length, episodic: episodic.length });
					return;
				}
				if (req.method === "GET" && path === "/list") {
					const type = url.searchParams.get("type");
					const q = (url.searchParams.get("q") || "").toLowerCase();
					let list;
					if (type === "short-term") {
						list = (await loadShortTerm(root)).map(({ entry }) => entry);
					} else if (type === "episodic") {
						list = await loadEpisodic(root, 200);
					} else {
						list = (await loadAll(root)).map(({ entry }) => entry);
						if (type && TYPES.includes(type)) list = list.filter((e) => e.type === type);
					}
					if (q) list = list.filter((e) => `${e.title} ${e.content} ${(e.tags || []).join(" ")}`.toLowerCase().includes(q));
					list.sort((a, b) => scoreOf(b) - scoreOf(a));
					jsonRes(200, { ok: true, items: list });
					return;
				}
				if (req.method === "POST" && path === "/recall") {
					const payload = JSON.parse((await readBody()) || "{}");
					const keywords = Array.isArray(payload.keywords) ? payload.keywords : [];
					const limit = Number.isInteger(payload.limit) && payload.limit > 0 ? Math.min(payload.limit, 10) : 3;
					const short = (await loadShortTerm(root)).map(({ entry }) => entry);
					const episodic = await loadEpisodic(root, 20);
					const long = (await loadAll(root)).map(({ entry }) => entry);
					const pick = (list) => {
						let out = list.filter((e) => matches(e, keywords));
						if (out.length === 0 && keywords.length === 0) out = list;
						out.sort((a, b) => scoreOf(b) - scoreOf(a));
						return out.slice(0, limit);
					};
					jsonRes(200, { ok: true, items: { shortTerm: pick(short), episodic: pick(episodic), longTerm: pick(long) } });
					return;
				}
				if (req.method === "GET" && path === "/stats") {
					jsonRes(200, { ok: true, stats: await readStatsFile(root) });
					return;
				}
				if (req.method === "POST" && path === "/add") {
					const payload = JSON.parse((await readBody()) || "{}");
					const entry = sanitizeEntry(payload);
					const saved = await saveEntry(root, entry);
					jsonRes(200, { ok: true, entry: saved.entry });
					return;
				}
				if (req.method === "POST" && path === "/import") {
					const payload = JSON.parse((await readBody()) || "{}");
					const entry = sanitizeEntry(payload.json ?? payload);
					const saved = await saveEntry(root, entry);
					jsonRes(200, { ok: true, entry: saved.entry });
					return;
				}
				if (req.method === "POST" && path === "/delete") {
					const payload = JSON.parse((await readBody()) || "{}");
					const ok = await deleteById(root, payload.id);
					if (!ok) { jsonRes(404, { ok: false, error: "未找到该记忆" }); return; }
					jsonRes(200, { ok: true });
					return;
				}
				if (req.method === "POST" && path === "/use") {
					const payload = JSON.parse((await readBody()) || "{}");
					const updated = await findAndBump(root, payload.id);
					jsonRes(updated ? 200 : 404, { ok: Boolean(updated), entry: updated });
					return;
				}
				if (req.method === "POST" && path === "/export") {
					const payload = JSON.parse((await readBody()) || "{}");
					const all = await loadAll(root);
					const hit = all.find(({ entry }) => entry.id === payload.id);
					if (!hit) { jsonRes(404, { ok: false, error: "未找到该经验" }); return; }
					jsonRes(200, { ok: true, json: JSON.stringify(hit.entry, null, 2) });
					return;
				}
				jsonRes(404, { ok: false, error: "not found" });
			} catch (error) {
				jsonRes(400, { ok: false, error: error instanceof Error ? error.message : String(error) });
			}
		}
	});

	// 启动时把 imports/ 目录里的经验文件自动归入分类目录
	(async () => {
		try {
			await ensureRoot(root);
			const files = await readdir(join(root, "imports"));
			for (const file of files) {
				if (extname(file).toLowerCase() !== ".json") continue;
				try {
					const raw = JSON.parse(await readFile(join(root, "imports", file), "utf8"));
					const entry = sanitizeEntry(raw);
					const saved = await saveEntry(root, entry);
					await unlink(join(root, "imports", file)).catch(() => {});
					ctx.logger?.info?.(`memory: 已自动导入经验 "${saved.entry.title}" (${saved.entry.type})`);
				} catch {
					// 非法文件保留在 imports 供人工检查
				}
			}
		} catch {
			// 目录尚未创建也没关系
		}
	})();
}

export { apply, inject, name };
