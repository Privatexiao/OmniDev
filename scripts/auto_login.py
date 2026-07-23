# -*- coding: utf-8 -*-
import sys
import io
import os
import subprocess
import json
import time

# 💡 强制将标准输出与标准错误重定向为 UTF-8 编码，彻底防御 Windows 简体中文 CP936 (GBK) 终端因打印中文而抛出 Unicode 转换崩溃闪退！
try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
except Exception:
    pass

def install_and_import(package, install_command=None):
    """
    智能自检：检测 Python 环境是否安装了特定依赖包，没有则自动静默下载安装，达成免配置自愈
    """
    try:
        return __import__(package)
    except ImportError:
        print(f"[AutoLogin] 正在自动为您下载并安装缺失的库: {package}...")
        # 强制使用清华源，大幅提升国内下载速度与网络握手成功率
        cmd = install_command if install_command else [sys.executable, "-m", "pip", "install", package, "-i", "https://pypi.tuna.tsinghua.edu.cn/simple"]
        try:
            subprocess.check_call(cmd)
            return __import__(package)
        except Exception as e:
            print(f"[AutoLogin] 安装依赖 {package} 失败: {str(e)}")
            sys.exit(1)

# 1. 检测并智能导入 playwright 核心包
install_and_import("playwright")

# 2. 检测并智能下载 chromium 浏览器内核 (Playwright 标准自建)
try:
    from playwright.sync_api import sync_playwright
except Exception:
    print("[AutoLogin] 正在为您下载 Chromium 浏览器调试内核，首次使用下载需要稍候片刻...")
    try:
        subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
        from playwright.sync_api import sync_playwright
    except Exception as e:
        print(f"[AutoLogin] 下载 Chromium 内核失败: {str(e)}")
        sys.exit(1)


