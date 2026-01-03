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
};

/**
 * ================= 项目检查与预处理 =================
 */
async function processProject() {
  consola.info("🔍 正在预处理项目配置...");

  // --- 1. 图标路径检查 ---
  const configPath = join(process.cwd(), "config.xml");
  if (fs.existsSync(configPath)) {
    const xml = fs.readFileSync(configPath, "utf-8");
    const result = await parseStringPromise(xml);

    const appId = process.env.APP_ID;
    if (!appId) {
      consola.error("错误：.env 中未配置 APP_ID");
      process.exit(1);
    }
    // --- 强制同步 AppID ---
    const currentId = result.widget.$.id;
    if (currentId !== appId) {
      consola.warn(`AppID 不匹配：正在将 "${currentId}" 修改为 "${appId}"`);
      result.widget.$.id = appId;
    } else {
      consola.success(`AppID 校验一致: ${appId}`);
    }

    // 递归查找所有的 icon 标签
    const findIcons = (obj: any): string[] => {
      let icons: string[] = [];
      if (obj.icon) {
        obj.icon.forEach((i: any) => i.$.src && icons.push(i.$.src));
      }
      if (obj.platform) {
        obj.platform.forEach((p: any) => {
          icons = icons.concat(findIcons(p));
        });
      }
      return icons;
    };

    const iconPaths = findIcons(result.widget);
    if (iconPaths.length === 0) {
      consola.warn("⚠️  警告：config.xml 中未配置 App 图标 (<icon src='...' />)");
    } else {
      for (const path of iconPaths) {
        if (!fs.existsSync(join(process.cwd(), path))) {
          consola.error(`❌ 错误：图标文件不存在！配置路径为: "${path}"`);
          const confirmContinue = await consola.prompt("图标缺失会导致打包失败或使用默认图标，是否继续?", { type: "confirm" });
          if (!confirmContinue) process.exit(0);
        } else {
          consola.success(`图标校验通过: ${path}`);
        }
      }
    }

    // 自动更新插件逻辑
    const wwwPath = join(process.cwd(), "www");
    const glob = new Glob("**/*.{js,html}");
    let combinedContent = "";
    for await (const file of glob.scan(wwwPath)) {
      combinedContent += fs.readFileSync(join(wwwPath, file), "utf-8");
    }
    const detectedPlugins = Object.keys(PLUGIN_MAP).filter(k => combinedContent.includes(k)).map(k => PLUGIN_MAP[k]);
    result.widget.plugin = result.widget.plugin || [];
    const currentPlugins = result.widget.plugin.map((p: any) => p.$.name);
    detectedPlugins.forEach(p => {
      if (!currentPlugins.includes(p)) {
        consola.success(`自动添加插件: ${p}`);
        result.widget.plugin.push({ $: { name: p, spec: "latest" } });
      }
    });
    fs.writeFileSync(configPath, new Builder().buildObject(result));
  }

  // --- 2. index.html 注入状态检查 ---
  const wwwPath = join(process.cwd(), "www");
  const indexPath = join(wwwPath, "index.html");
  let html = fs.readFileSync(indexPath, "utf-8");

  const hasInjected = html.includes("<!-- INJECT_START -->");
  const hasVConsole = html.includes("vconsole.min.js");
  const hasSafeArea = html.includes("safe-area-inset-top");

  if (hasInjected) {
    consola.info(`💡 检测到 index.html 已存在注入内容 (调试: ${hasVConsole ? '是' : '否'}, 安全区域: ${hasSafeArea ? '是' : '否'})`);
    const reInject = await consola.prompt("是否需要重新配置 (更新注入内容)?", { type: "confirm" });
    if (!reInject) return;
    html = html.replace(/<!-- INJECT_START -->[\s\S]*?<!-- INJECT_END -->/g, "");
  }

  const useVConsole = await consola.prompt("是否开启 vConsole 调试面板?", { type: "confirm" });
  const useSafeArea = await consola.prompt("是否保留安全区域 (避开留海屏)?", { type: "confirm" });

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
 * ================= 构建流程 =================
 */
async function runBuild() {
  try {
    await processProject();

    consola.start("🚀 正在提交并推送到 GitHub...");
    await $`git add .`;
    await $`git commit -m "Build: ${new Date().toLocaleString()}" --allow-empty`;
    await $`git push origin main`;

    console.log("");
    let progress = 0;
    let status = "queued";

    await new Promise(r => setTimeout(r, 8000));
    const runRes = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs?per_page=1`, { headers: HEADERS });
    const runData = await runRes.json();
    const runId = runData.workflow_runs[0].id;

    while (status !== "completed") {
      const checkRes = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs/${runId}`, { headers: HEADERS });
      const checkData = await checkRes.json();
      status = checkData.status;

      if (checkData.conclusion === "failure") {
        console.log("");
        throw new Error("GitHub 构建失败，请查看 Actions 日志。");
      }

      if (progress < 95) progress += (95 - progress) * 0.15;
      const filled = Math.round((progress / 100) * 30);
      process.stdout.write(`\r  ${"█".repeat(filled)}${"░".repeat(30 - filled)} ${Math.round(progress)}% | 状态: ${status}...   `);

      if (status !== "completed") await new Promise(r => setTimeout(r, 10000));
    }

    process.stdout.write(`\r  ${"█".repeat(30)} 100% | 状态: 已完成!          \n\n`);
    consola.success("✅ 云端构建成功！");

    consola.start("📥 正在回收 APK 文件...");
    const artRes = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/actions/runs/${runId}/artifacts`, { headers: HEADERS });
    const artData = await artRes.json();
    const artifact = artData.artifacts.find((a: any) => a.name === CONFIG.artifactName);

    const zipPath = join(process.cwd(), "temp_apk.zip");
    await Bun.write(zipPath, await (await fetch(artifact.archive_download_url, { headers: HEADERS })).arrayBuffer());
    await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: CONFIG.downloadDir })).promise();
    fs.unlinkSync(zipPath);

    consola.ready(`✨ 打包完成！已下载至: ${join(CONFIG.downloadDir, "app-debug.apk")}`);

  } catch (err: any) {
    console.log("");
    consola.error("流程中止:", err.message);
  }
}

runBuild();