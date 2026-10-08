# Installing RhinE — An Audio Archive

[中文安装指南](安装指南.md) · Everything else (features, controls, how it works): [README.md](README.md)

There are two ways to install it. Pick **A** if you are new to foobar2000, or if you want RhinE in a folder of its own.
Pick **B** if you already use foobar2000 and want the theme in that copy. Both need **Windows 10 or 11, 64-bit**.

## A. Portable bundle (easiest)

A complete foobar2000 with the theme, in one folder. It does not touch an installed foobar2000.

1. Download **`RhinE-1.3.0-portable.zip`** from [Releases](https://github.com/ericzhang12111-cell/RhinE/releases).
2. Unzip it: right-click › *Extract All*.
3. Open the extracted folder and double-click **`Setup 一键安装.cmd`**.
   If Windows asks whether to run it, choose *Run* (or *More info › Run anyway*).
4. Wait about 10 seconds. foobar2000 opens with the theme.

From then on, start it with **`RhinE (foobar2000)`** in the same folder. You can move the whole folder anywhere.

The setup needs the internet once, to download JSplitter from its GitHub page. If that fails, it shows the link: download
the file in your browser, put it in the `setup` folder and double-click `Setup 一键安装.cmd` again.

## B. Into your own foobar2000

You need foobar2000 v2, **64-bit** ([foobar2000.org](https://www.foobar2000.org/download)). Columns UI and JSplitter are
installed for you if they are missing.

1. Download **`audio-archive-1.3.0.zip`** from [Releases](https://github.com/ericzhang12111-cell/RhinE/releases).
2. Unzip it: right-click › *Extract All*.
3. Open the extracted folder and double-click **`install.cmd`**.
4. Answer the questions with `Y` (or just press Enter). The installer:
   - finds foobar2000 (if you have several, it asks which one; if it finds none, it asks for the folder);
   - offers to close foobar2000 if it is running;
   - offers to download Columns UI and JSplitter if they are missing.
5. foobar2000 opens with the theme.

## Add your music

Click **`+ ADD MUSIC FOLDER`** in the Archive view (or `PREFERENCES` › *Media Library*), click *+ Folder* and choose your
music folder. The albums appear in the Archive as the library is read.

## Update

**From 1.3 on, in one click:** when a new version is out, an orange **`UPDATE`** chip appears in the bottom bar. Click it,
then *Update to … now*. foobar2000 closes, the new version is put in, and foobar2000 starts again with your settings
(skin, colours, sizes, language, …). `MENU › Audio Archive › Check for updates…` checks at once.

**From 1.2 or older, once by hand:** download the new version and do the same steps as above. You do not need to remove
the old version first. With the portable bundle, unzip the new bundle and copy its `audio-archive-…` folder into your
RhinE folder, then double-click `Setup 一键安装.cmd` there.

Coming from another foobar2000 theme? Nothing to remove first: the installer backs up your current setup, and
uninstalling brings it back.

## Uninstall

- **Portable bundle:** delete its folder.
- **Your own foobar2000:** double-click **`uninstall.cmd`** in the theme folder. It puts back the setup you had before
  RhinE and removes the theme and its fonts.

## If something goes wrong

- **Black window, or one empty panel:** foobar2000 must be the 64-bit version. Run `install.cmd` again.
- **"Windows protected your PC":** click *More info › Run anyway*. The scripts are plain text; you can open them in
  Notepad to read them first.
- **The installer cannot download a component:** open the link it shows in your browser, put the downloaded file next to
  `install.cmd` and run it again.
- **The light / dark button does nothing:** the theme follows Columns UI's mode. RhinE 1.3 then shows where to switch it
  (`MENU` › *View › Mode*).

More answers: [README.md › Troubleshooting](README.md#troubleshooting).
