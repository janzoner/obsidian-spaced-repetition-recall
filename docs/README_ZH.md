本插件是魔改自[obsidian-spaced-repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition) 和 [recall plugin](https://github.com/martin-jw/obsidian-recall)
就是 SR 的复习时间信息可以单独保存，不修改原笔记文件内容，以及添加其他功能。

## Features

-   [@st3v3nmw's ReadMe](https://github.com/st3v3nmw/obsidian-spaced-repetition#readme)
-   [english ReadMe](../README.md)

1. 复习时间信息可以保存在单独文件内，不修改原笔记文件内容；
2. 在复习笔记时可以显示悬浮栏（跟复习卡片时类似），方便选择记忆效果，且可显隐到下次重复的时间间隔；
3. 可以只转换复习笔记到卡片组，而不是全部库的笔记都转换;
4. 在有多个标签时，可不用选标签，直接打开笔记；
5. 算法可以切换：默认的 Anki 优化算法、Anki 算法、[Fsrs 算法](https://github.com/open-spaced-repetition/fsrs.js)；
6. 使用 Fsrs 算法时，可根据标签输出重复日志文件 `ob_revlog.csv`，以使用[optimizer](https://github.com/open-spaced-repetition/fsrs-optimizer) 优化算法参数，达到更好的复习效果；
7. 其他待发现的小改动；

**注意**
没有使用过 obsidian-spaced-repetition 插件的可以直接用，正在使用 obsidian-spaced-repetition 插件的话，建议试用前先备份 :yum:

欢迎大家试用讨论

## 欢迎加入

因我本人并不是程序员，对 typescript 编程有许多不懂的地方，目前只能做些 bug 修复、及小功能更新。而对一些好的功能建议就难以实现了，欢迎对这个插件感兴趣的朋友加入，一起维护更新这个插件。

加入方式直接提 issue 或 PR 即可。

## 适用场景

1. 间隔重复复习；
2. 渐进式总结；
3. 增量写作；

Check the [docs](https://www.stephenmwangi.com/obsidian-spaced-repetition/) for more details.

## 下载

推荐 BRAT 直接添加 github 链接更方便些

github: https://github.com/open-spaced-repetition/obsidian-spaced-repetition-recall

或：

1. 从[最新发布](https://github.com/open-spaced-repetition/obsidian-spaced-repetition-recall/releases/)中下载 main.js, manifest.json, styles.css；
2. 在 `Vault-name/.obsidian/plugins` 中新建个文件夹`obsidian-spaced-repetition-recall`, 把刚下的文件放入新建的文件夹中；
3. 重启Obsidan 开启插件，就可以使用了。

## Thanks

业余时间折腾的，如果对你有所帮助，可以请我喝瓶饮料呀~

<div class="ex-coffee-div" align = "center">
<a ><img src="https://github.com/Newdea/newdea/blob/main/.github/funding/QR_alipay.png?v=3" height=45></a>
<a ><img src="https://github.com/Newdea/newdea/blob/main/.github/funding/QR_wechat.png?v=3" height=45></a>
</div>

或者，请原插件作者(@st3v3nmw)喝杯咖啡
<a href='https://ko-fi.com/M4M44DEN6' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://cdn.ko-fi.com/cdn/kofi3.png?v=2' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>

---

Thank you to everyone who has created a plugin that inspired me and I took code from.

-   first, thanks to [@st3v3nmw's obsidian-spaced-repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition) and [@martin-jw recall plugin](https://github.com/martin-jw/obsidian-recall)
-   floatbar(thanks to [@chetachi's cMenu](https://github.com/chetachiezikeuzor/cMenu-Plugin))
-   [Fsrs Algorithm](https://github.com/open-spaced-repetition/fsrs.js)
-   ReleaseNotes(thanks to [@Zsolt Viczian Excalidraw](https://zsolt.blog))
