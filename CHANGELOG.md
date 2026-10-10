# Changelog · 更新日志

Newest version first. Download any version from [Releases](https://github.com/ericzhang12111-cell/RhinE/releases).
最新版本在最上面；各版本可在 Releases 页面下载。

## Unreleased

**Added · 新增**
- A floor under the Archive array: `FLOOR › LAB DECK` in the `05 STYLE` view (or `MENU › Audio Archive › Archive
  floor`) stands the shelves on a rendered lab deck, with their shadows on it, in light and dark. `PLAIN` keeps the
  page colour. 档案阵列可选地面：在 `05 外观` 视图中选择 `地面 › 实验甲板`（或 `菜单 › Audio Archive › 档案地面`），货架立在渲染的
  实验甲板上并投下阴影，浅色与深色均可；`纯色` 保持原来的背景色。
- `FLOOR › REAL STYLE`: the Archive as one rendered scene, frosted cases in their rails on a walnut desk in warm
  light, each case shaded by its neighbours. It always uses the FROST case. `地面 › 写实风格`：档案呈现为一个渲染场景——
  磨砂外壳立在胡桃木桌面上的导轨里，暖光照明，每个外壳都带有相邻外壳的阴影；此模式固定使用 FROST 外壳。
- `RANDOM PICK` in the Archive (or `R`): the selection runs through the shelves and slows down on a random album,
  which is lifted out and plays (in the grid it is selected and plays). 档案新增 `随机抽取`（或按 `R`）：选择框在货架间
  跑动，逐渐减速停在一张随机专辑上，将其取出并播放（网格中则选中并播放）。
- Each case's title is printed on a strip along its top edge, so the shelves can be read from above like records in a
  crate (right-click the Archive to turn it off). 每个外壳的顶边贴有标题条，可以像翻唱片箱一样从上方读出货架上的专辑
  （可在档案中右键关闭）。

**Changed · 改进**
- The case skins are lit from the right: in the Archive the cases' tops and spine sides catch the light and the gaps
  between them are no longer in shade, so every case stands out and the covers behind the front one stay visible
  (array and inspection; the profile card is unchanged). 外壳改为从右侧打光：档案中外壳的顶面和书脊侧被照亮，外壳之间的空隙
  不再处于阴影中，每个外壳更立体，前排之后的封面也更清楚（阵列与查看动画；资料卡不变）。

**Fixed · 修复**
- The intro film plays every time foobar2000 starts (it is on by default; `MENU › Audio Archive` turns it off). Until now
  it was usually seen only on the first start after installing: on later starts it began before the window had a size
  and played unseen. 开场动画现在每次启动 foobar2000 都会播放（默认开启，可在 `菜单 › Audio Archive` 中关闭）。此前通常只在
  安装后第一次启动时看得到：之后的启动中，动画在窗口尚无尺寸时就开始播放，因此看不到。
- Lyrics written into the file are read in every common form: plain lyrics (without time stamps) are shown, unsynced,
  and scroll with the wheel; MP3 lyrics (shown by foobar2000 as `UNSYNCED LYRICS`) are found, timed or not. Synced
  lyrics online still take precedence over plain ones. 内嵌歌词的常见写法都能读取：不带时间轴的纯文本歌词会显示（未同步，可用
  滚轮浏览）；MP3 内嵌歌词（foobar2000 显示为 `UNSYNCED LYRICS`）无论是否带时间轴都能读到；在线有同步歌词时仍优先使用同步歌词。
- On smaller windows (such as 1366 × 768) the selected case near the end of a shelf could sit under the Archive's top
  bar, cut off; a shelf now scrolls far enough, and again when the window is resized. 在较小的窗口（如 1366 × 768）中，
  货架末尾附近选中的外壳可能被档案顶栏遮住；现在货架会滚动到位，窗口改变大小时也会重新滚动。
- The update check's jsDelivr fallback (for when GitHub cannot be reached) asks for the latest release rather than
  the main branch, which jsDelivr can serve hours out of date. 检查更新时的 jsDelivr 备用地址改为读取最新发布版本，而不是
  main 分支（jsDelivr 对分支的缓存可能滞后数小时）。

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
- One-click updates from now on: an `UPDATE` chip in the bottom bar when a new version is out; it downloads only what
  changed (GitHub, else jsDelivr), checks it and restarts foobar2000 with your settings.
  从此可以一键更新：有新版本时底栏显示 `更新` 标签，只下载有变化的文件（GitHub，失败时 jsDelivr），校验后重启 foobar2000，设置保留。

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