def smart_login(login_url, username, password, login_browser="auto", credentials=None):
    """
    执行智能自动登录，支持多策略账号密码定位与浏览器缺失原地自愈重试
    """
    with sync_playwright() as p:
        browser = None
        # [动态编排] 优先调起用户所指定的浏览器通道，其余自适应降级兜底
        if login_browser == "chrome":
            channels = ["chrome", "msedge", None]
        elif login_browser == "msedge":
            channels = ["msedge", "chrome", None]
        elif login_browser == "chromium":
            channels = [None, "chrome", "msedge"]
        else:
            channels = ["chrome", "msedge", None]
        last_launch_err = None
        
        for ch in channels:
            try:
                ch_name = ch if ch else "内置 Chromium"
                print(f"[AutoLogin] 正在尝试调起本地浏览器通道: {ch_name}...")
                browser = p.chromium.launch(
                    headless=False,
                    channel=ch,
                    args=["--start-maximized", "--no-sandbox", "--disable-setuid-sandbox"]
                )
                if browser:
                    print(f"[AutoLogin] [成功] 成功调起浏览器通道: {ch_name}")
                    break
            except Exception as e:
                last_launch_err = e
                continue
                
        # [自愈机制] 若本地安装的 Chrome 与 Edge 都未能拉起，且无内置内核，则触发自愈
        if not browser:
            err_str = str(last_launch_err)
            if "Executable doesn't exist" in err_str or "playwright install" in err_str or "look for" in err_str:
                print("[AutoLogin] [警告] 所有本地物理浏览器通道均未检出，且系统缺少内置 Chromium 浏览器物理内核！")
                print("[AutoLogin] 正在为您极速自动启动自愈下载，首次下载需要约 10-20 秒...")
                try:
                    subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
                    print("[AutoLogin] [成功] 内置 Chromium 内核静默自动修补成功！正在为您重新拉起浏览器...")
                    browser = p.chromium.launch(
                        headless=False,
                        args=["--start-maximized", "--no-sandbox", "--disable-setuid-sandbox"]
                    )
                except Exception as download_err:
                    print(f"[AutoLogin] [错误] 自动修复 Chromium 物理内核失败: {str(download_err)}")
                    print("[AutoLogin] [提示] 您也可以在您的本地 CMD 窗口中手动运行：python -m playwright install chromium")
                    sys.exit(1)
            else:
                print(f"[AutoLogin] [错误] 启动所有浏览器引擎均失败: {err_str}")
                sys.exit(1)

        # 创建上下文，Header 类型凭证在首次导航前作为额外请求头注入。
        context_options = {"no_viewport": True}
        if credentials:
            extra_headers = {}
            for cred in credentials:
                if cred.get('enabled') is False:
                    continue
                key = cred.get('key')
                value = cred.get('value')
                if cred.get('inject_type') == 'header' and key and value is not None:
                    extra_headers[str(key)] = str(value)
            if extra_headers:
                context_options["extra_http_headers"] = extra_headers
                print(f"[AutoLogin] [凭证注入] 已在导航前挂载 {len(extra_headers)} 个 Header 凭证")

        context = browser.new_context(**context_options)

        # 1. 注入 Cookie 凭证到 context 中 (在导航前)
        if credentials:
            cookies_to_add = []
            from urllib.parse import urlparse
            try:
                parsed_url = urlparse(login_url)
                base_domain_url = f"{parsed_url.scheme}://{parsed_url.netloc}"
            except Exception:
                base_domain_url = login_url

            for cred in credentials:
                if cred.get('enabled') is False:
                    continue
                key = cred.get('key')
                value = cred.get('value')
                inject_type = cred.get('inject_type', 'cookie')
                if inject_type == 'cookie' and key and value is not None:
                    cookies_to_add.append({
                        "name": str(key),
                        "value": str(value),
                        "url": base_domain_url
                    })
            if cookies_to_add:
                try:
                    context.add_cookies(cookies_to_add)
                    print(f"[AutoLogin] [凭证注入] 成功预注入 {len(cookies_to_add)} 个 Cookie 凭证")
                except Exception as e:
                    print(f"[AutoLogin] [凭证注入] 注入 Cookie 失败: {str(e)}")

        # 2. 注入 localStorage / sessionStorage。初始化脚本必须在创建页面和导航前注册。
        if credentials:
            storage_credentials = []
            for cred in credentials:
                if cred.get('enabled') is False:
                    continue
                key = cred.get('key')
                value = cred.get('value')
                inject_type = cred.get('inject_type', 'cookie')
                if key and value is not None and inject_type in ('localStorage', 'sessionStorage'):
                    storage_credentials.append({
                        'key': str(key),
                        'value': str(value),
                        'inject_type': inject_type
                    })
            if storage_credentials:
                try:
                    storage_payload = json.dumps(storage_credentials, ensure_ascii=False)
                    js_script = f"""
                    (() => {{
                      const credentials = {storage_payload};
                      for (const credential of credentials) {{
                        try {{
                          const storage = credential.inject_type === 'sessionStorage'
                            ? window.sessionStorage
                            : window.localStorage;
                          storage.setItem(credential.key, credential.value);
                        }} catch (error) {{}}
                      }}
                    }})();
                    """
                    context.add_init_script(js_script)
                    print("[AutoLogin] [凭证注入] 已在导航前挂载 localStorage / sessionStorage 注入脚本")
                except Exception as e:
                    print(f"[AutoLogin] [凭证注入] 挂载缓存注入脚本失败: {str(e)}")

        page = context.new_page()
        
        try:
            page.goto(login_url, timeout=30000)
        except Exception as e:
            print(f"[AutoLogin] 访问登录链接超时或失败: {str(e)}")
            # 即使报错也不关闭浏览器，让用户在弹出的窗口里自行刷新
        
        # [极速等待] 毫秒级智能首屏渲染侦测：优先等待 DOM 构建完毕，无需生硬强等 2 秒
        try:
            page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        page.wait_for_timeout(300)

        # 智能填充账号与密码
        try:
            # 1. 自动定位所有的 Input 元素
            inputs = page.query_selector_all("input")
            username_input = None
            password_input = None
            
            # 首先识别密码框
            for inp in inputs:
                try:
                    type_attr = (inp.get_attribute("type") or "").lower()
                    if type_attr == "password":
                        password_input = inp
                        break
                except Exception:
                    continue
            
            # 如果没找到 type=password 的，退而求其次寻找带有密码关键字的
            if not password_input:
                for inp in inputs:
                    try:
                        name_attr = (inp.get_attribute("name") or "").lower()
                        id_attr = (inp.get_attribute("id") or "").lower()
                        placeholder = (inp.get_attribute("placeholder") or "").lower()
                        if "pass" in name_attr or "pass" in id_attr or "密码" in placeholder:
                            password_input = inp
                            break
                    except Exception:
                        continue

            # 寻找账号框 (排除了密码框之后的输入框)
            for inp in inputs:
                if inp == password_input:
                    continue
                try:
                    type_attr = (inp.get_attribute("type") or "").lower()
                    name_attr = (inp.get_attribute("name") or "").lower()
                    id_attr = (inp.get_attribute("id") or "").lower()
                    placeholder = (inp.get_attribute("placeholder") or "").lower()
                    
                    # 优先选择具有账号/手机/邮箱暗示特征的
                    if type_attr in ["text", "tel", "email"] or not type_attr:
                        if any(x in placeholder or x in name_attr or x in id_attr for x in ["账", "号", "手机", "邮", "用", "user", "phone", "email"]):
                            username_input = inp
                            break
                except Exception:
                    continue
            
            # 兜底：如果依然没找到具有暗示性的账号框，选取第一个 type 为 text 的输入框
            if not username_input:
                for inp in inputs:
                    if inp == password_input:
                        continue
                    try:
                        if (inp.get_attribute("type") or "").lower() == "text":
                            username_input = inp
                            break
                    except Exception:
                        continue

            # 2. 如果账号密码框均已定位且提供了账密，一键填入
            if username and password and username_input and password_input:
                print(f"[AutoLogin] 自动定位账号/密码框成功，正在极速填入账密...")
                username_input.click()
                username_input.fill(username)  # 一键灌入秒填
                
                page.wait_for_timeout(100)
                
                password_input.click()
                password_input.fill(password)  # 一键灌入秒填
                
                page.wait_for_timeout(150)

                # 3. 寻找并点击登录按钮
                login_btn = None
                
                # 策略 A：寻找包含了“登”、“login”、“submit”、“确”字样且在可视区域内的按钮或 input
                buttons = page.query_selector_all("button, input[type='button'], input[type='submit'], div[role='button']")
                for btn in buttons:
                    try:
                        text = (btn.inner_text() or btn.get_attribute("value") or "").lower().strip()
                        if any(x in text for x in ["登", "login", "确定", "提交", "进入"]):
                            # 确保是可见的按钮
                            if btn.is_visible():
                                login_btn = btn
                                break
                    except Exception:
                        continue
                
                # 策略 B：兜底寻找 type=submit 的元素
                if not login_btn:
                    login_btn = page.query_selector("button[type='submit']")

                if login_btn:
                    print("[AutoLogin] 智能定位登录按钮成功，正在模拟点击...")
                    login_btn.click()
                else:
                    # 策略 C：如果实在没找到按钮，在密码框里直接按回车
                    print("[AutoLogin] 未找到显式登录按钮，正在在密码框中发送 Enter 键...")
                    password_input.press("Enter")
            else:
                print("[AutoLogin] 警告：未能完全定位账号或密码输入框，请在浏览器中手动填写")
                
        except Exception as fill_err:
            print(f"[AutoLogin] 表单自动填充过程出错 (可能由于页面有防爬或特殊 DOM 结构): {str(fill_err)}")

        print("[AutoLogin] 自动登录流程已结束。浏览器窗口将为您无限期保持，直到您手动关闭它！")

        # 💡 使用 Playwright 内置的 wait_for_timeout 代替 Python 原生的 time.sleep。
        # 这样可以保持 Playwright 底层事件循环的正常运转，使浏览器能够正常处理和渲染页面内触发的 window.open / target="_blank" 新开页操作，避免造成新标签页 about:blank 和原页面卡死挂起。
        try:
            while True:
                active_pages = context.pages
                if not active_pages:
                    break
                active_pages[0].wait_for_timeout(1000)
        except Exception:
            pass


def main():
    # 从命令行参数读取一键注入参数 JSON 串
    if len(sys.argv) < 2:
        print("[AutoLogin] 错误：未传入自动登录配置参数！")
        sys.exit(1)

    try:
        config = json.loads(sys.argv[1])
    except Exception as e:
        print(f"[AutoLogin] 解析配置 payload 失败: {str(e)}")
        sys.exit(1)

    login_url = config.get("login_url", "")
    username = config.get("online_username", "")
    password = config.get("online_password", "")
    login_browser = config.get("login_browser", "auto")
    credentials = config.get("credentials", [])

    if not login_url:
        print("[AutoLogin] 错误：缺少登录直达链接参数！")
        sys.exit(1)

    smart_login(login_url, username, password, login_browser, credentials)


if __name__ == "__main__":
    main()
