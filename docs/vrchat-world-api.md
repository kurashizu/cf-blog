# VRChat 世界对接文档：`/api/vrchat`

给在 VRChat 世界里落实这个功能的人（Unity / Udon 一侧）看的交接文档。读完这一份就能做完，不需要看后端代码。

**一句话**：玩家在世界里的一个输入框里（已预填一段模板）接着输入留言，点提交后，世界向 `blog.krsz.in` 发一个 GET。模板完整且留言非空 → 发布到网站留言板；留言为空或模板被改坏 → 只登记一个足迹（footprint）。

---

## 0. 先看这里：后端状态与前置条件

- 后端 `GET /api/vrchat` **已在本地实现并验证，但还没有提交、没有部署到线上**。部署之前线上不存在这个接口，世界里调用只会失败（404）。
- 部署由仓库主人负责（推送到 `main` 触发 CI）。部署后用下面这条**没有副作用**的命令确认接口已上线（普通浏览器 UA 会被拒绝，不写入任何数据）：

  ```bash
  curl -s -A "Mozilla/5.0" https://blog.krsz.in/api/vrchat
  # 期望: {"status":"rejected"}    （404 页面 = 还没部署）
  ```
- 你（世界一侧）**不要改后端**。任何需要服务端配合的改动（模板文字、填充长度、限额等），把情况报告给仓库主人。

---

## 1. 接口契约

### 1.1 请求

```
GET https://blog.krsz.in/api/vrchat?msg=<填充空格>Your message (Optional): <玩家的留言>
```

- 只能是 GET。不需要也不能带请求头、请求体、密钥。
- 输入框的**预填文本**就是模板的前半部分，玩家只在末尾接着输入：

  ```
  https://blog.krsz.in/api/vrchat?msg=                      Your message (Optional): ▌
  ```

  - `?msg=` 和 `Your message (Optional):` 之间是一串**填充空格**，用来让输入框更好看。**空格数量随意**（0 个也行），服务端不检查数量，你可以自由调整外观。
  - 标签 `Your message (Optional):` 必须**逐字符一致，区分大小写**。冒号后面建议保留一个空格，避免玩家的字紧贴冒号，不强制。
  - 客户端发出时，空格会被编码成 `%20`（这是假设，见 §5）。例如玩家输入 `hello`：

    ```
    https://blog.krsz.in/api/vrchat?msg=%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20%20Your%20message%20(Optional):%20hello
    ```

### 1.2 服务端怎么判定（逐条规则）

| 玩家输入框里的内容 | 结果 |
|---|---|
| 模板完整 + 有留言 | 发布留言 → `status: "message"` |
| 模板完整 + 留言为空 / 只有空白 | 登记足迹 → `status: "footprint"` |
| 留言里只有 HTML 标签（如 `<b></b>`，清洗后为空） | 当作空 → 登记足迹 |
| 删掉或改动了标签的任何一个字符（包括大小写、冒号、`(Optional)`） | 登记足迹 |
| 在标签**前面**多打了字 | 登记足迹 |
| 删掉或改了 `?msg=`，或整个查询串被删光 | 登记足迹 |
| 留言清洗后超过 2000 个字符 | 什么都不登记 → `status: "too-long"` |

说明：
- **留言文本不会按 `&`、`=` 拆分**，`+` 是加号不是空格，孤立的 `%` 保持原样，玩家可以随便打这些符号。
- **唯一打不出来的是 `#`**：`#` 及其后面的内容根本不会发到服务器（URL 片段），会丢失。
- HTML 标签、`javascript:`、`on…=` 会被清洗掉；首尾空白会被去掉。
- 玩家如果改动了 URL 前半部分（`https://blog.krsz.in/api/vrchat`），请求会发到别处或 404，世界端会收到 `OnStringLoadError`。提示玩家"不要改动地址部分"。

### 1.3 写入的内容

- **留言**：写入网站留言板，**立即公开显示**（没有先审后发），名字固定为 `VRChat Player`，没有邮箱。世界**不发送、也不记录玩家名字**。
- **足迹**：服务端根据这次请求的连接信息，记录粗粒度的国家、时区、Cloudflare 数据中心，浏览器族记为 `VRChat`。不含玩家名字。足迹墙上显示为「国家 + VRChat / 未知系统」。

### 1.4 响应

永远是 **HTTP 200 + JSON**（服务端自己出错时是 500），带 `Cache-Control: no-store`。世界只需要读 `status` 这一个字段：

```json
{"status":"message"}
```

