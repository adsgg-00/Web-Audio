# Web-Audio
展示的是一個基於網頁前端技術（Web-based）的互動式應用程式。從畫面上手部的白色節點（Landmarks）以及底部的音波與和弦顯示來看，這個 App 的核心是將電腦視覺（Computer Vision）與網頁音效合成（Web Audio）結合在一起。

第一步：建立基礎網頁與存取攝影機
建立基本的 HTML 骨架，並使用 JavaScript 的 navigator.mediaDevices.getUserMedia 來獲取使用者的視訊鏡頭畫面，並將其顯示在 <video> 標籤上。

第二步：整合 MediaPipe 進行手勢辨識
載入 MediaPipe Hands 的 JavaScript 模型。將視訊畫面傳入模型進行推論，當模型偵測到手部時，會回傳包含 21 個座標點的陣列。

第三步：座標數據對應與處理
選擇特定的特徵點作為觸發器。例如：

食指指尖（Landmark 8）的 Y 座標轉換為頻率數值。

計算大拇指指尖（Landmark 4）與食指指尖（Landmark 8）的距離，當距離小於一定數值時（做出捏合動作），觸發聲音播放。

第四步：發出聲音 (Tone.js)
初始化一個合成器（Synthesizer）。當 JavaScript 偵測到觸發動作時，呼叫 synth.triggerAttackRelease() 來發出對應頻率的聲音；並根據手的移動即時更新合成器的參數。

第五步：繪製視覺回饋
利用 Canvas API 將 MediaPipe 回傳的特徵點畫在視訊畫面上（即圖片中的白點）。同時也可以將 Tone.js 輸出的音波數據，畫成底部的即時動態聲波圖。

第六步：部署上線
完成開發後，這類純前端的專案可以像圖片中的網址一樣部署到 Vercel，或者也可以直接推送並託管在 GitHub Pages 上，就能快速分享給其他人使用。