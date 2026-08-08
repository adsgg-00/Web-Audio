const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
 
// ✨ 升級：可切換的合成器
let monoSynth;
let polySynth;

const synthOptions = {
    'Synth': Tone.Synth,
    'FMSynth': Tone.FMSynth,
    'AMSynth': Tone.AMSynth,
    'DuoSynth': Tone.DuoSynth,
};

// ✨ 升級：一個音波分析器，用於視覺化所有聲音
const waveform = new Tone.Waveform();

// ✨ 升級：為兩種模式分別管理聲音狀態
let isMonoPlaying = false;
let isPolyPlaying = false;

function createSynths(type = 'Synth') {
    // 清理舊的合成器以防止記憶體洩漏
    if (monoSynth) monoSynth.dispose();
    if (polySynth) polySynth.dispose();

    const SynthConstructor = synthOptions[type] || Tone.Synth;

    monoSynth = new SynthConstructor().toDestination();
    polySynth = new Tone.PolySynth(SynthConstructor).toDestination();

    monoSynth.connect(waveform);
    polySynth.connect(waveform);
    console.log(`音色已切換為: ${type}`);
}

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

/**
 * 計算指定手部伸出的手指數量。
 * @param {Array} landmarks - MediaPipe回傳的手部關節點。
 * @param {string} handLabel - 'Left' 或 'Right'。
 * @returns {number} 伸出的手指數量 (0-5)。
 */
function countExtendedFingers(landmarks, handLabel) {
    let extendedFingers = 0;

    // 關節點索引：指尖 和 指關節(PIP)
    const fingerTipIds = [4, 8, 12, 16, 20];
    const fingerPipIds = [3, 6, 10, 14, 18]; // 食指到小指用PIP，大拇指用IP

    // 1. 判斷大拇指
    // 簡單的判斷方式：比較指尖和關節的水平位置
    const thumbTip = landmarks[fingerTipIds[0]];
    const thumbPip = landmarks[fingerPipIds[0]]; // 實際上是大拇指的IP關節
    if (handLabel === 'Right') {
        if (thumbTip.x < thumbPip.x) {
            extendedFingers++;
        }
    } else { // 'Left'
        if (thumbTip.x > thumbPip.x) {
            extendedFingers++;
        }
    }

    // 2. 判斷其他四隻手指
    for (let i = 1; i < 5; i++) {
        const tip = landmarks[fingerTipIds[i]];
        const pip = landmarks[fingerPipIds[i]];
        // 如果指尖的Y座標小於（高於）指關節的Y座標，則視為伸出
        if (tip.y < pip.y) {
            extendedFingers++;
        }
    }
    return extendedFingers;
}

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
    let leftHandFingerCount = 0;
    let rightHandFingerCount = 0;
    let leftHandVolume = 0;   // 預設音量 (最大)
    let isRightHandVisible = false;
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

            // 計算伸出的手指數量
            const fingerCount = countExtendedFingers(landmarks, handLabel);

            if (handLabel === 'Right') {
                isRightHandVisible = true;
                rightHandFingerCount = fingerCount;
            }

            if (handLabel === 'Left') {
                isLeftHandVisible = true;
                leftHandFingerCount = fingerCount;

                // 使用手腕 (landmark 0) 的 Y 座標來控制音量，比較穩定
                const wristY = landmarks[0].y;
                const minVol = -30; // 安靜 (dB)
                const maxVol = 0;   // 大聲 (dB)
                // 手越高 (y 越小)，音量越大
                leftHandVolume = (1 - wristY) * (maxVol - minVol) + minVol;
            }
        });
    }

    // --- 全新決策階段：根據手指數量決定和弦 ---
    const targetVolume = isLeftHandVisible ? leftHandVolume : 0;
    
    // 1. 根據左手手指數決定根音
    let rootNote = 'A3'; // 預設為 A(I)
    switch (leftHandFingerCount) {
        case 5: rootNote = 'E4'; break;    // V
        case 4: rootNote = 'D4'; break;    // IV
        case 3: rootNote = 'C#4'; break;   // III
        case 2: rootNote = 'B3'; break;    // ii
        case 1: // fall-through
        case 0: // fall-through
        default:
            rootNote = 'A3'; break;    // I
    }

    // 2. 根據右手手指數決定和弦類型並觸發聲音
    let chord = [];
    const trigger = isRightHandVisible && rightHandFingerCount > 0;

    if (trigger) {
        const baseNote = new Tone.Frequency(rootNote);
        switch (rightHandFingerCount) {
            case 1: // Major
                chord = [baseNote.toNote(), baseNote.transpose(4).toNote(), baseNote.transpose(7).toNote()];
                break;
            case 2: // Major 1st inversion
                chord = [baseNote.transpose(4).toNote(), baseNote.transpose(7).toNote(), baseNote.transpose(12).toNote()];
                break;
            case 3: // Major 7th
                chord = [baseNote.toNote(), baseNote.transpose(4).toNote(), baseNote.transpose(7).toNote(), baseNote.transpose(11).toNote()];
                break;
            case 4: // Dominant 7th
                chord = [baseNote.toNote(), baseNote.transpose(4).toNote(), baseNote.transpose(7).toNote(), baseNote.transpose(10).toNote()];
                break;
            case 5: // Dominant 7th (-8ve)
                const lowBase = baseNote.transpose(-12);
                chord = [lowBase.toNote(), lowBase.transpose(4).toNote(), lowBase.transpose(7).toNote(), lowBase.transpose(10).toNote()];
                break;
        }
    }

    // --- 聲音控制 ---
    if (trigger && chord.length > 0) {
        if (!isAudioContextStarted) {
            Tone.start();
            isAudioContextStarted = true;
            console.log("音訊核心 (AudioContext) 已成功啟動！");
        }

        if (isMonoPlaying) { monoSynth.triggerRelease(); isMonoPlaying = false; } // 確保單音模式關閉
        polySynth.volume.rampTo(targetVolume, 0.1);
        polySynth.triggerAttack(chord); // 觸發或更新和弦
        isPolyPlaying = true;
    } else {
        // 如果不滿足觸發條件，則停止所有聲音
        if (isPolyPlaying) { polySynth.releaseAll(); isPolyPlaying = false; }
        if (isMonoPlaying) { monoSynth.triggerRelease(); isMonoPlaying = false; }
    }

    // --- 繪製視覺回饋 (只要有聲音就繪製) ---
    if (isPolyPlaying) {
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

    // ✨ 升級：初始化預設合成器並設定 UI 事件監聽
    createSynths('Synth'); // 初始化預設音色
    const synthSelectElement = document.getElementById('synth-select');
    synthSelectElement.addEventListener('change', (event) => {
        createSynths(event.target.value);
    });

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