| `status` | 含义 | 建议给玩家看的提示 |
|---|---|---|
| `message` | 留言已发布 | 留言成功，已显示在留言板 / Message posted to the guestbook |
| `footprint` | 足迹已登记 | 足迹已登记 / Footprint left |
| `daily` | 这个 IP 今天的 5 次用完了（留言和足迹共用） | 今天的次数用完了（每天 5 次），明天再来 / Daily limit reached (5) |
| `too-long` | 留言超过 2000 字 | 留言太长了（最多 2000 字）/ Message too long (max 2000) |
| `rate` | 请求太快（10 秒内超过 2 次） | 太快了，请稍等几秒再试 / Too fast, try again in a few seconds |
| `rejected` | UA 像普通浏览器，被拒绝 | 通用失败提示。世界里正常不会出现，出现就是 §5 第 3 条的问题 |
| `no-edge` | 足迹需要的边缘地理信息缺失 | 通用失败提示。线上正常不会出现 |
| `error`（HTTP 500） | 服务端故障 | 通用失败提示 |

另外，`OnStringLoadError`（网络失败、URL 被 VRChat 拦截、404 等）也要处理，见 §3.4。

---

## 2. 限额（按 IP）

- **每个 IP 每天最多 5 次成功登记**，**留言和足迹共用这一个计数**，可以任意混合（例如 2 条留言 + 3 个足迹）。第 6 次不管是哪种，都返回 `daily`。每天 UTC 零点重置。
- **只有真正登记成功才占额度**。被拒绝的（`rejected`、`too-long`、`rate`、`no-edge`）不占。
- **突发限制**：同一 IP 10 秒内最多 2 次请求（被拒绝的请求也算）。
- 这个计数**独立于网站本身**的留言表单和足迹按钮，互不占用。
- 同一个 IP 下的多个玩家（家庭/网吧共用出口）共享这 5 次。这是按 IP 限流的固有代价。

---

## 3. 世界端实现指引

### 3.1 需要的东西

- 一个 `VRCUrlInputField`，**预填文本 = 模板前半部分**（在编辑器里设置默认文本；Udon 里这个输入框是只读的，不能用代码改它的内容）。
- 一个提交按钮、一个状态文字。
- 一个 UdonSharp 脚本负责发请求和解析响应。

### 3.2 流程

```
玩家编辑输入框 → 点提交
  → (冷却中? 是 → 忽略)
  → 进入冷却，按钮置灰 ≥ 6 秒，状态显示 "Sending..."
  → VRCStringDownloader.LoadUrl(inputField.GetUrl(), this)
  → OnStringLoadSuccess: 解析 JSON 取 status → 显示对应提示
  → OnStringLoadError:   显示失败提示（含 Allow Untrusted URLs 的指引）
```

### 3.3 代码草图（UdonSharp）

> 仅为草图。API 名称和签名以项目当前使用的 VRChat SDK 版本为准，请自行核对。

```csharp
using UdonSharp;
using UnityEngine;
using UnityEngine.UI;
using VRC.SDK3.Data;
using VRC.SDK3.StringLoading;
using VRC.SDKBase;
using VRC.Udon.Common.Interfaces;

public class GuestbookSender : UdonSharpBehaviour
{
    public VRCUrlInputField input;   // 编辑器里预填模板前半部分
    public Button submitButton;
    public Text statusText;

    const float CooldownSeconds = 6f; // VRChat 全局 5 秒限制 + 服务端突发限制

    public void OnSubmit() // 绑定到按钮
    {
        submitButton.interactable = false;
        SendCustomEventDelayedSeconds(nameof(Unlock), CooldownSeconds);
        statusText.text = "Sending...";
        VRCStringDownloader.LoadUrl(input.GetUrl(), (IUdonEventReceiver)this);
    }

    public void Unlock() { submitButton.interactable = true; }

    public override void OnStringLoadSuccess(IVRCStringDownload result)
    {
        string status = "error";
        if (VRCJson.TryDeserializeFromJson(result.Result, out DataToken root)
            && root.TokenType == TokenType.DataDictionary
            && root.DataDictionary.TryGetValue("status", out DataToken s)
            && s.TokenType == TokenType.String)
        {
            status = s.String;
        }
        statusText.text = Describe(status);
    }

    public override void OnStringLoadError(IVRCStringDownload result)
    {
        // result.Error = 错误信息, result.ErrorCode = HTTP 状态码
        statusText.text = "Request failed (" + result.ErrorCode + "). "
            + "Enable 'Allow Untrusted URLs' in VRChat settings and try again.";
    }

    string Describe(string status)
    {
        if (status == "message")   return "Message posted to the guestbook.";
        if (status == "footprint") return "Footprint left.";
        if (status == "daily")     return "Daily limit reached (5). Come back tomorrow.";
        if (status == "too-long")  return "Message too long (max 2000 characters).";
        if (status == "rate")      return "Too fast. Try again in a few seconds.";
        return "Something went wrong. Please try again later.";
    }
}
```

