import { $, Glob } from "bun";
import { join } from "node:path";
import { homedir } from "node:os";
import fs from "node:fs";
import unzipper from "unzipper";
import { consola } from "consola";
import { parseStringPromise, Builder } from "xml2js";

/** 制品名需为纯 ASCII，否则 GitHub/Azure 下载 URL 会报 InvalidQueryParameterValue */
const rawArtifactName = process.env.ARTIFACT_NAME || "my-app-apk";
const CONFIG = {
  token: process.env.GITHUB_TOKEN,
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO,
  artifactName: /^[\x00-\x7F]*$/.test(rawArtifactName) ? rawArtifactName : "kaigeer-apk",
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

  // 4. 同步工作流中的制品名（与 .env ARTIFACT_NAME 一致）
  const workflowPath = join(process.cwd(), ".github", "workflows", "android-build.yml");
  if (fs.existsSync(workflowPath)) {
    let workflowYml = fs.readFileSync(workflowPath, "utf-8");
    workflowYml = workflowYml.replace(/(          name:\s+)[^\n]+/g, `$1${CONFIG.artifactName}`);
    fs.writeFileSync(workflowPath, workflowYml);
  }

  // 5. HTML 注入 (vConsole & Safe Area)
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

    const pkgPath = join(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const defaultVersion = pkg.version || "1.0.0";

    const versionInput = await consola.prompt(`请输入版本号（留空使用 ${defaultVersion}）:`, { type: "text" });
    const newVersion = (versionInput || defaultVersion).trim();
    if (newVersion) {
      pkg.version = newVersion;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
      const gameJsPath = join(process.cwd(), "www", "assets", "game.js");
      let gameJs = fs.readFileSync(gameJsPath, "utf-8");
      gameJs = gameJs.replace(/const APP_VERSION = "[^"]+";/, `const APP_VERSION = "${newVersion}";`);
      fs.writeFileSync(gameJsPath, gameJs);
      consola.info(`版本已更新为: ${newVersion}`);
    }

    let commitMsg = await consola.prompt("请输入推送文字（留空则使用默认）:", { type: "text" });
    if (!commitMsg.trim()) {
      const defaultMsg = `自定义打包`;
      consola.info(`使用默认推送文字: ${defaultMsg}`);
      commitMsg = defaultMsg;
    }
    const msg = `Build [${buildType}]: ${commitMsg.trim()}`;
    consola.start(`🚀 推送 [${buildType}] 到云端...`);
    await $`git add .`;
    await $`git commit -m ${[msg]} --allow-empty`;
    await $`git push origin main`;

    console.log("");
    let progress = 0, status = "queued";
    consola.info("等待工作流启动...");
    await new Promise(r => setTimeout(r, 8000));

    /** 获取最新 workflow run，带重试（工作流可能尚未创建） */
    let runId: number | null = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const runRes = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs?per_page=1`, { headers: HEADERS });
      const data = await runRes.json();
      if (!runRes.ok) {
        const msg = data.message || JSON.stringify(data);
        if (runRes.status === 401) {
          throw new Error(`GitHub API 401: Token 无效或已过期。请到 GitHub → Settings → Developer settings → Personal access tokens 重新生成，确保勾选 repo 和 workflow 权限，并更新 .env 中的 GITHUB_TOKEN`);
        }
        throw new Error(`GitHub API 错误 ${runRes.status}: ${msg}`);
      }
      const runs = data.workflow_runs;
      if (Array.isArray(runs) && runs.length > 0) {
        runId = runs[0].id;
        break;
      }
      if (attempt < 5) {
        consola.info(`第 ${attempt} 次获取 run 为空，${attempt * 5}s 后重试...`);
        await new Promise(r => setTimeout(r, 5000));
      } else {
        throw new Error("无法获取 workflow run，请检查 GITHUB_OWNER/GITHUB_REPO 是否正确，或稍后手动在 Actions 页面下载 APK");
      }
    }
    if (runId == null) throw new Error("runId 获取失败");

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

    const artsRes = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs/${runId}/artifacts`, { headers: HEADERS });
    const arts = await artsRes.json();
    const art = arts.artifacts?.find((a: any) => a.name === CONFIG.artifactName);
    if (!art) {
      const names = arts.artifacts?.map((a: any) => a.name).join(", ") || "无";
      throw new Error(`未找到制品 "${CONFIG.artifactName}"，当前制品: ${names}。请确认 .env 中 ARTIFACT_NAME 与工作流中 name 一致`);
    }
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