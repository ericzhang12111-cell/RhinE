# Changelog · 更新日志

Newest version first. Download any version from [Releases](https://github.com/ericzhang12111-cell/RhinE/releases).
最新版本在最上面；各版本可在 Releases 页面下载。

## Unreleased

**Added · 新增**
- Archive: folders as cases. `SHOW [ALBUMS | TRACKS | FOLDERS]` › `FOLDERS` makes every folder one case, whatever the
  album tags in it, so a playlist downloaded into one folder is one case instead of dozens of one-track albums. A case
  holds the tracks right in its folder (a `CD1` / `Disc 2` folder counts as its parent); a subfolder is a case of its
  own, so no track is in two, and the tracks left loose beside subfolders make a case of their own, `<folder> · LOOSE
  TRACKS`. `GROUP` › `FOLDER` puts every case on the shelf of the folder it lies in, named by its path from the media
  library folder (`Music › Anime`); with `TRACKS` each folder is a shelf. Folders can have the heart too. 档案：按文件夹
  显示。`显示 [专辑 | 曲目 | 文件夹]` › `文件夹` 让每个文件夹成为一项，不论其中的专辑标签，所以下载到同一个文件夹里的歌单是一项，
  而不是几十张单曲专辑。一项包含直接位于该文件夹中的曲目（`CD1` / `Disc 2` 文件夹算作其上级文件夹）；子文件夹单独成为一项，
  所以每首曲目只属于一项；与子文件夹并列的零散曲目也单独成为一项：`<文件夹> · 散曲`。`分组` › `文件夹` 把每一项放到它所在
  文件夹的货架上，货架名是从媒体库文件夹起的路径（`Music › Anime`）；显示曲目时，每个文件夹是一个货架。文件夹也可以收藏。
- Borderless full screen: `WINDOW` › `BORDERLESS` under `DISPLAY` in `05 STYLE`, `MENU › Audio Archive › Borderless
  full screen`, or `F11`. The window loses its title bar and frame and covers the whole monitor it is on, the taskbar
  too; switched off, it goes back exactly where it was. It stays on at the next start until you switch it off.
  无边框全屏：`05 外观` › `显示` 下的 `窗口` › `无边框`，`菜单 › Audio Archive › 无边框全屏`，或按 `F11`。窗口去掉标题栏和边框，
  铺满所在的整块屏幕（包括任务栏）；关闭后回到原来的位置和大小。下次启动时仍保持无边框，直到你关闭它。
- Light / dark can follow Windows: `MODE` › `SYSTEM` in `05 STYLE`, or `MENU › Audio Archive › Follow Windows light /
  dark`. Each switch of Windows' setting then changes the theme with its usual sweep; `T` or `LIGHT` / `DARK` set a
  fixed mode again (#46). 浅色 / 深色可以跟随系统：`05 外观` 中的 `模式` › `跟随系统`，或 `菜单 › Audio Archive › 深浅色跟随
  系统`。之后 Windows 每次切换浅色 / 深色，主题都会以平常的过渡动画跟着切换；按 `T` 或选 `浅色` / `深色` 会重新固定模式（#46）。
- Factory title tags: 13 tags rendered in real materials, each in its own colours (kraft and manila card, enamelled
  steel, anodised aluminium, leather, carbon fibre, bamboo, brass), in all four shapes. Pick `FACTORY` in `05 STYLE` ›
  `TITLE TAG` and choose one on the right; the ones suggested for your colour scheme and case are marked. The song's
  title is printed the way the rest of the tag is: etched, foil-stamped, pressed or printed. The other finishes are as
  before. 出厂标题标签：13 款以真实材质渲染、各有固定颜色的标签（牛皮纸卡、马尼拉纸卡、搪瓷钢板、阳极氧化铝、皮革、碳纤维、竹、
  黄铜），四种形状都有。在 `05 外观` › `标题标签` 中选择 `出厂`，再在右侧挑选；推荐搭配当前配色方案和外壳的会带标记。歌名的印法与
  标签其余部分一致：蚀刻、烫金、压印或印刷。其他材质不变。

**Changed · 改进**
- The installer installs JSplitter 4.3.3 when it is missing (3.9.4 before). The guide no longer suggests switching to
  3.9.4 for a black window: *Error setting panel config* means the layout did not load, so check that foobar2000 and
  JSplitter are both x64 and run `install.cmd` again (#47, thanks to @dima-lur). 缺少 JSplitter 时，安装程序改为安装
  4.3.3（之前为 3.9.4）。使用说明不再建议黑屏时换用 3.9.4：*Error setting panel config* 表示布局没有加载成功，请确认
  foobar2000 和 JSplitter 都是 x64，再运行一次 `install.cmd`（#47，感谢 @dima-lur）。

**Fixed · 修复**
- Cover grid: with `GROUP` › `FAV`, taking the heart from the last favourite could stop the Archive with a script error
  (`g is undefined`). 封面网格：按 `收藏` 分组时，取消最后一个收藏可能导致档案出现脚本错误（`g is undefined`）。
- The intro film no longer plays again when foobar2000 builds its panels anew while it runs (reported when Windows
  switches light / dark, #46). foobar2000 运行中重建面板时（有用户在 Windows 切换浅色 / 深色时遇到），不再重新播放开场动画
  （#46）。

## 1.10.2 — 2026-10-26

**Added · 新增**
- Archive: the frosted glass on the cases that are not selected (their covers blurred, as since 1.0) can be switched
  off, so every cover shows sharp: right-click the Archive › `Frosted glass on the cases`, or `GLASS` under `DISPLAY` ›
  `ARCHIVE` in `05 STYLE`. 档案：未选中外壳的磨砂玻璃（自 1.0 起封面会被模糊）现在可以关闭，让所有封面都清晰显示：档案右键 ›
  `外壳磨砂玻璃`，或 `05 外观` › `显示` › `档案` 下的 `玻璃`。

**Fixed · 修复**
- The header no longer overlaps itself in a narrow window: the navigation drops its numbers first, then the clock and
  the wordmark's text give way, and at last the navigation shows only the numbers. 窄窗口下顶栏不再重叠：导航先去掉编号，
  再依次隐藏时钟与标志文字，最后只显示编号。

## 1.10.1 — 2026-10-26

**Fixed · 修复**
- Artist files: after the interface language was changed, the biography could stay in the old language. It now comes
  in the new one (the file says it is looking the artist up meanwhile), and an `artist.txt` you edit is read again after
  a restart. 艺术家档案：切换界面语言后，简介可能一直停留在原来的语言；现在会改用新语言（获取期间显示正在查询），修改过的
  `artist.txt` 在重启后也会重新读取。

## 1.10.0 — 2026-10-26

**Added · 新增**
- Artist files: the album file's third page, `ARTIST`, shows who made the album: their picture, profile, biography,
  genres and related artists (those in your library marked), with `PLAY ARTIST`. `OPEN FILE` (`I`) opens the artist's
  file over the shelves, in a room of cases lit from below, and its `MAP` places the related artists around them. From
  MusicBrainz, Wikipedia (in the interface language when there is an article), Deezer, NetEase, Wikimedia Commons and
  ListenBrainz, kept for 30 days; `artist.txt` / `artist.jpg` beside an album replace the text or the picture (#25, thanks to
  @RusticBewildered for the idea). 艺术家档案：专辑档案的第三页 `艺术家` 显示专辑的作者：照片、资料、简介、流派和相关艺术家（库中有的会标出），
  并可 `播放艺术家`。`打开档案`（`I`）在货架上方打开艺术家档案，背景是自下而上照亮的档案室，其中的 `关系图` 把相关艺术家排在周围。
  资料来自 MusicBrainz、维基百科（有条目时使用界面语言）、Deezer、网易云音乐、维基共享资源和 ListenBrainz，保存 30 天；专辑旁的 `artist.txt` /
  `artist.jpg` 会代替简介或照片（#25，感谢 @RusticBewildered 的建议）。
- Wallpapers that come with the theme: `TOPOGRAPHY`, `STREAMS`, `PRINT` and `SURVEY`, each in a dark and a light
  version that follows the mode, kept quiet in the middle where the text sits. Pick one under `COMES WITH THE THEME` in
  `05 STYLE` › `DISPLAY` › `WALLPAPER ›`; a picture of your own works as before. 主题自带壁纸：`地形`、`流线`、`印刷` 和
  `测绘`，各有深色与浅色版本，随明暗模式切换，中间留白给文字。在 `05 外观` › `显示` › `壁纸 ›` 的 `主题自带` 中选择；自己的图片照常可用。
- The artist's albums and tracks in your library, to play: `IN YOUR LIBRARY` on the `ARTIST` page shows their covers
  (a click plays the album), and the artist file has a `LIBRARY` tab with every album and track (a click on a track
  plays the artist from there); `IN LIB` opens it. 库中作品：`艺术家` 页的 `库中作品` 列出该艺术家专辑的封面（点击即播放该专辑），
  艺术家档案新增 `库内作品` 标签页，列出全部专辑和曲目（点击曲目即从该处播放该艺术家）；点击 `IN LIB` 也可打开。
- Side columns you can widen or narrow: drag the edge of the Playlists view's list and card, the Lyrics view's left
  column and card, or the Archive's album file; a double-click on the edge puts it back. 侧栏宽度可调：拖动播放列表视图的
  列表与资料卡、歌词视图的左栏与资料卡、档案的专辑档案的边缘即可；双击边缘恢复原宽度。
- The text size as a number: `SIZE` in `05 STYLE` takes any size from 8 to 15 (10 is 100 %), typed or stepped with
  − / +, the wheel or ↑ ↓. 文字大小可输入数值：`05 外观` 的 `字号` 可输入 8 到 15 之间的任意大小（10 即 100%），也可用 − / +、滚轮或
  ↑ ↓ 调整。
- Archive: a case on another shelf answers the mouse, and a click switches to its shelf with it selected (#42); an
  option shows the two shelves in front, see-through, so you can click back to them (right-click › `Show the shelves in
  front (see-through)`, off by default; #43). Thanks to @CocytusChen for both. 档案：其他货架上的外壳也会响应鼠标，点击即
  切换到该货架并选中它（#42）；新选项可让前方两层货架以半透明保留在视野中，方便点回去（右键 › `显示前方货架（半透明）`，默认关闭；#43）。
  两项均感谢 @CocytusChen。

**Changed · 改进**
- The search field works like a text box: click to place the caret, drag or Shift+click to select, double-click a
  word, `Ctrl+A` / `C` / `X` / `V` / `Z`, a right-click menu, and a × that clears it. 搜索框像普通文本框一样使用：点击定位光标，
  拖动或 Shift+点击选择，双击选词，支持 `Ctrl+A` / `C` / `X` / `V` / `Z` 和右键菜单，× 可清空。
- `05 STYLE` › `DISPLAY` in four tidy groups (TEXT, ARCHIVE, PAGE, TITLE TAG) whose rows line up; a setting that does
  not apply stays in place, dimmed. The title tag is turned off with its own `OFF` card. 外观：`05 外观` › `显示` 整理为四组
  （文字、档案、背景、标题标签），各行对齐；暂不适用的设置保留在原位并变暗。标题标签改用 `OFF` 卡片关闭。
- Archive: an open inspection follows the music. When the next album starts (with `TRACKS`, the next track) while the
  playing one is inspected, its case slides out and the new one slides in. 档案：查看中的外壳会跟随播放切换：查看正在播放的
  专辑时，下一张专辑（逐曲显示时为下一首）开始播放，外壳会滑出并换成新的。

## 1.9.1 — 2026-10-20

**Changed · 改进**
- Archive: the shelves move without jumps. A shelf stops exactly in place instead of a few pixels short, the shelves
  behind shade smoothly as they move, the selected case clears and frosts gradually, and the titles, row numbers and
  spine labels fade instead of popping (#37, thanks to @CocytusChen). 档案：货架移动不再跳动。货架准确停在位置上，不再差
  几个像素；后排货架移动时颜色平滑变化，选中的外壳逐渐变清晰或变磨砂，标题、排号和书脊标签淡入淡出，不再突然出现或消失（#37，
  感谢 @CocytusChen）。

**Fixed · 修复**
- Archive: changing the sort, the grouping or `ALBUMS` / `TRACKS` no longer makes the shelves blink for a frame (#36,
  thanks to @CocytusChen). 档案：切换排序、分组或专辑与曲目时，货架不再闪烁一帧（#36，感谢 @CocytusChen）。
- A panel that reloads (after switching the interface language, for instance) could now and then miss the current
  settings and show an empty view. 面板重新加载后（例如切换界面语言后），偶尔会收不到当前设置而显示空白视图。

## 1.9.0 — 2026-10-19

**Added · 新增**
- Favourites: a heart on tracks and albums, apart from the rating. Give it on the signal profile card, beside
  `OPEN ALBUM`, on the album file's `TRACKS` page, from the Archive's menu, or with `H` for the playing track. `GROUP` ›
  `FAV` puts the favourites first, and `Open favourites playlist` collects them in *Archive · Favourites*. A track's
  heart is kept in JSplitter's database (no files written) or, if you choose, a `LOVED` tag (#17). 收藏：给曲目和专辑加上
  红心，与评分互不影响。可在信号资料卡、`打开专辑` 旁、专辑档案的全部曲目页、档案右键菜单中收藏，或按 `H` 收藏正在播放的曲目。
  分组中的 `收藏` 把收藏排在最前，`打开收藏播放列表` 把它们汇集到 *Archive · Favourites*。曲目的收藏保存在 JSplitter
  数据库（不写入文件），也可选择写入 `LOVED` 标签（#17）。
- Instrumentals: right-click the Archive › `Play albums without instrumentals` leaves out Instrumental, Off Vocal,
  Inst., Karaoke, `カラオケ`, `伴奏` … when an album plays (a track you click still plays), and the playlist manager's
  `Remove instrumentals (N)` takes them out of a playlist, undoable (#18). 伴奏：档案右键 › `播放专辑时跳过伴奏`，播放专辑时
  跳过 Instrumental、Off Vocal、Inst.、Karaoke、カラオケ、伴奏等版本（直接点击的曲目照常播放）；播放列表管理器中的
  `移除伴奏（N）` 可一键移除，并可撤销（#18）。
- Romanized lyrics for Japanese and Korean: a line in Latin letters under the sung line (`MENU › Translate lyrics`, or
  the Lyrics view's state chip). Korean is converted by the theme; Japanese romaji come from NetEase (#20). 日语和韩语的
  罗马音歌词：在正在唱的那一行下方显示拉丁字母（菜单的歌词翻译中，或歌词视图的状态标签）。韩语由主题自己转换，日语罗马音
  来自网易云（#20）。
- Edit lyrics: the track's own `.lrc` opens in Notepad (made from the shown lyrics when there is none), and what you
  save shows at once: right-click the Lyrics view (#20). 编辑歌词：用记事本打开曲目自己的 `.lrc`（没有时按当前歌词生成），
  保存后立即显示：在歌词视图中右键（#20）。
- The interface in Korean, French and German (#31). 界面新增韩语、法语和德语（#31）。

**Changed · 改进**
- Archive: shelves hold 10 to 30 cases, and a large group is shared out evenly instead of leaving a few cases alone
  on a shelf (#33, thanks to @CocytusChen). 档案：每层货架放 10 到 30 个外壳，较大的分组会平均分配，不再在最后一层只剩
  几个（#33，感谢 @CocytusChen）。
- Archive: with every track shown, the tracks of one album stay together and in order when sorted (#32, thanks to
  @CocytusChen). 档案：显示全部曲目时，同一张专辑的曲目在排序后仍然连在一起并按顺序排列（#32，感谢 @CocytusChen）。
- The transport's playhead glides instead of stepping (#34, thanks to @CocytusChen). 底栏的播放头平滑移动，不再一格一格
  跳动（#34，感谢 @CocytusChen）。

**Fixed · 修复**
- A very narrow title tag (a narrow window, or while resizing) could stop the Style view with "Font failed".
  很窄的标题标签（窗口很窄或正在调整大小时）可能导致外观视图报错“Font failed”。
- After switching the interface language, the lyrics could lose their translation until the next track.
  切换界面语言后，歌词的译文可能要到下一首才会恢复。

## 1.8.0 — 2026-10-18

**Added · 新增**
- Title tag: the song's title printed on a rendered tag on the signal profile card and the album file. Four shapes,
  seven finishes (plastic, paper, brushed metal, translucent, transparent, Tide and Aurora glass), coloured by the
  scheme, the case or your own colours; the see-through finishes show the page through them (`05 STYLE` ›
  `TITLE TAG`; hover a card for a preview). 标题标签：把歌名印在渲染出的标签上，显示在信号资料卡和专辑档案中。四种形状、
  七种材质（塑料、纸、拉丝金属、半透明、透明、潮汐玻璃、极光玻璃），颜色可取自配色方案、外壳或自定义；透明类材质能透出
  后面的页面（`05 外观` › `标题标签`；鼠标悬停卡片可预览）。
- Fonts: Oxanium and Chakra Petch beside Geist Mono (`05 STYLE` › `FONT`). 字体：除 Geist Mono 外新增 Oxanium 和
  Chakra Petch（`05 外观` › `字体`）。
- Emblem: the header shows the Möbius ring or nested triangles (`05 STYLE` › `EMBLEM`). 徽记：顶部可显示莫比乌斯环或
  三角（`05 外观` › `徽记`）。
- Lyrics: a source switch under the Lyrics view's title and in the menu: AUTO, LOCAL, LRCLIB or NETEASE. LRCLIB and
  NETEASE use only that service, even when the file has lyrics of its own (#26, thanks to @RiBunsyou). 歌词：歌词视图标题
  下方和菜单中新增来源开关：自动、本地、LRCLIB 或网易云；选 LRCLIB 或网易云时只用该来源，即使文件自带歌词（#26，感谢
  @RiBunsyou）。
- Lyrics: the translation has its own setting: off, NetEase community, machine translation or automatic, in
  `MENU › Translate lyrics` or from the Lyrics view's state chip (#26). 歌词：译文来源成为独立设置：关闭、网易云社区、
  机器翻译或自动，可在菜单的歌词翻译中或点击歌词视图的状态标签选择（#26）。

**Changed · 改进**
- Sharper on high-DPI screens: the inspection frames, the array cases, the rails and the Möbius ring are rendered at
  twice the pixels; on screens scaled above 125 % the covers are 512 px and the large cover 1280 px. The download is
  about 400 MB larger. 高分屏更清晰：查看动画、阵列外壳、货架和莫比乌斯环都以两倍像素重新渲染；缩放大于 125% 的屏幕上，
  封面缩略图为 512 像素，大封面为 1280 像素。下载包因此增大约 400 MB。
- A custom case made with an earlier version is made again from the new renders at start, in its colours. 用旧版本生成的
  自定义外壳会在启动时按新的渲染图以原有配色重新生成。
- `Fetch lyrics online (LRCLIB)` is replaced by the lyrics source; your settings carry over. 原来的在线获取歌词选项由歌词
  来源取代，原有设置会自动沿用。

**Fixed · 修复**
- Archive: the album file's `+ N MORE · ALL TRACKS` showed {0} instead of the number of tracks (#29).
  档案：专辑档案底部的“还有 N 首 · 全部曲目”显示为 {0}，而不是剩余曲目数（#29）。
- Lyrics: enhanced LRC files (a time stamp on every word) showed the word stamps as text. 歌词：增强型 LRC（每个字都带时间戳）
  会把时间戳当作文字显示，现已修复。

## 1.7.2 — 2026-10-15

**Added · 新增**
- Ratings: rate tracks 1 to 5 by clicking the marks on the album file's new `TRACKS` page or on the signal profile
  card, or with `Ctrl+1` – `Ctrl+5` (`Ctrl+0` clears). They are kept in JSplitter's own database, so no file is
  written, or in foo_playcount's statistics when it is installed; right-click the Archive › `Ratings saved in` to pick
  file tags instead. 评分：在专辑档案新的 `曲目` 页或信号资料卡上点击菱形为曲目评 1 至 5 分，或按 `Ctrl+1` – `Ctrl+5`
  （`Ctrl+0` 清除）。评分默认保存在 JSplitter 自带的数据库中，不写入文件；装有 foo_playcount 时保存在其播放统计中；也可在
  右键档案 › `评分保存在` 中改为文件标签。
- Archive: the album file has a second page listing every track with its rating, so a library can be browsed and rated
  without opening a playlist; the two dots at its bottom, or `L`, turn the page. 档案：专辑档案新增第二页，列出全部曲目及其
  评分，无需打开播放列表即可浏览与评分；点击底部的两个圆点或按 `L` 翻页。
- Archive: `Shift` + wheel (or a sideways wheel) switches shelves, as `←` `→` do; in the grid it jumps a section. 档案：
  `Shift` + 滚轮（或横向滚轮）切换货架，与 `←` `→` 相同；网格中跳到相邻分区。
- A halftone of dots on the album file and the signal profile card: along the bottom, in the lower right corner or
  off, faint to strong (`05 STYLE` › `HALFTONE`, `DOTS`). 专辑档案与信号资料卡加入半调网点装饰：沿底部、在右下角或关闭，
  浓淡可调（`05 外观` › `半调网点`、`浓度`）。

**Fixed · 修复**
- Startup: with a large library of CUE albums, 1.7.1 could make foobar2000 report the Archive's script as not
  responding (#24). The CUE sheets are now read a little at a time, and each folder once. 启动：媒体库中有大量 CUE
  专辑时，1.7.1 可能让 foobar2000 提示档案脚本无响应（#24）。现在 CUE 分轨分批读取，每个文件夹只读一次。
- Archive: CUE sheets saved in a Japanese or Chinese code page (as EAC writes them) are read, so their albums show as
  their tracks too. 档案：以日文或中文编码保存的 CUE（EAC 常见）现在也能读取，这些专辑同样按分轨显示。

## 1.7.1 — 2026-10-13

**Fixed · 修复**
- Lyrics and Signal: after a song at 44.1 or 48 kHz, a high-resolution one (88.2 to 192 kHz) froze the view's animation:
  the lyrics jumped once a second instead of scrolling, and the spectrum and read-outs stood still. 歌词与信号视图：在 44.1 或
  48 kHz 的歌曲之后播放高解析度歌曲（88.2 至 192 kHz）时，视图动画会停住：歌词每秒跳一次而不是平滑滚动，频谱和读数也不再更新。
- Lyrics: a track with no artist tag gets its lyrics online too, found by its title and length. 歌词：没有艺术家标签的曲目
  现在也会在线获取歌词，按标题与时长匹配。
- Archive: an album kept as one image file with a CUE sheet (WAV, FLAC or APE plus .cue) shows as its tracks, with the
  sheet's titles, artist and year, also when foobar2000's media library leaves the .cue files out. 档案：以整轨文件加
  CUE 分轨保存的专辑（WAV、FLAC 或 APE 加 .cue）现在按 CUE 分轨显示，带有其中的标题、艺术家与年份，即使 foobar2000 媒体库没有收录
  .cue 文件。

## 1.7.0 — 2026-10-12

**Added · 新增**
- `BLACKOUT`, a black case skin: black anodised aluminium, black-on-black etching, topographic lines on the spine
  and one white light (#22). 新外壳 BLACKOUT：黑色阳极氧化铝、黑色蚀刻，侧脊上有等高线纹样，一盏白色指示灯（#22）。
- Your own case: the `CUSTOM` card under the case skins in `05 STYLE` takes a base colour and an accent from curated
  matte plastics and a pattern (stripes, blocks or an edge band), and makes the case from them (#9). 自定义外壳：在 `05 外观`
  外壳皮肤中的 CUSTOM 卡片里，从精选的哑光塑料色中选择底色与点缀色，再选花纹（斜纹、色块或边条），即可生成外壳（#9）。
- Your own colour scheme: the `CUSTOM` card in `05 STYLE` lets you pick the page, text and accent colour for light and
  for dark; every other colour follows, and the contrast of text and accent is shown (#21). 自定义配色：在 `05 外观` 的
  CUSTOM 卡片中分别为浅色、深色选择背景、文字与强调色，其余颜色自动推算，并显示文字与强调色的对比度（#21）。
- Wallpaper: a picture of your own behind the views you pick (Archive, Playlists, Lyrics, Signal), in `05 STYLE` ›
  `DISPLAY` › `WALLPAPER`. Shown clear, frosted or as a halftone dot screen, under a light, medium or strong veil of the
  page colour so the text stays readable. 壁纸：在 `05 外观` › `显示` › `壁纸` 中，用你自己的图片作为所选视图（档案、播放列表、
  歌词、信号）的背景；可选清晰、磨砂或半调网点效果，并以低、中、高三档页面色遮罩保证文字清晰。
- `MATCHA`, a colour scheme of creamy white and matcha green: cream pages in light mode, cream type on deep matcha in
  dark. 新配色 MATCHA：奶油白与抹茶绿；浅色模式为奶油白底色，深色模式为深抹茶底配奶油色文字。
- `LIVEWIRE`, a colour scheme of lime signal and steel cyan: lime pages in light mode, lime type on near-black in dark.
  新配色 LIVEWIRE：荧光黄绿与钢青；浅色模式为黄绿底色，深色模式为近黑底配黄绿文字。

## 1.6.1 — 2026-10-12

**Changed · 改进**
- Archive: choose what the case under the mouse shows, in right-click › `Case under the mouse`: an outline (as in 1.6.0),
  its title (the album's, or the song's when every track is shown) or nothing. 档案：可在右键 › `鼠标下的外壳` 中选择鼠标下
  外壳的提示方式：描边（与 1.6.0 相同）、标题（专辑名；逐曲显示时为歌曲名）或不显示。

## 1.6.0 — 2026-10-12

**Added · 新增**
- Open a track's folder: `F` (or click `FILE` on the signal profile card) opens the folder of the playing track, with
  the file selected; in the Archive, `F` or right-click › `Open containing folder` opens the selected album's.
  打开所在文件夹：按 `F`（或点击信号资料卡片上的 `文件`）打开正在播放曲目所在的文件夹并选中该文件；在档案中，按 `F` 或右键 ›
  `打开所在文件夹` 打开选中专辑的文件夹。
- Archive: hold the album index under the shelf and drag along it; the album under the mouse is named as you go and
  releasing selects it. Hovering the index names the album too (#8). 档案：在货架下方的专辑索引上按住拖动，实时显示经过的专辑名，
  松开即选中；鼠标悬停在索引上也会显示专辑名（#8）。

**Changed · 改进**
- The update check also runs while foobar2000 stays open (once a day, as at start), so the `UPDATE` chip appears without
  a restart (#14). 检查更新在 foobar2000 一直开着时也会进行（与启动时一样每天一次），无需重启即可看到 `更新` 标签（#14）。
- Archive: `←` goes to the next shelf, which stands behind on the left, and `→` back to the one in front; the arrows
  around the shelf name match (#16). 档案：`←` 切换到下一个货架（位于后方左侧），`→` 回到前一个；货架名两侧的箭头同样对应（#16）。
- Archive: the case under the mouse is outlined, and a click lands on the case you aim at. A click counts the whole
  case (its face and top edge) where it stands, so the lift under the mouse no longer moves the target (#7). 档案：鼠标下的
  外壳会显示描边，点击总能选中所指的外壳；整个外壳（正面与顶边）都可点击，并按其原位判定，鼠标悬停引起的抬升不再让目标移动（#7）。
- The intro film says `CLICK TO SKIP` (a click ends it; `MENU › Audio Archive` turns it off). 开场动画显示 `点击跳过`
  （点击即可结束；可在 `菜单 › Audio Archive` 中关闭）。
- `RANDOM PICK` stays smooth: the album panel waits until the pick lands. 随机抽取更流畅：右侧专辑信息在抽取落定后才更新。

**Fixed · 修复**
- Lyrics: a line too long for the column wraps onto a second (the current line onto up to three) instead of ending in
  `…` (#15). 歌词：过长的歌词行会换行显示（当前行最多三行），不再以 `…` 截断（#15）。

## 1.5.1 — 2026-10-11

**Fixed · 修复**
- `RANDOM PICK` across many shelves no longer draws two shelves on top of each other, and a shelf leaving towards
  you no longer vanishes on its way out: the shelves move as one row of rows (thanks to @sm-steel for the report).
  随机抽取跨越多个货架时不再出现两排货架叠在一起，朝你移出的货架也不再中途消失：所有货架作为一个整体移动（感谢 @sm-steel 的反馈）。

## 1.5.0 — 2026-10-10

**Added · 新增**
- `HEARTH`, a warm colour scheme of walnut and candlelight in light and dark, made for `REAL STYLE` (and fine with any
  floor). With `REAL STYLE` chosen, the `05 STYLE` view offers it next to the floor. 新增暖色配色 `HEARTH`（胡桃木与烛光，
  浅色与深色），为写实风格而配，也可用于其他地面；选择写实风格时，`05 外观` 视图会在地面旁提示使用。
- Ultrawide screens: when the Archive is more than twice as wide as it is tall, more shelves stand side by side to
  fill it (up to 24), each case at its usual size (thanks to @Xuduxiu, #2). 超宽屏：档案区域宽度超过高度两倍时，更多货架并排填满
  画面（最多 24 排），外壳保持原来的大小（感谢 @Xuduxiu，#2）。

**Changed · 改进**
- `PLAY ALBUM` in the Archive shows its key, `SPACE` (it plays the selected album, or pauses it while it plays).
  档案中的 `播放专辑` 按钮标出了快捷键 `空格`（播放选中的专辑，正在播放时暂停）。
- The titles on the cases' top edges and the floors' shadows cost less to draw, so a screen full of shelves stays
  smooth. 外壳顶边标题与地面阴影的绘制开销更小，满屏货架时依然流畅。

**Fixed · 修复**
- Playlists (`ALBUM` layout): clicking `NO.` puts a sorted playlist back in album order (disc and track). Until now,
  after sorting by title there was no way back. 播放列表（`专辑` 布局）：点击 `序号` 即可恢复专辑顺序（按碟号、音轨号）；此前按标题
  排序后无法恢复。

## 1.4.0 — 2026-10-09

**Added · 新增**
- A floor under the Archive array: `FLOOR › LAB DECK` in the `05 STYLE` view (or `MENU › Audio Archive › Archive
  floor`) stands the shelves on a rendered lab deck, with their shadows on it, in light and dark. `PLAIN` keeps the
  page colour. 档案阵列可选地面：在 `05 外观` 视图中选择 `地面 › 实验甲板`（或 `菜单 › Audio Archive › 档案地面`），货架立在渲染的
  实验甲板上并投下阴影，浅色与深色均可；`纯色` 保持原来的背景色。
- `FLOOR › REAL STYLE`: the Archive as one rendered scene, frosted cases in their rails on a walnut desk in warm
  light, each case shaded by its neighbours. It always uses the FROST case. 新增写实风格（`地面 › 写实风格`）：档案呈现为一个渲染场景，
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
