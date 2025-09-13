/**
 * AI健身助手 - 主脚本文件
 * 包含摄像头访问、姿态检测、动作识别和语音反馈功能
 */

// DOM元素引用
const webcamElement = document.getElementById('webcam');
const overlayElement = document.getElementById('overlay');
const overlayCtx = overlayElement.getContext('2d');
const exerciseTypeSelect = document.getElementById('exercise-type');
const repCountElement = document.getElementById('rep-count');
const feedbackTextElement = document.getElementById('feedback-text');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const muteBtn = document.getElementById('mute-btn');

// 应用状态变量
let isRunning = false;
let isMuted = false;
let repCount = 0;
let pose = null;
let exerciseState = 'ready'; // ready, down, up
let lastFeedbackTime = 0;
const FEEDBACK_INTERVAL = 1500; // 语音反馈间隔（毫秒）

// 定义POINTS常量
const POSE_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 7],
    [0, 4], [4, 5], [5, 6], [6, 8],
    [9, 10],
    [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
    [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
    [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32]
];

// 自定义绘制连接线函数
function drawConnectors(ctx, landmarks, connections, style) {
    ctx.save();
    ctx.strokeStyle = style.color || '#000000';
    ctx.lineWidth = style.lineWidth || 2;
    
    connections.forEach((connection) => {
        const fromLandmark = landmarks[connection[0]];
        const toLandmark = landmarks[connection[1]];
        
        if (fromLandmark && toLandmark) {
            ctx.beginPath();
            ctx.moveTo(fromLandmark.x * ctx.canvas.width, fromLandmark.y * ctx.canvas.height);
            ctx.lineTo(toLandmark.x * ctx.canvas.width, toLandmark.y * ctx.canvas.height);
            ctx.stroke();
        }
    });
    
    ctx.restore();
}

// 自定义绘制关键点函数
function drawLandmarks(ctx, landmarks, style) {
    ctx.save();
    ctx.fillStyle = style.fillColor || '#000000';
    ctx.strokeStyle = style.color || '#ffffff';
    ctx.lineWidth = 1;
    
    const radius = style.radius || 5;
    
    landmarks.forEach((landmark) => {
        if (landmark) {
            const x = landmark.x * ctx.canvas.width;
            const y = landmark.y * ctx.canvas.height;
            
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
        }
    });
    
    ctx.restore();
}

// 计算两个点之间的距离
function calculateDistance(point1, point2) {
    const dx = point1.x - point2.x;
    const dy = point1.y - point2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// 计算三个点形成的角度
function calculateAngle(shoulder, elbow, wrist) {
    // 转换为笛卡尔坐标系（y轴向下为正）
    const x1 = shoulder.x;
    const y1 = shoulder.y;
    const x2 = elbow.x;
    const y2 = elbow.y;
    const x3 = wrist.x;
    const y3 = wrist.y;
    
    // 计算向量
    const v1x = x1 - x2;
    const v1y = y1 - y2;
    const v2x = x3 - x2;
    const v2y = y3 - y2;
    
    // 计算向量的点积
    const dotProduct = v1x * v2x + v1y * v2y;
    
    // 计算向量的模长
    const v1Length = Math.sqrt(v1x * v1x + v1y * v1y);
    const v2Length = Math.sqrt(v2x * v2x + v2y * v2y);
    
    // 计算角度（弧度）
    let angle = Math.acos(dotProduct / (v1Length * v2Length));
    
    // 转换为角度
    angle = angle * (180 / Math.PI);
    
    return angle;
}

// 姿态检测结果回调
function onPoseResults(results) {
    if (!isRunning || !results.poseLandmarks) return;

    // 清除上一帧的绘制
    overlayCtx.clearRect(0, 0, overlayElement.width, overlayElement.height);

    // 绘制姿态关键点和连接线
    drawConnectors(overlayCtx, results.poseLandmarks, POSE_CONNECTIONS, {
        color: '#00FF00',
        lineWidth: 2
    });
    drawLandmarks(overlayCtx, results.poseLandmarks, {
        color: '#FF0000',
        fillColor: '#00FF00',
        radius: 5
    });
    
    // 根据选择的动作类型进行分析
    const exerciseType = exerciseTypeSelect.value;
    
    switch (exerciseType) {
        case 'squat':
            analyzeSquat(results.poseLandmarks);
            break;
        case 'deadlift':
            analyzeDeadlift(results.poseLandmarks);
            break;
        case 'pushup':
            analyzePushup(results.poseLandmarks);
            break;
        case 'plank':
            analyzePlank(results.poseLandmarks);
            break;
    }
}

// 分析深蹲动作
function analyzeSquat(landmarks) {
    try {
        // 获取关键关节点
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];
        const leftKnee = landmarks[25];
        const rightKnee = landmarks[26];
        const leftAnkle = landmarks[27];
        const rightAnkle = landmarks[28];
        
        // 计算膝盖角度（取左右膝盖的平均值）
        const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
        const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
        const kneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
        
        // 分析动作阶段
        if (kneeAngle > 160 && exerciseState === 'up') {
            exerciseState = 'ready';
            showFeedback('准备就绪，请开始深蹲', 'info');
        } else if (kneeAngle < 90 && exerciseState === 'ready') {
            exerciseState = 'down';
            showFeedback('深蹲到位，准备起身', 'info');
        } else if (kneeAngle > 160 && exerciseState === 'down') {
            exerciseState = 'up';
            repCount++;
            repCountElement.textContent = `次数: ${repCount}`;
            showFeedback('完美！完成一次深蹲', 'success');
        }
        
        // 纠正动作
        if (exerciseState !== 'ready') {
            // 检查膝盖是否内扣
            const kneeDistance = calculateDistance(leftKnee, rightKnee);
            const ankleDistance = calculateDistance(leftAnkle, rightAnkle);
            
            if (kneeDistance < ankleDistance * 0.6) {
                showFeedback('注意膝盖不要内扣', 'warning');
            }
            
            // 检查背部是否保持挺直（调整判定阈值，更加严格）
            const leftShoulder = landmarks[11];
            const rightShoulder = landmarks[12];
            const spineAngle = calculateAngle(leftShoulder, leftHip, leftKnee);
            
            if (spineAngle < 140) {
                showFeedback('保持背部挺直', 'warning');
            }
        }
    } catch (error) {
        console.error('深蹲动作分析错误:', error);
    }
}

// 分析硬拉动作
function analyzeDeadlift(landmarks) {
    try {
        // 获取关键关节点
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];
        const leftKnee = landmarks[25];
        const rightKnee = landmarks[26];
        
        // 计算髋部和膝盖角度
        const leftHipAngle = calculateAngle(leftShoulder, leftHip, leftKnee);
        const rightHipAngle = calculateAngle(rightShoulder, rightHip, rightKnee);
        const hipAngle = (leftHipAngle + rightHipAngle) / 2;
        
        // 分析动作阶段
        if (hipAngle > 160 && exerciseState === 'up') {
            exerciseState = 'ready';
            showFeedback('准备就绪，请开始硬拉', 'info');
        } else if (hipAngle < 90 && exerciseState === 'ready') {
            exerciseState = 'down';
            showFeedback('准备拉起', 'info');
        } else if (hipAngle > 160 && exerciseState === 'down') {
            exerciseState = 'up';
            repCount++;
            repCountElement.textContent = `次数: ${repCount}`;
            showFeedback('完美！完成一次硬拉', 'success');
        }
        
        // 纠正动作
        if (exerciseState !== 'ready') {
            // 检查背部是否保持挺直
            const nose = landmarks[0];
            const midHip = {
                x: (leftHip.x + rightHip.x) / 2,
                y: (leftHip.y + rightHip.y) / 2
            };
            
            const spineTilt = Math.abs(nose.x - midHip.x);
            
            if (spineTilt > 0.05) {
                showFeedback('保持背部中立，不要过度前倾或后仰', 'warning');
            }
            
            // 检查膝盖是否锁定
            if (exerciseState === 'up' && hipAngle > 170) {
                showFeedback('完成动作时膝盖不要完全锁定', 'warning');
            }
        }
    } catch (error) {
        console.error('硬拉动作分析错误:', error);
    }
}

