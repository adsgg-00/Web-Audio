const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// ✨ 新增：初始化 Tone.js 合成器，並設定一個狀態變數來追蹤聲音
const synth = new Tone.Synth().toDestination();
let isPlaying = false;

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
            
            // --- ✨ 第三步 & 第四步：手勢偵測與聲音互動 ---
            
            // 取得大拇指指尖 (索引 4) 和食指指尖 (索引 8) 的座標
            const thumbTip = landmarks[4];
            const indexFingerTip = landmarks[8];

            // 計算兩點之間的歐幾里得距離
            // 座標是正規化的 (0.0 - 1.0)，所以距離也是一個相對值
            const distance = Math.sqrt(
                Math.pow(thumbTip.x - indexFingerTip.x, 2) +
                Math.pow(thumbTip.y - indexFingerTip.y, 2)
            );

            // 設定一個觸發「捏合」手勢的距離閾值 (這個值可以根據您的攝影機和習慣微調)
            const pinchThreshold = 0.05;

            if (distance < pinchThreshold) {
                // --- 捏合狀態 ---

                // 將食指的 Y 座標 (範圍 0.0 ~ 1.0) 轉換為音高頻率
                // Y 座標越上面值越小，越下面值越大。我們希望手越高，音越高。
                // 因此使用 (1 - y) 來反轉。
                const minFreq = 261; // C4 音高
                const maxFreq = 1046; // C6 音高
                const freq = (1 - indexFingerTip.y) * (maxFreq - minFreq) + minFreq;

                if (!isPlaying) {
                    // 如果聲音還沒開始播放，就觸發它
                    synth.triggerAttack(freq);
                    isPlaying = true;
                }
                // 如果聲音正在播放，就使用 rampTo 平滑地更新頻率
                synth.frequency.rampTo(freq, 0.1);

            } else {
                // --- 非捏合狀態 ---
                if (isPlaying) {
                    // 如果之前正在播放聲音，就停止它
                    synth.triggerRelease();
                    isPlaying = false;
                }
            }
        }
    } else {
        // 如果畫面上沒有偵測到手，也要確保停止聲音
        if (isPlaying) {
            synth.triggerRelease();
            isPlaying = false;
        }
    }
    canvasCtx.restore();
}

// --- 5. 執行主程式 ---
async function main() {
    console.log("正在啟動攝影機...");
    await setupCamera();
    try {
        // 關鍵：play() 會回傳一個 Promise。我們需要 await 它，
        // 確保影片真正開始播放後，才繼續執行後續的偵測啟動。
        await videoElement.play();
        console.log("攝影機啟動成功！");
    } catch (error) {
        console.error("影片播放失敗：", error);
        return; // 如果播放失敗，則停止執行
    }
    
    console.log("正在初始化 MediaPipe 模型...");
    // 確保模型開始執行
    await hands.initialize();
    console.log("模型初始化完成，正在啟動偵測...");
    
    // --- 4. 建立並啟動影像處理迴圈 ---
    // 將 Camera 的實例化移至此處，確保 videoElement 已完全準備好
    const camera = new Camera(videoElement, {
        onFrame: async () => {
            await hands.send({image: videoElement});
        },
        width: 640,
        height: 480
    });
    camera.start();
}

// 開始
main();