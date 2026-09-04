<div align="center">

<img src="design/icon/codedoc-icon-source.png" width="110" alt="CodeDoc Generator" />

# CodeDoc Generator · 软著代码整理器

**一键生成软著代码审核材料**

全程离线 · 代码不出本机 · 规范内置 · 导出前自动校验

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)](#下载)
[![Electron](https://img.shields.io/badge/Electron-43-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#参与贡献)

</div>

---

## 10 秒了解 CodeDoc Generator

CodeDoc Generator 把繁琐的“软件著作权源程序材料”提交规则整理成一套本地流水线。

> **使用流程：** 导入本地项目 → 筛选并排序代码文件 → 清洗与规范化排版 → 分页预览 → 校验并导出

### 1. 选择项目

按真实目录结构勾选需要纳入材料的文件，调整文件顺序。

![文件筛选、排序与代码量统计界面](design/snapshot/step-2.jpg)

### 2. 设置清洗与排版规则

填写软件全称、版本号和著作权人名称，按需设置清洗规则。

![代码清洗、脱敏与排版设置界面](design/snapshot/step-3.jpg)

### 3. 预览分页效果

预览生成效果，核对页眉、页脚等信息，确认材料内容和版式符合预期。

![源程序材料分页预览界面](design/snapshot/step-4.jpg)

### 4. 自定义扫描规则

避开依赖、构建产物和缓存目录，支持自定义规则。

![扫描排除规则、隐私说明与应用信息设置界面](design/snapshot/setting.jpg)

> CodeDoc 的扫描、清洗、脱敏、排版与导出都在本机完成，不会上传你的项目源码。导出结果是提交前的材料准备稿，最终仍需按照登记机构的最新要求复核。

---

## 为什么做这个

申请软件著作权登记时，需要提交**源程序鉴别材料**：前后各连续 30 页、每页不少于 50 行、页眉标注软件全称+版本号……格式细节繁多，一处不合就被退回补正。手工整理一次要花几个小时，而市面上的工具要么只做简单拼接、要么依赖在线服务（代码泄露风险）。

CodeDoc Generator 就是把这些繁琐的流程收敛到软件内部，帮助大家减少手工整理材料出错的概率以及审核时的补正风险。

> [!IMPORTANT]
> **当前版本发布状态**
>
> 当前稳定版本为 **v1.0.3**。GitHub Release 已完成正式发布，macOS arm64、macOS x64 和 Windows x64 安装包均可公开下载。
>
> GitHub Release 是当前默认发布与更新来源。

## 下载

请从 [GitHub Releases](https://github.com/littleben803/CodeSucker/releases) 获取正式版本。当前稳定版为 [v1.0.3](https://github.com/littleben803/CodeSucker/releases/tag/v1.0.3)：

| 平台 | 安装包 | 更新方式 |
|---|---|---|
| macOS Apple Silicon | [下载 DMG](https://github.com/littleben803/CodeSucker/releases/download/v1.0.3/CodeDoc-1.0.3-mac-arm64.dmg) | 支持应用内检查、下载和安装更新 |
| macOS Intel | [下载 DMG](https://github.com/littleben803/CodeSucker/releases/download/v1.0.3/CodeDoc-1.0.3-mac-x64.dmg) | 支持应用内检查、下载和安装更新 |
| Windows x64 | [下载 EXE](https://github.com/littleben803/CodeSucker/releases/download/v1.0.3/CodeDoc-1.0.3-win-x64.exe) | 支持发现新版本，更新时人工下载安装包 |

macOS 正式安装包已完成 Developer ID 签名、Apple 公证、staple 和 Gatekeeper 验证。Windows 安装包当前未做代码签名，安装时可能出现系统安全提示；请核对下载来源为本仓库的 GitHub Release。

## 功能特性

- 🗂 **目录级文件筛选** — 递归扫描项目并以真实目录树展示，支持目录三态选择、全选、清空和全局反选
- 🔄 **安全重新扫描** — 源码在应用外部变化后可手动重扫；保留当前项目配置与修改
- 📊 **文件类型构成与按后缀导出** — 按文件数/代码行查看完整与已选择构成，可一键只保留 `.java` 等指定后缀参与清洗和导出
- 🧹 **代码清洗安全可靠** — 逐字符识别注释与字符串边界（`"https://..."` 里的 `//` 不会被误删），支持 Java/Kotlin/Python/JS/TS/Go/Rust/C/C++/C#/Swift/PHP/Ruby/Vue/HTML/CSS/SQL 等 30+ 后缀；删空行、Tab 转空格、超长行按 78 列硬折断
- 🔒 **敏感信息脱敏** — API 密钥、密码、内网 IP、手机号自动替换为占位符
- 📄 **规范化截取分页** — 超 3600 行自动取前 1800 + 后 1800 行；第 1 页必为模块开头、第 60 页必为模块结尾；产品按每页 60 行显式分页，不靠排版"凑页"
- 📝 **一键导出** — PDF / docx（页眉=软件名+版本号、右上角自动页码、宋体 10.5pt、12pt 固定行距）+ txt 备查
- ✅ **提交前风险校验** — 检查有效内容、每页行数、末页 2/3、页眉一致性、首末页边界和 `@author`/`Copyright` 署名冲突，给出「通过 / 警告 / 退回风险」三级结论
- 🔐 **核心处理完全离线** — 扫描、清洗、排版和导出均在本机完成；macOS 正式安装版支持应用内版本更新
- 📌 **最近项目管理** — 常用项目可置顶，失效或不再使用的记录可单项或批量移除；移除记录不会删除磁盘项目

## 内置整理规则对照

| 规范要求 | CodeDoc Generator 的实现 |
|---|---|
| 前、后各连续 30 页，共 60 页 | 超 3600 行自动截取前 1800 + 后 1800 行 |
| 每页不少于 50 行 | 产品按 60 行切块 + 显式分页符，逐页保证 |
| 页眉标注软件全称+版本号 | 导出时写入页眉，未含版本号会在校验中警告 |
| 页角标注著作权人名称 | 导出时写入页脚，未含著作权人名称会在校验中警告 |
| 页码 1–60 连续 | PDF PAGE 域自动编号 |
| 第 1 页为程序开头、第 60 页为结尾 | 截取策略从首文件首行起、至末文件末行止 |
| 无空行、注释不凑页 | 清洗阶段删除（可关闭） |
| 末页至少满 2/3 | 校验器检查并提示 |
| 署名与著作权人一致 | 全文扫描 `@author`/`Copyright` 并比对 |

> 依据：[《计算机软件著作权登记办法》](https://www.ncac.gov.cn/xxfb/flfg/bmgz/202410/P020241015604759788122.pdf)及中国版权保护中心公开审查口径。本工具不构成法律建议，最终以登记机构要求为准。

## 从源码运行

### 开发运行

```bash
在项目根目录下运行
npm ci
npm run dev        # 启动桌面应用
npm test           # core 流水线冒烟测试
npm run verify     # 版本一致性 + 测试 + 完整校验
```

> **国内网络提示**：Electron 二进制下载失败时执行
> `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js`

### 使用流程

**① 导入项目**（拖入文件夹）→ **② 文件与排序**（勾选纳入、拖拽调序，入口文件置顶）→ **③ 清洗与排版**（填写软件全称+版本号、著作权人名称、清洗规则选择、实时清洗前后对比）→ **④ 分页预览**（PDF 预览、页码导航）→ **⑤ 校验与导出**（风险报告 + 生成 PDF/docx/txt）

## 架构

```
packages/
  core/       纯 TypeScript 流水线，零 Electron 依赖
  app/        Electron 43 + React 18 + zustand（electron-vite 5 / Vite 7 构建）
design/
  prototype/  高保真原型（UI 实现基准）
  icon/       应用与官网共用的唯一品牌图标源（PNG）
  theme/      深色和浅色模式的设计图和 UI 规范
docs/         功能设计、技术选型与原型 prompt
scripts/      图标生成、打包等工具脚本
```

关键技术方案（详见 [docs/01-功能设计与技术选型.md](docs/01-功能设计与技术选型.md)）：

## 常见问题

**Q：生成的文档能直接提交吗？**
生成的 PDF/docx 已按应用内置规则排版，可作为源程序鉴别材料的准备稿。提交前仍应查看第 5 步报告、清零「退回风险」，并以登记机构最新要求和申请主体的实际情况为准。本工具不构成法律建议。

**Q：我的代码会被上传吗？**
不会。扫描、清洗、排版和导出全部在本机完成，不会上传项目内容、路径或导出资料。正式安装版仅在检查和下载应用更新时访问所配置的发布来源。


## Support / 请小虎喝杯☕️ / 给猫猫加个🍗

如果这个工具帮你跳出了“复制代码 → 数行数 → 调页眉 → 重新分页”的循环，欢迎给项目点个 Star、分享给需要的人，或者提交 Issue / PR。提交前请确保 `npm run verify` 通过，提交信息请说明动机而不止是改动内容。

如果它真的帮你省下了一点时间，也可以请小虎同学喝一杯 ¥9.9 的瑞幸，让下一个 bug 至少是在咖啡因充足的情况下被修掉。

家里还有两位不写代码、但坚持参加需求评审的同事：年年和芭比。你也可以投喂一个猫罐头🐱🥩🥫，给他们加个餐。毕竟开源可以靠爱发电，猫粮暂时还不支持 `npm install`。🐱

<p align="center">
  <img src="design/support/cats-together-card.jpg" width="720" alt="年年和芭比的合照" />
</p>

<p align="center"><strong>年年 × 芭比</strong><br />负责需求评审、键盘踩测，以及提醒维护者按时开罐头。</p>

<table>
  <tr>
    <td align="center" width="50%">
      <img src="design/support/niannian-card.jpg" width="320" alt="年年" />
    </td>
    <td align="center" width="50%">
      <img src="design/support/barbie-card.jpg" width="320" alt="芭比" />
    </td>
  </tr>
  <tr>
    <td align="center"><strong>年年</strong> · 负责需求评审</td>
    <td align="center"><strong>芭比</strong> · 负责键盘踩测</td>
  </tr>
</table>

<table>
  <tr>
    <td align="center" width="50%">
      <a href="design/support/wechat-qr.png">
        <img src="design/support/wechat-support-card.png" width="320" alt="微信赞赏码：给年年和芭比加个餐" />
      </a>
    </td>
    <td align="center" width="50%">
      <a href="design/support/alipay-qr.png">
        <img src="design/support/alipay-support-card.png" width="320" alt="支付宝收钱码：请小虎喝杯 9.9 瑞幸" />
      </a>
    </td>
  </tr>
  <tr>
    <td align="center">微信赞赏 · 给猫猫加餐</td>
    <td align="center">支付宝 · 请小虎喝杯瑞幸</td>
  </tr>
</table>

> 完全自愿，不会解锁额外功能，也不会影响 CodeDoc Generator 的免费开源使用😜 点击卡片可查看原始二维码，感谢兄弟们的支持。

## 许可证

[Apache-2.0](LICENSE)

本项目允许使用、修改、分发及闭源商用；再分发时须附带 Apache-2.0 许可证、保留适用的版权与 [NOTICE](NOTICE) 声明，并标明对文件所作的修改。