// 分析俯卧撑动作
function analyzePushup(landmarks) {
    try {
        // 获取关键关节点
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftElbow = landmarks[13];
        const rightElbow = landmarks[14];
        const leftWrist = landmarks[15];
        const rightWrist = landmarks[16];
        
        // 计算肘部角度（取左右肘部的平均值）
        const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
        const rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
        const elbowAngle = (leftElbowAngle + rightElbowAngle) / 2;
        
        // 分析动作阶段
        if (elbowAngle > 160 && exerciseState === 'up') {
            exerciseState = 'ready';
            showFeedback('准备就绪，请开始俯卧撑', 'info');
        } else if (elbowAngle < 90 && exerciseState === 'ready') {
            exerciseState = 'down';
            showFeedback('俯卧撑到位，准备撑起', 'info');
        } else if (elbowAngle > 160 && exerciseState === 'down') {
            exerciseState = 'up';
            repCount++;
            repCountElement.textContent = `次数: ${repCount}`;
            showFeedback('完美！完成一次俯卧撑', 'success');
        }
        
        // 纠正动作
        if (exerciseState !== 'ready') {
            // 检查身体是否保持直线
            const leftHip = landmarks[23];
            const rightHip = landmarks[24];
            const leftAnkle = landmarks[27];
            const rightAnkle = landmarks[28];
            
            const midShoulder = {
                x: (leftShoulder.x + rightShoulder.x) / 2,
                y: (leftShoulder.y + rightShoulder.y) / 2
            };
            const midHip = {
                x: (leftHip.x + rightHip.x) / 2,
                y: (leftHip.y + rightHip.y) / 2
            };
            const midAnkle = {
                x: (leftAnkle.x + rightAnkle.x) / 2,
                y: (leftAnkle.y + rightAnkle.y) / 2
            };
            
            // 检查臀部是否抬起或下沉
            const bodyStraightness = Math.abs((midHip.y - midShoulder.y) - (midAnkle.y - midHip.y));
            
            if (bodyStraightness > 0.1) {
                showFeedback('保持身体呈直线，不要塌腰或撅臀', 'warning');
            }
            
            // 检查手肘是否向外展开过大
            if (elbowAngle < 70) {
                showFeedback('手肘不要向外展开过大', 'warning');
            }
        }
    } catch (error) {
        console.error('俯卧撑动作分析错误:', error);
    }
}

