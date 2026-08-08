const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
 
// ✨ 升級：建立兩種不同音色的合成器，分別給兩隻手使用
const synths = [
    new Tone.FMSynth().toDestination(), // FM 合成器音色
    new Tone.AMSynth().toDestination()  // AM 合成器音色
];
// ✨ 升級：一個音波分析器，用於視覺化兩個合成器的混合聲音
const waveform = new Tone.Waveform();
synths.forEach(synth => synth.connect(waveform)); // 將兩個合成器都連接到分析器

// ✨ 升級：為兩隻手（索引 0 和 1）分別管理聲音狀態
const handStates = [
    { isPlaying: false },
    { isPlaying: false }
];

// ✨ 新增：用於追蹤音訊核心是否已啟動的狀態旗標
let isAudioContextStarted = false;

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
    // 根據您的要求，設定為偵測兩隻手
    maxNumHands: 2,
    // 使用較精準的模型。如果感覺延遲，可以將此值改為 0 以換取效能。
    modelComplexity: 1, 
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.7 // 提高追蹤信賴度，讓偵測更穩定
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
    
    // ✨ 升級：追蹤此幀中處理了哪些手，以便偵測消失的手
    const handsProcessed = [false, false];

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {

        // ✨ 升級：迴圈處理偵測到的每一隻手
        results.multiHandLandmarks.forEach((landmarks, i) => {
            // 根據 MediaPipe 回傳的 handedness 取得手的索引 (0 或 1)
            const handIndex = results.multiHandedness[i].index;
            handsProcessed[handIndex] = true;

            // 繪製手部關節點與連線
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
                color: '#FFFFFF', lineWidth: 1.5
            });
            drawLandmarks(canvasCtx, landmarks, {
                color: '#FFFFFF', fillColor: '#FFFFFF', lineWidth: 2, radius: 3
            });
            
            const thumbTip = landmarks[4];
            const indexFingerTip = landmarks[8];
            const distance = Math.sqrt(
                Math.pow(thumbTip.x - indexFingerTip.x, 2) +
                Math.pow(thumbTip.y - indexFingerTip.y, 2)
            );
            const pinchThreshold = 0.05;

            if (distance < pinchThreshold) {
                // --- 此手處於「捏合」狀態 ---
                if (!isAudioContextStarted) {
                    Tone.start();
                    isAudioContextStarted = true;
                    console.log("音訊核心 (AudioContext) 已成功啟動！");
                }

                const minFreq = 261; // C4 音高
                const maxFreq = 1046; // C6 音高
                const freq = (1 - indexFingerTip.y) * (maxFreq - minFreq) + minFreq;

                if (!handStates[handIndex].isPlaying) {
                    synths[handIndex].triggerAttack(freq);
                    handStates[handIndex].isPlaying = true;
                }
                synths[handIndex].frequency.rampTo(freq, 0.1);

            } else {
                // --- 此手處於「放開」狀態 ---
                if (handStates[handIndex].isPlaying) {
                    synths[handIndex].triggerRelease();
                    handStates[handIndex].isPlaying = false;
                }
            }
        });
    }

    // ✨ 升級：如果某隻手從畫面上消失了，也要確保停止其聲音
    handsProcessed.forEach((processed, handIndex) => {
        if (!processed && handStates[handIndex].isPlaying) {
            synths[handIndex].triggerRelease();
            handStates[handIndex].isPlaying = false;
        }
    });

    // ✨ 升級：只要有任何一隻手在播放聲音，就繪製音波圖
    const isAnyHandPlaying = handStates.some(state => state.isPlaying);
    if (isAnyHandPlaying) {
        const waveformValues = waveform.getValue();
        drawWaveform(canvasCtx, waveformValues, canvasElement.width, canvasElement.height);
    }

    canvasCtx.restore();
}

/**
 * 繪製音波圖的輔助函式
 * @param {CanvasRenderingContext2D} ctx - Canvas 的 2D 上下文
 * @param {Float32Array} data - Tone.Waveform 回傳的音波數據
 * @param {number} width - 畫布寬度
 * @param {number} height - 畫布高度
 */
function drawWaveform(ctx, data, width, height) {
    const waveHeight = 100; // 音波圖的高度
    const yOffset = height - waveHeight; // 將音波圖放在畫布底部

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; // 音波圖的半透明背景
    ctx.fillRect(0, yOffset, width, waveHeight);

    ctx.strokeStyle = '#9CF'; // 音波線條顏色 (淺藍色)
    ctx.lineWidth = 2;
    ctx.beginPath();

    const sliceWidth = width / data.length;

    for (let i = 0; i < data.length; i++) {
        const v = data[i]; // 音波數據值在 -1 到 1 之間
        // 將 -1 到 1 的值映射到音波圖區域的 Y 座標
        const y = (v * waveHeight / 2) + (yOffset + waveHeight / 2);

        if (i === 0) {
            ctx.moveTo(0, y);
        } else {
            ctx.lineTo(i * sliceWidth, y);
        }
    }
    ctx.stroke();
    ctx.restore();
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