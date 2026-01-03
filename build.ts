import { $, Glob } from "bun";
import { join } from "node:path";
import { homedir } from "node:os";
import fs from "node:fs";
import unzipper from "unzipper";
import { consola } from "consola";
import { parseStringPromise, Builder } from "xml2js";

/**
 * ================= 配置初始化 =================
 */
const CONFIG = {
  token: process.env.GITHUB_TOKEN,
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO,
  artifactName: process.env.ARTIFACT_NAME || "my-app-apk",
  appId: process.env.APP_ID,
  downloadDir: join(homedir(), "Downloads"),
};

if (!CONFIG.token || !CONFIG.appId) {
  consola.error("错误：请检查 .env 文件是否配置了 GITHUB_TOKEN 和 APP_ID");
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${CONFIG.token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

const PLUGIN_MAP: Record<string, string> = {
  "navigator.vibrate": "cordova-plugin-vibration",
  "StatusBar": "cordova-plugin-statusbar",
  "navigator.camera": "cordova-plugin-camera",
};

/**
 * ================= 预处理逻辑 =================
 */
async function processProject(buildType: string) {
  consola.info(`🔍 正在预处理项目配置 [模式: ${buildType}]...`);

  const configPath = join(process.cwd(), "config.xml");
  const xml = fs.readFileSync(configPath, "utf-8");
  const result = await parseStringPromise(xml);

  // 1. 同步 AppID
  result.widget.$.id = CONFIG.appId;

  // 2. 图标校验
  const findIcons = (obj: any): string[] => {
    let icons: string[] = [];
    if (obj.icon) obj.icon.forEach((i: any) => i.$.src && icons.push(i.$.src));
    if (obj.platform) obj.platform.forEach((p: any) => icons = icons.concat(findIcons(p)));
    return icons;
  };
  for (const p of findIcons(result.widget)) {
    if (!fs.existsSync(join(process.cwd(), p))) {
      consola.error(`❌ 图标缺失: ${p}`);
      if (!(await consola.prompt("是否强制继续?", { type: "confirm" }))) process.exit(0);
    }
  }

  // 3. 插件自动检测
  const wwwPath = join(process.cwd(), "www");
  const glob = new Glob("**/*.{js,html}");
  let code = "";
  for await (const f of glob.scan(wwwPath)) code += fs.readFileSync(join(wwwPath, f), "utf-8");
  const detected = Object.keys(PLUGIN_MAP).filter(k => code.includes(k)).map(k => PLUGIN_MAP[k]);
  result.widget.plugin = result.widget.plugin || [];
  const current = result.widget.plugin.map((p: any) => p.$.name);
  detected.forEach(p => { if (!current.includes(p)) result.widget.plugin.push({ $: { name: p, spec: "latest" } }); });

  fs.writeFileSync(configPath, new Builder().buildObject(result));

  // 4. HTML 注入 (vConsole & Safe Area)
  const indexPath = join(wwwPath, "index.html");
  let html = fs.readFileSync(indexPath, "utf-8");
  html = html.replace(/<!-- INJECT_START -->[\s\S]*?<!-- INJECT_END -->/g, "");

  const useV = buildType === "debug" && await consola.prompt("是否开启 vConsole?", { type: "confirm" });
  const useS = await consola.prompt("是否保留安全区域?", { type: "confirm" });

  let inj = "<!-- INJECT_START -->\n";
  if (useV) inj += `<script src="https://cdn.jsdelivr.net/npm/vconsole@latest/dist/vconsole.min.js"></script>\n<script>new VConsole();</script>\n`;
  if (useS) inj += `<style>body{padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);}</style>\n`;
  inj += "<!-- INJECT_END -->";
  fs.writeFileSync(indexPath, html.replace("</head>", `${inj}\n</head>`));
}

/**
 * ================= 主流程 =================
 */
async function runBuild() {
  try {
    const buildType = await consola.prompt("请选择打包类型:", { type: "select", options: ["debug", "release"] });
    await processProject(buildType);

    consola.start(`🚀 推送 [${buildType}] 到云端...`);
    await $`git add .`;
    await $`git commit -m "Build [${buildType}]: ${new Date().toLocaleString()}" --allow-empty`;
    await $`git push origin main`;

    console.log("");
    let progress = 0, status = "queued";
    await new Promise(r => setTimeout(r, 8000));
    const runRes = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs?per_page=1`, { headers: HEADERS });
    const runId = (await runRes.json()).workflow_runs[0].id;

    while (status !== "completed") {
      const check = await (await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs/${runId}`, { headers: HEADERS })).json();
      status = check.status;
      if (check.conclusion === "failure") throw new Error("构建失败，请检查 Actions 日志。");
      if (progress < 95) progress += (95 - progress) * 0.15;
      const bar = "█".repeat(Math.round(progress / 100 * 30)).padEnd(30, "░");
      process.stdout.write(`\r  ${bar} ${Math.round(progress)}% | 状态: ${status}... `);
      if (status !== "completed") await new Promise(r => setTimeout(r, 10000));
    }

    process.stdout.write(`\r  ${"█".repeat(30)} 100% | 状态: 已完成! \n\n`);
    consola.success("✅ 构建成功，下载中...");

    const arts = await (await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs/${runId}/artifacts`, { headers: HEADERS })).json();
    const art = arts.artifacts.find((a: any) => a.name === CONFIG.artifactName);
    const zipPath = join(process.cwd(), "temp.zip");
    await Bun.write(zipPath, await (await fetch(art.archive_download_url, { headers: HEADERS })).arrayBuffer());
    await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: CONFIG.downloadDir })).promise();
    fs.unlinkSync(zipPath);

    consola.ready(`✨ 打包成功！文件已存至: ${CONFIG.downloadDir}`);
  } catch (err: any) {
    consola.error("失败:", err.message);
  }
}

runBuild();