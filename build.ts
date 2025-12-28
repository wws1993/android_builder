import { $, Glob } from "bun";
import { join } from "node:path";
import { homedir } from "node:os";
import fs from "node:fs";
import unzipper from "unzipper";
import { consola } from "consola";
import { parseStringPromise, Builder } from "xml2js";

/**
 * ================= 配置与初始化 =================
 */
const CONFIG = {
  token: process.env.GITHUB_TOKEN,
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO,
  artifactName: process.env.ARTIFACT_NAME || "my-app-apk",
  downloadDir: join(homedir(), "Downloads"),
};

if (!CONFIG.token) {
  consola.error("未能在 .env 中找到 GITHUB_TOKEN，请检查配置文件。");
  process.exit(1);
}

const HEADERS = {
  Authorization: `Bearer ${CONFIG.token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

// 关键词 -> 插件 ID 的映射关系
const PLUGIN_MAP: Record<string, string> = {
  "navigator.vibrate": "cordova-plugin-vibration",
  "StatusBar": "cordova-plugin-statusbar",
  "navigator.camera": "cordova-plugin-camera",
  "navigator.geolocation": "cordova-plugin-geolocation",
  "FileTransfer": "cordova-plugin-file-transfer",
};

/**
 * ================= 项目预处理逻辑 =================
 */
async function processProject() {
  consola.info("🔍 正在预处理项目配置...");

  const wwwPath = join(process.cwd(), "www");

  // 1. 使用 Bun.Glob 跨平台扫描文件
  const glob = new Glob("**/*.{js,html}");
  let combinedContent = "";
  for await (const file of glob.scan(wwwPath)) {
    combinedContent += fs.readFileSync(join(wwwPath, file), "utf-8");
  }

  const detectedPlugins = Object.keys(PLUGIN_MAP)
    .filter(key => combinedContent.includes(key))
    .map(key => PLUGIN_MAP[key]);

  // 2. 自动更新 config.xml 中的插件
  const configPath = join(process.cwd(), "config.xml");
  if (fs.existsSync(configPath)) {
    const xml = fs.readFileSync(configPath, "utf-8");
    const result = await parseStringPromise(xml);
    result.widget.plugin = result.widget.plugin || [];
    const currentPlugins = result.widget.plugin.map((p: any) => p.$.name);

    detectedPlugins.forEach(p => {
      if (!currentPlugins.includes(p)) {
        consola.success(`检测到 API 调用，已添加插件: ${p}`);
        result.widget.plugin.push({ $: { name: p, spec: "latest" } });
      }
    });
    fs.writeFileSync(configPath, new Builder().buildObject(result));
  } else {
    consola.warn("未找到 config.xml，跳过插件自动配置。");
  }

  // 3. 交互式处理 index.html (vConsole & Safe Area)
  const useVConsole = await consola.prompt("是否开启 vConsole 调试面板?", { type: "confirm" });
  const useSafeArea = await consola.prompt("是否保留安全区域 (避开留海屏)?", { type: "confirm" });

  const indexPath = join(wwwPath, "index.html");
  let html = fs.readFileSync(indexPath, "utf-8");

  // 清除旧注入
  html = html.replace(/<!-- INJECT_START -->[\s\S]*?<!-- INJECT_END -->/g, "");

  let injection = "<!-- INJECT_START -->\n";
  if (useVConsole) {
    injection += `<script src="https://cdn.jsdelivr.net/npm/vconsole@latest/dist/vconsole.min.js"></script>\n<script>new VConsole();</script>\n`;
  }
  if (useSafeArea) {
    injection += `<style>body{padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);}</style>\n`;
  }
  injection += "<!-- INJECT_END -->";

  fs.writeFileSync(indexPath, html.replace("</head>", `${injection}\n</head>`));
  consola.success("HTML 配置已更新。");
}

/**
 * ================= 构建与监控主流程 =================
 */
async function runBuild() {
  try {
    // A. 预处理
    await processProject();

    // B. Git 提交
    consola.start("🚀 正在提交代码并推送到 GitHub...");
    await $`git add .`;
    await $`git commit -m "Build: ${new Date().toLocaleString()}" --allow-empty`;
    await $`git push origin main`;

    // C. 监控进度
    console.log(""); // 留空行给进度条
    let progress = 0;
    let status = "queued";

    // 初始等待 8 秒，让 Action 有时间创建
    await new Promise(r => setTimeout(r, 8000));

    const runRes = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs?per_page=1`, { headers: HEADERS });
    const runData = await runRes.json();
    if (!runData.workflow_runs?.length) throw new Error("未找到正在运行的工作流。");
    const runId = runData.workflow_runs[0].id;

    // 轮询状态并更新进度条
    while (status !== "completed") {
      const checkRes = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs/${runId}`, { headers: HEADERS });
      const checkData = await checkRes.json();
      status = checkData.status;

      if (checkData.conclusion === "failure") {
        console.log("");
        throw new Error("GitHub 打包失败，请检查 Actions 页面日志。");
      }

      // 模拟进度条增长 (10% -> 95% 渐进)
      if (progress < 95) {
        progress += (95 - progress) * 0.15;
      }

      const barWidth = 30;
      const filled = Math.round((progress / 100) * barWidth);
      const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
      process.stdout.write(`\r  ${bar} ${Math.round(progress)}% | 状态: ${status}...   `);

      if (status !== "completed") {
        await new Promise(r => setTimeout(r, 10000)); // 每 10 秒查询一次
      }
    }

    // 完成状态
    process.stdout.write(`\r  ${"█".repeat(30)} 100% | 状态: 已完成!          \n\n`);
    consola.success("✅ 云端构建成功！");

    // D. 下载并回收 APK
    consola.start("📥 正在回收 APK 文件...");
    const artRes = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs/${runId}/artifacts`, { headers: HEADERS });
    const artData = await artRes.json();
    const artifact = artData.artifacts.find((a: any) => a.name === CONFIG.artifactName);

    if (!artifact) throw new Error("未找到生成的 Artifact。");

    const downloadUrl = artifact.archive_download_url;
    const downloadRes = await fetch(downloadUrl, { headers: HEADERS });
    const zipPath = join(process.cwd(), "temp_apk.zip");

    // 使用 Bun.write 保存文件
    await Bun.write(zipPath, await downloadRes.arrayBuffer());

    // 解压到下载目录
    await fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: CONFIG.downloadDir }))
      .promise();

    fs.unlinkSync(zipPath); // 删除临时 zip

    consola.ready(`✨ 打包完成！文件已存至: ${join(CONFIG.downloadDir, "app-debug.apk")}`);

  } catch (err: any) {
    console.log(""); // 换行防止遮挡
    consola.error("流程出错:", err.message);
  }
}

// 启动
runBuild();