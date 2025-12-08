// 字幕文件转换脚本：将 .lrc/.srt 文件转换为 .json 格式
// 使用方法：node convert-subtitles.js

const fs = require('fs');
const path = require('path');

const SUBTITLE_DIR = path.join(__dirname, 'subtitles');

// 解析 .lrc 文件
function parseLrc(content, fileName) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const segments = [];

  const timeRe = /\[(\d{2}):(\d{2}\.\d{2})]/; // [mm:ss.xx]

  let idx = 1;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(timeRe);
    if (!m) continue;
    const [, mm, ssxx] = m;
    const text = line.replace(timeRe, "").trim();
    if (!text) continue;

    // 转成类似 00:mm:ss,ms 的格式，方便显示
    const [ss, xx] = ssxx.split(".");
    const startTime = `00:${mm}:${ss},${xx.padEnd(3, "0")}`;

    segments.push({
      file: fileName,
      index: idx++,
      startTime,
      endTime: "",
      text,
    });
  }

  return segments;
}

// 解析 .srt 文件
function parseSrt(content, fileName) {
  const blocks = content
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const segments = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 2) continue;

    // 第一行通常是编号，第二行是时间轴
    const maybeIndex = lines[0].trim();
    const timeLine = lines[1].trim();
    const textLines = lines.slice(2);

    const timeMatch =
      timeLine &&
      timeLine.match(
        /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
      );
    const startTime = timeMatch ? timeMatch[1] : "";
    const endTime = timeMatch ? timeMatch[2] : "";

    const text = textLines.join(" ").replace(/<[^>]+>/g, "").trim();
    if (!text) continue;

    segments.push({
      file: fileName,
      index: Number.isFinite(+maybeIndex) ? parseInt(maybeIndex, 10) : null,
      startTime,
      endTime,
      text,
    });
  }

  return segments;
}

// 递归查找所有字幕文件
function findSubtitleFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      findSubtitleFiles(filePath, fileList);
    } else if (file.endsWith('.lrc') || file.endsWith('.srt')) {
      const relativePath = path.relative(SUBTITLE_DIR, filePath).replace(/\\/g, '/');
      fileList.push(relativePath);
    }
  }

  return fileList;
}

// 转换单个文件
function convertFile(filePath) {
  const fullPath = path.join(SUBTITLE_DIR, filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.error(`文件不存在: ${filePath}`);
    return false;
  }

  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lower = filePath.toLowerCase();
    
    let segments;
    if (lower.endsWith('.lrc')) {
      segments = parseLrc(content, filePath);
    } else if (lower.endsWith('.srt')) {
      segments = parseSrt(content, filePath);
    } else {
      console.error(`不支持的文件格式: ${filePath}`);
      return false;
    }

    // 生成 JSON 文件路径
    const jsonPath = fullPath.replace(/\.(lrc|srt)$/, '.json');
    
    // 保存为 JSON（紧凑格式，减少文件大小）
    fs.writeFileSync(jsonPath, JSON.stringify(segments), 'utf-8');
    
    console.log(`✓ ${filePath} → ${path.relative(SUBTITLE_DIR, jsonPath).replace(/\\/g, '/')} (${segments.length} 条)`);
    return true;
  } catch (err) {
    console.error(`转换失败 ${filePath}:`, err.message);
    return false;
  }
}

// 主函数
function main() {
  console.log('开始转换字幕文件...\n');

  const files = findSubtitleFiles(SUBTITLE_DIR);
  
  if (files.length === 0) {
    console.log('未找到任何 .lrc 或 .srt 文件');
    return;
  }

  console.log(`找到 ${files.length} 个字幕文件\n`);

  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    if (convertFile(file)) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log(`\n转换完成: 成功 ${successCount} 个, 失败 ${failCount} 个`);
}

// 运行
main();

