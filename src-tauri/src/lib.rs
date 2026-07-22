use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri::Emitter;
use tauri_plugin_updater::UpdaterExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

      // 创建托盘菜单项
      let quit_i = MenuItemBuilder::new("退出").id("quit").build(app)?;
      let show_i = MenuItemBuilder::new("显示主窗口").id("show").build(app)?;
      
      // 构建菜单并关联选项
      let menu = MenuBuilder::new(app)
        .item(&show_i)
        .item(&quit_i)
        .build()?;

      // 创建并配置系统托盘图标
      if let Some(icon) = app.default_window_icon() {
        let _tray = TrayIconBuilder::new()
          .icon(icon.clone())
          .menu(&menu)
          .show_menu_on_left_click(false)
          .tooltip("OmniDev")
          .on_menu_event(|app, event| match event.id().as_ref() {
            "quit" => {
              if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit("tauri-exit-requested", ());
              } else {
                shutdown_node_server_raw(app);
                app.exit(0);
              }
            }
            "show" => {
              if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.center();
                let _ = window.set_focus();
              }
            }
            _ => {}
          })
          .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
              button: MouseButton::Left,
              button_state: MouseButtonState::Up,
              ..
            } = event
            {
              let app = tray.app_handle();
              if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.center();
                let _ = window.set_focus();
              }
            }
          })
          .build(app)?;
      }

      // 🚀 软件打开时自动拉起后台 Node.js 后端服务，实现双击开箱即用
      let app_handle = app.handle();
      if let Err(e) = start_backend_server_inner(app_handle) {
        eprintln!("自动启动后端服务失败: {}", e);
      }

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      start_backend_server,
      get_backend_port,
      kill_port_process,
      save_server_port,
      install_app_update
    ])
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        // 阻止默认的销毁窗口行为，交给前端进行后续关闭偏好处理
        api.prevent_close();
        let _ = window.emit("tauri-close-requested", ());
      }
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|_app_handle, event| match event {
      tauri::RunEvent::Exit => {
        shutdown_node_server(_app_handle);
      }
      _ => {}
    });
}

/// 由 Tauri 官方 Updater 完成签名校验、下载、安装与重启。
#[tauri::command]
async fn install_app_update(
  app_handle: tauri::AppHandle,
  update_url: Option<String>,
) -> Result<String, String> {
  let shutdown_handle = app_handle.clone();
  let mut updater_builder = app_handle
    .updater_builder()
    .on_before_exit(move || shutdown_node_server_raw(&shutdown_handle));

  if let Some(endpoint_url) = update_url.filter(|value| !value.trim().is_empty()) {
    if !endpoint_url.starts_with("https://") {
      return Err("生产更新源必须使用 HTTPS".to_string());
    }
    let endpoint = endpoint_url
      .parse()
      .map_err(|err| format!("更新源 URL 无效: {}", err))?;
    updater_builder = updater_builder
      .endpoints(vec![endpoint])
      .map_err(|err| format!("设置更新源失败: {}", err))?;
  }

  let updater = updater_builder
    .build()
    .map_err(|err| format!("初始化更新器失败: {}", err))?;
  let update = updater
    .check()
    .await
    .map_err(|err| format!("检查签名更新失败: {}", err))?
    .ok_or_else(|| "未检测到可安装的新版本".to_string())?;

  let progress_handle = app_handle.clone();
  let finished_handle = app_handle.clone();
  let mut downloaded = 0usize;
  update
    .download_and_install(
      move |chunk_length, content_length| {
        downloaded += chunk_length;
        let _ = progress_handle.emit("app-update-progress", serde_json::json!({
          "event": "progress",
          "downloaded": downloaded,
          "contentLength": content_length
        }));
      },
      move || {
        let _ = finished_handle.emit("app-update-progress", serde_json::json!({
          "event": "finished"
        }));
      },
    )
    .await
    .map_err(|err| format!("更新包校验或安装失败: {}", err))?;

  let _ = app_handle.emit("app-update-progress", serde_json::json!({
    "event": "installed"
  }));
  app_handle.restart();
}

