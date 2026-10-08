# Changelog · 更新日志

Newest version first. Download any version from [Releases](https://github.com/ericzhang12111-cell/RhinE/releases).
最新版本在最上面；各版本可在 Releases 页面下载。

## 1.3.0 — 2026-10-08

**Added · 新增**
- Portable bundle `RhinE-1.3.0-portable.zip`: unzip, double-click `Setup 一键安装.cmd`, done.
  便携懒人包：解压后双击 `Setup 一键安装.cmd` 即可。
- One-click install into your own foobar2000: double-click `install.cmd`. It finds foobar2000, offers to close it, and
  installs Columns UI and JSplitter when they are missing. `uninstall.cmd` works the same way.
  一键安装到你自己的 foobar2000：双击 `install.cmd`。它会自动找到 foobar2000、询问是否关闭它，缺少 Columns UI 或
  JSplitter 时自动安装；卸载同样只需双击 `uninstall.cmd`。
- `DSP` in the bottom bar: pick a DSP preset, open the equalizer or the DSP Manager.
  底栏新增 `DSP`：切换 DSP 预设，打开均衡器或 DSP 管理器。
- `PREFERENCES` in the header opens foobar2000's Preferences. 顶栏新增 `首选项`，直接打开 foobar2000 首选项。
- `VISUALIZATIONS` in the Signal view opens foobar2000's visualizations and those of installed components.
  信号视图新增 `可视化`：打开 foobar2000 自带及已安装组件提供的可视化。
- `+ ADD MUSIC FOLDER` in the empty Archive. 档案为空时显示 `+ 添加音乐文件夹`。

**Changed · 改进**
- Installation guides are now separate and short: `INSTALL.md` / `安装指南.md`. Everything else is in `README.md` /
  `其他信息.md`. 安装说明独立成篇：`INSTALL.md` / `安装指南.md`；其余内容在 `README.md` / `其他信息.md`。

**Fixed · 修复**
- Light / dark now also switches in translated (e.g. Chinese) builds of foobar2000; if it still cannot, a message says
  where to switch it. 浅色 / 深色切换在汉化版 foobar2000 中也能生效；仍无法切换时会提示在哪里设置。
- Translated lyrics: many more lines get their translation. NetEase often splits, joins or words lines differently from
  LRCLIB; lines are now matched by how alike they are, in order (Believer: 44 of 45 lines instead of 37).
  歌词翻译：更多歌词行能显示译文。网易云的歌词常与 LRCLIB 分行或用词不同，现在按相似度依次匹配（Believer：45 行中
  44 行有译文，原来是 37 行）。

## 1.2.0 — 2026-10-08

**Added · 新增**
- Interface language: English, 简体中文, 日本語 (`MENU › Audio Archive › Language`; follows Windows by default).
  界面语言：英文、简体中文、日文（跟随 Windows 显示语言，可在菜单中切换）。
- Translated lyrics: Chinese community translations from NetEase Cloud Music (on by default for Chinese Windows), and
  optional machine translation (MyMemory, Baidu Translate, DeepL). NetEase also fills in lyrics LRCLIB does not have.
  歌词翻译：网易云音乐网友翻译（中文 Windows 默认开启）；可选机器翻译（MyMemory、百度翻译、DeepL）；LRCLIB 没有的歌词也会从网易云获取。
- Lyrics view: scroll with the mouse wheel to read ahead or back, click a line to play from it.
  歌词视图：滚轮前后翻看歌词，点击某一行即可从该处播放。
- `安装指南与其他信息.md`: the Chinese guide, in the download. 中文安装指南随发布包提供。

**Changed · 改进**
- Updating keeps your settings (skin, scheme, light / dark, sizes, Archive options, language).
  更新主题时保留你的设置（外壳、配色、浅色 / 深色、大小、档案选项、语言）。
- JSplitter 4.3.x works (3.9.4 still fine). The installer stops with a clear message on 32-bit foobar2000.
  支持 JSplitter 4.3.x（3.9.4 仍可用）；在 32 位 foobar2000 上安装会给出明确提示。
- Smaller download: about 210 MB instead of 320 MB. 下载更小：约 210 MB（原 320 MB）。

**Fixed · 修复**
- The profile card no longer cuts its last line in half on short windows (1366 × 768).
  在较矮的窗口（1366 × 768）上，资料卡最后一行不再被截断。

## 1.1.0 — 2026-10-07

**Added · 新增**
- Inspect the playing album from the bottom bar's cover or the *Signal profile* card.
  点击底栏封面或*信号资料*卡片即可查看正在播放的专辑。
- Text size (90 – 150 %), Archive array scale (80 – 130 %), inspection size (100 – 150 %).
  文字大小、档案阵列缩放、查看尺寸可调。
- Lyrics view: a live spectrum panel and balanced columns. 歌词视图：实时频谱面板，左右栏更均衡。

**Fixed · 修复**
- Layout at large text sizes and on 4K screens. 大字号和 4K 屏幕下的排版问题。
- A non-square cover no longer changes shape while inspecting it. 非正方形封面在查看时不再变形。
- A long format badge no longer covers the album number. 过长的格式标签不再遮住专辑编号。

## 1.0.0 — 2026-10-06

First release: Archive, Playlists, Lyrics, Signal and Style views, ten case skins, five colour schemes in light and
dark, the intro film, synced lyrics with LRCLIB.
首个版本：档案、播放列表、歌词、信号、外观五个视图，十种外壳，五套配色（浅色与深色），开场动画，同步歌词与 LRCLIB 在线获取。
