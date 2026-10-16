# C语言指针：故事与事实核验

访问与阅读日期：2026-10-15。影片采用原创教学游戏，不声称取自真实事故。

## 实际检索和阅读

1. 通俗解释：Google与Bing的两类查询（pointer memory explained；function increment variable）已实际请求，但Google仅跳转页、Bing内容与查询不相关，未采用。DuckDuckGo返回人机验证，未采用。请求记录保存在fetch-log*.json。
2. 改用Stack Exchange公开API实际搜索“C pointer address value difference”与“C function increment variable pointer value”。已读前三条问题全文，结果和URL保存于stackexchange-explanation.json及stackexchange-story.json。它们用于发现初学者困惑，不是语言规则依据。
3. [CS50x 2025 Lecture 4 Notes](https://cs50.harvard.edu/x/2025/notes/4/)：实际读取Memory、Pointers、Swapping章节以及Binky文字提及。开场从像素与内存块进入；用swap失败揭示副本。本片改写为同一块游戏计分板的7→8，不照搬交换故事或视频。只读网页，未观看Binky视频。
4. [cppreference：C pointer declaration](https://en.cppreference.com/w/c/language/pointer.html)：实际读取Pointers to objects、数组到首元素指针转换、Null pointers与类型/别名相关说明。采用对象、地址、指针对象三者区分。
5. [N1570 C committee draft](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf)：实际下载完整PDF，读取§6.2.4对象生存期、§6.3.2.3空指针、§6.5.2.1数组下标、§6.5.2.2函数调用、§6.5.3.2取址与间接访问、§6.5.6指针算术。完整页及转录文本保留，片尾使用PDF第106页（印刷88页）。
6. [Stack Overflow问题27609559](https://stackoverflow.com/questions/27609559/checking-pointer-address-and-value-from-a-function)：实际读取问题及两条回答，确认常见混淆是“参数本身的位置”和“参数保存的地址”。原问题用%i打印指针不正确，本片证据代码不照抄，统一%p与(void*)转换。
7. [Stack Overflow问题77062666](https://stackoverflow.com/questions/77062666/c-lexical-analyzer-bug-pointer-value-reset)：实际读取提问，观察*p++和(*p)++混淆。本片仅采用带括号的(*p)++，不在五分钟里插入运算符优先级支线。

## 刻意修正的简化

- CS50网页把传指针通俗称为“passed by reference”。本片按N1570 §6.5.2.2 p4和脚注93写成：C全部按值传参，地址值也被复制；副本仍指向同一对象。
- 指针不是永远指向有效对象的普通整数。教学门牌是视觉示意，真实运行地址另保存在证据文件；影片明确每次运行可能不同。
- int在本次MSVC x64运行中为4字节，不是语言保证。指针+1按数组元素步进；从最后元素到one-past合法，但不能解引用one-past。
- 不实际执行空指针、悬空指针或越界解引用，不利用一次“刚好没崩溃”演示有效性。无效访问会引发未定义行为，不保证报错。
- 内存格为对象和字节关系的示意，不声称编译优化后每个源代码变量一定占据独立可见物理格。

## 实测证据

运行python scripts/verify_c_pointers.py。MSVC C17，/W4 /WX /O2；编译返回0，全部断言通过。源程序、编译日志、单次运行输出和SHA-256保存在scripts/verify_c_pointers.c和research/c-proof/。

结果：值传参加一后副本8、原件7；*p=8使原件8；p重定向bonus后只把bonus20改21、score仍8；addOne(&score)使score7→8；sizeof(int)=4、sizeof(int*)=8；数组元素地址本次依次相差4，p+1读取8；one-past距离3且从不解引用。

## 叙事因果链

游戏加分没成功 → 函数改了副本 → 用格子区分值与地址 → 指针存地址 → 解引用访问同一对象 → 函数复制地址后可改原分数 → 多人分数引出数组步长 → 访问路径必须有效 → 回到8分结果。

34句src/story.json中的spokenText为配音冻结输入；text显示p，读音以中文皮辅助。字幕按实际音频窗口另行分段。无新增malloc、二级指针等旁枝。
