# Audio Archive — a foobar2000 theme

**English** · [中文](#中文)

An archive terminal for listening: Swiss typography, a monochrome palette with one accent colour, and a sci-fi layer —
your albums as rendered specimen cases on shelves, a Möbius signal ring that pulses with the music, synced lyrics
(fetched online when your files have none), ten case skins and five colour schemes in light and dark. Windows,
foobar2000 v2 with Columns UI and JSplitter.

![Archive view](theme/screenshots/v1/archive.jpg)

**Download** the zip from [Releases](../../releases), unzip it and run `install.ps1`. Requirements, install, use
and screenshots: [theme/README.md](theme/README.md).

MIT licence ([LICENSE](LICENSE)); the Geist Mono fonts are under the SIL Open Font License.

---

## 中文

一个为聆听而设计的档案终端：瑞士风格排版、只有一种强调色的单色调色板，再加一层科幻感——你的专辑化作渲染出的标本盒陈列在
货架上，莫比乌斯信号环随音乐脉动，同步歌词（本地没有时自动在线获取），十种外壳皮肤和五套配色，每套都有浅色与深色。
适用于 Windows 上的 foobar2000 v2，基于 Columns UI 和 JSplitter。

五个视图：**档案**（每张专辑——或每首曲目——都是货架上的一个标本盒，也可切换为封面网格）、**播放列表**（播放列表管理器、
曲目导轨、两种预设的原生播放列表、带播放队列的资料卡）、**歌词**（同步歌词，来自本地文件或 LRCLIB 在线获取）、
**信号**（渲染的 ∞ 信号环、频谱和整首曲目的波形，或经典播放器界面）以及**风格**（十种外壳皮肤和五套配色）。
另有预渲染的开场动画、扫描式切换转场、颗粒质感和"减少动态"选项。

截图见 [theme/README.md](theme/README.md#screenshots)。本主题以 MIT 协议发布（[LICENSE](LICENSE)），Geist Mono 字体
采用 SIL 开放字体协议。

### 下载 / 安装 / 使用指南

#### 1. 准备工作

| 需要 | 版本 | 下载 |
|---|---|---|
| foobar2000 | v2，**64 位**（x64） | [foobar2000.org](https://www.foobar2000.org/download) |
| Columns UI | 3.7 或更高 | [GitHub Releases](https://github.com/reupen/columns_ui/releases) |
| JSplitter | **3.9.4 x64** | [GitHub Releases](https://github.com/dima-lur/jsplitter/releases) |

> **注意 JSplitter 版本：** 请使用 3.9.4。JSplitter 4.3.3 无法读取本主题布局中的面板设置，会出现**黑屏**，控制台显示
> *Error setting panel config*。foobar2000 也请使用 64 位版本，旧的 32 位（x86）版本同样会黑屏。

安装组件：在 foobar2000 中打开 *Preferences › Components*（首选项 › 组件），点 *Install…*（安装），选择下载的组件文件，
然后按提示重启 foobar2000。两个组件都装好后再继续。

#### 2. 下载主题

1. 打开本仓库的 [Releases](../../releases) 页面，下载 `audio-archive-1.0.0.zip`。
2. （可选）校验文件：在下载文件夹打开 PowerShell，运行
   `Get-FileHash .\audio-archive-1.0.0.zip -Algorithm SHA256`，
   结果应与同一页面的 `audio-archive-1.0.0.zip.sha256` 一致。
3. 右键 zip › *全部解压缩*，得到文件夹 `audio-archive-1.0.0`。

#### 3. 安装

1. **先关闭 foobar2000。**
2. 打开解压出的 `audio-archive-1.0.0` 文件夹，在空白处右键 › *在终端中打开*（Windows 10：按住 Shift 再右键 ›
   *在此处打开 PowerShell 窗口*）。
3. 运行下面的命令，`-Foobar` 后面填 **`foobar2000.exe` 所在的文件夹**：

   ```powershell
   powershell -ExecutionPolicy Bypass -File install.ps1 -Foobar "C:\Program Files\foobar2000"
   ```

   便携版直接填便携版的文件夹即可，脚本会自动识别。

安装脚本会依次：

1. 检查 foobar2000 是否为 v2、是否已关闭、是否装好 Columns UI 和 JSplitter（任何一项不满足都不会做任何改动）；
2. 把当前配置备份到 `<profile>\audio-archive-backup\<日期时间>\`；
3. 把主题复制到 `<profile>\themes\audio-archive\`；
4. 为当前 Windows 用户安装 Geist Mono 字体（无需管理员权限；加 `-NoFonts` 跳过）；
5. 把界面切换为 Columns UI；
6. 启动 foobar2000 并导入主题布局（加 `-NoStart` 跳过）。

`<profile>` 是配置文件夹：标准安装为 `%APPDATA%\foobar2000-v2`，便携版为 `<foobar2000 文件夹>\profile`。

**最后一步：添加媒体库。** 在 *Preferences › Media Library*（首选项 › 媒体库）中添加你的音乐文件夹。档案视图展示的是
媒体库里的专辑；没有媒体库时，它会改为显示所有播放列表的内容。第一次打开大型曲库时，主题会在后台提取一次所有封面
（约 600 张专辑需 30 秒）。

**手动安装（不用脚本）：** 把 `js`、`tokens`、`columns`、`assets` 复制到 `<profile>\themes\audio-archive\`，安装
`assets\fonts` 里的字体，在 *Preferences › Display › User interface module* 中切换到 Columns UI，然后
*Preferences › Display › Columns UI › Import configuration…*，选择 `columns\audio-archive.fcl`。

#### 4. 使用

| 操作 | 鼠标 | 键盘 |
|---|---|---|
| 切换视图：档案 / 播放列表 / 歌词 / 信号 / 风格 | 点顶栏的 `01` – `05` | `1` – `5` |
| 浅色 / 深色 | 底栏右侧 `LIGHT` / `DARK` | `T` |
| 播放 / 暂停、上一首、下一首、停止 | 底栏按钮 | `Space` |
| 搜索 | 点 `SEARCH ARCHIVE` 后输入（档案视图中直接筛选专辑） | `/` 后输入，`Esc` 退出 |
| 档案：选专辑 / 换货架 | 鼠标悬停并点击标本盒；滚轮 | `↑` `↓` 专辑，`←` `→` 货架 |
| 档案：查看专辑（标本盒抬起并翻转） | 点击已选中的标本盒 | `Enter`，`Esc` 返回 |
| 档案：从某首曲目开始播放 | 点击右侧曲目列表中的曲目 | — |
| 档案：分组 / 排序 / 显示曲目 / 网格 | 顶部的 `GROUP`、`SORT`、`SHOW`、`LAYOUT` | `G` 切换网格 |
| 信号：3D 环 / 2D 环 / 经典界面 | 右上角 `MODEL 3D / 2D / CLASSIC` | `R` |
| 外壳皮肤、配色方案 | `05 STYLE` 视图中点击卡片 | `5` |
| 开场动画 | `MENU › Audio Archive › Play intro film`，或风格视图的 `PLAY INTRO` | `B` |
| 随机播放整个曲库 | `SHUFFLE ALL` | `S` |
| foobar2000 主菜单 | 右上角 `MENU` | — |

键盘操作需要主题的某个面板获得焦点（先在面板空白处点一下）。主题默认为深色、ARCHIVE 配色、WHITE 外壳。
`MENU › Audio Archive` 里还有：减少动态（*Reduce motion*）、颗粒质感（*Grain texture*）、启动时播放开场动画
（*Intro film at start*）、在线获取歌词（*Fetch lyrics online*）。

**歌词：** 主题读取与曲目同名的 `.lrc` 文件，或带时间戳的 `LYRICS` / `SYNCEDLYRICS` 标签；时间戳相同的两行会显示为
原文和译文。曲目没有歌词时，主题会到 [LRCLIB](https://lrclib.net)（开放的同步歌词库）查找：会把曲目的**艺术家、
标题、专辑和时长**发送给 lrclib.net，结果保存在 `<profile>\audio-archive-cache\lyrics\`，不会写入音乐文件夹或标签；
没找到的曲目一周内不再重复查询。LRCLIB 对部分语言收录较少；如果无法访问或不需要，可在菜单中关闭
*Fetch lyrics online*。也可以用 [OpenLyrics](https://github.com/jacquesh/foo_openlyrics) 组件保存 `.lrc` 文件或标签，
主题会直接读取。中文等 CJK 文字使用系统的中文界面字体显示（Geist Mono 不含中文）。

#### 5. 卸载

先关闭 foobar2000，再在主题文件夹中运行：

```powershell
powershell -ExecutionPolicy Bypass -File uninstall.ps1 -Foobar "C:\Program Files\foobar2000"
```

卸载会恢复首次安装主题之前的配置（之后改过的设置也会还原；当前配置会先存入备份文件夹），并删除主题文件夹和字体。
加 `-KeepConfig` 只删除文件，加 `-KeepFonts` 保留 Geist Mono 字体。

#### 6. 常见问题

- **黑屏，或只有一个空面板：** 检查 JSplitter 是否为 3.9.4 x64，foobar2000 是否为 64 位。换好后重新运行一次
  `install.ps1`，让它重新导入布局。
- **PowerShell 提示脚本被阻止运行：** 请使用上面完整的命令（带 `-ExecutionPolicy Bypass`）；如仍被拦截，先运行
  `Get-ChildItem -Recurse | Unblock-File` 解除下载文件的锁定。
- **档案视图是空的，或显示"所有播放列表"：** 还没有添加媒体库文件夹，见上文"添加媒体库"。
- **改了专辑封面但主题里没变：** 删除 `<profile>\audio-archive-cache\covers\` 后重启，封面会重新生成。
- **空闲时 foobar2000 占用约 5–8% 的单核 CPU：** 这是 JSplitter 每个面板约 1% 的固有开销，主题本身静止时不重绘。
- **动画不够流畅：** 可在 *Preferences › Advanced* 中打开 JSplitter 的 *Use high-resolution timers*（可选）。
