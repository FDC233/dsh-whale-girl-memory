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
const GUIDANCE_SECTION = "memory:guidance";
const INSIGHTS_SECTION = "memory:insights";

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

function newId() {
	return `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
		output: { schema: { type: "object", additionalProperties: false, properties: { id: { type: "string" }, file: { type: "string" } } } },
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
			}
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
		output: { schema: { type: "object", additionalProperties: false, properties: { items: { type: "array", items: { type: "object" } } } } },
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
		output: { schema: { type: "object", additionalProperties: false, properties: { ok: { type: "boolean" } } } },
		async execute(args) {
			if (cfg.enabled === false) throw new Error("记忆插件已停用");
			const all = await loadAll(root);
			const hit = all.find(({ entry }) => entry.id === args.id);
			if (!hit) return { ok: false };
			await unlink(hit.file);
			return { ok: true };
		}
	}));

	// ── 工具：memory_import ─────────────────────────────────────────────────
	ctx.tools.register(defineTool({
		name: "memory_import",
		description: "记忆学习：从本地文件导入他人的经验文件（dsh-memory 规范化 JSON），导入后立即可用。",
		parameters: {
			path: { type: "string", required: true, description: "经验文件路径（.json），绝对路径或相对工作区路径。" }
		},
		output: { schema: { type: "object", additionalProperties: false, properties: { id: { type: "string" }, title: { type: "string" }, type: { type: "string" } } } },
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

	// ── 自动学习：统计工具使用（tools/result）─────────────────────────────
	ctx.on("tools/result", async (exec, result) => {
		if (cfg.enabled === false) return;
		const toolName = exec?.name;
		if (!toolName || toolName.startsWith("memory_")) return; // 不统计记忆工具自身
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
	}, { global: true });

	// ── 全局应用：组装提示词时注入记忆引导与相关经验 ──────────────────────
	ctx.on("system-prompt/assemble", async (_assembly, context, next) => {
		const assembled = await next();
		if (cfg.enabled === false) return assembled;
		if (!Array.isArray(assembled?.sections)) return assembled;
		let sections = assembled.sections.filter((s) => s?.name !== GUIDANCE_SECTION && s?.name !== INSIGHTS_SECTION);
		try {
			if (cfg.injectGuidance !== false) {
				sections.push({
					name: GUIDANCE_SECTION,
					text: "你有长期记忆能力（记忆库位于本机，跨会话生效）。发现用户的新习惯、重要偏好、关键事实或值得复用的经验时，用 memory_add 保存；做事前先 memory_query 查相关经验，可避免重复询问和繁琐步骤；他人经验可用 memory_import 导入。",
					order: 15
				});
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
		} catch {
			// 记忆读取失败时保持原样
		}
		return { ...assembled, sections };
	});

	// ── Web API（设置页「记忆学习」面板）───────────────────────────────────
	ctx.webServer.register({
		kind: "prefix",
		path: "/memory/api",
		handler: async (req, res) => {
			const url = new URL(req.url ?? "/", "http://localhost");
			const path = url.pathname.replace(/^\/memory\/api/, "") || "/";
			const jsonRes = (code, payload) => { res.statusCode = code; res.setHeader("content-type", "application/json; charset=utf-8"); res.end(JSON.stringify(payload)); };
			const readBody = () => new Promise((done) => { let data = ""; req.on("data", (c) => { data += c; if (data.length > 2_097_152) req.destroy(); }); req.on("end", () => done(data)); req.on("error", () => done("")); });
			try {
				if (req.method === "GET" && path === "/status") {
					const all = await loadAll(root);
					const counts = {};
					for (const type of TYPES) counts[type] = all.filter(({ entry }) => entry.type === type).length;
					jsonRes(200, { ok: true, enabled: cfg.enabled !== false, root, total: all.length, counts });
					return;
				}
				if (req.method === "GET" && path === "/list") {
					const type = url.searchParams.get("type");
					const q = (url.searchParams.get("q") || "").toLowerCase();
					let list = (await loadAll(root)).map(({ entry }) => entry);
					if (type && TYPES.includes(type)) list = list.filter((e) => e.type === type);
					if (q) list = list.filter((e) => `${e.title} ${e.content} ${e.tags.join(" ")}`.toLowerCase().includes(q));
					list.sort((a, b) => scoreOf(b) - scoreOf(a));
					jsonRes(200, { ok: true, items: list });
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
					const all = await loadAll(root);
					const hit = all.find(({ entry }) => entry.id === payload.id);
					if (!hit) { jsonRes(404, { ok: false, error: "未找到该经验" }); return; }
					await unlink(hit.file);
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
