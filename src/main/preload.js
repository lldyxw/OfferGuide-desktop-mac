const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
    captureScreen: () => ipcRenderer.invoke('capture-screen-binary'), // 新增二进制接口
    // captureScreen: () => ipcRenderer.invoke('capture-screen'),
    onUpdateStatus: (callback) => ipcRenderer.on('update-status', callback),
    onAddLog: (callback) => ipcRenderer.on('add-log', callback),
    // 添加错误报告方法
    reportError: (error) => ipcRenderer.send('report-error', {
        message: error.message,
        stack: error.stack
    }),
    // 新增方法
    setUserData: (data) => ipcRenderer.invoke('set-user-data', data),
    getUserData: () => ipcRenderer.invoke('get-user-data'),
    navigate: (page) => ipcRenderer.invoke('navigate', page)
})

// 错误处理
process.on('uncaughtException', (error) => {
    ipcRenderer.send('report-error', {
        message: error.message,
        stack: error.stack
    })
})

// 捕获预加载脚本中的错误
window.addEventListener('error', (event) => {
    const error = event.error || event
    console.error('Preload script error:', error)
    try {
        ipcRenderer.send('preload-error', {
            message: error.message,
            stack: error.stack
        })
    } catch (e) {
        console.error('Failed to send preload error:', e)
    }
})

