const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
 
// ✨ 升級：建立兩個合成器
const monoSynth = new Tone.Synth().toDestination(); // 用於右手單音，支援平滑音高變化
const polySynth = new Tone.PolySynth(Tone.Synth).toDestination(); // 用於左手和弦

// ✨ 升級：一個音波分析器，用於視覺化所有聲音
const waveform = new Tone.Waveform();
monoSynth.connect(waveform);
polySynth.connect(waveform);

// ✨ 升級：為兩種模式分別管理聲音狀態
let isMonoPlaying = false;
let isPolyPlaying = false;

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
    
    // ✨ 升級：初始化本幀的手部資訊
    let isRightHandPinching = false;
    let rightHandPitch = 440; // 預設音高
    let isLeftHandPinching = false;
    let leftHandVolume = 0;   // 預設音量 (最大)
    let isLeftHandVisible = false;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {

        // ✨ 升級：迴圈處理偵測到的每一隻手
        results.multiHandLandmarks.forEach((landmarks, i) => {
            const handMeta = results.multiHandedness[i];
            const handLabel = handMeta.label; // 'Left' or 'Right'

            // 繪製手部關節點與連線
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
                color: '#FFFFFF', lineWidth: 1.5
            });
            drawLandmarks(canvasCtx, landmarks, {
                color: '#FFFFFF', fillColor: '#FFFFFF', lineWidth: 2, radius: 3
            });

            if (handLabel === 'Right') {
                // --- 右手：控制音高與觸發 ---
                const thumbTip = landmarks[4];
                const indexFingerTip = landmarks[8];
                const distance = Math.sqrt(Math.pow(thumbTip.x - indexFingerTip.x, 2) + Math.pow(thumbTip.y - indexFingerTip.y, 2));
                const pinchThreshold = 0.05;

                if (distance < pinchThreshold) {
                    isRightHandPinching = true;
                    const minFreq = 261; // C4
                    const maxFreq = 1046; // C6
                    rightHandPitch = (1 - indexFingerTip.y) * (maxFreq - minFreq) + minFreq;
                }
            }

            if (handLabel === 'Left') {
                // --- 左手：控制音量 ---
                const thumbTip = landmarks[4];
                const indexFingerTip = landmarks[8];
                const distance = Math.sqrt(Math.pow(thumbTip.x - indexFingerTip.x, 2) + Math.pow(thumbTip.y - indexFingerTip.y, 2));
                if (distance < 0.05) {
                    isLeftHandPinching = true;
                }
                isLeftHandVisible = true;
                // 使用手腕 (landmark 0) 的 Y 座標來控制音量，比較穩定
                const wristY = landmarks[0].y;
                const minVol = -30; // 安靜 (dB)
                const maxVol = 0;   // 大聲 (dB)
                // 手越高 (y 越小)，音量越大
                leftHandVolume = (1 - wristY) * (maxVol - minVol) + minVol;
            }
        });
    }

    // --- 決策階段：根據手勢決定進入「和弦模式」或「單音模式」---
    const targetVolume = isLeftHandVisible ? leftHandVolume : 0;
    const isChordMode = isLeftHandPinching;
    const isNoteMode = isRightHandPinching && !isLeftHandPinching;

    // --- 和弦模式控制 ---
    if (isChordMode) {
        // 進入和弦模式時，確保單音模式是關閉的
        if (isMonoPlaying) { monoSynth.triggerRelease(); isMonoPlaying = false; }

        if (!isAudioContextStarted) {
            Tone.start();
            isAudioContextStarted = true;
            console.log("音訊核心 (AudioContext) 已成功啟動！");
        }

        // 根據右手位置決定和弦的根音，並建立一個大三和弦
        const rootNote = rightHandPitch;
        const majorThird = rootNote * Math.pow(2, 4/12);
        const perfectFifth = rootNote * Math.pow(2, 7/12);
        const chord = [rootNote, majorThird, perfectFifth];

        polySynth.volume.rampTo(targetVolume, 0.1);
        polySynth.triggerAttack(chord); // 觸發或更新和弦
        isPolyPlaying = true;

    } else {
        // 如果沒有觸發和弦模式，確保和弦是關閉的
        if (isPolyPlaying) { polySynth.releaseAll(); isPolyPlaying = false; }
    }

    // --- 單音模式控制 ---
    if (isNoteMode) {
        if (!isAudioContextStarted) { Tone.start(); isAudioContextStarted = true; }

        monoSynth.volume.rampTo(targetVolume, 0.1);
        monoSynth.frequency.rampTo(rightHandPitch, 0.1); // 平滑改變音高

        if (!isMonoPlaying) { monoSynth.triggerAttack(rightHandPitch); isMonoPlaying = true; }
    } else {
        if (isMonoPlaying) { monoSynth.triggerRelease(); isMonoPlaying = false; }
    }

    // --- 繪製視覺回饋 (只要有聲音就繪製) ---
    if (isMonoPlaying || isPolyPlaying) {
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