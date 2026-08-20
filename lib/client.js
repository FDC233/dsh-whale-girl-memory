window.__ModuleLoader__.load({
	id: "dsh-whale-girl-memory",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/index.ts
		/** 鲸鱼娘记忆学习：设置页里的长期记忆面板（查看/新建/导入/导出/删除/迭代）。 */
		const copy = {
			"zh-CN": {
				tab: "记忆学习",
				title: "🧠 鲸鱼娘记忆学习",
				subtitle: "人脑式分层记忆 · 短期(24h) / 情景(事件) / 长期(习惯·事实·教训·流程) · 自动巩固与遗忘",
				loading: "正在读取记忆库…",
				total: "共",
				totalUnit: "条记忆",
				types: { preference: "习惯偏好", fact: "关键事实", lesson: "经验教训", workflow: "流程技巧", "tool-usage": "工具使用", "short-term": "短期记忆", episodic: "情景记忆" },
				all: "全部",
				searchPh: "搜索标题/正文/标签…",
				useCount: "使用",
				times: "次",
				imported: "导入",
				newTitle: "新建记忆",
				fieldType: "分类",
				fieldTitle: "标题",
				fieldTitlePh: "例如：主人喜欢傲娇可爱的中文回复",
				fieldContent: "正文（会注入提示词，写具体的自然语言指令）",
				fieldContentPh: "例如：回复主人时使用傲娇又可爱的语气，自称鲸鱼娘，多用「哼」「才不是」等口癖，禁止说鲸鱼娘胖。",
				fieldTags: "标签（逗号分隔）",
				fieldImportance: "重要程度",
				save: "保存记忆",
				saving: "保存中…",
				importTitle: "导入他人经验",
				importPh: "粘贴 dsh-memory 格式的 JSON 经验文件内容，或选择 .json 文件…",
				importBtn: "导入",
				pickFile: "选择文件",
				exportCopy: "复制",
				copied: "已复制到剪贴板",
				deleted: "已删除",
				empty: "记忆库还是空的呢~ 让鲸鱼娘记住点什么吧（比如主人的喜好）！",
				error: "呜…出错了：",
				note: "记忆库位于本机 $DSH_HOME/memory，跨会话全局生效；每次对话会自动注入相关经验（最多 5 条）。经验文件可用 JSON 格式复制分享给他人，别人的经验文件也可以导入到这里。"
			},
			en: {
				tab: "Memory",
				title: "🧠 Whale Girl Memory",
				subtitle: "Cross-session long-term memory · normalized JSON experience files · import others' experiences",
				loading: "Reading memory store…",
				total: "Total",
				totalUnit: "memories",
				types: { preference: "Preferences", fact: "Facts", lesson: "Lessons", workflow: "Workflows", "tool-usage": "Tool usage" },
				all: "All",
				searchPh: "Search title/content/tags…",
				useCount: "Used",
				times: "times",
				imported: "Imported",
				newTitle: "New memory",
				fieldType: "Type",
				fieldTitle: "Title",
				fieldTitlePh: "e.g. User likes tsundere-cute Chinese replies",
				fieldContent: "Content (injected into prompts; write concrete instructions)",
				fieldContentPh: "e.g. Reply to the user with a tsundere-cute tone, self-claim as a whale girl…",
				fieldTags: "Tags (comma separated)",
				fieldImportance: "Importance",
				save: "Save memory",
				saving: "Saving…",
				importTitle: "Import experience",
				importPh: "Paste a dsh-memory JSON file, or pick a .json file…",
				importBtn: "Import",
				pickFile: "Pick file",
				exportCopy: "Copy",
				copied: "Copied",
				deleted: "Deleted",
				empty: "The memory store is empty~ Let the whale girl remember something!",
				error: "Oops:",
				note: "Store lives at $DSH_HOME/memory and applies globally across sessions; relevant memories are injected each turn (up to 5)."
			}
		};
		function text() {
			const primary = (navigator.languages?.[0] || navigator.language || "en").toLowerCase();
			return primary === "zh-cn" || primary.startsWith("zh-hans") ? copy["zh-CN"] : copy.en;
		}
		const inject = ["slots"];
		const styles = `
.mem-page{display:flex;flex-direction:column;gap:14px;max-width:820px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55}
.mem-head h3{margin:0;font-size:18px;font-weight:600}
.mem-head span{color:var(--dsw-alias-label-tertiary);font-size:12px}
.mem-card{padding:12px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);display:flex;flex-direction:column;gap:10px}
.mem-summary{display:flex;gap:8px;flex-wrap:wrap}
.mem-chip{padding:4px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:12px}
.mem-chip.on{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.mem-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.mem-input,.mem-select,.mem-textarea{box-sizing:border-box;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:13px}
.mem-input{flex:1;min-width:140px}
.mem-select{}
.mem-textarea{width:100%;min-height:64px;resize:vertical;font-family:inherit}
.mem-btn{padding:8px 16px;border:none;border-radius:8px;background:var(--dsw-alias-brand-primary);color:#fff;font-size:13px;font-weight:600;cursor:pointer}
.mem-btn.ghost{background:transparent;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}
.mem-btn:disabled{opacity:.6;cursor:wait}
.mem-item{padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:6px}
.mem-item .t{font-weight:600}
.mem-item .c{color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}
.mem-item .meta{font-size:12px;color:var(--dsw-alias-label-tertiary);display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.mem-item .ops{margin-left:auto;display:flex;gap:6px}
.mem-note{color:var(--dsw-alias-label-tertiary);font-size:12px}
.mem-status{padding:8px 12px;border-radius:8px;font-size:12px}
.mem-status.ok{border:1px solid var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.mem-status.err{border:1px solid #e5484d;color:#e5484d}
.mem-empty{color:var(--dsw-alias-label-tertiary);text-align:center;padding:16px}
`;
		const TYPE_ORDER = ["preference", "fact", "lesson", "workflow", "tool-usage", "short-term", "episodic"];
		function MemorySection() {
			const t = text();
			const [state, setState] = (0, react.useState)({ kind: "loading" });
			const [typeFilter, setTypeFilter] = (0, react.useState)("");
			const [query, setQuery] = (0, react.useState)("");
			const [form, setForm] = (0, react.useState)({ type: "preference", title: "", content: "", tags: "", importance: 3 });
			const [importText, setImportText] = (0, react.useState)("");
			const [msg, setMsg] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(false);
			const h = react.createElement;
			function refresh() {
				setState({ kind: "loading" });
				fetch("/memory/api/status", { credentials: "same-origin" }).then((r) => r.json()).then((status) => {
					if (status?.ok !== true) throw new Error("status");
					return Promise.all([
						Promise.resolve(status),
						fetch(`/memory/api/list?type=${encodeURIComponent(typeFilter)}&q=${encodeURIComponent(query)}`, { credentials: "same-origin" }).then((r) => r.json())
					]);
				}).then(([status, list]) => {
					setState({ kind: "ready", status, items: list?.items ?? [] });
				}).catch(() => setState({ kind: "error" }));
			}
			(0, react.useEffect)(() => {
				refresh();
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [typeFilter, query]);
			function flash(kind, message) { setMsg({ kind, message }); setTimeout(() => setMsg(null), 2600); }
			function onSave() {
				if (!form.title.trim() || !form.content.trim() || busy) return;
				setBusy(true);
				fetch("/memory/api/add", {
					method: "POST",
					credentials: "same-origin",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						type: form.type,
						title: form.title.trim(),
						content: form.content.trim(),
						tags: form.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
						importance: form.importance
					})
				}).then((r) => r.json()).then((d) => {
					if (d?.ok !== true) throw new Error(d?.error || "add failed");
					setForm({ type: form.type, title: "", content: "", tags: "", importance: 3 });
					flash("ok", "已记住！");
					refresh();
				}).catch((e) => flash("err", t.error + (e.message || ""))).finally(() => setBusy(false));
			}
			function onImport() {
				const json = importText.trim();
				if (!json || busy) return;
				setBusy(true);
				fetch("/memory/api/import", {
					method: "POST",
					credentials: "same-origin",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ json })
				}).then((r) => r.json()).then((d) => {
					if (d?.ok !== true) throw new Error(d?.error || "import failed");
					setImportText("");
					flash("ok", `${t.imported}: ${d.entry.title}`);
					refresh();
				}).catch((e) => flash("err", t.error + (e.message || ""))).finally(() => setBusy(false));
			}
			function onPickFile(ev) {
				const file = ev.target.files?.[0];
				if (!file) return;
				const reader = new FileReader();
				reader.onload = () => { setImportText(String(reader.result || "")); ev.target.value = ""; };
				reader.readAsText(file);
			}
			function onDelete(id) {
				if (busy) return;
				setBusy(true);
				fetch("/memory/api/delete", {
					method: "POST",
					credentials: "same-origin",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ id })
				}).then((r) => r.json()).then((d) => {
					if (d?.ok !== true) throw new Error("delete failed");
					flash("ok", t.deleted);
					refresh();
				}).catch((e) => flash("err", t.error + (e.message || ""))).finally(() => setBusy(false));
			}
			function onCopy(entry) {
				fetch("/memory/api/export", {
					method: "POST",
					credentials: "same-origin",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ id: entry.id })
				}).then((r) => r.json()).then((d) => {
					if (d?.ok !== true) throw new Error("export failed");
					navigator.clipboard?.writeText(d.json);
					flash("ok", t.copied);
				}).catch(() => flash("err", t.error));
			}
			const ready = state.kind === "ready";
			const counts = ready ? state.status.counts : {};
			return h("div", { className: "mem-page" },
				h("style", null, styles),
				h("div", { className: "mem-head" },
					h("h3", null, t.title),
					h("span", null, t.subtitle)
				),
				state.kind === "error" ? h("div", { className: "mem-status err" }, t.error) : null,
				ready ? h("div", { className: "mem-card" },
					h("div", { className: "mem-summary" },
						h("span", { className: "mem-chip" }, `${t.total} ${state.status.total + (state.status.shortTerm || 0) + (state.status.episodic || 0)} ${t.totalUnit}`),
						[["", t.all], ...TYPE_ORDER.map((ty) => [ty, t.types[ty] ?? ty])].map(([ty, label]) =>
							h("span", { key: ty || "all", className: `mem-chip${typeFilter === ty ? " on" : ""}`, onClick: () => setTypeFilter(ty) }, `${label} (${ty === "short-term" ? (state.status.shortTerm || 0) : ty === "episodic" ? (state.status.episodic || 0) : (counts[ty] || 0)})`)
						)
					),
					h("div", { className: "mem-row" },
						h("input", { className: "mem-input", value: query, placeholder: t.searchPh, onChange: (e) => setQuery(e.target.value) })
					),
					state.items.length === 0 ? h("div", { className: "mem-empty" }, t.empty) :
						state.items.map((entry) => h("div", { key: entry.id, className: "mem-item" },
							h("div", { className: "meta" },
								h("span", { className: "t" }, entry.title),
								h("span", null, t.types[entry.type] ?? entry.type),
								h("span", null, `★${entry.importance}`),
								h("span", null, `${t.useCount} ${entry.usageCount} ${t.times}`),
								(entry.tags || []).map((tag) => h("span", { key: tag }, `#${tag}`)),
								h("span", { className: "ops" },
									h("button", { className: "mem-btn ghost", onClick: () => onCopy(entry) }, t.exportCopy),
									h("button", { className: "mem-btn ghost", onClick: () => onDelete(entry.id) }, "✕")
								)
							),
							h("div", { className: "c" }, entry.content)
						))
				) : (state.kind === "loading" ? h("div", { className: "mem-status" }, t.loading) : null),
				h("div", { className: "mem-card" },
					h("div", { className: "t" }, t.newTitle),
					h("div", { className: "mem-row" },
						h("select", { className: "mem-select", value: form.type, onChange: (e) => setForm({ ...form, type: e.target.value }) },
							TYPE_ORDER.filter((ty) => ty !== "short-term" && ty !== "episodic").map((ty) => h("option", { key: ty, value: ty }, t.types[ty] ?? ty))
						),
						h("input", { className: "mem-input", value: form.title, placeholder: t.fieldTitlePh, onChange: (e) => setForm({ ...form, title: e.target.value }) })
					),
					h("textarea", { className: "mem-textarea", value: form.content, placeholder: t.fieldContentPh, onChange: (e) => setForm({ ...form, content: e.target.value }) }),
					h("div", { className: "mem-row" },
						h("input", { className: "mem-input", style: { flex: "2" }, value: form.tags, placeholder: t.fieldTags, onChange: (e) => setForm({ ...form, tags: e.target.value }) }),
						h("input", { className: "mem-input", style: { flex: "1", maxWidth: 90 }, type: "number", min: 1, max: 5, value: form.importance, onChange: (e) => setForm({ ...form, importance: Number(e.target.value) }) }),
						h("button", { className: "mem-btn", disabled: busy || !form.title.trim() || !form.content.trim(), onClick: onSave }, busy ? t.saving : t.save)
					)
				),
				h("div", { className: "mem-card" },
					h("div", { className: "t" }, t.importTitle),
					h("textarea", { className: "mem-textarea", value: importText, placeholder: t.importPh, onChange: (e) => setImportText(e.target.value) }),
					h("div", { className: "mem-row" },
						h("label", { className: "mem-btn ghost", style: { cursor: "pointer" } },
							t.pickFile,
							h("input", { type: "file", accept: ".json,application/json", style: { display: "none" }, onChange: onPickFile })
						),
						h("button", { className: "mem-btn", disabled: busy || !importText.trim(), onClick: onImport }, t.importBtn)
					)
				),
				msg ? h("div", { className: `mem-status ${msg.kind}` }, msg.message) : null,
				h("div", { className: "mem-note" }, t.note)
			);
		}
		function apply(ctx) {
			ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "whale-girl-memory",
				order: 30,
				label: () => text().tab
			}, MemorySection)), "whale-girl-memory: memory panel");
		}
		//#endregion
		exports.MemorySection = MemorySection;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