// 分析平板支撑动作
function analyzePlank(landmarks) {
    try {
        // 获取关键关节点
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftElbow = landmarks[13];
        const rightElbow = landmarks[14];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];
        const leftKnee = landmarks[25];
        const rightKnee = landmarks[26];
        
        // 计算身体直线度
        const midShoulder = {
            x: (leftShoulder.x + rightShoulder.x) / 2,
            y: (leftShoulder.y + rightShoulder.y) / 2
        };
        const midHip = {
            x: (leftHip.x + rightHip.x) / 2,
            y: (leftHip.y + rightHip.y) / 2
        };
        const midKnee = {
            x: (leftKnee.x + rightKnee.x) / 2,
            y: (leftKnee.y + rightKnee.y) / 2
        };
        
        // 检查身体是否保持直线（调整判定阈值，更加严格）
        const bodyStraightness = Math.abs((midHip.y - midShoulder.y) - (midKnee.y - midHip.y));
        
        // 平板支撑是保持姿势的动作，所以我们持续给予反馈
        if (bodyStraightness < 0.05) {
            showFeedback('姿势很棒！保持住', 'success');
        } else if (midHip.y < midShoulder.y * 0.95) {
            showFeedback('臀部不要抬太高', 'warning');
        } else if (midHip.y > midShoulder.y * 1.05) {
            showFeedback('注意不要塌腰', 'warning');
        }
        
        // 检查手肘角度
        const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftHip);
        const rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightHip);
        const elbowAngle = (leftElbowAngle + rightElbowAngle) / 2;
        
        if (elbowAngle < 80 || elbowAngle > 100) {
            showFeedback('手肘保持90度，位于肩膀正下方', 'warning');
        }
        
        // 检查头部姿态
        const nose = landmarks[0];
        if (nose.y < midShoulder.y * 0.9) {
            showFeedback('不要抬头，保持颈部中立', 'warning');
        } else if (nose.y > midShoulder.y * 1.1) {
            showFeedback('不要低头，保持颈部中立', 'warning');
        }
    } catch (error) {
        console.error('平板支撑动作分析错误:', error);
    }
}

// 语音反馈函数
function speak(text) {
    if (isMuted) return;
    
    // 停止任何正在进行的语音
    window.speechSynthesis.cancel();
    
    // 创建语音实例
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.volume = 1;
    utterance.rate = 1;
    utterance.pitch = 1;
    
    // 播放语音
    window.speechSynthesis.speak(utterance);
}