/// 🚀 内部逻辑：一键启动 Node.js 后端服务 (支持 AppHandle 动态寻址资源)
fn start_backend_server_inner(app_handle: &tauri::AppHandle) -> Result<String, String> {
  let port = get_server_port(app_handle);

  // 💡 高精强健校验：在拉起 Node 之前先尝试在目标端口建立 TCP 监听。若失败，证明端口被其它进程强占
  if std::net::TcpListener::bind(("127.0.0.1", port)).is_err() {
    return Err(format!("PORT_OCCUPIED:{}", port));
  }

  // 💡 动态解析资源路径：开发环境下指向本地磁盘源码，生产环境下指向打包后只读资源目录
  let server_path = app_handle
    .path()
    .resolve("_up_/dist-server/server.js", tauri::path::BaseDirectory::Resource)
    .map_err(|e| format!("解析资源路径失败: {}", e))?;

  if !server_path.exists() {
    return Err("找不到 server.js 文件，请确认是否已将其配置在 tauri.conf.json 的 resources 中".to_string());
  }

  let work_dir = server_path.parent().ok_or("获取资源父目录失败".to_string())?;
  
  // 💡 获取用户 AppData 物理隔离写入目录，避免安装在 C:\Program Files 下时遭遇写入拒绝
  let app_data_dir = app_handle
    .path()
    .app_data_dir()
    .map_err(|e| format!("获取 AppData 目录失败: {}", e))?;

  // 💡 创建日志输出，以便精准定位打包后 Node 后端启动失败的详细报错
  let mut log_dir = app_data_dir.clone();
  log_dir.push("logs");
  if !log_dir.exists() {
    let _ = std::fs::create_dir_all(&log_dir);
  }
  let log_file_path = log_dir.join("node_server.log");
  
  let log_file = std::fs::OpenOptions::new()
    .create(true)
    .append(true)
    .open(&log_file_path)
    .ok();

  let get_stdio = || {
    log_file.as_ref()
      .and_then(|f| f.try_clone().ok())
      .map(std::process::Stdio::from)
      .unwrap_or_else(std::process::Stdio::null)
  };

  #[cfg(target_os = "windows")]
  {
    use std::os::windows::process::CommandExt;
    std::process::Command::new("node")
      .arg(&server_path)
      .current_dir(work_dir)
      .env("OMNIDEV_APP_DATA_DIR", &app_data_dir)
      .stdout(get_stdio())
      .stderr(get_stdio())
      .creation_flags(0x08000000) // CREATE_NO_WINDOW
      .spawn()
      .map_err(|e| format!("启动后端服务失败: {}", e))?;
  }
  #[cfg(not(target_os = "windows"))]
  {
    std::process::Command::new("node")
      .arg(&server_path)
      .current_dir(work_dir)
      .env("OMNIDEV_APP_DATA_DIR", &app_data_dir)
      .stdout(get_stdio())
      .stderr(get_stdio())
      .spawn()
      .map_err(|e| format!("启动后端服务失败: {}", e))?;
  }

  let port = get_server_port(app_handle);
  Ok(format!("后端服务正在启动 (端口 {})", port))
}

/// 🚀 Tauri 前端可调用命令：前端手动点击启动后端服务
#[tauri::command]
fn start_backend_server(app_handle: tauri::AppHandle) -> Result<String, String> {
  start_backend_server_inner(&app_handle)
}

/// 🚀 Tauri 前端可调用命令：获取当前 Node 后端端口
#[tauri::command]
fn get_backend_port(app_handle: tauri::AppHandle) -> u16 {
  get_server_port(&app_handle)
}

/// 🚀 Tauri 前端可调用命令：强杀占用指定端口的全部进程
#[tauri::command]
fn kill_port_process(port: u16) -> Result<String, String> {
  #[cfg(target_os = "windows")]
  {
    use std::os::windows::process::CommandExt;
    let cmd = format!(
      "Get-NetTCPConnection -LocalPort {} -State Listen -ErrorAction SilentlyContinue | ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force }}",
      port
    );
    let output = std::process::Command::new("powershell")
      .args(&["-NoProfile", "-Command", &cmd])
      .creation_flags(0x08000000) // CREATE_NO_WINDOW
      .output();
    match output {
      Ok(_) => Ok("已强杀占用端口进程".to_string()),
      Err(e) => Err(format!("强杀失败: {}", e)),
    }
  }
  #[cfg(not(target_os = "windows"))]
  {
    let cmd = format!("kill -9 $(lsof -t -i:{})", port);
    let output = std::process::Command::new("sh")
      .args(&["-c", &cmd])
      .output();
    match output {
      Ok(_) => Ok("已强杀占用端口进程".to_string()),
      Err(e) => Err(format!("强杀失败: {}", e)),
    }
  }
}

