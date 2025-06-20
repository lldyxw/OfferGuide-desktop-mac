let socket = null;
let isConnected = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 3000;

// DOM元素
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const statusElement = document.getElementById('connectionStatus');
const logElement = document.getElementById('messageLog');

// 在初始化时获取用户数据
async function init() {
    try {
        const userData = await window.electronAPI.getUserData();
        const loggedInPhone = userData?.phone || '';

        // 如果没有登录信息，跳转回登录页
        if (!loggedInPhone) {
            const success = await window.electronAPI.navigate('pc-login.html');
            if (!success) {
                alert('无法跳转到登录页');
            }
            return;
        }

        document.getElementById('logged-in-phone').textContent = loggedInPhone;

        // 原有初始化代码...
        connectBtn.addEventListener('click', connectWebSocket(loggedInPhone));
        disconnectBtn.addEventListener('click', disconnectWebSocket);
        updateUI();
    } catch (error) {
        console.error('初始化失败:', error);
        window.electronAPI.reportError(error);
        alert('初始化失败，请重试');
    }
}
// 连接WebSocket
function connectWebSocket(loggedInPhone) {
    if (isConnected) return;

    updateStatus('正在连接...');
    addLog('尝试连接到WebSocket服务器...');

    // 使用从主进程获取的手机号
    const wsUrl = `wss://offerguide.cn/ws/endpoint?clientType=pc&userId=${encodeURIComponent(loggedInPhone)}`;
    socket = new WebSocket(wsUrl);

    socket.onopen = function() {
        isConnected = true;
        reconnectAttempts = 0;
        updateStatus('已连接');
        addLog('WebSocket连接已建立');
        updateUI();

        // 连接成功后发送用户信息（如果需要）
        if (loggedInPhone) {
            const initMessage = {
                type: 'USER_INFO',
                phone: loggedInPhone,
                timestamp: new Date().toISOString()
            };
            socket.send(JSON.stringify(initMessage));
        }
    };

    // 其余代码保持不变...
    socket.onclose = function(event) {
        isConnected = false;
        updateStatus('未连接');
        addLog(`WebSocket连接已关闭，代码: ${event.code}, 原因: ${event.reason || '未知'}`);
        updateUI();

        // 自动重连逻辑
        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            addLog(`将在 ${reconnectDelay/1000} 秒后尝试重新连接 (${reconnectAttempts}/${maxReconnectAttempts})`);
            setTimeout(connectWebSocket(loggedInPhone), reconnectDelay);
        }
    };

    socket.onerror = function(error) {
        isConnected = false;
        updateStatus('连接错误');
        addLog('WebSocket错误: ' + JSON.stringify(error));
        updateUI();
    };

    socket.onmessage = async function(event) {
        try {
            const message = event.data;
            addLog('收到消息: ' + message);

            const data = JSON.parse(message);
            if (data.type === 'CAPTURE_REQUEST') {
                await handleCaptureRequest();
            }
        } catch (e) {
            addLog('消息处理错误: ' + e.message);
            window.electronAPI.reportError(e);
        }
    };
}
async function handleCaptureRequest() {
    try {
        // 建议添加平台检测和错误处理
        if (process.platform === 'darwin') {
            // Mac 可能需要额外权限检查
            const { systemPreferences } = require('electron').remote;
            const hasPermission = await systemPreferences.getMediaAccessStatus('screen');
            if (hasPermission !== 'granted') {
                throw new Error('请先在系统设置中授予屏幕录制权限');
            }
        }
        const screenshotBuffer = await window.electronAPI.captureScreen();

        // 二进制传输
        if (socket && socket.readyState === WebSocket.OPEN) {
            // 先发送元数据
            socket.send(JSON.stringify({
                type: 'CAPTURE_METADATA',
                size: screenshotBuffer.length,
                timestamp: new Date().toISOString()
            }));

            // 发送二进制数据
            socket.send(screenshotBuffer);
            addLog('截图已通过二进制发送');
        }
    } catch (error) {
        // 增强错误提示（特别是Mac权限问题）
        const errorMsg = process.platform === 'darwin'
            ? `截图失败: ${error.message}\n(请检查系统偏好设置 > 安全性与隐私 > 屏幕录制权限)`
            : `截图失败: ${error.message}`;
        addLog('截图失败: ' + errorMsg);
        addLog('截图失败: ' + error.message);my

        const errorResponse = {
            type: 'CAPTURE_ERROR',
            message: error.message,
            timestamp: new Date().toISOString()
        };

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(errorResponse));
        }

        window.electronAPI.reportError(error);
    }
}


// 断开WebSocket连接
function disconnectWebSocket() {
    if (socket && isConnected) {
        socket.close(1000, '用户主动断开');
        isConnected = false;
        reconnectAttempts = maxReconnectAttempts; // 停止自动重连
        updateStatus('正在断开...');
        addLog('正在断开WebSocket连接...');
    }
}

// 压缩图片数据
function compressImage(base64Data, quality = 0.7) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // 转换为JPEG并压缩
            const compressedData = canvas.toDataURL('image/jpeg', quality).split(',')[1];
            resolve(compressedData);
        };
        img.src = `data:image/png;base64,${base64Data}`;
    });
}

// 格式化字节大小
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// 更新UI状态
function updateUI() {
    connectBtn.disabled = isConnected;
    disconnectBtn.disabled = !isConnected;
}

// 更新状态显示
function updateStatus(statusText) {
    statusElement.textContent = statusText;

    if (statusText === '已连接') {
        statusElement.style.backgroundColor = '#d4edda';
        statusElement.style.borderColor = '#c3e6cb';
    } else if (statusText === '未连接') {
        statusElement.style.backgroundColor = '#f8d7da';
        statusElement.style.borderColor = '#f5c6cb';
    } else {
        statusElement.style.backgroundColor = '#fff3cd';
        statusElement.style.borderColor = '#ffeeba';
    }
}

// 添加日志
function addLog(logText) {
    const timestamp = new Date().toLocaleTimeString();
    logElement.innerHTML += `[${timestamp}] ${logText}\n`;
    logElement.scrollTop = logElement.scrollHeight;
}
// 添加注销功能
document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try {
        // 清除用户数据
        await window.electronAPI.setUserData({ phone: '' });
        // 断开WebSocket连接
        if (socket) {
            socket.close();
        }
        // 导航回登录页
        window.electronAPI.navigate('pc-login.html');
    } catch (error) {
        console.error('Logout failed:', error);
    }
});
// 初始化应用
document.addEventListener('DOMContentLoaded', init);