// 显示反馈信息
function showFeedback(text, type = 'info') {
    feedbackTextElement.textContent = text;
    
    // 根据类型设置不同的颜色
    switch (type) {
        case 'success':
            feedbackTextElement.style.color = '#28a745';
            break;
        case 'warning':
            feedbackTextElement.style.color = '#ffc107';
            break;
        case 'error':
            feedbackTextElement.style.color = '#dc3545';
            break;
        default:
            feedbackTextElement.style.color = '#6c757d';
    }
    
    // 语音反馈（如果未静音且不在间隔期内）
    const now = Date.now();
    if (!isMuted && now - lastFeedbackTime > FEEDBACK_INTERVAL) {
        speak(text);
        lastFeedbackTime = now;
    }
}

// 初始化MediaPipe Pose
async function initPose() {
    try {
        pose = new Pose({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`;
            }
        });

        // 配置Pose参数
        pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: false,
            smoothSegmentation: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        // 设置结果回调
        pose.onResults(onPoseResults);
    } catch (error) {
        console.error('初始化Pose失败:', error);
        showFeedback('初始化失败，请刷新页面重试', 'error');
    }
}

// 访问用户摄像头
async function setupWebcam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            }
        });

        webcamElement.srcObject = stream;

        // 调整canvas大小以匹配视频
        return new Promise((resolve) => {
            webcamElement.onloadedmetadata = () => {
                overlayElement.width = webcamElement.videoWidth;
                overlayElement.height = webcamElement.videoHeight;
                resolve(webcamElement);
            };
        });
    } catch (error) {
        console.error('访问摄像头失败:', error);
        showFeedback('无法访问摄像头，请检查权限设置', 'error');
        throw error;
    }
}

// 开始训练
async function startTraining() {
    try {
        // 重置状态
        repCount = 0;
        repCountElement.textContent = `次数: ${repCount}`;
        exerciseState = 'ready';
        isRunning = true;
        
        // 更新按钮状态
        startBtn.disabled = true;
        stopBtn.disabled = false;
        
        // 初始化姿态检测
        if (!pose) {
            await initPose();
        }
        
        // 设置摄像头
        const webcam = await setupWebcam();
        
        // 开始处理视频流
        async function processVideo() {
            if (!isRunning) return;
            
            try {
                await pose.send({
                    image: webcam
                });
                requestAnimationFrame(processVideo);
            } catch (error) {
                console.error('处理视频流错误:', error);
                if (isRunning) {
                    requestAnimationFrame(processVideo);
                }
            }
        }
        
        // 开始处理
        showFeedback('开始训练，请站在摄像头前', 'info');
        processVideo();
    } catch (error) {
        console.error('开始训练失败:', error);
        showFeedback('开始训练失败，请重试', 'error');
        // 重置按钮状态
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

// 停止训练
function stopTraining() {
    isRunning = false;
    
    // 更新按钮状态
    startBtn.disabled = false;
    stopBtn.disabled = true;
    
    // 停止语音
    window.speechSynthesis.cancel();
    
    // 清除视频流
    if (webcamElement.srcObject) {
        webcamElement.srcObject.getTracks().forEach(track => track.stop());
        webcamElement.srcObject = null;
    }
    
    // 清除canvas
    overlayCtx.clearRect(0, 0, overlayElement.width, overlayElement.height);
    
    showFeedback('训练已停止', 'info');
}

// 切换静音状态
function toggleMute() {
    isMuted = !isMuted;
    muteBtn.textContent = isMuted ? '取消静音' : '静音';
    showFeedback(isMuted ? '语音反馈已关闭' : '语音反馈已开启', 'info');
}

// 切换动作类型时重置状态
function onExerciseTypeChange() {
    if (isRunning) {
        repCount = 0;
        repCountElement.textContent = `次数: ${repCount}`;
        exerciseState = 'ready';
        showFeedback(`已切换到${exerciseTypeSelect.options[exerciseTypeSelect.selectedIndex].text}训练`, 'info');
    }
}

// 注册事件监听器
startBtn.addEventListener('click', startTraining);
stopBtn.addEventListener('click', stopTraining);
 muteBtn.addEventListener('click', toggleMute);
exerciseTypeSelect.addEventListener('change', onExerciseTypeChange);

// 初始化应用
function initApp() {
    showFeedback('欢迎使用AI健身助手，请选择动作并点击开始训练', 'info');
}

// 页面加载完成后初始化应用
window.addEventListener('load', initApp);