### 3.4 必须处理的情况

- **Allow Untrusted URLs**：`blog.krsz.in` 不在 VRChat 的信任域名列表里（这个列表由 VRChat 固定，不能自己加）。玩家必须在 VRChat 设置里开启 **Allow Untrusted URLs**（默认关闭），否则请求直接失败并进入 `OnStringLoadError`。这会影响很多玩家，**一定要在界面上写明这个提示**，否则玩家只会觉得按钮坏了。
- **频率**：VRChat 限制整个客户端**每 5 秒只能下载一个字符串**，超出的会排队并以随机顺序下载。所以提交要有 ≥ 6 秒冷却；并且确认世界里没有别的功能同时在用字符串下载，否则会互相延迟。
- **输入框内容不会被清空**：Udon 不能改写这个输入框，发送成功后玩家上一条留言还留在框里。界面上要让玩家明白"已发送"，避免重复点提交把同一条留言发好几遍（每次都会占一次每日额度）。
- **不要在进入世界时自动发请求**，必须由玩家主动点按钮。
- **界面文案要写明**：「留空提交 = 只留下足迹」，以及留言会**公开**显示在网站留言板上。
- **隐私说明（建议在按钮旁放）**：足迹只记录由连接推出的国家、时区和数据中心，不记录名字；留言是公开的，署名为 `VRChat Player`。另外请知悉：服务端的访问日志会保留请求元数据（包含 IP）30 天后自动清理。具体措辞由仓库主人决定。

---

## 4. VRChat 平台限制

**已在 VRChat 官方文档里查到：**
- `VRCUrl` 只能在编辑器里构造；运行时能得到的唯一来源是 `VRCUrlInputField`，由玩家输入，Udon 只读。所以世界无法在代码里拼接 URL，这也是整个模板方案的来由。
- 字符串下载每 5 秒一次，超出排队随机顺序。
- 不在信任列表的域名需要玩家开启 Allow Untrusted URLs，对输入框里玩家输入的 URL 同样适用。
- `OnStringLoadError` 能拿到错误信息和 HTTP 状态码。

**文档里没有明确写、目前是假设的（见 §5，请最先验证）：**
- `LoadUrl` 是不带请求头、不带请求体的普通 GET。
- 请求由**玩家的客户端**发出（这决定足迹的国家是不是玩家本人的）。
- 输入框的默认文本能预填，且玩家输入会接在后面。
- URL 里带空格，VRChat 会接受。
- 空格被编码成 `%20`（而不是 `+`）。
- VRChat 客户端的 User-Agent 不以 `Mozilla/` 开头。

---

## 5. 请最先验证的 5 个假设

在打磨界面之前，先用一个最简陋的版本（一个输入框 + 一个按钮）在真实的 VRChat 里验证这些。任何一条不成立都要报告给仓库主人，因为它们会让整个功能静默失效。

| # | 假设 | 怎么验证 | 不成立时的现象 |
|---|---|---|---|
| 1 | 输入框默认文本可预填，玩家输入接在后面 | 上传一个私有测试世界，进去看输入框 | 输入框是空的 → 需要换方案，报告主人 |
| 2 | VRChat 接受带空格的 URL | 点提交，看是不是进 `OnStringLoadError`（且已确认开了 Allow Untrusted URLs） | 请求总失败 → 填充不能用空格，需要主人改服务端 |
| 3 | 客户端 UA 不以 `Mozilla/` 开头 | 发一次请求，看响应是不是 `rejected` | 每次都是 `rejected` → 告诉主人，服务端的过滤规则要改 |
| 4 | 请求来自玩家客户端 | 发一个足迹，主人查日志里的 `country` 是不是你真实所在的国家 | 国家总是同一个（比如都是美国）→ 说明是 VRChat 服务器代发，足迹的国家没意义 |
| 5 | 空格编码成 `%20` | 带留言提交一次，看网站留言板上有没有出现这条留言 | 只登记成了足迹、留言没出现 → 空格可能被编成了别的形式，告诉主人 |

主人可以用下面的命令查看线上日志（验证第 3、4、5 条需要）。日志里**不记录查询串**，所以留言内容和玩家输入不会出现在这里，只有走了哪个分支：

