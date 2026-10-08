# RhinE — An Audio Archive

*A foobar2000 theme.*

**English** · [中文](#中文)

An archive terminal for listening: Swiss typography, a monochrome palette with one accent colour, and a sci-fi layer —
your albums as rendered specimen cases on shelves, a Möbius signal ring that pulses with the music, synced lyrics
(fetched online when your files have none), ten case skins and five colour schemes in light and dark. Windows,
foobar2000 v2 with Columns UI and JSplitter.

[![YouTube Video](https://img.shields.io/badge/YouTube-Watch_Video-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://www.youtube.com/watch?v=g_raaMu_Fp0)
[![RhinE](https://i2.hdslb.com/bfs/archive/02ff5d803b96978126e29b571d7eebaf551ca2c1.jpg)](https://www.youtube.com/watch?v=g_raaMu_Fp0)

<img width="1932" height="1050" alt="archive-light" src="https://github.com/user-attachments/assets/b976cbf7-bd5b-4a20-bc41-62a6bdee1099" />

![Archive view](theme/screenshots/v1/archive.jpg)

<img width="1932" height="1050" alt="inspect" src="https://github.com/user-attachments/assets/e117132d-6e33-4986-9fc5-911678d7b723" />

<img width="1932" height="1050" alt="playlists" src="https://github.com/user-attachments/assets/43e3288a-d9ea-4094-9df9-db68fe9e14ae" />

<img width="1932" height="1050" alt="lyrics" src="https://github.com/user-attachments/assets/09919a74-0237-43f4-a858-f68b1ea46c0c" />

<img width="1932" height="1050" alt="classic" src="https://github.com/user-attachments/assets/b7e3cde1-861a-4e6c-b4fb-5ccce1c6a5c1" />

<img width="1932" height="1050" alt="signal" src="https://github.com/user-attachments/assets/19aa2113-09b0-426f-80e3-0efc116e899d" />

<img width="1932" height="1050" alt="style" src="https://github.com/user-attachments/assets/e41d48a4-d335-4414-9056-95c07281c4c0" />

<img width="3412" height="1606" alt="162b47adff8e2d2c7f9ca23ff9757cc3" src="https://github.com/user-attachments/assets/aec4c0a3-d1f3-4503-9a76-5632f00b5246" />

## English

Five views: **Archive** (every album, or every track, as a rendered specimen case on shelves, or a cover grid),
**Playlists** (playlist manager, track rail, the native playlist in two presets, a profile card with the queue),
**Lyrics** (synced lyrics from your files or fetched online, with a translation when they are in another language),
**Signal** (a rendered ∞ ring, spectrum and the whole-track waveform, or a Classic player screen) and **Style** (ten
case skins and five colour schemes). A pre-rendered intro film, scan transitions, grain and a Reduce motion option.
The interface is in English, Chinese or Japanese.

### Download / install / use

#### 1. Before you start

| You need | Version | Download |
|---|---|---|
| foobar2000 | v2, **64-bit** (x64) | [foobar2000.org](https://www.foobar2000.org/download) |
| Columns UI | 3.7 or later | [GitHub Releases](https://github.com/reupen/columns_ui/releases) |
| JSplitter | **x64** (tested: 3.9.4, 4.3.1, 4.3.3) | [GitHub Releases](https://github.com/dima-lur/jsplitter/releases) |

> **Note:** foobar2000 and JSplitter must both be **64-bit (x64)**. The 32-bit (x86) foobar2000 shows a **black
> window**, and the installer refuses it. If the window stays black with *Error setting panel config* in the console,
> switch to JSplitter 3.9.4.

Install the components: in foobar2000 open *Preferences › Components*, click *Install…*, pick the downloaded component
file and restart foobar2000 when asked. Install both before you go on.

#### 2. Download the theme

1. Open this repository's [Releases](../../releases) page and download `audio-archive-1.2.0.zip`.
2. (Optional) Check the file: open PowerShell in the download folder and run
   `Get-FileHash .\audio-archive-1.2.0.zip -Algorithm SHA256`;
   the result should match `audio-archive-1.2.0.zip.sha256` on the same page.
3. Right-click the zip › *Extract All*, which gives you the folder `audio-archive-1.2.0`.

#### 3. Install

1. **Close foobar2000 first.**
2. Open the extracted `audio-archive-1.2.0` folder, right-click an empty spot › *Open in Terminal* (Windows 10: hold
   Shift and right-click › *Open PowerShell window here*).
3. Run the command below; after `-Foobar` put **the folder that contains `foobar2000.exe`**:

   ```powershell
   powershell -ExecutionPolicy Bypass -File install.ps1 -Foobar "C:\Program Files\foobar2000"
   ```

   For a portable install, give the portable folder; the script detects it.

The installer:

1. checks that foobar2000 is v2 and 64-bit, is closed, and has Columns UI and JSplitter (if anything is missing it
   changes nothing);
2. backs up the current configuration to `<profile>\audio-archive-backup\<date-time>\`;
3. copies the theme to `<profile>\themes\audio-archive\`;
4. installs the Geist Mono fonts for your Windows user (no admin rights; `-NoFonts` skips this);
5. switches the interface to Columns UI;
6. starts foobar2000 and imports the theme's layout (`-NoStart` skips this).

`<profile>` is the configuration folder: `%APPDATA%\foobar2000-v2` for a standard install, `<foobar2000 folder>\profile`
for a portable one.

**Updating:** run the new version's `install.ps1` the same way. From 1.2 on, your settings (case skin, colour scheme,
light / dark, sizes, Archive options, language) are kept.

**Last step: add your media library.** In *Preferences › Media Library*, add your music folders. The Archive view shows
the albums of the media library; without one it shows what is in all your playlists. The first start with a large
library extracts every album's cover once in the background (about 30 s for 600 albums).

**By hand instead:** copy `js`, `tokens`, `columns` and `assets` to `<profile>\themes\audio-archive\`, install the fonts
in `assets\fonts`, switch to Columns UI in *Preferences › Display › User interface module*, then
*Preferences › Display › Columns UI › Import configuration…* and pick `columns\audio-archive.fcl`.

#### 4. Use

| To | Mouse | Key |
|---|---|---|
| Switch view: Archive / Playlists / Lyrics / Signal / Style | click `01` – `05` in the header | `1` – `5` |
| Light / dark | `LIGHT` / `DARK` at the right of the bottom bar | `T` |
| Play / pause, previous, next, stop | the bottom bar's buttons | `Space` |
| Search | click `SEARCH ARCHIVE` and type (in the Archive it filters the albums) | `/` then type, `Esc` to leave |
| Archive: pick an album / change shelf | hover and click a case; the wheel | `↑` `↓` album, `←` `→` shelf |
| Inspect the playing album | click the cover at the left of the bottom bar, or the *SIGNAL PROFILE* card in the Playlists / Lyrics view (right-click the cover: show the track in its playlist) | — |
| Archive: inspect an album (the case lifts and turns) | click the selected case | `Enter`, `Esc` to return |
| Archive: play from a track | click the track in the list on the right | — |
| Archive: group / sort / show tracks / grid | `GROUP`, `SORT`, `SHOW`, `LAYOUT` at the top | `G` toggles the grid |
| Lyrics: read ahead or back | the wheel over the lyrics (it returns to the sung line after 5 s) | — |
| Lyrics: play from a line | click the line | — |
| Signal: 3D ring / 2D ring / Classic | `MODEL 3D / 2D / CLASSIC` at the top right | `R` |
| Case skin, colour scheme | click a card in the `05 STYLE` view | `5` |
| Text size (90 – 150 %), Archive array scale (80 – 130 %), inspected case size (100 – 150 %) | `TEXT`, `ARRAY`, `INSPECT` at the top of the `05 STYLE` view, or `MENU › Audio Archive › Text size` / `Archive array scale` / `Inspection size` | — |
| Interface language: English / 简体中文 / 日本語 | `MENU › Audio Archive › Language · 语言 · 言語` | — |
| Intro film | `MENU › Audio Archive › Play intro film`, or `PLAY INTRO` in the Style view | `B` |
| Shuffle the whole library | `SHUFFLE ALL` | `S` |
| foobar2000's main menu | `MENU` at the top right | — |

Keys reach the theme when one of its panels has focus (click an empty spot in it first). The theme starts dark, with
the ARCHIVE colour scheme and the WHITE case, in Windows' display language. `MENU › Audio Archive` also has *Reduce
motion*, *Grain texture*, *Intro film at start* and *Fetch lyrics online*.

**Lyrics:** the theme reads an `.lrc` file with the track's name, or a `LYRICS` / `SYNCEDLYRICS` tag with time stamps;
two lines with the same time stamp are shown as original and translation. When a track has neither, the theme looks
it up on [LRCLIB](https://lrclib.net), an open database of synced lyrics: it sends the track's **artist, title, album
and length** to lrclib.net and keeps the result in `<profile>\audio-archive-cache\lyrics\` (never next to your music or
in its tags); a miss is not looked up again for a week. LRCLIB covers some languages thinly; turn it off with
*Fetch lyrics online* if you cannot reach it or do not want it. The
[OpenLyrics](https://github.com/jacquesh/foo_openlyrics) component can also save `.lrc` files or tags, which the theme
reads.

**Translated lyrics:** when a track's lyrics are in one language and it is not yours, a translation can be shown under
each line (*MENU › Audio Archive › Translate lyrics*; the language follows Windows' display language until you pick
one):
- **Chinese: community translations from NetEase Cloud Music, on by default when Windows is in Chinese.** The theme
  finds the song on [NetEase Cloud Music](https://music.163.com) (it sends the track's **artist, title and length**)
  and shows the translation its listeners wrote and timed; when LRCLIB has no lyrics either, NetEase's lyrics are used.
  This uses NetEase's public web endpoints, not an official API, so it can stop working without notice.
- **Machine translation, off by default**, for when there is no community translation: MyMemory (free, no key, a daily
  quota), Baidu Translate (your own free APP ID and key; reachable from mainland China) or DeepL (your own key). Only the
  lyric lines are sent, only to the service you chose; keys are kept on your computer only, in
  `<profile>\audio-archive-settings.json`.

Translations are kept in `<profile>\audio-archive-cache\lyrics\` too, so a song is looked up once.

Chinese and other CJK text uses Windows' own UI font (Geist Mono has no CJK). The text size applies to the theme's own
panels; the native playlist's font is set in *Preferences › Display › Columns UI › Colours and fonts*.

#### 5. Uninstall

Close foobar2000, then run in the theme folder:

```powershell
powershell -ExecutionPolicy Bypass -File uninstall.ps1 -Foobar "C:\Program Files\foobar2000"
```

It restores the configuration from before the theme was first installed (settings changed since then are reverted
too; the current configuration is backed up first) and removes the theme folder, its settings file and the fonts.
`-KeepConfig` removes the files only; `-KeepFonts` keeps Geist Mono.

#### 6. Troubleshooting

- **Black window, or one empty panel:** check that foobar2000 and JSplitter are both 64-bit; if it persists, switch to
  JSplitter 3.9.4. Then run `install.ps1` again so it imports the layout again.
- **PowerShell says scripts are blocked:** use the full command above (with `-ExecutionPolicy Bypass`); if it is still
  blocked, run `Get-ChildItem -Recurse | Unblock-File` in the folder first.
- **The Archive is empty, or shows "all playlists":** no media library folder yet; see *Add your media library* above.
- **Changed an album's cover but the theme still shows the old one:** delete `<profile>\audio-archive-cache\covers\` and
  restart; the covers are made again.
- **foobar2000 uses about 5 – 8 % of one CPU core while idle:** that is JSplitter's own cost of about 1 % per panel;
  the theme does not redraw while nothing moves.
- **Animations are not smooth:** turn on JSplitter's *Use high-resolution timers* in *Preferences › Advanced*
  (optional).

More detail (every control, how each view works, known limits): [theme/README.md](theme/README.md). What changed in
each version: [CHANGELOG.md](CHANGELOG.md).

MIT licence ([LICENSE](LICENSE)); the Geist Mono fonts are under the SIL Open Font License.

---

## 中文

RhinE（An Audio Archive）是一个 foobar2000 主题，一个为聆听而设计的档案终端：瑞士风格排版、只有一种强调色的单色调色板，再加一层科幻感——你的专辑化作渲染出的标本盒陈列在
货架上，莫比乌斯信号环随音乐脉动，同步歌词（本地没有时自动在线获取，可显示中文译文），十种外壳皮肤和五套配色，每套都有浅色与深色。
适用于 Windows 上的 foobar2000 v2，基于 Columns UI 和 JSplitter。

[![Bilibili 视频](https://img.shields.io/badge/Bilibili-Demo_Video_on_BILIBILI-fb7299?style=for-the-badge&logo=bilibili&logoColor=white)](https://www.bilibili.com/video/BV1mYpK6WEPn)
[![RhinE](https://i2.hdslb.com/bfs/archive/02ff5d803b96978126e29b571d7eebaf551ca2c1.jpg)](https://www.bilibili.com/video/BV1mYpK6WEPn)

五个视图：**档案**（每张专辑——或每首曲目——都是货架上的一个标本盒，也可切换为封面网格）、**播放列表**（播放列表管理器、
曲目导轨、两种预设的原生播放列表、带播放队列的资料卡）、**歌词**（同步歌词，来自本地文件或 LRCLIB 在线获取）、
**信号**（渲染的 ∞ 信号环、频谱和整首曲目的波形，或经典播放器界面）以及**风格**（十种外壳皮肤和五套配色）。
另有预渲染的开场动画、扫描式切换转场、颗粒质感和"减少动态"选项。界面支持中文、英文和日文。

中文指南也作为单独的文件随发布包提供：`安装指南与其他信息.md`。

### 下载 / 安装 / 使用指南

#### 1. 准备工作

| 需要 | 版本 | 下载 |
|---|---|---|
| foobar2000 | v2，**64 位**（x64） | [foobar2000.org](https://www.foobar2000.org/download) |
| Columns UI | 3.7 或更高 | [GitHub Releases](https://github.com/reupen/columns_ui/releases) |
| JSplitter | **x64**（已测试 3.9.4、4.3.1、4.3.3） | [GitHub Releases](https://github.com/dima-lur/jsplitter/releases) |

> **注意：** foobar2000 和 JSplitter 都必须是 **64 位（x64）**。32 位（x86）的 foobar2000 会出现**黑屏**，安装脚本会拒绝安装。
> 如果仍然黑屏、控制台显示 *Error setting panel config*，请换用 JSplitter 3.9.4。

安装组件：在 foobar2000 中打开 *Preferences › Components*（首选项 › 组件），点 *Install…*（安装），选择下载的组件文件，
然后按提示重启 foobar2000。两个组件都装好后再继续。

#### 2. 下载主题

1. 打开本仓库的 [Releases](https://github.com/ericzhang12111-cell/RhinE/releases) 页面，下载 `audio-archive-1.2.0.zip`。
2. （可选）校验文件：在下载文件夹打开 PowerShell，运行
   `Get-FileHash .\audio-archive-1.2.0.zip -Algorithm SHA256`，
   结果应与同一页面的 `audio-archive-1.2.0.zip.sha256` 一致。
3. 右键 zip › *全部解压缩*，得到文件夹 `audio-archive-1.2.0`。

#### 3. 安装

1. **先关闭 foobar2000。**
2. 打开解压出的 `audio-archive-1.2.0` 文件夹，在空白处右键 › *在终端中打开*（Windows 10：按住 Shift 再右键 ›
   *在此处打开 PowerShell 窗口*）。
3. 运行下面的命令，`-Foobar` 后面填 **`foobar2000.exe` 所在的文件夹**：

   ```powershell
   powershell -ExecutionPolicy Bypass -File install.ps1 -Foobar "C:\Program Files\foobar2000"
   ```

   便携版直接填便携版的文件夹即可，脚本会自动识别。

安装脚本会依次：

1. 检查 foobar2000 是否为 v2 和 64 位、是否已关闭、是否装好 Columns UI 和 JSplitter（任何一项不满足都不会做任何改动）；
2. 把当前配置备份到 `<profile>\audio-archive-backup\<日期时间>\`；
3. 把主题复制到 `<profile>\themes\audio-archive\`；
4. 为当前 Windows 用户安装 Geist Mono 字体（无需管理员权限；加 `-NoFonts` 跳过）；
5. 把界面切换为 Columns UI；
6. 启动 foobar2000 并导入主题布局（加 `-NoStart` 跳过）。

`<profile>` 是配置文件夹：标准安装为 `%APPDATA%\foobar2000-v2`，便携版为 `<foobar2000 文件夹>\profile`。

**更新：** 用同样的方法运行新版本的 `install.ps1` 即可。从 1.2 起，你的设置（外壳、配色、浅色 / 深色、各项大小、档案
选项、界面语言）都会保留。

**最后一步：添加媒体库。** 在 *Preferences › Media Library*（首选项 › 媒体库）中添加你的音乐文件夹。档案视图展示的是
媒体库里的专辑；没有媒体库时，它会改为显示所有播放列表的内容。第一次打开大型曲库时，主题会在后台提取一次所有封面
（约 600 张专辑需 30 秒）。

**手动安装（不用脚本）：** 把 `js`、`tokens`、`columns`、`assets` 复制到 `<profile>\themes\audio-archive\`，安装
`assets\fonts` 里的字体，在 *Preferences › Display › User interface module* 中切换到 Columns UI，然后
*Preferences › Display › Columns UI › Import configuration…*，选择 `columns\audio-archive.fcl`。

#### 4. 使用

| 操作 | 鼠标 | 键盘 |
|---|---|---|
| 切换视图：档案 / 播放列表 / 歌词 / 信号 / 外观 | 点顶栏的 `01` – `05` | `1` – `5` |
| 浅色 / 深色 | 底栏右侧的浅色 / 深色按钮 | `T` |
| 播放 / 暂停、上一首、下一首、停止 | 底栏按钮 | `Space` |
| 搜索 | 点顶栏的搜索框后输入（档案视图中直接筛选专辑） | `/` 后输入，`Esc` 退出 |
| 档案：选专辑 / 换货架 | 鼠标悬停并点击标本盒；滚轮 | `↑` `↓` 专辑，`←` `→` 货架 |
| 查看正在播放的专辑 | 点击底栏左侧的封面，或播放列表 / 歌词视图右侧的*信号资料*卡片（右键封面：在播放列表中显示该曲目） | — |
| 档案：查看专辑（标本盒抬起并翻转） | 点击已选中的标本盒 | `Enter`，`Esc` 返回 |
| 档案：从某首曲目开始播放 | 点击右侧曲目列表中的曲目 | — |
| 档案：分组 / 排序 / 显示曲目 / 网格 | 顶部的分组、排序、显示、布局按钮 | `G` 切换网格 |
| 歌词：往前或往后看 | 在歌词上滚动滚轮（5 秒后自动回到正在唱的一行） | — |
| 歌词：从某一行开始播放 | 点击那一行 | — |
| 信号：3D 环 / 2D 环 / 经典界面 | 右上角的模型切换 | `R` |
| 外壳、配色方案 | 在 `05` 外观视图中点击卡片 | `5` |
| 文字大小（90–150%）、档案阵列缩放（80–130%）、查看时的标本盒大小（100–150%） | 外观视图的文字、阵列、查看三组按钮，或 `MENU › Audio Archive` 里的对应菜单 | — |
| 界面语言：English / 简体中文 / 日本語 | `MENU › Audio Archive › Language · 语言 · 言語` | — |
| 开场动画 | 外观视图的播放开场按钮，或菜单中的 *Play intro film* | `B` |
| 随机播放整个曲库 | 底栏的随机全部按钮 | `S` |
| foobar2000 主菜单 | 右上角的菜单按钮 | — |

键盘操作需要主题的某个面板获得焦点（先在面板空白处点一下）。主题默认为深色、ARCHIVE 配色、WHITE 外壳，界面语言跟随
Windows 显示语言。菜单里还有：减少动态、颗粒质感、启动时播放开场动画、在线获取歌词。

**歌词：** 主题读取与曲目同名的 `.lrc` 文件，或带时间戳的 `LYRICS` / `SYNCEDLYRICS` 标签；时间戳相同的两行会显示为
原文和译文。曲目没有歌词时，主题会到 [LRCLIB](https://lrclib.net)（开放的同步歌词库）查找：会把曲目的**艺术家、
标题、专辑和时长**发送给 lrclib.net，结果保存在 `<profile>\audio-archive-cache\lyrics\`，不会写入音乐文件夹或标签；
没找到的曲目一周内不再重复查询。LRCLIB 对部分语言收录较少；如果无法访问或不需要，可在菜单中关闭在线获取歌词。
也可以用 [OpenLyrics](https://github.com/jacquesh/foo_openlyrics) 组件保存 `.lrc` 文件或标签，主题会直接读取。

**歌词翻译：** 歌词只有一种语言、且不是你的语言时，可以在每行下方显示译文（*MENU › Audio Archive › Translate lyrics*；
默认跟随 Windows 显示语言）：
- **中文：网易云音乐的网友翻译，Windows 为中文时默认开启。** 主题会在[网易云音乐](https://music.163.com)查找这首歌
  （发送曲目的**艺术家、标题和时长**），显示网友翻译并校准好时间的译文；LRCLIB 也没有歌词时，会直接使用网易云的歌词。
  这里用的是网易云公开的网页接口，不是官方 API，将来可能失效。
- **机器翻译，默认关闭**，在没有网友翻译时使用：MyMemory（免费，无需密钥，每日有额度）、百度翻译（填入你自己的免费
  APP ID 和密钥，国内可直接访问）或 DeepL（你自己的密钥）。只发送歌词文本，且只发给你选择的服务；密钥只保存在本机的
  `<profile>\audio-archive-settings.json`。

译文同样保存在 `<profile>\audio-archive-cache\lyrics\`，每首歌只查询一次。

中文等 CJK 文字使用系统的中文界面字体显示（Geist Mono 不含中文）。文字大小只作用于主题自己绘制的面板；
原生播放列表（曲目表格）的字体在 *Preferences › Display › Columns UI › Colours and fonts* 中设置。

#### 5. 卸载

先关闭 foobar2000，再在主题文件夹中运行：

```powershell
powershell -ExecutionPolicy Bypass -File uninstall.ps1 -Foobar "C:\Program Files\foobar2000"
```

卸载会恢复首次安装主题之前的配置（之后改过的设置也会还原；当前配置会先存入备份文件夹），并删除主题文件夹、设置文件和字体。
加 `-KeepConfig` 只删除文件，加 `-KeepFonts` 保留 Geist Mono 字体。

#### 6. 常见问题

- **黑屏，或只有一个空面板：** 检查 foobar2000 与 JSplitter 是否都是 64 位；仍不行就换用 JSplitter 3.9.4。换好后重新运行一次
  `install.ps1`，让它重新导入布局。
- **PowerShell 提示脚本被阻止运行：** 请使用上面完整的命令（带 `-ExecutionPolicy Bypass`）；如仍被拦截，先运行
  `Get-ChildItem -Recurse | Unblock-File` 解除下载文件的锁定。
- **档案视图是空的，或显示"所有播放列表"：** 还没有添加媒体库文件夹，见上文"添加媒体库"。
- **改了专辑封面但主题里没变：** 删除 `<profile>\audio-archive-cache\covers\` 后重启，封面会重新生成。
- **空闲时 foobar2000 占用约 5–8% 的单核 CPU：** 这是 JSplitter 每个面板约 1% 的固有开销，主题本身静止时不重绘。
- **动画不够流畅：** 可在 *Preferences › Advanced* 中打开 JSplitter 的 *Use high-resolution timers*（可选）。

更详细的说明（全部操作、各视图的工作方式、已知限制）见 [theme/README.md](theme/README.md)（英文）；各版本的更新内容见 [CHANGELOG.md](CHANGELOG.md)。

本主题以 MIT 协议发布（[LICENSE](LICENSE)），Geist Mono 字体采用 SIL 开放字体协议。

#### Special Thanks

- 路北路陈 (LuBeiLuChen) https://space.bilibili.com/40238601 | RhineLabUI project: https://github.com/LBEILC/RhineLabUI
- Ronald没有魔杖 (Ronald Has No Wand) https://space.bilibili.com/171289190 | RhineLabUI-Music-Demo project: https://github.com/RonaldDeng/Rhine-Music-Demo
- Original Arknights PV: 《明日方舟》特别映像 [莱茵生命：访问]: bilibili.com/video/BV1rr4y1b7sz/
