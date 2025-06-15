const { app, BrowserWindow, ipcMain, desktopCapturer, screen } = require('electron')
const path = require('path')
const log = require('electron-log')

// 配置日志
log.transports.file.level = 'info'
log.transports.console.level = 'debug'
// 在文件顶部添加
let userData = {};
let mainWindow
// 在main.js中添加
function setupIpcHandlers() {
    // 用户数据处理
    ipcMain.handle('set-user-data', (event, data) => {
        userData = { ...userData, ...data };
        return true;
    });

    ipcMain.handle('get-user-data', () => {
        return userData;
    });

    // 页面导航处理
    ipcMain.handle('navigate', (event, page) => {
        if (!mainWindow) return false;

        try {
            const pagePath = path.join(__dirname, `../renderer/${page}`);
            mainWindow.loadFile(pagePath).catch(err => {
                log.error('导航失败:', err);
                throw err;
            });
            return true;
        } catch (error) {
            log.error('导航出错:', error);
            return false;
        }
    });
}
function createWindow() {
    try {
        mainWindow = new BrowserWindow({
            width: 900,
            height: 600,
            // Mac特有样式
            titleBarStyle: 'hiddenInset',
            trafficLightPosition: { x: 15, y: 15 },
            // 其他配置保持不变...
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                contextIsolation: true,
                enableRemoteModule: false,
                nodeIntegration: false,
                sandbox: true
            }
        })

        // 加载应用界面
        const indexPath = path.join(__dirname, '../renderer/pc-login.html')
        log.info(`Loading index file from: ${indexPath}`)
        mainWindow.loadFile(indexPath).catch(err => {
            log.error('Failed to load index file:', err)
            showErrorWindow(err)
        })
        // Mac特有的菜单栏处理
        if (process.platform === 'darwin') {
            app.dock.setIcon(path.join(__dirname, '../build/icon.icns'));
        }
        // 打开开发者工具
        mainWindow.webContents.openDevTools()

        mainWindow.on('closed', function () {
            mainWindow = null
        })

        // 处理渲染进程崩溃
        mainWindow.webContents.on('render-process-gone', (event, details) => {
            log.error('Renderer process crashed:', details)
            showErrorWindow(`Renderer crashed: ${details.reason}`)
        })

        // 处理未捕获的异常
        mainWindow.webContents.on('unresponsive', () => {
            log.warn('Window is unresponsive')
        })

    } catch (error) {
        log.error('Failed to create window:', error)
        showErrorWindow(error)
    }
}

// 显示错误窗口
function showErrorWindow(error) {
    const errorWindow = new BrowserWindow({
        width: 600,
        height: 400,
        modal: true,
        show: false,
        webPreferences: {
            nodeIntegration: true
        }
    })

    const errorMessage = typeof error === 'string' ? error : error.stack || error.message
    errorWindow.loadURL(`data:text/html;charset=utf-8,
        <html>
            <body style="font-family: Arial; padding: 20px; color: red;">
                <h1>Application Error</h1>
                <pre>${escapeHtml(errorMessage)}</pre>
                <button onclick="window.close()" style="padding: 8px 16px; margin-top: 20px;">
                    Close
                </button>
            </body>
        </html>
    `)

    errorWindow.once('ready-to-show', () => {
        errorWindow.show()
    })
}

// 转义HTML特殊字符
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
}

// 全局异常捕获
process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception:', error)
    showErrorWindow(error)
})

process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled Rejection at:', promise, 'reason:', reason)
    showErrorWindow(reason)
})

app.whenReady().then(() => {
    createWindow()
    setupIpcHandlers() // 设置IPC处理器
}).catch(err => {
    log.error('Failed to start app:', err)
    showErrorWindow(err)
})

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit()
})

app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// 权限处理
app.on('web-contents-created', (event, contents) => {
    contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'display-capture']

        if (allowedPermissions.includes(permission)) {
            callback(true) // 允许权限
        } else {
            callback(false) // 拒绝其他权限
        }
    })
})

// 截图处理
ipcMain.handle('capture-screen', async () => {
    try {
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: screen.getPrimaryDisplay().workAreaSize
        });

        if (!sources || sources.length === 0) {
            throw new Error('未找到可用的屏幕源');
        }

        // 获取主显示器截图
        const primarySource = sources.find(source =>
            source.display_id === screen.getPrimaryDisplay().id.toString()
        ) || sources[0];

        if (!primarySource.thumbnail) {
            throw new Error('无法获取屏幕缩略图');
        }

        return primarySource.thumbnail.toPNG().toString('base64');
    } catch (error) {
        console.error('截图失败:', error);
        throw error;
    }
});

// 二进制处理
ipcMain.handle('capture-screen-binary', async () => {
    const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
    });
    return sources[0].thumbnail.toPNG(); // 直接返回Buffer
});