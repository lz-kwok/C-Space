fn main() {
    // Release 构建嵌入 requireAdministrator 清单（启动即请求 UAC），
    // Dev 构建使用 asInvoker，避免 `tauri dev` 在非管理员终端下启动失败 (os error 740)。
    let profile = std::env::var("PROFILE").unwrap_or_default();
    let manifest = if profile == "release" {
        include_str!("app.manifest")
    } else {
        include_str!("app.dev.manifest")
    };
    println!("cargo:rerun-if-changed=app.manifest");
    println!("cargo:rerun-if-changed=app.dev.manifest");
    let attrs = tauri_build::Attributes::new()
        .windows_attributes(tauri_build::WindowsAttributes::new().app_manifest(manifest));
    tauri_build::try_build(attrs).expect("failed to run tauri build script");
}