```bash
npx wrangler d1 execute cf-blog-db --remote --command \
  "SELECT id, ts, outcome, http_status, country, user_agent, metadata FROM api_access_log WHERE route = '/api/vrchat' ORDER BY id DESC LIMIT 20"
```

`metadata` 字段的含义：

| `metadata` | 含义 |
|---|---|
| `{"mode":"message","content_len":N}` | 留言已发布，长度 N |
| `{"mode":"footprint","fallback":"blank","country":"JP"}` | 足迹；`fallback` 说明为什么没成为留言：`blank` 玩家留空 / `template` 模板被改坏或客户端编码不符 / `no-query` 没有 `?msg=` |
| `{"rejected":"browser-ua"}` / `{"rejected":"too-long"}` | 被拒绝的原因 |
| `{"limit":"burst"}` / `{"limit":"daily"}` | 触发的限流 |

第 5 条的典型特征：玩家明明打了留言，日志里却是 `"fallback":"template"`。

---

## 6. 测试

### 6.1 用 curl 直接测接口

注意：**这会写入真实数据**（留言立即出现在线上留言板），并占用你这个 IP 今天的 5 次额度。测试留言请带明显的标记，测完让主人到后台 `/admin/guestbook` 删除；足迹没有后台删除入口。每次调用之间**至少间隔 6 秒**。

```bash
B=https://blog.krsz.in/api/vrchat
PAD="                      "
enc() { python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1], safe="():"))' "$1"; }
send() { curl -s -A "UnityPlayer/test" "$B?msg=$(enc "${PAD}Your message (Optional): $1")"; echo; }

send "TEST please delete"   # {"status":"message"}
send ""                     # {"status":"footprint"}
```

### 6.2 预期结果

| 输入 | 预期 `status` | 占额度 |
|---|---|---|
| 模板完整 + `hello` | `message` | 是 |
| 模板完整 + 空 | `footprint` | 是 |
| 标签少了冒号 + 有留言 | `footprint` | 是 |
| 标签被删光 + 有留言 | `footprint` | 是 |
| 没有查询串 | `footprint` | 是 |
| 留言 2001 字 | `too-long` | 否 |
| 普通浏览器 UA | `rejected` | 否 |
| 同一 IP 当天第 6 次成功登记（任意类型） | `daily` | — |
| 10 秒内第 3 次请求 | `rate` | 否 |

### 6.3 在世界里怎么确认效果

- 留言：登记成功后出现在 `https://blog.krsz.in` 和 `https://krsz.in/guestbook` 的留言板里，署名 `VRChat Player`。
- 足迹：出现在 `https://krsz.in/guestbook` 的足迹墙上。足迹墙的读取接口有 30 秒的浏览器缓存，刷新后可能要稍等。

---

## 7. 不要做的事

- 不要用 POST，不要试图加请求头或请求体：Udon 没有提供这些能力。
- 不要在世界里放任何密钥或 token：世界资源可以被解包，等于公开。
- 不要往请求里塞玩家名字或其他身份信息：这个渠道**设计上就不记录玩家名字**。
- 不要改动标签 `Your message (Optional):` 的任何字符，也不要改 `msg` 这个参数名。如果确实要改（比如换成中文标签），必须和仓库主人一起改，服务端的 `TEMPLATE_LABEL`（`lib/vrchat.ts`）要同步修改，否则所有留言都会静默变成足迹。
- 不要在进入世界或其他非玩家操作时自动发请求。
- 不要短于 6 秒连续发送。
- 不要依赖 HTTP 状态码区分正常结果：所有正常结果都是 200，靠 `status` 字段判断。

---

## 8. 已知取舍（主人已确认，仅供知悉）

- 足迹和留言共用每日 5 次，所以同一个 IP 在一天内最多能往足迹墙上放 5 个 VRChat 足迹，国家统计会被同一个人多次计入。网站按钮那条路径仍然是每天 1 个。
- 留言没有先审后发，也没有密钥，防滥用靠每 IP 每天 5 次加 UA 过滤。UA 过滤只是软过滤，UA 可以伪造。
- 写入失败时，本次请求已经占用的额度不会退还（和网站现有的接口行为一致）。

---

## 9. 后端文件位置（供参考，勿改）

| 文件 | 内容 |
|---|---|
| `app/api/vrchat/route.ts` | 接口本身，文件头注释里有完整契约 |
| `lib/vrchat.ts`、`lib/vrchat.test.ts` | 模板解析规则、UA 判断，以及对应测试 |
| `lib/footprints.ts` | `deriveVrchatFootprint`，足迹的推导 |
| `lib/guestbook.ts` | `sanitizeGuestbookText`，清洗规则（和网站表单共用） |
