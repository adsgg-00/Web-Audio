// 取得 HTML 中的 video 元素
const videoElement = document.getElementById('webcam');

// 建立一個非同步函數來啟動攝影機
async function setupCamera() {
    try {
        // 要求存取視訊鏡頭 (不要求音訊)
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: 640,
                height: 480
            },
            audio: false
        });

        // 將取得的視訊串流設定為 video 元素的來源
        videoElement.srcObject = stream;

        // 回傳一個 Promise，確保影片已經開始播放
        return new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                resolve(videoElement);
            };
        });
        
    } catch (error) {
        console.error("無法存取攝影機：", error);
        alert("請確認已允許瀏覽器存取您的攝影機！");
    }
}

// 執行主程式
async function main() {
    console.log("正在啟動攝影機...");
    await setupCamera();
    console.log("攝影機啟動成功！");
}

main();