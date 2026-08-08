const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// --- 1. 攝影機設定 (保留並確認) ---
async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 },
            audio: false
        });
        videoElement.srcObject = stream;
        return new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                resolve(videoElement);
            };
        });
    } catch (error) {
        console.error("無法存取攝影機：", error);
    }
}

// --- 2. 初始化與設定 MediaPipe Hands 模型 ---
// 加強 localeFile 設定，確保模型路徑正確
const hands = new Hands({
    locateFile: (file) => {
        const url = `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        console.log(`正在載入模型檔案: ${file} from ${url}`); // 調試用
        return url;
    }
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// --- 3. 處理辨識結果並繪製 ---
hands.onResults(onResults);

function onResults(results) {
    // 【調試點 1】檢查有沒有觸發 results 回調
    // console.log("onResults triggered");

    // 確保畫布解析度與影片一致 (重要：防止繪製錯位)
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    
    canvasCtx.save();
    
    // 清除上一幀的畫布
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // 將攝影機影像畫到畫布上，這樣影像和標記點才會在同一個畫布上被一起鏡像
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    
    // 【調試點 2】確認是否有偵測到手部數據
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // console.log(`偵測到 ${results.multiHandLandmarks.length} 隻手`);

        // 迴圈處理每一隻手
        for (const landmarks of results.multiHandLandmarks) {
            
            // 使用 drawing_utils 畫出連線 (白色)
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
                color: '#FFFFFF', // 白色連線
                lineWidth: 1.5
            });
            
            // 使用 drawing_utils 畫出節點 (白色)
            drawLandmarks(canvasCtx, landmarks, {
                color: '#FFFFFF', // 白色節點
                fillColor: '#FFFFFF',
                lineWidth: 2,
                radius: 3
            });
            
            // 【未來功能】這裡取得了 21 個點的座標。
            // 例如：食指指尖 (索引 8)
            const indexFingerTip = landmarks[8];
            // 我們可以用 indexFingerTip.y 來控制音高
        }
    } else {
        // console.log("未偵測到手部");
    }
    canvasCtx.restore();
}

// --- 4. 建立影像處理迴圈 ---
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({image: videoElement});
    },
    width: 640,
    height: 480
});

// --- 5. 執行主程式 ---
async function main() {
    console.log("正在啟動攝影機...");
    await setupCamera();
    videoElement.play();
    console.log("攝影機啟動成功！");

    console.log("正在初始化 MediaPipe 模型...");
    // 確保模型開始執行
    await hands.initialize();
    console.log("模型初始化完成，正在啟動偵測...");
    
    // 啟動迴圈
    camera.start();
}

// 開始
main();