/// 🚀 Tauri 前端可调用命令：修改全局 app.json 里的 serverPort 为新端口并持久化保存
#[tauri::command]
fn save_server_port(app_handle: tauri::AppHandle, port: u16) -> Result<String, String> {
  let mut path = app_handle.path().app_data_dir()
    .map_err(|e| format!("获取 AppData 目录失败: {}", e))?;
  path.push("config");
  if !path.exists() {
    let _ = std::fs::create_dir_all(&path);
  }
  path.push("app.json");

  let mut config_value = serde_json::json!({
    "serverPort": port
  });

  if path.exists() {
    if let Ok(content) = std::fs::read_to_string(&path) {
      if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&content) {
        v["serverPort"] = serde_json::json!(port);
        config_value = v;
      }
    }
  }

  let content = serde_json::to_string_pretty(&config_value)
    .map_err(|e| format!("序列化配置失败: {}", e))?;
  std::fs::write(&path, content)
    .map_err(|e| format!("写入配置文件失败: {}", e))?;

  Ok("端口已保存".to_string())
}

fn get_server_port(app_handle: &tauri::AppHandle) -> u16 {
  // 1. 优先尝试从 AppData 目录读取（用户修改后的自定义配置）
  if let Ok(mut path) = app_handle.path().app_data_dir() {
    path.push("config");
    path.push("app.json");
    if let Ok(content) = std::fs::read_to_string(&path) {
      if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
        if let Some(port) = v.get("serverPort").and_then(|p| p.as_u64()) {
          return port as u16;
        }
      }
    }
  }

  // 2. 降级尝试从打包只读资源目录读取（默认初始配置）
  if let Ok(path) = app_handle.path().resolve("_up_/dist-server/config/app.json", tauri::path::BaseDirectory::Resource) {
    if let Ok(content) = std::fs::read_to_string(path) {
      if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
        if let Some(port) = v.get("serverPort").and_then(|p| p.as_u64()) {
          return port as u16;
        }
      }
    }
  }
  3300
}

fn should_kill_server(app_handle: &tauri::AppHandle) -> bool {
  // 1. 优先尝试从 AppData 目录读取
  if let Ok(mut path) = app_handle.path().app_data_dir() {
    path.push("config");
    path.push("app.json");
    if let Ok(content) = std::fs::read_to_string(&path) {
      if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
        if let Some(kill) = v.get("killServerOnClose").and_then(|k| k.as_bool()) {
          return kill;
        }
      }
    }
  }

  // 2. 降级尝试从打包只读资源目录读取
  if let Ok(path) = app_handle.path().resolve("_up_/dist-server/config/app.json", tauri::path::BaseDirectory::Resource) {
    if let Ok(content) = std::fs::read_to_string(path) {
      if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
        if let Some(kill) = v.get("killServerOnClose").and_then(|k| k.as_bool()) {
          return kill;
        }
      }
    }
  }
  true // 默认启用
}

fn shutdown_node_server_raw(app_handle: &tauri::AppHandle) {
  let port = get_server_port(app_handle);
  let url = format!("http://localhost:{}/api/system/shutdown", port);
  
  #[cfg(target_os = "windows")]
  {
    use std::os::windows::process::CommandExt;
    let _ = std::process::Command::new("powershell")
      .args(&["-NoProfile", "-Command", &format!("Invoke-RestMethod -Uri '{}' -Method Post", url)])
      .creation_flags(0x08000000) // CREATE_NO_WINDOW
      .spawn();
  }
  #[cfg(not(target_os = "windows"))]
  {
    let _ = std::process::Command::new("curl")
      .args(&["-X", "POST", &url])
      .spawn();
  }
}

fn shutdown_node_server(app_handle: &tauri::AppHandle) {
  if !should_kill_server(app_handle) {
    return;
  }
  shutdown_node_server_raw(app_handle);
}
