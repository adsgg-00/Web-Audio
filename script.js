const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// --- 1. 攝影機設定 (保留前一步) ---
async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 },
            audio: false
        });
        videoElement.srcObject = stream;
        return new Promise((resolve) => {
            videoElement.onloadedmetadata = () => resolve(videoElement);
        });
    } catch (error) {
        console.error("無法存取攝影機：", error);
    }
}

// --- 2. 初始化 MediaPipe Hands 模型 ---
const hands = new Hands({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});

// 設定模型參數
hands.setOptions({
    maxNumHands: 2,           // 最多偵測兩隻手
    modelComplexity: 1,       // 模型複雜度 (預設為 1)
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// --- 3. 處理辨識結果並繪製在畫布上 ---
hands.onResults(onResults);

function onResults(results) {
    // 確保畫布的內部解析度與影片解析度一致，畫圖才不會錯位
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    
    canvasCtx.save();
    // 清除上一幀的畫面
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // 如果有偵測到手部
    if (results.multiHandLandmarks) {
        // 迴圈處理每一隻手 (最多兩隻)
        for (const landmarks of results.multiHandLandmarks) {
            
            // 使用 drawing_utils 畫出連線與白點 (還原你圖片中的視覺效果)
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#FFFFFF', lineWidth: 2});
            drawLandmarks(canvasCtx, landmarks, {color: '#FFFFFF', lineWidth: 4, radius: 3});
            
            // 【關鍵】這裡取得了 21 個點的座標。
            // 以食指指尖 (索引 8) 為例：
            // 數值會是 0 到 1 之間的比例值 (例如 0.5 代表在畫面正中間)
            const indexFingerTip = landmarks[8];
            // console.log("食指 Y 座標:", indexFingerTip.y); // 未來這裡會用來控制音高
        }
    }
    canvasCtx.restore();
}

// --- 4. 建立影像處理迴圈 ---
let lastVideoTime = -1;
async function detectFrame() {
    // 當影片時間有前進時，才把新的一幀畫面送給模型處理
    if (videoElement.currentTime !== lastVideoTime) {
        lastVideoTime = videoElement.currentTime;
        await hands.send({image: videoElement});
    }
    // 不斷重複執行這個函數
    requestAnimationFrame(detectFrame);
}

// --- 5. 執行主程式 ---
async function main() {
    console.log("正在啟動攝影機...");
    await setupCamera();
    videoElement.play();
    console.log("攝影機啟動成功！正在載入 AI 模型 (初次載入需等幾秒)...");
    
    // 啟動辨識迴圈
    detectFrame();
}

main();